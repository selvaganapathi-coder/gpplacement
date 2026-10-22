import { DEFAULT_SEED_PASSWORD } from "./password";

export { DEFAULT_SEED_PASSWORD };

/** Short-lived access JWT (HttpOnly cookie). */
export const ACCESS_COOKIE_NAME = "placement_at";
/** Rotating refresh token (HttpOnly cookie) — opaque, not a JWT. */
export const REFRESH_COOKIE_NAME = "placement_rt";
/** Legacy single-cookie name — cleared on logout for migration. */
export const LEGACY_COOKIE_NAME = "placement_token";

export const COOKIE_NAME = ACCESS_COOKIE_NAME;

export const PORT = Number(process.env.PORT) || 3001;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Browser UI origin for CORS + cookies.
 * Production (Netlify → Render): must set CLIENT_ORIGIN to the exact Netlify/custom
 * HTTPS origin — never `*` and never the Render API URL.
 */
function resolveClientOrigin(): string {
  const fromEnv = process.env.CLIENT_ORIGIN?.trim();
  if (IS_PRODUCTION) {
    if (!fromEnv) {
      throw new Error(
        "CLIENT_ORIGIN must be set in production to your Netlify (or custom) HTTPS origin, e.g. https://your-site.netlify.app"
      );
    }
    const trimmed = fromEnv.replace(/\/$/, "");
    if (!/^https:\/\//i.test(trimmed)) {
      throw new Error(
        "CLIENT_ORIGIN must be an https:// origin in production (no wildcard *)."
      );
    }
    if (trimmed.includes("*")) {
      throw new Error("CLIENT_ORIGIN must be an exact origin — wildcards are not allowed.");
    }
    return trimmed;
  }
  const raw = fromEnv || "http://localhost:5173";
  const trimmed = raw.replace(/\/$/, "");
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export const CLIENT_ORIGIN = resolveClientOrigin();

/**
 * Extra exact browser origins for CORS (comma-separated).
 * Example custom domain: CLIENT_ORIGINS=https://placement.gppharmacycollege.com
 * Never use `*`.
 */
export const EXTRA_CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean)
  .map((o) => {
    if (o.includes("*")) {
      throw new Error("CLIENT_ORIGINS entries must be exact origins — no wildcards.");
    }
    return IS_PRODUCTION && o && !/^https?:\/\//i.test(o) ? `https://${o}` : o;
  });

/** Dev/trial only: allow Netlify preview host patterns when not in production. */
export const ALLOW_NETLIFY_PREVIEWS =
  !IS_PRODUCTION && process.env.ALLOW_NETLIFY_PREVIEWS !== "false";

/** Failed attempts before temporary lock. */
export const LOGIN_LOCKOUT_THRESHOLD = 5;
/** Lock duration in minutes. */
export const LOGIN_LOCKOUT_MINUTES = 15;

/** Short-lived access JWT lifetime (minutes). */
export const ACCESS_TOKEN_MINUTES = Math.min(
  60,
  Math.max(5, Number(process.env.ACCESS_TOKEN_MINUTES) || 15)
);
export const ACCESS_TOKEN_MS = ACCESS_TOKEN_MINUTES * 60 * 1000;

/** Idle / refresh-session lifetime (hours). */
export const SESSION_HOURS = Math.max(1, Number(process.env.SESSION_HOURS) || 2);
export const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
/** Warn the user this many minutes before idle logout. */
export const SESSION_WARN_MINUTES = Math.max(1, Number(process.env.SESSION_WARN_MINUTES) || 5);

/** Minutes after exam end (`availableUntil`) before results show to everyone. */
export const RESULTS_AUTO_RELEASE_MINUTES = Math.max(
  1,
  Number(process.env.RESULTS_AUTO_RELEASE_MINUTES) || 30
);

const DEV_JWT_FALLBACK = "dev-change-me-in-production-min-32-chars";

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (IS_PRODUCTION) {
    if (!fromEnv || fromEnv.length < 32 || fromEnv.includes("dev-") || fromEnv.includes("change")) {
      throw new Error(
        "JWT_SECRET must be set in production to a strong random string (32+ characters)."
      );
    }
    return fromEnv;
  }
  return fromEnv && fromEnv.length >= 16 ? fromEnv : DEV_JWT_FALLBACK;
}

export const JWT_SECRET = resolveJwtSecret();

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function baseCookieFlags() {
  const apiPublic =
    process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, "") ||
    process.env.PUBLIC_API_URL?.trim().replace(/\/$/, "") ||
    "";
  const clientHost = hostOf(CLIENT_ORIGIN);
  const apiHost = apiPublic ? hostOf(apiPublic) : null;
  const crossSite = !!clientHost && !!apiHost && clientHost !== apiHost;

  return {
    httpOnly: true as const,
    sameSite: (crossSite ? "none" : "lax") as "none" | "lax",
    path: "/",
    secure: IS_PRODUCTION || crossSite,
  };
}

/**
 * Browser auth cookies: HttpOnly + Secure (prod/cross-site) + SameSite.
 * Never put JWTs in localStorage, sessionStorage, or URLs.
 */
export function accessCookieOptions() {
  return {
    ...baseCookieFlags(),
    maxAge: ACCESS_TOKEN_MS,
  };
}

export function refreshCookieOptions() {
  return {
    ...baseCookieFlags(),
    maxAge: SESSION_MS,
  };
}

/** @deprecated use accessCookieOptions — kept for callers during migration */
export function cookieOptions() {
  return accessCookieOptions();
}

/** Flags for clearCookie (must match path/sameSite/secure or browsers keep the cookie). */
export function clearCookieOptions() {
  const flags = baseCookieFlags();
  return {
    httpOnly: flags.httpOnly,
    sameSite: flags.sameSite,
    path: flags.path,
    secure: flags.secure,
  };
}
