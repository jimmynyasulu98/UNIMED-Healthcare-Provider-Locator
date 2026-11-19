import { NextRequest, NextResponse } from "next/server";
import {
  ROUTING_SNAP_DISTANCE_METRES,
  getRoutingDb,
} from "../../../../../lib/routing-db";
import { validateRoadRouteParams } from "../../../../../lib/road-search";

type CapabilityRow = {
  route_geometry_ready: boolean;
  road_edges_ready: boolean;
  catalogue_ready: boolean;
  pgrouting_ready: boolean;
};

type GraphRow = { has_road_edges: boolean };

type ProviderExistsRow = {
  provider_exists: boolean;
};

type RouteGeometryRow = {
  provider_id: string;
  route_status: "reachable" | "unreachable" | "snap-too-far";
  road_distance_m: number | string | null;
  origin_snap_distance_m: number | string | null;
  provider_snap_distance_m: number | string | null;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  } | null;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

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

export async function GET(request: NextRequest) {
  const validation = validateRoadRouteParams(
    request.nextUrl.searchParams
  );

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Invalid route parameters.",
        code: "INVALID_ROUTE",
        details: validation.errors.map((error) => error.message),
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const routingDb = getRoutingDb();

  if (!routingDb) return routingUnavailable();

  const { latitude, longitude, providerId } = validation.value;
  let routingReady = false;

  try {
    const capability = await routingDb.query<CapabilityRow>(`
      SELECT
        to_regprocedure(
          'routing.route_geometry(geometry,bigint,double precision)'
        ) IS NOT NULL AS route_geometry_ready,
        to_regclass('routing.road_edges') IS NOT NULL
          AS road_edges_ready,
        to_regclass('public.providers') IS NOT NULL
          AS catalogue_ready,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_extension
          WHERE extname = 'pgrouting'
        ) AS pgrouting_ready;
    `);

    const availableCapability = capability.rows[0];

    if (
      !availableCapability?.route_geometry_ready ||
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

    const providerExists = await routingDb.query<ProviderExistsRow>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM providers AS p
          WHERE p.id = $1::bigint
            AND p.is_active = TRUE
            AND p.location IS NOT NULL
        ) AS provider_exists;
      `,
      [providerId]
    );

    if (!providerExists.rows[0]?.provider_exists) {
      return NextResponse.json(
        {
          error: "The selected provider is not available.",
          code: "PROVIDER_NOT_FOUND",
        },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const result = await routingDb.query<RouteGeometryRow>(
      `
        SELECT
          route.provider_id::text AS provider_id,
          route.route_status,
          route.road_distance_m,
          route.origin_snap_distance_m,
          route.provider_snap_distance_m,
          CASE
            WHEN route.geom IS NULL THEN NULL
            ELSE ST_AsGeoJSON(route.geom)::json
          END AS geometry
        FROM routing.route_geometry(
          ST_SetSRID(
            ST_MakePoint($2::double precision, $1::double precision),
            4326
          ),
          $3::bigint,
          $4::double precision
        ) AS route;
      `,
      [
        latitude,
        longitude,
        providerId,
        ROUTING_SNAP_DISTANCE_METRES,
      ]
    );

    const route = result.rows[0];

    if (!route || route.route_status !== "reachable" || !route.geometry) {
      const snapTooFar = route?.route_status === "snap-too-far";

      return NextResponse.json(
        {
          error: snapTooFar
            ? "The starting location or provider is too far from the routable road network."
            : "No driving route connects the starting location to this provider.",
          code: snapTooFar ? "SNAP_TOO_FAR" : "NO_ROUTE",
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        provider_id: route.provider_id,
        route_status: "reachable",
        road_distance_km: Number(route.road_distance_m) / 1000,
        origin_snap_distance_m: Number(route.origin_snap_distance_m),
        provider_snap_distance_m: Number(
          route.provider_snap_distance_m
        ),
        snap_distance_limit_m: ROUTING_SNAP_DISTANCE_METRES,
        geometry: route.geometry,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to load a road route:", error);

    if (!routingReady) return routingUnavailable();

    return NextResponse.json(
      {
        error: "Unable to calculate this road route.",
        code: "ROUTING_ERROR",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
