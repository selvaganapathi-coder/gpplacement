import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  DistributionBars,
  HorizontalBarChart,
  ScoreRing,
  VerticalBarChart,
  type ChartDatum,
} from "@/components/charts";
import { DashboardShell } from "@/components/DashboardShell";
import { DepartmentScopeBanner } from "@/components/DepartmentScopeBanner";
import { MarksDownloadPanel } from "@/components/MarksDownloadPanel";
import {
  PlacementReadinessPanel,
  type PlacementReadiness,
} from "@/components/PlacementReadinessPanel";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { api } from "@/lib/api";
import { programOptions, type Program } from "@/lib/academic";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type AnalyticsData = {
  passRatio: number;
  managedPrograms?: Program[];
  summary: {
    submittedAttempts: number;
    averagePercent: number | null;
    passRate: number | null;
    flaggedAttempts: number;
    testsIncluded: number;
    readinessOverall?: number | null;
  };
  classAverages: {
    key: string;
    label: string;
    attempts: number;
    averagePercent: number;
    passRate: number;
  }[];
  weakTopics: {
    questionId: string;
    testId: string;
    testTitle: string;
    order: number;
    prompt: string;
    topic: string | null;
    difficulty: string | null;
    answered: number;
    correct: number;
    correctRate: number;
  }[];
  byTest: {
    testId: string;
    title: string;
    attempts: number;
    averagePercent: number;
    passRate: number;
    flaggedAttempts: number;
  }[];
  scoreDistribution: {
    label: string;
    min: number;
    max: number;
    count: number;
  }[];
  readiness?: PlacementReadiness["readiness"];
  strongSubjects?: PlacementReadiness["strongSubjects"];
  weakSubjects?: PlacementReadiness["weakSubjects"];
  improvement?: PlacementReadiness["improvement"];
  testHistory?: PlacementReadiness["testHistory"];
  questionAnalytics?: {
    mostDifficult: {
      questionId: string;
      testId: string;
      testTitle: string;
      prompt: string;
      topic: string | null;
      difficulty: string | null;
      answered: number;
      correct: number;
      correctRate: number;
      averageScore: number;
      marks: number;
    }[];
    mostIncorrect: {
      questionId: string;
      testId: string;
      testTitle: string;
      prompt: string;
      topic: string | null;
      difficulty: string | null;
      answered: number;
      incorrect: number;
      incorrectRate: number;
    }[];
    topicPerformance: {
      topic: string;
      answered: number;
      correct: number;
      correctRate: number;
      averageScore: number;
    }[];
  };
};

type AnalyticsPageProps = {
  role: "staff" | "admin";
};

function truncate(text: string, n = 120): string {
  const t = text.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function AnalyticsPage({ role }: AnalyticsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useStaffDepartmentScope();
  const apiBase = role === "admin" ? "/api/admin/analytics" : "/api/staff/analytics";
  const homeHref = role === "admin" ? "/dashboard/admin" : "/dashboard/staff";
  const resultsBase =
    role === "admin" ? "/dashboard/admin/tests" : "/dashboard/staff/tests";

  const testId = searchParams.get("testId") ?? "";
  const program = (searchParams.get("program") ?? "") as Program | "";
  const passPct = searchParams.get("pass") ?? "50";

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [tests, setTests] = useState<{ id: string; title: string }[]>([]);
  const [managedPrograms, setManagedPrograms] = useState<Program[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const staffPrograms =
    role === "staff"
      ? managedPrograms.length
        ? managedPrograms
        : scope.managedPrograms
      : [];

  const programChoices = useMemo(() => {
    const all = programOptions();
    if (role !== "staff") return all;
    if (staffPrograms.length === 0) return [];
    return all.filter((p) => staffPrograms.includes(p.id));
  }, [role, staffPrograms]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (testId) params.set("testId", testId);
    const scopedProgram =
      program ||
      (role === "staff" && staffPrograms.length === 1 ? staffPrograms[0] : "") ||
      "";
    if (scopedProgram) params.set("program", scopedProgram);
    const pass = Number(passPct);
    if (Number.isFinite(pass) && pass > 0) {
      params.set("passRatio", String(pass / 100));
    }
    const qs = params.toString();
    return qs ? `${apiBase}?${qs}` : apiBase;
  }, [apiBase, testId, program, passPct, role, staffPrograms]);

  useEffect(() => {
    if (role === "staff" && scope.managedPrograms.length) {
      setManagedPrograms(scope.managedPrograms);
    }
  }, [role, scope.managedPrograms]);

  useEffect(() => {
    const listUrl = role === "admin" ? "/api/admin/tests" : "/api/staff/tests";
    void api<{ tests: { id: string; title: string }[]; managedPrograms?: Program[] }>(
      listUrl
    )
      .then((r) => {
        setTests(r.tests.map((t) => ({ id: t.id, title: t.title })));
        if (r.managedPrograms?.length) setManagedPrograms(r.managedPrograms);
      })
      .catch(() => setTests([]));
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api<AnalyticsData>(query);
        if (!cancelled) {
          setData(res);
          if (res.managedPrograms?.length) setManagedPrograms(res.managedPrograms);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load analytics.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  function updateFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  }

  const lockedProgram =
    role === "staff" && programChoices.length === 1 ? programChoices[0]!.id : program;

  const classChart: ChartDatum[] = useMemo(
    () =>
      (data?.classAverages ?? []).slice(0, 8).map((row) => ({
        id: row.key,
        label: row.label,
        value: row.averagePercent,
      })),
    [data]
  );

  const testChart: ChartDatum[] = useMemo(
    () =>
      (data?.byTest ?? []).slice(0, 8).map((t) => ({
        id: t.testId,
        label: t.title,
        value: t.averagePercent,
      })),
    [data]
  );

  const weakChart: ChartDatum[] = useMemo(
    () =>
      (data?.weakTopics ?? []).slice(0, 8).map((q) => ({
        id: q.questionId,
        label: q.topic ? `${q.topic}` : `Q${q.order}`,
        value: q.correctRate,
        tone:
          q.correctRate < 40 ? "danger" : q.correctRate < 60 ? "warn" : "brand",
      })),
    [data]
  );

  const selectedTestTitle = tests.find((t) => t.id === testId)?.title;

  return (
    <DashboardShell
      title="Analytics"
      subtitle={
        role === "admin"
          ? "Placement readiness, class performance, and weak subjects"
          : scope.departmentLabel
            ? `Placement readiness for ${scope.departmentLabel}`
            : "Placement readiness for your department"
      }
      nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
    >
      {role === "staff" ? (
        <DepartmentScopeBanner
          departmentLabel={scope.departmentLabel}
          hasDepartment={scope.hasDepartment}
          loaded={scope.loaded}
        />
      ) : null}

      <section className="portal-hero portal-hero--light mb-5">
        <p className="portal-hero__kicker">Test analytics</p>
        <h2 className="portal-hero__title text-slate-900">
          {selectedTestTitle ? selectedTestTitle : "All tests overview"}
        </h2>
        <p className="portal-hero__lede">
          Charts update when you change the test or pass mark. Open Results desk to release scores.
        </p>
        <div className="portal-hero__actions">
          <Link
            to={role === "admin" ? "/dashboard/admin/results" : "/dashboard/staff/results"}
            className="btn-secondary !min-h-10"
          >
            Results desk
          </Link>
          <Link to={homeHref} className="btn-secondary !min-h-10">
            ← Home
          </Link>
        </div>
      </section>

      <div className="mb-6">
        <MarksDownloadPanel
          mode={role}
          allowedPrograms={role === "staff" ? staffPrograms : undefined}
        />
      </div>

      <div className="filter-bar mb-5">
        <label>
          <span className="mb-1 block font-medium text-slate-700">Test</span>
          <select
            value={testId}
            onChange={(e) => updateFilter({ testId: e.target.value })}
            className="form-input mt-0 max-w-full sm:max-w-xs"
          >
            <option value="">All tests</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block font-medium text-slate-700">Program</span>
          <select
            value={lockedProgram}
            onChange={(e) => updateFilter({ program: e.target.value })}
            className="form-input mt-0"
            disabled={role === "staff" && programChoices.length <= 1}
          >
            {role === "staff" && programChoices.length === 1 ? (
              <option value={programChoices[0]!.id}>{programChoices[0]!.label}</option>
            ) : (
              <>
                <option value="">All programs</option>
                {programChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
        <label className="sm:!max-w-[8rem] sm:!flex-none">
          <span className="mb-1 block font-medium text-slate-700">Pass mark %</span>
          <input
            type="number"
            min={1}
            max={100}
            value={passPct}
            onChange={(e) => updateFilter({ pass: e.target.value })}
            className="form-input mt-0 w-full"
          />
        </label>
      </div>

      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading analytics…</p> : null}

      {data && !loading ? (
        <div className="space-y-6">
          {data.readiness && data.improvement ? (
            <PlacementReadinessPanel
              scope="overall"
              showHistory
              data={{
                readiness: data.readiness,
                strongSubjects: data.strongSubjects ?? [],
                weakSubjects: data.weakSubjects ?? [],
                improvement: data.improvement,
                testHistory: data.testHistory,
              }}
            />
          ) : null}

          {data.questionAnalytics ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="section-title">Question analytics</h2>
                  <p className="section-sub">
                    Most difficult · most incorrect · average score · topic performance
                  </p>
                </div>
                <Link
                  to={
                    role === "admin"
                      ? "/dashboard/admin/leaderboard"
                      : "/dashboard/staff/leaderboard"
                  }
                  className="btn-secondary !min-h-9 !text-xs"
                >
                  Class leaderboard
                </Link>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="panel overflow-hidden">
                  <div className="panel-header">
                    <h3 className="font-display text-sm font-semibold">Most difficult</h3>
                  </div>
                  <ul className="divide-y divide-sky-50 text-sm">
                    {data.questionAnalytics.mostDifficult.slice(0, 6).map((q) => (
                      <li key={q.questionId} className="px-4 py-3">
                        <p className="font-medium text-slate-900 line-clamp-2">{q.prompt}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {q.testTitle}
                          {q.difficulty ? ` · ${q.difficulty}` : ""}
                          {q.topic ? ` · ${q.topic}` : ""}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-rose-800">
                          {q.correctRate}% correct · avg score {q.averageScore}/{q.marks}
                        </p>
                      </li>
                    ))}
                    {data.questionAnalytics.mostDifficult.length === 0 ? (
                      <li className="px-4 py-6 text-slate-500">No question data yet.</li>
                    ) : null}
                  </ul>
                </div>
                <div className="panel overflow-hidden">
                  <div className="panel-header">
                    <h3 className="font-display text-sm font-semibold">Most incorrect</h3>
                  </div>
                  <ul className="divide-y divide-sky-50 text-sm">
                    {data.questionAnalytics.mostIncorrect.slice(0, 6).map((q) => (
                      <li key={q.questionId} className="px-4 py-3">
                        <p className="font-medium text-slate-900 line-clamp-2">{q.prompt}</p>
                        <p className="mt-1 text-xs text-slate-500">{q.testTitle}</p>
                        <p className="mt-1 text-xs font-semibold text-rose-800">
                          {q.incorrectRate}% incorrect ({q.incorrect}/{q.answered})
                        </p>
                      </li>
                    ))}
                    {data.questionAnalytics.mostIncorrect.length === 0 ? (
                      <li className="px-4 py-6 text-slate-500">No question data yet.</li>
                    ) : null}
                  </ul>
                </div>
              </div>
              <div className="panel p-4 sm:p-5">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Topic performance
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Average marks earned and correct rate by topic
                </p>
                {data.questionAnalytics.topicPerformance.length > 0 ? (
                  <div className="mt-3">
                    <HorizontalBarChart
                      data={data.questionAnalytics.topicPerformance.map((t) => ({
                        id: t.topic,
                        label: `${t.topic} (avg ${t.averageScore})`,
                        value: t.correctRate,
                      }))}
                      valueSuffix="% correct"
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">No topic tags yet.</p>
                )}
              </div>
            </section>
          ) : null}

          <div className="chart-overview">
            <div className="chart-overview__rings">
              <ScoreRing
                percent={
                  data.summary.readinessOverall ?? data.summary.averagePercent
                }
                label="Readiness"
                sublabel={`${data.summary.submittedAttempts} attempts`}
              />
              <ScoreRing
                percent={data.summary.passRate}
                label="Pass rate"
                sublabel={`≥ ${Math.round(data.passRatio * 100)}%`}
              />
            </div>
            <div className="chart-overview__panel">
              <h3 className="chart-panel-title">Score distribution</h3>
              <p className="chart-panel-sub">How many students land in each band</p>
              <DistributionBars
                bands={(data.scoreDistribution ?? []).map((b) => ({
                  label: b.label,
                  count: b.count,
                }))}
              />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <StatCard
                  label="Tests included"
                  value={String(data.summary.testsIncluded)}
                />
                <StatCard
                  label="Flagged"
                  value={String(data.summary.flaggedAttempts)}
                  emphasize={data.summary.flaggedAttempts > 0}
                />
              </div>
            </div>
          </div>

          <div className="chart-grid">
            <section className="chart-card">
              <h3 className="chart-panel-title">Class averages</h3>
              <p className="chart-panel-sub">Average % by degree / semester</p>
              <VerticalBarChart data={classChart} valueSuffix="%" />
            </section>
            <section className="chart-card">
              <h3 className="chart-panel-title">
                {testId ? "Weak questions" : "By test"}
              </h3>
              <p className="chart-panel-sub">
                {testId
                  ? "Lowest correct rates on this paper"
                  : "Average % across papers"}
              </p>
              {testId ? (
                <HorizontalBarChart data={weakChart} valueSuffix="% correct" />
              ) : (
                <VerticalBarChart data={testChart} valueSuffix="%" />
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Class table
              </h2>
              <p className="text-xs text-slate-500">Same data as the chart</p>
            </div>
            {data.classAverages.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">No submitted attempts yet.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Attempts</th>
                      <th>Avg %</th>
                      <th>Pass rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classAverages.map((row) => (
                      <tr key={row.key}>
                        <td className="font-medium text-slate-900">{row.label}</td>
                        <td className="text-slate-600">{row.attempts}</td>
                        <td className="tabular-nums text-slate-900">
                          {row.averagePercent}%
                        </td>
                        <td className="min-w-[8rem]">
                          <div className="flex items-center gap-2">
                            <div className="meter-bar min-w-[4rem] flex-1">
                              <span
                                className="bg-gradient-to-r from-brand-500 to-emerald-500"
                                style={{ width: `${Math.min(100, row.passRate)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-slate-900">
                              {row.passRate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Weak topics
              </h2>
              <p className="text-xs text-slate-500">Lowest correct rates — up to 15</p>
            </div>
            {data.weakTopics.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">No question data yet.</p>
            ) : (
              <ul className="divide-y divide-sky-50">
                {data.weakTopics.map((q) => (
                  <li key={q.questionId} className="px-4 py-3.5 text-sm sm:px-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <p className="min-w-0 font-medium text-slate-900">
                        Q{q.order}
                        {q.topic ? (
                          <span className="ml-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                            {q.topic}
                          </span>
                        ) : null}
                        {q.difficulty ? (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            ({q.difficulty.toLowerCase()})
                          </span>
                        ) : null}
                        <span className="mt-0.5 block font-medium normal-case tracking-normal">
                          {truncate(q.prompt)}
                        </span>
                      </p>
                      <span
                        className={`shrink-0 self-start ${
                          q.correctRate < 40
                            ? "badge-danger"
                            : q.correctRate < 60
                              ? "badge-warn"
                              : "badge-ok"
                        }`}
                      >
                        {q.correctRate}% correct
                      </span>
                    </div>
                    <div className="meter-bar mt-2 max-w-md">
                      <span
                        className={
                          q.correctRate < 40
                            ? "bg-red-500"
                            : q.correctRate < 60
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }
                        style={{ width: `${Math.min(100, q.correctRate)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {q.testTitle} · {q.correct}/{q.answered} correct ·{" "}
                      <Link
                        to={`${resultsBase}/${q.testId}/results`}
                        className="text-brand-700 hover:underline"
                      >
                        Results
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!testId && data.byTest.length > 0 ? (
            <section className="panel">
              <div className="panel-header">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  By test
                </h2>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Attempts</th>
                      <th>Avg %</th>
                      <th>Pass</th>
                      <th>Flagged</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.byTest.map((t) => (
                      <tr key={t.testId}>
                        <td className="font-medium text-slate-900">{t.title}</td>
                        <td className="text-slate-600">{t.attempts}</td>
                        <td className="tabular-nums">{t.averagePercent}%</td>
                        <td className="tabular-nums">{t.passRate}%</td>
                        <td>
                          {t.flaggedAttempts > 0 ? (
                            <span className="font-semibold text-red-700">
                              {t.flaggedAttempts}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="text-sm font-medium text-brand-700 hover:underline"
                            onClick={() => updateFilter({ testId: t.testId })}
                          >
                            Charts
                          </button>
                          {" · "}
                          <Link
                            to={`${resultsBase}/${t.testId}/results`}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            Results
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`stat-tile ${emphasize ? "border-red-200 bg-red-50/80" : ""}`}>
      <p
        className={`text-xs font-medium uppercase tracking-wide ${
          emphasize ? "text-red-800/80" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-semibold ${
          emphasize ? "text-red-950" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
