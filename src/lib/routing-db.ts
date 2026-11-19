import "server-only";
import { Pool } from "pg";

const globalForRoutingPg = globalThis as unknown as {
  routingPgPool?: Pool;
};

const REQUIRED_ROUTING_ENVIRONMENT = [
  "ROUTING_PGHOST",
  "ROUTING_PGPORT",
  "ROUTING_PGDATABASE",
  "ROUTING_PGUSER",
  "ROUTING_PGPASSWORD",
] as const;

export const ROUTING_SNAP_DISTANCE_METRES = 500;

export function isRoutingDatabaseConfigured() {
  const hasEveryValue = REQUIRED_ROUTING_ENVIRONMENT.every(
    (name) => process.env[name]?.trim()
  );

  if (!hasEveryValue) return false;

  const port = Number(process.env.ROUTING_PGPORT);
  return Number.isInteger(port) && port > 0 && port <= 65_535;
}

function createRoutingPool() {
  const port = Number(process.env.ROUTING_PGPORT);

  return new Pool({
    host: process.env.ROUTING_PGHOST,
    port,
    database: process.env.ROUTING_PGDATABASE,
    user: process.env.ROUTING_PGUSER,
    password: process.env.ROUTING_PGPASSWORD,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function getRoutingDb() {
  if (!isRoutingDatabaseConfigured()) return null;

  if (!globalForRoutingPg.routingPgPool) {
    const pool = createRoutingPool();

    pool.on("error", (error) => {
      console.error("Unexpected routing PostgreSQL pool error:", error);
    });

    globalForRoutingPg.routingPgPool = pool;

    return pool;
  }

  return globalForRoutingPg.routingPgPool;
}
