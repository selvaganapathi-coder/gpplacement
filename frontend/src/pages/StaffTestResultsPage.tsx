import { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useParams } from "react-router-dom";
import { DistributionBars, ScoreRing } from "@/components/charts";
import { DashboardShell } from "@/components/DashboardShell";
import { IconChart, IconDownload, IconUsers } from "@/components/Icons";
import { ResultsModal } from "@/components/ResultsModal";
import {
  StudentTestResultView,
  type AttemptResult,
} from "@/components/StudentTestResultView";
import { useStaffDepartmentScope } from "@/hooks/useStaffDepartmentScope";
import { api, downloadResultsCsv } from "@/lib/api";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import { batchYearOf, formatAcademic, type LevelType, type Program } from "@/lib/academic";
import {
  getAssessmentType,
  isFacultyScoredAssessment,
  isMcqAssessment,
} from "@/lib/assessmentTypes";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type AttemptRow = {
  id: string;
  userId: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  percentage?: number | null;
  rank?: number | null;
  cohortSize?: number | null;
  passed?: boolean | null;
  scoreNote?: string | null;
  tabSwitchCount?: number;
  fullscreenExitCount?: number;
  proctorFlagged?: boolean;
  user: {
    name: string;
    email: string;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
  };
};

type RosterStudent = {
  id: string;
  name: string;
  email: string;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  rollNo: string | null;
  status: "attended" | "absent";
  attempt: {
    id: string;
    score: number | null;
    percentage: number | null;
    rank: number | null;
    passed: boolean | null;
    submittedAt: string | null;
    proctorFlagged: boolean;
  } | null;
};

type DeptRoster = {
  program: Program | null;
  label: string;
  total: number;
  attendedCount: number;
  notAttendedCount: number;
  averagePercent: number | null;
  years: {
    level: number | null;
    label: string;
    total: number;
    attendedCount: number;
    notAttendedCount: number;
    students: RosterStudent[];
  }[];
  students: RosterStudent[];
};

type ResultsTest = {
  id: string;
  title: string;
  isPublished: boolean;
  resultsPublished: boolean;
  resultsPublishedAt: string | null;
  availableUntil?: string | null;
  resultsAutoReleaseAt?: string | null;
  resultsAutoReleaseMinutes?: number;
  assessmentType?: string;
  passPercentage?: number | null;
  program?: Program | null;
  levelType?: LevelType | null;
  level?: number | null;
  questions: { id: string }[];
  attempts: AttemptRow[];
};

type ReviewPayload = AttemptResult & {
  student: {
    id: string;
    name: string;
    email: string;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
  };
  attempt: AttemptResult["attempt"] & {
    scoreNote?: string | null;
    proctorFlagged?: boolean;
    tabSwitchCount?: number;
    fullscreenExitCount?: number;
  };
};

type ResultsFilterState = {
  search: string;
  program: Program | "";
  year: number | "";
  minScore: string;
  maxScore: string;
  outcome: "all" | "pass" | "fail";
  flaggedOnly: boolean;
  sort: "rank" | "score" | "name" | "recent";
};

function sameBatch(level: number | null | undefined, year: number): boolean {
  if (level == null) return false;
  return level === year || batchYearOf(level) === year;
}

const defaultFilters: ResultsFilterState = {
  search: "",
  program: "",
  year: "",
  minScore: "",
  maxScore: "",
  outcome: "all",
  flaggedOnly: false,
  sort: "rank",
};

type ViewMode = "exam" | "dept";
type AttendanceFilter = "all" | "attended" | "absent";

type StaffTestResultsPageProps = {
  role?: "staff" | "admin";
};

function parseScoreBound(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function attemptPct(a: AttemptRow, maxScore: number): number | null {
  if (a.percentage != null) return Math.round(a.percentage * 10) / 10;
  if (a.score != null && maxScore > 0) {
    return Math.round((a.score / maxScore) * 1000) / 10;
  }
  return null;
}

function FacultyScoreForm({
  testId,
  maxScore,
  onSaved,
  initialEmail = "",
}: {
  testId: string;
  maxScore: number;
  onSaved: () => Promise<void>;
  initialEmail?: string;
}) {
  const [studentEmail, setStudentEmail] = useState(initialEmail);
  const [score, setScore] = useState("");
  const [scoreNote, setScoreNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStudentEmail(initialEmail);
  }, [initialEmail]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const n = Number(score);
    if (!studentEmail.trim()) {
      setError("Enter the student’s email.");
      return;
    }
    if (!Number.isFinite(n)) {
      setError("Enter a valid score.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await api(`/api/staff/tests/${testId}/scores`, {
            method: "POST",
            body: JSON.stringify({
              studentEmail: studentEmail.trim(),
              score: n,
              scoreNote: scoreNote.trim() || null,
            }),
          });
          setMessage("Score saved.");
          setScore("");
          setScoreNote("");
          await onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save score.");
        }
      })();
    });
  }

  return (
    <form onSubmit={onSubmit} className="results-score-form">
      <h3 className="results-score-form__title">Enter / update faculty score</h3>
      <div className="results-score-form__grid">
        <label className="results-score-form__field results-score-form__field--wide">
          <span>Student email</span>
          <input
            type="email"
            required
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            placeholder="student@college.edu"
          />
        </label>
        <label className="results-score-form__field">
          <span>Score (max {maxScore})</span>
          <input
            type="number"
            min={0}
            max={maxScore}
            required
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </label>
        <label className="results-score-form__field">
          <span>Note</span>
          <input
            value={scoreNote}
            onChange={(e) => setScoreNote(e.target.value)}
            placeholder="Optional feedback"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="results-page__cta mt-3">
        {pending ? "Saving…" : "Save score"}
      </button>
    </form>
  );
}

export function StaffTestResultsPage({ role = "staff" }: StaffTestResultsPageProps) {
  const { id } = useParams<{ id: string }>();
  const scope = useStaffDepartmentScope();
  const apiBase = role === "admin" ? "/api/admin/tests" : "/api/staff/tests";
  const resultsDeskHref =
    role === "admin" ? "/dashboard/admin/results" : "/dashboard/staff/results";
  const listHref = role === "admin" ? "/dashboard/admin?tab=tests" : "/dashboard/staff/tests";
  const analyticsHref =
    role === "admin"
      ? `/dashboard/admin/analytics?testId=${id ?? ""}`
      : `/dashboard/staff/analytics?testId=${id ?? ""}`;
  const studentBase =
    role === "admin" ? "/dashboard/admin/students" : "/dashboard/staff/students";

  const [test, setTest] = useState<ResultsTest | null>(null);
  const [roster, setRoster] = useState<DeptRoster[]>([]);
  const [maxScore, setMaxScore] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState<ResultsFilterState>(defaultFilters);
  const [view, setView] = useState<ViewMode>("dept");
  const [attendanceFilter, setAttendanceFilter] =
    useState<AttendanceFilter>("all");
  const [openDepts, setOpenDepts] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptRow | null>(null);
  const [selectedRosterStudent, setSelectedRosterStudent] =
    useState<RosterStudent | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [scorePopupOpen, setScorePopupOpen] = useState(false);

  const catalog = useAcademicCatalog();
  const programChoices = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    if (role !== "staff") return all;
    if (!scope.managedPrograms.length) return [];
    return all.filter((p) => scope.managedPrograms.includes(p.id));
  }, [role, scope.managedPrograms, catalog.departments]);

  async function loadResults() {
    if (!id) return null;
    return api<{
      test: ResultsTest;
      maxScore: number;
      rosterByDepartment?: DeptRoster[];
    }>(`${apiBase}/${id}/results`);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await loadResults();
        if (!cancelled && res) {
          setTest(res.test);
          setMaxScore(res.maxScore);
          const depts = res.rosterByDepartment ?? [];
          setRoster(depts);
          setOpenDepts(new Set(depts.map((d) => d.program ?? "__ALL__")));
          setErr(null);
        }
      } catch {
        if (!cancelled) setErr("Not found or no access to these results.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, apiBase]);

  const typeDef = getAssessmentType(test?.assessmentType);
  const facultyScored = isFacultyScoredAssessment(test?.assessmentType);
  const mcq = isMcqAssessment(test?.assessmentType);
  const passMark = test?.passPercentage ?? 50;

  const scoreGraphics = useMemo(() => {
    if (!test || maxScore <= 0) {
      return {
        avgPct: null as number | null,
        passRate: null as number | null,
        bands: [] as { label: string; count: number }[],
      };
    }
    const scored = test.attempts.filter((a) => a.score != null);
    if (!scored.length) {
      return { avgPct: null, passRate: null, bands: [] };
    }
    const pcts = scored.map((a) => attemptPct(a, maxScore) ?? 0);
    const avgPct = Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10;
    const passRate =
      Math.round((pcts.filter((p) => p >= passMark).length / pcts.length) * 1000) / 10;
    const bands = [
      { label: "0–39%", count: 0 },
      { label: "40–59%", count: 0 },
      { label: "60–74%", count: 0 },
      { label: "75–89%", count: 0 },
      { label: "90–100%", count: 0 },
    ];
    for (const p of pcts) {
      if (p < 40) bands[0]!.count += 1;
      else if (p < 60) bands[1]!.count += 1;
      else if (p < 75) bands[2]!.count += 1;
      else if (p < 90) bands[3]!.count += 1;
      else bands[4]!.count += 1;
    }
    return { avgPct, passRate, bands };
  }, [test, maxScore, passMark]);

  const filteredAttempts = useMemo(() => {
    if (!test) return [];
    const min = parseScoreBound(filters.minScore);
    const max = parseScoreBound(filters.maxScore);
    const needle = filters.search.trim().toLowerCase();
    let rows = test.attempts.filter((a) => {
      if (filters.program && a.user.program !== filters.program) return false;
      if (filters.year !== "" && !sameBatch(a.user.level, filters.year)) return false;
      if (filters.flaggedOnly && !a.proctorFlagged) return false;
      if (filters.outcome === "pass" && a.passed !== true) return false;
      if (filters.outcome === "fail" && a.passed !== false) return false;
      const score = a.score ?? 0;
      if (min != null && score < min) return false;
      if (max != null && score > max) return false;
      if (needle) {
        const hay = `${a.user.name} ${a.user.email}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    rows = [...rows];
    rows.sort((a, b) => {
      if (filters.sort === "name") return a.user.name.localeCompare(b.user.name);
      if (filters.sort === "recent") {
        return (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");
      }
      if (filters.sort === "score") {
        return (b.score ?? -1) - (a.score ?? -1);
      }
      const ar = a.rank ?? 9999;
      const br = b.rank ?? 9999;
      if (ar !== br) return ar - br;
      return (b.score ?? -1) - (a.score ?? -1);
    });
    return rows;
  }, [test, filters]);

  const flaggedCount = useMemo(
    () => test?.attempts.filter((a) => a.proctorFlagged).length ?? 0,
    [test]
  );
  const passCount = useMemo(
    () => test?.attempts.filter((a) => a.passed === true).length ?? 0,
    [test]
  );
  const failCount = useMemo(
    () => test?.attempts.filter((a) => a.passed === false).length ?? 0,
    [test]
  );

  const filterQuery = useMemo(() => {
    const min = parseScoreBound(filters.minScore);
    const max = parseScoreBound(filters.maxScore);
    return {
      program: filters.program || undefined,
      year: filters.year === "" ? undefined : filters.year,
      minScore: min,
      maxScore: max,
    };
  }, [filters]);

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.program !== "" ||
    filters.year !== "" ||
    filters.minScore.trim() !== "" ||
    filters.maxScore.trim() !== "" ||
    filters.outcome !== "all" ||
    filters.flaggedOnly;

  async function downloadCsv() {
    if (!id) return;
    setDownloading(true);
    setErr(null);
    try {
      await downloadResultsCsv(id, role, filterQuery);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not download CSV.");
    } finally {
      setDownloading(false);
    }
  }

  async function toggleResultsPublished(publish: boolean) {
    if (!id) return;
    setPublishing(true);
    setErr(null);
    setMessage(null);
    try {
      await api(`/api/staff/tests/${id}/publish-results`, {
        method: "POST",
        body: JSON.stringify({ resultsPublished: publish }),
      });
      const res = await loadResults();
      if (res) {
        setTest(res.test);
        setMaxScore(res.maxScore);
      }
      setMessage(
        publish ? "Scores are now visible to students." : "Scores hidden from students."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update result visibility.");
    } finally {
      setPublishing(false);
    }
  }

  async function reloadAfterScore() {
    const res = await loadResults();
    if (res) {
      setTest(res.test);
      setMaxScore(res.maxScore);
      setRoster(res.rosterByDepartment ?? []);
    }
  }

  const filteredRoster = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return roster
      .filter((d) => !filters.program || d.program === filters.program)
      .map((d) => {
        const years = d.years
          .filter((y) => filters.year === "" || sameBatch(y.level, filters.year))
          .map((y) => {
            let students = y.students;
            if (attendanceFilter === "attended") {
              students = students.filter((s) => s.status === "attended");
            } else if (attendanceFilter === "absent") {
              students = students.filter((s) => s.status === "absent");
            }
            if (needle) {
              students = students.filter((s) =>
                `${s.name} ${s.email} ${s.rollNo ?? ""}`
                  .toLowerCase()
                  .includes(needle)
              );
            }
            if (filters.outcome === "pass") {
              students = students.filter((s) => s.attempt?.passed === true);
            } else if (filters.outcome === "fail") {
              students = students.filter((s) => s.attempt?.passed === false);
            }
            if (filters.flaggedOnly) {
              students = students.filter((s) => s.attempt?.proctorFlagged);
            }
            const min = parseScoreBound(filters.minScore);
            const max = parseScoreBound(filters.maxScore);
            if (min != null) {
              students = students.filter(
                (s) => s.status === "absent" || (s.attempt?.score ?? 0) >= min
              );
            }
            if (max != null) {
              students = students.filter(
                (s) => s.status === "absent" || (s.attempt?.score ?? 0) <= max
              );
            }
            return {
              ...y,
              students,
              attendedCount: students.filter((s) => s.status === "attended").length,
              notAttendedCount: students.filter((s) => s.status === "absent")
                .length,
              total: students.length,
            };
          })
          .filter((y) => y.total > 0);
        const students = years.flatMap((y) => y.students);
        return {
          ...d,
          years,
          students,
          total: students.length,
          attendedCount: students.filter((s) => s.status === "attended").length,
          notAttendedCount: students.filter((s) => s.status === "absent").length,
        };
      })
      .filter((d) => d.total > 0);
  }, [roster, filters, attendanceFilter]);

  const rosterTotals = useMemo(() => {
    let total = 0;
    let attended = 0;
    let absent = 0;
    for (const d of roster) {
      total += d.total;
      attended += d.attendedCount;
      absent += d.notAttendedCount;
    }
    return { total, attended, absent };
  }, [roster]);

  function toggleDept(key: string) {
    setOpenDepts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openRosterStudent(s: RosterStudent) {
    setSelectedRosterStudent(s);
    if (s.attempt && test) {
      const match = test.attempts.find((a) => a.id === s.attempt!.id);
      if (match) {
        setSelectedAttempt(match);
        return;
      }
      // Synthesize AttemptRow for popup when only roster data exists
      setSelectedAttempt({
        id: s.attempt.id,
        userId: s.id,
        startedAt: s.attempt.submittedAt ?? new Date().toISOString(),
        submittedAt: s.attempt.submittedAt,
        score: s.attempt.score,
        percentage: s.attempt.percentage,
        rank: s.attempt.rank,
        passed: s.attempt.passed,
        proctorFlagged: s.attempt.proctorFlagged,
        user: {
          name: s.name,
          email: s.email,
          program: s.program,
          levelType: s.levelType,
          level: s.level,
        },
      });
    } else {
      setSelectedAttempt(null);
    }
    setReviewOpen(false);
  }

  async function openReview(attempt: AttemptRow) {
    if (!id) return;
    setSelectedAttempt(attempt);
    setReviewOpen(true);
    setReview(null);
    setReviewErr(null);
    setReviewLoading(true);
    try {
      const res = await api<ReviewPayload>(
        `${apiBase}/${id}/attempts/${attempt.id}`
      );
      setReview(res);
    } catch (e) {
      setReviewErr(e instanceof Error ? e.message : "Could not load answer sheet.");
    } finally {
      setReviewLoading(false);
    }
  }

  function openStudentPopup(attempt: AttemptRow) {
    setSelectedAttempt(attempt);
    setReviewOpen(false);
  }

  if (err && !test) {
    return (
      <DashboardShell
        title="Results"
        nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
      >
        <p className="text-sm text-slate-600">{err}</p>
        <Link to={resultsDeskHref} className="mt-4 inline-block text-brand-700 hover:underline">
          ← Results desk
        </Link>
      </DashboardShell>
    );
  }

  if (!test) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading results…
      </div>
    );
  }

  const studentPopupOpen =
    (!!selectedAttempt || !!selectedRosterStudent) && !reviewOpen;

  return (
    <DashboardShell
      title={`Results — ${test.title}`}
      nav={role === "admin" ? adminSidebarNav : staffSidebarNav}
    >
      <div className="results-page">
        <header className="results-page__intro">
          <div>
            <Link to={resultsDeskHref} className="results-page__back">
              ← Results desk
            </Link>
            <h2 className="results-page__title">{test.title}</h2>
            <p className="results-page__lede">
              {typeDef.label} · max {maxScore} · pass ≥ {passMark}% ·{" "}
              {test.attempts.length} submission
              {test.attempts.length === 1 ? "" : "s"}
              {" · "}
              {test.resultsPublished ? "Visible to students" : "Hidden from students"}
            </p>
          </div>
          <div className="results-page__actions">
            {test.isPublished && test.attempts.length > 0 ? (
              test.resultsPublished ? (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void toggleResultsPublished(false)}
                  className="results-page__ghost"
                >
                  Hide from students
                </button>
              ) : (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void toggleResultsPublished(true)}
                  className="results-page__cta"
                >
                  {publishing ? "Releasing…" : "Release scores"}
                </button>
              )
            ) : null}
            <button
              type="button"
              disabled={downloading}
              onClick={() => void downloadCsv()}
              className="results-page__ghost"
            >
              <IconDownload className="h-3.5 w-3.5" aria-hidden />
              {downloading ? "CSV…" : "CSV"}
            </button>
            <Link to={analyticsHref} className="results-page__ghost">
              <IconChart className="h-3.5 w-3.5" aria-hidden />
              Analytics
            </Link>
            <button
              type="button"
              className={`results-page__ghost ${advancedOpen ? "results-page__ghost--on" : ""}`}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? "Hide score filters" : "Score filters"}
            </button>
          </div>
        </header>

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

        <div className="results-filters">
          <div className="results-filters__field">
            <label className="results-filters__label" htmlFor="score-dept">
              Department
            </label>
            <select
              id="score-dept"
              value={
                filters.program ||
                (programChoices.length === 1 ? programChoices[0]!.id : "")
              }
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  program: e.target.value as Program | "",
                }))
              }
              disabled={role === "staff" && programChoices.length <= 1}
              className="results-filters__control"
            >
              {programChoices.length === 1 ? (
                <option value={programChoices[0]!.id}>{programChoices[0]!.label}</option>
              ) : (
                <>
                  <option value="">All departments</option>
                  {programChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          <div className="results-filters__field">
            <label className="results-filters__label" htmlFor="score-batch">
              Batch
            </label>
            <select
              id="score-batch"
              value={filters.year === "" ? "" : String(filters.year)}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  year: e.target.value ? Number(e.target.value) : "",
                }))
              }
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
            <label className="results-filters__label" htmlFor="score-search">
              Student
            </label>
            <input
              id="score-search"
              type="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Name, email, or roll"
              className="results-filters__control"
            />
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="results-filters__clear"
              onClick={() =>
                setFilters((f) => ({
                  ...defaultFilters,
                  program: role === "staff" && programChoices.length === 1 ? f.program : "",
                }))
              }
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="results-view-tabs" role="tablist" aria-label="Results view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "dept"}
            className={`results-view-tab ${view === "dept" ? "results-view-tab--active" : ""}`}
            onClick={() => setView("dept")}
          >
            <IconUsers className="h-4 w-4" aria-hidden />
            By department
            <span className="results-view-tab__count">{rosterTotals.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "exam"}
            className={`results-view-tab ${view === "exam" ? "results-view-tab--active" : ""}`}
            onClick={() => setView("exam")}
          >
            <IconChart className="h-4 w-4" aria-hidden />
            By exam
            <span className="results-view-tab__count">{test.attempts.length}</span>
          </button>
        </div>

        {advancedOpen ? (
          <div className="results-advanced">
            <div className="results-advanced__grid">
              <label>
                <span>Outcome</span>
                <select
                  value={filters.outcome}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      outcome: e.target.value as ResultsFilterState["outcome"],
                    }))
                  }
                >
                  <option value="all">All</option>
                  <option value="pass">Pass only</option>
                  <option value="fail">Fail only</option>
                </select>
              </label>
              <label>
                <span>Min score</span>
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  value={filters.minScore}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, minScore: e.target.value }))
                  }
                  placeholder="0"
                />
              </label>
              <label>
                <span>Max score</span>
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  value={filters.maxScore}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, maxScore: e.target.value }))
                  }
                  placeholder={String(maxScore)}
                />
              </label>
              <label>
                <span>Sort</span>
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      sort: e.target.value as ResultsFilterState["sort"],
                    }))
                  }
                >
                  <option value="rank">Rank</option>
                  <option value="score">Score high→low</option>
                  <option value="name">Name A–Z</option>
                  <option value="recent">Most recent</option>
                </select>
              </label>
              {mcq ? (
                <label className="results-advanced__check">
                  <input
                    type="checkbox"
                    checked={filters.flaggedOnly}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, flaggedOnly: e.target.checked }))
                    }
                  />
                  <span>
                    Flagged only
                    {flaggedCount > 0 ? ` (${flaggedCount})` : ""}
                  </span>
                </label>
              ) : null}
            </div>
            <div className="results-advanced__bar">
              <span>
                Showing {filteredAttempts.length} of {test.attempts.length}
                {hasActiveFilters ? " · filters on" : ""}
              </span>
              <div className="flex flex-wrap gap-2">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => setFilters(defaultFilters)}
                    className="results-page__ghost !min-h-8"
                  >
                    Clear filters
                  </button>
                ) : null}
                {facultyScored ? (
                  <button
                    type="button"
                    onClick={() => setScorePopupOpen(true)}
                    className="results-page__ghost !min-h-8"
                  >
                    Enter faculty score
                  </button>
                ) : null}
                <Link to={listHref} className="results-page__ghost !min-h-8">
                  Assessments
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {view === "exam" ? (
          <section className="results-exam-panel">
            <div className="results-page__stats">
              <div className="results-page__stat">
                <span className="results-page__stat-value">{test.attempts.length}</span>
                <span className="results-page__stat-label">Submissions</span>
              </div>
              <div className="results-page__stat">
                <span className="results-page__stat-value">
                  {scoreGraphics.avgPct != null ? `${scoreGraphics.avgPct}%` : "—"}
                </span>
                <span className="results-page__stat-label">Average</span>
              </div>
              <div className="results-page__stat">
                <span className="results-page__stat-value">{passCount}</span>
                <span className="results-page__stat-label">Passed</span>
              </div>
              <div className="results-page__stat results-page__stat--warn">
                <span className="results-page__stat-value">{failCount}</span>
                <span className="results-page__stat-label">Failed</span>
              </div>
            </div>

            {test.attempts.some((a) => a.score != null) ? (
              <div className="results-exam-charts">
                <div className="results-exam-charts__rings">
                  <ScoreRing
                    percent={scoreGraphics.avgPct}
                    label="Average %"
                    sublabel={`${test.attempts.filter((a) => a.score != null).length} scored`}
                  />
                  <ScoreRing
                    percent={scoreGraphics.passRate}
                    label="Pass rate"
                    sublabel={`≥ ${passMark}%`}
                  />
                </div>
                <div className="results-exam-charts__panel">
                  <h3 className="results-exam-charts__title">Score distribution</h3>
                  <p className="results-exam-charts__sub">This exam only</p>
                  <DistributionBars bands={scoreGraphics.bands} />
                </div>
              </div>
            ) : (
              <div className="results-empty-state">
                <p className="results-empty-state__title">No scores yet</p>
                <p className="results-empty-state__lede">
                  {facultyScored
                    ? "Use Advanced → Enter faculty score, or open By students."
                    : "When students submit, exam stats appear here."}
                </p>
              </div>
            )}

            <div className="results-exam-top">
              <div className="results-exam-top__head">
                <h3>Top performers</h3>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-800 hover:underline"
                  onClick={() => setView("dept")}
                >
                  View by department →
                </button>
              </div>
              {filteredAttempts.length === 0 ? (
                <p className="text-sm text-slate-500">No matching submissions.</p>
              ) : (
                <ul className="results-exam-top__list">
                  {filteredAttempts.slice(0, 5).map((a) => {
                    const pct = attemptPct(a, maxScore);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          className="results-exam-top__row"
                          onClick={() => openStudentPopup(a)}
                        >
                          <span className="results-exam-top__rank">
                            {a.rank != null ? `#${a.rank}` : "—"}
                          </span>
                          <span className="results-exam-top__name">{a.user.name}</span>
                          <span className="results-exam-top__score">
                            {a.score != null ? `${a.score}/${maxScore}` : "—"}
                            {pct != null ? ` · ${pct}%` : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <section className="results-dept">
            <div className="results-page__stats">
              <div className="results-page__stat">
                <span className="results-page__stat-value">{rosterTotals.total}</span>
                <span className="results-page__stat-label">Eligible</span>
              </div>
              <div className="results-page__stat">
                <span className="results-page__stat-value">{rosterTotals.attended}</span>
                <span className="results-page__stat-label">Attended</span>
              </div>
              <div className="results-page__stat results-page__stat--warn">
                <span className="results-page__stat-value">{rosterTotals.absent}</span>
                <span className="results-page__stat-label">Not attended</span>
              </div>
              <div className="results-page__stat">
                <span className="results-page__stat-value">
                  {rosterTotals.total > 0
                    ? `${Math.round((rosterTotals.attended / rosterTotals.total) * 100)}%`
                    : "—"}
                </span>
                <span className="results-page__stat-label">Attendance</span>
              </div>
            </div>

            <div className="results-directory__toolbar !border-0 !bg-transparent !p-0">
              <div className="results-filters">
                <div className="results-filters__field">
                  <label className="results-filters__label" htmlFor="dept-att">
                    Attendance
                  </label>
                  <select
                    id="dept-att"
                    value={attendanceFilter}
                    onChange={(e) =>
                      setAttendanceFilter(e.target.value as AttendanceFilter)
                    }
                    className="results-filters__control"
                  >
                    <option value="all">All students</option>
                    <option value="attended">Attended only</option>
                    <option value="absent">Not attended only</option>
                  </select>
                </div>
                <div className="results-filters__field">
                  <label className="results-filters__label" htmlFor="dept-out">
                    Outcome
                  </label>
                  <select
                    id="dept-out"
                    value={filters.outcome}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        outcome: e.target.value as ResultsFilterState["outcome"],
                      }))
                    }
                    className="results-filters__control"
                  >
                    <option value="all">All outcomes</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredRoster.length === 0 ? (
              <div className="results-empty-state">
                <p className="results-empty-state__title">No students in this view</p>
                <p className="results-empty-state__lede">
                  Try clearing filters, or check that the exam audience matches a
                  department cohort.
                </p>
              </div>
            ) : (
              <div className="results-dept__list">
                {filteredRoster.map((dept) => {
                  const key = dept.program ?? "__ALL__";
                  const open = openDepts.has(key);
                  return (
                    <article key={key} className="results-dept-card">
                      <button
                        type="button"
                        className="results-dept-card__head"
                        onClick={() => toggleDept(key)}
                        aria-expanded={open}
                      >
                        <div className="min-w-0 text-left">
                          <h3 className="results-dept-card__title">
                            {catalog.departments.find((d) => d.program === dept.program)?.name ??
                              dept.label}
                          </h3>
                          <p className="results-dept-card__meta">
                            {dept.attendedCount} attended · {dept.notAttendedCount}{" "}
                            not attended · {dept.total} eligible
                            {dept.averagePercent != null
                              ? ` · avg ${dept.averagePercent}%`
                              : ""}
                          </p>
                        </div>
                        <div className="results-dept-card__bars">
                          <span
                            className="results-dept-card__bar results-dept-card__bar--in"
                            style={{
                              width: `${
                                dept.total
                                  ? Math.max(
                                      4,
                                      (dept.attendedCount / dept.total) * 100
                                    )
                                  : 0
                              }%`,
                            }}
                            title="Attended"
                          />
                        </div>
                        <span className="results-dept-card__chev" aria-hidden>
                          {open ? "▴" : "▾"}
                        </span>
                      </button>

                      {open ? (
                        <div className="results-dept-card__body">
                          {dept.years.map((year) => {
                            const attended = year.students.filter(
                              (s) => s.status === "attended"
                            );
                            const absent = year.students.filter(
                              (s) => s.status === "absent"
                            );
                            return (
                              <div key={year.label} className="results-dept-year">
                                <div className="results-dept-year__head">
                                  <h4>
                                    {year.level != null
                                      ? `${batchYearOf(year.level) ?? year.level} batch`
                                      : year.label}
                                  </h4>
                                  <span>
                                    {year.attendedCount}/{year.total} attended
                                  </span>
                                </div>

                                {attended.length > 0 ? (
                                  <div className="results-dept-group">
                                    <p className="results-dept-group__label results-dept-group__label--in">
                                      Attended ({attended.length})
                                    </p>
                                    <ul className="results-dept-students">
                                      {attended.map((s) => (
                                        <li key={s.id}>
                                          <button
                                            type="button"
                                            className="results-dept-student"
                                            onClick={() => openRosterStudent(s)}
                                          >
                                            <span className="results-dept-student__rank">
                                              {s.attempt?.rank != null
                                                ? `#${s.attempt.rank}`
                                                : "—"}
                                            </span>
                                            <span className="results-dept-student__main">
                                              <span className="results-dept-student__name">
                                                {s.name}
                                              </span>
                                              <span className="results-dept-student__sub">
                                                {s.rollNo
                                                  ? `Roll ${s.rollNo} · `
                                                  : ""}
                                                {s.email}
                                              </span>
                                            </span>
                                            <span className="results-dept-student__score">
                                              {s.attempt?.score != null
                                                ? `${s.attempt.score}/${maxScore}`
                                                : "—"}
                                              {s.attempt?.percentage != null
                                                ? ` · ${Math.round(s.attempt.percentage)}%`
                                                : ""}
                                            </span>
                                            <span
                                              className={`tests-badge ${
                                                s.attempt?.passed
                                                  ? "tests-badge--results"
                                                  : s.attempt?.passed === false
                                                    ? "tests-badge--awaiting"
                                                    : "tests-badge--draft"
                                              }`}
                                            >
                                              {s.attempt?.passed == null
                                                ? "Scored"
                                                : s.attempt.passed
                                                  ? "Pass"
                                                  : "Fail"}
                                            </span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {absent.length > 0 ? (
                                  <div className="results-dept-group">
                                    <p className="results-dept-group__label results-dept-group__label--out">
                                      Not attended ({absent.length})
                                    </p>
                                    <ul className="results-dept-students">
                                      {absent.map((s) => (
                                        <li key={s.id}>
                                          <button
                                            type="button"
                                            className="results-dept-student results-dept-student--absent"
                                            onClick={() => openRosterStudent(s)}
                                          >
                                            <span className="results-dept-student__rank">
                                              —
                                            </span>
                                            <span className="results-dept-student__main">
                                              <span className="results-dept-student__name">
                                                {s.name}
                                              </span>
                                              <span className="results-dept-student__sub">
                                                {s.rollNo
                                                  ? `Roll ${s.rollNo} · `
                                                  : ""}
                                                {s.email}
                                              </span>
                                            </span>
                                            <span className="tests-badge tests-badge--draft">
                                              Absent
                                            </span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Student detail popup (attended or absent) */}
      <ResultsModal
        open={studentPopupOpen}
        title={
          selectedAttempt?.user.name ??
          selectedRosterStudent?.name ??
          "Student"
        }
        subtitle={
          selectedAttempt?.user.email ?? selectedRosterStudent?.email
        }
        onClose={() => {
          setSelectedAttempt(null);
          setSelectedRosterStudent(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="results-page__ghost"
              onClick={() => {
                setSelectedAttempt(null);
                setSelectedRosterStudent(null);
              }}
            >
              Close
            </button>
            <Link
              to={`${studentBase}/${
                selectedAttempt?.userId ?? selectedRosterStudent?.id ?? ""
              }`}
              className="results-page__ghost"
            >
              Full profile
            </Link>
            {selectedAttempt ? (
              <button
                type="button"
                className="results-page__cta"
                onClick={() => void openReview(selectedAttempt)}
              >
                {mcq ? "View answers" : "View attempt"}
              </button>
            ) : null}
          </>
        }
      >
        {selectedAttempt ? (
          <div className="results-student-popup">
            <div className="results-student-popup__stats">
              <div>
                <p className="results-page__stat-label">Rank</p>
                <p className="results-page__stat-value">
                  {selectedAttempt.rank != null
                    ? `#${selectedAttempt.rank}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="results-page__stat-label">Score</p>
                <p className="results-page__stat-value">
                  {selectedAttempt.score != null
                    ? `${selectedAttempt.score}/${maxScore}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="results-page__stat-label">Percent</p>
                <p className="results-page__stat-value">
                  {attemptPct(selectedAttempt, maxScore) != null
                    ? `${attemptPct(selectedAttempt, maxScore)}%`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="results-page__stat-label">Result</p>
                <p className="results-page__stat-value text-base">
                  {selectedAttempt.passed == null
                    ? "—"
                    : selectedAttempt.passed
                      ? "Pass"
                      : "Fail"}
                </p>
              </div>
            </div>
            <dl className="results-student-popup__meta">
              <div>
                <dt>Attendance</dt>
                <dd>Attended</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>
                  {formatAcademic(
                    selectedAttempt.user.program,
                    selectedAttempt.user.levelType,
                    selectedAttempt.user.level
                  )}
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>
                  {selectedAttempt.submittedAt
                    ? new Date(selectedAttempt.submittedAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Integrity</dt>
                <dd>
                  {selectedAttempt.proctorFlagged ? "Flagged" : "OK"}
                  {mcq
                    ? ` · tabs ${selectedAttempt.tabSwitchCount ?? 0} · FS ${selectedAttempt.fullscreenExitCount ?? 0}`
                    : ""}
                </dd>
              </div>
            </dl>
          </div>
        ) : selectedRosterStudent ? (
          <div className="results-student-popup">
            <div className="results-student-popup__stats">
              <div>
                <p className="results-page__stat-label">Attendance</p>
                <p className="results-page__stat-value text-base">Absent</p>
              </div>
              <div>
                <p className="results-page__stat-label">Score</p>
                <p className="results-page__stat-value">—</p>
              </div>
            </div>
            <dl className="results-student-popup__meta">
              <div>
                <dt>Class</dt>
                <dd>
                  {formatAcademic(
                    selectedRosterStudent.program,
                    selectedRosterStudent.levelType,
                    selectedRosterStudent.level
                  )}
                </dd>
              </div>
              <div>
                <dt>Roll</dt>
                <dd>{selectedRosterStudent.rollNo || "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Did not attend this exam</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </ResultsModal>

      {/* Answer sheet / attempt review popup */}
      <ResultsModal
        open={reviewOpen}
        title={
          review
            ? `${review.student.name} — answer sheet`
            : selectedAttempt
              ? `${selectedAttempt.user.name} — answer sheet`
              : "Answer sheet"
        }
        subtitle={test.title}
        wide
        onClose={() => {
          setReviewOpen(false);
          setReview(null);
          setReviewErr(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="results-page__ghost"
              onClick={() => {
                setReviewOpen(false);
                setReview(null);
              }}
            >
              Close
            </button>
            {selectedAttempt ? (
              <button
                type="button"
                className="results-page__ghost"
                onClick={() => {
                  setReviewOpen(false);
                  setReview(null);
                  setSelectedAttempt(selectedAttempt);
                }}
              >
                Student details
              </button>
            ) : null}
          </>
        }
      >
        {reviewLoading ? (
          <p className="text-sm text-slate-600">Loading answer sheet…</p>
        ) : reviewErr ? (
          <p className="text-sm text-red-600">{reviewErr}</p>
        ) : review ? (
          review.questions.length === 0 ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                {review.student.name} · {review.attempt.score ?? "—"} / {review.maxScore}
              </p>
              <p>
                Non-MCQ assessment — no answer sheet. Note:{" "}
                {review.attempt.scoreNote || "—"}
              </p>
            </div>
          ) : (
            <StudentTestResultView
              result={{
                attempt: review.attempt,
                test: review.test,
                maxScore: review.maxScore,
                rank: review.rank,
                cohortSize: review.cohortSize,
                passed: review.passed,
                student: {
                  name: review.student.name,
                  email: review.student.email,
                },
                questions: review.questions,
              }}
              eyebrow="Answer sheet"
            />
          )
        ) : null}
      </ResultsModal>

      {/* Faculty score popup */}
      <ResultsModal
        open={scorePopupOpen}
        title="Faculty score"
        subtitle={test.title}
        onClose={() => setScorePopupOpen(false)}
      >
        {id ? (
          <FacultyScoreForm
            testId={id}
            maxScore={maxScore}
            initialEmail={selectedAttempt?.user.email ?? ""}
            onSaved={async () => {
              await reloadAfterScore();
            }}
          />
        ) : null}
      </ResultsModal>
    </DashboardShell>
  );
}
