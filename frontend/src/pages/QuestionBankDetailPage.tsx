import { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useParams } from "react-router-dom";
import { BulkQuestionUpload } from "@/components/BulkQuestionUpload";
import { DashboardShell } from "@/components/DashboardShell";
import { api, downloadCsvFromUrl } from "@/lib/api";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";
import type { QuestionDifficulty, QuestionInput } from "@/types";

type Category = { id: string; name: string; parentId?: string | null };

type BankQuestion = {
  id: string;
  prompt: string;
  difficulty: string | null;
  questionType: string;
  tags: string | null;
  subCategory: string | null;
  marks: number;
  explanation: string | null;
  status: string;
  caseBlockId: string | null;
  caseStem: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
  category: { id: string; name: string } | null;
};

type BankDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  frozenAt: string | null;
  specialization: string | null;
  questions: BankQuestion[];
};

type QualityReport = {
  questionCount: number;
  weakItems: {
    bankQuestionId: string;
    prompt: string;
    correctPct: number | null;
    attempts: number;
    weakReason: string | null;
  }[];
  coverage: {
    categoryId: string | null;
    categoryName: string;
    count: number;
    withData: number;
  }[];
  suggestedDifficultyUpdates: {
    bankQuestionId: string;
    from: string | null;
    to: string | null;
    correctPct: number | null;
    attempts: number;
  }[];
};

type QuestionBankDetailPageProps = {
  role: "staff" | "admin";
};

const DIFFS: QuestionDifficulty[] = ["EASY", "MEDIUM", "HARD"];

export function QuestionBankDetailPage({ role }: QuestionBankDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const nav = role === "admin" ? adminSidebarNav : staffSidebarNav;
  const listHref =
    role === "admin"
      ? "/dashboard/admin/question-banks"
      : "/dashboard/staff/question-banks";
  const [bank, setBank] = useState<BankDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [filterCategory, setFilterCategory] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<BankQuestion | null>(null);
  const [editing, setEditing] = useState<BankQuestion | null>(null);

  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | "">("MEDIUM");
  const [tags, setTags] = useState("");
  const [topic, setTopic] = useState("");
  const [marks, setMarks] = useState(1);
  const [explanation, setExplanation] = useState("");
  const [caseStem, setCaseStem] = useState("");
  const [caseBlockId, setCaseBlockId] = useState("");

  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkDifficulty, setBulkDifficulty] = useState("");
  const [bulkMarks, setBulkMarks] = useState("");
  const [bulkTags, setBulkTags] = useState("");

  async function reload() {
    if (!id) return;
    const [bankRes, catRes] = await Promise.all([
      api<{ bank: BankDetail }>(`/api/question-banks/${id}`),
      api<{ categories: Category[] }>("/api/categories"),
    ]);
    setBank(bankRes.bank);
    setCategories(catRes.categories);
    if (!categoryId && catRes.categories[0]) {
      setCategoryId(catRes.categories[0].id);
    }
    try {
      const q = await api<{ report: QualityReport }>(
        `/api/question-banks/${id}/quality`
      );
      setQuality(q.report);
    } catch {
      setQuality(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load bank.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    if (!bank) return [];
    const tagQ = filterTag.trim().toLowerCase();
    return bank.questions.filter((q) => {
      if (filterStatus && q.status !== filterStatus) return false;
      if (filterCategory && q.category?.id !== filterCategory) return false;
      if (filterDifficulty && (q.difficulty ?? "") !== filterDifficulty) return false;
      if (tagQ) {
        const hay = `${q.tags ?? ""} ${q.subCategory ?? ""} ${q.category?.name ?? ""}`.toLowerCase();
        if (!hay.includes(tagQ)) return false;
      }
      return true;
    });
  }, [bank, filterCategory, filterDifficulty, filterTag, filterStatus]);

  function toggleSelect(qid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((q) => q.id)));
  }

  function onImport(imported: QuestionInput[], _mode: "replace" | "append") {
    if (!id) return;
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          const payload = imported.map((q) => ({
            ...q,
            category: q.category ?? null,
            categoryId: q.categoryId ?? null,
            tags: q.tags ?? null,
            topic: q.topic ?? null,
            explanation: q.explanation ?? null,
          }));
          const res = await api<{ count: number }>(`/api/question-banks/${id}/questions`, {
            method: "POST",
            body: JSON.stringify({ questions: payload }),
          });
          setMessage(`${res.count} question${res.count === 1 ? "" : "s"} added to the bank.`);
          await reload();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Import failed.");
        }
      })();
    });
  }

  function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setMessage(null);
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) {
      setError("Add at least two options.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api(`/api/question-banks/${id}/questions`, {
            method: "POST",
            body: JSON.stringify({
              questions: [
                {
                  prompt: prompt.trim(),
                  options: opts,
                  correctIndex: Math.min(correctIndex, opts.length - 1),
                  marks: marks > 0 ? marks : 1,
                  categoryId: categoryId || null,
                  difficulty: difficulty || null,
                  tags: tags.trim() || null,
                  topic: topic.trim() || null,
                  explanation: explanation.trim() || null,
                  caseStem: caseStem.trim() || null,
                  caseBlockId: caseBlockId.trim() || null,
                },
              ],
            }),
          });
          setPrompt("");
          setOptions(["", "", "", ""]);
          setCorrectIndex(0);
          setTags("");
          setTopic("");
          setMarks(1);
          setExplanation("");
          setCaseStem("");
          setCaseBlockId("");
          setMessage("1 question added.");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not add question.");
        }
      })();
    });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !editing) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const opts = editing.options.map((o) => o.text.trim()).filter(Boolean);
          const correctIndex = Math.max(
            0,
            editing.options.findIndex((o) => o.isCorrect)
          );
          await api(`/api/question-banks/${id}/questions/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              prompt: editing.prompt,
              options: opts,
              correctIndex,
              categoryId: editing.category?.id ?? null,
              difficulty: editing.difficulty,
              marks: editing.marks,
              tags: editing.tags,
              topic: editing.subCategory,
              explanation: editing.explanation,
              caseStem: editing.caseStem,
              caseBlockId: editing.caseBlockId,
              status: editing.status,
            }),
          });
          setEditing(null);
          setMessage("Question updated.");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Update failed.");
        }
      })();
    });
  }

  function archiveQuestion(qid: string) {
    if (!id) return;
    startTransition(() => {
      void (async () => {
        try {
          await api(`/api/question-banks/${id}/questions/${qid}`, {
            method: "DELETE",
          });
          setMessage("Question archived.");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Archive failed.");
        }
      })();
    });
  }

  function runBulk() {
    if (!id || selected.size === 0) return;
    const patch: Record<string, unknown> = {};
    if (bulkCategoryId) patch.categoryId = bulkCategoryId;
    if (bulkDifficulty) patch.difficulty = bulkDifficulty;
    if (bulkMarks) patch.marks = Number(bulkMarks);
    if (bulkTags.trim()) patch.tags = bulkTags.trim();
    if (Object.keys(patch).length === 0) {
      setError("Choose at least one bulk field.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{ updated: number }>(
            `/api/question-banks/${id}/questions/bulk`,
            {
              method: "POST",
              body: JSON.stringify({ ids: [...selected], patch }),
            }
          );
          setMessage(`Updated ${res.updated} question(s).`);
          setSelected(new Set());
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Bulk edit failed.");
        }
      })();
    });
  }

  function applySuggestedDifficulty() {
    if (!id || !quality?.suggestedDifficultyUpdates.length) return;
    startTransition(() => {
      void (async () => {
        try {
          for (const s of quality.suggestedDifficultyUpdates) {
            await api(`/api/question-banks/${id}/questions/${s.bankQuestionId}`, {
              method: "PATCH",
              body: JSON.stringify({ difficulty: s.to }),
            });
          }
          setMessage(
            `Applied empirical difficulty to ${quality.suggestedDifficultyUpdates.length} question(s).`
          );
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not apply difficulty.");
        }
      })();
    });
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-brand-200/80 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
  const frozen = !!bank?.frozenAt;

  return (
    <DashboardShell
      title={bank?.name ?? "Question bank"}
      subtitle={
        bank
          ? `v${bank.version}${frozen ? " · Frozen" : ""}${
              bank.specialization ? ` · ${bank.specialization}` : ""
            } · ${bank.questions.length} questions`
          : "Bank detail"
      }
      nav={nav}
    >
      <p className="mb-4 text-sm">
        <Link to={listHref} className="font-medium text-brand-800 underline">
          ← All banks
        </Link>
      </p>
      {error ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {!bank ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : (
        <div className="space-y-5">
          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              className="dir-actions__btn"
              onClick={() =>
                void downloadCsvFromUrl(
                  `/api/question-banks/${bank.id}/export.csv`,
                  `${bank.name}.csv`
                )
              }
            >
              Export CSV
            </button>
            {frozen ? (
              <span className="badge-warn">Frozen — admin edit only</span>
            ) : (
              <button
                type="button"
                className="dir-actions__btn"
                disabled={pending}
                onClick={() => {
                  startTransition(() => {
                    void (async () => {
                      await api(`/api/question-banks/${bank.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ frozen: true, bumpVersion: true }),
                      });
                      setMessage("Bank frozen as a version snapshot.");
                      await reload();
                    })();
                  });
                }}
              >
                Freeze version
              </button>
            )}
          </section>

          {quality ? (
            <section className="panel space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Quality & coverage
                </h2>
                {quality.suggestedDifficultyUpdates.length > 0 ? (
                  <button
                    type="button"
                    className="dir-actions__btn"
                    disabled={pending || frozen}
                    onClick={applySuggestedDifficulty}
                  >
                    Apply empirical difficulty ({quality.suggestedDifficultyUpdates.length})
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Coverage by category
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                    {quality.coverage.map((c) => (
                      <li
                        key={c.categoryName}
                        className="flex justify-between gap-2 rounded-lg bg-brand-50/40 px-2 py-1.5"
                      >
                        <span className="truncate">{c.categoryName}</span>
                        <span className="tabular-nums text-slate-500">
                          {c.count}
                          {c.withData ? ` · ${c.withData} live` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Weak / flagged items
                  </p>
                  {quality.weakItems.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      No weak items yet (needs ≥5 answered attempts).
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                      {quality.weakItems.slice(0, 8).map((w) => (
                        <li key={w.bankQuestionId} className="rounded-lg bg-amber-50/80 px-2 py-1.5">
                          <p className="line-clamp-1 font-medium text-slate-800">
                            {w.prompt}
                          </p>
                          <p className="text-[11px] text-amber-900">
                            {w.correctPct ?? "—"}% correct · {w.attempts} attempts
                            {w.weakReason ? ` · ${w.weakReason}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel space-y-3 p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Add one question
            </h2>
            {frozen ? (
              <p className="text-sm text-amber-800">
                This bank is frozen. Unfreeze (admin) or clone to edit.
              </p>
            ) : null}
            <form onSubmit={addOne} className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                Case stem (optional — clinical case block)
                <textarea
                  rows={2}
                  value={caseStem}
                  onChange={(e) => setCaseStem(e.target.value)}
                  className={inputClass}
                  placeholder="Shared case narrative…"
                  disabled={frozen}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Case block id
                <input
                  value={caseBlockId}
                  onChange={(e) => setCaseBlockId(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. case-dm-01"
                  disabled={frozen}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                Question
                <textarea
                  required
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className={inputClass}
                  placeholder="Enter the MCQ prompt…"
                  disabled={frozen}
                />
              </label>
              {options.map((opt, i) => (
                <label key={i} className="text-sm font-medium text-slate-700">
                  Option {String.fromCharCode(65 + i)}
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    className={inputClass}
                    required={i < 2}
                    disabled={frozen}
                  />
                </label>
              ))}
              <label className="text-sm font-medium text-slate-700">
                Correct option
                <select
                  value={correctIndex}
                  onChange={(e) => setCorrectIndex(Number(e.target.value))}
                  className={inputClass}
                  disabled={frozen}
                >
                  {options.map((_, i) => (
                    <option key={i} value={i}>
                      {String.fromCharCode(65 + i)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Category
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={inputClass}
                  disabled={frozen}
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Difficulty
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as QuestionDifficulty | "")
                  }
                  className={inputClass}
                  disabled={frozen}
                >
                  <option value="">—</option>
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Topic / sub-category
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={inputClass}
                  disabled={frozen}
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Marks
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={marks}
                  onChange={(e) => setMarks(Number(e.target.value) || 1)}
                  className={inputClass}
                  disabled={frozen}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                Explanation / rationale
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className={inputClass}
                  placeholder="Shown in staff review / post-test feedback"
                  disabled={frozen}
                />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">
                Tags
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className={inputClass}
                  disabled={frozen}
                />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" disabled={pending || frozen} className="btn-primary">
                  {pending ? "Saving…" : "Add question"}
                </button>
              </div>
            </form>
          </section>

          {!frozen ? <BulkQuestionUpload onImport={onImport} /> : null}

          <section className="panel overflow-hidden">
            <div className="panel-header flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Questions
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {filtered.length} of {bank.questions.length}
                  {selected.size ? ` · ${selected.size} selected` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="">All status</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="">All difficulty</option>
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
                <input
                  type="search"
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  placeholder="Filter tags…"
                  className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            {selected.size > 0 && !frozen ? (
              <div className="flex flex-wrap items-end gap-2 border-b border-brand-100 bg-brand-50/40 px-4 py-3">
                <select
                  value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">Move category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={bulkDifficulty}
                  onChange={(e) => setBulkDifficulty(e.target.value)}
                  className="rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">Set difficulty…</option>
                  {DIFFS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  placeholder="Marks"
                  value={bulkMarks}
                  onChange={(e) => setBulkMarks(e.target.value)}
                  className="w-20 rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="Retag…"
                  value={bulkTags}
                  onChange={(e) => setBulkTags(e.target.value)}
                  className="min-w-[8rem] flex-1 rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-xs"
                />
                <button type="button" className="btn-primary" onClick={runBulk}>
                  Apply to selected
                </button>
              </div>
            ) : null}

            <div className="data-table-wrap max-h-[32rem]">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No questions match these filters.
                </p>
              ) : (
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            filtered.length > 0 && selected.size === filtered.length
                          }
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="w-10">#</th>
                      <th>Question</th>
                      <th>Category</th>
                      <th>Difficulty</th>
                      <th>Marks</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((q, i) => (
                      <tr key={q.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(q.id)}
                            onChange={() => toggleSelect(q.id)}
                            aria-label="Select question"
                          />
                        </td>
                        <td className="tabular-nums text-slate-500">{i + 1}</td>
                        <td>
                          <p className="font-medium text-slate-900 line-clamp-2">
                            {q.caseStem ? (
                              <span className="mr-1 text-[10px] font-bold uppercase text-brand-700">
                                Case
                              </span>
                            ) : null}
                            {q.prompt}
                          </p>
                          {q.subCategory ? (
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {q.subCategory}
                            </p>
                          ) : null}
                        </td>
                        <td className="text-xs font-medium text-slate-700">
                          {q.category?.name ?? "—"}
                        </td>
                        <td>
                          {q.difficulty ? (
                            <span
                              className={
                                q.difficulty === "EASY"
                                  ? "badge-ok"
                                  : q.difficulty === "HARD"
                                    ? "badge-danger"
                                    : "badge-warn"
                              }
                            >
                              {q.difficulty}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="tabular-nums text-xs">{q.marks}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="dir-actions__btn"
                              onClick={() => setPreview(q)}
                            >
                              Preview
                            </button>
                            {!frozen ? (
                              <>
                                <button
                                  type="button"
                                  className="dir-actions__btn"
                                  onClick={() => setEditing({ ...q })}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="dir-actions__btn dir-actions__btn--danger"
                                  onClick={() => archiveQuestion(q.id)}
                                >
                                  Archive
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}

      {preview ? (
        <div
          className="people-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="people-modal__panel max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-800">
              Student preview
            </p>
            {preview.caseStem ? (
              <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {preview.caseStem}
              </p>
            ) : null}
            <h3 className="mt-3 font-display text-lg font-semibold text-slate-900">
              {preview.prompt}
            </h3>
            <ul className="mt-3 space-y-2">
              {preview.options.map((o, i) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-brand-100 px-3 py-2 text-sm text-slate-800"
                >
                  <span className="mr-2 font-semibold text-slate-500">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {o.text}
                </li>
              ))}
            </ul>
            {preview.explanation ? (
              <p className="mt-3 text-xs text-slate-500">
                Rationale (hidden during test): {preview.explanation}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div
          className="people-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={saveEdit}
            className="people-modal__panel max-h-[90vh] max-w-lg overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Edit question
            </h3>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Prompt
              <textarea
                required
                rows={3}
                value={editing.prompt}
                onChange={(e) =>
                  setEditing({ ...editing, prompt: e.target.value })
                }
                className={inputClass}
              />
            </label>
            {editing.options.map((o, i) => (
              <label key={o.id} className="mt-2 block text-sm font-medium text-slate-700">
                Option {String.fromCharCode(65 + i)}
                <input
                  value={o.text}
                  onChange={(e) => {
                    const next = editing.options.map((opt, idx) =>
                      idx === i
                        ? { ...opt, text: e.target.value, isCorrect: false }
                        : { ...opt, isCorrect: false }
                    );
                    // keep correct on currently correct index if editing text
                    const ci = editing.options.findIndex((x) => x.isCorrect);
                    if (next[ci]) next[ci] = { ...next[ci]!, isCorrect: true };
                    setEditing({ ...editing, options: next });
                  }}
                  className={inputClass}
                />
              </label>
            ))}
            <label className="mt-2 block text-sm font-medium text-slate-700">
              Correct
              <select
                value={Math.max(
                  0,
                  editing.options.findIndex((o) => o.isCorrect)
                )}
                onChange={(e) => {
                  const ci = Number(e.target.value);
                  setEditing({
                    ...editing,
                    options: editing.options.map((o, i) => ({
                      ...o,
                      isCorrect: i === ci,
                    })),
                  });
                }}
                className={inputClass}
              >
                {editing.options.map((_, i) => (
                  <option key={i} value={i}>
                    {String.fromCharCode(65 + i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block text-sm font-medium text-slate-700">
              Explanation
              <textarea
                rows={2}
                value={editing.explanation ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, explanation: e.target.value })
                }
                className={inputClass}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="submit" className="btn-primary" disabled={pending}>
                Save
              </button>
              <button
                type="button"
                className="dir-actions__btn"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
