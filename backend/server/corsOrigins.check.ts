/**
 * CORS allowlist — production must be exact origins only (never *).
 *   npx tsx server/corsOrigins.check.ts
 */
import { buildAllowedOrigins, isOriginAllowed } from "./corsOrigins";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const netlify = "https://gp-placement.netlify.app";
  const custom = "https://placement.gppharmacycollege.com";
  const allowed = buildAllowedOrigins(netlify, [custom]);

  check("allow.primary", isOriginAllowed(netlify, allowed, { isProduction: true }));
  check("allow.custom", isOriginAllowed(custom, allowed, { isProduction: true }));
  check(
    "deny.other_netlify",
    !isOriginAllowed("https://evil-site.netlify.app", allowed, { isProduction: true })
  );
  check(
    "deny.wildcard_style",
    !isOriginAllowed("https://anything.netlify.app", allowed, { isProduction: true })
  );
  check(
    "deny.http_prod",
    !isOriginAllowed("http://gp-placement.netlify.app", allowed, { isProduction: true })
  );
  check("allow.no_origin", isOriginAllowed(undefined, allowed, { isProduction: true }));

  // Dev convenience
  check(
    "dev.localhost",
    isOriginAllowed("http://localhost:5173", buildAllowedOrigins("http://localhost:5173"), {
      isProduction: false,
    })
  );
  check(
    "prod.no_preview_wildcard",
    !isOriginAllowed(
      "https://deploy-preview-12--gp-placement.netlify.app",
      allowed,
      { isProduction: true, allowNetlifyPreviews: true }
    )
  );
  check(
    "dev.preview_optional",
    isOriginAllowed(
      "https://deploy-preview-12--gp-placement.netlify.app",
      buildAllowedOrigins("http://localhost:5173"),
      { isProduction: false, allowNetlifyPreviews: true }
    )
  );

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll CORS origin checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
