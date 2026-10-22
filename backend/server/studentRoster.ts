import type { LevelType, Prisma, PrismaClient, Program } from "@prisma/client";
import { Role } from "@prisma/client";
import { effectiveRollNo, formatAcademic } from "./academic";
import { isMcqAssessment } from "../shared/assessmentTypes";
import {
  buildPlacementReadiness,
  type PlacementReadinessPayload,
} from "./placementReadiness";
import { loadReadinessAttempts } from "./loadReadinessAttempts";

function maxForTest(assessmentType: string, questionCount: number, maxScore: number | null) {
  if (maxScore != null && maxScore > 0) return maxScore;
  return isMcqAssessment(assessmentType) ? questionCount : 100;
}

function pct(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 1000) / 10;
}

export type StudentRosterRow = {
  id: string;
  name: string;
  email: string;
  rollNo: string | null;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  classLabel: string;
  submitted: number;
  scored: number;
  averagePercent: number | null;
  bestPercent: number | null;
  lastSubmittedAt: string | null;
};

export type StudentPerformanceDetail = {
  student: {
    id: string;
    name: string;
    email: string;
    rollNo: string | null;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    classLabel: string;
  };
  summary: {
    submitted: number;
    scored: number;
    averagePercent: number | null;
    bestPercent: number | null;
    passRate: number | null;
    passMark: number;
    readinessOverall: number | null;
  };
  readiness: PlacementReadinessPayload;
  scoreDistribution: { label: string; count: number }[];
  attempts: {
    attemptId: string;
    testId: string;
    title: string;
    submittedAt: string | null;
    score: number | null;
    maxScore: number;
    percent: number | null;
    resultsPublished: boolean;
  }[];
};

export async function buildStudentRoster(
  prisma: PrismaClient,
  studentWhere: Prisma.UserWhereInput,
  opts?: { program?: Program; q?: string; take?: number }
): Promise<{ students: StudentRosterRow[]; totals: { students: number; withScores: number } }> {
  const where: Prisma.UserWhereInput = {
    role: Role.STUDENT,
    AND: [studentWhere],
  };
  if (opts?.program) {
    where.program = opts.program;
  }
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { rollNo: { contains: q } },
    ];
  }

  const students = await prisma.user.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: opts?.take ?? 500,
    select: {
      id: true,
      name: true,
      email: true,
      rollNo: true,
      program: true,
      levelType: true,
      level: true,
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 50,
        select: {
          score: true,
          submittedAt: true,
          test: {
            select: {
              assessmentType: true,
              maxScore: true,
              resultsPublished: true,
              _count: { select: { questions: true } },
            },
          },
        },
      },
    },
  });

  const rows: StudentRosterRow[] = students.map((s) => {
    const scoredPcts: number[] = [];
    let last: Date | null = null;
    for (const a of s.attempts) {
      if (a.submittedAt && (!last || a.submittedAt > last)) last = a.submittedAt;
      if (a.score == null) continue;
      const max = maxForTest(
        a.test.assessmentType,
        a.test._count.questions,
        a.test.maxScore
      );
      scoredPcts.push(pct(a.score, max));
    }
    const averagePercent =
      scoredPcts.length > 0
        ? Math.round((scoredPcts.reduce((x, y) => x + y, 0) / scoredPcts.length) * 10) / 10
        : null;
    const bestPercent = scoredPcts.length > 0 ? Math.max(...scoredPcts) : null;

    return {
      id: s.id,
      name: s.name,
      email: s.email,
      rollNo: effectiveRollNo(s.rollNo, s.email),
      program: s.program,
      levelType: s.levelType,
      level: s.level,
      classLabel: formatAcademic(s.program, s.levelType, s.level),
      submitted: s.attempts.length,
      scored: scoredPcts.length,
      averagePercent,
      bestPercent,
      lastSubmittedAt: last?.toISOString() ?? null,
    };
  });

  return {
    students: rows,
    totals: {
      students: rows.length,
      withScores: rows.filter((r) => r.scored > 0).length,
    },
  };
}

export async function buildStudentPerformance(
  prisma: PrismaClient,
  studentId: string
): Promise<StudentPerformanceDetail | null> {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: Role.STUDENT },
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
  if (!student) return null;

  const attempts = await prisma.testAttempt.findMany({
    where: { userId: studentId, submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 100,
    select: {
      id: true,
      testId: true,
      score: true,
      percentage: true,
      submittedAt: true,
      test: {
        select: {
          title: true,
          assessmentType: true,
          maxScore: true,
          passPercentage: true,
          resultsPublished: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });

  const passMark = 50;
  const pcts: number[] = [];
  let passed = 0;
  const bands = [
    { label: "0–39%", count: 0 },
    { label: "40–59%", count: 0 },
    { label: "60–74%", count: 0 },
    { label: "75–89%", count: 0 },
    { label: "90–100%", count: 0 },
  ];

  const attemptRows = attempts.map((a) => {
    const max = maxForTest(
      a.test.assessmentType,
      a.test._count.questions,
      a.test.maxScore
    );
    const percent =
      a.percentage != null && Number.isFinite(a.percentage)
        ? a.percentage
        : a.score != null
          ? pct(a.score, max)
          : null;
    if (percent != null) {
      pcts.push(percent);
      const threshold = a.test.passPercentage ?? passMark;
      if (percent >= threshold) passed += 1;
      if (percent < 40) bands[0]!.count += 1;
      else if (percent < 60) bands[1]!.count += 1;
      else if (percent < 75) bands[2]!.count += 1;
      else if (percent < 90) bands[3]!.count += 1;
      else bands[4]!.count += 1;
    }
    return {
      attemptId: a.id,
      testId: a.testId,
      title: a.test.title,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      score: a.score,
      maxScore: max,
      percent,
      resultsPublished: a.test.resultsPublished,
    };
  });

  const readinessInputs = await loadReadinessAttempts(
    prisma,
    { userId: studentId },
    { take: 100, requirePublishedResults: false }
  );
  const readiness = buildPlacementReadiness(readinessInputs);

  return {
    student: {
      ...student,
      rollNo: effectiveRollNo(student.rollNo, student.email),
      classLabel: formatAcademic(student.program, student.levelType, student.level),
    },
    summary: {
      submitted: attempts.length,
      scored: pcts.length,
      averagePercent:
        readiness.readiness.overall ??
        (pcts.length > 0
          ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10
          : null),
      bestPercent: pcts.length > 0 ? Math.max(...pcts) : null,
      passRate:
        pcts.length > 0 ? Math.round((passed / pcts.length) * 1000) / 10 : null,
      passMark,
      readinessOverall: readiness.readiness.overall,
    },
    readiness,
    scoreDistribution: bands,
    attempts: attemptRows,
  };
}
