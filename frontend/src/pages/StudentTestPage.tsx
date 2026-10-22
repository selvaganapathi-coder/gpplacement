import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { TakeTestClient } from "@/components/TakeTestClient";
import { ResultsPendingPanel } from "@/components/StudentTestResultView";
import { api } from "@/lib/api";
import { formatResultsUnlockAt } from "@/lib/studentTime";
import { studentSidebarNav } from "@/lib/dashboardNav";

type InProgressSession = {
  status: "in_progress";
  test: {
    id: string;
    title: string;
    durationMin: number;
    questions: { id: string; prompt: string; options: { id: string; text: string }[]; topic?: string | null }[];
  };
  attempt: { id: string; startedAt: string; endsAt?: string };
  deadlineIso: string;
  /** Server clock at response time — UI countdown adjusts for client skew. */
  serverNowIso?: string;
  savedAnswers?: Record<string, string>;
  markedQuestionIds?: string[];
};

type SubmittedSession = {
  status: "submitted";
  test: {
    id: string;
    title: string;
    questionCount: number;
    resultsPublished: boolean;
    resultsAutoReleaseAt?: string | null;
  };
  attempt: {
    id: string;
    submittedAt: string;
    score?: number | null;
    maxScore?: number;
  };
};

type Session = InProgressSession | SubmittedSession;

export function StudentTestPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api<Session>(`/api/student/tests/${id}/session`);
        if (!cancelled) setData(s);
      } catch {
        if (!cancelled) setErr("Test not found or not available.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) {
    return (
      <DashboardShell title="Aptitude test" subtitle="Unavailable" nav={studentSidebarNav}>
        <p className="soft-alert border-red-200 bg-red-50 text-red-900">{err}</p>
        <Link
          to="/dashboard/student"
          className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Back to aptitude tests
        </Link>
      </DashboardShell>
    );
  }

  if (!data) {
    return (
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <div className="flex animate-fade-in items-center gap-3 rounded-2xl border border-sky-200/60 bg-white/90 px-6 py-4 text-sm font-medium text-slate-600 shadow-warm backdrop-blur-sm">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
            aria-hidden
          />
          Loading aptitude test…
        </div>
      </div>
    );
  }

  if (data.status === "submitted") {
    if (data.test.resultsPublished) {
      return (
        <Navigate to={`/dashboard/student/attempts/${data.attempt.id}/result`} replace />
      );
    }

    const unlockLabel = formatResultsUnlockAt(data.test.resultsAutoReleaseAt);
    return (
      <DashboardShell title="Test submitted" subtitle={data.test.title} nav={studentSidebarNav}>
        <ResultsPendingPanel
          message={`Your answers are saved. ${
            unlockLabel
              ? `${unlockLabel}.`
              : "Your score will appear automatically after the exam ends."
          }`}
          unlockAt={data.test.resultsAutoReleaseAt}
        />
        <p className="mt-3 text-xs text-slate-500">
          Submitted {new Date(data.attempt.submittedAt).toLocaleString()}
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Exam in progress" nav={[]} narrow>
      <TakeTestClient
        attemptId={data.attempt.id}
        title={data.test.title}
        durationMin={data.test.durationMin}
        deadlineIso={data.deadlineIso}
        serverNowIso={data.serverNowIso}
        questions={data.test.questions}
        initialAnswers={data.savedAnswers}
        initialMarked={data.markedQuestionIds}
      />
    </DashboardShell>
  );
}
