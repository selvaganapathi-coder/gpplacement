import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadStudentMarksReport } from "@/lib/api";
import { getAssessmentType, isMcqAssessment } from "@/lib/assessmentTypes";
import type { Role } from "@/types";

type Creator = { id: string; name: string; role: string };

type AssignedTest = {
  id: string;
  title: string;
  assessmentType: string;
  maxScore: number;
  durationMin: number;
  questionCount: number;
  resultsPublished: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  audience: string;
  createdBy: Creator;
  latestAttempt: {
    id: string;
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
  } | null;
};

type AttemptRow = {
  id: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  test: {
    id: string;
    title: string;
    assessmentType: string;
    resultsPublished: boolean;
    createdBy: Creator;
  };
};

type UploadedTest = {
  id: string;
  title: string;
  assessmentType: string;
  maxScore: number;
  durationMin: number;
  questionCount: number;
  attemptCount: number;
  isPublished: boolean;
  resultsPublished: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  audience: string;
  createdAt: string;
};

type PersonTestsPayload = {
  role: Role;
  attempts: AttemptRow[];
  assignedTests: AssignedTest[];
  uploadedTests: UploadedTest[];
};

function creatorName(c: Creator): string {
  if (c.role === "ADMIN") return `${c.name} (admin)`;
  return c.name;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function Donut({
  value,
  max = 100,
  label,
  sub,
  tone = "sky",
}: {
  value: number;
  max?: number;
  label: string;
  sub: string;
  tone?: "sky" | "teal" | "amber" | "emerald";
}) {
  const pct = max > 0 ? clampPct((value / max) * 100) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const stroke =
    tone === "teal"
      ? "#f59e0b"
      : tone === "amber"
        ? "#fbbf24"
        : tone === "emerald"
          ? "#d97706"
          : "#991b1b";

  return (
    <div className="person-viz-donut">
      <svg viewBox="0 0 96 96" className="h-[5.5rem] w-[5.5rem]" aria-hidden>
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-sky-100"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 48 48)"
          className="person-viz-donut__arc"
        />
        <text
          x="48"
          y="52"
          textAnchor="middle"
          className="fill-slate-900 text-[18px] font-semibold"
          style={{ fontFamily: "Outfit, DM Sans, system-ui, sans-serif" }}
        >
          {pct}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900">{sub}</p>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="person-viz-stat">
      <p className="person-viz-stat__label">{label}</p>
      <p className="person-viz-stat__value">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ScoreBar({
  title,
  score,
  max,
  meta,
}: {
  title: string;
  score: number;
  max: number;
  meta: string;
}) {
  const pct = max > 0 ? clampPct((score / max) * 100) : 0;
  return (
    <div className="person-viz-bar">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-semibold text-slate-800">{title}</p>
        <p className="shrink-0 tabular-nums text-xs font-bold text-sky-900">
          {score}/{max}
        </p>
      </div>
      <div className="person-viz-bar__track" aria-hidden>
        <div
          className="person-viz-bar__fill"
          style={{ width: `${pct}%`, ["--bar-pct" as string]: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-slate-500">{meta}</p>
    </div>
  );
}

function StatusStrip({
  items,
}: {
  items: { key: string; label: string; count: number; color: string }[];
}) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div>
      <div className="person-viz-strip" role="img" aria-label="Status breakdown">
        {items.map((i) =>
          i.count > 0 ? (
            <span
              key={i.key}
              title={`${i.label}: ${i.count}`}
              style={{
                width: `${(i.count / total) * 100}%`,
                background: i.color,
              }}
            />
          ) : null
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: i.color }}
              aria-hidden
            />
            {i.label}{" "}
            <span className="font-semibold tabular-nums text-slate-800">{i.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttemptSparkline({ attempts }: { attempts: AttemptRow[] }) {
  const points = useMemo(() => {
    const scored = [...attempts]
      .filter((a) => a.submittedAt && a.score != null && a.maxScore > 0)
      .reverse()
      .slice(-8);
    return scored.map((a) => ({
      id: a.id,
      pct: clampPct((a.score! / a.maxScore) * 100),
      title: a.test.title,
    }));
  }, [attempts]);

  if (points.length < 2) return null;

  const w = 220;
  const h = 56;
  const pad = 4;
  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
    const y = h - pad - (p.pct / 100) * (h - pad * 2);
    return `${x},${y}`;
  });
  const polyline = coords.join(" ");
  const area = `${pad},${h - pad} ${polyline} ${w - pad},${h - pad}`;

  return (
    <div className="person-viz-spark">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Score trend
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-14 w-full max-w-[14rem]" aria-hidden>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#991b1b" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#sparkFill)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#991b1b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const [x, y] = coords[i].split(",").map(Number);
          return (
            <circle key={p.id} cx={x} cy={y} r="3" fill="#7f1d1d">
              <title>
                {p.title}: {p.pct}%
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function statusForAssigned(t: AssignedTest): {
  label: string;
  tone: "muted" | "info" | "warn" | "ok";
  pct: number | null;
} {
  const a = t.latestAttempt;
  if (!a) return { label: "Not started", tone: "muted", pct: null };
  if (!a.submittedAt) return { label: "In progress", tone: "info", pct: null };
  if (t.resultsPublished && a.score != null) {
    return {
      label: `${a.score}/${t.maxScore}`,
      tone: "ok",
      pct: t.maxScore > 0 ? clampPct((a.score / t.maxScore) * 100) : 0,
    };
  }
  return { label: "Awaiting results", tone: "warn", pct: null };
}

function StudentReportDownload({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setErr(null);
          void downloadStudentMarksReport(userId, "admin")
            .catch((e) =>
              setErr(e instanceof Error ? e.message : "Download failed.")
            )
            .finally(() => setBusy(false));
        }}
        className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-sky-50 disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Download marks CSV"}
      </button>
      {err ? (
        <p className="max-w-[14rem] text-right text-[11px] text-red-600">{err}</p>
      ) : null}
    </div>
  );
}

export function PersonTestsSection({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) {
  const [data, setData] = useState<PersonTestsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const res = await api<PersonTestsPayload>(`/api/admin/users/${userId}/tests`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load test details.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const studentStats = useMemo(() => {
    if (!data || role !== "STUDENT") return null;
    const assigned = data.assignedTests;
    let notStarted = 0;
    let inProgress = 0;
    let awaiting = 0;
    let scored = 0;
    let scoreSum = 0;
    let scoreN = 0;
    for (const t of assigned) {
      const a = t.latestAttempt;
      if (!a) notStarted += 1;
      else if (!a.submittedAt) inProgress += 1;
      else if (t.resultsPublished && a.score != null) {
        scored += 1;
        if (t.maxScore > 0) {
          scoreSum += (a.score / t.maxScore) * 100;
          scoreN += 1;
        }
      } else awaiting += 1;
    }
    const completed = scored + awaiting;
    return {
      assigned: assigned.length,
      notStarted,
      inProgress,
      awaiting,
      scored,
      completed,
      avgPct: scoreN ? Math.round(scoreSum / scoreN) : null,
      attemptCount: data.attempts.length,
    };
  }, [data, role]);

  const staffStats = useMemo(() => {
    if (!data || (role !== "STAFF" && role !== "ADMIN")) return null;
    const list = data.uploadedTests;
    const published = list.filter((t) => t.isPublished).length;
    const drafts = list.length - published;
    const resultsOut = list.filter((t) => t.resultsPublished).length;
    const attempts = list.reduce((s, t) => s + t.attemptCount, 0);
    const top = [...list].sort((a, b) => b.attemptCount - a.attemptCount).slice(0, 5);
    return {
      total: list.length,
      published,
      drafts,
      resultsOut,
      attempts,
      top,
    };
  }, [data, role]);

  if (role === "ADMIN" && !loading && data && data.uploadedTests.length === 0) {
    return null;
  }

  return (
    <section className="person-viz">
      <div className="person-viz__head">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {role === "STUDENT"
              ? "Assessment overview"
              : role === "STAFF"
                ? "Uploaded tests overview"
                : "Uploaded tests"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {role === "STUDENT"
              ? "Graphical view of class tests, progress, and scores."
              : "Publish status, student attempts, and cohort reach."}
          </p>
        </div>
        {role === "STUDENT" ? (
          <StudentReportDownload userId={userId} />
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading graphical details…</p>
      ) : null}
      {err ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}

      {data && role === "STUDENT" && studentStats ? (
        <div className="mt-4 space-y-5">
          <div className="person-viz__board">
            <Donut
              value={studentStats.completed}
              max={Math.max(1, studentStats.assigned)}
              label="Completion"
              sub={`${studentStats.completed} of ${studentStats.assigned} assigned`}
              tone="sky"
            />
            <Donut
              value={studentStats.avgPct ?? 0}
              max={100}
              label="Avg score"
              sub={
                studentStats.avgPct != null
                  ? `${studentStats.avgPct}% across released results`
                  : "No released scores yet"
              }
              tone="emerald"
            />
            <div className="grid grid-cols-2 gap-2 sm:col-span-1">
              <StatChip label="Assigned" value={studentStats.assigned} />
              <StatChip label="Attempts" value={studentStats.attemptCount} />
              <StatChip label="Scored" value={studentStats.scored} hint="Results released" />
              <StatChip label="In progress" value={studentStats.inProgress} />
            </div>
            <AttemptSparkline attempts={data.attempts} />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pipeline
            </p>
            <div className="mt-2">
              <StatusStrip
                items={[
                  {
                    key: "ns",
                    label: "Not started",
                    count: studentStats.notStarted,
                    color: "#a8a29e",
                  },
                  {
                    key: "ip",
                    label: "In progress",
                    count: studentStats.inProgress,
                    color: "#f59e0b",
                  },
                  {
                    key: "aw",
                    label: "Awaiting results",
                    count: studentStats.awaiting,
                    color: "#f59e0b",
                  },
                  {
                    key: "sc",
                    label: "Scored",
                    count: studentStats.scored,
                    color: "#991b1b",
                  },
                ]}
              />
            </div>
          </div>

          {data.attempts.some(
            (a) => a.submittedAt && a.test.resultsPublished && a.score != null
          ) ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Released scores
              </p>
              <div className="mt-2 space-y-2.5">
                {data.attempts
                  .filter(
                    (a) => a.submittedAt && a.test.resultsPublished && a.score != null
                  )
                  .slice(0, 6)
                  .map((a) => (
                    <ScoreBar
                      key={a.id}
                      title={a.test.title}
                      score={a.score!}
                      max={a.maxScore}
                      meta={`${getAssessmentType(a.test.assessmentType).label} · by ${creatorName(a.test.createdBy)}`}
                    />
                  ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Assigned tests ({data.assignedTests.length})
            </p>
            {data.assignedTests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No published tests for this student’s class yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.assignedTests.map((t) => {
                  const type = getAssessmentType(t.assessmentType);
                  const st = statusForAssigned(t);
                  return (
                    <li key={t.id} className="person-viz-card">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-semibold text-slate-900">
                            {t.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {type.label}
                            {isMcqAssessment(t.assessmentType)
                              ? ` · ${t.questionCount} Q · ${t.durationMin} min`
                              : ` · max ${t.maxScore}`}
                            {" · "}
                            By {creatorName(t.createdBy)}
                          </p>
                          {st.pct != null ? (
                            <div className="mt-2 max-w-xs">
                              <div className="person-viz-bar__track">
                                <div
                                  className="person-viz-bar__fill person-viz-bar__fill--ok"
                                  style={{ width: `${st.pct}%` }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                              st.tone === "ok"
                                ? "bg-emerald-100 text-emerald-900"
                                : st.tone === "warn"
                                  ? "bg-amber-100 text-amber-950"
                                  : st.tone === "info"
                                    ? "bg-sky-100 text-sky-900"
                                    : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {st.label}
                          </span>
                          <Link
                            to={`/dashboard/admin/tests/${t.id}`}
                            className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50"
                          >
                            Details
                          </Link>
                          <Link
                            to={`/dashboard/admin/tests/${t.id}/results`}
                            className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100"
                          >
                            Results
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {data && staffStats && (role === "STAFF" || role === "ADMIN") ? (
        <div className="mt-4 space-y-5">
          <div className="person-viz__board">
            <Donut
              value={staffStats.published}
              max={Math.max(1, staffStats.total)}
              label="Published"
              sub={`${staffStats.published} of ${staffStats.total} tests live`}
              tone="teal"
            />
            <Donut
              value={staffStats.resultsOut}
              max={Math.max(1, staffStats.published || 1)}
              label="Results out"
              sub={`${staffStats.resultsOut} with scores released`}
              tone="emerald"
            />
            <div className="grid grid-cols-2 gap-2">
              <StatChip label="Total tests" value={staffStats.total} />
              <StatChip label="Drafts" value={staffStats.drafts} />
              <StatChip
                label="Student attempts"
                value={staffStats.attempts}
                hint="Across uploaded tests"
              />
              <StatChip label="Live now" value={staffStats.published} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Publish mix
            </p>
            <div className="mt-2">
              <StatusStrip
                items={[
                  {
                    key: "pub",
                    label: "Published",
                    count: staffStats.published,
                    color: "#f59e0b",
                  },
                  {
                    key: "dr",
                    label: "Draft",
                    count: staffStats.drafts,
                    color: "#a8a29e",
                  },
                ]}
              />
            </div>
          </div>

          {staffStats.top.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Attempts by test
              </p>
              <div className="mt-2 space-y-2.5">
                {staffStats.top.map((t) => {
                  const maxA = Math.max(1, staffStats.top[0]?.attemptCount ?? 1);
                  const pct = clampPct((t.attemptCount / maxA) * 100);
                  return (
                    <div key={t.id} className="person-viz-bar">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-slate-800">
                          {t.title}
                        </p>
                        <p className="shrink-0 tabular-nums text-xs font-bold text-teal-900">
                          {t.attemptCount}
                        </p>
                      </div>
                      <div className="person-viz-bar__track">
                        <div
                          className="person-viz-bar__fill person-viz-bar__fill--teal"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {t.audience}
                        {" · "}
                        {t.isPublished ? "Published" : "Draft"}
                        {t.resultsPublished ? " · Results out" : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              All uploaded ({data.uploadedTests.length})
            </p>
            {data.uploadedTests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                This account has not uploaded any tests for students yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.uploadedTests.map((t) => {
                  const type = getAssessmentType(t.assessmentType);
                  return (
                    <li key={t.id} className="person-viz-card">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate font-display text-sm font-semibold text-slate-900">
                              {t.title}
                            </p>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                t.isPublished
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {t.isPublished ? "Published" : "Draft"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {type.label}
                            {isMcqAssessment(t.assessmentType)
                              ? ` · ${t.questionCount} Q · ${t.durationMin} min`
                              : ` · max ${t.maxScore}`}
                            {" · "}
                            {t.audience}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold tabular-nums text-sky-950 ring-1 ring-sky-100">
                            {t.attemptCount} attempt{t.attemptCount === 1 ? "" : "s"}
                          </span>
                          <Link
                            to={`/dashboard/admin/tests/${t.id}`}
                            className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-sky-50"
                          >
                            Details
                          </Link>
                          <Link
                            to={`/dashboard/admin/tests/${t.id}/results`}
                            className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100"
                          >
                            Results
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
