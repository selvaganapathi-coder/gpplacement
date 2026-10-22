/**
 * Password / auth policy checks (no DB).
 *   npx tsx server/password.check.ts
 */
import {
  allowDemoSeed,
  allowDemoSeedPasswordLogin,
  assertDemoSeedAllowed,
  DEFAULT_SEED_PASSWORD,
  hashPassword,
  isBcryptHash,
  isDefaultSeedPassword,
  seedForcePasswordChange,
  validatePasswordStrength,
  verifyPassword,
} from "./password";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const hash = await hashPassword("StrongPass1");
  check("hash.bcrypt_format", isBcryptHash(hash), hash.slice(0, 7));
  check("verify.ok", await verifyPassword("StrongPass1", hash));
  check("verify.bad", !(await verifyPassword("WrongPass1", hash)));
  check("verify.reject_plaintext", !(await verifyPassword("x", "not-a-hash")));
  check("verify.reject_sha256_hex", !(await verifyPassword("x", "a".repeat(64))));
  check("verify.reject_md5_hex", !(await verifyPassword("x", "a".repeat(32))));
  check("seed.is_default", isDefaultSeedPassword(DEFAULT_SEED_PASSWORD));
  check(
    "policy.blocks_seed_as_new",
    validatePasswordStrength(DEFAULT_SEED_PASSWORD) != null
  );
  check("policy.accepts_strong", validatePasswordStrength("StrongPass1") == null);

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.ALLOW_DEMO_SEED;
  delete process.env.ALLOW_DEMO_SEED_PASSWORD;
  check("prod.block_demo_seed", !allowDemoSeed());
  check("prod.block_demo_password_login", !allowDemoSeedPasswordLogin());
  check("prod.force_password_change", seedForcePasswordChange());
  let threw = false;
  try {
    assertDemoSeedAllowed("test");
  } catch {
    threw = true;
  }
  check("prod.assert_seed_throws", threw);

  process.env.ALLOW_DEMO_SEED = "true";
  process.env.ALLOW_DEMO_SEED_PASSWORD = "true";
  check("trial.allow_demo_seed", allowDemoSeed());
  check("trial.allow_demo_password", allowDemoSeedPasswordLogin());

  process.env.NODE_ENV = prev;
  delete process.env.ALLOW_DEMO_SEED;
  delete process.env.ALLOW_DEMO_SEED_PASSWORD;

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll password policy checks passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
