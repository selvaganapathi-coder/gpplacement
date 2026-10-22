/**
 * HTTP security headers via Helmet — API-oriented defaults.
 * Never disclose Express/X-Powered-By; never use weak CSP that allows * scripts.
 */
import type { Express, RequestHandler } from "express";
import helmet from "helmet";
import { IS_PRODUCTION } from "./config";

/** Strict CSP for a JSON API (no HTML app shell served here). */
export const API_CSP_DIRECTIVES = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  // Allow nothing else — responses are JSON / CSV / binary downloads.
} as const;

/**
 * Helmet stack for the placement API.
 * - CSP: lock down any accidental HTML
 * - nosniff / DENY framing / no-referrer
 * - HSTS in production (Render terminates TLS)
 * - hidePoweredBy + caller should also `app.disable("x-powered-by")`
 */
export function securityHeadersMiddleware(): RequestHandler {
  return helmet({
    // Technology disclosure (also app.disable("x-powered-by") in applySecurityBasics)
    hidePoweredBy: true,

    contentSecurityPolicy: {
      useDefaults: false,
      directives: { ...API_CSP_DIRECTIVES },
    },

    // X-Content-Type-Options: nosniff
    noSniff: true,

    // X-Frame-Options: DENY (+ CSP frame-ancestors 'none')
    frameguard: { action: "deny" },

    // Referrer-Policy
    referrerPolicy: { policy: "no-referrer" },

    // Strict-Transport-Security (HTTPS only; safe behind Render TLS)
    hsts: IS_PRODUCTION
      ? {
          maxAge: 63_072_000, // 2 years
          includeSubDomains: true,
          preload: false,
        }
      : false,

    // Cross-origin API called from Netlify UI with credentials
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },

    // Extra hardening
    xssFilter: false, // obsolete legacy header; CSP is preferred
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    originAgentCluster: true,
  });
}

/** Apply disclosure hardening that Helmet alone does not cover. */
export function applySecurityBasics(app: Express): void {
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware());
}

/** Expected header names/values for checks and docs. */
export const EXPECTED_SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const;
