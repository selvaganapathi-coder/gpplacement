import type { Prisma, PrismaClient } from "@prisma/client";
import type { ReadinessAttemptInput } from "./placementReadiness";

/** Load submitted attempts shaped for placement readiness (student or cohort). */
export async function loadReadinessAttempts(
  prisma: PrismaClient,
  where: Prisma.TestAttemptWhereInput,
  opts?: { take?: number; requirePublishedResults?: boolean }
): Promise<ReadinessAttemptInput[]> {
  const requirePublished = opts?.requirePublishedResults !== false;
  const attempts = await prisma.testAttempt.findMany({
    where: {
      AND: [
        { submittedAt: { not: null }, score: { not: null } },
        where,
        requirePublished
          ? { test: { isPublished: true, resultsPublished: true } }
          : {},
      ],
    },
    orderBy: { submittedAt: "asc" },
    take: opts?.take ?? 500,
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
          topic: true,
          maxScore: true,
          questions: {
            select: {
              id: true,
              topic: true,
              marks: true,
            },
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
  });

  return attempts.map((a) => {
    const max =
      a.test.maxScore > 0
        ? a.test.maxScore
        : a.test.questions.reduce((s, q) => s + (q.marks > 0 ? q.marks : 1), 0) ||
          a.test.questions.length;
    const answeredIds = new Set(a.answers.map((x) => x.questionId));
    const correctByQ = new Map(
      a.answers.map((x) => [x.questionId, !!x.option?.isCorrect] as const)
    );
    const questionOutcomes = a.test.questions
      .filter((q) => answeredIds.has(q.id))
      .map((q) => ({
        topic: q.topic ?? a.test.topic ?? null,
        isCorrect: !!correctByQ.get(q.id),
        answered: true,
      }));

    return {
      attemptId: a.id,
      testId: a.testId,
      title: a.test.title,
      assessmentType: a.test.assessmentType,
      topic: a.test.topic,
      score: a.score,
      percentage: a.percentage,
      maxScore: max,
      submittedAt: a.submittedAt!,
      questionOutcomes,
    };
  });
}
