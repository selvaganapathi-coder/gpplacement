/** Module 2 — Skill Master + career-readiness category weights (Sprint 5 table). */

export type SkillCategoryId =
  | "APTITUDE"
  | "REASONING"
  | "ENGLISH"
  | "TECHNICAL"
  | "COMMUNICATION"
  | "INTERVIEW"
  | "EMPLOYABILITY"
  | "DIGITAL";

export type SkillDifficulty = "EASY" | "MEDIUM" | "HARD";
export type SkillStatus = "ACTIVE" | "INACTIVE";

export type CategoryDef = {
  id: SkillCategoryId;
  label: string;
  description: string;
  weightPct: number;
  sortOrder: number;
};

/** Sprint 5 default readiness weights (sum = 100). */
export const DEFAULT_CATEGORY_WEIGHTS: Readonly<Record<SkillCategoryId, number>> = {
  APTITUDE: 20,
  TECHNICAL: 25,
  REASONING: 10,
  ENGLISH: 10,
  COMMUNICATION: 10,
  INTERVIEW: 10,
  EMPLOYABILITY: 10,
  DIGITAL: 5,
};

export const SKILL_CATEGORIES: readonly CategoryDef[] = [
  {
    id: "APTITUDE",
    label: "Aptitude",
    description: "Quantitative aptitude for placement.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.APTITUDE,
    sortOrder: 1,
  },
  {
    id: "REASONING",
    label: "Logical Reasoning",
    description: "Logical reasoning and analytical ability.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.REASONING,
    sortOrder: 2,
  },
  {
    id: "ENGLISH",
    label: "English",
    description: "Verbal ability and English communication.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.ENGLISH,
    sortOrder: 3,
  },
  {
    id: "TECHNICAL",
    label: "Pharmacy Technical",
    description: "Core pharmacy technical knowledge.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.TECHNICAL,
    sortOrder: 4,
  },
  {
    id: "COMMUNICATION",
    label: "Communication",
    description: "Speaking, listening, and professional communication.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.COMMUNICATION,
    sortOrder: 5,
  },
  {
    id: "INTERVIEW",
    label: "Interview",
    description: "Interview readiness and professional presence.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.INTERVIEW,
    sortOrder: 6,
  },
  {
    id: "EMPLOYABILITY",
    label: "Employability",
    description: "Workplace behaviour, teamwork, and problem solving.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.EMPLOYABILITY,
    sortOrder: 7,
  },
  {
    id: "DIGITAL",
    label: "Digital",
    description: "MS Office, email, research, and basic data handling.",
    weightPct: DEFAULT_CATEGORY_WEIGHTS.DIGITAL,
    sortOrder: 8,
  },
];

export const WEAK_SKILL_BELOW = 70;
export const STRONG_SKILL_AT = 75;

export function computeWeightedReadiness(
  scoresByCategory: Partial<Record<SkillCategoryId, number>>,
  weights: Partial<Record<SkillCategoryId, number>> = DEFAULT_CATEGORY_WEIGHTS
): number {
  let totalW = 0;
  let acc = 0;
  for (const cat of SKILL_CATEGORIES) {
    const w = weights[cat.id] ?? DEFAULT_CATEGORY_WEIGHTS[cat.id];
    const pct = scoresByCategory[cat.id];
    if (pct == null || !Number.isFinite(pct)) continue;
    totalW += w;
    acc += (Math.max(0, Math.min(100, pct)) * w) / 100;
  }
  if (totalW <= 0) return 0;
  return Math.round((acc / totalW) * 100);
}

export function isSkillCategoryId(v: string): v is SkillCategoryId {
  return SKILL_CATEGORIES.some((c) => c.id === v);
}
