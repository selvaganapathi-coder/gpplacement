/**
 * Copy the SQLite database to backend/backups/ with a timestamp.
 * Usage (from backend/): npx tsx scripts/backup-db.ts
 */
import fs from "fs";
import path from "path";

function resolveDbPath(): string {
  const raw = (process.env.DATABASE_URL ?? "file:./dev.db").trim();
  if (!raw.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL is not a local SQLite file. Use your host's Postgres backup tools instead."
    );
  }
  const rel = raw.replace(/^file:/, "");
  const prismaDir = path.join(__dirname, "..", "prisma");
  return path.isAbsolute(rel) ? rel : path.resolve(prismaDir, rel);
}

function main() {
  const src = resolveDbPath();
  if (!fs.existsSync(src)) {
    throw new Error(`Database file not found: ${src}`);
  }
  const outDir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(outDir, `placement-${stamp}.db`);
  fs.copyFileSync(src, dest);
  // Also copy WAL/SHM if present (SQLite crash-safe)
  for (const suffix of ["-wal", "-shm"]) {
    const side = src + suffix;
    if (fs.existsSync(side)) {
      fs.copyFileSync(side, dest + suffix);
    }
  }
  console.log(`Backup written: ${dest}`);
}

main();
