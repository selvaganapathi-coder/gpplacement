/**
 * Permission matrix sanity checks.
 *   npx tsx server/permissions.check.ts
 */
import { Role } from "@prisma/client";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MATRIX,
  roleHasPermission,
} from "./permissions";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  check(
    "matrix.admin.users",
    PERMISSION_MATRIX.ADMIN.Users.includes("USER_CREATE") &&
      PERMISSION_MATRIX.ADMIN.Users.includes("USER_DELETE")
  );
  check(
    "matrix.staff.results",
    PERMISSION_MATRIX.STAFF.Results.includes("RESULT_RELEASE") &&
      PERMISSION_MATRIX.STAFF.Results.includes("RESULT_EXPORT")
  );
  check(
    "matrix.student.tests",
    PERMISSION_MATRIX.STUDENT.Tests.includes("TEST_START") &&
      PERMISSION_MATRIX.STUDENT.Tests.includes("TEST_SUBMIT")
  );

  check(
    "defaults.admin.has_user_create",
    await roleHasPermission(Role.ADMIN, "USER_CREATE")
  );
  check(
    "defaults.staff.has_result_release",
    await roleHasPermission(Role.STAFF, "RESULT_RELEASE")
  );
  check(
    "defaults.student.has_test_answer",
    await roleHasPermission(Role.STUDENT, "TEST_ANSWER")
  );
  check(
    "defaults.student.no_user_delete",
    !(await roleHasPermission(Role.STUDENT, "USER_DELETE"))
  );
  check(
    "defaults.staff.no_audit",
    !(await roleHasPermission(Role.STAFF, "AUDIT_LOG_VIEW"))
  );
  check(
    "defaults.student.list_nonempty",
    (DEFAULT_ROLE_PERMISSIONS.STUDENT?.length ?? 0) >= 5
  );

  if (failed) {
    console.error(`\n${failed} permission check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll permission matrix checks passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
