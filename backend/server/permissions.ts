/**
 * Explicit permission matrix (role → permission codes).
 * Backend gates use these codes — never rely on the UI hiding actions.
 *
 * See docs/PERMISSION_MATRIX.md for the human-readable tree.
 */
import { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const PERMISSION_CODES = [
  // Users (Admin)
  "USER_CREATE",
  "USER_READ",
  "USER_UPDATE",
  "USER_DELETE",
  /** @deprecated prefer USER_* — kept for existing RolePermission rows */
  "USER_MANAGE",

  // Classes / cohorts (Admin)
  "CLASS_CREATE",
  "CLASS_ASSIGN",
  "CLASS_UPDATE",

  // Question bank (Admin / Staff)
  "QUESTION_CREATE",
  "QUESTION_EDIT",
  "QUESTION_DELETE",
  "QUESTION_IMPORT",
  "QUESTION_BANK_MANAGE",
  "CATEGORY_MANAGE",

  // Tests / assessments
  "ASSESSMENT_CREATE",
  "ASSESSMENT_EDIT",
  "ASSESSMENT_DELETE",
  "ASSESSMENT_PUBLISH",
  "ASSESSMENT_VIEW",

  // Results (staff/admin)
  "RESULT_VIEW",
  "RESULT_RELEASE",
  "RESULT_EXPORT",

  // Students directory (staff/admin — scoped further by assignment)
  "STUDENT_VIEW",
  "STUDENT_MANAGE",

  // Audit / analytics / system
  "AUDIT_LOG_VIEW",
  "ANALYTICS_VIEW",
  "ROLE_MANAGE",
  "SYSTEM_SETTINGS",

  // Student self-service
  "TEST_VIEW_ELIGIBLE",
  "TEST_START",
  "TEST_ANSWER",
  "TEST_SUBMIT",
  "RESULT_VIEW_OWN",
  "PROFILE_READ_OWN",
  "PROFILE_UPDATE_OWN",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

const PERMISSION_META: Record<PermissionCode, { module: string; description: string }> = {
  USER_CREATE: { module: "users", description: "Create users" },
  USER_READ: { module: "users", description: "Read users" },
  USER_UPDATE: { module: "users", description: "Update users" },
  USER_DELETE: { module: "users", description: "Delete / deactivate users" },
  USER_MANAGE: { module: "users", description: "Manage users (legacy aggregate)" },

  CLASS_CREATE: { module: "classes", description: "Create class / cohort scopes" },
  CLASS_ASSIGN: { module: "classes", description: "Assign staff ↔ students / scopes" },
  CLASS_UPDATE: { module: "classes", description: "Update class links / promote cohorts" },

  QUESTION_CREATE: { module: "questions", description: "Create questions" },
  QUESTION_EDIT: { module: "questions", description: "Edit questions" },
  QUESTION_DELETE: { module: "questions", description: "Delete questions" },
  QUESTION_IMPORT: { module: "questions", description: "Import questions" },
  QUESTION_BANK_MANAGE: { module: "question_bank", description: "Manage question banks" },
  CATEGORY_MANAGE: { module: "categories", description: "Manage question categories" },

  ASSESSMENT_CREATE: { module: "assessments", description: "Create tests" },
  ASSESSMENT_EDIT: { module: "assessments", description: "Edit permitted tests" },
  ASSESSMENT_DELETE: { module: "assessments", description: "Delete tests" },
  ASSESSMENT_PUBLISH: { module: "assessments", description: "Publish tests" },
  ASSESSMENT_VIEW: { module: "assessments", description: "View assigned / managed tests" },

  RESULT_VIEW: { module: "results", description: "View results (scoped)" },
  RESULT_RELEASE: { module: "results", description: "Release results to students" },
  RESULT_EXPORT: { module: "results", description: "Export results CSV" },

  STUDENT_VIEW: { module: "students", description: "View assigned students" },
  STUDENT_MANAGE: { module: "students", description: "Manage students & batches" },

  AUDIT_LOG_VIEW: { module: "audit", description: "View audit logs" },
  ANALYTICS_VIEW: { module: "analytics", description: "View analytics" },
  ROLE_MANAGE: { module: "roles", description: "Manage role permissions" },
  SYSTEM_SETTINGS: { module: "settings", description: "Manage system settings" },

  TEST_VIEW_ELIGIBLE: { module: "student_tests", description: "View eligible tests" },
  TEST_START: { module: "student_tests", description: "Start an exam session" },
  TEST_ANSWER: { module: "student_tests", description: "Autosave answers" },
  TEST_SUBMIT: { module: "student_tests", description: "Submit an attempt" },
  RESULT_VIEW_OWN: { module: "student_results", description: "View own released results" },
  PROFILE_READ_OWN: { module: "profile", description: "Read own profile" },
  PROFILE_UPDATE_OWN: { module: "profile", description: "Update own profile / password" },
};

/** Tree shown in docs — kept in code so API can expose it. */
export const PERMISSION_MATRIX = {
  ADMIN: {
    Users: ["USER_CREATE", "USER_READ", "USER_UPDATE", "USER_DELETE"],
    Classes: ["CLASS_CREATE", "CLASS_ASSIGN", "CLASS_UPDATE"],
    Tests: [
      "ASSESSMENT_CREATE",
      "ASSESSMENT_EDIT",
      "ASSESSMENT_DELETE",
      "ASSESSMENT_PUBLISH",
      "RESULT_VIEW",
    ],
    AuditLogs: ["AUDIT_LOG_VIEW"],
  },
  STAFF: {
    Tests: [
      "ASSESSMENT_VIEW",
      "ASSESSMENT_EDIT",
      "ASSESSMENT_PUBLISH",
      "RESULT_VIEW",
    ],
    Students: ["STUDENT_VIEW"],
    Results: ["RESULT_VIEW", "RESULT_RELEASE", "RESULT_EXPORT"],
  },
  STUDENT: {
    Tests: ["TEST_VIEW_ELIGIBLE", "TEST_START", "TEST_ANSWER", "TEST_SUBMIT"],
    Results: ["RESULT_VIEW_OWN"],
    Profile: ["PROFILE_READ_OWN", "PROFILE_UPDATE_OWN"],
  },
} as const;

const ADMIN_DEFAULT: PermissionCode[] = [
  "USER_CREATE",
  "USER_READ",
  "USER_UPDATE",
  "USER_DELETE",
  "USER_MANAGE",
  "CLASS_CREATE",
  "CLASS_ASSIGN",
  "CLASS_UPDATE",
  "QUESTION_CREATE",
  "QUESTION_EDIT",
  "QUESTION_DELETE",
  "QUESTION_IMPORT",
  "QUESTION_BANK_MANAGE",
  "CATEGORY_MANAGE",
  "ASSESSMENT_CREATE",
  "ASSESSMENT_EDIT",
  "ASSESSMENT_DELETE",
  "ASSESSMENT_PUBLISH",
  "ASSESSMENT_VIEW",
  "RESULT_VIEW",
  "RESULT_RELEASE",
  "RESULT_EXPORT",
  "STUDENT_VIEW",
  "STUDENT_MANAGE",
  "AUDIT_LOG_VIEW",
  "ANALYTICS_VIEW",
  "SYSTEM_SETTINGS",
  "PROFILE_READ_OWN",
  "PROFILE_UPDATE_OWN",
];

const STAFF_DEFAULT: PermissionCode[] = [
  "QUESTION_CREATE",
  "QUESTION_EDIT",
  "QUESTION_IMPORT",
  "QUESTION_BANK_MANAGE",
  "ASSESSMENT_CREATE",
  "ASSESSMENT_EDIT",
  "ASSESSMENT_PUBLISH",
  "ASSESSMENT_VIEW",
  "RESULT_VIEW",
  "RESULT_RELEASE",
  "RESULT_EXPORT",
  "STUDENT_VIEW",
  "ANALYTICS_VIEW",
  "PROFILE_READ_OWN",
  "PROFILE_UPDATE_OWN",
];

const STUDENT_DEFAULT: PermissionCode[] = [
  "TEST_VIEW_ELIGIBLE",
  "TEST_START",
  "TEST_ANSWER",
  "TEST_SUBMIT",
  "RESULT_VIEW_OWN",
  "PROFILE_READ_OWN",
  "PROFILE_UPDATE_OWN",
];

/** Default grants — colleges can customize via RolePermission rows. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionCode[]> = {
  SUPER_ADMIN: [...PERMISSION_CODES],
  ADMIN: ADMIN_DEFAULT,
  STAFF: STAFF_DEFAULT,
  FACULTY: [
    "ASSESSMENT_CREATE",
    "ASSESSMENT_EDIT",
    "ASSESSMENT_VIEW",
    "RESULT_VIEW",
    "STUDENT_VIEW",
    "ANALYTICS_VIEW",
    "PROFILE_READ_OWN",
    "PROFILE_UPDATE_OWN",
  ],
  STUDENT: STUDENT_DEFAULT,
};

export async function ensurePermissionCatalog(): Promise<void> {
  for (const code of PERMISSION_CODES) {
    const meta = PERMISSION_META[code];
    await prisma.permission.upsert({
      where: { code },
      create: { code, module: meta.module, description: meta.description },
      update: { module: meta.module, description: meta.description },
    });
  }

  const all = await prisma.permission.findMany();
  const byCode = new Map(all.map((p) => [p.code, p.id]));

  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]) {
    const codes = DEFAULT_ROLE_PERMISSIONS[role];
    for (const code of codes) {
      const permissionId = byCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: { role, permissionId },
        },
        create: { role, permissionId },
        update: {},
      });
    }
  }
}

export async function roleHasPermission(
  role: Role,
  code: PermissionCode
): Promise<boolean> {
  if (role === Role.SUPER_ADMIN) return true;
  // Legacy aggregate
  if (
    code !== "USER_MANAGE" &&
    code.startsWith("USER_") &&
    (await roleHasPermission(role, "USER_MANAGE"))
  ) {
    return true;
  }
  const perm = await prisma.permission.findUnique({ where: { code } });
  if (!perm) return DEFAULT_ROLE_PERMISSIONS[role]?.includes(code) ?? false;
  const grant = await prisma.rolePermission.findUnique({
    where: { role_permissionId: { role, permissionId: perm.id } },
  });
  if (grant) return true;
  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(code) ?? false;
}

export async function permissionsForRole(role: Role): Promise<PermissionCode[]> {
  if (role === Role.SUPER_ADMIN) return [...PERMISSION_CODES];
  const grants = await prisma.rolePermission.findMany({
    where: { role },
    include: { permission: { select: { code: true } } },
  });
  if (grants.length === 0) {
    return [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
  }
  const fromDb = grants
    .map((g) => g.permission.code)
    .filter((c): c is PermissionCode =>
      (PERMISSION_CODES as readonly string[]).includes(c)
    );
  // Ensure new defaults appear even if catalog was seeded earlier
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  return [...new Set([...fromDb, ...defaults])];
}

/** Expand requireRole aliases: SUPER_ADMIN⊃ADMIN, FACULTY≈STAFF for assessment ops. */
export function expandAllowedRoles(roles: Role[]): Set<Role> {
  const out = new Set<Role>();
  for (const r of roles) {
    out.add(r);
    if (r === Role.ADMIN) out.add(Role.SUPER_ADMIN);
    if (r === Role.STAFF) {
      out.add(Role.FACULTY);
      out.add(Role.ADMIN);
      out.add(Role.SUPER_ADMIN);
    }
    if (r === Role.FACULTY) {
      out.add(Role.STAFF);
      out.add(Role.ADMIN);
      out.add(Role.SUPER_ADMIN);
    }
  }
  return out;
}
