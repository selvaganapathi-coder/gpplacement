import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { api } from "@/lib/api";
import { staffSidebarNav } from "@/lib/dashboardNav";

type Summary = {
  draftTests: number;
  publishedAwaitingResults: number;
  testsWithPendingAttempts: number;
  pendingSubmissions: number;
};

function shortDept(label: string | null): string {
  if (!label) return "Department";
  return label.replace(/\s*\(all years\)\s*$/i, "").trim() || label;
}

export function StaffDashboard() {
  const scope = useStaffDepartmentScope();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void api<Summary>("/api/staff/dashboard-summary")
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const dept = scope.departmentLabel;
  const deptShort = shortDept(dept);
  const hasScores =
    (summary?.pendingSubmissions ?? 0) > 0 ||
    (summary?.testsWithPendingAttempts ?? 0) > 0;

  return (
    <DashboardShell
      title={`${deptShort} staff`}
      subtitle={dept ? `${dept} · workspace` : "Staff workspace"}
      nav={staffSidebarNav}
    >
      {!scope.loaded ? (
        <div className="staff-home staff-home--loading" aria-busy="true">
          <div className="staff-home__skeleton" />
        </div>
      ) : !scope.hasDepartment ? (
        <p className="soft-alert mb-5 border-amber-200 bg-amber-50 text-amber-950">
          Your account has no department yet. Ask an admin to assign your department before you
          can create or manage assessments.
        </p>
      ) : (
        <div className="staff-home">
          <header className="staff-home__bar">
            <div className="staff-home__bar-main">
              <p className="staff-home__kicker">Department workspace</p>
              <h2 className="staff-home__title">{dept}</h2>
              <p className="staff-home__lede">
                Create papers, publish to class, then review and release scores — all in one place.
              </p>
            </div>
            <div className="staff-home__bar-actions">
              <Link to="/dashboard/staff/tests/new" className="staff-home__btn staff-home__btn--primary">
                + New assessment
              </Link>
              <Link to="/dashboard/staff/results" className="staff-home__btn">
                {hasScores ? "Results desk" : "Open results"}
              </Link>
            </div>
          </header>

          <ol className="staff-home__flow" aria-label="Workflow">
            <li>
              <span className="staff-home__flow-num">1</span>
              <span className="staff-home__flow-text">
                <strong>Create</strong>
                <em>Add questions</em>
              </span>
            </li>
            <li className="staff-home__flow-sep" aria-hidden>
              →
            </li>
            <li>
              <span className="staff-home__flow-num">2</span>
              <span className="staff-home__flow-text">
                <strong>Publish</strong>
                <em>Students can take it</em>
              </span>
            </li>
            <li className="staff-home__flow-sep" aria-hidden>
              →
            </li>
            <li>
              <span className="staff-home__flow-num">3</span>
              <span className="staff-home__flow-text">
                <strong>Results</strong>
                <em>View &amp; release</em>
              </span>
            </li>
          </ol>

          {summary ? (
            <section className="staff-home__section" aria-labelledby="staff-kpis-heading">
              <div className="staff-home__section-head">
                <h3 id="staff-kpis-heading">At a glance</h3>
                <span>{deptShort}</span>
              </div>
              <div className="staff-home__kpis">
                <Link to="/dashboard/staff/tests" className="staff-home__kpi">
                  <p className="staff-home__kpi-label">Drafts</p>
                  <p className="staff-home__kpi-value">{summary.draftTests}</p>
                  <p className="staff-home__kpi-hint">Open assessments</p>
                </Link>
                <Link to="/dashboard/staff/results" className="staff-home__kpi">
                  <p className="staff-home__kpi-label">Submissions</p>
                  <p className="staff-home__kpi-value">{summary.pendingSubmissions}</p>
                  <p className="staff-home__kpi-hint">View by test</p>
                </Link>
                <Link to="/dashboard/staff/results" className="staff-home__kpi">
                  <p className="staff-home__kpi-label">Tests scored</p>
                  <p className="staff-home__kpi-value">{summary.testsWithPendingAttempts}</p>
                  <p className="staff-home__kpi-hint">With attempts</p>
                </Link>
                <Link
                  to="/dashboard/staff/results"
                  className="staff-home__kpi staff-home__kpi--accent"
                >
                  <p className="staff-home__kpi-label">Hidden scores</p>
                  <p className="staff-home__kpi-value">{summary.publishedAwaitingResults}</p>
                  <p className="staff-home__kpi-hint">Ready to release</p>
                </Link>
              </div>
            </section>
          ) : null}

          <section className="staff-home__section" aria-labelledby="staff-apps-heading">
            <div className="staff-home__section-head">
              <h3 id="staff-apps-heading">Quick links</h3>
              <span>Jump to a workspace</span>
            </div>
            <div className="staff-home__apps">
              <Link to="/dashboard/staff/results" className="staff-home__app">
                <span className="staff-home__app-icon staff-home__app-icon--amber" aria-hidden>
                  R
                </span>
                <span className="staff-home__app-title">Results desk</span>
                <span className="staff-home__app-sub">
                  View scores, release to class, CSV &amp; analytics
                </span>
              </Link>
              <Link to="/dashboard/staff/students" className="staff-home__app">
                <span className="staff-home__app-icon staff-home__app-icon--blue" aria-hidden>
                  S
                </span>
                <span className="staff-home__app-title">Students</span>
                <span className="staff-home__app-sub">
                  Search by name — score card &amp; CSV per student
                </span>
              </Link>
              <Link to="/dashboard/staff/tests" className="staff-home__app">
                <span className="staff-home__app-icon staff-home__app-icon--teal" aria-hidden>
                  A
                </span>
                <span className="staff-home__app-title">Assessments</span>
                <span className="staff-home__app-sub">Publish, schedule, and edit papers</span>
              </Link>
              <Link to="/dashboard/staff/analytics" className="staff-home__app">
                <span className="staff-home__app-icon staff-home__app-icon--cyan" aria-hidden>
                  Σ
                </span>
                <span className="staff-home__app-title">Analytics</span>
                <span className="staff-home__app-sub">Class performance overview</span>
              </Link>
            </div>
          </section>

        </div>
      )}
    </DashboardShell>
  );
}
