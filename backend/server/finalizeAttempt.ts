import type { AttemptStatus, Prisma, PrismaClient } from "@prisma/client";

type QuestionWithOptions = {
  id: string;
  options: { id: string; isCorrect: boolean }[];
  marks?: number | null;
  negativeMarks?: number | null;
};

type AttemptForFinalize = {
  id: string;
  test: {
    questions: QuestionWithOptions[];
    negativeMarking?: boolean;
  };
};

export async function finalizeStudentAttempt(
  db: PrismaClient | Prisma.TransactionClient,
  attempt: AttemptForFinalize,
  answers: Record<string, string>,
  opts?: { auto?: boolean }
): Promise<{ score: number; maxScore: number; percentage: number }> {
  let score = 0;
  let maxScore = 0;
  const attemptId = attempt.id;
  const useNeg = !!attempt.test.negativeMarking;

  const ops = attempt.test.questions.map((q) => {
    const marks = q.marks != null && q.marks > 0 ? q.marks : 1;
    const neg = q.negativeMarks != null && q.negativeMarks > 0 ? q.negativeMarks : 0;
    maxScore += marks;
    const optionId = answers[q.id];
    const chosen = q.options.find((o) => o.id === optionId);
    if (chosen?.isCorrect) {
      score += marks;
    } else if (useNeg && optionId && neg > 0) {
      score -= neg;
    }
    return db.studentAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId: q.id },
      },
      create: {
        attemptId,
        questionId: q.id,
        optionId: optionId ?? null,
      },
      update: { optionId: optionId ?? null },
    });
  });

  for (const op of ops) {
    await op;
  }

  if (score < 0) score = 0;
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
  const status: AttemptStatus = opts?.auto ? "AUTO_SUBMITTED" : "SUBMITTED";

  await db.testAttempt.update({
    where: { id: attemptId },
    data: {
      submittedAt: new Date(),
      endedAt: new Date(),
      openLock: null,
      score: Math.round(score),
      percentage,
      status,
    },
  });
  return { score: Math.round(score), maxScore: Math.round(maxScore), percentage };
}
