export type RankableAttempt = {
  id: string;
  score: number | null;
  submittedAt: Date | string | null;
};

/**
 * Competition ranking by score (desc). Equal scores share a rank;
 * the next distinct score skips ahead (1, 2, 2, 4).
 */
export function assignRanks(
  attempts: RankableAttempt[]
): Map<string, { rank: number; cohortSize: number }> {
  const scored = attempts.filter(
    (a) => a.score != null && a.submittedAt != null
  );
  const sorted = [...scored].sort((a, b) => {
    const ds = (b.score ?? 0) - (a.score ?? 0);
    if (ds !== 0) return ds;
    return (
      new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime()
    );
  });

  const cohortSize = sorted.length;
  const out = new Map<string, { rank: number; cohortSize: number }>();
  let rank = 0;
  let lastScore: number | null = null;
  let index = 0;
  for (const a of sorted) {
    index += 1;
    if (lastScore === null || a.score !== lastScore) {
      rank = index;
      lastScore = a.score ?? 0;
    }
    out.set(a.id, { rank, cohortSize });
  }
  return out;
}

export function percentFromScore(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function isPassingPercent(
  percent: number,
  passPercentage: number | null | undefined,
  fallbackRatio = 0.5
): boolean {
  const threshold =
    passPercentage != null && Number.isFinite(passPercentage)
      ? passPercentage
      : fallbackRatio * 100;
  return percent >= threshold;
}
