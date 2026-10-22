import { LevelType, Prisma, PrismaClient, Program, Role } from "@prisma/client";
import { batchYearOf, parseScopeKey, parseSection, type Section } from "./academic";

type TestForPermission = {
  id?: string;
  createdById: string;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
  createdBy: { id: string; role: Role };
};

export type StaffForPermission = {
  id: string;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
};

/** A class (or whole department) this staff may author tests for. */
export type StaffCohort = {
  program: Program;
  /** null = whole program (all years / sections). */
  levelType: LevelType | null;
  level: number | null;
  /** null with a year = both sections; A/B = one class. */
  section: Section | null;
  /** True when this covers every year/section in the program. */
  wholeProgram: boolean;
};

function cohortFromParts(
  program: Program,
  levelType: LevelType | null,
  level: number | null,
  section: Section | string | null | undefined
): StaffCohort {
  const wholeProgram = !levelType || level == null;
  const sec = wholeProgram ? null : parseSection(section ?? null);
  return {
    program,
    levelType: wholeProgram ? null : levelType,
    level: wholeProgram ? null : level,
    section: wholeProgram ? null : sec,
    wholeProgram,
  };
}

/**
 * Cohorts this staff may manage for tests.
 * Prefer StaffBranchScope rows; fall back to profile program (= whole department).
 */
export async function staffManagedCohorts(
  prisma: PrismaClient,
  staff: StaffForPermission
): Promise<StaffCohort[]> {
  const scopes = await prisma.staffBranchScope.findMany({
    where: { staffId: staff.id },
    select: {
      program: true,
      levelType: true,
      level: true,
      section: true,
      scopeKey: true,
    },
  });

  const byKey = new Map<string, StaffCohort>();
  for (const s of scopes) {
    let program = s.program;
    let levelType = s.levelType;
    let level = s.level;
    let section = parseSection(s.section);
    try {
      const parsed = parseScopeKey(s.scopeKey);
      program = parsed.program;
      levelType = parsed.levelType;
      level = parsed.level;
      if (parsed.section) section = parsed.section;
    } catch {
      /* use columns */
    }
    const c = cohortFromParts(program, levelType, level, section);
    const key = c.wholeProgram
      ? c.program
      : `${c.program}:${c.levelType}:${c.level}:${c.section ?? "*"}`;
    byKey.set(key, c);
  }

  // Profile program with no scopes ⇒ own the whole department (B.Pharm staff → all B.Pharm).
  if (byKey.size === 0 && staff.program) {
    if (staff.levelType && staff.level != null) {
      const c = cohortFromParts(
        staff.program,
        staff.levelType,
        staff.level,
        staff.section
      );
      byKey.set(
        `${c.program}:${c.levelType}:${c.level}:${c.section ?? "*"}`,
        c
      );
    } else {
      byKey.set(staff.program, cohortFromParts(staff.program, null, null, null));
    }
  }

  return [...byKey.values()];
}

/** Departments derived from cohorts (UI filters that only need program). */
export function programsFromCohorts(cohorts: StaffCohort[]): Program[] {
  return [...new Set(cohorts.map((c) => c.program))];
}

/** @deprecated Prefer staffManagedCohorts — kept for callers that only need programs. */
export async function staffManagedPrograms(
  prisma: PrismaClient,
  staff: StaffForPermission
): Promise<Program[]> {
  return programsFromCohorts(await staffManagedCohorts(prisma, staff));
}

/** Does this cohort cover a concrete class audience? */
export function cohortCoversAudience(
  cohort: StaffCohort,
  program: Program | null,
  levelType: LevelType | null,
  level: number | null,
  _section?: string | null
): boolean {
  if (!program) return false;
  if (cohort.program !== program) return false;
  // Whole department (or writing a degree-wide test with no year)
  if (cohort.wholeProgram) return true;
  if (level == null || !levelType) return cohort.wholeProgram;
  const cohortBatch = batchYearOf(cohort.level);
  const audienceBatch = batchYearOf(level);
  if (cohortBatch != null && audienceBatch != null && cohortBatch === audienceBatch) {
    return true;
  }
  if (cohort.levelType !== levelType || cohort.level !== level) return false;
  // Section ignored
  return true;
}

export function staffCanAuthorAudience(
  cohorts: StaffCohort[],
  program: Program | null,
  levelType: LevelType | null,
  level: number | null,
  section?: string | null
): boolean {
  return cohorts.some((c) =>
    cohortCoversAudience(c, program, levelType, level, section)
  );
}

/** Prisma where: tests staff may see/edit (exact class or whole-program scope). */
export function testWhereVisibleToStaffCohorts(
  cohorts: StaffCohort[]
): Prisma.TestWhereInput {
  if (cohorts.length === 0) {
    return { id: "__none__" };
  }
  const or: Prisma.TestWhereInput[] = [];
  for (const c of cohorts) {
    if (c.wholeProgram) {
      or.push({ program: c.program });
    } else if (!c.section) {
      or.push({
        program: c.program,
        levelType: c.levelType!,
        level: c.level!,
      });
    } else {
      or.push({
        program: c.program,
        levelType: c.levelType!,
        level: c.level!,
        section: c.section,
      });
    }
  }
  return { OR: or };
}

/** @deprecated Prefer testWhereVisibleToStaffCohorts */
export function testWhereVisibleToStaff(programs: Program[]): Prisma.TestWhereInput {
  if (programs.length === 0) return { id: "__none__" };
  return { program: { in: programs } };
}

/**
 * Staff may view/edit/publish only tests whose audience they own.
 * Campus-wide tests (no program) stay admin-only.
 */
export async function canStaffAccessTest(
  prisma: PrismaClient,
  test: TestForPermission,
  staff: StaffForPermission
): Promise<boolean> {
  if (!test.program) return false;
  const cohorts = await staffManagedCohorts(prisma, staff);
  return staffCanAuthorAudience(
    cohorts,
    test.program,
    test.levelType,
    test.level,
    test.section
  );
}

/**
 * Edit rights: creator, or department staff on admin-authored tests (access person).
 * Other staff in the same department may view but not edit peer-created tests.
 */
export async function canStaffEditTest(
  prisma: PrismaClient,
  test: TestForPermission,
  staff: StaffForPermission
): Promise<boolean> {
  if (test.createdById === staff.id) return true;
  if (test.createdBy.role === Role.ADMIN) {
    return canStaffAccessTest(prisma, test, staff);
  }
  return false;
}

/** Staff may open a test if they created it or it targets their managed audience. */
export async function canStaffViewTest(
  prisma: PrismaClient,
  test: TestForPermission,
  staff: StaffForPermission
): Promise<boolean> {
  if (test.createdById === staff.id) return true;
  return canStaffAccessTest(prisma, test, staff);
}

export async function resolveStaffCanEditTest(
  prisma: PrismaClient,
  testId: string,
  staffId: string
): Promise<boolean> {
  const [test, staff] = await Promise.all([
    prisma.test.findUnique({
      where: { id: testId },
      include: { createdBy: { select: { id: true, role: true } } },
    }),
    prisma.user.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        program: true,
        levelType: true,
        level: true,
        section: true,
      },
    }),
  ]);
  if (!test?.createdBy || !staff) return false;
  return canStaffEditTest(prisma, test, staff);
}

export async function resolveStaffCanAccessTest(
  prisma: PrismaClient,
  testId: string,
  staffId: string
): Promise<boolean> {
  return resolveStaffCanEditTest(prisma, testId, staffId);
}

export async function loadStaffForPermission(
  prisma: PrismaClient,
  staffId: string
): Promise<StaffForPermission | null> {
  return prisma.user.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      program: true,
      levelType: true,
      level: true,
      section: true,
    },
  });
}

export function serializeCohorts(cohorts: StaffCohort[]) {
  return cohorts.map((c) => ({
    program: c.program,
    levelType: c.levelType,
    level: c.level,
    section: c.section,
    wholeProgram: c.wholeProgram,
  }));
}
