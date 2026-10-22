import { Prisma, PrismaClient, Role } from "@prisma/client";
import { parseScopeKey } from "./academic";

/**
 * Students this staff may see (roster / marks).
 * Class scopes win: if Year 1 Sec A is assigned, only those students — not every
 * year/section in the same degree. Profile program alone ⇒ whole department.
 */
export async function studentWhereVisibleToStaff(
  prisma: PrismaClient,
  staffId: string
): Promise<Prisma.UserWhereInput> {
  const [assignments, scopes, staff] = await Promise.all([
    prisma.staffAssignment.findMany({
      where: { staffId },
      select: { studentId: true },
    }),
    prisma.staffBranchScope.findMany({ where: { staffId } }),
    prisma.user.findUnique({
      where: { id: staffId },
      select: { program: true, levelType: true, level: true, section: true },
    }),
  ]);

  const or: Prisma.UserWhereInput[] = [];

  const assignedIds = assignments.map((a) => a.studentId);
  if (assignedIds.length > 0) {
    or.push({ id: { in: assignedIds }, role: Role.STUDENT });
  }

  if (scopes.length > 0) {
    for (const scope of scopes) {
      const parsed = parseScopeKey(scope.scopeKey);
      const clause: Prisma.UserWhereInput = {
        role: Role.STUDENT,
        program: parsed.program,
      };
      if (parsed.levelType) clause.levelType = parsed.levelType;
      if (parsed.level != null) clause.level = parsed.level;
      const section = parsed.section ?? scope.section;
      if (section) clause.section = section;
      or.push(clause);
    }
  } else if (staff?.program) {
    const clause: Prisma.UserWhereInput = {
      role: Role.STUDENT,
      program: staff.program,
    };
    if (staff.levelType && staff.level != null) {
      clause.levelType = staff.levelType;
      clause.level = staff.level;
      if (staff.section) clause.section = staff.section;
    }
    or.push(clause);
  }

  if (or.length === 0) return { id: "__none__" };
  return { OR: or };
}

/** Same rules for results + analytics (level-aware, not whole-dept inflate). */
export async function studentWhereResultsVisibleToStaff(
  prisma: PrismaClient,
  staffId: string
): Promise<Prisma.UserWhereInput> {
  return studentWhereVisibleToStaff(prisma, staffId);
}

export async function canStaffViewStudent(
  prisma: PrismaClient,
  staffId: string,
  studentId: string
): Promise<boolean> {
  const where = await studentWhereResultsVisibleToStaff(prisma, staffId);
  const count = await prisma.user.count({
    where: { id: studentId, AND: [where] },
  });
  return count > 0;
}
