import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { adminSidebarNav } from "@/lib/dashboardNav";
import {
  fetchSkillCategories,
  saveSkillCategory,
  type SkillCategoryRow,
} from "@/modules/skill-assessment/services/skillMasterApi";

export function SkillMasterPage() {
  const [categories, setCategories] = useState<SkillCategoryRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [weightPct, setWeightPct] = useState(10);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchSkillCategories();
      setCategories(res.categories);
      setErr(null);
    } catch {
      setErr("Could not load skill categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await saveSkillCategory({
        label: label.trim(),
        description: description.trim() || null,
        weightPct,
        status: "ACTIVE",
      });
      setShowAdd(false);
      setLabel("");
      setDescription("");
      setWeightPct(10);
      await load();
    } catch {
      setErr("Could not create category.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(c: SkillCategoryRow) {
    try {
      await saveSkillCategory({
        id: c.id,
        label: c.label,
        description: c.description,
        weightPct: c.weightPct,
        sortOrder: c.sortOrder,
        status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      });
      await load();
    } catch {
      setErr("Could not update category status.");
    }
  }

  return (
    <DashboardShell
      title="Skill Master"
      subtitle="Manage skill categories and leaf skills for Module 2 placement readiness."
      nav={adminSidebarNav}
    >
      <section className="portal-hero portal-hero--light mb-5">
        <p className="portal-hero__kicker">Module 2 · Skill Master</p>
        <h2 className="portal-hero__title text-slate-900">Skill categories</h2>
        <p className="portal-hero__lede">
          Manage categories and leaf skills for placement readiness. Open a row to edit skills,
          programs, and semesters.
        </p>
        <div className="portal-hero__actions">
          <button type="button" className="btn-primary" onClick={() => setShowAdd((v) => !v)}>
            + Add category
          </button>
          <span className="portal-hero__chip !bg-brand-50 !text-brand-900 !ring-brand-200">
            {categories.length} categories
          </span>
        </div>
      </section>

      {err ? (
        <p className="soft-alert mb-4 border-red-200 bg-red-50 text-red-900">{err}</p>
      ) : null}

      {showAdd ? (
        <form
          onSubmit={(e) => void onAdd(e)}
          className="mb-6 space-y-3 rounded-2xl border border-sky-200/70 bg-white p-4 shadow-warm"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">New category</h2>
          <label className="form-label block">
            Label
            <input
              className="form-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </label>
          <label className="form-label block">
            Description
            <input
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="form-label block max-w-[10rem]">
            Weight %
            <input
              type="number"
              min={0}
              max={100}
              className="form-input"
              value={weightPct}
              onChange={(e) => setWeightPct(Number(e.target.value))}
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading categories…</p> : null}

      {!loading ? (
        <div className="panel">
          <div className="data-table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Category</th>
                <th>Skills</th>
                <th>Weight</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <p className="font-semibold text-slate-900">{c.label}</p>
                    <p className="text-xs text-slate-500">{c.id}</p>
                  </td>
                  <td className="tabular-nums text-slate-700">{c.skillsCount ?? 0}</td>
                  <td className="tabular-nums text-slate-700">{c.weightPct}%</td>
                  <td>
                    <span
                      className={
                        c.status === "ACTIVE"
                          ? "badge-ok"
                          : "rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600"
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <div className="dir-actions">
                      <Link
                        to={`/dashboard/admin/skills/master/${c.id}`}
                        className="dir-actions__btn"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        className="dir-actions__btn"
                        onClick={() => void toggleStatus(c)}
                      >
                        {c.status === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No categories yet. Seed the catalog or add one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
