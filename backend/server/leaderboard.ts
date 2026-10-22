import type { LevelType, Prisma, PrismaClient, Program } from "@prisma/client";
import { Role } from "@prisma/client";
import { formatAcademic } from "./academic";
import { assignRanks } from "./ranking";

export type LeaderboardScope = "overall" | "course" | "year" | "section";

export type LeaderboardFilters = {
  scope: LeaderboardScope;
  program?: Program;
  levelType?: LevelType;
  level?: number;
  section?: string;
  testId?: string;
  take?: number;
};

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  email: string;
  rollNo: string | null;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section: string | null;
  classLabel: string;
  averagePercent: number;
  bestPercent: number;
  scoredTests: number;
  lastSubmittedAt: string | null;
};

export type LeaderboardPayload = {
  scope: LeaderboardScope;
  filters: {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    section: string | null;
    testId: string | null;
  };
  rows: LeaderboardRow[];
  groups: {
    key: string;
    label: string;
    rows: LeaderboardRow[];
  }[];
};

function pct(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 1000) / 10;
}

/**
 * Class / campus leaderboard from published scored attempts.
 * scope=overall → flat ranked list (optionally filtered).
 * course/year/section → grouped ladders.
 */
export async function buildLeaderboard(
  prisma: PrismaClient,
  filters: LeaderboardFilters,
  studentWhere?: Prisma.UserWhereInput
): Promise<LeaderboardPayload> {
  const scope = filters.scope ?? "overall";
  const take = Math.min(200, Math.max(5, filters.take ?? 50));

  const userFilter: Prisma.UserWhereInput = {
    role: Role.STUDENT,
    ...(studentWhere ?? {}),
    ...(filters.program ? { program: filters.program } : {}),
    ...(filters.levelType ? { levelType: filters.levelType } : {}),
    ...(filters.level != null ? { level: filters.level } : {}),
    ...(filters.section ? { section: filters.section } : {}),
  };

  const attempts = await prisma.testAttempt.findMany({
    where: {
      submittedAt: { not: null },
      score: { not: null },
      ...(filters.testId ? { testId: filters.testId } : {}),
      test: {
        isPublished: true,
        resultsPublished: true,
      },
      user: userFilter,
    },
    take: 5000,
    select: {
      score: true,
      percentage: true,
      submittedAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          rollNo: true,
          program: true,
          levelType: true,
          level: true,
          section: true,
        },
      },
      test: { select: { maxScore: true } },
    },
  });

  type Acc = {
    user: (typeof attempts)[0]["user"];
    pctSum: number;
    n: number;
    best: number;
    last: Date | null;
  };
  const byUser = new Map<string, Acc>();

  for (const a of attempts) {
    const max = a.test.maxScore > 0 ? a.test.maxScore : 100;
    const percent =
      a.percentage != null && Number.isFinite(a.percentage)
        ? a.percentage
        : pct(a.score ?? 0, max);
    const row = byUser.get(a.userId) ?? {
      user: a.user,
      pctSum: 0,
      n: 0,
      best: 0,
      last: null,
    };
    row.pctSum += percent;
    row.n += 1;
    row.best = Math.max(row.best, percent);
    if (a.submittedAt && (!row.last || a.submittedAt > row.last)) {
      row.last = a.submittedAt;
    }
    byUser.set(a.userId, row);
  }

  const flat: LeaderboardRow[] = [...byUser.values()]
    .filter((r) => r.n > 0)
    .map((r) => ({
      rank: 0,
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      rollNo: r.user.rollNo,
      program: r.user.program,
      levelType: r.user.levelType,
      level: r.user.level,
      section: r.user.section,
      classLabel: formatAcademic(
        r.user.program,
        r.user.levelType,
        r.user.level,
        r.user.section
      ),
      averagePercent: Math.round((r.pctSum / r.n) * 10) / 10,
      bestPercent: Math.round(r.best * 10) / 10,
      scoredTests: r.n,
      lastSubmittedAt: r.last?.toISOString() ?? null,
    }));

  function rankRows(rows: LeaderboardRow[]): LeaderboardRow[] {
    const sorted = [...rows].sort((a, b) => {
      const d = b.averagePercent - a.averagePercent;
      if (d !== 0) return d;
      return b.bestPercent - a.bestPercent;
    });
    const ranks = assignRanks(
      sorted.map((r) => ({
        id: r.userId,
        score: Math.round(r.averagePercent * 10),
        submittedAt: r.lastSubmittedAt,
      }))
    );
    return sorted.map((r) => ({
      ...r,
      rank: ranks.get(r.userId)?.rank ?? 0,
    }));
  }

  const filtersOut = {
    program: filters.program ?? null,
    levelType: filters.levelType ?? null,
    level: filters.level ?? null,
    section: filters.section ?? null,
    testId: filters.testId ?? null,
  };

  if (scope === "overall") {
    const rows = rankRows(flat).slice(0, take);
    return { scope, filters: filtersOut, rows, groups: [] };
  }

  const groupKey = (r: LeaderboardRow): { key: string; label: string } => {
    if (scope === "course") {
      return {
        key: r.program ?? "NONE",
        label: formatAcademic(r.program, null, null),
      };
    }
    if (scope === "year") {
      return {
        key: `${r.program ?? "NONE"}:${r.levelType ?? ""}:${r.level ?? ""}`,
        label: formatAcademic(r.program, r.levelType, r.level),
      };
    }
    // section
    return {
      key: `${r.program ?? "NONE"}:${r.levelType ?? ""}:${r.level ?? ""}:${r.section ?? "ALL"}`,
      label: formatAcademic(r.program, r.levelType, r.level, r.section),
    };
  };

  const buckets = new Map<string, { label: string; rows: LeaderboardRow[] }>();
  for (const r of flat) {
    const { key, label } = groupKey(r);
    const b = buckets.get(key) ?? { label, rows: [] };
    b.rows.push(r);
    buckets.set(key, b);
  }

  const groups = [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      rows: rankRows(b.rows).slice(0, take),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    scope,
    filters: filtersOut,
    rows: [],
    groups,
  };
}
