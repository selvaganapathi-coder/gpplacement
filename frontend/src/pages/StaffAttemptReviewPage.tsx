import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import {
  StudentTestResultView,
  type AttemptResult,
} from "@/components/StudentTestResultView";
import { api } from "@/lib/api";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";
import { formatAcademic, type LevelType, type Program } from "@/lib/academic";

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

type StaffAttemptReviewPageProps = {
  role?: "staff" | "admin";
};

export function StaffAttemptReviewPage({
  role = "staff",
}: StaffAttemptReviewPageProps) {
  const { id: testId, attemptId } = useParams<{
    id: string;
    attemptId: string;
  }>();
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const apiBase = role === "admin" ? "/api/admin/tests" : "/api/staff/tests";
  const resultsHref =
    role === "admin"
      ? `/dashboard/admin/tests/${testId}/results`
      : `/dashboard/staff/tests/${testId}/results`;
  const nav = role === "admin" ? adminSidebarNav : staffSidebarNav;

  useEffect(() => {
    if (!testId || !attemptId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<ReviewPayload>(
          `${apiBase}/${testId}/attempts/${attemptId}`
        );
        if (!cancelled) {
          setData(res);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load attempt.");
          setData(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId, attemptId, apiBase]);

  if (err) {
    return (
      <DashboardShell title="Attempt review" nav={nav}>
        <p className="text-sm text-red-600">{err}</p>
        <Link to={resultsHref} className="mt-4 inline-block text-sm text-brand-800 underline">
          ← Back to results
        </Link>
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <DashboardShell title="Attempt review" nav={nav}>
        <p className="text-sm text-slate-600">Loading answer sheet…</p>
      </DashboardShell>
    );
  }

  const viewResult: AttemptResult = {
    attempt: data.attempt,
    test: data.test,
    maxScore: data.maxScore,
    rank: data.rank,
    cohortSize: data.cohortSize,
    passed: data.passed,
    student: { name: data.student.name, email: data.student.email },
    questions: data.questions,
  };

  return (
    <DashboardShell
      title="Staff review"
      subtitle={data.test.title}
      nav={nav}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to={resultsHref} className="btn-secondary min-h-10">
          ← Merit list
        </Link>
        <p className="text-sm text-slate-600">
          {formatAcademic(
            data.student.program,
            data.student.levelType,
            data.student.level
          )}
          {data.attempt.proctorFlagged ? (
            <span className="ml-2 badge-danger">Flagged</span>
          ) : null}
        </p>
      </div>
      {data.questions.length === 0 ? (
        <div className="panel space-y-2 p-4">
          <p className="font-medium text-slate-900">
            {data.student.name} · {data.attempt.score ?? "—"} / {data.maxScore}
          </p>
          <p className="text-sm text-slate-600">
            Non-MCQ assessment — no answer sheet. Note:{" "}
            {data.attempt.scoreNote || "—"}
          </p>
        </div>
      ) : (
        <StudentTestResultView result={viewResult} eyebrow="Answer sheet" />
      )}
    </DashboardShell>
  );
}
