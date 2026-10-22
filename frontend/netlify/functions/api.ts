/**
 * Netlify Function — Express API on the same *.netlify.app origin.
 * SQLite is copied to /tmp on cold start (demo data; resets on recycle).
 */
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import express from "express";
import fs from "fs";
import path from "path";
import serverless from "serverless-http";

function prepareSqlite(): void {
  const tmpDb = "/tmp/placement-netlify.db";
  if (!process.env.DATABASE_URL || String(process.env.DATABASE_URL).startsWith("file:")) {
    const candidates = [
      path.join(process.cwd(), "prisma", "dev.db"),
      path.join(__dirname, "..", "..", "prisma", "dev.db"),
    ];
    if (!fs.existsSync(tmpDb)) {
      for (const src of candidates) {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, tmpDb);
          break;
        }
      }
    }
    process.env.DATABASE_URL = `file:${tmpDb}`;
  }
}

function ensureJwt(): void {
  const s = process.env.JWT_SECRET?.trim() ?? "";
  if (!s || s.length < 32 || s.includes("dev-") || s.includes("change")) {
    process.env.JWT_SECRET = "netlify-placement-jwt-secret-key-32chars-min";
  }
}

prepareSqlite();
ensureJwt();
process.env.NETLIFY = process.env.NETLIFY || "true";

if (!process.env.CLIENT_ORIGIN) {
  process.env.CLIENT_ORIGIN =
    process.env.URL || process.env.DEPLOY_PRIME_URL || "";
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require("../../dist-server/server/index.js") as {
  app: express.Express;
  bootServerSideEffects: () => Promise<void>;
};

const bridge = express();
bridge.use((req, _res, next) => {
  // Normalize Netlify function paths to /api/...
  const raw = req.url || "/";
  if (raw.startsWith("/.netlify/functions/api")) {
    const rest = raw.slice("/.netlify/functions/api".length) || "/";
    req.url = rest.startsWith("/api") ? rest : `/api${rest === "/" ? "" : rest}`;
  } else if (!raw.startsWith("/api")) {
    req.url = `/api${raw.startsWith("/") ? raw : `/${raw}`}`;
  }
  next();
});
bridge.use(mod.app);

let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  if (!ready) {
    ready = mod.bootServerSideEffects().catch((err: unknown) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

const expressHandler = serverless(bridge, {
  binary: ["application/zip", "application/octet-stream"],
});

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  await ensureReady();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expressHandler(event, context) as any;
};
