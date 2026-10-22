/**
 * Vercel Function — the Express API (backend/) served on the same origin as the UI.
 *
 * No external database: the build seeds a SQLite demo DB (backend/prisma/dev.db),
 * which is copied to /tmp (the only writable path on Vercel) on cold start.
 * Data changes live until the instance is recycled, then reset to the seeded demo.
 * To use a real database later, set DATABASE_URL to Postgres (and switch the Prisma provider).
 */
const fs = require("fs");
const path = require("path");

const TMP_DB = "/tmp/placement-vercel.db";

function prepareSqlite() {
  const url = process.env.DATABASE_URL;
  if (url && !String(url).startsWith("file:")) return;
  if (!fs.existsSync(TMP_DB)) {
    const src = path.join(__dirname, "..", "backend", "prisma", "dev.db");
    fs.copyFileSync(src, TMP_DB);
    // Copy a leftover WAL too (if the seed left one) so no seeded rows are lost.
    if (fs.existsSync(`${src}-wal`)) fs.copyFileSync(`${src}-wal`, `${TMP_DB}-wal`);
  }
  process.env.DATABASE_URL = `file:${TMP_DB}`;
}

function withHttps(host) {
  return host ? `https://${String(host).replace(/^https?:\/\//, "").replace(/\/$/, "")}` : "";
}

/** Same-origin UI: default CLIENT_ORIGIN to this deployment's own URLs (prod + preview). */
function prepareOrigins() {
  const own = [
    withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    withHttps(process.env.VERCEL_BRANCH_URL),
    withHttps(process.env.VERCEL_URL),
  ].filter(Boolean);
  if (!process.env.CLIENT_ORIGIN && own.length) process.env.CLIENT_ORIGIN = own[0];
  const extra = (process.env.CLIENT_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const all = [...new Set([...extra, ...own])].filter((o) => o !== process.env.CLIENT_ORIGIN);
  process.env.CLIENT_ORIGINS = all.join(",");
}

let mod;
let ready;
let bootError;

try {
  prepareSqlite();
  prepareOrigins();
  if (!process.env.SESSION_HOURS) process.env.SESSION_HOURS = "8";
  // Static require so Vercel's file tracer bundles the compiled backend + Prisma client.
  mod = require("../backend/dist-server/server/index.js");
} catch (err) {
  bootError = err;
  console.error("[vercel] API failed to load:", err);
}

function ensureReady() {
  if (!ready) {
    ready = mod.bootServerSideEffects().catch((err) => {
      ready = undefined;
      throw err;
    });
  }
  return ready;
}

module.exports = async function handler(req, res) {
  try {
    if (bootError) throw bootError;
    await ensureReady();
    return mod.app(req, res);
  } catch (err) {
    console.error("[vercel] API request failed:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        error: "API function failed",
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }
};
