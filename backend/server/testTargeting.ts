import { LevelType, Prisma, Program } from "@prisma/client";
import { academicYearOf, batchYearOf, equivalentLevels } from "./academic";

export type StudentCohort = {
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
};

export type TestCohort = StudentCohort;

function normalizeSection(section?: string | null): string | null {
  if (section == null) return null;
  const s = String(section).trim().toUpperCase();
  return s ? s : null;
}

/**
 * Audience chain for who may take a test:
 * - program null → every student (campus-wide)
 * - program only → that degree, any year/section
 * - program + year → that degree + year, any section
 * - program + year + section → exact class only
 *
 * Other degrees / years / sections cannot attend.
 */
export function testTargetsStudent(test: TestCohort, student: StudentCohort): boolean {
  // Campus-wide
  if (!test.program) return true;

  // Student must belong to that degree
  if (!student.program) return false;
  if (test.program !== student.program) return false;

  const testSection = normalizeSection(test.section);
  const studentSection = normalizeSection(student.section);

  // Degree-wide (no year on test) → any year in that degree
  if (test.level == null || !test.levelType) {
    // Publish API clears section without a year; keep defense-in-depth.
    if (testSection && testSection !== studentSection) return false;
    return true;
  }

  // Year-specific: student must have a matching year
  if (student.level == null) return false;

  const testBatch = batchYearOf(test.level);
  const studentBatch = batchYearOf(student.level);
  if (testBatch == null || studentBatch == null) return false;
  if (testBatch !== studentBatch) return false;

  // Section filter when set on the test
  if (testSection && testSection !== studentSection) return false;

  return true;
}

/**
 * Prisma filter for tests a student may see / take.
 * Mirrors {@link testTargetsStudent}.
 */
export function prismaTestAudienceForStudent(
  student: StudentCohort
): Prisma.TestWhereInput {
  // No program on student → only campus-wide tests
  if (!student.program) {
    return { program: null };
  }

  const year = academicYearOf(
    student.program,
    student.levelType,
    student.level
  );
  const levels = equivalentLevels(student.level);
  const studentSection = normalizeSection(student.section);

  const noSectionOnTest: Prisma.TestWhereInput = {
    OR: [{ section: null }, { section: "" }],
  };

  const matches: Prisma.TestWhereInput[] = [
    // Campus-wide
    { program: null },
    // Whole degree (any year) — no section on test
    {
      AND: [
        { program: student.program },
        { OR: [{ level: null }, { levelType: null }] },
        noSectionOnTest,
      ],
    },
  ];

  // Degree-wide with section (legacy / defense-in-depth)
  if (studentSection) {
    matches.push({
      AND: [
        { program: student.program },
        { OR: [{ level: null }, { levelType: null }] },
        { section: studentSection },
      ],
    });
  }

  if (levels.length > 0) {
    const levelType = student.levelType ?? LevelType.YEAR;
    for (const level of levels) {
      matches.push({
        AND: [
          {
            program: student.program,
            levelType,
            level,
          },
          noSectionOnTest,
        ],
      });
      if (studentSection) {
        matches.push({
          program: student.program,
          levelType,
          level,
          section: studentSection,
        });
      }
    }
  }

  const studyYear =
    student.level != null && student.level >= 1 && student.level <= 12 ? year : null;
  if (studyYear != null) {
    // YEAR form of the same academic year (when student stored as SEMESTER, etc.)
    matches.push({
      AND: [
        {
          program: student.program,
          levelType: LevelType.YEAR,
        level: studyYear,
        },
        noSectionOnTest,
      ],
    });
    if (studentSection) {
      matches.push({
        program: student.program,
        levelType: LevelType.YEAR,
        level: studyYear,
        section: studentSection,
      });
    }
    // Semester papers that map onto this year
    matches.push({
      AND: [
        {
          program: student.program,
          levelType: LevelType.SEMESTER,
          level: { in: [studyYear * 2 - 1, studyYear * 2] },
        },
        noSectionOnTest,
      ],
    });
    if (studentSection) {
      matches.push({
        program: student.program,
        levelType: LevelType.SEMESTER,
          level: { in: [studyYear * 2 - 1, studyYear * 2] },
        section: studentSection,
      });
    }
  }

  return { OR: matches };
}
