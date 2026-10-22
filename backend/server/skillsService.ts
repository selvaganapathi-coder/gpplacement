import { LevelType, Program, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  SKILL_CATEGORIES,
  computeWeightedReadiness,
  isSkillCategoryId,
  type SkillCategoryId,
} from "../shared/skillEngine";
import { buildSkillCatalog } from "../shared/skillCatalog";

export async function ensureSkillCategories() {
  for (const c of SKILL_CATEGORIES) {
    await prisma.skillCategory.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        label: c.label,
        description: c.description,
        weightPct: c.weightPct,
        sortOrder: c.sortOrder,
        status: "ACTIVE",
      },
      update: {
        label: c.label,
        description: c.description,
        weightPct: c.weightPct,
        sortOrder: c.sortOrder,
      },
    });
  }
}

export async function seedSkillCatalog(opts?: { force?: boolean }) {
  await ensureSkillCategories();
  const existing = await prisma.skill.count();
  if (existing > 0 && !opts?.force) {
    return { created: 0, skipped: existing };
  }
  if (opts?.force && existing > 0) {
    await prisma.skillSemester.deleteMany();
    await prisma.skillProgram.deleteMany();
    await prisma.skill.deleteMany();
  }

  const catalog = buildSkillCatalog();
  let created = 0;
  for (const row of catalog) {
    const skill = await prisma.skill.create({
      data: {
        categoryId: row.categoryId,
        name: row.name,
        description: row.description ?? null,
        difficulty: row.difficulty,
        weight: row.weight,
        status: "ACTIVE",
        programs: {
          create: row.programs.map((program) => ({ program })),
        },
        semesters: {
          create: row.semesters.map((s) => ({
            program: s.program as Program,
            levelType: s.levelType as LevelType,
            level: s.level,
          })),
        },
      },
    });
    void skill;
    created++;
  }
  return { created, skipped: 0 };
}

/** Demo readiness scores for student@gppharmacy.edu (~76% weighted). */
export async function seedDemoStudentSkillScores(studentId: string) {
  await ensureSkillCategories();
  const demo: Record<SkillCategoryId, number> = {
    APTITUDE: 78,
    REASONING: 72,
    ENGLISH: 80,
    TECHNICAL: 74,
    COMMUNICATION: 76,
    INTERVIEW: 70,
    EMPLOYABILITY: 82,
    DIGITAL: 85,
  };
  for (const [categoryId, percent] of Object.entries(demo)) {
    await prisma.studentSkillScore.upsert({
      where: {
        studentId_categoryId: { studentId, categoryId },
      },
      create: {
        studentId,
        categoryId,
        percent,
        source: "seed-demo",
      },
      update: { percent, source: "seed-demo" },
    });
  }
  return computeWeightedReadiness(demo);
}

export function serializeCategory(c: {
  id: string;
  label: string;
  description: string | null;
  weightPct: number;
  sortOrder: number;
  status: string;
  _count?: { skills: number };
}) {
  return {
    id: c.id,
    label: c.label,
    description: c.description,
    weightPct: c.weightPct,
    sortOrder: c.sortOrder,
    status: c.status,
    skillsCount: c._count?.skills ?? undefined,
  };
}

export function serializeSkill(s: {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  difficulty: string;
  weight: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; label: string };
  programs?: { program: Program }[];
  semesters?: { program: Program; levelType: LevelType; level: number }[];
}) {
  return {
    id: s.id,
    categoryId: s.categoryId,
    categoryLabel: s.category?.label,
    name: s.name,
    description: s.description,
    difficulty: s.difficulty,
    weight: s.weight,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    programs: (s.programs ?? []).map((p) => p.program),
    semesters: (s.semesters ?? []).map((x) => ({
      program: x.program,
      levelType: x.levelType,
      level: x.level,
    })),
  };
}

export async function listCategories() {
  const rows = await prisma.skillCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { skills: true } } },
  });
  return rows.map(serializeCategory);
}

export async function upsertCategory(input: {
  id?: string;
  label: string;
  description?: string | null;
  weightPct?: number;
  sortOrder?: number;
  status?: string;
}) {
  const id =
    input.id?.trim() ||
    input.label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) ||
    `CAT_${Date.now()}`;

  const row = await prisma.skillCategory.upsert({
    where: { id },
    create: {
      id,
      label: input.label.trim(),
      description: input.description?.trim() || null,
      weightPct: input.weightPct ?? 10,
      sortOrder: input.sortOrder ?? 99,
      status: input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    },
    update: {
      label: input.label.trim(),
      description: input.description?.trim() || null,
      ...(input.weightPct != null ? { weightPct: input.weightPct } : {}),
      ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
      ...(input.status ? { status: input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" } : {}),
    },
    include: { _count: { select: { skills: true } } },
  });
  return serializeCategory(row);
}

export async function listSkills(filters: {
  categoryId?: string;
  program?: string;
  semester?: string;
  q?: string;
  status?: string;
}) {
  const and: Prisma.SkillWhereInput[] = [];
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.status === "ACTIVE" || filters.status === "INACTIVE") {
    and.push({ status: filters.status });
  }
  if (filters.q?.trim()) {
    and.push({
      OR: [
        { name: { contains: filters.q.trim() } },
        { description: { contains: filters.q.trim() } },
      ],
    });
  }
  if (filters.program && Object.values(Program).includes(filters.program as Program)) {
    and.push({ programs: { some: { program: filters.program as Program } } });
  }
  if (filters.semester) {
    const m = /^([A-Z]+):(YEAR|SEMESTER):(\d+)$/i.exec(filters.semester.trim());
    if (m) {
      const program = m[1]!.toUpperCase() as Program;
      const levelType = m[2]!.toUpperCase() as LevelType;
      const level = Number(m[3]);
      if (Object.values(Program).includes(program) && Number.isFinite(level)) {
        and.push({
          semesters: { some: { program, levelType, level } },
        });
      }
    }
  }

  const rows = await prisma.skill.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
    include: {
      category: { select: { id: true, label: true } },
      programs: true,
      semesters: true,
    },
  });
  return rows.map(serializeSkill);
}

export async function createSkill(input: {
  categoryId: string;
  name: string;
  description?: string | null;
  difficulty?: string;
  weight?: number;
  status?: string;
  programs?: string[];
  semesters?: { program: string; levelType: string; level: number }[];
}) {
  if (!input.categoryId) throw Object.assign(new Error("categoryId required"), { status: 400 });
  const cat = await prisma.skillCategory.findUnique({ where: { id: input.categoryId } });
  if (!cat) throw Object.assign(new Error("Category not found"), { status: 404 });

  const skill = await prisma.skill.create({
    data: {
      categoryId: input.categoryId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      difficulty: normalizeDifficulty(input.difficulty),
      weight: input.weight != null && Number.isFinite(input.weight) ? Number(input.weight) : 1,
      status: input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      programs: input.programs?.length
        ? {
            create: input.programs
              .filter((p): p is Program => Object.values(Program).includes(p as Program))
              .map((program) => ({ program })),
          }
        : undefined,
      semesters: input.semesters?.length
        ? { create: normalizeSemesters(input.semesters) }
        : undefined,
    },
    include: {
      category: { select: { id: true, label: true } },
      programs: true,
      semesters: true,
    },
  });
  return serializeSkill(skill);
}

export async function updateSkill(
  id: string,
  input: {
    categoryId?: string;
    name?: string;
    description?: string | null;
    difficulty?: string;
    weight?: number;
    status?: string;
  }
) {
  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Skill not found"), { status: 404 });

  if (input.categoryId) {
    const cat = await prisma.skillCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw Object.assign(new Error("Category not found"), { status: 404 });
  }

  const skill = await prisma.skill.update({
    where: { id },
    data: {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.difficulty ? { difficulty: normalizeDifficulty(input.difficulty) } : {}),
      ...(input.weight != null && Number.isFinite(input.weight)
        ? { weight: Number(input.weight) }
        : {}),
      ...(input.status
        ? { status: input.status === "INACTIVE" ? "INACTIVE" : "ACTIVE" }
        : {}),
    },
    include: {
      category: { select: { id: true, label: true } },
      programs: true,
      semesters: true,
    },
  });
  return serializeSkill(skill);
}

/** Soft-delete: set INACTIVE (no hard delete if scores could reference category). */
export async function softDeleteSkill(id: string) {
  return updateSkill(id, { status: "INACTIVE" });
}

export async function replaceSkillPrograms(skillId: string, programs: string[]) {
  const existing = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!existing) throw Object.assign(new Error("Skill not found"), { status: 404 });

  const valid = programs.filter((p): p is Program =>
    Object.values(Program).includes(p as Program)
  );
  await prisma.$transaction([
    prisma.skillProgram.deleteMany({ where: { skillId } }),
    ...(valid.length
      ? [
          prisma.skillProgram.createMany({
            data: valid.map((program) => ({ skillId, program })),
          }),
        ]
      : []),
  ]);
  const skill = await prisma.skill.findUniqueOrThrow({
    where: { id: skillId },
    include: {
      category: { select: { id: true, label: true } },
      programs: true,
      semesters: true,
    },
  });
  return serializeSkill(skill);
}

export async function replaceSkillSemesters(
  skillId: string,
  semesters: { program: string; levelType: string; level: number }[]
) {
  const existing = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!existing) throw Object.assign(new Error("Skill not found"), { status: 404 });

  const rows = normalizeSemesters(semesters);
  await prisma.$transaction([
    prisma.skillSemester.deleteMany({ where: { skillId } }),
    ...(rows.length
      ? [prisma.skillSemester.createMany({ data: rows.map((r) => ({ skillId, ...r })) })]
      : []),
  ]);
  const skill = await prisma.skill.findUniqueOrThrow({
    where: { id: skillId },
    include: {
      category: { select: { id: true, label: true } },
      programs: true,
      semesters: true,
    },
  });
  return serializeSkill(skill);
}

export async function getStudentReadiness(studentId: string) {
  const scores = await prisma.studentSkillScore.findMany({
    where: { studentId },
    include: { category: true },
  });
  const byCat: Partial<Record<SkillCategoryId, number>> = {};
  for (const s of scores) {
    if (isSkillCategoryId(s.categoryId)) byCat[s.categoryId] = s.percent;
  }
  return {
    readinessPct: computeWeightedReadiness(byCat),
    scores: scores.map((s) => ({
      categoryId: s.categoryId,
      label: s.category.label,
      percent: s.percent,
      weightPct: s.category.weightPct,
      source: s.source,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}

function normalizeDifficulty(v?: string) {
  const u = String(v ?? "MEDIUM").toUpperCase();
  if (u === "EASY" || u === "HARD") return u;
  return "MEDIUM";
}

function normalizeSemesters(
  semesters: { program: string; levelType: string; level: number }[]
): { program: Program; levelType: LevelType; level: number }[] {
  const out: { program: Program; levelType: LevelType; level: number }[] = [];
  for (const s of semesters) {
    const program = String(s.program).toUpperCase() as Program;
    const levelType = String(s.levelType).toUpperCase() as LevelType;
    const level = Number(s.level);
    if (!Object.values(Program).includes(program)) continue;
    if (!Object.values(LevelType).includes(levelType)) continue;
    if (!Number.isFinite(level) || level < 1) continue;
    out.push({ program, levelType, level });
  }
  return out;
}
