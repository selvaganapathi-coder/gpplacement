import { Link } from "react-router-dom";
import { formatResultsUnlockAt } from "@/lib/studentTime";

export type AttemptResult = {
  attempt: {
    id: string;
    score: number | null;
    percentage?: number | null;
    submittedAt: string;
    startedAt: string;
  };
  test: { id: string; title: string; passPercentage?: number | null };
  maxScore: number;
  rank?: number | null;
  cohortSize?: number | null;
  passed?: boolean | null;
  student?: {
    name: string;
    email: string;
  };
  questions: {
    id: string;
    prompt: string;
    marks?: number;
    explanation?: string | null;
    chosenText: string | null;
    correctText: string;
    isCorrect: boolean;
  }[];
};

export function StudentTestResultView({
  result,
  eyebrow = "Your result",
}: {
  result: AttemptResult;
  eyebrow?: string;
}) {
  const score = result.attempt.score ?? 0;
  const pct =
    result.attempt.percentage != null
      ? Math.round(result.attempt.percentage)
      : result.maxScore > 0
        ? Math.round((score / result.maxScore) * 100)
        : 0;
  const correctCount = result.questions.filter((q) => q.isCorrect).length;
  const skippedCount = result.questions.filter((q) => q.chosenText == null).length;
  const wrongCount = result.questions.length - correctCount - skippedCount;
  const practice = result.questions.filter((q) => !q.isCorrect);
  const scoreDeg = `${Math.min(360, Math.max(0, (pct / 100) * 360))}deg`;
  const passMark = result.test.passPercentage ?? 50;

  return (
    <div className="space-y-8">
      <div
        className="result-hero animate-fade-in"
        style={{ ["--score-deg" as string]: scoreDeg }}
      >
        <p className="exam-eyebrow">{eyebrow}</p>
        {result.student ? (
          <p className="mt-1 text-sm font-medium text-slate-700">
            {result.student.name}
            <span className="font-normal text-slate-500"> · {result.student.email}</span>
          </p>
        ) : null}
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div
            className="result-score-ring"
            style={{ ["--score-deg" as string]: scoreDeg }}
            aria-label={`${pct} percent`}
          >
            <span>
              <span className="font-display text-2xl font-semibold text-slate-900">{pct}%</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                score
              </span>
            </span>
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <h2 className="font-display text-xl font-semibold text-slate-900 sm:text-2xl">
              {result.test.title}
            </h2>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-slate-900">
              {score}
              <span className="text-lg font-medium text-slate-400"> / {result.maxScore}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {result.rank != null ? (
                <span className="rounded-lg bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-950">
                  Rank #{result.rank}
                  {result.cohortSize != null ? ` of ${result.cohortSize}` : ""}
                </span>
              ) : null}
              {result.passed != null ? (
                <span
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
                    result.passed
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-rose-100 text-rose-900"
                  }`}
                >
                  {result.passed ? "Pass" : "Fail"}
                  <span className="font-normal opacity-80"> · ≥{passMark}%</span>
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Submitted {new Date(result.attempt.submittedAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl bg-emerald-50/90 px-3 py-3 text-center ring-1 ring-emerald-200/70">
            <p className="font-display text-xl font-semibold text-emerald-900">{correctCount}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/80">
              Correct
            </p>
          </div>
          <div className="rounded-2xl bg-rose-50/90 px-3 py-3 text-center ring-1 ring-rose-200/70">
            <p className="font-display text-xl font-semibold text-rose-900">{wrongCount}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800/80">
              Wrong
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-3 text-center ring-1 ring-slate-200/80">
            <p className="font-display text-xl font-semibold text-slate-900">{skippedCount}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Skipped
            </p>
          </div>
        </div>
      </div>

      {practice.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="section-title">Practice these</h3>
            <p className="section-sub">
              Questions you missed or skipped — review the correct answer below.
            </p>
          </div>
          <ol className="space-y-2 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4">
            {practice.map((q, i) => (
              <li key={q.id} className="text-sm text-slate-800">
                <span className="font-semibold text-amber-950">{i + 1}. </span>
                {q.prompt.length > 140 ? `${q.prompt.slice(0, 139)}…` : q.prompt}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-emerald-950">
          Great work — you got every question correct.
        </p>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="section-title">Answer review</h3>
          <p className="section-sub">See what you chose and the correct option where you missed.</p>
        </div>
        <div className="space-y-3 stagger-children">
          {result.questions.map((q, idx) => (
            <div
              key={q.id}
              className={`rounded-2xl border px-4 py-4 sm:px-5 ${
                q.isCorrect
                  ? "border-emerald-200/80 bg-emerald-50/40"
                  : q.chosenText == null
                    ? "border-slate-200 bg-slate-50/60"
                    : "border-rose-200/70 bg-rose-50/30"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-display text-sm font-semibold text-slate-900">
                  Question {idx + 1}
                </p>
                <span
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
                    q.isCorrect
                      ? "bg-emerald-100 text-emerald-900"
                      : q.chosenText == null
                        ? "bg-slate-200 text-slate-800"
                        : "bg-rose-100 text-rose-900"
                  }`}
                >
                  {q.isCorrect ? "Correct" : q.chosenText == null ? "Skipped" : "Incorrect"}
                </span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-800">{q.prompt}</p>
              {q.marks != null && q.marks !== 1 ? (
                <p className="mt-1 text-xs text-slate-500">{q.marks} marks</p>
              ) : null}
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-slate-500">
                    {result.student ? "Chosen answer" : "Your answer"}
                  </dt>
                  <dd className="font-medium text-slate-900">
                    {q.chosenText ?? "— (not answered)"}
                  </dd>
                </div>
                {!q.isCorrect ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-slate-500">Correct answer</dt>
                    <dd className="font-semibold text-emerald-900">{q.correctText}</dd>
                  </div>
                ) : null}
                {q.explanation ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-slate-500">Explanation</dt>
                    <dd className="text-slate-700">{q.explanation}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <div className="no-print flex flex-wrap gap-2">
        <Link to="/dashboard/student" className="btn-secondary min-h-11">
          ← Aptitude tests
        </Link>
        <Link to="/dashboard/student/results" className="btn-secondary min-h-11">
          My results
        </Link>
      </div>
    </div>
  );
}

export function ResultsPendingPanel({
  message,
  unlockAt,
}: {
  message: string;
  unlockAt?: string | null;
}) {
  const label = formatResultsUnlockAt(unlockAt);
  return (
    <div className="result-hero max-w-xl animate-scale-in">
      <p className="exam-eyebrow">Results pending</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">
        {label ?? "Scores are not ready yet"}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
      {label ? (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 ring-1 ring-sky-200/70">
          {label}
        </p>
      ) : null}
      <Link to="/dashboard/student" className="btn-primary mt-6 inline-flex min-h-11">
        Back to aptitude tests
      </Link>
    </div>
  );
}
