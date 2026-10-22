/**
 * Smart-pick, coverage, and quality helpers for question banks.
 */
import { QuestionItemStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { shuffleWithSeed } from "./attemptShuffle";
import { escapeCsvCell } from "./csvSanitize";

export type BlueprintRule = {
  categoryId?: string;
  categoryName?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD" | "";
  count: number;
  specialization?: string;
};

export type PickedQuestion = {
  sourceBankQuestionId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks: number;
  negativeMarks: number;
  explanation: string | null;
  difficulty: string | null;
  topic: string | null;
  tags: string | null;
  categoryId: string | null;
  category: string | null;
  caseBlockId: string | null;
  caseStem: string | null;
};

function normDiff(d: string | null | undefined) {
  const u = String(d ?? "")
    .trim()
    .toUpperCase();
  if (u === "EASY" || u === "MEDIUM" || u === "HARD") return u;
  return "";
}

export async function smartPickFromBank(args: {
  bankId: string;
  rules: BlueprintRule[];
  excludePrompts?: string[];
  specialization?: string | null;
  seed?: string;
}): Promise<{ questions: PickedQuestion[]; shortages: string[] }> {
  const bank = await prisma.questionBank.findUnique({
    where: { id: args.bankId },
    include: {
      questions: {
        where: { status: QuestionItemStatus.ACTIVE },
        include: {
          options: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!bank) throw new Error("Bank not found.");

  const exclude = new Set(
    (args.excludePrompts ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean)
  );
  const used = new Set<string>();
  const picked: PickedQuestion[] = [];
  const shortages: string[] = [];
  const seed = args.seed ?? `pick-${Date.now()}`;

  const allCats = await prisma.questionCategory.findMany({
    select: { id: true, name: true },
  });

  function resolveCategoryIds(rule: BlueprintRule): string[] | null {
    if (rule.categoryId) return [rule.categoryId];
    const name = String(rule.categoryName ?? "")
      .trim()
      .toLowerCase();
    if (!name) return null;
    const matches = allCats.filter(
      (c) =>
        c.name.toLowerCase() === name ||
        c.name.toLowerCase().startsWith(name) ||
        c.name.toLowerCase().includes(name)
    );
    return matches.map((m) => m.id);
  }

  let ruleIndex = 0;
  for (const rule of args.rules) {
    ruleIndex += 1;
    const want = Math.max(0, Math.floor(Number(rule.count) || 0));
    if (want <= 0) continue;

    const catIds = resolveCategoryIds(rule);
    const diff = normDiff(rule.difficulty);
    const spec = (rule.specialization || args.specialization || "").trim().toLowerCase();

    let pool = bank.questions.filter((q) => {
      if (used.has(q.id)) return false;
      if (exclude.has(q.prompt.trim().toLowerCase())) return false;
      if (catIds && q.categoryId && !catIds.includes(q.categoryId)) return false;
      if (catIds && !q.categoryId) return false;
      if (diff && normDiff(q.difficulty) !== diff) return false;
      if (spec) {
        const hay = `${q.tags ?? ""} ${q.subCategory ?? ""} ${q.category?.name ?? ""}`.toLowerCase();
        if (!hay.includes(spec) && !(bank.specialization ?? "").toLowerCase().includes(spec)) {
          return false;
        }
      }
      return true;
    });

    // If category filter too strict, relax to name substring on category
    if (pool.length < want && rule.categoryName) {
      const needle = rule.categoryName.trim().toLowerCase();
      pool = bank.questions.filter((q) => {
        if (used.has(q.id)) return false;
        if (exclude.has(q.prompt.trim().toLowerCase())) return false;
        if (diff && normDiff(q.difficulty) !== diff) return false;
        const cname = (q.category?.name ?? "").toLowerCase();
        return cname.includes(needle) || needle.includes(cname);
      });
    }

    const shuffled = shuffleWithSeed(pool, `${seed}:rule:${ruleIndex}`);
    const take = shuffled.slice(0, want);
    if (take.length < want) {
      shortages.push(
        `Rule ${ruleIndex}: wanted ${want}, got ${take.length}` +
          (rule.categoryName || rule.categoryId
            ? ` (${rule.categoryName || rule.categoryId})`
            : "")
      );
    }

    for (const q of take) {
      used.add(q.id);
      const correctIndex = Math.max(
        0,
        q.options.findIndex((o) => o.isCorrect)
      );
      picked.push({
        sourceBankQuestionId: q.id,
        prompt: q.caseStem
          ? `${q.caseStem}\n\n${q.prompt}`
          : q.prompt,
        options: q.options.map((o) => o.text),
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic: q.subCategory,
        tags: q.tags,
        categoryId: q.categoryId,
        category: q.category?.name ?? null,
        caseBlockId: q.caseBlockId,
        caseStem: q.caseStem,
      });
    }
  }

  return { questions: picked, shortages };
}

export async function bankQualityReport(bankId: string) {
  const bank = await prisma.questionBank.findUnique({
    where: { id: bankId },
    include: {
      questions: {
        include: {
          category: { select: { id: true, name: true, parentId: true } },
        },
      },
    },
  });
  if (!bank) throw new Error("Bank not found.");

  const bankQIds = bank.questions.map((q) => q.id);
  const prompts = bank.questions.map((q) => q.prompt);

  const linked = await prisma.question.findMany({
    where: {
      OR: [
        { sourceBankQuestionId: { in: bankQIds } },
        { prompt: { in: prompts } },
      ],
    },
    select: {
      id: true,
      prompt: true,
      sourceBankQuestionId: true,
      difficulty: true,
      answers: {
        select: {
          optionId: true,
          option: { select: { isCorrect: true } },
        },
      },
    },
  });

  type Agg = {
    attempts: number;
    correct: number;
    bankQuestionId: string;
    prompt: string;
    labeledDifficulty: string | null;
    categoryName: string | null;
  };
  const byBankQ = new Map<string, Agg>();

  for (const bq of bank.questions) {
    byBankQ.set(bq.id, {
      attempts: 0,
      correct: 0,
      bankQuestionId: bq.id,
      prompt: bq.prompt,
      labeledDifficulty: bq.difficulty,
      categoryName: bq.category?.name ?? null,
    });
  }

  for (const tq of linked) {
    const matchId =
      tq.sourceBankQuestionId && byBankQ.has(tq.sourceBankQuestionId)
        ? tq.sourceBankQuestionId
        : bank.questions.find((b) => b.prompt === tq.prompt)?.id;
    if (!matchId) continue;
    const agg = byBankQ.get(matchId);
    if (!agg) continue;
    for (const a of tq.answers) {
      if (!a.optionId) continue;
      agg.attempts += 1;
      if (a.option?.isCorrect) agg.correct += 1;
    }
  }

  const items = [...byBankQ.values()].map((a) => {
    const pct = a.attempts > 0 ? (a.correct / a.attempts) * 100 : null;
    let empirical: "EASY" | "MEDIUM" | "HARD" | null = null;
    if (pct != null) {
      if (pct >= 70) empirical = "EASY";
      else if (pct >= 40) empirical = "MEDIUM";
      else empirical = "HARD";
    }
    const weak =
      a.attempts >= 5 && pct != null && (pct < 35 || pct > 95);
    return {
      ...a,
      correctPct: pct == null ? null : Math.round(pct * 10) / 10,
      empiricalDifficulty: empirical,
      weak,
      weakReason:
        a.attempts >= 5 && pct != null
          ? pct < 35
            ? "Very low correct rate"
            : pct > 95
              ? "Nearly always correct (too easy / leak)"
              : null
          : null,
    };
  });

  const weakItems = items
    .filter((i) => i.weak)
    .sort((a, b) => (a.correctPct ?? 100) - (b.correctPct ?? 100));

  // Coverage by category
  const coverageMap = new Map<
    string,
    { categoryId: string | null; categoryName: string; count: number; withData: number }
  >();
  for (const bq of bank.questions) {
    const key = bq.categoryId ?? "__none__";
    const row = coverageMap.get(key) ?? {
      categoryId: bq.categoryId,
      categoryName: bq.category?.name ?? "Uncategorised",
      count: 0,
      withData: 0,
    };
    row.count += 1;
    const agg = byBankQ.get(bq.id);
    if (agg && agg.attempts > 0) row.withData += 1;
    coverageMap.set(key, row);
  }

  return {
    bankId,
    questionCount: bank.questions.length,
    items,
    weakItems,
    coverage: [...coverageMap.values()].sort((a, b) => b.count - a.count),
    suggestedDifficultyUpdates: items
      .filter(
        (i) =>
          i.empiricalDifficulty &&
          i.labeledDifficulty &&
          i.empiricalDifficulty !== i.labeledDifficulty &&
          i.attempts >= 8
      )
      .map((i) => ({
        bankQuestionId: i.bankQuestionId,
        from: i.labeledDifficulty,
        to: i.empiricalDifficulty,
        correctPct: i.correctPct,
        attempts: i.attempts,
      })),
  };
}

export function csvEscape(v: string | number | null | undefined): string {
  return escapeCsvCell(v);
}
