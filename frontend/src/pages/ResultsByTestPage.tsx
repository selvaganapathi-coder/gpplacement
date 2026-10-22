import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { IconChart, IconDownload } from "@/components/Icons";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { api, downloadResultsCsv } from "@/lib/api";
import { batchYearOf, formatAcademic, type Program } from "@/lib/academic";
import { getAssessmentType } from "@/lib/assessmentTypes";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type TestRow = {
  id: string;
  title: string;
  isPublished: boolean;
  resultsPublished: boolean;
  program: Program | null;
  levelType: string | null;
  level: number | null;
  assessmentType?: string;
  canEdit?: boolean;
  _count: { questions: number; attempts: number };
};

type AnalyticsLite = {
  summary: {
    submittedAttempts: number;
    averagePercent: number | null;
    passRate: number | null;
    flaggedAttempts: number;
    testsIncluded: number;
  };
  byTest: {
    testId: string;
    title: string;
    attempts: number;
    averagePercent: number;
    passRate: number;
    flaggedAttempts: number;
  }[];
};

type FilterChip = "attention" | "hidden" | "visible" | "all";
type SortMode = "submissions" | "name" | "awaiting";

type ResultsByTestPageProps = {
  role?: "staff" | "admin";
};

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function ResultsByTestPage({ role = "staff" }: ResultsByTestPageProps) {
  const scope = useStaffDepartmentScope();
  const listUrl = role === "admin" ? "/api/admin/tests" : "/api/staff/tests";
  const analyticsUrl =
    role === "admin" ? "/api/admin/analytics" : "/api/staff/analytics";
  const resultsBase =
    role === "admin" ? "/dashboard/admin/tests" : "/dashboard/staff/tests";
  const testsHref =
    role === "admin" ? "/dashboard/admin?tab=tests" : "/dashboard/staff/tests";
  const analyticsHref =
    role === "admin" ? "/dashboard/admin/analytics" : "/dashboard/staff/analytics";
  const newTestHref =
    role === "admin" ? "/dashboard/admin/tests/new" : "/dashboard/staff/tests/new";

  const [tests, setTests] = useState<TestRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsLite | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const catalog = useAcademicCatalog();
  const [q, setQ] = useState("");
  const [program, setProgram] = useState<Program | "">("");
  const [batch, setBatch] = useState<number | "">("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [sort, setSort] = useState<SortMode>("awaiting");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filterReady, setFilterReady] = useState(false);

  const load = useCallback(async () => {
    const [listRes, analyticsRes] = await Promise.all([
      api<{ tests: TestRow[] }>(listUrl),
      api<AnalyticsLite>(analyticsUrl).catch(() => null),
    ]);
    setTests(listRes.tests);
    setAnalytics(analyticsRes);
  }, [listUrl, analyticsUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await load();
        if (!cancelled) setErr(null);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load results.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const byTestStats = useMemo(() => {
    const map = new Map<string, AnalyticsLite["byTest"][number]>();
    for (const row of analytics?.byTest ?? []) map.set(row.testId, row);
    return map;
  }, [analytics]);

  const departments = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    if (role !== "staff") return all;
    if (!scope.managedPrograms.length) return [];
    return all.filter((dept) => scope.managedPrograms.includes(dept.id));
  }, [catalog.departments, role, scope.managedPrograms]);

  const audienceTests = useMemo(() => {
    return tests.filter((t) => {
      if (program && t.program !== program) return false;
      if (batch === "") return true;
      if (t.level == null) return !program || t.program === program;
      return batchYearOf(t.level) === batch;
    });
  }, [tests, program, batch]);

  const counts = useMemo(() => {
    const withAttempts = audienceTests.filter((t) => t._count.attempts > 0);
    const hidden = withAttempts.filter((t) => t.isPublished && !t.resultsPublished);
    const visible = withAttempts.filter((t) => t.resultsPublished);
    return {
      attention: hidden.length,
      hidden: hidden.length,
      visible: visible.length,
      all: withAttempts.length,
      totalTests: audienceTests.length,
    };
  }, [audienceTests]);

  useEffect(() => {
    if (role === "staff" && departments.length === 1 && program !== departments[0]!.id) {
      setProgram(departments[0]!.id);
    }
  }, [role, departments, program]);

  useEffect(() => {
    if (loading || filterReady) return;
    setFilter(counts.attention > 0 ? "attention" : "all");
    setFilterReady(true);
  }, [loading, filterReady, counts.attention]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = audienceTests.filter((t) => t._count.attempts > 0);
    if (filter === "attention" || filter === "hidden") {
      rows = rows.filter((t) => t.isPublished && !t.resultsPublished);
    } else if (filter === "visible") {
      rows = rows.filter((t) => t.resultsPublished);
    }
    if (needle) {
      rows = rows.filter((t) => t.title.toLowerCase().includes(needle));
    }
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "awaiting") {
        const aNeed = a.isPublished && !a.resultsPublished ? 0 : 1;
        const bNeed = b.isPublished && !b.resultsPublished ? 0 : 1;
        if (aNeed !== bNeed) return aNeed - bNeed;
      }
      return b._count.attempts - a._count.attempts;
    });
    return copy;
  }, [audienceTests, filter, q, sort]);

  const awaitingIds = useMemo(
    () =>
      tests
        .filter(
          (t) => t.isPublished && !t.resultsPublished && t._count.attempts > 0
        )
        .map((t) => t.id),
    [tests]
  );

  async function setResultsPublished(testId: string, publish: boolean) {
    setBusyId(testId);
    setErr(null);
    setMessage(null);
    try {
      await api(`/api/staff/tests/${testId}/publish-results`, {
        method: "POST",
        body: JSON.stringify({ resultsPublished: publish }),
      });
      setTests((prev) =>
        prev.map((t) =>
          t.id === testId ? { ...t, resultsPublished: publish } : t
        )
      );
      setMessage(publish ? "Scores are now visible to students." : "Scores hidden from students.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function releaseAllAwaiting() {
    if (!awaitingIds.length) return;
    setBulkBusy(true);
    setErr(null);
    setMessage(null);
    try {
      const res = await api<{ updated: number }>("/api/staff/tests/publish-results-bulk", {
        method: "POST",
        body: JSON.stringify({ testIds: awaitingIds, resultsPublished: true }),
      });
      setMessage(
        `Released scores for ${res.updated} test${res.updated === 1 ? "" : "s"}.`
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bulk release failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function downloadCsv(testId: string) {
    setBusyId(testId);
    setErr(null);
    try {
      await downloadResultsCsv(testId, role);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not download CSV.");
    } finally {
      setBusyId(null);
    }
  }

  const summary = analytics?.summary;
  const chips: { id: FilterChip; label: string; count: number }[] = [
    { id: "attention", label: "Needs release", count: counts.attention },
    { id: "all", label: "With scores", count: counts.all },
    { id: "visible", label: "Visible", count: counts.visible },
    { id: "hidden", label: "Hidden", count: counts.hidden },
  ];

  return (
    <DashboardShell
      title="Results"
      nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
    >
      <div className="results-page">
        <header className="results-page__intro">
          <div>
            <p className="results-page__kicker">Results desk</p>
            <h2 className="results-page__title">Scores by assessment</h2>
            <p className="results-page__lede">
              {role === "admin"
                ? "Review submissions, release scores to students, and export."
                : scope.departmentLabel
                  ? `${scope.departmentLabel} — review, release, and export scores.`
                  : "Review, release, and export scores by assessment."}
            </p>
          </div>
          <div className="results-page__actions">
            {awaitingIds.length > 0 ? (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void releaseAllAwaiting()}
                className="results-page__cta"
              >
                {bulkBusy
                  ? "Releasing…"
                  : `Release all (${awaitingIds.length})`}
              </button>
            ) : null}
            <Link to={analyticsHref} className="results-page__ghost">
              Analytics
            </Link>
            <Link to={testsHref} className="results-page__ghost">
              Assessments
            </Link>
          </div>
        </header>

        <div className="results-page__stats">
          <div className="results-page__stat">
            <span className="results-page__stat-value">
              {summary?.submittedAttempts ??
                tests.reduce((n, t) => n + t._count.attempts, 0)}
            </span>
            <span className="results-page__stat-label">Submissions</span>
          </div>
          <div className="results-page__stat">
            <span className="results-page__stat-value">
              {pct(summary?.averagePercent)}
            </span>
            <span className="results-page__stat-label">Average</span>
          </div>
          <div className="results-page__stat">
            <span className="results-page__stat-value">
              {pct(summary?.passRate)}
            </span>
            <span className="results-page__stat-label">Pass rate</span>
          </div>
          <div className="results-page__stat results-page__stat--warn">
            <span className="results-page__stat-value">{counts.attention}</span>
            <span className="results-page__stat-label">Need release</span>
          </div>
        </div>

        {err ? (
          <p className="soft-alert border-red-200 bg-red-50 text-red-900" role="alert">
            {err}
          </p>
        ) : null}
        {message ? (
          <p
            className="soft-alert border-emerald-200 bg-emerald-50 text-emerald-950"
            role="status"
          >
            {message}
          </p>
        ) : null}

        <div className="results-directory">
          <div className="results-directory__toolbar">
            <div className="tests-status-tabs" role="tablist" aria-label="Results filter">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === c.id}
                  onClick={() => setFilter(c.id)}
                  className={`tests-status-tab tests-status-tab--${
                    c.id === "attention" ? "awaiting" : c.id
                  } ${filter === c.id ? "tests-status-tab--active" : ""}`}
                >
                  <span className="tests-status-tab__count">{c.count}</span>
                  <span className="tests-status-tab__label">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="results-filters">
              <div className="results-filters__field">
                <label className="results-filters__label" htmlFor="results-dept">
                  Department
                </label>
                <select
                  id="results-dept"
                  value={program}
                  onChange={(e) => setProgram(e.target.value as Program | "")}
                  className="results-filters__control"
                  disabled={role === "staff" && departments.length <= 1}
                >
                  {departments.length === 1 ? (
                    <option value={departments[0]!.id}>{departments[0]!.label}</option>
                  ) : (
                    <>
                      <option value="">All departments</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.label}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div className="results-filters__field">
                <label className="results-filters__label" htmlFor="results-batch">
                  Batch
                </label>
                <select
                  id="results-batch"
                  value={batch === "" ? "" : String(batch)}
                  onChange={(e) => setBatch(e.target.value ? Number(e.target.value) : "")}
                  className="results-filters__control"
                >
                  <option value="">All batches</option>
                  {catalog.batchYears.map((year) => (
                    <option key={year} value={year}>
                      {year} batch
                    </option>
                  ))}
                </select>
              </div>
              <div className="results-filters__search">
                <label className="results-filters__label" htmlFor="results-search">
                  Search
                </label>
                <input
                  id="results-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by title…"
                  className="results-filters__control"
                />
              </div>
              <div className="results-filters__field">
                <label className="results-filters__label" htmlFor="results-sort">
                  Sort
                </label>
                <select
                  id="results-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="results-filters__control"
                >
                  <option value="awaiting">Needs release first</option>
                  <option value="submissions">Most submissions</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
              {program || batch !== "" || q.trim() ? (
                <button
                  type="button"
                  className="results-filters__clear"
                  onClick={() => {
                    if (!(role === "staff" && departments.length === 1)) setProgram("");
                    setBatch("");
                    setQ("");
                  }}
                >
                  Clear
                </button>
              ) : null}
              <span className="results-filters__count">
                {filtered.length}
                <span className="results-filters__count-sep">/</span>
                {counts.all}
              </span>
            </div>
          </div>

          <div className="results-directory__body">
            {loading ? (
              <p className="results-empty">Loading results…</p>
            ) : tests.length === 0 ? (
              <div className="results-empty-state">
                <p className="results-empty-state__title">No assessments yet</p>
                <p className="results-empty-state__lede">
                  Create and publish an assessment, then scores appear here.
                </p>
                <Link to={newTestHref} className="results-page__cta">
                  New assessment
                </Link>
              </div>
            ) : counts.all === 0 && !program && batch === "" && !q.trim() ? (
              <div className="results-empty-state">
                <p className="results-empty-state__title">No submissions yet</p>
                <p className="results-empty-state__lede">
                  When students finish a test, it shows up on this desk.
                </p>
                <Link to={testsHref} className="results-page__ghost">
                  Open assessments
                </Link>
              </div>
            ) : filtered.length === 0 ? (
              <p className="results-empty">
                {program || batch !== "" || q.trim()
                  ? "No assessments match this department, batch, or search."
                  : "Nothing in this view. Try With scores."}
              </p>
            ) : (
              <div className="results-table-wrap">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th scope="col">Assessment</th>
                      <th scope="col">Scores</th>
                      <th scope="col">Status</th>
                      <th className="results-table__actions" scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const type = getAssessmentType(t.assessmentType);
                      const audience = t.program
                        ? formatAcademic(t.program, t.levelType as never, t.level)
                        : "All students";
                      const stats = byTestStats.get(t.id);
                      const needsRelease = t.isPublished && !t.resultsPublished;
                      const busy = busyId === t.id;
                      const avg = stats?.averagePercent;

                      return (
                        <tr
                          key={t.id}
                          className={`results-tr ${
                            needsRelease ? "results-tr--awaiting" : "results-tr--visible"
                          }`}
                        >
                          <td>
                            <div className="results-table__title">{t.title}</div>
                            <div className="results-table__sub">
                              {type.label}
                              <span aria-hidden> · </span>
                              {audience}
                              <span aria-hidden> · </span>
                              {t._count.attempts} submission
                              {t._count.attempts === 1 ? "" : "s"}
                              {stats?.flaggedAttempts ? (
                                <>
                                  <span aria-hidden> · </span>
                                  {stats.flaggedAttempts} flagged
                                </>
                              ) : null}
                            </div>
                            {avg != null ? (
                              <div
                                className="results-desk-meter"
                                title={`Average ${pct(avg)}`}
                              >
                                <span
                                  className="results-desk-meter__fill"
                                  style={{
                                    width: `${Math.max(4, Math.min(100, avg))}%`,
                                  }}
                                />
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <div className="results-score-cell">
                              <span className="results-score-cell__avg">
                                {pct(avg)}
                              </span>
                              <span className="results-score-cell__meta">
                                avg · pass {pct(stats?.passRate)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`tests-badge ${
                                needsRelease
                                  ? "tests-badge--awaiting"
                                  : "tests-badge--results"
                              }`}
                            >
                              {needsRelease ? "Needs release" : "Visible"}
                            </span>
                          </td>
                          <td className="results-table__actions">
                            <div className="results-row__actions">
                              <Link
                                to={`${resultsBase}/${t.id}/results`}
                                className="tests-action tests-action--primary"
                              >
                                <IconChart className="h-3.5 w-3.5" aria-hidden />
                                Scores
                              </Link>
                              {needsRelease ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void setResultsPublished(t.id, true)}
                                  className="tests-action"
                                >
                                  {busy ? "…" : "Release"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void setResultsPublished(t.id, false)}
                                  className="tests-action"
                                >
                                  {busy ? "…" : "Hide"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void downloadCsv(t.id)}
                                className="tests-action"
                                title="Download CSV"
                              >
                                <IconDownload className="h-3.5 w-3.5" aria-hidden />
                                CSV
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
