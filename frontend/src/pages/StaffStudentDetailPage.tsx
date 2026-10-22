import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { api, downloadStudentMarksReport } from "@/lib/api";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type Detail = {
  student: {
    id: string;
    name: string;
    email: string;
    rollNo: string | null;
    classLabel: string;
  };
  summary: {
    submitted: number;
    scored: number;
    averagePercent: number | null;
    bestPercent: number | null;
    passRate: number | null;
    passMark: number;
    readinessOverall?: number | null;
  };
  readiness?: PlacementReadiness;
  scoreDistribution: { label: string; count: number }[];
  attempts: {
    attemptId: string;
    testId: string;
    title: string;
    submittedAt: string | null;
    score: number | null;
    maxScore: number;
    percent: number | null;
    resultsPublished: boolean;
  }[];
};

type StaffStudentDetailPageProps = {
  role?: "staff" | "admin";
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

export function StaffStudentDetailPage({
  role = "staff",
}: StaffStudentDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const apiBase =
    role === "admin" ? "/api/admin/students-roster" : "/api/staff/students";
  const listHref =
    role === "admin" ? "/dashboard/admin/students" : "/dashboard/staff/students";
  const resultsBase =
    role === "admin" ? "/dashboard/admin/tests" : "/dashboard/staff/tests";

  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [csvErr, setCsvErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api<Detail>(`${apiBase}/${id}`);
        if (!cancelled) {
          setData(res);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load student.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, id]);

  const byTestChart: ChartDatum[] = useMemo(
    () =>
      (data?.attempts ?? [])
        .filter((a) => a.percent != null)
        .slice(0, 10)
        .map((a) => ({
          id: a.attemptId,
          label: a.title,
          value: a.percent ?? 0,
        })),
    [data]
  );

  const trend = useMemo(() => {
    const scored = [...(data?.attempts ?? [])]
      .filter((a) => a.percent != null && a.submittedAt)
      .sort(
        (a, b) =>
          new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime()
      );
    return scored.map((a) => a.percent!);
  }, [data]);

  async function onDownloadCsv() {
    if (!id) return;
    setDownloading(true);
    setCsvErr(null);
    try {
      await downloadStudentMarksReport(id, role);
    } catch (e) {
      setCsvErr(e instanceof Error ? e.message : "CSV download failed.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell
        title="Student"
        subtitle="Loading score card…"
        nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
      >
        <p className="px-1 py-10 text-center text-sm text-slate-500">Loading…</p>
      </DashboardShell>
    );
  }

  if (err || !data) {
    return (
      <DashboardShell
        title="Student"
        subtitle=""
        nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
      >
        <div className="zoho-panel p-4">
          <p className="text-sm text-slate-600">{err ?? "Not found."}</p>
          <Link
            to={listHref}
            className="mt-3 inline-block text-[13px] font-semibold text-orange-700 hover:underline"
          >
            ← Students
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const { student, summary } = data;

  return (
    <DashboardShell
      title={student.name}
      subtitle={`${student.classLabel}${student.rollNo ? ` · Roll ${student.rollNo}` : ""}`}
      nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
    >
      <div className="zoho-home students-zoho">
        <header className="zoho-home__bar">
          <div className="zoho-home__bar-brand">
            <span className="students-zoho__avatar students-zoho__avatar--lg" aria-hidden>
              {initials(student.name)}
            </span>
            <div>
              <p className="zoho-home__bar-kicker">Student score card</p>
              <h2 className="zoho-home__bar-title">{student.name}</h2>
              <p className="zoho-home__bar-sub">
                {student.email}
                {student.rollNo ? ` · Roll ${student.rollNo}` : ""} · {student.classLabel}
              </p>
            </div>
          </div>
          <div className="zoho-home__bar-actions">
            <Link to={listHref} className="zoho-home__btn">
              ← All students
            </Link>
            <button
              type="button"
              disabled={downloading}
              onClick={() => void onDownloadCsv()}
              className="zoho-home__btn zoho-home__btn--primary"
            >
              {downloading ? "Downloading…" : "Download CSV"}
            </button>
          </div>
        </header>

        {csvErr ? (
          <p className="soft-alert border-red-200 bg-red-50 text-red-900">{csvErr}</p>
        ) : null}

        <section className="zoho-kpis students-zoho__kpis" aria-label="Student summary">
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Submitted</p>
            <p className="zoho-kpi__value">{summary.submitted}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Scored</p>
            <p className="zoho-kpi__value">{summary.scored}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Average</p>
            <p className="zoho-kpi__value">
              {summary.averagePercent != null ? `${summary.averagePercent}%` : "—"}
            </p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Best</p>
            <p className="zoho-kpi__value">
              {summary.bestPercent != null ? `${summary.bestPercent}%` : "—"}
            </p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Pass rate</p>
            <p className="zoho-kpi__value">
              {summary.passRate != null ? `${summary.passRate}%` : "—"}
            </p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Readiness</p>
            <p className="zoho-kpi__value">
              {summary.readinessOverall != null
                ? `${summary.readinessOverall}%`
                : "—"}
            </p>
          </div>
        </section>

        {data.readiness ? (
          <div className="mb-1">
            <PlacementReadinessPanel
              data={data.readiness}
              scope="student"
              showHistory
              attemptHref={(attemptId) => {
                const row = data.attempts.find((a) => a.attemptId === attemptId);
                return row
                  ? `${resultsBase}/${row.testId}/attempts/${attemptId}`
                  : `${resultsBase}`;
              }}
            />
          </div>
        ) : null}

        <div className="chart-overview students-zoho__charts">
          <div className="chart-overview__rings">
            <ScoreRing
              percent={summary.readinessOverall ?? summary.averagePercent}
              label="Readiness"
              sublabel={`${summary.scored} scored`}
            />
            <ScoreRing
              percent={summary.passRate}
              label="Pass rate"
              sublabel={`≥ ${summary.passMark}%`}
            />
          </div>
          <div className="chart-overview__panel">
            <h3 className="chart-panel-title">Score bands</h3>
            <p className="chart-panel-sub">This student’s scored attempts</p>
            <DistributionBars bands={data.scoreDistribution} />
            {summary.bestPercent != null ? (
              <p className="mt-3 text-sm text-slate-600">
                Best score:{" "}
                <span className="font-semibold text-slate-900">{summary.bestPercent}%</span>
              </p>
            ) : null}
          </div>
        </div>

        {summary.scored > 0 ? (
          <div className="chart-grid">
            <section className="chart-card">
              <h3 className="chart-panel-title">Trend</h3>
              <p className="chart-panel-sub">Scores over time</p>
              <Sparkline values={trend} height={72} />
            </section>
            <section className="chart-card">
              <h3 className="chart-panel-title">By test</h3>
              <p className="chart-panel-sub">Percent on each paper</p>
              <HorizontalBarChart data={byTestChart} valueSuffix="%" />
            </section>
          </div>
        ) : null}

        <section className="zoho-panel" aria-labelledby="student-attempts-heading">
          <div className="zoho-panel__head">
            <h3 id="student-attempts-heading">Attempts</h3>
            <span className="text-[11px] font-semibold text-slate-500">
              {data.attempts.length}
            </span>
          </div>
          {data.attempts.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-slate-500">
              No submitted attempts yet.
            </p>
          ) : (
            <ul className="students-zoho__list">
              {data.attempts.map((a) => (
                <li key={a.attemptId} className="students-zoho__attempt">
                  <div className="min-w-0 flex-1">
                    <p className="students-zoho__name !text-[14px]">{a.title}</p>
                    <p className="students-zoho__meta">
                      {a.submittedAt
                        ? new Date(a.submittedAt).toLocaleString()
                        : "—"}
                      {" · "}
                      {a.resultsPublished ? "Visible to student" : "Hidden from student"}
                    </p>
                  </div>
                  <div className="students-zoho__attempt-score">
                    <p className="tabular-nums">
                      {a.score != null ? `${a.score}/${a.maxScore}` : "—"}
                      {a.percent != null ? (
                        <span className="ml-1 text-sm font-semibold text-orange-700">
                          {a.percent}%
                        </span>
                      ) : null}
                    </p>
                    <Link
                      to={`${resultsBase}/${a.testId}/results`}
                      className="btn-secondary !min-h-9 !px-3 !text-xs"
                    >
                      Test results
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
