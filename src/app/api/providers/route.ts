import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const result = await db.query(`
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
      ORDER BY p.name;
    `);

    return NextResponse.json({
      count: result.rows.length,
      providers: result.rows,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load providers:", error);

    return NextResponse.json(
      { error: "Unable to load providers." },
      { status: 500 }
    );
  }
}
