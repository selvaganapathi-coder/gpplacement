/**
 * Server-authoritative attempt timer.
 * Client countdowns are display-only; every mutate uses these checks.
 */

export function attemptDeadline(startedAt: Date, durationMin: number): Date {
  return new Date(startedAt.getTime() + Math.max(1, durationMin) * 60 * 1000);
}

/** Deadline = min(startedAt + duration, availableUntil) when a window end exists. */
export function computeAttemptEndsAt(
  startedAt: Date,
  durationMin: number,
  availableUntil?: Date | null
): Date {
  const byDuration = attemptDeadline(startedAt, durationMin);
  if (
    availableUntil &&
    !Number.isNaN(availableUntil.getTime()) &&
    availableUntil.getTime() < byDuration.getTime()
  ) {
    return availableUntil;
  }
  return byDuration;
}

export function resolveAttemptEndsAt(
  attempt: { startedAt: Date; endsAt?: Date | null },
  durationMin: number,
  availableUntil?: Date | null
): Date {
  if (attempt.endsAt && !Number.isNaN(attempt.endsAt.getTime())) {
    return attempt.endsAt;
  }
  return computeAttemptEndsAt(attempt.startedAt, durationMin, availableUntil);
}

export function isAttemptTimeExpired(
  startedAt: Date,
  durationMin: number,
  now: Date = new Date(),
  endsAt?: Date | null,
  availableUntil?: Date | null
): boolean {
  const deadline = resolveAttemptEndsAt(
    { startedAt, endsAt },
    durationMin,
    availableUntil
  );
  return now.getTime() >= deadline.getTime();
}

export function openAttemptLockKey(userId: string, testId: string): string {
  return `${userId}:${testId}`;
}
