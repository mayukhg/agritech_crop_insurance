/**
 * Database Connection Setup
 *
 * Uses standard `pg` for local Postgres and Neon HTTP/WS URLs that speak
 * the Postgres wire protocol through a normal TCP connection string.
 * Neon serverless WebSockets are avoided so local Docker Postgres works.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
