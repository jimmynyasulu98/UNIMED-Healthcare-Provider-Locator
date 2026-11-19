import { NextRequest, NextResponse } from "next/server";
import type { NearbyProvider } from "../../../../types/provider";
import { db } from "../../../../lib/db";
import { validateNearbySearchParams } from "../../../../lib/nearby-search";

type FilterValidationRow = {
  service_is_valid: boolean;
  category_is_valid: boolean;
};

type NearbyProviderRow = Omit<
  NearbyProvider,
  "latitude" | "longitude" | "distance_km"
> & {
  latitude: number | string;
  longitude: number | string;
  distance_km: number | string;
};

function badRequest(details: string[]) {
  return NextResponse.json(
    {
      error: "Invalid search parameters.",
      details,
    },
    {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(request: NextRequest) {
  const validation = validateNearbySearchParams(
    request.nextUrl.searchParams
  );

  if (!validation.ok) {
    return badRequest(
      validation.errors.map((validationError) =>
        validationError.message
      )
    );
  }

  const { latitude, longitude, radiusKm, serviceId, category } =
    validation.value;

  try {
    const filterValidation = await db.query<FilterValidationRow>(
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

    if (filterErrors.length > 0) {
      return badRequest(filterErrors);
    }

    const result = await db.query<NearbyProviderRow>(
      `
        WITH search_input AS (
          SELECT
            ST_SetSRID(
              ST_MakePoint(
                $2::double precision,
                $1::double precision
              ),
              4326
            )::geography AS origin,
            $3::double precision * 1000.0 AS radius_metres
        ),
        matching_providers AS (
          SELECT
            p.*,
            ST_Distance(p.location, search_input.origin)
              AS distance_metres
          FROM providers AS p
          CROSS JOIN search_input
          WHERE p.is_active = TRUE
            AND p.location IS NOT NULL
            AND ST_DWithin(
              p.location,
              search_input.origin,
              search_input.radius_metres
            )
            AND (
              $4::bigint IS NULL
              OR EXISTS (
                SELECT 1
                FROM provider_service AS service_filter
                WHERE service_filter.provider_id = p.id
                  AND service_filter.service_id = $4::bigint
              )
            )
            AND (
              $5::text IS NULL
              OR p.category = $5::text
            )
        )
        SELECT
          p.id::text AS id,
          p.name,
          p.category,
          p.district,
          p.address,
          p.phone,
          ST_Y(p.location::geometry) AS latitude,
          ST_X(p.location::geometry) AS longitude,
          p.distance_metres / 1000.0::double precision
            AS distance_km,
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
        FROM matching_providers AS p
        ORDER BY p.distance_metres ASC, p.id ASC;
      `,
      [latitude, longitude, radiusKm, serviceId, category]
    );

    const providers: NearbyProvider[] = result.rows.map((provider) => ({
      ...provider,
      latitude: Number(provider.latitude),
      longitude: Number(provider.longitude),
      distance_km: Number(provider.distance_km),
    }));

    return NextResponse.json(
      {
        count: providers.length,
        origin: { latitude, longitude },
        radius_km: radiusKm,
        distance_type: "straight-line",
        providers,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Failed to find nearby providers:", error);

    return NextResponse.json(
      { error: "Unable to find nearby providers." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
