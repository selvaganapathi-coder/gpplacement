import { useMemo, useState } from "react";
import { downloadDepartmentMarksReport } from "@/lib/api";
import {
  programOptions,
  tracksForProgram,
  type LevelType,
  type Program,
} from "@/lib/academic";

type MarksDownloadPanelProps = {
  mode: "admin" | "staff";
  /** Limit department choices (staff scope). */
  allowedPrograms?: Program[];
};

export function MarksDownloadPanel({
  mode,
  allowedPrograms,
}: MarksDownloadPanelProps) {
  const [program, setProgram] = useState<Program | "">("");
  const [levelType, setLevelType] = useState<LevelType | "">("");
  const [level, setLevel] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const programs = useMemo(() => {
    const all = programOptions();
    if (!allowedPrograms?.length) return all;
    return all.filter((p) => allowedPrograms.includes(p.id));
  }, [allowedPrograms]);

  const tracks = program ? tracksForProgram(program) : [];
  const levels =
    program && levelType
      ? tracks.find((t) => t.levelType === levelType)?.levels ?? []
      : [];

  async function download() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await downloadDepartmentMarksReport(mode, {
        program: program || undefined,
        levelType: levelType || undefined,
        level: level === "" ? undefined : Number(level),
      });
      setOk("Department marks report downloaded.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  const selectClass =
    "mt-1.5 w-full rounded-xl border border-sky-200/80 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <section className="overflow-hidden rounded-3xl border border-brand-200/60 bg-white/95 shadow-warm">
      <div className="border-b border-brand-100/90 bg-gradient-to-br from-brand-50/90 via-white to-emerald-50/40 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-800/75">
          Marks &amp; reports
        </p>
        <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
          Download department marks
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          CSV with student averages and every attempt. Leave class blank for the whole department.
        </p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <label className="text-sm font-medium text-slate-700">Department</label>
          <select
            value={program}
            onChange={(e) => {
              setProgram((e.target.value || "") as Program | "");
              setLevelType("");
              setLevel("");
            }}
            className={selectClass}
          >
            <option value="">{mode === "admin" ? "All departments" : "All my departments"}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Track</label>
          <select
            value={levelType}
            disabled={!program}
            onChange={(e) => {
              setLevelType((e.target.value || "") as LevelType | "");
              setLevel("");
            }}
            className={selectClass}
          >
            <option value="">Whole department</option>
            {tracks.map((t) => (
              <option key={t.levelType} value={t.levelType}>
                {t.levelType === "YEAR" ? "Year" : "Semester"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Batch</label>
          <select
            value={level === "" ? "" : String(level)}
            disabled={!levelType}
            onChange={(e) =>
              setLevel(e.target.value === "" ? "" : Number(e.target.value))
            }
            className={selectClass}
          >
            <option value="">All batches</option>
            {levels.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-sky-100 px-5 py-4 sm:px-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          className="btn-primary disabled:opacity-60"
        >
          {busy ? "Preparing…" : "Download department CSV"}
        </button>
        {ok ? (
          <p className="text-sm font-medium text-emerald-800" role="status">
            {ok}
          </p>
        ) : null}
        {err ? (
          <p className="text-sm text-red-600" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    </section>
  );
}
