/**
 * Security header middleware shape.
 *   npx tsx server/securityHeaders.check.ts
 */
import express from "express";
import {
  API_CSP_DIRECTIVES,
  EXPECTED_SECURITY_HEADERS,
  applySecurityBasics,
} from "./securityHeaders";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  check("csp.default_none", API_CSP_DIRECTIVES.defaultSrc[0] === "'none'");
  check("csp.frame_ancestors_none", API_CSP_DIRECTIVES.frameAncestors[0] === "'none'");
  check(
    "expected.nosniff",
    EXPECTED_SECURITY_HEADERS["X-Content-Type-Options"] === "nosniff"
  );
  check(
    "expected.frame_deny",
    EXPECTED_SECURITY_HEADERS["X-Frame-Options"] === "DENY"
  );
  check(
    "expected.referrer",
    EXPECTED_SECURITY_HEADERS["Referrer-Policy"] === "no-referrer"
  );

  const app = express();
  applySecurityBasics(app);
  app.get("/probe", (_req, res) => res.json({ ok: true }));

  const server = await new Promise<import("http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const port = addr.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/probe`);
    const h = res.headers;

    check("live.no_powered_by", !h.get("x-powered-by"));
    check(
      "live.nosniff",
      h.get("x-content-type-options")?.toLowerCase() === "nosniff"
    );
    check("live.frame", h.get("x-frame-options")?.toUpperCase() === "DENY");
    check(
      "live.referrer",
      h.get("referrer-policy")?.toLowerCase() === "no-referrer"
    );
    const csp = h.get("content-security-policy") ?? "";
    check("live.csp_default_none", csp.includes("default-src 'none'"));
    check("live.csp_frame_ancestors", csp.includes("frame-ancestors 'none'"));
    check(
      "live.corp",
      h.get("cross-origin-resource-policy")?.toLowerCase() === "cross-origin"
    );
    // HSTS only when NODE_ENV=production — expect absent in this check run.
    if (process.env.NODE_ENV === "production") {
      check("live.hsts", (h.get("strict-transport-security") ?? "").includes("max-age="));
    } else {
      check(
        "live.hsts_off_in_dev",
        !h.get("strict-transport-security"),
        "HSTS disabled outside production"
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((e) => (e ? reject(e) : resolve()));
    });
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll security header checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
