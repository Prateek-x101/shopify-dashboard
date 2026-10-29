import path from "path";
import fs from "fs";
import pg from "pg";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * DATABASE_URL set   → real Postgres (Neon, Supabase, local server)
 * DATABASE_URL unset → embedded PGlite stored in <dataDir>/pglite
 */
let pglite: PGlite | null = null;
let pool: pg.Pool | null = null;
let _db: Db | null = null;

export function openDb(dataDir: string): Db {
  if (_db) return _db;
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzlePg(pool, { schema });
  } else {
    const dir = path.join(dataDir, "pglite");
    fs.mkdirSync(dir, { recursive: true });
    pglite = new PGlite(dir);
    _db = drizzlePglite(pglite, { schema }) as unknown as Db;
  }
  return _db;
}

export async function migrateDb(migrationsFolder: string): Promise<void> {
  if (!_db) throw new Error("openDb() must be called first");
  if (pool) await migratePg(_db, { migrationsFolder });
  else await migratePglite(_db as never, { migrationsFolder });
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    if (!_db) throw new Error("Database not opened yet");
    return Reflect.get(_db, prop, _db);
  },
});

export function dbKind(): "postgres" | "pglite" {
  return pool ? "postgres" : "pglite";
}

export * from "./schema";
