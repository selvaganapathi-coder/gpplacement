import { prisma } from "./prisma";
import { RESULTS_AUTO_RELEASE_MINUTES } from "./config";
import { attemptDeadline } from "./attemptTiming";
import { AuditAction, logAudit } from "./audit";

const SYSTEM_ACTOR = {
  id: "system",
  email: "system@auto-release",
};

export function resultsAutoReleaseAt(availableUntil: Date): Date {
  // Students see results at the exam end time that was set — not before.
  return new Date(availableUntil.getTime());
}

/** True only after the scheduled end time (when one was set) and results are released. */
export function studentCanViewResults(
  test: { resultsPublished: boolean; availableUntil: Date | null },
  now: Date = new Date()
): boolean {
  if (!test.resultsPublished) return false;
  if (test.availableUntil && now.getTime() < test.availableUntil.getTime()) {
    return false;
  }
  return true;
}

/**
 * Publish results when the exam end time that was set has passed.
 * Open-ended tests (no end time) still wait RESULTS_AUTO_RELEASE_MINUTES after the last attempt finishes.
 */
export async function ensureResultsAutoReleased(
  now: Date = new Date()
): Promise<number> {
  const scheduled = await prisma.test.findMany({
    where: {
      isPublished: true,
      resultsPublished: false,
      availableUntil: { not: null, lte: now },
    },
    select: { id: true, title: true },
  });

  const openEnded = await prisma.test.findMany({
    where: {
      isPublished: true,
      resultsPublished: false,
      availableUntil: null,
    },
    select: {
      id: true,
      title: true,
      durationMin: true,
      attempts: {
        select: { submittedAt: true, startedAt: true },
      },
    },
  });

  const due: { id: string; title: string }[] = [...scheduled];

  for (const t of openEnded) {
    if (t.attempts.length === 0) continue;
    let latestEndMs = 0;
    let anyStillActive = false;
    for (const a of t.attempts) {
      if (!a.submittedAt) {
        const deadline = attemptDeadline(a.startedAt, t.durationMin);
        if (now.getTime() < deadline.getTime()) {
          anyStillActive = true;
          break;
        }
        latestEndMs = Math.max(latestEndMs, deadline.getTime());
      } else {
        latestEndMs = Math.max(latestEndMs, a.submittedAt.getTime());
      }
    }
    if (anyStillActive) continue;
    if (now.getTime() >= latestEndMs + RESULTS_AUTO_RELEASE_MINUTES * 60 * 1000) {
      due.push({ id: t.id, title: t.title });
    }
  }

  if (due.length === 0) return 0;

  const ids = [...new Set(due.map((d) => d.id))];
  await prisma.test.updateMany({
    where: { id: { in: ids }, resultsPublished: false },
    data: { resultsPublished: true, resultsPublishedAt: now },
  });

  await logAudit({
    actorId: SYSTEM_ACTOR.id,
    actorEmail: SYSTEM_ACTOR.email,
    actorRole: "SYSTEM",
    action: AuditAction.RESULT_RELEASED,
    targetType: "Test",
    success: true,
    meta: {
      count: ids.length,
      testIds: ids,
      minutesAfterEnd: RESULTS_AUTO_RELEASE_MINUTES,
      auto: true,
    },
  });

  return ids.length;
}

export function startResultsAutoReleaseScheduler(intervalMs = 60_000): NodeJS.Timeout {
  void ensureResultsAutoReleased().catch((e) =>
    console.error("[auto-release]", e)
  );
  return setInterval(() => {
    void ensureResultsAutoReleased().catch((e) =>
      console.error("[auto-release]", e)
    );
  }, intervalMs);
}
