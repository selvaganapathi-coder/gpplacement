import { prisma } from "./prisma";
import { AuditAction, logAudit } from "./audit";
import { loadAttemptAnswersMap } from "./attemptAnswers";
import {
  buildAttemptPlan,
  newPlanSeed,
  parseAttemptPlan,
  parseDifficultyBlueprint,
  questionsInPlan,
  serializeAttemptPlan,
} from "./attemptShuffle";
import { isAttemptTimeExpired } from "./attemptTiming";
import { finalizeStudentAttempt } from "./finalizeAttempt";
import { testWindowStatus } from "./testSchedule";
import { isMcqAssessment } from "../shared/assessmentTypes";

const SYSTEM_ACTOR = {
  id: "system",
  email: "system@auto-submit",
};

/**
 * Finalize an open MCQ attempt when duration expired or the test window closed.
 * Returns scores, or null if not due / already submitted / not MCQ.
 */
export async function autoFinalizeOpenAttempt(
  attemptId: string,
  opts?: { actor?: { id: string; email: string }; force?: boolean }
): Promise<{ score: number; maxScore: number } | null> {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: {
      test: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: true },
          },
        },
      },
    },
  });
  if (!attempt || attempt.submittedAt) return null;
  if (!isMcqAssessment(attempt.test.assessmentType)) return null;

  const dueByDuration = isAttemptTimeExpired(
    attempt.startedAt,
    attempt.test.durationMin,
    new Date(),
    attempt.endsAt,
    attempt.test.availableUntil
  );
  const dueByWindow = testWindowStatus(attempt.test) === "closed";
  if (!opts?.force && !dueByDuration && !dueByWindow) return null;

  let plan = parseAttemptPlan(attempt.questionPlan);
  if (!plan || plan.questionIds.length === 0) {
    const bank = attempt.test.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    }));
    plan = buildAttemptPlan(
      bank,
      attempt.test.questionsPerAttempt,
      newPlanSeed(),
      parseDifficultyBlueprint(attempt.test.difficultyBlueprint)
    );
    await prisma.testAttempt.update({
      where: { id: attempt.id },
      data: { questionPlan: serializeAttemptPlan(plan) },
    });
  }

  const scoredQuestions = questionsInPlan(attempt.test.questions, plan);
  const answers = await loadAttemptAnswersMap(attempt.id);
  const actor = opts?.actor ?? SYSTEM_ACTOR;

  const { score, maxScore } = await prisma.$transaction(async (tx) =>
    finalizeStudentAttempt(
      tx,
      {
        id: attempt.id,
        test: {
          questions: scoredQuestions.map((q) => ({
            id: q.id,
            options: q.options,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
          })),
          negativeMarking: attempt.test.negativeMarking,
        },
      },
      answers,
      { auto: true }
    )
  );

  await logAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: "SYSTEM",
    action: AuditAction.SUBMIT_ATTEMPT,
    targetType: "TestAttempt",
    targetId: attemptId,
    success: true,
    meta: {
      testId: attempt.testId,
      maxScore,
      auto: true,
      reason: dueByWindow ? "window_closed" : "duration_expired",
    },
  });
  await logAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: "SYSTEM",
    action: AuditAction.RESULT_GENERATED,
    targetType: "TestAttempt",
    targetId: attemptId,
    success: true,
    meta: { testId: attempt.testId, auto: true },
  });
  console.log("[submit:auto]", { attemptId, score, maxScore });
  return { score, maxScore };
}

/** Sweep open attempts past duration or past scheduled end. */
export async function ensureExpiredAttemptsAutoSubmitted(
  now: Date = new Date()
): Promise<number> {
  const open = await prisma.testAttempt.findMany({
    where: {
      submittedAt: null,
      status: "IN_PROGRESS",
    },
    take: 80,
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      startedAt: true,
      endsAt: true,
      test: {
        select: {
          durationMin: true,
          availableUntil: true,
          availableFrom: true,
          isPublished: true,
          assessmentType: true,
        },
      },
    },
  });

  let count = 0;
  for (const a of open) {
    if (!isMcqAssessment(a.test.assessmentType)) continue;
    const expired = isAttemptTimeExpired(
      a.startedAt,
      a.test.durationMin,
      now,
      a.endsAt,
      a.test.availableUntil
    );
    const closed = testWindowStatus(a.test, now) === "closed";
    if (!expired && !closed) continue;
    try {
      const result = await autoFinalizeOpenAttempt(a.id);
      if (result) count += 1;
    } catch (e) {
      console.error("[auto-submit]", a.id, e);
    }
  }
  return count;
}

export function startAutoSubmitScheduler(intervalMs = 60_000): NodeJS.Timeout {
  void ensureExpiredAttemptsAutoSubmitted().catch((e) =>
    console.error("[auto-submit]", e)
  );
  return setInterval(() => {
    void ensureExpiredAttemptsAutoSubmitted().catch((e) =>
      console.error("[auto-submit]", e)
    );
  }, intervalMs);
}
