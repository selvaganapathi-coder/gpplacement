import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function loadAttemptAnswersMap(
  attemptId: string
): Promise<Record<string, string>> {
  const rows = await prisma.studentAnswer.findMany({
    where: { attemptId },
    select: { questionId: true, optionId: true },
  });
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.optionId) out[r.questionId] = r.optionId;
  }
  return out;
}

export function parseMarkedQuestionIds(
  raw: string | null | undefined
): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function serializeMarkedQuestionIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids.filter(Boolean))]);
}

/**
 * Persist answers in one DB transaction (batched upserts).
 * Callers should pass only changed keys during autosave to cut write load.
 */
export async function saveAttemptAnswers(
  db: Prisma.TransactionClient | typeof prisma,
  attemptId: string,
  answers: Record<string, string>
) {
  const entries = Object.entries(answers).filter(([, optionId]) => !!optionId);
  if (entries.length === 0) return;

  const ops = entries.map(([questionId, optionId]) =>
    db.studentAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      create: { attemptId, questionId, optionId },
      update: { optionId },
    })
  );

  // Nested interactive transactions are unsupported; when already inside a
  // transaction client, run ops sequentially in that client.
  if (db === prisma) {
    await prisma.$transaction(ops);
  } else {
    for (const op of ops) {
      await op;
    }
  }
}

export function mergeAnswerMaps(
  saved: Record<string, string>,
  incoming: Record<string, string>
): Record<string, string> {
  return { ...saved, ...incoming };
}
