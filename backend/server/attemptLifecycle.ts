/**
 * Start / resume attempts with DB-enforced single active attempt,
 * and helpers for server-owned timer + rejecting client scores.
 */
import type { Prisma, PrismaClient, TestAttempt } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "./prisma";
import {
  computeAttemptEndsAt,
  openAttemptLockKey,
  resolveAttemptEndsAt,
} from "./attemptTiming";

type Db = PrismaClient | Prisma.TransactionClient;

export function rejectClientScoringFields(
  body: unknown
): { forbidden: true; error: string; code: "CLIENT_SCORE_FORBIDDEN" } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const banned = [
    "score",
    "percentage",
    "maxScore",
    "correctCount",
    "isCorrect",
    "correctIndex",
    "marks",
    "passed",
    "pass",
    "rank",
    "resultsPublished",
    "resultStatus",
  ];
  for (const k of banned) {
    if (k in b && b[k] != null) {
      return {
        forbidden: true,
        error:
          "Students may only submit answers. The server calculates and releases results.",
        code: "CLIENT_SCORE_FORBIDDEN",
      };
    }
  }
  return null;
}

/** Result visibility for students: PENDING until staff/auto release. */
export type StudentResultVisibility = "PENDING" | "RELEASED";

export function studentResultVisibility(resultsPublished: boolean): StudentResultVisibility {
  return resultsPublished ? "RELEASED" : "PENDING";
}

async function ensureEndsAt(
  db: Db,
  attempt: {
    id: string;
    startedAt: Date;
    endsAt: Date | null;
  },
  durationMin: number,
  availableUntil: Date | null | undefined
): Promise<Date> {
  const endsAt = resolveAttemptEndsAt(attempt, durationMin, availableUntil);
  if (!attempt.endsAt || attempt.endsAt.getTime() !== endsAt.getTime()) {
    await db.testAttempt.update({
      where: { id: attempt.id },
      data: { endsAt },
    });
  }
  return endsAt;
}

/**
 * Get the single open attempt, or create one under a unique openLock.
 * Prevents double-start races when two tabs hit /session together.
 */
export async function getOrCreateOpenAttempt(opts: {
  userId: string;
  testId: string;
  durationMin: number;
  availableUntil?: Date | null;
  allowRetake: boolean;
  maxAttempts?: number | null;
}): Promise<
  | { ok: true; attempt: TestAttempt; created: boolean }
  | { ok: false; code: "MAX_ATTEMPTS" | "ALREADY_SUBMITTED"; attempt?: TestAttempt }
> {
  const {
    userId,
    testId,
    durationMin,
    availableUntil,
    allowRetake,
    maxAttempts,
  } = opts;
  const lock = openAttemptLockKey(userId, testId);
  const max =
    maxAttempts != null && maxAttempts > 0
      ? Math.min(20, maxAttempts)
      : allowRetake
        ? 20
        : 1;

  try {
    return await prisma.$transaction(async (tx) => {
      const open = await tx.testAttempt.findFirst({
        where: { userId, testId, submittedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (open) {
        await ensureEndsAt(tx, open, durationMin, availableUntil);
        if (!open.openLock) {
          await tx.testAttempt
            .update({
              where: { id: open.id },
              data: { openLock: lock, status: "IN_PROGRESS" },
            })
            .catch(() => undefined);
        }
        const refreshed = await tx.testAttempt.findUniqueOrThrow({
          where: { id: open.id },
        });
        return { ok: true as const, attempt: refreshed, created: false };
      }

      const submitted = await tx.testAttempt.findMany({
        where: { userId, testId, submittedAt: { not: null } },
        orderBy: { startedAt: "desc" },
      });
      if (submitted.length >= max) {
        return {
          ok: false as const,
          code: allowRetake ? ("MAX_ATTEMPTS" as const) : ("ALREADY_SUBMITTED" as const),
          attempt: submitted[0],
        };
      }

      const startedAt = new Date();
      const endsAt = computeAttemptEndsAt(startedAt, durationMin, availableUntil);
      try {
        const created = await tx.testAttempt.create({
          data: {
            userId,
            testId,
            startedAt,
            endsAt,
            status: "IN_PROGRESS",
            openLock: lock,
            attemptNumber: submitted.length + 1,
          },
        });
        return { ok: true as const, attempt: created, created: true };
      } catch (e) {
        if (
          e instanceof PrismaNS.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          const raced = await tx.testAttempt.findFirst({
            where: { userId, testId, submittedAt: null },
            orderBy: { startedAt: "desc" },
          });
          if (raced) {
            await ensureEndsAt(tx, raced, durationMin, availableUntil);
            return { ok: true as const, attempt: raced, created: false };
          }
        }
        throw e;
      }
    });
  } catch (e) {
    // Unique openLock collision outside transaction recovery
    if (
      e instanceof PrismaNS.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const raced = await prisma.testAttempt.findFirst({
        where: { userId, testId, submittedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (raced) {
        await ensureEndsAt(prisma, raced, durationMin, availableUntil);
        return { ok: true, attempt: raced, created: false };
      }
    }
    throw e;
  }
}

export async function clearOpenLockOnSubmit(
  db: Db,
  attemptId: string
): Promise<void> {
  await db.testAttempt.update({
    where: { id: attemptId },
    data: { openLock: null },
  });
}
