import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole, type JwtUser } from "../middleware/auth";
import * as skills from "../skillsService";
import { sendSafeError } from "../errors";

export const skillsRouter = Router();

function sendErr(res: import("express").Response, e: unknown) {
  sendSafeError(res, e, 500, "Server error");
}

skillsRouter.get("/api/skills/categories", requireAuth, async (_req, res) => {
  try {
    await skills.ensureSkillCategories();
    const categories = await skills.listCategories();
    res.json({ categories });
  } catch (e) {
    sendErr(res, e);
  }
});

skillsRouter.post(
  "/api/skills/categories",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    try {
      const label = String(req.body?.label ?? "").trim();
      if (!label) {
        res.status(400).json({ error: "label is required" });
        return;
      }
      const category = await skills.upsertCategory({
        id: typeof req.body?.id === "string" ? req.body.id : undefined,
        label,
        description: req.body?.description ?? null,
        weightPct: req.body?.weightPct != null ? Number(req.body.weightPct) : undefined,
        sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
        status: req.body?.status,
      });
      res.status(201).json({ category });
    } catch (e) {
      sendErr(res, e);
    }
  }
);

skillsRouter.put(
  "/api/skills/categories/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    try {
      const label = String(req.body?.label ?? "").trim();
      if (!label) {
        res.status(400).json({ error: "label is required" });
        return;
      }
      const category = await skills.upsertCategory({
        id: req.params.id,
        label,
        description: req.body?.description ?? null,
        weightPct: req.body?.weightPct != null ? Number(req.body.weightPct) : undefined,
        sortOrder: req.body?.sortOrder != null ? Number(req.body.sortOrder) : undefined,
        status: req.body?.status,
      });
      res.json({ category });
    } catch (e) {
      sendErr(res, e);
    }
  }
);

skillsRouter.get("/api/skills", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const skillsList = await skills.listSkills({
      categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
      program: typeof req.query.program === "string" ? req.query.program : undefined,
      semester: typeof req.query.semester === "string" ? req.query.semester : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.json({ skills: skillsList });
  } catch (e) {
    sendErr(res, e);
  }
});

skillsRouter.post("/api/skills", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    if (!String(req.body?.name ?? "").trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const skill = await skills.createSkill({
      categoryId: String(req.body?.categoryId ?? ""),
      name: String(req.body.name),
      description: req.body?.description,
      difficulty: req.body?.difficulty,
      weight: req.body?.weight != null ? Number(req.body.weight) : undefined,
      status: req.body?.status,
      programs: Array.isArray(req.body?.programs) ? req.body.programs : undefined,
      semesters: Array.isArray(req.body?.semesters) ? req.body.semesters : undefined,
    });
    res.status(201).json({ skill });
  } catch (e) {
    sendErr(res, e);
  }
});

skillsRouter.put("/api/skills/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const skill = await skills.updateSkill(req.params.id, {
      categoryId: req.body?.categoryId,
      name: req.body?.name,
      description: req.body?.description,
      difficulty: req.body?.difficulty,
      weight: req.body?.weight != null ? Number(req.body.weight) : undefined,
      status: req.body?.status,
    });
    res.json({ skill });
  } catch (e) {
    sendErr(res, e);
  }
});

skillsRouter.delete("/api/skills/:id", requireAuth, requireRole(Role.ADMIN), async (req, res) => {
  try {
    const skill = await skills.softDeleteSkill(req.params.id);
    res.json({ skill });
  } catch (e) {
    sendErr(res, e);
  }
});

skillsRouter.put(
  "/api/skills/:id/programs",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    try {
      const programs = Array.isArray(req.body?.programs) ? req.body.programs.map(String) : [];
      const skill = await skills.replaceSkillPrograms(req.params.id, programs);
      res.json({ skill });
    } catch (e) {
      sendErr(res, e);
    }
  }
);

skillsRouter.put(
  "/api/skills/:id/semesters",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    try {
      const semesters = Array.isArray(req.body?.semesters) ? req.body.semesters : [];
      const skill = await skills.replaceSkillSemesters(req.params.id, semesters);
      res.json({ skill });
    } catch (e) {
      sendErr(res, e);
    }
  }
);

skillsRouter.get("/api/career-readiness/me", requireAuth, async (req, res) => {
  try {
    const a = (req as typeof req & { auth: JwtUser }).auth;
    const profile = await skills.getStudentReadiness(a.sub);
    res.json(profile);
  } catch (e) {
    sendErr(res, e);
  }
});
