import { HorizontalBarChart, ScoreRing, Sparkline, type ChartDatum } from "@/components/charts";
import { Link } from "react-router-dom";

export type PlacementReadiness = {
  readiness: {
    overall: number | null;
    pillars: {
      id: string;
      label: string;
      percent: number | null;
      attempts: number;
    }[];
  };
  strongSubjects: {
    topic: string;
    percent: number;
    answered: number;
    correct: number;
  }[];
  weakSubjects: {
    topic: string;
    percent: number;
    answered: number;
    correct: number;
  }[];
  improvement: {
    direction: "up" | "down" | "flat" | "insufficient";
    delta: number | null;
    message: string;
    trend: {
      id: string;
      label: string;
      percent: number;
      submittedAt: string;
      assessmentType?: string;
      pillar?: string | null;
    }[];
  };
  testHistory?: {
    attemptId: string;
    testId: string;
    title: string;
    assessmentType: string;
    pillar: string | null;
    pillarLabel: string | null;
    percent: number;
    score: number;
    maxScore: number;
    submittedAt: string;
  }[];
};

type PlacementReadinessPanelProps = {
  data: PlacementReadiness;
  /** student | cohort */
  scope?: "student" | "overall";
  /** Link attempt review for students */
  attemptHref?: (attemptId: string) => string;
  showHistory?: boolean;
};

export function PlacementReadinessPanel({
  data,
  scope = "student",
  attemptHref,
  showHistory = true,
}: PlacementReadinessPanelProps) {
  const overall = data.readiness.overall;
  const pillars = data.readiness.pillars;
  const trendValues = data.improvement.trend.map((t) => t.percent);
  const strongChart: ChartDatum[] = data.strongSubjects.map((s) => ({
    id: s.topic,
    label: s.topic,
    value: s.percent,
  }));
  const weakChart: ChartDatum[] = data.weakSubjects.map((s) => ({
    id: s.topic,
    label: s.topic,
    value: s.percent,
  }));

  const improveTone =
    data.improvement.direction === "up"
      ? "text-emerald-800 bg-emerald-50 ring-emerald-200"
      : data.improvement.direction === "down"
        ? "text-rose-800 bg-rose-50 ring-rose-200"
        : "text-slate-700 bg-slate-50 ring-slate-200";

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
              {scope === "overall" ? "Campus · readiness" : "Placement readiness"}
            </p>
            <h2 className="font-display mt-1 text-lg font-semibold text-slate-900">
              Placement Readiness Score
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {scope === "overall"
                ? "Average across published / scored assessments in this view."
                : "Based on your scored Aptitude, Technical, Pharmacy, and Communication assessments."}
            </p>
          </div>
          {overall != null ? (
            <ScoreRing percent={overall} label="Overall" sublabel="readiness" />
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
              No scored assessments yet
            </p>
          )}
        </div>

        <ul className="mt-5 divide-y divide-sky-100 rounded-2xl border border-sky-100 bg-sky-50/30">
          {pillars.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <span className="font-medium text-slate-800">{p.label}</span>
              <span className="tabular-nums font-semibold text-slate-900">
                {p.percent != null ? `${Math.round(p.percent)}%` : "—"}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {p.attempts > 0
                    ? `${p.attempts} test${p.attempts === 1 ? "" : "s"}`
                    : "no data"}
                </span>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 bg-white/70 px-4 py-3 text-sm font-semibold">
            <span className="text-slate-900">Overall</span>
            <span className="tabular-nums text-brand-900">
              {overall != null ? `${Math.round(overall)}%` : "—"}
            </span>
          </li>
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Strong subjects
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Topics with the highest correct rate (min. 2 answers).
          </p>
          {strongChart.length > 0 ? (
            <div className="mt-3">
              <HorizontalBarChart data={strongChart} valueSuffix="%" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Not enough topic data yet — complete more MCQs.
            </p>
          )}
        </div>
        <div className="panel p-4 sm:p-5">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Weak subjects
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Topics to practise — lowest correct rates.
          </p>
          {weakChart.length > 0 ? (
            <div className="mt-3">
              <HorizontalBarChart data={weakChart} valueSuffix="%" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Not enough topic data yet — complete more MCQs.
            </p>
          )}
        </div>
      </section>

      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Improvement over time
            </h3>
            <p
              className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${improveTone}`}
            >
              {data.improvement.message}
            </p>
          </div>
          {trendValues.length >= 2 ? (
            <div className="w-40">
              <Sparkline values={trendValues} />
            </div>
          ) : null}
        </div>
      </section>

      {showHistory && data.testHistory && data.testHistory.length > 0 ? (
        <section className="panel overflow-hidden">
          <div className="panel-header">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Test history
            </h3>
            <p className="text-xs text-slate-500">
              {scope === "overall"
                ? "Recent scored attempts in this filter"
                : "Your scored assessments"}
            </p>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Pillar</th>
                  <th>Score</th>
                  <th>%</th>
                  <th>When</th>
                  {attemptHref ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {data.testHistory.slice(0, scope === "overall" ? 12 : 25).map((h) => (
                  <tr key={h.attemptId}>
                    <td data-label="Assessment" className="font-medium text-slate-900">
                      {h.title}
                    </td>
                    <td data-label="Pillar" className="text-slate-600">
                      {h.pillarLabel ?? "—"}
                    </td>
                    <td data-label="Score" className="tabular-nums">
                      {h.score} / {h.maxScore}
                    </td>
                    <td data-label="%" className="tabular-nums font-semibold">
                      {Math.round(h.percent)}%
                    </td>
                    <td data-label="When" className="whitespace-nowrap text-slate-600">
                      {new Date(h.submittedAt).toLocaleString()}
                    </td>
                    {attemptHref ? (
                      <td data-label="Review">
                        <Link
                          to={attemptHref(h.attemptId)}
                          className="text-sm font-semibold text-brand-800 hover:underline"
                        >
                          Review
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
