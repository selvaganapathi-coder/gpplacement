import { api } from "@/lib/api";

export type SkillCategoryRow = {
  id: string;
  label: string;
  description: string | null;
  weightPct: number;
  sortOrder: number;
  status: string;
  skillsCount?: number;
};

export type SkillSemesterRow = {
  program: string;
  levelType: string;
  level: number;
};

export type SkillRow = {
  id: string;
  categoryId: string;
  categoryLabel?: string;
  name: string;
  description: string | null;
  difficulty: string;
  weight: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  programs: string[];
  semesters: SkillSemesterRow[];
};

export async function fetchSkillCategories() {
  return api<{ categories: SkillCategoryRow[] }>("/api/skills/categories");
}

export async function saveSkillCategory(body: {
  id?: string;
  label: string;
  description?: string | null;
  weightPct?: number;
  sortOrder?: number;
  status?: string;
}) {
  if (body.id) {
    return api<{ category: SkillCategoryRow }>(`/api/skills/categories/${body.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  return api<{ category: SkillCategoryRow }>("/api/skills/categories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchSkills(params: {
  categoryId?: string;
  program?: string;
  semester?: string;
  q?: string;
  status?: string;
}) {
  const q = new URLSearchParams();
  if (params.categoryId) q.set("categoryId", params.categoryId);
  if (params.program) q.set("program", params.program);
  if (params.semester) q.set("semester", params.semester);
  if (params.q) q.set("q", params.q);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return api<{ skills: SkillRow[] }>(`/api/skills${qs ? `?${qs}` : ""}`);
}

export async function createSkill(body: Record<string, unknown>) {
  return api<{ skill: SkillRow }>("/api/skills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateSkill(id: string, body: Record<string, unknown>) {
  return api<{ skill: SkillRow }>(`/api/skills/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function softDeleteSkill(id: string) {
  return api<{ skill: SkillRow }>(`/api/skills/${id}`, { method: "DELETE" });
}

export async function saveSkillPrograms(id: string, programs: string[]) {
  return api<{ skill: SkillRow }>(`/api/skills/${id}/programs`, {
    method: "PUT",
    body: JSON.stringify({ programs }),
  });
}

export async function saveSkillSemesters(id: string, semesters: SkillSemesterRow[]) {
  return api<{ skill: SkillRow }>(`/api/skills/${id}/semesters`, {
    method: "PUT",
    body: JSON.stringify({ semesters }),
  });
}
