import { Prisma, Role, type PrismaClient } from "@prisma/client";
import {
  academicYearOf,
  effectiveRollNo,
  formatAcademic,
  type LevelType,
  type Program,
} from "./academic";
import { getAssessmentType } from "../shared/assessmentTypes";
import {
  buildDepartmentMarksReportCsv,
  buildStudentMarksReportCsv,
  maxScoreForTest,
  type MarksAttemptRow,
} from "./resultsExport";

function attemptStatus(a: {
  submittedAt: Date | null;
  score: number | null;
  resultsPublished: boolean;
}): string {
  if (!a.submittedAt) return "In progress";
  if (a.resultsPublished && a.score != null) return "Scored";
  return "Submitted — results pending";
}

function toRow(args: {
  student: {
    name: string;
    email: string;
    rollNo: string | null;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
  };
  test: {
    title: string;
    assessmentType: string;
    maxScore: number;
    resultsPublished: boolean;
    _count: { questions: number };
    createdBy: { name: string };
  };
  attempt: {
    startedAt: Date;
    submittedAt: Date | null;
    score: number | null;
  } | null;
}): MarksAttemptRow {
  const roll = effectiveRollNo(args.student.rollNo, args.student.email) ?? "";
  const classLabel = formatAcademic(
    args.student.program,
    args.student.levelType,
    args.student.level
  );
  const max = maxScoreForTest(
    args.test.assessmentType,
    args.test._count.questions,
    args.test.maxScore
  );
  const typeLabel = getAssessmentType(args.test.assessmentType).label;

  if (!args.attempt) {
    return {
      rollNo: roll,
      name: args.student.name,
      email: args.student.email,
      classLabel,
      testTitle: args.test.title,
      assessmentType: typeLabel,
      startedAt: null,
      submittedAt: null,
      score: null,
      maxScore: max,
      resultsPublished: args.test.resultsPublished,
      createdByName: args.test.createdBy.name,
      status: "No attempt",
    };
  }

  return {
    rollNo: roll,
    name: args.student.name,
    email: args.student.email,
    classLabel,
    testTitle: args.test.title,
    assessmentType: typeLabel,
    startedAt: args.attempt.startedAt,
    submittedAt: args.attempt.submittedAt,
    score: args.attempt.score,
    maxScore: max,
    resultsPublished: args.test.resultsPublished,
    createdByName: args.test.createdBy.name,
    status: attemptStatus({
      submittedAt: args.attempt.submittedAt,
      score: args.attempt.score,
      resultsPublished: args.test.resultsPublished,
    }),
  };
}

export async function exportStudentMarksReport(
  prisma: PrismaClient,
  studentId: string
): Promise<{ csv: string; filename: string } | null> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNo: true,
      program: true,
      levelType: true,
      level: true,
    },
  });
  if (!student || student.role !== Role.STUDENT) return null;

  const attempts = await prisma.testAttempt.findMany({
    where: { userId: student.id },
    orderBy: { startedAt: "desc" },
    include: {
      test: {
        select: {
          title: true,
          assessmentType: true,
          maxScore: true,
          resultsPublished: true,
          _count: { select: { questions: true } },
          createdBy: { select: { name: true } },
        },
      },
    },
  });

  const rows = attempts.map((a) =>
    toRow({
      student,
      test: a.test,
      attempt: {
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        score: a.score,
      },
    })
  );

  return buildStudentMarksReportCsv(
    {
      name: student.name,
      email: student.email,
      rollNo: effectiveRollNo(student.rollNo, student.email) ?? "",
      classLabel: formatAcademic(student.program, student.levelType, student.level),
    },
    rows
  );
}

export type DepartmentReportFilter = {
  program?: Program | null;
  levelType?: LevelType | null;
  level?: number | null;
  year?: number | null;
  studentWhereExtra?: Prisma.UserWhereInput;
};

export async function exportDepartmentMarksReport(
  prisma: PrismaClient,
  filter: DepartmentReportFilter
): Promise<{ csv: string; filename: string }> {
  const where: Prisma.UserWhereInput = {
    role: Role.STUDENT,
    ...(filter.studentWhereExtra ?? {}),
  };
  if (filter.program) where.program = filter.program;
  if (filter.levelType) where.levelType = filter.levelType;
  if (filter.level != null) where.level = filter.level;

  let students = await prisma.user.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: 2000,
    select: {
      id: true,
      name: true,
      email: true,
      rollNo: true,
      program: true,
      levelType: true,
      level: true,
    },
  });

  if (filter.year != null) {
    students = students.filter(
      (s) => academicYearOf(s.program, s.levelType, s.level) === filter.year
    );
  }

  const studentIds = students.map((s) => s.id);
  const attempts =
    studentIds.length === 0
      ? []
      : await prisma.testAttempt.findMany({
          where: { userId: { in: studentIds } },
          orderBy: { startedAt: "desc" },
          include: {
            test: {
              select: {
                title: true,
                assessmentType: true,
                maxScore: true,
                resultsPublished: true,
                _count: { select: { questions: true } },
                createdBy: { select: { name: true } },
              },
            },
          },
        });

  const attemptsByStudent = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = attemptsByStudent.get(a.userId) ?? [];
    list.push(a);
    attemptsByStudent.set(a.userId, list);
  }

  const rows: MarksAttemptRow[] = [];
  for (const s of students) {
    const list = attemptsByStudent.get(s.id) ?? [];
    if (list.length === 0) {
      rows.push({
        rollNo: effectiveRollNo(s.rollNo, s.email) ?? "",
        name: s.name,
        email: s.email,
        classLabel: formatAcademic(s.program, s.levelType, s.level),
        testTitle: "—",
        assessmentType: "—",
        startedAt: null,
        submittedAt: null,
        score: null,
        maxScore: 0,
        resultsPublished: false,
        createdByName: "—",
        status: "No attempt",
      });
      continue;
    }
    for (const a of list) {
      rows.push(
        toRow({
          student: s,
          test: a.test,
          attempt: {
            startedAt: a.startedAt,
            submittedAt: a.submittedAt,
            score: a.score,
          },
        })
      );
    }
  }

  const scopeParts: string[] = [];
  if (filter.program) {
    scopeParts.push(
      formatAcademic(
        filter.program,
        filter.levelType ?? null,
        filter.level ?? null
      ) || String(filter.program)
    );
  } else {
    scopeParts.push("All departments");
  }
  if (filter.year != null) scopeParts.push(`Year ${filter.year}`);

  return buildDepartmentMarksReportCsv(scopeParts.join(" · "), rows);
}
