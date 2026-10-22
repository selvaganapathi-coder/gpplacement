import { useEffect, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

const MASTER_BANK_NAME = "GP Pharmacy - Master Question Bank";

function isMasterBankName(name: string): boolean {
  const n = name.replace(/[\u2013\u2014]/g, "-").trim().toLowerCase();
  return n === MASTER_BANK_NAME.toLowerCase();
}

const FOUNDATION_NAMES = new Set([
  "Aptitude",
  "Logical Reasoning",
  "Verbal Ability",
  "General Knowledge",
]);

const TRACK_ROOTS = ["B.Pharm", "Pharm.D", "M.Pharm"] as const;

type TrackId = "foundation" | "bpharm" | "pharmd" | "mpharm" | "other";

const TRACKS: { id: TrackId; label: string }[] = [
  { id: "foundation", label: "Foundation" },
  { id: "bpharm", label: "B.Pharm" },
  { id: "pharmd", label: "Pharm.D" },
  { id: "mpharm", label: "M.Pharm" },
  { id: "other", label: "Other" },
];

const MPHARM_SPECS = [
  "Pharmaceutics",
  "Pharmacology",
  "Pharmaceutical Chemistry",
  "Pharmacognosy",
  "Pharmaceutical Analysis",
  "Quality Assurance",
  "Industrial Pharmacy",
  "Other Specialization",
];

type Bank = {
  id: string;
  name: string;
  description: string | null;
  program: string | null;
  status: string;
  version?: number;
  frozenAt?: string | null;
  specialization?: string | null;
  _count: { questions: number };
  createdBy: { id: string; name: string };
  updatedAt: string;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder?: number;
  _count: { bankQuestions: number; questions: number };
};

type TreeNode = Category & { children: Category[] };

type QuestionBanksPageProps = {
  role: "staff" | "admin";
};

function itemCount(c: Category) {
  return c._count.bankQuestions + c._count.questions;
}

function trackOf(cat: Category, byId: Map<string, Category>): TrackId {
  const root = cat.parentId ? byId.get(cat.parentId) : cat;
  const rootName = root?.name ?? cat.name;

  if (FOUNDATION_NAMES.has(rootName) || FOUNDATION_NAMES.has(cat.name)) {
    return "foundation";
  }
  if (rootName === "B.Pharm" || cat.name.startsWith("B.Pharm")) return "bpharm";
  if (rootName === "Pharm.D" || cat.name.startsWith("Pharm.D")) return "pharmd";
  if (rootName === "M.Pharm" || cat.name.startsWith("M.Pharm")) return "mpharm";
  return "other";
}

function buildTrackTree(
  categories: Category[],
  track: TrackId
): TreeNode[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const inTrack = categories.filter((c) => trackOf(c, byId) === track);

  if (track === "foundation" || track === "other") {
    return inTrack
      .filter((c) => !c.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, children: [] }));
  }

  const roots = inTrack
    .filter((c) => !c.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  return roots.map((root) => ({
    ...root,
    children: inTrack
      .filter((c) => c.parentId === root.id)
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      ),
  }));
}

export function QuestionBanksPage({ role }: QuestionBanksPageProps) {
  const nav = role === "admin" ? adminSidebarNav : staffSidebarNav;
  const base = role === "admin" ? "/dashboard/admin" : "/dashboard/staff";
  const [banks, setBanks] = useState<Bank[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [bankSpec, setBankSpec] = useState("");
  const [catName, setCatName] = useState("");
  const [catParentId, setCatParentId] = useState("");
  const [track, setTrack] = useState<TrackId>("foundation");
  const [specFilter, setSpecFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  async function reload() {
    const params = new URLSearchParams();
    if (showArchived) params.set("status", "ALL");
    if (specFilter) params.set("specialization", specFilter);
    const qs = params.toString();
    const [b, c] = await Promise.all([
      api<{ banks: Bank[] }>(`/api/question-banks${qs ? `?${qs}` : ""}`),
      api<{ categories: Category[] }>("/api/categories"),
    ]);
    setBanks(b.banks);
    setCategories(c.categories);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load banks.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specFilter, showArchived]);

  const masterBank = useMemo(
    () => banks.find((b) => isMasterBankName(b.name)) ?? null,
    [banks]
  );
  const otherBanks = useMemo(
    () => banks.filter((b) => !isMasterBankName(b.name)),
    [banks]
  );

  const totalQuestions = useMemo(
    () => banks.reduce((sum, b) => sum + b._count.questions, 0),
    [banks]
  );

  const parentOptions = useMemo(
    () =>
      categories.filter(
        (c) => !c.parentId && (TRACK_ROOTS as readonly string[]).includes(c.name)
      ),
    [categories]
  );

  const trackTree = useMemo(
    () => buildTrackTree(categories, track),
    [categories, track]
  );

  const trackCounts = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const counts: Record<TrackId, number> = {
      foundation: 0,
      bpharm: 0,
      pharmd: 0,
      mpharm: 0,
      other: 0,
    };
    for (const c of categories) {
      counts[trackOf(c, byId)] += 1;
    }
    return counts;
  }, [categories]);

  function createBank(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          await api("/api/question-banks", {
            method: "POST",
            body: JSON.stringify({
              name,
              specialization: bankSpec || undefined,
            }),
          });
          setName("");
          setBankSpec("");
          setMessage("Bank created.");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create bank.");
        }
      })();
    });
  }

  function cloneBank(bankId: string) {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{ bank: Bank }>(
            `/api/question-banks/${bankId}/clone`,
            {
              method: "POST",
              body: JSON.stringify({ freezeSource: true }),
            }
          );
          setMessage(`Cloned as “${res.bank.name}”.`);
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Clone failed.");
        }
      })();
    });
  }

  function archiveBank(bankId: string, archive: boolean) {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          await api(`/api/question-banks/${bankId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: archive ? "ARCHIVED" : "ACTIVE" }),
          });
          setMessage(archive ? "Bank archived." : "Bank restored.");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Status update failed.");
        }
      })();
    });
  }

  function mergeBanks(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeTargetId || !mergeSourceId) {
      setError("Choose target and source banks to merge.");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{ added: number; skipped: number }>(
            `/api/question-banks/${mergeTargetId}/merge`,
            {
              method: "POST",
              body: JSON.stringify({ sourceBankIds: [mergeSourceId] }),
            }
          );
          setMessage(`Merged ${res.added} question(s); skipped ${res.skipped} duplicates.`);
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Merge failed.");
        }
      })();
    });
  }

  function createCategory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await api("/api/categories", {
            method: "POST",
            body: JSON.stringify({
              name: catName,
              parentId: catParentId || undefined,
            }),
          });
          setCatName("");
          setCatParentId("");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create category.");
        }
      })();
    });
  }

  return (
    <DashboardShell
      title="Question banks"
      subtitle="Reusable MCQ banks for placement assessments"
      nav={nav}
    >
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-emerald-800">{message}</p> : null}
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <div className="space-y-6">
          <section className="portal-hero portal-hero--light">
            <p className="portal-hero__kicker">Placement · question bank</p>
            <h2 className="portal-hero__title text-slate-900">
              Pharmacy placement banks
            </h2>
            <p className="portal-hero__lede">
              Foundation aptitude through B.Pharm, Pharm.D, and M.Pharm tracks —
              organised for assessment builders.
            </p>
            <div className="portal-stats">
              <div className="portal-stat">
                <p className="portal-stat__label">Banks</p>
                <p className="portal-stat__value">{banks.length}</p>
              </div>
              <div className="portal-stat">
                <p className="portal-stat__label">Questions</p>
                <p className="portal-stat__value">{totalQuestions}</p>
              </div>
              <div className="portal-stat">
                <p className="portal-stat__label">Categories</p>
                <p className="portal-stat__value">{categories.length}</p>
              </div>
              <div className="portal-stat">
                <p className="portal-stat__label">Tracks</p>
                <p className="portal-stat__value">4</p>
              </div>
            </div>
          </section>

          {masterBank ? (
            <section className="qb-bank-featured">
              <div className="qb-bank-featured__body">
                <p className="qb-bank-featured__kicker">Master bank</p>
                <h3 className="qb-bank-featured__title">{masterBank.name}</h3>
                <p className="qb-bank-featured__desc">
                  {masterBank.description ??
                    "Main G.P. Pharmacy placement bank across aptitude, technical, and clinical tracks."}
                </p>
                <p className="qb-bank-featured__meta">
                  {masterBank._count.questions} questions · v{masterBank.version ?? 1}
                  {masterBank.frozenAt ? " · Frozen" : ""} · {masterBank.createdBy.name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 self-start sm:self-center">
                <Link
                  to={`${base}/question-banks/${masterBank.id}`}
                  className="btn-primary qb-bank-featured__cta"
                >
                  Open bank
                </Link>
                <button
                  type="button"
                  className="dir-actions__btn"
                  disabled={pending}
                  onClick={() => cloneBank(masterBank.id)}
                >
                  Clone version
                </button>
              </div>
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel space-y-4 p-5">
              <div className="panel-header flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Banks
                </h2>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={specFilter}
                    onChange={(e) => setSpecFilter(e.target.value)}
                    className="rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs font-semibold"
                    aria-label="M.Pharm specialization filter"
                  >
                    <option value="">All specializations</option>
                    {MPHARM_SPECS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    Show archived
                  </label>
                </div>
              </div>
              <form onSubmit={createBank} className="flex flex-wrap gap-2">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bank name (e.g. B.Pharm Placement Pack 2026)"
                  className="min-w-[12rem] flex-1 rounded-lg border border-brand-200/80 px-3 py-2 text-sm"
                />
                <select
                  value={bankSpec}
                  onChange={(e) => setBankSpec(e.target.value)}
                  className="rounded-lg border border-brand-200/80 px-3 py-2 text-sm"
                >
                  <option value="">No specialization</option>
                  {MPHARM_SPECS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={pending} className="btn-primary">
                  Create bank
                </button>
              </form>

              <form
                onSubmit={mergeBanks}
                className="flex flex-wrap items-end gap-2 rounded-2xl border border-brand-100 bg-brand-50/30 p-3"
              >
                <label className="text-xs font-semibold text-slate-600">
                  Merge into
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="mt-1 block min-w-[10rem] rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">Target bank…</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  From
                  <select
                    value={mergeSourceId}
                    onChange={(e) => setMergeSourceId(e.target.value)}
                    className="mt-1 block min-w-[10rem] rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">Source bank…</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={pending} className="dir-actions__btn">
                  Merge
                </button>
              </form>

              <ul className="divide-y divide-brand-100/80 overflow-hidden rounded-2xl border border-brand-200/60 bg-white">
                {otherBanks.length === 0 && !masterBank ? (
                  <li className="px-4 py-6 text-sm text-slate-500">
                    No banks yet. Create one, then open it to add or import questions.
                  </li>
                ) : otherBanks.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-slate-500">
                    No additional banks. Create a custom pack for a batch or specialty.
                  </li>
                ) : (
                  otherBanks.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {b.name}
                          {b.status === "ARCHIVED" ? (
                            <span className="ml-2 badge-warn">Archived</span>
                          ) : null}
                          {b.frozenAt ? (
                            <span className="ml-2 badge-ok">Frozen</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500">
                          {b._count.questions} questions · v{b.version ?? 1}
                          {b.specialization ? ` · ${b.specialization}` : ""} ·{" "}
                          {b.createdBy.name}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Link
                          to={`${base}/question-banks/${b.id}`}
                          className="dir-actions__btn"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="dir-actions__btn"
                          disabled={pending}
                          onClick={() => cloneBank(b.id)}
                        >
                          Clone
                        </button>
                        <button
                          type="button"
                          className="dir-actions__btn dir-actions__btn--danger"
                          disabled={pending}
                          onClick={() =>
                            archiveBank(b.id, b.status !== "ARCHIVED")
                          }
                        >
                          {b.status === "ARCHIVED" ? "Restore" : "Archive"}
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="panel space-y-4 p-5">
              <div className="panel-header">
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Category taxonomy
                </h2>
              </div>
              <p className="text-sm text-slate-500">
                Browse by program track. Add leaves under B.Pharm, Pharm.D, or M.Pharm
                when needed.
              </p>

              <div className="qb-track-tabs" role="tablist" aria-label="Category tracks">
                {TRACKS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={track === t.id}
                    className={
                      track === t.id
                        ? "qb-track-tabs__btn qb-track-tabs__btn--active"
                        : "qb-track-tabs__btn"
                    }
                    onClick={() => setTrack(t.id)}
                  >
                    {t.label}
                    <span className="qb-track-tabs__count">{trackCounts[t.id]}</span>
                  </button>
                ))}
              </div>

              <ul className="qb-cat-tree">
                {trackTree.length === 0 ? (
                  <li className="qb-cat-tree__empty">No categories in this track.</li>
                ) : (
                  trackTree.map((node) => (
                    <li key={node.id} className="qb-cat-tree__group">
                      <div className="qb-cat-tree__row qb-cat-tree__row--parent">
                        <span className="qb-cat-tree__name">{node.name}</span>
                        <span className="qb-cat-tree__count">{itemCount(node)}</span>
                      </div>
                      {node.children.length > 0 ? (
                        <ul className="qb-cat-tree__children">
                          {node.children.map((child) => (
                            <li key={child.id} className="qb-cat-tree__row">
                              <span className="qb-cat-tree__name">{child.name}</span>
                              <span className="qb-cat-tree__count">
                                {itemCount(child)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>

              <form onSubmit={createCategory} className="qb-cat-form">
                <input
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="New category name"
                  className="min-w-[10rem] flex-1 rounded-lg border border-brand-200/80 px-3 py-2 text-sm"
                />
                <select
                  value={catParentId}
                  onChange={(e) => setCatParentId(e.target.value)}
                  className="rounded-lg border border-brand-200/80 px-3 py-2 text-sm"
                  aria-label="Parent track"
                >
                  <option value="">Root (no parent)</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      Under {p.name}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={pending} className="btn-primary">
                  Add category
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
