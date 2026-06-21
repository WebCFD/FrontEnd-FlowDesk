import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.PGHOST && !process.env.DATABASE_URL) {
  throw new Error(
    "Database connection not configured. PGHOST or DATABASE_URL must be set.",
  );
}

export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: false,
      }
);

export const db = drizzle({ client: pool, schema });
