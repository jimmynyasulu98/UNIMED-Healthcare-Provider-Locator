import "server-only";
import { Pool } from "pg";

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
};

function createPool() {
  const pool = new Pool({
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
  });

  return pool;
}

export const db = globalForPg.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = db;
}