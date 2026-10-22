/** Normalize per-question marks; default 1 when missing/invalid. */
export function normalizeMarks(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(100, Math.round(n * 100) / 100);
}

export function sumQuestionMarks(
  questions: { marks?: number | null }[]
): number {
  return questions.reduce((sum, q) => sum + normalizeMarks(q.marks), 0);
}

/** Paper max: full bank Σ marks, or avg × questionsPerAttempt when sampling. */
export function mcqMaxScoreFromQuestions(
  questions: { marks?: number | null }[],
  questionsPerAttempt: number | null | undefined
): number {
  if (questions.length === 0) return 1;
  const bankSum = sumQuestionMarks(questions);
  if (
    questionsPerAttempt == null ||
    questionsPerAttempt <= 0 ||
    questionsPerAttempt >= questions.length
  ) {
    return Math.max(1, Math.round(bankSum));
  }
  const avg = bankSum / questions.length;
  return Math.max(1, Math.round(questionsPerAttempt * avg));
}
