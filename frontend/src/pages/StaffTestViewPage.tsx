import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { api, downloadResultsCsv } from "@/lib/api";
import { formatAcademic } from "@/lib/academic";
import type { LevelType, Program } from "@/lib/academic";
import { formatScheduleRange } from "@/lib/testSchedule";
import { adminSidebarNav, staffSidebarNav } from "@/lib/dashboardNav";

type TestDetail = {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  isPublished: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  questions: {
    id: string;
    order: number;
    prompt: string;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

type StaffTestViewPageProps = {
  backHref?: string;
  backLabel?: string;
};

export function StaffTestViewPage({
  backHref = "/dashboard/staff/tests",
  backLabel = "All tests",
}: StaffTestViewPageProps) {
  const { id } = useParams<{ id: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isAdmin = backHref.includes("/admin");
  const editBase = isAdmin ? "/dashboard/admin/tests" : "/dashboard/staff/tests";
  const resultsHref = `${editBase}/${id}/results`;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ test: TestDetail; canEdit: boolean }>(
          `/api/staff/tests/${id}`
        );
        if (!cancelled) setTest(res.test);
        if (!cancelled) setCanEdit(res.canEdit);
      } catch {
        if (!cancelled) setErr("Could not load this test.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) {
    return (
      <DashboardShell
        title="Test questions"
        subtitle=""
        nav={isAdmin ? adminSidebarNav : staffSidebarNav}
      >
        <p className="text-sm text-slate-600">{err}</p>
        <Link to={backHref} className="mt-4 inline-block text-brand-700 hover:underline">
          ← Back
        </Link>
      </DashboardShell>
    );
  }

  if (!test) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading questions…
      </div>
    );
  }

  const audience = test.program
    ? formatAcademic(test.program, test.levelType, test.level)
    : "All students";

  return (
    <DashboardShell
      title={test.title}
      subtitle={`${test.questions.length} questions · ${test.durationMin} min · ${audience}`}
      nav={isAdmin ? adminSidebarNav : staffSidebarNav}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={backHref} className="text-sm font-medium text-brand-700 hover:underline">
          ← Back to tests
        </Link>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link
              to={`${editBase}/${test.id}/edit`}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Edit questions &amp; answers
            </Link>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
              View only — you did not create this test
            </span>
          )}
          <Link
            to={resultsHref}
            className="rounded-md border border-brand-400 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-950 hover:bg-brand-100"
          >
            View results
          </Link>
          <button
            type="button"
            disabled={downloading || !id}
            onClick={() => {
              if (!id) return;
              setDownloading(true);
              void downloadResultsCsv(id, isAdmin ? "admin" : "staff")
                .catch(() => undefined)
                .finally(() => setDownloading(false));
            }}
            className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-sky-50 disabled:opacity-60"
          >
            {downloading ? "Downloading…" : "Download CSV"}
          </button>
          <button
            type="button"
            onClick={() => setExpandAll((v) => !v)}
            className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-sky-50"
          >
            {expandAll ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-sky-200/60 bg-white/90 p-4 text-sm text-slate-700">
        <p>
          <span className="font-medium">Audience:</span> {audience}
        </p>
        {test.description ? (
          <p className="mt-1">
            <span className="font-medium">Description:</span> {test.description}
          </p>
        ) : null}
        <p className="mt-1">
          <span className="font-medium">Status:</span>{" "}
          {test.isPublished ? "Published" : "Draft"}
          {test.isPublished
            ? ` · ${formatScheduleRange(test.availableFrom, test.availableUntil)}`
            : null}
        </p>
        <p className="mt-2 text-xs text-sky-900/90">
          Staff review only — correct answers are shown below. Students never see which option is
          correct during the test.
        </p>
      </div>

      <ol className="space-y-3">
        {test.questions.map((q) => (
          <li
            key={q.id}
            className="rounded-xl border border-sky-200/60 bg-white/95 p-4 shadow-warm"
          >
            <details open={expandAll}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                Q{q.order}. {q.prompt}
              </summary>
              <ul className="mt-3 space-y-1.5 pl-1 text-sm">
                {q.options.map((o, i) => (
                  <li
                    key={o.id}
                    className={
                      o.isCorrect
                        ? "rounded-md border border-emerald-300/80 bg-emerald-50 px-2 py-1 font-medium text-emerald-950"
                        : "text-slate-700"
                    }
                  >
                    <span className="font-mono text-xs text-slate-500">{LETTERS[i] ?? i + 1})</span>{" "}
                    {o.text}
                    {o.isCorrect ? (
                      <span className="ml-2 text-xs uppercase tracking-wide text-emerald-800">
                        Correct answer
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </DashboardShell>
  );
}
