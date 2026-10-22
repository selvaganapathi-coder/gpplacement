import { useMemo, useState } from "react";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import {
  type LevelType,
  type Program,
  type Section,
  tracksForProgram,
  yearTrackForProgram,
} from "@/lib/academic";

export function StudentAcademicFields({
  program,
  levelType,
  level,
  section,
  onChange,
  idPrefix = "",
}: {
  program: Program | "";
  levelType: LevelType | "";
  level: number | "";
  section: Section | "";
  onChange: (v: {
    program: Program | "";
    levelType: LevelType | "";
    level: number | "";
    section: Section | "";
  }) => void;
  idPrefix?: string;
}) {
  const catalog = useAcademicCatalog();
  const tracks = useMemo(
    () => (program ? tracksForProgram(program) : []),
    [program]
  );
  const trackIdx = tracks.findIndex((t) => t.levelType === levelType);
  const [manualTrack, setManualTrack] = useState(0);
  const activeIdx = trackIdx >= 0 ? trackIdx : manualTrack;
  const activeTrack = tracks[activeIdx] ?? tracks[0];

  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="text-sm font-medium text-slate-700" htmlFor={`${idPrefix}program`}>
          Program
        </label>
        <select
          id={`${idPrefix}program`}
          value={program}
          required
          onChange={(e) => {
            const p = e.target.value as Program | "";
            const t = p ? yearTrackForProgram(p) : null;
            onChange({
              program: p,
              levelType: t?.levelType ?? "YEAR",
              level: "",
              section: "",
            });
            setManualTrack(0);
          }}
          className="mt-1 w-full rounded-md border border-sky-200/80 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select program…</option>
          {catalog.departments.map((p) => (
            <option key={p.program} value={p.program}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {program && activeTrack ? (
        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-slate-700" htmlFor={`${idPrefix}level`}>
            Batch (optional)
          </label>
          <select
            id={`${idPrefix}level`}
            value={level === "" ? "" : String(level)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                program,
                levelType: v ? "YEAR" : "",
                level: v ? Number(v) : "",
                section: "",
              });
            }}
            className="mt-1 w-full rounded-md border border-sky-200/80 bg-white px-3 py-2 text-sm"
          >
            <option value="">Whole department (all batches)</option>
            {catalog.batchYears.map((year) => (
              <option key={year} value={year}>
                {year} batch
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {catalog.departments.find((d) => d.program === program)?.durationYears ?? "—"} years.
            Batch is the joining year ({catalog.batchYears[0]}–{catalog.batchYears.at(-1)}).
          </p>
          {/* section kept in props for type compatibility; not shown */}
          <input type="hidden" value={section || ""} readOnly />
        </div>
      ) : null}
    </div>
  );
}
