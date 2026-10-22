import type { Express, Request } from "express";
import { Program, Role } from "@prisma/client";
import { logAudit } from "./audit";
import {
  COLLEGE_ACTIVE_PROGRAMS,
  DEFAULT_BATCH_YEARS,
  PROGRAM_CONFIG,
  batchYearOf,
  equivalentLevels,
  isBatchYear,
  parseProgram,
} from "./academic";
import { requireAuth, requireRole, type JwtUser } from "./middleware/auth";
import { prisma } from "./prisma";

const FREE_PROGRAMS: Program[] = [
  Program.ENGINEERING,
  Program.CSE,
  Program.IT,
  Program.SCIENCE,
  Program.ARTS,
  Program.MANAGEMENT,
  Program.COMMERCE,
  Program.OTHER,
];

type ExtraDept = { program: Program; name: string; durationYears: number };

const BUILTIN_DURATION: Partial<Record<Program, number>> = {
  DPHARM: 2,
  BPHARM: 4,
  MPHARM: 2,
  PHARMD: 6,
};

function parseBatchYears(raw: string | null | undefined): number[] {
  const years = String(raw ?? "")
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((n) => isBatchYear(n));
  const set = new Set<number>(years.length ? years : [...DEFAULT_BATCH_YEARS]);
  return [...set].sort((a, b) => a - b);
}

function parseExtras(raw: string | null | undefined): ExtraDept[] {
  try {
    const data = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(data)) return [];
    const out: ExtraDept[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { program?: unknown; name?: unknown; durationYears?: unknown };
      const program = parseProgram(String(rec.program ?? ""));
      const name = String(rec.name ?? "").trim();
      const durationYears = Math.max(1, Math.min(12, Number(rec.durationYears) || 2));
      if (!program || !name) continue;
      out.push({ program, name, durationYears });
    }
    return out;
  } catch {
    return [];
  }
}

async function loadSettings() {
  return (
    (await prisma.collegeSettings.findUnique({ where: { id: "default" } })) ??
    (await prisma.collegeSettings.create({ data: { id: "default" } }))
  );
}

function catalogFrom(settings: { batchYears: string; extraDepartments: string }) {
  const extras = parseExtras(settings.extraDepartments);
  const departments = [
    ...COLLEGE_ACTIVE_PROGRAMS.map((program) => ({
      program,
      name: PROGRAM_CONFIG[program].label.split(" (")[0]!,
      durationYears: BUILTIN_DURATION[program] ?? 4,
      builtin: true as const,
    })),
    ...extras.map((dept) => ({ ...dept, builtin: false as const })),
  ];
  return { batchYears: parseBatchYears(settings.batchYears), departments };
}

export function registerAcademicCatalogRoutes(app: Express): void {
  app.get("/api/academic-catalog", async (_req, res) => {
    const settings = await loadSettings();
    res.json(catalogFrom(settings));
  });

  app.post(
    "/api/admin/academic/batches",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      const year = Number(req.body?.year);
      if (!isBatchYear(year)) {
        return res.status(400).json({ error: "Enter a batch year such as 2028." });
      }
      const settings = await loadSettings();
      const years = parseBatchYears(settings.batchYears);
      if (!years.includes(year)) years.push(year);
      years.sort((a, b) => a - b);
      await prisma.collegeSettings.update({
        where: { id: "default" },
        data: { batchYears: years.join(",") },
      });
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: "CREATE_BATCH",
        targetType: "CollegeSettings",
        targetId: "default",
        success: true,
        req,
        meta: { year },
      });
      res.status(201).json({ batchYears: years });
    }
  );

  app.post(
    "/api/admin/academic/departments",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      const name = String(req.body?.name ?? "").trim();
      const durationYears = Math.max(1, Math.min(12, Number(req.body?.durationYears) || 2));
      if (name.length < 2) {
        return res.status(400).json({ error: "Enter a department name." });
      }
      const settings = await loadSettings();
      const extras = parseExtras(settings.extraDepartments);
      const used = new Set<Program>([
        ...COLLEGE_ACTIVE_PROGRAMS,
        ...extras.map((dept) => dept.program),
      ]);
      const shortNames = new Set(
        [...used].map((program) => PROGRAM_CONFIG[program].label.split(" (")[0]!.toLowerCase())
      );
      if (shortNames.has(name.toLowerCase()) || extras.some((dept) => dept.name.toLowerCase() === name.toLowerCase())) {
        return res.status(400).json({ error: "That department already exists." });
      }
      const program = FREE_PROGRAMS.find((code) => !used.has(code));
      if (!program) {
        return res.status(400).json({ error: "No spare department slot is left." });
      }
      extras.push({ program, name, durationYears });
      await prisma.collegeSettings.update({
        where: { id: "default" },
        data: { extraDepartments: JSON.stringify(extras) },
      });
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: "CREATE_DEPARTMENT",
        targetType: "CollegeSettings",
        targetId: "default",
        success: true,
        req,
        meta: { program, name, durationYears },
      });
      res.status(201).json({
        department: { program, name, durationYears, builtin: false },
        departments: catalogFrom({
          batchYears: settings.batchYears,
          extraDepartments: JSON.stringify(extras),
        }).departments,
      });
    }
  );

  app.get(
    "/api/admin/academic/summary",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF),
    async (req, res) => {
      const program = parseProgram(String(req.query.program ?? ""));
      const year = Number(req.query.year);
      if (!program || !isBatchYear(year)) {
        return res.status(400).json({ error: "Choose a department and a batch year." });
      }
      const [students, attempts, tests] = await Promise.all([
        prisma.user.findMany({
          where: { role: Role.STUDENT, program },
          select: { level: true, isActive: true },
        }),
        prisma.testAttempt.findMany({
          where: {
            submittedAt: { not: null },
            percentage: { not: null },
            user: { role: Role.STUDENT, program },
          },
          select: { percentage: true, user: { select: { level: true } } },
        }),
        prisma.test.count({
          where: { program, level: { in: equivalentLevels(year) } },
        }),
      ]);
      const inBatch = students.filter((student) => batchYearOf(student.level) === year);
      const scored = attempts.filter(
        (attempt) => batchYearOf(attempt.user.level) === year && attempt.percentage != null
      );
      const averagePercent = scored.length
        ? Math.round(
            scored.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / scored.length
          )
        : null;
      res.json({
        program,
        year,
        students: inBatch.length,
        activeStudents: inBatch.filter((student) => student.isActive).length,
        tests,
        submittedAttempts: scored.length,
        averagePercent,
        passedAttempts: scored.filter((attempt) => (attempt.percentage ?? 0) >= 40).length,
      });
    }
  );
}
