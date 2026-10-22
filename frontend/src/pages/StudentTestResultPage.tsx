import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import {
  AttemptResult,
  ResultsPendingPanel,
  StudentTestResultView,
} from "@/components/StudentTestResultView";
import { ApiError, api } from "@/lib/api";
import { studentSidebarNav } from "@/lib/dashboardNav";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";

export function StudentTestResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [unlockAt, setUnlockAt] = useState<string | null>(null);
  const [pendingResults, setPendingResults] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<AttemptResult>(
          `/api/student/attempts/${attemptId}/result`
        );
        if (!cancelled) {
          setResult(data);
          setErr(null);
          setPendingResults(false);
        }
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError && e.code === "RESULTS_PENDING") {
            setPendingResults(true);
            setUnlockAt(
              typeof e.details?.resultsAutoReleaseAt === "string"
                ? e.details.resultsAutoReleaseAt
                : null
            );
            setErr(e.message);
          } else {
            setErr(e instanceof Error ? e.message : "Could not load your result.");
            setPendingResults(false);
          }
          setResult(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (err) {
    return (
      <DashboardShell title="Your result" subtitle="" nav={studentSidebarNav}>
        {pendingResults ? (
          <ResultsPendingPanel message={err} unlockAt={unlockAt} />
        ) : (
          <>
            <p className="text-sm text-red-600">{err}</p>
            <Link
              to="/dashboard/student"
              className="mt-4 inline-block text-brand-700 hover:underline"
            >
              Back to aptitude tests
            </Link>
          </>
        )}
      </DashboardShell>
    );
  }

  if (!result) {
    return (
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200/60 bg-white/90 px-6 py-4 text-sm text-slate-600 shadow-warm">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
            aria-hidden
          />
          Loading your result…
        </div>
      </div>
    );
  }

  return (
    <DashboardShell title="Your result" subtitle={result.test.title} nav={studentSidebarNav}>
      <div className="print-result">
        <div className="mb-4 flex flex-wrap gap-2 no-print print:hidden">
          <button type="button" className="btn-secondary min-h-11" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
        <p className="print-only mb-4 text-sm text-slate-600">
          {`${COLLEGE_BRAND.name} · ${COLLEGE_BRAND.shortName} portal · ${result.test.title}`}
        </p>
        <StudentTestResultView result={result} />
      </div>
    </DashboardShell>
  );
}
