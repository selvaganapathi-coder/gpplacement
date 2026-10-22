/**
 * Generic question bank + category APIs (domain-agnostic).
 */
import type { Express, Request, Response } from "express";
import { Program, QuestionItemStatus, QuestionType, Role } from "@prisma/client";
import { AuditAction, logAudit } from "./audit";
import {
  bankQualityReport,
  csvEscape,
  smartPickFromBank,
  type BlueprintRule,
} from "./bankAdvanced";
import { requireAuth, requireRole, type JwtUser } from "./middleware/auth";
import { parseProgram } from "./academic";
import { prisma } from "./prisma";
import { roleHasPermission, type PermissionCode } from "./permissions";
import {
  IMPORT_LIMITS,
  validateImportQuestions,
} from "./questionImportValidation";
import { sensitiveOpLimiter } from "./rateLimit";

const MPHARM_SPECS = [
  "Pharmaceutics",
  "Pharmacology",
  "Pharmaceutical Chemistry",
  "Pharmacognosy",
  "Pharmaceutical Analysis",
  "Quality Assurance",
  "Industrial Pharmacy",
  "Other Specialization",
] as const;

async function assertBankEditable(
  bankId: string,
  auth: JwtUser,
  res: Response
): Promise<{ id: string; frozenAt: Date | null; status: string } | null> {
  const bank = await prisma.questionBank.findUnique({
    where: { id: bankId },
    select: { id: true, frozenAt: true, status: true },
  });
  if (!bank) {
    res.status(404).json({ error: "Bank not found." });
    return null;
  }
  if (bank.status === "ARCHIVED") {
    res.status(400).json({ error: "Bank is archived. Restore it before editing." });
    return null;
  }
  if (
    bank.frozenAt &&
    auth.role !== Role.ADMIN &&
    auth.role !== Role.SUPER_ADMIN
  ) {
    res.status(403).json({
      error: "This bank is frozen. Only admin can edit a frozen version.",
    });
    return null;
  }
  return bank;
}

async function requirePerm(
  auth: JwtUser,
  code: PermissionCode,
  res: Response
): Promise<boolean> {
  const ok = await roleHasPermission(auth.role, code);
  if (!ok) {
    res.status(403).json({ error: "You do not have permission for this action." });
    return false;
  }
  return true;
}

function parseQuestionType(raw: unknown): QuestionType {
  const u = String(raw ?? "SINGLE_MCQ")
    .trim()
    .toUpperCase();
  if ((Object.values(QuestionType) as string[]).includes(u)) {
    return u as QuestionType;
  }
  return QuestionType.SINGLE_MCQ;
}

export function registerQuestionBankRoutes(app: Express) {
  // ── Categories ──────────────────────────────────────────────
  app.get(
    "/api/categories",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (_req, res) => {
      const categories = await prisma.questionCategory.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { bankQuestions: true, questions: true } } },
      });
      res.json({ categories });
    }
  );

  app.post(
    "/api/categories",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "CATEGORY_MANAGE", res))) return;
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "Category name is required." });
      const parentId = req.body?.parentId ? String(req.body.parentId) : null;
      try {
        const category = await prisma.questionCategory.create({
          data: {
            name,
            description: req.body?.description
              ? String(req.body.description).trim()
              : null,
            parentId,
            sortOrder: Number(req.body?.sortOrder) || 0,
          },
        });
        await logAudit({
          actorId: auth.sub,
          actorEmail: auth.email,
          action: "CATEGORY_CREATED",
          entityType: "QuestionCategory",
          entityId: category.id,
          meta: { name },
        });
        res.status(201).json({ category });
      } catch {
        res.status(400).json({ error: "Could not create category (name may already exist)." });
      }
    }
  );

  app.patch(
    "/api/categories/:id",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "CATEGORY_MANAGE", res))) return;
      const data: {
        name?: string;
        description?: string | null;
        active?: boolean;
        sortOrder?: number;
        parentId?: string | null;
      } = {};
      if (req.body?.name != null) data.name = String(req.body.name).trim();
      if (req.body?.description !== undefined) {
        data.description = req.body.description
          ? String(req.body.description).trim()
          : null;
      }
      if (req.body?.active != null) data.active = !!req.body.active;
      if (req.body?.sortOrder != null) data.sortOrder = Number(req.body.sortOrder) || 0;
      if (req.body?.parentId !== undefined) {
        data.parentId = req.body.parentId ? String(req.body.parentId) : null;
      }
      try {
        const category = await prisma.questionCategory.update({
          where: { id: req.params.id },
          data,
        });
        res.json({ category });
      } catch {
        res.status(404).json({ error: "Category not found." });
      }
    }
  );

  // ── Question banks ──────────────────────────────────────────
  app.get(
    "/api/question-banks",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const status = String(req.query.status ?? "").trim().toUpperCase();
      const specialization = String(req.query.specialization ?? "").trim();
      const banks = await prisma.questionBank.findMany({
        where: {
          ...(status === "ARCHIVED" || status === "ACTIVE"
            ? { status }
            : status === "ALL"
              ? {}
              : { status: "ACTIVE" }),
          ...(specialization
            ? { specialization: { contains: specialization } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { questions: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });
      res.json({ banks, specializations: MPHARM_SPECS });
    }
  );

  app.post(
    "/api/question-banks",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "Bank name is required." });
      let program: Program | null = null;
      if (req.body?.program) {
        program = parseProgram(String(req.body.program));
      }
      const specialization = req.body?.specialization
        ? String(req.body.specialization).trim()
        : null;
      const bank = await prisma.questionBank.create({
        data: {
          name,
          description: req.body?.description
            ? String(req.body.description).trim()
            : null,
          program,
          specialization,
          createdById: auth.sub,
        },
      });
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "QUESTION_BANK_CREATED",
        entityType: "QuestionBank",
        entityId: bank.id,
        meta: { name },
      });
      res.status(201).json({ bank });
    }
  );

  app.patch(
    "/api/question-banks/:id",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const existing = await prisma.questionBank.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Bank not found." });

      const data: {
        name?: string;
        description?: string | null;
        status?: string;
        program?: Program | null;
        specialization?: string | null;
        frozenAt?: Date | null;
        version?: number;
      } = {};

      if (req.body?.name != null) data.name = String(req.body.name).trim();
      if (req.body?.description !== undefined) {
        data.description = req.body.description
          ? String(req.body.description).trim()
          : null;
      }
      if (req.body?.status != null) {
        const s = String(req.body.status).toUpperCase();
        if (s === "ACTIVE" || s === "ARCHIVED") data.status = s;
      }
      if (req.body?.program !== undefined) {
        data.program = req.body.program
          ? parseProgram(String(req.body.program))
          : null;
      }
      if (req.body?.specialization !== undefined) {
        data.specialization = req.body.specialization
          ? String(req.body.specialization).trim()
          : null;
      }
      if (req.body?.frozen === true) {
        data.frozenAt = existing.frozenAt ?? new Date();
        data.version = existing.version;
      }
      if (req.body?.frozen === false) {
        if (auth.role !== Role.ADMIN && auth.role !== Role.SUPER_ADMIN) {
          return res.status(403).json({ error: "Only admin can unfreeze a bank." });
        }
        data.frozenAt = null;
      }
      if (req.body?.bumpVersion === true) {
        data.version = existing.version + 1;
        data.frozenAt = new Date();
      }

      const bank = await prisma.questionBank.update({
        where: { id: existing.id },
        data,
      });
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "QUESTION_BANK_UPDATED",
        entityType: "QuestionBank",
        entityId: bank.id,
        meta: data,
      });
      res.json({ bank });
    }
  );

  app.post(
    "/api/question-banks/:id/clone",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const source = await prisma.questionBank.findUnique({
        where: { id: req.params.id },
        include: {
          questions: { include: { options: true } },
        },
      });
      if (!source) return res.status(404).json({ error: "Bank not found." });

      const name =
        String(req.body?.name ?? "").trim() ||
        `${source.name} (v${source.version + 1})`;
      const freezeSource = !!req.body?.freezeSource;

      const clone = await prisma.$transaction(async (tx) => {
        if (freezeSource && !source.frozenAt) {
          await tx.questionBank.update({
            where: { id: source.id },
            data: { frozenAt: new Date() },
          });
        }
        const created = await tx.questionBank.create({
          data: {
            name,
            description: source.description,
            program: source.program,
            specialization: source.specialization,
            status: "ACTIVE",
            version: source.version + 1,
            parentBankId: source.id,
            createdById: auth.sub,
          },
        });
        for (const q of source.questions) {
          await tx.bankQuestion.create({
            data: {
              bankId: created.id,
              prompt: q.prompt,
              questionType: q.questionType,
              categoryId: q.categoryId,
              subCategory: q.subCategory,
              difficulty: q.difficulty,
              marks: q.marks,
              negativeMarks: q.negativeMarks,
              explanation: q.explanation,
              tags: q.tags,
              status: q.status,
              caseBlockId: q.caseBlockId,
              caseStem: q.caseStem,
              createdById: auth.sub,
              options: {
                create: q.options.map((o) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                })),
              },
            },
          });
        }
        return created;
      });

      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "QUESTION_BANK_CLONED",
        entityType: "QuestionBank",
        entityId: clone.id,
        meta: { sourceId: source.id, questions: source.questions.length },
      });
      res.status(201).json({ bank: clone });
    }
  );

  app.post(
    "/api/question-banks/:id/merge",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const target = await assertBankEditable(req.params.id, auth, res);
      if (!target) return;

      const sourceIds: string[] = Array.isArray(req.body?.sourceBankIds)
        ? req.body.sourceBankIds.map(String)
        : [];
      if (sourceIds.length === 0) {
        return res.status(400).json({ error: "sourceBankIds required." });
      }

      const existingPrompts = new Set(
        (
          await prisma.bankQuestion.findMany({
            where: { bankId: target.id },
            select: { prompt: true },
          })
        ).map((q) => q.prompt.trim().toLowerCase())
      );

      let added = 0;
      let skipped = 0;
      for (const sid of sourceIds) {
        if (sid === target.id) continue;
        const qs = await prisma.bankQuestion.findMany({
          where: { bankId: sid, status: QuestionItemStatus.ACTIVE },
          include: { options: true },
        });
        for (const q of qs) {
          const key = q.prompt.trim().toLowerCase();
          if (existingPrompts.has(key)) {
            skipped += 1;
            continue;
          }
          await prisma.bankQuestion.create({
            data: {
              bankId: target.id,
              prompt: q.prompt,
              questionType: q.questionType,
              categoryId: q.categoryId,
              subCategory: q.subCategory,
              difficulty: q.difficulty,
              marks: q.marks,
              negativeMarks: q.negativeMarks,
              explanation: q.explanation,
              tags: q.tags,
              status: QuestionItemStatus.ACTIVE,
              caseBlockId: q.caseBlockId,
              caseStem: q.caseStem,
              createdById: auth.sub,
              options: {
                create: q.options.map((o) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                })),
              },
            },
          });
          existingPrompts.add(key);
          added += 1;
        }
      }

      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "QUESTION_BANK_MERGED",
        entityType: "QuestionBank",
        entityId: target.id,
        meta: { sourceIds, added, skipped },
      });
      res.json({ ok: true, added, skipped });
    }
  );

  app.get(
    "/api/question-banks/:id",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (req, res) => {
      const bank = await prisma.questionBank.findUnique({
        where: { id: req.params.id },
        include: {
          questions: {
            orderBy: { createdAt: "desc" },
            include: {
              options: true,
              category: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, name: true } },
        },
      });
      if (!bank) return res.status(404).json({ error: "Bank not found." });
      res.json({ bank });
    }
  );

  app.post(
    "/api/question-banks/:id/questions",
    sensitiveOpLimiter,
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_CREATE", res))) return;
      const bank = await assertBankEditable(req.params.id, auth, res);
      if (!bank) return;

      const items = Array.isArray(req.body?.questions)
        ? req.body.questions
        : [req.body];
      const validated = validateImportQuestions(items);
      if (!validated.ok) {
        return res.status(400).json({
          error: validated.error,
          code: validated.code,
        });
      }

      const allCategories = await prisma.questionCategory.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      function resolveCategoryId(
        categoryIdRaw: unknown,
        categoryNameRaw: unknown
      ): string | null {
        if (categoryIdRaw) {
          const id = String(categoryIdRaw);
          if (allCategories.some((c) => c.id === id)) return id;
        }
        const name = String(categoryNameRaw ?? "")
          .trim()
          .toLowerCase();
        if (!name) return null;
        const exact = allCategories.find((c) => c.name.toLowerCase() === name);
        if (exact) return exact.id;
        const partial = allCategories.find(
          (c) =>
            c.name.toLowerCase().includes(name) ||
            name.includes(c.name.toLowerCase())
        );
        return partial?.id ?? null;
      }

      const created = [];
      for (let i = 0; i < validated.questions.length; i++) {
        const item = validated.questions[i]!;
        const raw = items[i] as Record<string, unknown>;
        const categoryId = resolveCategoryId(raw?.categoryId, item.category ?? raw?.category);

        const caseBlockId = raw?.caseBlockId
          ? String(raw.caseBlockId).trim().slice(0, 80)
          : null;
        const caseStem = raw?.caseStem
          ? String(raw.caseStem).trim().slice(0, IMPORT_LIMITS.maxPromptLength)
          : null;

        const q = await prisma.bankQuestion.create({
          data: {
            bankId: bank.id,
            prompt: item.prompt,
            questionType: parseQuestionType(
              caseStem || caseBlockId ? "CASE_BASED" : raw?.questionType
            ),
            categoryId,
            subCategory: raw?.subCategory
              ? String(raw.subCategory).trim().slice(0, IMPORT_LIMITS.maxTopicLength)
              : item.topic,
            difficulty: item.difficulty,
            marks: item.marks ?? 1,
            negativeMarks: item.negativeMarks ?? 0,
            explanation: item.explanation,
            tags: item.tags,
            caseBlockId,
            caseStem,
            status: QuestionItemStatus.ACTIVE,
            createdById: auth.sub,
            options: {
              create: item.options.map((text, oi) => ({
                text,
                isCorrect: oi === item.correctIndex,
              })),
            },
          },
          include: {
            options: true,
            category: { select: { id: true, name: true } },
          },
        });
        created.push(q);
      }

      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.QUESTION_IMPORTED,
        targetType: "QuestionBank",
        targetId: bank.id,
        success: true,
        req,
        meta: { added: created.length },
      });
      res.status(201).json({ ok: true, count: created.length, questions: created });
    }
  );

  app.patch(
    "/api/question-banks/:id/questions/:qid",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_CREATE", res))) return;
      if (!(await assertBankEditable(req.params.id, auth, res))) return;

      const existing = await prisma.bankQuestion.findFirst({
        where: { id: req.params.qid, bankId: req.params.id },
        include: { options: true },
      });
      if (!existing) return res.status(404).json({ error: "Question not found." });

      const data: Record<string, unknown> = {};
      if (req.body?.prompt != null) data.prompt = String(req.body.prompt).trim();
      if (req.body?.categoryId !== undefined) {
        data.categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
      }
      if (req.body?.subCategory !== undefined || req.body?.topic !== undefined) {
        data.subCategory = req.body.subCategory
          ? String(req.body.subCategory).trim()
          : req.body.topic
            ? String(req.body.topic).trim()
            : null;
      }
      if (req.body?.difficulty !== undefined) {
        const d = String(req.body.difficulty ?? "")
          .trim()
          .toUpperCase();
        data.difficulty =
          d === "EASY" || d === "MEDIUM" || d === "HARD" ? d : null;
      }
      if (req.body?.marks != null && Number(req.body.marks) > 0) {
        data.marks = Number(req.body.marks);
      }
      if (req.body?.negativeMarks != null) {
        data.negativeMarks = Math.max(0, Number(req.body.negativeMarks) || 0);
      }
      if (req.body?.explanation !== undefined) {
        data.explanation = req.body.explanation
          ? String(req.body.explanation).trim()
          : null;
      }
      if (req.body?.tags !== undefined) {
        data.tags = req.body.tags
          ? Array.isArray(req.body.tags)
            ? req.body.tags.map(String).join(",")
            : String(req.body.tags)
          : null;
      }
      if (req.body?.status != null) {
        const s = String(req.body.status).toUpperCase();
        if ((Object.values(QuestionItemStatus) as string[]).includes(s)) {
          data.status = s as QuestionItemStatus;
        }
      }
      if (req.body?.caseBlockId !== undefined) {
        data.caseBlockId = req.body.caseBlockId
          ? String(req.body.caseBlockId).trim()
          : null;
      }
      if (req.body?.caseStem !== undefined) {
        data.caseStem = req.body.caseStem
          ? String(req.body.caseStem).trim()
          : null;
      }

      const options: string[] | null = Array.isArray(req.body?.options)
        ? req.body.options.map((o: unknown) => String(o).trim()).filter(Boolean)
        : null;
      const correctIndex =
        req.body?.correctIndex != null ? Number(req.body.correctIndex) : null;

      const question = await prisma.$transaction(async (tx) => {
        const updated = await tx.bankQuestion.update({
          where: { id: existing.id },
          data,
        });
        if (options && options.length >= 2) {
          await tx.bankOption.deleteMany({ where: { questionId: existing.id } });
          await tx.bankOption.createMany({
            data: options.map((text, i) => ({
              questionId: existing.id,
              text,
              isCorrect: i === (correctIndex ?? 0),
            })),
          });
        }
        return tx.bankQuestion.findUnique({
          where: { id: updated.id },
          include: {
            options: true,
            category: { select: { id: true, name: true } },
          },
        });
      });

      res.json({ question });
    }
  );

  app.delete(
    "/api/question-banks/:id/questions/:qid",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_CREATE", res))) return;
      if (!(await assertBankEditable(req.params.id, auth, res))) return;

      const hard = req.query.hard === "1" || req.body?.hard === true;
      const existing = await prisma.bankQuestion.findFirst({
        where: { id: req.params.qid, bankId: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Question not found." });

      if (hard) {
        await prisma.bankQuestion.delete({ where: { id: existing.id } });
      } else {
        await prisma.bankQuestion.update({
          where: { id: existing.id },
          data: { status: QuestionItemStatus.ARCHIVED },
        });
      }
      res.json({ ok: true, hard });
    }
  );

  app.post(
    "/api/question-banks/:id/questions/bulk",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_CREATE", res))) return;
      if (!(await assertBankEditable(req.params.id, auth, res))) return;

      const ids: string[] = Array.isArray(req.body?.ids)
        ? req.body.ids.map(String)
        : [];
      if (ids.length === 0) {
        return res.status(400).json({ error: "ids required." });
      }
      const patch = req.body?.patch ?? {};
      const data: {
        categoryId?: string | null;
        difficulty?: string | null;
        marks?: number;
        tags?: string | null;
        status?: QuestionItemStatus;
        subCategory?: string | null;
      } = {};
      if (patch.categoryId !== undefined) {
        data.categoryId = patch.categoryId ? String(patch.categoryId) : null;
      }
      if (patch.difficulty !== undefined) {
        const d = String(patch.difficulty ?? "")
          .trim()
          .toUpperCase();
        data.difficulty =
          d === "EASY" || d === "MEDIUM" || d === "HARD" ? d : null;
      }
      if (patch.marks != null && Number(patch.marks) > 0) {
        data.marks = Number(patch.marks);
      }
      if (patch.tags !== undefined) {
        data.tags = patch.tags ? String(patch.tags) : null;
      }
      if (patch.topic !== undefined) {
        data.subCategory = patch.topic ? String(patch.topic) : null;
      }
      if (patch.status != null) {
        const s = String(patch.status).toUpperCase();
        if ((Object.values(QuestionItemStatus) as string[]).includes(s)) {
          data.status = s as QuestionItemStatus;
        }
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No patch fields." });
      }

      const result = await prisma.bankQuestion.updateMany({
        where: { bankId: req.params.id, id: { in: ids } },
        data,
      });
      res.json({ ok: true, updated: result.count });
    }
  );

  app.post(
    "/api/question-banks/:id/smart-pick",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "ASSESSMENT_EDIT", res))) return;

      const rulesRaw = Array.isArray(req.body?.rules) ? req.body.rules : [];
      const rules: BlueprintRule[] = rulesRaw.map(
        (r: {
          categoryId?: string;
          categoryName?: string;
          difficulty?: string;
          count?: number;
          specialization?: string;
        }) => ({
          categoryId: r.categoryId ? String(r.categoryId) : undefined,
          categoryName: r.categoryName ? String(r.categoryName) : undefined,
          difficulty: (String(r.difficulty ?? "").toUpperCase() || "") as
            | "EASY"
            | "MEDIUM"
            | "HARD"
            | "",
          count: Number(r.count) || 0,
          specialization: r.specialization
            ? String(r.specialization)
            : undefined,
        })
      );
      if (rules.length === 0 || rules.every((r) => r.count <= 0)) {
        return res.status(400).json({ error: "Provide at least one blueprint rule." });
      }

      try {
        const result = await smartPickFromBank({
          bankId: req.params.id,
          rules,
          excludePrompts: Array.isArray(req.body?.excludePrompts)
            ? req.body.excludePrompts.map(String)
            : [],
          specialization: req.body?.specialization
            ? String(req.body.specialization)
            : null,
        });
        res.json(result);
      } catch (e) {
        res.status(404).json({
          error: e instanceof Error ? e.message : "Smart pick failed.",
        });
      }
    }
  );

  app.get(
    "/api/question-banks/:id/quality",
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (req, res) => {
      try {
        const report = await bankQualityReport(req.params.id);
        res.json({ report });
      } catch (e) {
        res.status(404).json({
          error: e instanceof Error ? e.message : "Quality report failed.",
        });
      }
    }
  );

  app.get(
    "/api/question-banks/:id/export.csv",
    sensitiveOpLimiter,
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.FACULTY, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "QUESTION_BANK_MANAGE", res))) return;
      const bank = await prisma.questionBank.findUnique({
        where: { id: req.params.id },
        include: {
          questions: {
            include: {
              options: true,
              category: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!bank) return res.status(404).json({ error: "Bank not found." });

      const header = [
        "Prompt",
        "OptionA",
        "OptionB",
        "OptionC",
        "OptionD",
        "Correct",
        "Marks",
        "Category",
        "Topic",
        "Difficulty",
        "Tags",
        "Explanation",
        "CaseBlockId",
        "CaseStem",
        "Status",
      ];
      const lines = [header.join(",")];
      for (const q of bank.questions) {
        const opts = q.options;
        const correctIdx = opts.findIndex((o) => o.isCorrect);
        const correctLetter =
          correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : "A";
        lines.push(
          [
            csvEscape(q.prompt),
            csvEscape(opts[0]?.text),
            csvEscape(opts[1]?.text),
            csvEscape(opts[2]?.text),
            csvEscape(opts[3]?.text),
            csvEscape(correctLetter),
            csvEscape(q.marks),
            csvEscape(q.category?.name),
            csvEscape(q.subCategory),
            csvEscape(q.difficulty),
            csvEscape(q.tags),
            csvEscape(q.explanation),
            csvEscape(q.caseBlockId),
            csvEscape(q.caseStem),
            csvEscape(q.status),
          ].join(",")
        );
      }
      const filename = `${bank.name.replace(/[^\w.-]+/g, "_").slice(0, 60)}.csv`;
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.CSV_EXPORTED,
        targetType: "QuestionBank",
        targetId: bank.id,
        success: true,
        req,
        meta: { kind: "question_bank", name: bank.name, rows: bank.questions.length },
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(lines.join("\n"));
    }
  );

  /** Copy bank questions into an assessment's inline question set. */
  app.post(
    "/api/question-banks/:id/import-to-test/:testId",
    sensitiveOpLimiter,
    requireAuth,
    requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "ASSESSMENT_EDIT", res))) return;

      const questionIds: string[] | null = Array.isArray(req.body?.questionIds)
        ? req.body.questionIds.map(String)
        : null;

      let toImport: {
        id: string;
        prompt: string;
        questionType: QuestionType;
        categoryId: string | null;
        subCategory: string | null;
        difficulty: string | null;
        marks: number;
        negativeMarks: number;
        explanation: string | null;
        tags: string | null;
        caseStem: string | null;
        options: { text: string; isCorrect: boolean }[];
      }[] = [];

      if (Array.isArray(req.body?.rules) && req.body.rules.length > 0) {
        const picked = await smartPickFromBank({
          bankId: req.params.id,
          rules: req.body.rules,
          specialization: req.body?.specialization
            ? String(req.body.specialization)
            : null,
        });
        // Re-load full option rows from bank by id
        const ids = picked.questions.map((q) => q.sourceBankQuestionId);
        toImport = await prisma.bankQuestion.findMany({
          where: { id: { in: ids }, bankId: req.params.id },
          include: { options: true },
        });
      } else {
        const bank = await prisma.questionBank.findUnique({
          where: { id: req.params.id },
          include: {
            questions: {
              where: {
                status: QuestionItemStatus.ACTIVE,
                ...(questionIds ? { id: { in: questionIds } } : {}),
              },
              include: { options: true },
            },
          },
        });
        if (!bank) return res.status(404).json({ error: "Bank not found." });
        toImport = bank.questions;
      }

      const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
      if (!test) return res.status(404).json({ error: "Assessment not found." });

      const mode = req.body?.mode === "replace" ? "replace" : "append";
      if (mode === "replace") {
        await prisma.question.deleteMany({ where: { testId: test.id } });
      }

      const existingCount = await prisma.question.count({ where: { testId: test.id } });
      let order = existingCount;
      for (const bq of toImport) {
        order += 1;
        const prompt = bq.caseStem
          ? `${bq.caseStem}\n\n${bq.prompt}`
          : bq.prompt;
        await prisma.question.create({
          data: {
            testId: test.id,
            prompt,
            questionType: bq.questionType,
            categoryId: bq.categoryId,
            topic: bq.subCategory,
            difficulty: bq.difficulty,
            marks: bq.marks,
            negativeMarks: bq.negativeMarks,
            explanation: bq.explanation,
            tags: bq.tags,
            sourceBankQuestionId: bq.id,
            status: QuestionItemStatus.ACTIVE,
            order,
            options: {
              create: bq.options.map((o) => ({
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          },
        });
      }

      await prisma.test.update({
        where: { id: test.id },
        data: { questionBankId: req.params.id },
      });

      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "QUESTION_BANK_IMPORTED_TO_TEST",
        entityType: "Test",
        entityId: test.id,
        meta: { bankId: req.params.id, count: toImport.length, mode },
      });

      res.json({ ok: true, imported: toImport.length });
    }
  );

  // ── College settings (branding) ───────────────────────────────
  app.get("/api/college-settings", async (_req, res) => {
    const settings =
      (await prisma.collegeSettings.findUnique({ where: { id: "default" } })) ??
      (await prisma.collegeSettings.create({
        data: { id: "default" },
      }));
    res.json({ settings });
  });

  app.patch(
    "/api/college-settings",
    requireAuth,
    requireRole(Role.ADMIN, Role.SUPER_ADMIN),
    async (req, res) => {
      const auth = (req as Request & { auth: JwtUser }).auth;
      if (!(await requirePerm(auth, "SYSTEM_SETTINGS", res))) return;
      const data: {
        name?: string;
        shortName?: string;
        tagline?: string;
        emailDomain?: string;
      } = {};
      if (req.body?.name) data.name = String(req.body.name).trim();
      if (req.body?.shortName) data.shortName = String(req.body.shortName).trim();
      if (req.body?.tagline) data.tagline = String(req.body.tagline).trim();
      if (req.body?.emailDomain) {
        data.emailDomain = String(req.body.emailDomain).trim().replace(/^@/, "");
      }
      const settings = await prisma.collegeSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        action: "COLLEGE_SETTINGS_UPDATED",
        entityType: "CollegeSettings",
        entityId: "default",
        meta: data,
      });
      res.json({ settings });
    }
  );
}
