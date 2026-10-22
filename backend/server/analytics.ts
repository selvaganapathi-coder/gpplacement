import type { Prisma, PrismaClient, Program, LevelType } from "@prisma/client";
import { formatAcademic } from "../shared/academic";
import {
  buildPlacementReadiness,
  type PlacementReadinessPayload,
} from "./placementReadiness";
import { loadReadinessAttempts } from "./loadReadinessAttempts";

export const DEFAULT_PASS_RATIO = 0.5;

export type AnalyticsFilters = {
  testId?: string;
  program?: Program;
  passRatio?: number;
};

type AttemptRow = {
  id: string;
  score: number | null;
  percentage: number | null;
  proctorFlagged: boolean;
  tabSwitchCount: number;
  fullscreenExitCount: number;
  user: {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
  };
  test: {
    id: string;
    title: string;
    maxScore: number;
    passPercentage: number | null;
    questions: {
      id: string;
      prompt: string;
      order: number;
      topic: string | null;
      difficulty: string | null;
      marks: number;
    }[];
    topic?: string | null;
    difficulty?: string | null;
  };
  answers: {
    questionId: string;
    option: { isCorrect: boolean } | null;
  }[];
};

type QStat = {
  questionId: string;
  testId: string;
  testTitle: string;
  order: number;
  prompt: string;
  topic: string | null;
  difficulty: string | null;
  marks: number;
  answered: number;
  correct: number;
  scoreSum: number;
};

export type AnalyticsPayload = {
  passRatio: number;
  summary: {
    submittedAttempts: number;
    averagePercent: number | null;
    passRate: number | null;
    flaggedAttempts: number;
    testsIncluded: number;
    readinessOverall: number | null;
  };
  classAverages: {
    key: string;
    label: string;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    attempts: number;
    averagePercent: number;
    passRate: number;
  }[];
  weakTopics: {
    questionId: string;
    testId: string;
    testTitle: string;
    order: number;
    prompt: string;
    topic: string | null;
    difficulty: string | null;
    answered: number;
    correct: number;
    correctRate: number;
  }[];
  /** Question analytics pack for staff/admin dashboards. */
  questionAnalytics: {
    mostDifficult: {
      questionId: string;
      testId: string;
      testTitle: string;
      prompt: string;
      topic: string | null;
      difficulty: string | null;
      answered: number;
      correct: number;
      correctRate: number;
      averageScore: number;
      marks: number;
    }[];
    mostIncorrect: {
      questionId: string;
      testId: string;
      testTitle: string;
      prompt: string;
      topic: string | null;
      difficulty: string | null;
      answered: number;
      incorrect: number;
      incorrectRate: number;
    }[];
    topicPerformance: {
      topic: string;
      answered: number;
      correct: number;
      correctRate: number;
      averageScore: number;
    }[];
  };
  byTest: {
    testId: string;
    title: string;
    attempts: number;
    averagePercent: number;
    passRate: number;
    flaggedAttempts: number;
  }[];
  /** Score % bands for charts: 0–39, 40–59, 60–74, 75–89, 90–100 */
  scoreDistribution: {
    label: string;
    min: number;
    max: number;
    count: number;
  }[];
  /** Campus / filtered cohort placement readiness */
  readiness: PlacementReadinessPayload["readiness"];
  strongSubjects: PlacementReadinessPayload["strongSubjects"];
  weakSubjects: PlacementReadinessPayload["weakSubjects"];
  improvement: PlacementReadinessPayload["improvement"];
  testHistory: PlacementReadinessPayload["testHistory"];
};

function pct(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 1000) / 10;
}

export async function buildAnalytics(
  prisma: PrismaClient,
  filters: AnalyticsFilters,
  studentWhere?: Prisma.UserWhereInput
): Promise<AnalyticsPayload> {
  const passRatio =
    filters.passRatio != null && Number.isFinite(filters.passRatio)
      ? Math.min(1, Math.max(0, filters.passRatio))
      : DEFAULT_PASS_RATIO;

  const attemptWhere: Prisma.TestAttemptWhereInput = {
    submittedAt: { not: null },
  };
  if (filters.testId) attemptWhere.testId = filters.testId;
  if (studentWhere) attemptWhere.user = studentWhere;
  if (filters.program) {
    attemptWhere.user = {
      ...(typeof attemptWhere.user === "object" && attemptWhere.user
        ? attemptWhere.user
        : {}),
      program: filters.program as never,
    };
  }

  const attempts = (await prisma.testAttempt.findMany({
    where: attemptWhere,
    take: 2000,
    include: {
      user: {
        select: { program: true, levelType: true, level: true },
      },
      test: {
        select: {
          id: true,
          title: true,
          topic: true,
          difficulty: true,
          maxScore: true,
          passPercentage: true,
          questions: {
            select: {
              id: true,
              prompt: true,
              order: true,
              topic: true,
              difficulty: true,
              marks: true,
            },
            orderBy: { order: "asc" },
          },
        },
      },
      answers: {
        select: {
          questionId: true,
          option: { select: { isCorrect: true } },
        },
      },
    },
  })) as AttemptRow[];

  const qStats = new Map<string, QStat>();
  const topicStats = new Map<
    string,
    { answered: number; correct: number; scoreSum: number }
  >();

  const submitted = attempts.length;
  let scoreSumPct = 0;
  let passed = 0;
  let flagged = 0;

  type ClassAgg = {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    attempts: number;
    pctSum: number;
    passed: number;
  };
  const classMap = new Map<string, ClassAgg>();

  type QAgg = {
    questionId: string;
    testId: string;
    testTitle: string;
    order: number;
    prompt: string;
    topic: string | null;
    difficulty: string | null;
    answered: number;
    correct: number;
  };
  const questionMap = new Map<string, QAgg>();

  type TestAgg = {
    testId: string;
    title: string;
    attempts: number;
    pctSum: number;
    passed: number;
    flagged: number;
  };
  const testMap = new Map<string, TestAgg>();

  const bands = [
    { label: "0–39%", min: 0, max: 39.999, count: 0 },
    { label: "40–59%", min: 40, max: 59.999, count: 0 },
    { label: "60–74%", min: 60, max: 74.999, count: 0 },
    { label: "75–89%", min: 75, max: 89.999, count: 0 },
    { label: "90–100%", min: 90, max: 100, count: 0 },
  ];

  for (const a of attempts) {
    const marksSum = a.test.questions.reduce(
      (s, q) => s + (q.marks > 0 ? q.marks : 1),
      0
    );
    const max =
      a.test.maxScore > 0
        ? a.test.maxScore
        : marksSum > 0
          ? Math.round(marksSum)
          : a.test.questions.length;
    const score = a.score ?? 0;
    const percent =
      a.percentage != null && Number.isFinite(a.percentage)
        ? a.percentage
        : pct(score, max);
    scoreSumPct += percent;
    const thresholdPct =
      a.test.passPercentage != null && Number.isFinite(a.test.passPercentage)
        ? a.test.passPercentage
        : passRatio * 100;
    const isPass = max > 0 && percent >= thresholdPct;
    if (isPass) passed += 1;
    if (a.proctorFlagged) flagged += 1;

    for (const band of bands) {
      if (percent >= band.min && percent <= band.max) {
        band.count += 1;
        break;
      }
    }

    const classKey = `${a.user.program ?? "NONE"}:${a.user.levelType ?? ""}:${a.user.level ?? ""}`;
    const classRow = classMap.get(classKey) ?? {
      program: a.user.program,
      levelType: a.user.levelType,
      level: a.user.level,
      attempts: 0,
      pctSum: 0,
      passed: 0,
    };
    classRow.attempts += 1;
    classRow.pctSum += percent;
    if (isPass) classRow.passed += 1;
    classMap.set(classKey, classRow);

    const tRow = testMap.get(a.test.id) ?? {
      testId: a.test.id,
      title: a.test.title,
      attempts: 0,
      pctSum: 0,
      passed: 0,
      flagged: 0,
    };
    tRow.attempts += 1;
    tRow.pctSum += percent;
    if (isPass) tRow.passed += 1;
    if (a.proctorFlagged) tRow.flagged += 1;
    testMap.set(a.test.id, tRow);

    const correctByQ = new Map<string, boolean>();
    for (const ans of a.answers) {
      correctByQ.set(ans.questionId, !!ans.option?.isCorrect);
    }
    for (const q of a.test.questions) {
      const key = q.id;
      const marks = q.marks > 0 ? q.marks : 1;
      const topic = q.topic ?? a.test.topic ?? null;
      const difficulty = q.difficulty ?? a.test.difficulty ?? null;
      const isCorrect = !!correctByQ.get(q.id);

      const row = questionMap.get(key) ?? {
        questionId: q.id,
        testId: a.test.id,
        testTitle: a.test.title,
        order: q.order,
        prompt: q.prompt,
        topic,
        difficulty,
        answered: 0,
        correct: 0,
      };
      // Count every attempt that drew this paper question
      row.answered += 1;
      if (isCorrect) row.correct += 1;
      questionMap.set(key, row);

      const qs = qStats.get(key) ?? {
        questionId: q.id,
        testId: a.test.id,
        testTitle: a.test.title,
        order: q.order,
        prompt: q.prompt,
        topic,
        difficulty,
        marks,
        answered: 0,
        correct: 0,
        scoreSum: 0,
      };
      qs.answered += 1;
      if (isCorrect) {
        qs.correct += 1;
        qs.scoreSum += marks;
      }
      qStats.set(key, qs);

      {
        const topicKey = (topic ?? "General").trim() || "General";
        const ts = topicStats.get(topicKey) ?? {
          answered: 0,
          correct: 0,
          scoreSum: 0,
        };
        ts.answered += 1;
        if (isCorrect) {
          ts.correct += 1;
          ts.scoreSum += marks;
        }
        topicStats.set(topicKey, ts);
      }
    }
  }

  const classAverages = [...classMap.entries()]
    .map(([key, row]) => ({
      key,
      label: formatAcademic(row.program, row.levelType, row.level),
      program: row.program,
      levelType: row.levelType,
      level: row.level,
      attempts: row.attempts,
      averagePercent: Math.round((row.pctSum / row.attempts) * 10) / 10,
      passRate: Math.round((row.passed / row.attempts) * 1000) / 10,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const weakTopics = [...questionMap.values()]
    .map((q) => ({
      ...q,
      correctRate:
        q.answered > 0 ? Math.round((q.correct / q.answered) * 1000) / 10 : 0,
    }))
    .filter((q) => q.answered >= 1)
    .sort((a, b) => a.correctRate - b.correctRate || a.order - b.order)
    .slice(0, 15);

  const qAnalyticsBase = [...qStats.values()]
    .filter((q) => q.answered >= 1)
    .map((q) => {
      const correctRate =
        q.answered > 0 ? Math.round((q.correct / q.answered) * 1000) / 10 : 0;
      const incorrect = q.answered - q.correct;
      const incorrectRate =
        q.answered > 0 ? Math.round((incorrect / q.answered) * 1000) / 10 : 0;
      const averageScore =
        q.answered > 0 ? Math.round((q.scoreSum / q.answered) * 100) / 100 : 0;
      return { ...q, correctRate, incorrect, incorrectRate, averageScore };
    });

  const mostDifficult = [...qAnalyticsBase]
    .sort((a, b) => {
      // Prefer HARD difficulty, then lowest correct rate
      const da = a.difficulty === "HARD" ? 0 : a.difficulty === "MEDIUM" ? 1 : 2;
      const db = b.difficulty === "HARD" ? 0 : b.difficulty === "MEDIUM" ? 1 : 2;
      if (da !== db) return da - db;
      return a.correctRate - b.correctRate || b.answered - a.answered;
    })
    .slice(0, 12)
    .map((q) => ({
      questionId: q.questionId,
      testId: q.testId,
      testTitle: q.testTitle,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
      answered: q.answered,
      correct: q.correct,
      correctRate: q.correctRate,
      averageScore: q.averageScore,
      marks: q.marks,
    }));

  const mostIncorrect = [...qAnalyticsBase]
    .sort(
      (a, b) =>
        b.incorrectRate - a.incorrectRate ||
        b.incorrect - a.incorrect ||
        a.order - b.order
    )
    .slice(0, 12)
    .map((q) => ({
      questionId: q.questionId,
      testId: q.testId,
      testTitle: q.testTitle,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
      answered: q.answered,
      incorrect: q.incorrect,
      incorrectRate: q.incorrectRate,
    }));

  const topicPerformance = [...topicStats.entries()]
    .map(([topic, t]) => ({
      topic,
      answered: t.answered,
      correct: t.correct,
      correctRate:
        t.answered > 0 ? Math.round((t.correct / t.answered) * 1000) / 10 : 0,
      averageScore:
        t.answered > 0 ? Math.round((t.scoreSum / t.answered) * 100) / 100 : 0,
    }))
    .filter((t) => t.answered >= 2)
    .sort((a, b) => a.correctRate - b.correctRate || b.answered - a.answered)
    .slice(0, 20);

  const byTest = [...testMap.values()]
    .map((t) => ({
      testId: t.testId,
      title: t.title,
      attempts: t.attempts,
      averagePercent: Math.round((t.pctSum / t.attempts) * 10) / 10,
      passRate: Math.round((t.passed / t.attempts) * 1000) / 10,
      flaggedAttempts: t.flagged,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const readinessInputs = await loadReadinessAttempts(
    prisma,
    attemptWhere,
    { take: 2000, requirePublishedResults: false }
  );
  const readinessPayload = buildPlacementReadiness(readinessInputs);

  return {
    passRatio,
    summary: {
      submittedAttempts: submitted,
      averagePercent:
        submitted > 0 ? Math.round((scoreSumPct / submitted) * 10) / 10 : null,
      passRate: submitted > 0 ? Math.round((passed / submitted) * 1000) / 10 : null,
      flaggedAttempts: flagged,
      testsIncluded: testMap.size,
      readinessOverall: readinessPayload.readiness.overall,
    },
    classAverages,
    weakTopics,
    questionAnalytics: {
      mostDifficult,
      mostIncorrect,
      topicPerformance,
    },
    byTest,
    scoreDistribution: bands.map(({ label, min, max, count }) => ({
      label,
      min,
      max,
      count,
    })),
    readiness: readinessPayload.readiness,
    strongSubjects: readinessPayload.strongSubjects,
    weakSubjects: readinessPayload.weakSubjects,
    improvement: readinessPayload.improvement,
    testHistory: readinessPayload.testHistory.slice(0, 40),
  };
}

export const TAB_SWITCH_FLAG_THRESHOLD = 3;
export const FULLSCREEN_EXIT_FLAG_THRESHOLD = 2;

export function shouldFlagProctor(tabSwitches: number, fullscreenExits: number): boolean {
  return (
    tabSwitches >= TAB_SWITCH_FLAG_THRESHOLD ||
    fullscreenExits >= FULLSCREEN_EXIT_FLAG_THRESHOLD
  );
}
