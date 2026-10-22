import { useCallback, useMemo, useState, useTransition } from "react";
import { api } from "@/lib/api";
import {
  formatRollDisplay,
  promotableClassCohorts,
  promotableYearBatches,
  type Program,
  type Section,
} from "@/lib/academic";

type PreviewStudent = {
  id: string;
  name: string;
  email: string;
  section: string | null;
  rollNo: string | null;
  classLabel: string;
};

type PreviewResponse = {
  program: Program;
  fromYear: number;
  toYear: number;
  section: Section | null;
  fromLabel: string;
  toLabel: string;
  count: number;
  students: PreviewStudent[];
};

type PromoteMode = "section" | "year";

export function PromoteStudentsPanel() {
  const sectionCohorts = useMemo(() => promotableClassCohorts(), []);
  const yearBatches = useMemo(() => promotableYearBatches(), []);

  const [mode, setMode] = useState<PromoteMode>("section");
  const [cohortKey, setCohortKey] = useState(sectionCohorts[0]?.key ?? "");
  const [batchKey, setBatchKey] = useState(yearBatches[0]?.key ?? "");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedSection = useMemo(
    () => sectionCohorts.find((c) => c.key === cohortKey) ?? null,
    [sectionCohorts, cohortKey]
  );
  const selectedBatch = useMemo(
    () => yearBatches.find((b) => b.key === batchKey) ?? null,
    [yearBatches, batchKey]
  );

  const selectionParams = useMemo(() => {
    if (mode === "section" && selectedSection) {
      return {
        program: selectedSection.program,
        year: selectedSection.level,
        section: selectedSection.section as Section,
        fromLabel: selectedSection.label,
        toLabel: selectedSection.toLabel,
      };
    }
    if (mode === "year" && selectedBatch) {
      return {
        program: selectedBatch.program,
        year: selectedBatch.level,
        section: null as Section | null,
        fromLabel: selectedBatch.label,
        toLabel: selectedBatch.toLabel,
      };
    }
    return null;
  }, [mode, selectedSection, selectedBatch]);

  const loadPreview = useCallback(() => {
    if (!selectionParams) {
      setError("Choose a class to promote.");
      return;
    }
    setError(null);
    setMessage(null);
    setConfirmOpen(false);
    startTransition(() => {
      void (async () => {
        try {
          const qs = new URLSearchParams({
            program: selectionParams.program,
            year: String(selectionParams.year),
          });
          if (selectionParams.section) qs.set("section", selectionParams.section);
          const res = await api<PreviewResponse>(
            `/api/admin/students/promote/preview?${qs.toString()}`
          );
          setPreview(res);
          setSkipped(new Set());
        } catch (e) {
          setPreview(null);
          setError(e instanceof Error ? e.message : "Could not load preview.");
        }
      })();
    });
  }, [selectionParams]);

  const promoteCount = preview
    ? preview.students.filter((s) => !skipped.has(s.id)).length
    : 0;

  function toggleSkip(id: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyPromote() {
    if (!preview || !selectionParams || promoteCount === 0) return;
    setError(null);
    setMessage(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{
            promoted: number;
            fromLabel: string;
            toLabel: string;
          }>("/api/admin/students/promote", {
            method: "POST",
            body: JSON.stringify({
              program: selectionParams.program,
              year: selectionParams.year,
              section: selectionParams.section,
              excludeIds: [...skipped],
            }),
          });
          setMessage(
            `Promoted ${res.promoted} student(s): ${res.fromLabel} → ${res.toLabel}.`
          );
          setConfirmOpen(false);
          setPreview(null);
          setSkipped(new Set());
        } catch (e) {
          setError(e instanceof Error ? e.message : "Promotion failed.");
        }
      })();
    });
  }

  const inputClass =
    "w-full rounded-lg border border-sky-200/80 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="w-full max-w-none space-y-5">
      <p className="rounded-xl border border-brand-200/70 bg-brand-50/70 px-4 py-3 text-sm text-brand-950">
        <span className="font-semibold">End of academic year:</span> move a class
        up one year. Section stays the same (A stays A). Final-year classes cannot
        be promoted.
      </p>

      <div className="panel space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">1. Choose who to promote</h2>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="promoteMode"
              checked={mode === "section"}
              onChange={() => {
                setMode("section");
                setPreview(null);
                setConfirmOpen(false);
              }}
            />
            One year &amp; section (e.g. B.Pharm · 1st Year · Sec A)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="promoteMode"
              checked={mode === "year"}
              onChange={() => {
                setMode("year");
                setPreview(null);
                setConfirmOpen(false);
              }}
            />
            Whole year both sections (e.g. all B.Pharm 1st year)
          </label>
        </div>

        {mode === "section" ? (
          <div>
            <label className="text-sm font-medium text-slate-700">From class</label>
            <select
              value={cohortKey}
              onChange={(e) => {
                setCohortKey(e.target.value);
                setPreview(null);
                setConfirmOpen(false);
              }}
              className={`${inputClass} mt-1`}
            >
              {sectionCohorts.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} → {c.toLabel}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium text-slate-700">From year (A + B)</label>
            <select
              value={batchKey}
              onChange={(e) => {
                setBatchKey(e.target.value);
                setPreview(null);
                setConfirmOpen(false);
              }}
              className={`${inputClass} mt-1`}
            >
              {yearBatches.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label} → {b.toLabel}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectionParams ? (
          <p className="text-sm text-slate-600">
            Will move{" "}
            <span className="font-semibold text-slate-900">
              {selectionParams.fromLabel}
            </span>{" "}
            →{" "}
            <span className="font-semibold text-brand-800">
              {selectionParams.toLabel}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          disabled={pending || !selectionParams}
          onClick={loadPreview}
          className="btn-secondary disabled:opacity-50"
        >
          {pending && !preview ? "Loading…" : "Preview students"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {preview ? (
        <div className="panel space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">2. Confirm list</h2>
              <p className="mt-1 text-sm text-slate-600">
                {preview.count} student{preview.count === 1 ? "" : "s"} found ·{" "}
                <span className="font-medium text-slate-900">{promoteCount}</span> will be
                promoted
                {skipped.size > 0 ? ` · ${skipped.size} skipped` : ""}.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Uncheck anyone who should stay in {preview.fromLabel} (held back).
              </p>
            </div>
            {!confirmOpen ? (
              <button
                type="button"
                disabled={pending || promoteCount === 0}
                onClick={() => setConfirmOpen(true)}
                className="btn-primary disabled:opacity-50"
              >
                Promote {promoteCount} to Year {preview.toYear}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={applyPromote}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {pending ? "Promoting…" : `Yes, promote ${promoteCount}`}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {confirmOpen ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Confirm: move <strong>{promoteCount}</strong> student(s) from{" "}
              <strong>{preview.fromLabel}</strong> to{" "}
              <strong>{preview.toLabel}</strong>? Section letters stay the same.
            </p>
          ) : null}

          {preview.students.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
              No students in this class yet.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-brand-100/80 overflow-y-auto rounded-3xl border border-brand-200/60 bg-white/95 shadow-warm">
              {preview.students.map((s) => {
                const on = !skipped.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                      on ? "bg-white" : "bg-slate-50 opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSkip(s.id)}
                      aria-label={`Include ${s.name}`}
                    />
                    <span className="w-10 shrink-0 font-mono text-xs text-slate-500">
                      {formatRollDisplay(s.rollNo)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{s.name}</p>
                      <p className="truncate text-xs text-slate-500">{s.email}</p>
                    </div>
                    <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                      {s.classLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
