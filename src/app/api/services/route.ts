import { NextResponse } from "next/server";
import type { ServiceOption } from "../../../types/provider";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    const result = await db.query<ServiceOption>(`
      SELECT DISTINCT
        s.id::text AS id,
        s.name
      FROM services AS s
      JOIN provider_service AS ps
        ON ps.service_id = s.id
      JOIN providers AS p
        ON p.id = ps.provider_id
      WHERE p.is_active = TRUE
        AND p.location IS NOT NULL
      ORDER BY s.name, s.id::text;
    `);

    return NextResponse.json(
      {
        count: result.rows.length,
        services: result.rows,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Failed to load services:", error);

    return NextResponse.json(
      { error: "Unable to load services." },
      { status: 500 }
    );
  }
}
