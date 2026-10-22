import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RATE_LIMITS } from "./capacity";
import { readJwt } from "./jwt";

/**
 * Campus labs often share one public IP. Prefer authenticated user id so
 * ~1000 concurrent examinees are not queued behind a single IP bucket.
 */
function userOrIpKey(req: Request): string {
  const jwt = readJwt(req);
  if (jwt?.sub) return `u:${jwt.sub}`;
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

function ipKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

/** Second-layer ceiling for all `/api/*` (except health). Tunable via .env. */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.globalPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: (req) => {
    const p = req.path || "";
    return (
      p === "/health" ||
      p === "/api/health" ||
      p === "/api/ready" ||
      p === "/api/capacity" ||
      p.endsWith("/health") ||
      p.endsWith("/ready") ||
      p.endsWith("/capacity")
    );
  },
  message: { error: "Too many requests. Please slow down and try again.", code: "RATE_LIMIT" },
});

/** Login / 2FA — IP-based (pre-auth). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.loginPer15Min,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  message: {
    error: "Too many sign-in tries. Please wait a few minutes and try again.",
    code: "RATE_LIMIT",
  },
});

/**
 * Forgot / reset password — stricter IP bucket.
 * Apply even if the flow is not fully implemented yet.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.passwordResetPer15Min,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  message: {
    error: "Too many password-reset attempts. Please wait and try again.",
    code: "RATE_LIMIT",
  },
});

/** Authenticated password change. */
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.changePasswordPer15Min,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: "Too many password changes. Please wait a few minutes.",
    code: "RATE_LIMIT",
  },
});

/** Per-user submit cap — many students can submit in the same minute. */
export const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.submitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Please wait a moment before submitting again.", code: "RATE_LIMIT" },
});

/**
 * Autosave: enough for steady answering with delta saves; protects DB under 1k users.
 * Override with RATE_LIMIT_AUTOSAVE_PER_MIN.
 */
export const autosaveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.autosavePerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Saving too quickly — please wait a second.", code: "RATE_LIMIT" },
});

/** Proctor events are bursty; keep them from flooding the DB. */
export const proctorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.proctorPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Proctor signal throttled — stay on the exam page.", code: "RATE_LIMIT" },
});

/**
 * Sensitive staff/admin ops: import, export, publish, release results.
 * Per-user so a shared lab IP does not block the whole department.
 */
export const sensitiveOpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.sensitivePerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: {
    error: "Too many import/export/publish actions. Please wait a moment.",
    code: "RATE_LIMIT",
  },
});

/** Helper for routes that need a JSON 429 body (express-rate-limit already sends message). */
export function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({ error: "Too many requests.", code: "RATE_LIMIT" });
}
