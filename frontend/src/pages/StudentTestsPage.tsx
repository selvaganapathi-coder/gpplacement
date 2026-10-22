import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";
import {
  getAssessmentType,
  isFacultyScoredAssessment,
  isMcqAssessment,
  isSelfAssessment,
} from "@/lib/assessmentTypes";
import { formatShortWhen } from "@/lib/studentTime";
import { studentSidebarNav } from "@/lib/dashboardNav";

type TestRow = {
  id: string;
  title: string;
  durationMin: number;
  assessmentType?: string;
  maxScore?: number;
  availableUntil?: string | null;
  availableFrom: string | null;
  _count: { questions: number };
  latestAttempt: {
    id: string;
    submittedAt: string | null;
    score: number | null;
    startedAt: string;
  } | null;
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

function testMaxScore(t: TestRow): number {
  if (t.maxScore && t.maxScore > 0) return t.maxScore;
  if (isMcqAssessment(t.assessmentType)) return t._count.questions;
  return 100;
}

export function StudentTestsPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ tests: TestRow[]; upcoming: UpcomingRow[] }>(
          "/api/student/tests"
        );
        if (!cancelled) {
          setTests(res.tests);
          setUpcoming(res.upcoming ?? []);
          setErr(null);
        }
      } catch {
        if (!cancelled) setErr("We couldn’t load your tests. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useMemo(
    () => tests.filter((t) => !t.latestAttempt?.submittedAt),
    [tests]
  );

  return (
    <DashboardShell
      title="My tests"
      subtitle="Open and upcoming assessments for your class"
      nav={studentSidebarNav}
    >
      <section className="portal-hero portal-hero--light mb-5">
        <p className="portal-hero__kicker">Student · assessments</p>
        <h2 className="portal-hero__title text-slate-900">Tests for you</h2>
        <p className="portal-hero__lede">
          Start open papers here. Scores and unlock times live under My results.
        </p>
        <div className="portal-hero__actions">
          <span className="portal-hero__chip">
            {open.length} open
          </span>
          <span className="portal-hero__chip">
            {upcoming.length} upcoming
          </span>
          <Link to="/dashboard/student/results" className="btn-secondary !min-h-10">
            My results
          </Link>
        </div>
      </section>

      {err ? (
        <p className="soft-alert mb-4 border-red-200 bg-red-50 text-red-900">{err}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-600">Loading your tests…</p> : null}

      {!loading && open.length === 0 && upcoming.length === 0 ? (
        <div className="empty-state space-y-3">
          <p>No tests are open or upcoming for you right now.</p>
          <p className="text-sm text-slate-500">
            When staff publish a test for your class, it will appear here. Scores stay under My
            results.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/dashboard/student/results" className="btn-secondary inline-flex min-h-11">
              My results
            </Link>
            <Link to="/dashboard/student/practice" className="btn-secondary inline-flex min-h-11">
              Practice the exam UI
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && open.length > 0 ? (
        <section className="mb-9 space-y-3">
          <div>
            <h2 className="section-title">Open for you</h2>
            <p className="section-sub">Start or continue these assessments.</p>
          </div>
          <ul className="student-home-list">
            {open.map((t) => (
              <TestListCard key={t.id} t={t} />
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && upcoming.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="section-title">Coming up for you</h2>
            <p className="section-sub">Published for your class — opens at the time shown.</p>
          </div>
          <ul className="space-y-2">
            {upcoming.map((t) => (
              <li key={t.id} className="student-home-upcoming">
                <div>
                  <p className="font-display font-semibold text-slate-900">{t.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {getAssessmentType(t.assessmentType).label}
                    {isMcqAssessment(t.assessmentType)
                      ? ` · ${t._count.questions} questions · ${t.durationMin} min`
                      : ""}
                  </p>
                </div>
                <span className="student-home-upcoming__when">
                  Opens {formatShortWhen(t.availableFrom)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashboardShell>
  );
}

function TestListCard({ t }: { t: TestRow }) {
  const typeDef = getAssessmentType(t.assessmentType);
  const maxScore = testMaxScore(t);
  const faculty = isFacultyScoredAssessment(t.assessmentType);
  const self = isSelfAssessment(t.assessmentType);
  const mcq = isMcqAssessment(t.assessmentType);

  return (
    <li className="student-home-card">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-display text-base font-semibold text-slate-900 sm:text-lg">
            {t.title}
          </h3>
          <span className="student-home-tag">{typeDef.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {typeDef.methodLabel}
          {mcq
            ? ` · ${t._count.questions} questions · ${t.durationMin} min`
            : ` · out of ${maxScore}`}
          {t.availableUntil ? (
            <span className="text-brand-800">
              {" "}
              · Closes {new Date(t.availableUntil).toLocaleString()}
            </span>
          ) : null}
        </p>
        {faculty ? (
          <p className="mt-2">
            <span className="badge-info">Awaiting faculty score</span>
          </p>
        ) : t.latestAttempt && mcq ? (
          <p className="mt-2">
            <span className="badge-info">In progress</span>
          </p>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
        {faculty ? (
          <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm font-medium text-amber-950">
            Awaiting faculty score
          </span>
        ) : self ? (
          <Link
            to={`/dashboard/student/assess/${t.id}`}
            className="btn-primary min-h-11 w-full sm:w-auto"
          >
            Self-assess
          </Link>
        ) : (
          <Link
            to={`/dashboard/student/test/${t.id}`}
            className="btn-primary min-h-11 w-full sm:w-auto"
          >
            {t.latestAttempt ? "Continue" : "Start test"}
          </Link>
        )}
      </div>
    </li>
  );
}
