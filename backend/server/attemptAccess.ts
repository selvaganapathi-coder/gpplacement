/**
 * IDOR / BOLA guards for test attempts.
 *
 * Never trust client-supplied attempt IDs. Always verify:
 *   authenticated user → owns attempt → attempt belongs to test →
 *   (live ops) student still in test audience → allowed
 */
import type { LevelType, Program, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { parseAttemptPlan } from "./attemptShuffle";
import { testTargetsStudent } from "./testTargeting";

export type AttemptAccessDeny = {
  ok: false;
  status: 404 | 403;
  error: string;
  code: "ATTEMPT_NOT_FOUND" | "ATTEMPT_FORBIDDEN" | "COHORT_FORBIDDEN";
};

export type StudentAttemptRow = {
  id: string;
  userId: string;
  testId: string;
  submittedAt: Date | null;
  startedAt: Date;
  endsAt: Date | null;
  openLock: string | null;
  questionPlan: string | null;
  markedForReview: string | null;
  proctorFlagged: boolean;
  tabSwitchCount: number;
  fullscreenExitCount: number;
  score: number | null;
  percentage: number | null;
  test: {
    id: string;
    title: string;
    isPublished: boolean;
    resultsPublished: boolean;
    availableFrom: Date | null;
    availableUntil: Date | null;
    durationMin: number;
    allowRetake: boolean;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    section: string | null;
    assessmentType: string;
    maxScore: number;
    passPercentage: number | null;
    questionsPerAttempt: number | null;
    negativeMarking: boolean;
    difficultyBlueprint: string | null;
  };
};

export type AttemptAccessOk = {
  ok: true;
  attempt: StudentAttemptRow;
};

/**
 * Load an attempt only if it belongs to `studentId`.
 * Always returns the same 404 shape for missing vs other-owner (no IDOR oracle).
 */
export async function loadOwnedStudentAttempt(
  attemptId: string,
  studentId: string,
  opts?: {
    /** When true, also require the student still matches the test audience. */
    requireCohort?: boolean;
    db?: PrismaClient;
  }
): Promise<AttemptAccessOk | AttemptAccessDeny> {
  const db = opts?.db ?? prisma;
  const attempt = await db.testAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      testId: true,
      submittedAt: true,
      startedAt: true,
      endsAt: true,
      openLock: true,
      questionPlan: true,
      markedForReview: true,
      proctorFlagged: true,
      tabSwitchCount: true,
      fullscreenExitCount: true,
      score: true,
      percentage: true,
      test: {
        select: {
          id: true,
          title: true,
          isPublished: true,
          resultsPublished: true,
          availableFrom: true,
          availableUntil: true,
          durationMin: true,
          allowRetake: true,
          program: true,
          levelType: true,
          level: true,
          section: true,
          assessmentType: true,
          maxScore: true,
          passPercentage: true,
          questionsPerAttempt: true,
          negativeMarking: true,
          difficultyBlueprint: true,
        },
      },
    },
  });

  // Uniform not-found — do not reveal that another student's attempt exists.
  if (!attempt || attempt.userId !== studentId) {
    return {
      ok: false,
      status: 404,
      error: "Attempt not found",
      code: "ATTEMPT_NOT_FOUND",
    };
  }

  if (opts?.requireCohort) {
    const student = await db.user.findUnique({
      where: { id: studentId },
      select: {
        program: true,
        levelType: true,
        level: true,
        section: true,
      },
    });
    if (!student || !testTargetsStudent(attempt.test, student)) {
      return {
        ok: false,
        status: 404,
        error: "Attempt not found",
        code: "COHORT_FORBIDDEN",
      };
    }
  }

  return { ok: true, attempt };
}

/**
 * Keep only answers where:
 * - question is on this attempt's plan (or test, if no plan yet)
 * - option belongs to that question
 * - question belongs to this attempt's test
 */
export async function sanitizeAttemptAnswers(
  attemptId: string,
  testId: string,
  questionPlan: string | null,
  answers: Record<string, string>,
  db: PrismaClient = prisma
): Promise<Record<string, string>> {
  const entries = Object.entries(answers).filter(
    ([qid, oid]) => typeof qid === "string" && typeof oid === "string" && !!qid && !!oid
  );
  if (entries.length === 0) return {};

  const plan = parseAttemptPlan(questionPlan);
  const allowedQuestionIds = plan ? new Set(plan.questionIds) : null;

  const questionIds = [
    ...new Set(
      entries
        .map(([qid]) => qid)
        .filter((qid) => !allowedQuestionIds || allowedQuestionIds.has(qid))
    ),
  ];
  if (questionIds.length === 0) return {};

  const options = await db.option.findMany({
    where: {
      id: { in: [...new Set(entries.map(([, oid]) => oid))] },
      questionId: { in: questionIds },
      question: { testId },
    },
    select: { id: true, questionId: true },
  });
  const optionByQuestion = new Map<string, Set<string>>();
  for (const o of options) {
    let set = optionByQuestion.get(o.questionId);
    if (!set) {
      set = new Set();
      optionByQuestion.set(o.questionId, set);
    }
    set.add(o.id);
  }

  const filtered: Record<string, string> = {};
  for (const [qid, oid] of entries) {
    if (allowedQuestionIds && !allowedQuestionIds.has(qid)) continue;
    if (optionByQuestion.get(qid)?.has(oid)) {
      filtered[qid] = oid;
    }
  }
  return filtered;
}

/** Staff/admin: attempt must belong to the URL testId (blocks /tests/A/attempts/B cross-wiring). */
export async function loadAttemptForTest(
  testId: string,
  attemptId: string
): Promise<
  | { ok: true; attempt: { id: string; userId: string; testId: string; submittedAt: Date | null } }
  | AttemptAccessDeny
> {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      testId: true,
      submittedAt: true,
    },
  });
  if (!attempt || attempt.testId !== testId) {
    return {
      ok: false,
      status: 404,
      error: "Attempt not found",
      code: "ATTEMPT_NOT_FOUND",
    };
  }
  return { ok: true, attempt };
}
