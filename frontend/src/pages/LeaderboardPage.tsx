import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DepartmentScopeBanner } from "@/components/DepartmentScopeBanner";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import { api } from "@/lib/api";
import {
  SECTIONS,
  type Program,
} from "@/lib/academic";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";
import {
  adminSidebarNav,
  staffSidebarNav,
  studentSidebarNav,
} from "@/lib/dashboardNav";

type Scope = "overall" | "course" | "year" | "section";

type Row = {
  rank: number;
  userId: string;
  name: string;
  email: string;
  rollNo: string | null;
  classLabel: string;
  averagePercent: number;
  bestPercent: number;
  scoredTests: number;
  section: string | null;
};

type Payload = {
  scope: Scope;
  rows: Row[];
  groups: { key: string; label: string; rows: Row[] }[];
  you?: Row | null;
};

type LeaderboardPageProps = {
  role: "student" | "staff" | "admin";
};

const SCOPES: { id: Scope; label: string }[] = [
  { id: "overall", label: "Overall" },
  { id: "course", label: "Course" },
  { id: "year", label: "Year" },
  { id: "section", label: "Section" },
];

export function LeaderboardPage({ role }: LeaderboardPageProps) {
  const dept = useStaffDepartmentScope();
  const apiBase =
    role === "admin"
      ? "/api/admin/leaderboard"
      : role === "staff"
        ? "/api/staff/leaderboard"
        : "/api/student/leaderboard";
  const nav =
    role === "admin"
      ? adminSidebarNav
      : role === "staff"
        ? staffSidebarNav
        : studentSidebarNav;

  const [scope, setScope] = useState<Scope>(
    role === "student" ? "year" : "overall"
  );
  const [program, setProgram] = useState<Program | "">("");
  const [level, setLevel] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const catalog = useAcademicCatalog();
  const programs = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    if (role !== "staff") return all;
    if (!dept.managedPrograms.length) return [];
    return all.filter((p) => dept.managedPrograms.includes(p.id));
  }, [role, dept.managedPrograms, catalog.departments]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("scope", scope);
        if (role !== "student") {
          if (program) qs.set("program", program);
          if (level) {
            qs.set("levelType", "YEAR");
            qs.set("level", level);
          }
          if (section) qs.set("section", section);
        }
        const res = await api<Payload>(`${apiBase}?${qs.toString()}`);
        if (!cancelled) {
          setData(res);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load leaderboard.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, scope, program, level, section, role]);

  const topAvg = data?.rows[0]?.averagePercent ?? data?.groups[0]?.rows[0]?.averagePercent;
  const rankedCount =
    data?.groups.reduce((n, g) => n + g.rows.length, 0) ?? data?.rows.length ?? 0;

  function renderTable(rows: Row[], highlightId?: string | null) {
    if (rows.length === 0) {
      return (
        <p className="px-3.5 py-8 text-center text-sm text-slate-500">
          No rankings yet — publish scores to fill the board.
        </p>
      );
    }
    return (
      <div className="data-table-wrap">
        <table className="data-table leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Class</th>
              <th>Avg %</th>
              <th>Best %</th>
              <th>Tests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.userId}
                className={
                  highlightId && r.userId === highlightId
                    ? "leaderboard-table__you"
                    : undefined
                }
              >
                <td data-label="Rank" className="font-semibold tabular-nums">
                  <span
                    className={`leaderboard-rank ${
                      r.rank <= 3 ? `leaderboard-rank--${r.rank}` : ""
                    }`}
                  >
                    #{r.rank}
                  </span>
                </td>
                <td data-label="Name" className="font-medium text-slate-900">
                  {r.name}
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    {r.rollNo ? `Roll ${r.rollNo}` : r.email}
                  </span>
                </td>
                <td data-label="Class" className="text-slate-600">
                  {r.classLabel}
                </td>
                <td data-label="Avg %" className="tabular-nums font-semibold">
                  {r.averagePercent}%
                </td>
                <td data-label="Best %" className="tabular-nums">
                  {r.bestPercent}%
                </td>
                <td data-label="Tests" className="tabular-nums">
                  {r.scoredTests}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <DashboardShell
      title="Class leaderboard"
      subtitle="Overall · course · year · section rankings from published scores"
      nav={nav}
    >
      <div className="zoho-home leaderboard-zoho">
        {role === "staff" ? (
          <DepartmentScopeBanner
            departmentLabel={dept.departmentLabel}
            hasDepartment={dept.hasDepartment}
            loaded={dept.loaded}
          />
        ) : null}

        <header className="zoho-home__bar">
          <div className="zoho-home__bar-brand">
            <span className="zoho-home__mark" aria-hidden>
              {COLLEGE_BRAND.shortName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="zoho-home__bar-kicker">Rankings</p>
              <h2 className="zoho-home__bar-title">Class leaderboard</h2>
              <p className="zoho-home__bar-sub">
                Overall · course · year · section from published scores
              </p>
            </div>
          </div>
        </header>

        <section className="zoho-kpis leaderboard-zoho__kpis" aria-label="Board summary">
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Scope</p>
            <p className="zoho-kpi__value text-base capitalize">{scope}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Ranked</p>
            <p className="zoho-kpi__value">{loading ? "…" : rankedCount}</p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Top avg</p>
            <p className="zoho-kpi__value">
              {loading ? "…" : topAvg != null ? `${topAvg}%` : "—"}
            </p>
          </div>
          <div className="zoho-kpi">
            <p className="zoho-kpi__label">Groups</p>
            <p className="zoho-kpi__value">
              {loading ? "…" : data?.groups.length ? data.groups.length : 1}
            </p>
          </div>
        </section>

        <section className="zoho-panel leaderboard-zoho__filters">
          <div className="zoho-panel__head">
            <h3>View</h3>
            <span>Published scores only</span>
          </div>
          <div className="leaderboard-zoho__filter-body">
            <div className="tests-status-tabs" role="tablist" aria-label="Leaderboard scope">
              {SCOPES.filter((s) =>
                role === "student" ? s.id !== "overall" : true
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={`tests-status-tab ${
                    scope === s.id ? "tests-status-tab--active" : ""
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {role !== "student" ? (
              <div className="leaderboard-zoho__selects">
                <label className="students-zoho__field">
                  <span>Course</span>
                  <select
                    value={program}
                    onChange={(e) => setProgram(e.target.value as Program | "")}
                    className="form-input mt-0"
                  >
                    <option value="">All courses</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="students-zoho__field students-zoho__field--narrow">
                  <span>Batch</span>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="form-input mt-0"
                  >
                    <option value="">All</option>
                    {catalog.batchYears.map((year) => (
                      <option key={year} value={String(year)}>
                        {year} batch
                      </option>
                    ))}
                  </select>
                </label>
                <label className="students-zoho__field students-zoho__field--narrow">
                  <span>Section</span>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="form-input mt-0"
                  >
                    <option value="">All</option>
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>
        </section>

        {err ? (
          <p className="soft-alert border-red-200 bg-red-50 text-red-900">{err}</p>
        ) : null}

        {!loading && data?.you ? (
          <p className="leaderboard-zoho__you">
            Your rank: <strong>#{data.you.rank}</strong>
            <span aria-hidden> · </span>
            avg <strong>{data.you.averagePercent}%</strong>
            <span aria-hidden> · </span>
            {data.you.scoredTests} test{data.you.scoredTests === 1 ? "" : "s"}
          </p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Loading leaderboard…
          </p>
        ) : null}

        {!loading && data ? (
          data.groups.length > 0 ? (
            <div className="space-y-3">
              {data.groups.map((g) => (
                <section key={g.key} className="zoho-panel overflow-hidden">
                  <div className="zoho-panel__head">
                    <h3>{g.label}</h3>
                    <span>{g.rows.length} ranked</span>
                  </div>
                  {renderTable(g.rows, data.you?.userId)}
                </section>
              ))}
            </div>
          ) : (
            <section className="zoho-panel overflow-hidden">
              <div className="zoho-panel__head">
                <h3>
                  {scope === "overall"
                    ? "Overall rankings"
                    : `${scope.charAt(0).toUpperCase()}${scope.slice(1)} rankings`}
                </h3>
                <span>{data.rows.length} ranked</span>
              </div>
              {renderTable(data.rows, data.you?.userId)}
            </section>
          )
        ) : null}
      </div>
    </DashboardShell>
  );
}
