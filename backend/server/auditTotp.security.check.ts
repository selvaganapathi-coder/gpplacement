/**
 * Audit field shape + TOTP helpers.
 *   npx tsx server/auditTotp.security.check.ts
 */
import { AuditAction } from "./auditActions";
import {
  generateTotpCode,
  generateTotpSecret,
  roleRequiresTotp,
  verifyTotp,
} from "./totp";
import { mustEnforceTotp, signTwoFaPending, readTwoFaPending } from "./twoFactor";
import { Role } from "@prisma/client";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  check("actions.LOGIN", AuditAction.LOGIN === "LOGIN");
  check("actions.FAILED_LOGIN", AuditAction.FAILED_LOGIN === "FAILED_LOGIN");
  check("actions.RESULT_RELEASED", AuditAction.RESULT_RELEASED === "RESULT_RELEASED");
  check("actions.QUESTION_IMPORTED", AuditAction.QUESTION_IMPORTED === "QUESTION_IMPORTED");
  check("actions.CSV_EXPORTED", AuditAction.CSV_EXPORTED === "CSV_EXPORTED");

  const prev = process.env.REQUIRE_ADMIN_2FA;
  delete process.env.REQUIRE_ADMIN_2FA;
  check("totp.default_not_required", !roleRequiresTotp("ADMIN"));
  check(
    "totp.default_skip_login_challenge",
    mustEnforceTotp({ role: Role.ADMIN, totpEnabled: false }) === null
  );

  process.env.REQUIRE_ADMIN_2FA = "true";
  check("totp.admin_required_when_flag", roleRequiresTotp("ADMIN"));
  check("totp.super_admin_required_when_flag", roleRequiresTotp("SUPER_ADMIN"));
  check("totp.staff_optional", !roleRequiresTotp("STAFF"));
  check(
    "totp.enforce_admin_setup",
    mustEnforceTotp({ role: Role.ADMIN, totpEnabled: false }) === "setup"
  );
  check(
    "totp.enforce_verify",
    mustEnforceTotp({ role: Role.STAFF, totpEnabled: true }) === "verify"
  );
  check(
    "totp.staff_no_force",
    mustEnforceTotp({ role: Role.STAFF, totpEnabled: false }) === null
  );
  if (prev === undefined) delete process.env.REQUIRE_ADMIN_2FA;
  else process.env.REQUIRE_ADMIN_2FA = prev;

  const secret = generateTotpSecret();
  const code = generateTotpCode(secret);
  check("totp.verify_current", verifyTotp(secret, code));
  check("totp.reject_bad", !verifyTotp(secret, "000000") || code === "000000");

  const token = signTwoFaPending({
    userId: "user1",
    email: "a@test.edu",
    setupSecret: secret,
  });
  const pending = readTwoFaPending(token);
  check("pending.roundtrip", !!pending && pending.sub === "user1" && pending.setupSecret === secret);
  check("pending.reject_garbage", readTwoFaPending("not.a.jwt") == null);

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll audit/TOTP security checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
