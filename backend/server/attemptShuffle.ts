/**
 * Secure per-attempt question draw + option shuffle.
 * Supports optional difficulty blueprint. Plan is stored once on TestAttempt.
 */
import { randomBytes } from "crypto";

export type AttemptQuestionPlan = {
  questionIds: string[];
  /** option id order per question id */
  optionIdsByQuestion: Record<string, string[]>;
  /** opaque seed used for this draw (audit / debug) */
  seed: string;
};

export type DifficultyBlueprint = {
  easy?: number;
  medium?: number;
  hard?: number;
  easyPct?: number;
  mediumPct?: number;
  hardPct?: number;
};

type BankQuestion = {
  id: string;
  prompt: string;
  topic?: string | null;
  difficulty?: string | null;
  options: { id: string; text: string }[];
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  if (items.length <= 1) return [...items];
  const out = [...items];
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newPlanSeed(): string {
  return randomBytes(16).toString("hex");
}

export function parseDifficultyBlueprint(
  raw: string | null | undefined
): DifficultyBlueprint | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as DifficultyBlueprint;
    if (typeof j !== "object" || !j) return null;
    return j;
  } catch {
    return null;
  }
}

function normDifficulty(d: string | null | undefined): "EASY" | "MEDIUM" | "HARD" | "OTHER" {
  const u = String(d ?? "")
    .trim()
    .toUpperCase();
  if (u === "EASY") return "EASY";
  if (u === "HARD") return "HARD";
  if (u === "MEDIUM") return "MEDIUM";
  return "OTHER";
}

function resolveCounts(
  total: number,
  blueprint: DifficultyBlueprint | null
): { easy: number; medium: number; hard: number } | null {
  if (!blueprint || total <= 0) return null;
  const hasAbs =
    (blueprint.easy ?? 0) > 0 ||
    (blueprint.medium ?? 0) > 0 ||
    (blueprint.hard ?? 0) > 0;
  if (hasAbs) {
    return {
      easy: Math.max(0, Math.floor(blueprint.easy ?? 0)),
      medium: Math.max(0, Math.floor(blueprint.medium ?? 0)),
      hard: Math.max(0, Math.floor(blueprint.hard ?? 0)),
    };
  }
  const ep = blueprint.easyPct ?? 0;
  const mp = blueprint.mediumPct ?? 0;
  const hp = blueprint.hardPct ?? 0;
  if (ep + mp + hp <= 0) return null;
  const easy = Math.round((ep / 100) * total);
  const medium = Math.round((mp / 100) * total);
  let hard = Math.round((hp / 100) * total);
  const sum = easy + medium + hard;
  if (sum < total) hard += total - sum;
  if (sum > total) {
    const over = sum - total;
    hard = Math.max(0, hard - over);
  }
  return { easy, medium, hard };
}

function takeFromPool<T>(
  pool: T[],
  n: number,
  seed: string,
  tag: string
): { taken: T[]; rest: T[] } {
  if (n <= 0 || pool.length === 0) return { taken: [], rest: pool };
  const shuffled = shuffleWithSeed(pool, `${seed}:${tag}`);
  const take = Math.min(n, shuffled.length);
  return { taken: shuffled.slice(0, take), rest: shuffled.slice(take) };
}

/**
 * Draw questions (optionally by difficulty blueprint), shuffle order & options.
 * Deterministic given seed — call once and persist the plan.
 * `excludeIds` / `excludePrompts` support no-repeat across attempts.
 */
export function buildAttemptPlan(
  bank: BankQuestion[],
  count: number | null | undefined,
  seed: string,
  blueprint?: DifficultyBlueprint | null,
  opts?: { excludeIds?: Iterable<string>; excludePrompts?: Iterable<string> }
): AttemptQuestionPlan {
  const excludeIds = new Set(opts?.excludeIds ?? []);
  const excludePrompts = new Set(
    [...(opts?.excludePrompts ?? [])].map((p) => p.trim().toLowerCase()).filter(Boolean)
  );
  const eligible = bank.filter((q) => {
    if (excludeIds.has(q.id)) return false;
    if (excludePrompts.has(q.prompt.trim().toLowerCase())) return false;
    return true;
  });
  const pool = eligible.length > 0 ? eligible : bank;

  if (pool.length === 0) {
    return { questionIds: [], optionIdsByQuestion: {}, seed };
  }
  const n =
    count == null || !Number.isFinite(count) || count <= 0
      ? pool.length
      : Math.min(Math.floor(count), pool.length);

  const counts = resolveCounts(n, blueprint ?? null);
  let drawn: BankQuestion[] = [];

  if (counts) {
    const easyPool = pool.filter((q) => normDifficulty(q.difficulty) === "EASY");
    const medPool = pool.filter((q) => normDifficulty(q.difficulty) === "MEDIUM");
    const hardPool = pool.filter((q) => normDifficulty(q.difficulty) === "HARD");
    const otherPool = pool.filter((q) => normDifficulty(q.difficulty) === "OTHER");

    const e = takeFromPool(easyPool, counts.easy, seed, "easy");
    const m = takeFromPool(medPool, counts.medium, seed, "med");
    const h = takeFromPool(hardPool, counts.hard, seed, "hard");
    drawn = [...e.taken, ...m.taken, ...h.taken];

    if (drawn.length < n) {
      const leftover = [
        ...e.rest,
        ...m.rest,
        ...h.rest,
        ...otherPool,
      ].filter((q) => !drawn.some((d) => d.id === q.id));
      const fill = takeFromPool(leftover, n - drawn.length, seed, "fill");
      drawn = [...drawn, ...fill.taken];
    }
  } else {
    const shuffledBank = shuffleWithSeed(pool, `${seed}:draw`);
    drawn = shuffledBank.slice(0, n);
  }

  // Deduplicate and cap
  const seen = new Set<string>();
  drawn = drawn.filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  }).slice(0, n);

  const ordered = shuffleWithSeed(drawn, `${seed}:order`);

  const optionIdsByQuestion: Record<string, string[]> = {};
  for (const q of ordered) {
    optionIdsByQuestion[q.id] = shuffleWithSeed(
      q.options.map((o) => o.id),
      `${seed}:opt:${q.id}`
    );
  }

  return {
    questionIds: ordered.map((q) => q.id),
    optionIdsByQuestion,
    seed,
  };
}

export function parseAttemptPlan(raw: string | null | undefined): AttemptQuestionPlan | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as AttemptQuestionPlan;
    if (!Array.isArray(j.questionIds) || typeof j.optionIdsByQuestion !== "object") {
      return null;
    }
    return {
      questionIds: j.questionIds.filter((id) => typeof id === "string"),
      optionIdsByQuestion: j.optionIdsByQuestion ?? {},
      seed: typeof j.seed === "string" ? j.seed : "",
    };
  } catch {
    return null;
  }
}

export function serializeAttemptPlan(plan: AttemptQuestionPlan): string {
  return JSON.stringify(plan);
}

/**
 * Build student-facing payload.
 * Never include isCorrect, correctIndex, explanations, marks, or difficulty.
 */
export function materializePlanForStudent(
  bank: BankQuestion[],
  plan: AttemptQuestionPlan
): { id: string; prompt: string; options: { id: string; text: string }[] }[] {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const out: {
    id: string;
    prompt: string;
    options: { id: string; text: string }[];
  }[] = [];

  for (const qid of plan.questionIds) {
    const q = byId.get(qid);
    if (!q) continue;
    const optById = new Map(q.options.map((o) => [o.id, o.text] as const));
    const order = plan.optionIdsByQuestion[qid] ?? q.options.map((o) => o.id);
    const options: { id: string; text: string }[] = [];
    for (const oid of order) {
      const text = optById.get(oid);
      if (text != null) options.push({ id: oid, text });
    }
    for (const o of q.options) {
      if (!options.some((x) => x.id === o.id)) {
        options.push({ id: o.id, text: o.text });
      }
    }
    out.push({
      id: q.id,
      prompt: q.prompt,
      options,
    });
  }
  return out;
}

/** Defense-in-depth: strip answer keys if a caller accidentally spreads full option rows. */
export function assertNoAnswerKeysInStudentPayload(questions: unknown): void {
  const list = Array.isArray(questions) ? questions : [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const row = q as Record<string, unknown>;
    if ("correctIndex" in row || "isCorrect" in row) {
      throw new Error("Refusing to send answer keys to student client.");
    }
    const opts = row.options;
    if (!Array.isArray(opts)) continue;
    for (const o of opts) {
      if (o && typeof o === "object" && "isCorrect" in (o as object)) {
        throw new Error("Refusing to send option.isCorrect to student client.");
      }
    }
  }
}

export function questionsForStudentAttempt(
  questions: BankQuestion[],
  attemptId: string
): { id: string; prompt: string; options: { id: string; text: string }[] }[] {
  const plan = buildAttemptPlan(questions, null, `${attemptId}:legacy`);
  return materializePlanForStudent(questions, plan);
}

export function questionsInPlan<T extends { id: string }>(
  bank: T[],
  plan: AttemptQuestionPlan | null
): T[] {
  if (!plan) return bank;
  const set = new Set(plan.questionIds);
  const byId = new Map(bank.map((q) => [q.id, q]));
  return plan.questionIds
    .map((id) => byId.get(id))
    .filter((q): q is T => !!q && set.has(q.id));
}
