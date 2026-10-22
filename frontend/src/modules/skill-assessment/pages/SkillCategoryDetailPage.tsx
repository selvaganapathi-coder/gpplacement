import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { adminSidebarNav } from "@/lib/dashboardNav";
import { PROGRAM_CONFIG, type Program } from "@/lib/academic";
import {
  createSkill,
  fetchSkillCategories,
  fetchSkills,
  saveSkillPrograms,
  saveSkillSemesters,
  softDeleteSkill,
  updateSkill,
  type SkillCategoryRow,
  type SkillRow,
  type SkillSemesterRow,
} from "@/modules/skill-assessment/services/skillMasterApi";

const PROGRAMS = Object.keys(PROGRAM_CONFIG) as Program[];

function semesterKey(s: SkillSemesterRow) {
  return `${s.program}:${s.levelType}:${s.level}`;
}

function allSemesterOptions(): SkillSemesterRow[] {
  const out: SkillSemesterRow[] = [];
  for (const program of PROGRAMS) {
    for (const track of PROGRAM_CONFIG[program].tracks) {
      for (const lv of track.levels) {
        out.push({
          program,
          levelType: track.levelType,
          level: lv.value,
        });
      }
    }
  }
  return out;
}

export function SkillCategoryDetailPage() {
  const { categoryId = "" } = useParams<{ categoryId: string }>();
  const [category, setCategory] = useState<SkillCategoryRow | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [program, setProgram] = useState("");
  const [semester, setSemester] = useState("");
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [creating, setCreating] = useState(false);

  const semesterOptions = useMemo(() => allSemesterOptions(), []);

  async function load() {
    setLoading(true);
    try {
      const [cats, list] = await Promise.all([
        fetchSkillCategories(),
        fetchSkills({
          categoryId,
          q: q || undefined,
          status: status || undefined,
          program: program || undefined,
          semester: semester || undefined,
        }),
      ]);
      setCategory(cats.categories.find((c) => c.id === categoryId) ?? null);
      setSkills(list.skills);
      setErr(null);
    } catch {
      setErr("Could not load skills for this category.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, status, program, semester]);

  return (
    <DashboardShell
      title={category?.label ?? "Category skills"}
      subtitle="Add, edit, and map skills to programs and years."
      nav={adminSidebarNav}
    >
      <p className="mb-4 text-sm text-slate-600">
        <Link
          to="/dashboard/admin/skills/master"
          className="font-semibold text-brand-700 hover:underline"
        >
          ← Skill Master
        </Link>
        {category ? (
          <span className="ml-2 text-slate-400">
            {category.id} · weight {category.weightPct}%
          </span>
        ) : null}
      </p>

      {err ? (
        <p className="soft-alert mb-4 border-red-200 bg-red-50 text-red-900">{err}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-sky-200/70 bg-white p-3 shadow-warm-sm">
        <label className="form-label min-w-[10rem] flex-1">
          Search
          <input
            className="form-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Skill name…"
          />
        </label>
        <label className="form-label">
          Status
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="form-label">
          Program
          <select
            className="form-input"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          >
            <option value="">All</option>
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {PROGRAM_CONFIG[p].label.split(" (")[0]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label min-w-[12rem]">
          Year
          <select
            className="form-input"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="">All</option>
            {semesterOptions.map((s) => (
              <option key={semesterKey(s)} value={semesterKey(s)}>
                {s.program} Y{s.level}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Apply
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
        >
          + Add skill
        </button>
      </div>

      {creating || editing ? (
        <SkillEditor
          categoryId={categoryId}
          initial={editing}
          semesterOptions={semesterOptions}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load();
          }}
        />
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading skills…</p> : null}

      {!loading ? (
        <ul className="space-y-2">
          {skills.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 rounded-2xl border border-sky-200/70 bg-white px-4 py-3 shadow-warm-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {s.difficulty} · weight {s.weight} · {s.status}
                  {s.programs.length ? ` · ${s.programs.join(", ")}` : ""}
                  {s.semesters.length
                    ? ` · ${s.semesters
                        .slice(0, 4)
                        .map((x) => `${x.program}${x.levelType === "YEAR" ? "Y" : "S"}${x.level}`)
                        .join(", ")}${s.semesters.length > 4 ? "…" : ""}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setEditing(s);
                    setCreating(false);
                  }}
                >
                  Edit
                </button>
                {s.status === "ACTIVE" ? (
                  <button
                    type="button"
                    className="btn-ghost !min-h-9 !px-3 !py-1.5 text-xs"
                    onClick={() =>
                      void softDeleteSkill(s.id).then(() => load()).catch(() =>
                        setErr("Could not deactivate skill.")
                      )
                    }
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost !min-h-9 !px-3 !py-1.5 text-xs"
                    onClick={() =>
                      void updateSkill(s.id, { status: "ACTIVE" })
                        .then(() => load())
                        .catch(() => setErr("Could not activate skill."))
                    }
                  >
                    Activate
                  </button>
                )}
              </div>
            </li>
          ))}
          {skills.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-sky-200 px-4 py-8 text-center text-sm text-slate-500">
              No skills match these filters.
            </li>
          ) : null}
        </ul>
      ) : null}
    </DashboardShell>
  );
}

function SkillEditor({
  categoryId,
  initial,
  semesterOptions,
  onCancel,
  onSaved,
}: {
  categoryId: string;
  initial: SkillRow | null;
  semesterOptions: SkillSemesterRow[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "MEDIUM");
  const [weight, setWeight] = useState(initial?.weight ?? 1);
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [programs, setPrograms] = useState<string[]>(initial?.programs ?? []);
  const [semesters, setSemesters] = useState<SkillSemesterRow[]>(initial?.semesters ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleProgram(p: string) {
    setPrograms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function toggleSemester(s: SkillSemesterRow) {
    const key = semesterKey(s);
    setSemesters((prev) =>
      prev.some((x) => semesterKey(x) === key)
        ? prev.filter((x) => semesterKey(x) !== key)
        : [...prev, s]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      if (initial) {
        await updateSkill(initial.id, {
          categoryId,
          name: name.trim(),
          description: description.trim() || null,
          difficulty,
          weight,
          status,
        });
        await saveSkillPrograms(initial.id, programs);
        await saveSkillSemesters(initial.id, semesters);
      } else {
        await createSkill({
          categoryId,
          name: name.trim(),
          description: description.trim() || null,
          difficulty,
          weight,
          status,
          programs,
          semesters,
        });
      }
      await onSaved();
    } catch {
      setErr("Could not save skill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mb-6 space-y-3 rounded-2xl border border-brand-200/70 bg-brand-50/30 p-4 shadow-warm"
    >
      <h2 className="font-display text-base font-semibold text-slate-900">
        {initial ? "Edit skill" : "New skill"}
      </h2>
      {err ? <p className="text-sm text-red-700">{err}</p> : null}
      <label className="form-label block">
        Name
        <input
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="form-label block">
        Description
        <textarea
          className="form-input min-h-[4rem]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="form-label">
          Difficulty
          <select
            className="form-input"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label className="form-label">
          Weight
          <input
            type="number"
            step="0.1"
            min={0}
            className="form-input"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </label>
        <label className="form-label">
          Status
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="form-label">Programs</legend>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {PROGRAMS.map((p) => (
            <label key={p} className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={programs.includes(p)}
                onChange={() => toggleProgram(p)}
              />
              {PROGRAM_CONFIG[p].label.split(" (")[0]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="form-label">Years</legend>
        <div className="mt-1.5 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-sky-100 bg-white p-2 sm:grid-cols-3">
          {semesterOptions.map((s) => {
            const key = semesterKey(s);
            const on = semesters.some((x) => semesterKey(x) === key);
            return (
              <label key={key} className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={on} onChange={() => toggleSemester(s)} />
                {s.program} {s.levelType === "YEAR" ? "Y" : "S"}
                {s.level}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save skill"}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
