import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import {
  SECTIONS,
  type Program,
  type Section,
} from "@/lib/academic";
import { formatScheduleRange, toDatetimeLocalValue } from "@/lib/testSchedule";

export type PublishAudience = {
  program: Program | null;
  levelType: "YEAR" | null;
  level: number | null;
  section: Section | null;
};

export type PublishConfirmPayload = {
  availableFrom: string | null;
  availableUntil: string | null;
  audience: PublishAudience;
};

type PublishTestDialogProps = {
  testTitle: string;
  open: boolean;
  /** When true, require department (publish). Schedule-only can keep existing. */
  requireAudience?: boolean;
  initialFrom?: string | null;
  initialUntil?: string | null;
  initialProgram?: Program | null;
  initialLevel?: number | null;
  initialSection?: Section | null;
  allowedPrograms?: Program[];
  allowAllStudents?: boolean;
  onClose: () => void;
  onConfirm: (payload: PublishConfirmPayload) => void | Promise<void>;
};


function defaultEndLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return toDatetimeLocalValue(d);
}

function safeIso(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PublishTestDialog({
  testTitle,
  open,
  requireAudience = true,
  initialFrom,
  initialUntil,
  initialProgram,
  initialLevel,
  initialSection,
  allowedPrograms,
  allowAllStudents = true,
  onClose,
  onConfirm,
}: PublishTestDialogProps) {
  const titleId = useId();
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [target, setTarget] = useState<"all" | "class">("class");
  const [program, setProgram] = useState<Program | "">("");
  const [level, setLevel] = useState<number | "">("");
  const [section, setSection] = useState<Section | "">("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalog = useAcademicCatalog();
  const degreeOptions = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    if (!allowedPrograms?.length) return all;
    return all.filter((p) => allowedPrograms.includes(p.id));
  }, [allowedPrograms, catalog.departments]);

  const yearOptions = useMemo(() => {
    if (!program) return [];
    return catalog.batchYears.map((year) => ({ value: year, label: `${year} batch` }));
  }, [program, catalog.batchYears]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setLocalError(null);
      return;
    }
    setAvailableFrom(toDatetimeLocalValue(initialFrom ?? null));
    setAvailableUntil(
      toDatetimeLocalValue(initialUntil ?? null) || defaultEndLocal()
    );
    if (initialProgram) {
      setTarget("class");
      setProgram(initialProgram);
      setLevel(initialLevel ?? "");
      setSection(initialLevel != null ? initialSection ?? "" : "");
    } else if (degreeOptions.length === 1) {
      setTarget("class");
      setProgram(degreeOptions[0]!.id);
      setLevel(initialLevel ?? "");
      setSection(initialLevel != null ? initialSection ?? "" : "");
    } else {
      setTarget(allowAllStudents ? "all" : "class");
      setProgram("");
      setLevel("");
      setSection("");
    }
    setLocalError(null);
    setBusy(false);
  }, [
    open,
    initialFrom,
    initialUntil,
    initialProgram,
    initialLevel,
    initialSection,
    degreeOptions,
    allowAllStudents,
  ]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const previewFrom = availableFrom ? new Date(availableFrom) : null;
  const previewUntil = availableUntil ? new Date(availableUntil) : null;
  const fromOk = !previewFrom || !Number.isNaN(previewFrom.getTime());
  const untilOk = !!previewUntil && !Number.isNaN(previewUntil.getTime());
  const releasePreview =
    untilOk && previewUntil ? previewUntil.toLocaleString() : null;

  async function confirm() {
    setLocalError(null);
    if (!availableUntil.trim()) {
      setLocalError("Set when the exam ends. Students see results only after that time.");
      return;
    }
    const from = availableFrom.trim() ? new Date(availableFrom) : null;
    const until = new Date(availableUntil);
    if (from && Number.isNaN(from.getTime())) {
      setLocalError("Start time is invalid.");
      return;
    }
    if (Number.isNaN(until.getTime())) {
      setLocalError("End time is invalid.");
      return;
    }
    if (from && until <= from) {
      setLocalError("End time must be after start time.");
      return;
    }
    if (until.getTime() <= Date.now()) {
      setLocalError("Exam end time must be in the future so students can take it.");
      return;
    }

    let audience: PublishAudience = {
      program: null,
      levelType: null,
      level: null,
      section: null,
    };
    if (requireAudience || target === "class") {
      if (target === "class") {
        if (!program) {
          setLocalError("Choose a department (degree).");
          return;
        }
        audience = {
          program,
          levelType: level === "" ? null : "YEAR",
          level: level === "" ? null : level,
          section: level === "" || section === "" ? null : section,
        };
      } else if (requireAudience && !allowAllStudents) {
        setLocalError("Choose a department (degree).");
        return;
      }
    }

    setBusy(true);
    try {
      await onConfirm({
        availableFrom: safeIso(from),
        availableUntil: until.toISOString(),
        audience,
      });
    } catch {
      // Parent shows error; keep dialog open
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28, 25, 23, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="relative z-[201] max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-display text-lg font-semibold text-slate-900">
          Publish for students
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          <strong>{testTitle || "This test"}</strong> — set who can take it and when.
        </p>

        <div className="mt-4 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Department & year
            </legend>
            {allowAllStudents ? (
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="publishTarget"
                    checked={target === "all"}
                    onChange={() => {
                      setTarget("all");
                      setProgram("");
                      setLevel("");
                      setSection("");
                    }}
                  />
                  All students
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="publishTarget"
                    checked={target === "class"}
                    onChange={() => setTarget("class")}
                  />
                  One degree / class
                </label>
              </div>
            ) : null}

            {target === "class" || !allowAllStudents ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Degree</label>
                  <select
                    value={program}
                    onChange={(e) => {
                      setProgram(e.target.value as Program | "");
                      setLevel("");
                      setSection("");
                      setTarget("class");
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select degree…</option>
                    {degreeOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Batch <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <select
                    value={level === "" ? "" : String(level)}
                    disabled={!program}
                    onChange={(e) => {
                      setLevel(e.target.value ? Number(e.target.value) : "");
                      setSection("");
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">All batches</option>
                    {yearOptions.map((y) => (
                      <option key={y.value} value={y.value}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Section <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <select
                    value={section}
                    disabled={!program || level === ""}
                    onChange={(e) =>
                      setSection((e.target.value || "") as Section | "")
                    }
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">All sections</option>
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        Sec {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">
              Only students in the selected degree (and year/section if set) can take this exam.
            </p>
          </fieldset>

          <div>
            <label className="text-xs font-medium text-slate-600">
              Opens (optional — empty = now)
            </label>
            <input
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">
              Exam ends <span className="text-red-600">(required)</span>
            </label>
            <input
              type="datetime-local"
              value={availableUntil}
              onChange={(e) => {
                setAvailableUntil(e.target.value);
                setLocalError(null);
              }}
              required
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-stone-200/80">
            {fromOk && untilOk
              ? formatScheduleRange(safeIso(previewFrom), safeIso(previewUntil))
              : "Set a valid exam end time."}
            {releasePreview ? (
              <>
                <br />
                <span className="font-medium text-brand-900">
                  Results show at: {releasePreview}
                </span>
              </>
            ) : null}
          </p>
          {localError ? (
            <p className="text-sm text-red-600" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-stone-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
          >
            {busy
              ? requireAudience
                ? "Publishing…"
                : "Saving…"
              : requireAudience
                ? "Publish now"
                : "Save schedule"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
