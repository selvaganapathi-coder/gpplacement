import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import {
  IconBook,
  IconChart,
  IconClipboard,
  IconGraduation,
} from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatAcademic, type LevelType, type Program } from "@/lib/academic";
import {
  getAssessmentType,
  isFacultyScoredAssessment,
  isMcqAssessment,
  isSelfAssessment,
} from "@/lib/assessmentTypes";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";
import { formatResultsUnlockAt, formatShortWhen } from "@/lib/studentTime";
import { studentSidebarNav } from "@/lib/dashboardNav";

type StudentProfile = {
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  rollNo: string | null;
  classLabel: string | null;
};

type TestRow = {
  id: string;
  title: string;
  durationMin: number;
  questionsPerAttempt?: number | null;
  assessmentType?: string;
  maxScore?: number;
  resultsPublished?: boolean;
  resultsAutoReleaseAt?: string | null;
  availableUntil?: string | null;
  availableFrom: string | null;
  _count: { questions: number };
  latestAttempt: {
    id: string;
    submittedAt: string | null;
    score: number | null;
    startedAt: string;
  } | null;
  windowStatus: "open";
};

type UpcomingRow = {
  id: string;
  title: string;
  durationMin: number;
  availableFrom: string | null;
  availableUntil: string | null;
  assessmentType?: string;
  _count: { questions: number };
};

type AttemptRow = {
  id: string;
  testId: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore?: number;
  test: {
    title: string;
    assessmentType?: string;
    resultsPublished: boolean;
    resultsAutoReleaseAt?: string | null;
  };
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function testMaxScore(t: TestRow): number {
  if (t.maxScore && t.maxScore > 0) return t.maxScore;
  if (isMcqAssessment(t.assessmentType)) return t._count.questions;
  return 100;
}

function startHref(t: Pick<TestRow, "id" | "assessmentType">): string {
  return isSelfAssessment(t.assessmentType)
    ? `/dashboard/student/assess/${t.id}`
    : `/dashboard/student/test/${t.id}`;
}

export function StudentDashboard() {
  const { user } = useAuth();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [startReminders, setStartReminders] = useState<{ id: string; title: string; body: string }[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, a] = await Promise.all([
          api<{
            tests: TestRow[];
            upcoming: UpcomingRow[];
            student?: StudentProfile;
          }>("/api/student/tests"),
          api<{ attempts: AttemptRow[] }>("/api/student/attempts"),
        ]);
        if (!cancelled) {
          setTests(t.tests);
          setUpcoming(t.upcoming ?? []);
          setAttempts(a.attempts);
          const notes = await api<{ items: { id: string; type: string; title: string; body: string }[] }>(
            "/api/student/notifications"
          ).catch(() => ({ items: [] }));
          if (!cancelled) {
            setStartReminders(
              (notes.items ?? []).filter((item) => item.type === "exam_starting")
            );
          }
          setProfile(
            t.student ??
              (user?.program
                ? {
                    program: user.program,
                    levelType: user.levelType ?? null,
                    level: user.level ?? null,
                    rollNo: user.rollNo ?? null,
                    classLabel: formatAcademic(
                      user.program,
                      user.levelType,
                      user.level
                    ),
                  }
                : null)
          );
        }
      } catch {
        if (!cancelled) {
          setErr("We couldn’t load your tests. Please refresh the page.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const name = user ? firstName(user.name) : "there";
  const actionable = tests.find((t) => {
    if (t.latestAttempt?.submittedAt) return false;
    if (isFacultyScoredAssessment(t.assessmentType)) return false;
    return true;
  });
  const primaryOpen =
    actionable ?? tests.find((t) => !t.latestAttempt?.submittedAt) ?? tests[0];
  const classLabel =
    profile?.classLabel ??
    (user?.program
      ? formatAcademic(user.program, user.levelType, user.level)
      : null);
  const nextUpcoming = upcoming[0];
  const inProgressAttempts = attempts.filter((a) => !a.submittedAt).slice(0, 3);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const recentSubmitted = attempts.filter((a) => a.submittedAt).slice(0, 4);
  const hasActionableOpen = tests.some((t) => {
    if (t.latestAttempt?.submittedAt) return false;
    return isMcqAssessment(t.assessmentType) || isSelfAssessment(t.assessmentType);
  });

  const stats = useMemo(() => {
    const open = tests.filter((t) => !t.latestAttempt?.submittedAt).length;
    const waiting = tests.filter(
      (t) => t.latestAttempt?.submittedAt && !t.resultsPublished
    ).length;
    const scored = attempts.filter(
      (a) => a.submittedAt && a.test.resultsPublished && a.score != null
    ).length;
    return { open, waiting, upcoming: upcoming.length, scored };
  }, [tests, upcoming, attempts]);

  const heroTitle = hasActionableOpen
    ? "An assessment is ready"
    : nextUpcoming
      ? "You’re all set for now"
      : "Nothing open right now";

  const heroLede = hasActionableOpen
    ? "Start when you’re ready — use a stable connection for timed MCQs."
    : nextUpcoming
      ? `Next up: ${nextUpcoming.title} opens ${formatShortWhen(nextUpcoming.availableFrom)}.`
      : "When staff publish a test for your class, it will show here.";

  const canStartPrimary =
    primaryOpen &&
    !primaryOpen.latestAttempt?.submittedAt &&
    (isMcqAssessment(primaryOpen.assessmentType) ||
      isSelfAssessment(primaryOpen.assessmentType));

  const activityRows = [...inProgressAttempts, ...recentSubmitted].slice(0, 5);

  return (
    <DashboardShell
      title="Home"
      subtitle={`Hi, ${name} · tests & results for today`}
      nav={studentSidebarNav}
    >
      {err ? (
        <p className="soft-alert mb-4 border-red-200 bg-red-50 text-red-900">{err}</p>
      ) : null}

      {startReminders.length > 0 ? (
        <div className="mb-4 space-y-2">
          {startReminders.map((item) => (
            <Link
              key={item.id}
              to="/dashboard/student/tests"
              className="soft-alert block border-amber-200 bg-amber-50 text-amber-950"
            >
              <span className="font-semibold">{item.title}</span>
              {". "}
              {item.body}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="zoho-home student-zoho">
        <header className="zoho-home__bar">
          <div className="zoho-home__bar-brand">
            <span className="zoho-home__mark" aria-hidden>
              {COLLEGE_BRAND.shortName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="zoho-home__bar-kicker">Student workspace</p>
              <h2 className="zoho-home__bar-title">Hi, {name}</h2>
              <p className="zoho-home__bar-sub">
                {classLabel
                  ? `${classLabel}${profile?.rollNo ? ` · Roll ${profile.rollNo}` : ""}`
                  : "Your tests and results for today"}
              </p>
            </div>
          </div>
          <div className="zoho-home__bar-actions">
            {canStartPrimary && primaryOpen ? (
              <Link
                to={startHref(primaryOpen)}
                className="zoho-home__btn zoho-home__btn--primary"
              >
                {isSelfAssessment(primaryOpen.assessmentType)
                  ? "Open self-assessment"
                  : primaryOpen.latestAttempt
                    ? "Continue test"
                    : "Start test"}
              </Link>
            ) : (
              <Link
                to="/dashboard/student/tests"
                className="zoho-home__btn zoho-home__btn--primary"
              >
                My assessments
              </Link>
            )}
            <Link to="/dashboard/student/results" className="zoho-home__btn">
              My results
            </Link>
            <Link to="/dashboard/student/practice" className="zoho-home__btn">
              Practice
            </Link>
          </div>
        </header>

        <section className="zoho-home__section" aria-labelledby="student-apps-heading">
          <div className="zoho-home__section-head">
            <h3 id="student-apps-heading">Apps</h3>
            <span>Jump to a workspace</span>
          </div>
          <div className="zoho-apps student-zoho__apps">
            {(
              [
                {
                  to: "/dashboard/student/tests",
                  label: "My assessments",
                  sub: "Open & upcoming",
                  tone: "teal",
                  icon: <IconClipboard className="h-5 w-5" />,
                },
                {
                  to: "/dashboard/student/results",
                  label: "My results",
                  sub: "Scores & charts",
                  tone: "amber",
                  icon: <IconChart className="h-5 w-5" />,
                },
                {
                  to: "/dashboard/student/practice",
                  label: "Practice",
                  sub: "Try the exam UI",
                  tone: "blue",
                  icon: <IconBook className="h-5 w-5" />,
                },
                {
                  to: "/dashboard/student/leaderboard",
                  label: "Leaderboard",
                  sub: "Class rankings",
                  tone: "green",
                  icon: <IconGraduation className="h-5 w-5" />,
                },
              ] as const
            ).map((app) => (
              <Link
                key={app.to}
                to={app.to}
                className={`zoho-app zoho-app--${app.tone}`}
              >
                <span className="zoho-app__icon" aria-hidden>
                  {app.icon}
                </span>
                <span className="zoho-app__label">{app.label}</span>
                <span className="zoho-app__sub">{app.sub}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="zoho-kpis" aria-label="Today at a glance">
          <Link to="/dashboard/student/tests" className="zoho-kpi">
            <p className="zoho-kpi__label">Open now</p>
            <p className="zoho-kpi__value">{stats.open}</p>
          </Link>
          <Link to="/dashboard/student/tests" className="zoho-kpi">
            <p className="zoho-kpi__label">Coming up</p>
            <p className="zoho-kpi__value">{stats.upcoming}</p>
          </Link>
          <Link to="/dashboard/student/results" className="zoho-kpi">
            <p className="zoho-kpi__label">Awaiting results</p>
            <p className="zoho-kpi__value">{stats.waiting}</p>
          </Link>
          <Link to="/dashboard/student/results" className="zoho-kpi">
            <p className="zoho-kpi__label">Scored</p>
            <p className="zoho-kpi__value">{stats.scored}</p>
          </Link>
        </section>

        <section className="student-zoho__focus zoho-panel" aria-labelledby="student-focus-heading">
          <div className="zoho-panel__head">
            <h3 id="student-focus-heading">{heroTitle}</h3>
            {canStartPrimary && primaryOpen ? (
              <Link to={startHref(primaryOpen)}>Go →</Link>
            ) : (
              <Link to="/dashboard/student/tests">All tests →</Link>
            )}
          </div>
          <div className="zoho-panel__body student-zoho__focus-body">
            <p className="student-zoho__focus-lede">{heroLede}</p>
            {canStartPrimary && primaryOpen ? (
              <div className="student-zoho__focus-card">
                <div className="min-w-0">
                  <p className="student-zoho__focus-title">{primaryOpen.title}</p>
                  <p className="student-zoho__focus-meta">
                    {getAssessmentType(primaryOpen.assessmentType).label}
                    {isMcqAssessment(primaryOpen.assessmentType)
                      ? ` · ${primaryOpen.durationMin} min`
                      : ""}
                    {primaryOpen.availableUntil
                      ? ` · Closes ${new Date(primaryOpen.availableUntil).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <Link to={startHref(primaryOpen)} className="btn-primary !min-h-10">
                  {isSelfAssessment(primaryOpen.assessmentType)
                    ? "Self-assess"
                    : primaryOpen.latestAttempt
                      ? "Continue"
                      : "Start"}
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <div className="zoho-home__grid">
          <section className="zoho-panel zoho-panel--wide" aria-labelledby="student-open-heading">
            <div className="zoho-panel__head">
              <h3 id="student-open-heading">Open now</h3>
              <Link to="/dashboard/student/tests">All my tests →</Link>
            </div>
            {tests.length === 0 ? (
              <div className="zoho-panel__body">
                <div className="empty-state !py-8">
                  <p>
                    Nothing open right now.
                    {nextUpcoming
                      ? ` Next: “${nextUpcoming.title}” opens ${formatShortWhen(nextUpcoming.availableFrom)}.`
                      : " Ask staff if you expected a test today."}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Link to="/dashboard/student/practice" className="btn-secondary">
                      Practice the UI
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <ul className="student-zoho__list">
                {tests.map((t) => {
                  const typeDef = getAssessmentType(t.assessmentType);
                  const submitted = t.latestAttempt?.submittedAt;
                  const score = t.latestAttempt?.score;
                  const maxScore = testMaxScore(t);
                  const unlockLabel = formatResultsUnlockAt(t.resultsAutoReleaseAt);
                  const faculty = isFacultyScoredAssessment(t.assessmentType);
                  const self = isSelfAssessment(t.assessmentType);
                  const mcq = isMcqAssessment(t.assessmentType);

                  return (
                    <li key={t.id} className="student-zoho__row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="student-zoho__row-title">{t.title}</h4>
                          <span className="student-zoho__tag">{typeDef.label}</span>
                        </div>
                        <p className="student-zoho__row-meta">
                          {typeDef.methodLabel}
                          {mcq
                            ? ` · ${
                                t.questionsPerAttempt != null &&
                                t.questionsPerAttempt < t._count.questions
                                  ? `${t.questionsPerAttempt} of ${t._count.questions}`
                                  : t.questionsPerAttempt ?? t._count.questions
                              } questions · ${t.durationMin} min`
                            : ` · out of ${maxScore}`}
                          {t.availableUntil
                            ? ` · Closes ${new Date(t.availableUntil).toLocaleString()}`
                            : ""}
                        </p>
                        {submitted && t.resultsPublished && score != null ? (
                          <p className="mt-1.5">
                            <span className="badge-ok">
                              Score: {score} / {maxScore}
                            </span>
                          </p>
                        ) : submitted ? (
                          <p className="mt-1.5">
                            <span className="badge-warn">
                              {unlockLabel ?? "Submitted — results coming soon"}
                            </span>
                          </p>
                        ) : faculty ? (
                          <p className="mt-1.5">
                            <span className="badge-info">Awaiting faculty score</span>
                          </p>
                        ) : t.latestAttempt && mcq ? (
                          <p className="mt-1.5">
                            <span className="badge-info">In progress</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="student-zoho__row-actions">
                        {submitted && t.latestAttempt && t.resultsPublished ? (
                          <Link
                            to={`/dashboard/student/attempts/${t.latestAttempt.id}/result`}
                            className="btn-secondary !min-h-9"
                          >
                            See result
                          </Link>
                        ) : submitted ? (
                          <span className="student-zoho__wait">
                            {unlockLabel ?? "Waiting for results"}
                          </span>
                        ) : faculty ? (
                          <span className="student-zoho__wait student-zoho__wait--amber">
                            Awaiting faculty
                          </span>
                        ) : (
                          <Link to={startHref(t)} className="btn-primary !min-h-9">
                            {self
                              ? "Self-assess"
                              : t.latestAttempt
                                ? "Continue"
                                : "Start"}
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {upcoming.length > 0 ? (
            <section className="zoho-panel" aria-labelledby="student-upcoming-heading">
              <div className="zoho-panel__head">
                <h3 id="student-upcoming-heading">Coming up</h3>
                <span className="text-[11px] font-semibold text-slate-500">
                  {upcoming.length}
                </span>
              </div>
              <ul className="student-zoho__upcoming">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <div className="min-w-0">
                      <p className="student-zoho__row-title">{t.title}</p>
                      <p className="student-zoho__row-meta">
                        {getAssessmentType(t.assessmentType).label}
                        {isMcqAssessment(t.assessmentType)
                          ? ` · ${t._count.questions} Q · ${t.durationMin} min`
                          : ""}
                      </p>
                    </div>
                    <span className="student-zoho__when">
                      {t.availableFrom &&
                      new Date(t.availableFrom).getTime() - nowMs > 0 &&
                      new Date(t.availableFrom).getTime() - nowMs <= 15 * 60 * 1000
                        ? `Starts in ${Math.max(
                            1,
                            Math.ceil((new Date(t.availableFrom).getTime() - nowMs) / 60_000)
                          )} min`
                        : `Opens ${formatShortWhen(t.availableFrom)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activityRows.length > 0 ? (
            <section
              className={`zoho-panel ${upcoming.length === 0 ? "zoho-panel--wide" : ""}`}
              aria-labelledby="student-activity-heading"
            >
              <div className="zoho-panel__head">
                <h3 id="student-activity-heading">Recent activity</h3>
                <Link to="/dashboard/student/results">All results →</Link>
              </div>
              <ul className="student-zoho__list">
                {activityRows.map((a) => (
                  <li key={a.id} className="student-zoho__row student-zoho__row--compact">
                    <div className="min-w-0">
                      <p className="student-zoho__row-title">{a.test.title}</p>
                      <p className="student-zoho__row-meta">
                        {getAssessmentType(a.test.assessmentType).label}
                        {" · "}
                        {a.submittedAt
                          ? `Submitted ${new Date(a.submittedAt).toLocaleString()}`
                          : "In progress — you can continue"}
                      </p>
                    </div>
                    <div className="student-zoho__row-actions">
                      {a.submittedAt && a.test.resultsPublished ? (
                        <Link
                          to={`/dashboard/student/attempts/${a.id}/result`}
                          className="text-[13px] font-semibold text-orange-700 hover:underline"
                        >
                          {a.score != null && a.maxScore != null
                            ? `${a.score}/${a.maxScore}`
                            : "See result"}{" "}
                          →
                        </Link>
                      ) : a.submittedAt ? (
                        <span className="badge-warn">
                          {formatResultsUnlockAt(a.test.resultsAutoReleaseAt) ??
                            "Results after exam ends"}
                        </span>
                      ) : (
                        <Link
                          to={startHref({ id: a.testId, assessmentType: a.test.assessmentType })}
                          className="btn-secondary !min-h-9"
                        >
                          Continue
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}
