import { APTITUDE_CURRICULUM } from "@/lib/aptitudeCurriculum";

/** Compact reference of Module 1 aptitude syllabus for staff authors. */
export function AptitudeCurriculumGuide() {
  return (
    <details className="rounded-lg border border-sky-200/70 bg-sky-50/50 p-4 shadow-warm">
      <summary className="cursor-pointer font-display text-sm font-semibold text-slate-900">
        Module 1 curriculum — reference list ({APTITUDE_CURRICULUM.reduce((n, m) => n + m.topics.length, 0)}{" "}
        topics)
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        On each question, use the <strong>Section</strong> and <strong>Topic</strong> dropdowns
        (select options). You do not need to type topic names.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {APTITUDE_CURRICULUM.map((mod) => (
          <div key={mod.id} className="rounded-md border border-sky-100 bg-white/90 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
              {mod.code}. {mod.label}
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
              {mod.topics.map((t) => (
                <li key={t.id}>{t.label}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
