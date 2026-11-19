import { NextRequest, NextResponse } from "next/server";
import type { RoadProvider } from "../../../../types/provider";
import {
  ROUTING_SNAP_DISTANCE_METRES,
  getRoutingDb,
} from "../../../../lib/routing-db";
import { validateRoadSearchParams } from "../../../../lib/road-search";

type CapabilityRow = {
  route_costs_ready: boolean;
  road_edges_ready: boolean;
  catalogue_ready: boolean;
  pgrouting_ready: boolean;
};

type GraphRow = { has_road_edges: boolean };

type FilterValidationRow = {
  service_is_valid: boolean;
  category_is_valid: boolean;
};

type ProviderRow = Omit<
  RoadProvider,
  | "latitude"
  | "longitude"
  | "route_status"
  | "road_distance_km"
  | "origin_snap_distance_m"
  | "provider_snap_distance_m"
> & {
  latitude: number | string;
  longitude: number | string;
};

type RouteCostRow = {
  provider_id: string;
  route_status: RoadProvider["route_status"];
  road_distance_m: number | string | null;
  origin_snap_distance_m: number | string | null;
  provider_snap_distance_m: number | string | null;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function badRequest(details: string[]) {
  return NextResponse.json(
    {
      error: "Invalid search parameters.",
      code: "INVALID_SEARCH",
      details,
    },
    { status: 400, headers: NO_STORE_HEADERS }
  );
}

function routingUnavailable() {
  return NextResponse.json(
    {
      error:
        "Road search is not set up yet. Straight-line search is still available.",
      code: "ROUTING_UNAVAILABLE",
    },
    { status: 503, headers: NO_STORE_HEADERS }
  );
}

function compareProviderIds(first: string, second: string) {
  const firstId = BigInt(first);
  const secondId = BigInt(second);
  return firstId < secondId ? -1 : firstId > secondId ? 1 : 0;
}

export async function GET(request: NextRequest) {
  const validation = validateRoadSearchParams(
    request.nextUrl.searchParams
  );

  if (!validation.ok) {
    return badRequest(validation.errors.map((error) => error.message));
  }

  const routingDb = getRoutingDb();

  if (!routingDb) return routingUnavailable();

  const {
    latitude,
    longitude,
    maxRoadDistanceKm,
    serviceId,
    category,
  } = validation.value;
  let routingReady = false;

  try {
    const capability = await routingDb.query<CapabilityRow>(`
      SELECT
        to_regprocedure(
          'routing.route_costs(geometry,bigint[],double precision)'
        ) IS NOT NULL AS route_costs_ready,
        to_regclass('routing.road_edges') IS NOT NULL
          AS road_edges_ready,
        to_regclass('public.providers') IS NOT NULL
          AND to_regclass('public.services') IS NOT NULL
          AND to_regclass('public.provider_service') IS NOT NULL
          AS catalogue_ready,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_extension
          WHERE extname = 'pgrouting'
        ) AS pgrouting_ready;
    `);

    const availableCapability = capability.rows[0];

    if (
      !availableCapability?.route_costs_ready ||
      !availableCapability.road_edges_ready ||
      !availableCapability.catalogue_ready ||
      !availableCapability.pgrouting_ready
    ) {
      return routingUnavailable();
    }

    const graph = await routingDb.query<GraphRow>(`
      SELECT EXISTS (
        SELECT 1 FROM routing.road_edges LIMIT 1
      ) AS has_road_edges;
    `);

    if (!graph.rows[0]?.has_road_edges) return routingUnavailable();

    routingReady = true;

    const filterValidation = await routingDb.query<FilterValidationRow>(
      `
        SELECT
          CASE
            WHEN $1::bigint IS NULL THEN TRUE
            ELSE EXISTS (
              SELECT 1
              FROM services AS s
              JOIN provider_service AS ps
                ON ps.service_id = s.id
              JOIN providers AS p
                ON p.id = ps.provider_id
              WHERE s.id = $1::bigint
                AND p.is_active = TRUE
                AND p.location IS NOT NULL
            )
          END AS service_is_valid,
          CASE
            WHEN $2::text IS NULL THEN TRUE
            ELSE EXISTS (
              SELECT 1
              FROM providers AS p
              WHERE p.category = $2::text
                AND p.is_active = TRUE
                AND p.location IS NOT NULL
            )
          END AS category_is_valid;
      `,
      [serviceId, category]
    );

    const availableFilters = filterValidation.rows[0];
    const filterErrors: string[] = [];

    if (!availableFilters.service_is_valid) {
      filterErrors.push(
        "Service must be assigned to an active provider with a location."
      );
    }

    if (!availableFilters.category_is_valid) {
      filterErrors.push(
        "Category must match an active provider category."
      );
    }

    if (filterErrors.length > 0) return badRequest(filterErrors);

    const providerResult = await routingDb.query<ProviderRow>(
      `
        SELECT
          p.id::text AS id,
          p.name,
          p.category,
          p.district,
          p.address,
          p.phone,
          ST_Y(p.location::geometry) AS latitude,
          ST_X(p.location::geometry) AS longitude,
          COALESCE(
            (
              SELECT json_agg(s.name ORDER BY s.name)
              FROM provider_service AS ps
              JOIN services AS s
                ON s.id = ps.service_id
              WHERE ps.provider_id = p.id
            ),
            '[]'::json
          ) AS services
        FROM providers AS p
        WHERE p.is_active = TRUE
          AND p.location IS NOT NULL
          AND (
            $1::bigint IS NULL
            OR EXISTS (
              SELECT 1
              FROM provider_service AS service_filter
              WHERE service_filter.provider_id = p.id
                AND service_filter.service_id = $1::bigint
            )
          )
          AND ($2::text IS NULL OR p.category = $2::text)
        ORDER BY p.id ASC;
      `,
      [serviceId, category]
    );

    if (providerResult.rows.length === 0) {
      return NextResponse.json(
        {
          count: 0,
          reachable_count: 0,
          origin: { latitude, longitude },
          max_road_distance_km: maxRoadDistanceKm,
          distance_type: "road",
          snap_distance_limit_m: ROUTING_SNAP_DISTANCE_METRES,
          providers: [],
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const providerIds = providerResult.rows.map((provider) => provider.id);
    const routeResult = await routingDb.query<RouteCostRow>(
      `
        SELECT
          provider_id::text AS provider_id,
          route_status,
          road_distance_m,
          origin_snap_distance_m,
          provider_snap_distance_m
        FROM routing.route_costs(
          ST_SetSRID(
            ST_MakePoint($2::double precision, $1::double precision),
            4326
          ),
          $3::bigint[],
          $4::double precision
        );
      `,
      [
        latitude,
        longitude,
        providerIds,
        ROUTING_SNAP_DISTANCE_METRES,
      ]
    );

    const costsByProvider = new Map(
      routeResult.rows.map((route) => [route.provider_id, route])
    );
    const providers: RoadProvider[] = providerResult.rows
      .map((provider) => {
        const route = costsByProvider.get(provider.id);
        const roadDistanceMetres =
          route?.road_distance_m === null ||
          route?.road_distance_m === undefined
            ? null
            : Number(route.road_distance_m);

        return {
          ...provider,
          latitude: Number(provider.latitude),
          longitude: Number(provider.longitude),
          route_status: route?.route_status ?? "unreachable",
          road_distance_km:
            roadDistanceMetres === null
              ? null
              : roadDistanceMetres / 1000,
          origin_snap_distance_m:
            route?.origin_snap_distance_m === null ||
            route?.origin_snap_distance_m === undefined
              ? null
              : Number(route.origin_snap_distance_m),
          provider_snap_distance_m:
            route?.provider_snap_distance_m === null ||
            route?.provider_snap_distance_m === undefined
              ? null
              : Number(route.provider_snap_distance_m),
        };
      })
      .filter(
        (provider) =>
          provider.route_status !== "reachable" ||
          maxRoadDistanceKm === null ||
          (provider.road_distance_km !== null &&
            provider.road_distance_km <= maxRoadDistanceKm)
      )
      .sort((first, second) => {
        if (first.route_status === "reachable") {
          if (second.route_status !== "reachable") return -1;

          const distanceDifference =
            (first.road_distance_km ?? 0) -
            (second.road_distance_km ?? 0);

          return distanceDifference || compareProviderIds(first.id, second.id);
        }

        if (second.route_status === "reachable") return 1;
        return compareProviderIds(first.id, second.id);
      });
    const reachableCount = providers.filter(
      (provider) => provider.route_status === "reachable"
    ).length;

    return NextResponse.json(
      {
        count: providers.length,
        reachable_count: reachableCount,
        origin: { latitude, longitude },
        max_road_distance_km: maxRoadDistanceKm,
        distance_type: "road",
        snap_distance_limit_m: ROUTING_SNAP_DISTANCE_METRES,
        providers,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to find providers by road:", error);

    if (!routingReady) return routingUnavailable();

    return NextResponse.json(
      {
        error: "Unable to calculate road routes.",
        code: "ROUTING_ERROR",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
