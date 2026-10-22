import { useEffect, useState, useTransition } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { api } from "@/lib/api";
import {
  getAssessmentType,
  isSelfAssessment,
} from "@/lib/assessmentTypes";
import { studentSidebarNav } from "@/lib/dashboardNav";

type OpenTest = {
  id: string;
  title: string;
  description?: string | null;
  assessmentType?: string;
  maxScore?: number;
  allowRetake?: boolean;
  resultsPublished?: boolean;
  latestAttempt: {
    id: string;
    submittedAt: string | null;
    score: number | null;
  } | null;
};

export function StudentSelfAssessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<OpenTest | null>(null);
  const [score, setScore] = useState("");
  const [scoreNote, setScoreNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ tests: OpenTest[] }>("/api/student/tests");
        const found = res.tests.find((t) => t.id === id) ?? null;
        if (cancelled) return;
        if (!found || !isSelfAssessment(found.assessmentType)) {
          setError("This self-assessment is not available right now.");
          setLoading(false);
          return;
        }
        setTest(found);
        if (found.latestAttempt?.score != null) {
          setScore(String(found.latestAttempt.score));
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load this assessment.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !test) return;
    setError(null);
    const n = Number(score);
    const max = test.maxScore && test.maxScore > 0 ? test.maxScore : 100;
    if (!Number.isFinite(n) || n < 0 || n > max) {
      setError(`Enter a score between 0 and ${max}.`);
      return;
    }
    if (!scoreNote.trim()) {
      setError("Add a brief reflection note.");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{
            ok: boolean;
            attemptId: string;
            score: number;
            resultsPublished?: boolean;
          }>(`/api/student/tests/${id}/self-assess`, {
            method: "POST",
            body: JSON.stringify({
              score: n,
              scoreNote: scoreNote.trim(),
            }),
          });
          if (res.resultsPublished) {
            navigate(`/dashboard/student/attempts/${res.attemptId}/result`, {
              replace: true,
            });
          } else {
            navigate("/dashboard/student", { replace: true });
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not submit.");
        }
      })();
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading…
      </div>
    );
  }

  if (!test) {
    return (
      <DashboardShell title="Self-assessment" subtitle="" nav={studentSidebarNav}>
        <p className="text-sm text-red-600">{error ?? "Not found."}</p>
        <Link to="/dashboard/student" className="mt-4 inline-block text-brand-700 hover:underline">
          ← Back
        </Link>
      </DashboardShell>
    );
  }

  const typeDef = getAssessmentType(test.assessmentType);
  const maxScore = test.maxScore && test.maxScore > 0 ? test.maxScore : 100;
  const alreadySubmitted = !!test.latestAttempt?.submittedAt && !test.allowRetake;

  return (
    <DashboardShell
      title={test.title}
      subtitle={`${typeDef.label} · self-assessment out of ${maxScore}`}
      nav={studentSidebarNav}
    >
      <p className="mb-6 text-sm text-slate-600">
        <Link to="/dashboard/student" className="font-semibold text-brand-700 hover:underline">
          ← Assessments
        </Link>
      </p>

      {alreadySubmitted ? (
        <div className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-4 py-6 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Already submitted</p>
          <p className="mt-1">
            Your score{test.latestAttempt?.score != null ? ` (${test.latestAttempt.score} / ${maxScore})` : ""}{" "}
            is recorded. Results appear when staff publish them.
          </p>
          <Link to="/dashboard/student" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">
            Back to dashboard
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="max-w-lg space-y-5">
          {test.description ? (
            <p className="rounded-lg border border-sky-200/70 bg-white px-4 py-3 text-sm text-slate-700 shadow-warm">
              {test.description}
            </p>
          ) : null}

          <div className="rounded-lg border border-sky-200/70 bg-white p-4 shadow-warm">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="self-score">
                Your score (0–{maxScore})
              </label>
              <input
                id="self-score"
                type="number"
                min={0}
                max={maxScore}
                required
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="mt-1 w-32 rounded-md border border-sky-200/80 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700" htmlFor="self-note">
                Brief reflection
              </label>
              <textarea
                id="self-note"
                required
                rows={4}
                value={scoreNote}
                onChange={(e) => setScoreNote(e.target.value)}
                className="mt-1 w-full rounded-md border border-sky-200/80 px-3 py-2 text-sm"
                placeholder="What went well? What will you improve?"
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit self-assessment"}
          </button>
        </form>
      )}
    </DashboardShell>
  );
}
