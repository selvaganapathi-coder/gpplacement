/**
 * Build step for hosted demos without an external database (Vercel / Netlify).
 * Creates a fresh SQLite file at prisma/dev.db and seeds the demo accounts + data.
 * Skipped when DATABASE_URL points at a real (non-file) database.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const url = process.env.DATABASE_URL || "";
if (url && !url.startsWith("file:")) {
  console.log("[demo-db] DATABASE_URL is not SQLite — skipping demo DB build.");
  process.exit(0);
}

const root = path.join(__dirname, "..");
for (const f of ["dev.db", "dev.db-wal", "dev.db-shm", "dev.db-journal"]) {
  fs.rmSync(path.join(root, "prisma", f), { force: true });
}

const env = {
  ...process.env,
  DATABASE_URL: "file:./dev.db",
  // Seed runs outside production mode so the documented demo logins are created.
  NODE_ENV: "development",
  SEED_FORCE_PASSWORD_CHANGE: process.env.SEED_FORCE_PASSWORD_CHANGE || "false",
};
const run = (cmd) => execSync(cmd, { cwd: root, env, stdio: "inherit" });
run("npx prisma db push --skip-generate");
run("npx tsx prisma/seed.ts");
// Demo content so every screen has data: published tests, question bank, skills, results.
if (process.env.DEMO_DB_EXTRAS !== "false") {
  for (const script of [
    "publish-demo-test",
    "create-sample-all",
    "seedPharmacyBank",
    "seedSkillModule",
    "seed-sample-results",
  ]) {
    run(`npx tsx prisma/${script}.ts`);
  }
}
console.log("[demo-db] seeded", path.join(root, "prisma", "dev.db"));
