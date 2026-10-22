/**
 * Exact-origin CORS allowlist for Netlify UI → Render API.
 * Production never reflects `*` and never uses host wildcards.
 */
import {
  CLIENT_ORIGIN,
  EXTRA_CLIENT_ORIGINS,
  IS_PRODUCTION,
} from "./config";

export function buildAllowedOrigins(
  primary = CLIENT_ORIGIN,
  extras: string[] = EXTRA_CLIENT_ORIGINS
): Set<string> {
  return new Set([primary, ...extras].map((o) => o.replace(/\/$/, "")).filter(Boolean));
}

export function isOriginAllowed(
  origin: string | undefined,
  allowed: Set<string> = buildAllowedOrigins(),
  opts?: { isProduction?: boolean; allowNetlifyPreviews?: boolean }
): boolean {
  if (!origin) {
    // Same-origin / curl / server-to-server — no Origin header.
    return true;
  }
  const normalized = origin.replace(/\/$/, "");
  if (allowed.has(normalized)) return true;

  for (const a of allowed) {
    try {
      if (new URL(normalized).origin === new URL(a).origin) return true;
    } catch {
      /* ignore */
    }
  }

  const production = opts?.isProduction ?? IS_PRODUCTION;
  if (production) {
    // Production: exact allowlist only (CLIENT_ORIGIN + CLIENT_ORIGINS).
    return false;
  }

  // Local / trial convenience (never in production).
  if (/^https?:\/\/(localhost|127\.0\.0\.1):51\d{2}$/.test(normalized)) {
    return true;
  }
  if (opts?.allowNetlifyPreviews) {
    if (
      /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(normalized) ||
      /^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(normalized)
    ) {
      return true;
    }
  }
  if (
    /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(normalized) ||
    /^https:\/\/[a-z0-9-]+\.loca\.lt$/i.test(normalized)
  ) {
    return true;
  }
  return false;
}
