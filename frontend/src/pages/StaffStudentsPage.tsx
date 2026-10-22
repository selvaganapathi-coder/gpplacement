import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DistributionBars,
  HorizontalBarChart,
  ScoreRing,
  type ChartDatum,
} from "@/components/charts";
import { DashboardShell } from "@/components/DashboardShell";
import { IconChart, IconClipboard } from "@/components/Icons";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { api, downloadStudentMarksReport } from "@/lib/api";
import { programOptions, type Program } from "@/lib/academic";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type RosterStudent = {
  id: string;
  name: string;
  email: string;
  rollNo: string | null;
  program: Program | null;
  classLabel: string;
  submitted: number;
  scored: number;
  averagePercent: number | null;
  bestPercent: number | null;
  lastSubmittedAt: string | null;
};

type StaffStudentsPageProps = {
  role?: "staff" | "admin";
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

export function StaffStudentsPage({ role = "staff" }: StaffStudentsPageProps) {
  const scope = useStaffDepartmentScope();
  const listUrl =
    role === "admin" ? "/api/admin/students-roster" : "/api/staff/students";
  const detailBase =
    role === "admin" ? "/dashboard/admin/students" : "/dashboard/staff/students";
  const resultsHref =
    role === "admin" ? "/dashboard/admin/results" : "/dashboard/staff/results";
  const analyticsHref =
    role === "admin" ? "/dashboard/admin/analytics" : "/dashboard/staff/analytics";

  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [totals, setTotals] = useState({ students: 0, withScores: 0 });
  const [q, setQ] = useState("");
  const [program, setProgram] = useState<Program | "">("");
  const [filter, setFilter] = useState<"all" | "scored" | "none">("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const programChoices = useMemo(() => {
    const all = programOptions();
    if (role !== "staff") return all;
    if (!scope.managedPrograms.length) return [];
    return all.filter((p) => scope.managedPrograms.includes(p.id));
  }, [role, scope.managedPrograms]);

  useEffect(() => {
    if (role === "staff" && programChoices.length === 1 && !program) {
      setProgram(programChoices[0]!.id);
    }
  }, [role, programChoices, program]);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          if (q.trim()) params.set("q", q.trim());
          if (program) params.set("program", program);
          const qs = params.toString();
          const res = await api<{
            students: RosterStudent[];
            totals: { students: number; withScores: number };
          }>(`${listUrl}${qs ? `?${qs}` : ""}`);
          if (!cancelled) {
            setStudents(res.students);
            setTotals(res.totals);
            setErr(null);
          }
        } catch (e) {
          if (!cancelled) {
            setErr(e instanceof Error ? e.message : "Could not load students.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [listUrl, q, program]);

  const filterCounts = useMemo(
    () => ({
      all: students.length,
      scored: students.filter((s) => s.scored > 0).length,
      none: students.filter((s) => s.submitted === 0).length,
    }),
    [students]
  );

  const filtered = useMemo(() => {
    let rows = students;
    if (filter === "scored") rows = rows.filter((s) => s.scored > 0);
    if (filter === "none") rows = rows.filter((s) => s.submitted === 0);
    return rows;
  }, [students, filter]);

  const topChart: ChartDatum[] = useMemo(
    () =>
      [...filtered]
        .filter((s) => s.averagePercent != null)
        .sort((a, b) => (b.averagePercent ?? 0) - (a.averagePercent ?? 0))
        .slice(0, 8)
        .map((s) => ({
          id: s.id,
          label: s.name.split(/\s+/)[0] || s.name,
          value: s.averagePercent ?? 0,
        })),
    [filtered]
  );

  const bandCounts = useMemo(() => {
    const bands = [
      { label: "0–39%", count: 0 },
      { label: "40–59%", count: 0 },
      { label: "60–74%", count: 0 },
      { label: "75–89%", count: 0 },
      { label: "90–100%", count: 0 },
    ];
    for (const s of filtered) {
      const p = s.averagePercent;
      if (p == null) continue;
      if (p < 40) bands[0]!.count += 1;
      else if (p < 60) bands[1]!.count += 1;
      else if (p < 75) bands[2]!.count += 1;
      else if (p < 90) bands[3]!.count += 1;
      else bands[4]!.count += 1;
    }
    return bands;
  }, [filtered]);

  const deptAvg = useMemo(() => {
    const scored = filtered.filter((s) => s.averagePercent != null);
    if (!scored.length) return null;
    return (
      Math.round(
        (scored.reduce((sum, s) => sum + (s.averagePercent ?? 0), 0) / scored.length) * 10
      ) / 10
    );
  }, [filtered]);

  const coverage =
    totals.students > 0
      ? Math.round((totals.withScores / totals.students) * 1000) / 10
      : null;

  async function downloadCsv(studentId: string) {
    setBusyId(studentId);
    setErr(null);
    try {
      await downloadStudentMarksReport(studentId, role);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "CSV download failed.");
    } finally {
      setBusyId(null);
    }
  }

  const scopeLine =
    role === "admin"
      ? "Campus-wide student scores"
      : scope.departmentLabel
        ? `${scope.departmentLabel} · student performance`
        : "Student performance for your department";

  return (
    <DashboardShell
      title="Students"
      subtitle={scopeLine}
      nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
    >
      <div className="zoho-home students-zoho">
        <header className="zoho-home__bar">
          <div className="zoho-home__bar-brand">
            <span className="zoho-home__mark" aria-hidden>
              {COLLEGE_BRAND.shortName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="zoho-home__bar-kicker">Student desk</p>
              <h2 className="zoho-home__bar-title">By student</h2>
              <p className="zoho-home__bar-sub">
                Search, open a score card, or download marks CSV
              </p>
            </div>
          </div>
          <div className="zoho-home__bar-actions">
            <Link to={resultsHref} className="zoho-home__btn zoho-home__btn--primary">
              Results by test
            </Link>
            <Link to={analyticsHref} className="zoho-home__btn">
              Analytics
            </Link>
          </div>
        </header>

        <section className="zoho-home__section" aria-labelledby="students-apps-heading">
          <div className="zoho-home__section-head">
            <h3 id="students-apps-heading">Apps</h3>
            <span>Related workspaces</span>
          </div>
          <div className="zoho-apps students-zoho__apps">
            <Link to={resultsHref} className="zoho-app zoho-app--amber">
              <span className="zoho-app__icon" aria-hidden>
                <IconClipboard className="h-5 w-5" />
              </span>
              <span className="zoho-app__label">Results desk</span>
              <span className="zoho-app__sub">By exam / attendance</span>
            </Link>
            <Link to={analyticsHref} className="zoho-app zoho-app--cyan">
              <span className="zoho-app__icon" aria-hidden>
                <IconChart className="h-5 w-5" />
              </span>
              <span className="zoho-app__label">Analytics</span>
              <span className="zoho-app__sub">Campus insights</span>
            </Link>
          </div>
        </section>

        <section className="zoho-kpis students-zoho__kpis" aria-label="Roster summary">
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Students</p>
            <p className="zoho-kpi__value">{totals.students}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">With scores</p>
            <p className="zoho-kpi__value">{totals.withScores}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Class avg</p>
            <p className="zoho-kpi__value">
              {deptAvg != null ? `${deptAvg}%` : "—"}
            </p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Coverage</p>
            <p className="zoho-kpi__value">
              {coverage != null ? `${coverage}%` : "—"}
            </p>
          </div>
        </section>

        {!loading && totals.students > 0 ? (
          <div className="chart-overview students-zoho__charts">
            <div className="chart-overview__rings">
              <ScoreRing
                percent={deptAvg}
                label="Class avg"
                sublabel={`${totals.withScores} with scores`}
              />
              <ScoreRing
                percent={coverage}
                label="Coverage"
                sublabel={`${totals.students} students`}
              />
            </div>
            <div className="chart-overview__panel">
              <h3 className="chart-panel-title">Average bands</h3>
              <p className="chart-panel-sub">Students by their average %</p>
              <DistributionBars bands={bandCounts} />
              {topChart.length > 0 ? (
                <div className="mt-4">
                  <h3 className="chart-panel-title">Top averages</h3>
                  <HorizontalBarChart data={topChart} valueSuffix="%" />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="zoho-panel students-zoho__roster" aria-labelledby="students-roster-heading">
          <div className="zoho-panel__head">
            <h3 id="students-roster-heading">Roster</h3>
            <span className="text-[11px] font-semibold text-slate-500">
              {loading ? "Loading…" : `${filtered.length} shown`}
            </span>
          </div>

          <div className="students-zoho__toolbar">
            <div className="tests-status-tabs" role="tablist" aria-label="Student filter">
              {(
                [
                  { id: "all" as const, label: "All", count: filterCounts.all },
                  {
                    id: "scored" as const,
                    label: "With scores",
                    count: filterCounts.scored,
                  },
                  {
                    id: "none" as const,
                    label: "No attempts",
                    count: filterCounts.none,
                  },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === chip.id}
                  onClick={() => setFilter(chip.id)}
                  className={`tests-status-tab ${
                    filter === chip.id ? "tests-status-tab--active" : ""
                  }`}
                >
                  {chip.label}
                  <span className="tests-status-tab__count">{chip.count}</span>
                </button>
              ))}
            </div>
            <div className="students-zoho__toolbar-right">
              {programChoices.length > 1 || role === "admin" ? (
                <label className="students-zoho__field">
                  <span>Program</span>
                  <select
                    value={program}
                    onChange={(e) => setProgram((e.target.value || "") as Program | "")}
                    className="form-input mt-0"
                  >
                    <option value="">All programs</option>
                    {programChoices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="students-zoho__field students-zoho__field--search">
                <span>Search</span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, email, roll…"
                  className="form-input mt-0"
                />
              </label>
            </div>
          </div>

          {err ? (
            <p className="soft-alert m-3 border-red-200 bg-red-50 text-red-900">{err}</p>
          ) : null}

          {loading ? (
            <p className="px-3.5 py-8 text-center text-sm text-slate-500">
              Loading students…
            </p>
          ) : filtered.length === 0 ? (
            <div className="empty-state !my-0 !rounded-none !border-0 !border-t !border-[#e5e8eb]">
              <p>No students match this view.</p>
            </div>
          ) : (
            <>
              <div className="students-zoho__table-head" aria-hidden>
                <span>Student</span>
                <span>Activity</span>
                <span>Average</span>
                <span>Actions</span>
              </div>
              <ul className="students-zoho__list">
                {filtered.map((s) => (
                  <li key={s.id} className="students-zoho__row">
                    <div className="students-zoho__person">
                      <span className="students-zoho__avatar" aria-hidden>
                        {initials(s.name)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          to={`${detailBase}/${s.id}`}
                          className="students-zoho__name"
                        >
                          {s.name}
                        </Link>
                        <p className="students-zoho__meta">
                          {s.rollNo ? `Roll ${s.rollNo} · ` : ""}
                          {s.classLabel}
                        </p>
                        <p className="students-zoho__email">{s.email}</p>
                      </div>
                    </div>
                    <div className="students-zoho__activity">
                      <p>
                        <strong className="tabular-nums">{s.submitted}</strong> submitted
                      </p>
                      <p>
                        <strong className="tabular-nums">{s.scored}</strong> scored
                        {s.bestPercent != null ? (
                          <span className="text-slate-400">
                            {" "}
                            · best {s.bestPercent}%
                          </span>
                        ) : null}
                      </p>
                      {s.lastSubmittedAt ? (
                        <p className="students-zoho__when">
                          Last {new Date(s.lastSubmittedAt).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="students-zoho__when">No submissions yet</p>
                      )}
                    </div>
                    <div className="students-zoho__avg">
                      {s.averagePercent != null ? (
                        <>
                          <p className="students-zoho__avg-value tabular-nums">
                            {s.averagePercent}%
                          </p>
                          <div
                            className="results-desk-meter"
                            title={`Avg ${s.averagePercent}%`}
                          >
                            <span
                              className="results-desk-meter__fill"
                              style={{
                                width: `${Math.max(4, Math.min(100, s.averagePercent))}%`,
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="students-zoho__avg-empty">—</span>
                      )}
                    </div>
                    <div className="students-zoho__actions">
                      <Link
                        to={`${detailBase}/${s.id}`}
                        className="btn-primary !min-h-9 !px-3 !text-xs"
                      >
                        View card
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => void downloadCsv(s.id)}
                        className="btn-secondary !min-h-9 !px-3 !text-xs"
                      >
                        {busyId === s.id ? "…" : "CSV"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
