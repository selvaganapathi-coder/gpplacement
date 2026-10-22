import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DistributionBars,
  HorizontalBarChart,
  ScoreRing,
  Sparkline,
  type ChartDatum,
} from "@/components/charts";
import { DashboardShell } from "@/components/DashboardShell";
import {
  PlacementReadinessPanel,
  type PlacementReadiness,
} from "@/components/PlacementReadinessPanel";
import { api } from "@/lib/api";
import { formatResultsUnlockAt } from "@/lib/studentTime";
import { studentSidebarNav } from "@/lib/dashboardNav";

type AttemptRow = {
  id: string;
  testId: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore?: number;
  test: {
    title: string;
    resultsPublished: boolean;
    resultsAutoReleaseAt?: string | null;
  };
};

type StudentAnalytics = {
  summary: {
    scoredTests: number;
    averagePercent: number | null;
    bestPercent: number | null;
    bestTitle: string | null;
    passRate: number | null;
    passMark: number;
    readinessOverall?: number | null;
  };
  readiness?: PlacementReadiness;
  trend: { id: string; label: string; percent: number; submittedAt: string }[];
  byTest: {
    id: string;
    testId: string;
    title: string;
    percent: number;
    score: number;
    maxScore: number;
  }[];
  scoreDistribution: { label: string; count: number }[];
};

export function StudentResultsPage() {
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [analytics, setAnalytics] = useState<StudentAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [attemptsRes, analyticsRes] = await Promise.all([
          api<{ attempts: AttemptRow[] }>("/api/student/attempts"),
          api<StudentAnalytics>("/api/student/analytics").catch(() => null),
        ]);
        if (!cancelled) {
          setAttempts(attemptsRes.attempts.filter((a) => a.submittedAt));
          setAnalytics(analyticsRes);
          setErr(null);
        }
      } catch {
        if (!cancelled) setErr("Could not load your results.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const published = useMemo(
    () => attempts.filter((a) => a.test.resultsPublished),
    [attempts]
  );
  const waiting = useMemo(
    () => attempts.filter((a) => !a.test.resultsPublished),
    [attempts]
  );

  const byTestChart: ChartDatum[] = useMemo(
    () =>
      (analytics?.byTest ?? []).slice(0, 8).map((t) => ({
        id: t.id,
        label: t.title,
        value: t.percent,
      })),
    [analytics]
  );

  const trendValues = useMemo(
    () => (analytics?.trend ?? []).map((t) => t.percent),
    [analytics]
  );

  return (
    <DashboardShell
      title="My results"
      subtitle="Placement readiness and performance analytics"
      nav={studentSidebarNav}
    >
      <section className="portal-hero portal-hero--light mb-5">
        <p className="portal-hero__kicker">Student · analytics</p>
        <h2 className="portal-hero__title text-slate-900">Your results</h2>
        <p className="portal-hero__lede">
          Placement readiness, strong and weak subjects, improvement over time, and test history.
        </p>
        <div className="portal-hero__actions">
          <span className="portal-hero__chip">
            {published.length} scored
          </span>
          <span className="portal-hero__chip">
            {waiting.length} waiting
          </span>
          <Link to="/dashboard/student/tests" className="btn-secondary !min-h-10">
            ← My tests
          </Link>
        </div>
      </section>

      {err ? <p className="soft-alert mb-4 border-red-200 bg-red-50 text-red-900">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading results…</p> : null}

      {!loading && analytics?.readiness ? (
        <div className="mb-8">
          <PlacementReadinessPanel
            data={analytics.readiness}
            scope="student"
            attemptHref={(id) => `/dashboard/student/attempts/${id}/result`}
          />
        </div>
      ) : null}

      {!loading && analytics && analytics.summary.scoredTests > 0 ? (
        <div className="mb-8 space-y-5">
          <h2 className="section-title">Score overview</h2>
          <div className="chart-overview">
            <div className="chart-overview__rings">
              <ScoreRing
                percent={
                  analytics.summary.readinessOverall ??
                  analytics.summary.averagePercent
                }
                label="Readiness"
                sublabel={`${analytics.summary.scoredTests} test${
                  analytics.summary.scoredTests === 1 ? "" : "s"
                }`}
              />
              <ScoreRing
                percent={analytics.summary.passRate}
                label="Pass rate"
                sublabel={`≥ ${analytics.summary.passMark}%`}
              />
            </div>
            <div className="chart-overview__panel">
              <h3 className="chart-panel-title">Score bands</h3>
              <p className="chart-panel-sub">Where your published scores sit</p>
              <DistributionBars bands={analytics.scoreDistribution} />
              {analytics.summary.bestTitle ? (
                <p className="mt-3 text-sm text-slate-600">
                  Best:{" "}
                  <span className="font-semibold text-slate-900">
                    {analytics.summary.bestPercent}%
                  </span>{" "}
                  on {analytics.summary.bestTitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="chart-grid">
            <section className="chart-card">
              <h3 className="chart-panel-title">Progress trend</h3>
              <p className="chart-panel-sub">Published scores over time</p>
              <Sparkline values={trendValues} height={72} />
            </section>
            <section className="chart-card">
              <h3 className="chart-panel-title">By test</h3>
              <p className="chart-panel-sub">Percent on each published paper</p>
              <HorizontalBarChart data={byTestChart} valueSuffix="%" />
            </section>
          </div>
        </div>
      ) : null}

      {!loading && attempts.length === 0 ? (
        <div className="empty-state space-y-3">
          <p>No submitted tests yet. When you finish a test, scores appear here.</p>
          <Link to="/dashboard/student/tests" className="btn-primary inline-flex min-h-11">
            Go to my tests
          </Link>
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <section className="mb-8 space-y-3">
          <h2 className="section-title">Waiting for unlock</h2>
          <ul className="divide-y divide-sky-100 overflow-hidden rounded-3xl border border-amber-200/70 bg-amber-50/30 shadow-warm">
            {waiting.map((a) => (
              <li key={a.id} className="px-4 py-4 sm:px-5">
                <p className="font-display font-semibold text-slate-900">{a.test.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Submitted {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}
                </p>
                <p className="mt-2">
                  <span className="badge-warn">
                    {formatResultsUnlockAt(a.test.resultsAutoReleaseAt) ??
                      "Results after exam ends"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {published.length > 0 ? (
        <section className="space-y-3">
          <h2 className="section-title">Published scores</h2>
          <ul className="divide-y divide-sky-100 overflow-hidden rounded-3xl border border-sky-200/60 bg-white/90 shadow-warm">
            {published.map((a) => {
              const max = a.maxScore ?? 0;
              const pct =
                max > 0 && a.score != null ? Math.round((a.score / max) * 100) : null;
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold text-slate-900">{a.test.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : ""}
                    </p>
                    {pct != null ? (
                      <div className="meter-bar mt-2 max-w-xs">
                        <span
                          className="bg-gradient-to-r from-brand-500 to-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-lg font-semibold tabular-nums text-slate-900">
                      {a.score ?? "—"}
                      <span className="text-sm font-medium text-slate-400"> / {max}</span>
                      {pct != null ? (
                        <span className="ml-2 text-sm font-medium text-brand-800">{pct}%</span>
                      ) : null}
                    </p>
                    <Link
                      to={`/dashboard/student/attempts/${a.id}/result`}
                      className="btn-secondary min-h-11"
                    >
                      Review
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}
