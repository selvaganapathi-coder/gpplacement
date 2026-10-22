import { PrismaClient } from "@prisma/client";
import {
  DB_POOL_SIZE,
  isSqlite,
  withPrismaPoolParams,
} from "./capacity";

/** Ensure Postgres URLs carry a connection pool size before Prisma boots. */
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withPrismaPoolParams(process.env.DATABASE_URL);
}

/**
 * Single shared client. For ~1000 concurrent examinees use Postgres in production
 * (see docs/CAPACITY.md). SQLite is fine for local/dev only.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

let sqliteTuned = false;

/** Enable WAL + busy wait so local SQLite survives concurrent exam writes better. */
export async function tuneDatabaseForConcurrency(): Promise<void> {
  if (sqliteTuned) return;
  if (!isSqlite) {
    sqliteTuned = true;
    if (/^postgres(ql)?:/i.test(process.env.DATABASE_URL ?? "")) {
      console.log(`Postgres pool: connection_limit≈${DB_POOL_SIZE} (per API process)`);
    }
    return;
  }
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=8000;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    await prisma.$queryRawUnsafe("PRAGMA temp_store=MEMORY;");
    sqliteTuned = true;
    console.log("SQLite concurrency: WAL + busy_timeout=8000");
  } catch (e) {
    console.warn("SQLite pragma tune skipped:", e);
  }
}
