import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { DistributionBars, ScoreRing } from "@/components/charts";
import { DashboardShell } from "@/components/DashboardShell";
import {
  IconCalendar,
  IconChart,
  IconClipboard,
  IconDownload,
  IconGraduation,
  IconPlus,
  IconShield,
  IconStaff,
  IconUpload,
  IconUsers,
} from "@/components/Icons";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";
import { MarksDownloadPanel } from "@/components/MarksDownloadPanel";
import { TestsPanel } from "@/components/TestsPanel";
import { UserManagement, type UserRow } from "@/components/UserManagement";
import { api } from "@/lib/api";
import { adminSidebarNav } from "@/lib/dashboardNav";
import type { Role } from "@/types";

type AdminTab = "home" | "users" | "tests" | "audit";

type CampusHealth = {
  summary: {
    submittedAttempts: number;
    averagePercent: number | null;
    passRate: number | null;
    flaggedAttempts: number;
    testsIncluded: number;
  };
  scoreDistribution: { label: string; count: number }[];
};

type HomeOpsTestCard = {
  id: string;
  title: string;
  status: string;
  availableFrom: string | null;
  availableUntil: string | null;
  resultsPublished: boolean;
  pendingSubmissions: number;
  href: string;
};

type HomeOps = {
  schedule: {
    live: HomeOpsTestCard[];
    upcoming: HomeOpsTestCard[];
    overduePublish: HomeOpsTestCard[];
    drafts: HomeOpsTestCard[];
  };
  classGaps: {
    unlinked: {
      key: string;
      label: string;
      studentCount: number;
      inactiveCount: number;
    }[];
    inactiveInActive: {
      key: string;
      label: string;
      studentCount: number;
      inactiveCount: number;
    }[];
  };
  bank: {
    master: { id: string; name: string; questionCount: number } | null;
    emptyCategories: { id: string; name: string }[];
    categoryCount: number;
  };
  readinessOverall: number | null;
  recentAudit: {
    id: string;
    actorEmail: string;
    action: string;
    entityType: string | null;
    createdAt: string;
  }[];
  announcements: {
    id: string;
    title: string;
    body: string;
    createdAt: string;
    expiresAt: string | null;
  }[];
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  FAILED_LOGIN: "Failed sign-in",
  START_ATTEMPT: "Started a test",
  SUBMIT_ATTEMPT: "Submitted a test",
  RESULT_GENERATED: "Score recorded",
  RESULT_RELEASED: "Results released",
  PUBLISH_TEST: "Published a test",
  UNPUBLISH_TEST: "Unpublished a test",
  CREATE_TEST: "Created a test",
  UPDATE_TEST: "Updated a test",
  DELETE_TEST: "Deleted a test",
  CREATE_USER: "Added a person",
  UPDATE_USER: "Updated a person",
  DELETE_USER: "Removed a person",
  ROLE_CHANGED: "Changed a role",
  PASSWORD_CHANGED: "Changed a password",
  QUESTION_IMPORTED: "Imported questions",
  CSV_EXPORTED: "Exported a file",
  CLASS_ASSIGNED: "Assigned a class",
  STUDENT_ASSIGNED: "Assigned a student",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

function shortWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const tabMeta: Record<AdminTab, { title: string; subtitle: string }> = {
  home: {
    title: "Admin home",
    subtitle: "What is live, what is waiting, what can wait",
  },
  users: {
    title: "People",
    subtitle: "D.Pharm · B.Pharm · M.Pharm · Pharm.D",
  },
  tests: {
    title: "Assessments",
    subtitle: "Drafts and published papers",
  },
  audit: {
    title: "Activity log",
    subtitle: "Recent security events",
  },
};

export function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AdminTab =
    tabParam === "users" || tabParam === "tests" || tabParam === "audit"
      ? tabParam
      : "home";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<{ role: Role; _count: { role: number } }[]>([]);
  const [health, setHealth] = useState<CampusHealth | null>(null);
  const [homeOps, setHomeOps] = useState<HomeOps | null>(null);
  const [peoplePanel, setPeoplePanel] = useState<"add" | "import" | null>(null);
  const [marksOpen, setMarksOpen] = useState(false);
  const [pendingResults, setPendingResults] = useState(0);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceMsg, setAnnounceMsg] = useState<string | null>(null);
  const [announceErr, setAnnounceErr] = useState<string | null>(null);
  const [announcePending, startAnnounce] = useTransition();

  const load = useCallback(async () => {
    const j = await api<{ users: UserRow[]; stats: typeof stats }>("/api/admin/users");
    setUsers(j.users);
    setStats(j.stats);
  }, []);

  useEffect(() => {
    if (tab === "home" || tab === "users") void load();
  }, [load, tab]);

  useEffect(() => {
    if (tab !== "home") return;
    let cancelled = false;
    void api<CampusHealth>("/api/admin/analytics")
      .then((res) => {
        if (!cancelled) setHealth(res);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    void api<{ items?: unknown[] }>("/api/admin/notifications")
      .then((res) => {
        if (!cancelled) setPendingResults(Array.isArray(res.items) ? res.items.length : 0);
      })
      .catch(() => {
        if (!cancelled) setPendingResults(0);
      });
    void api<{ ops: HomeOps }>("/api/admin/home-ops")
      .then((res) => {
        if (!cancelled) setHomeOps(res.ops);
      })
      .catch(() => {
        if (!cancelled) setHomeOps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  function postAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setAnnounceErr(null);
    setAnnounceMsg(null);
    startAnnounce(() => {
      void (async () => {
        try {
          await api("/api/admin/announcements", {
            method: "POST",
            body: JSON.stringify({
              title: announceTitle,
              body: announceBody,
            }),
          });
          setAnnounceTitle("");
          setAnnounceBody("");
          setAnnounceMsg("Announcement sent to student notifications.");
          const res = await api<{ ops: HomeOps }>("/api/admin/home-ops");
          setHomeOps(res.ops);
        } catch (err) {
          setAnnounceErr(
            err instanceof Error ? err.message : "Could not post announcement."
          );
        }
      })();
    });
  }

  function archiveAnnouncement(id: string) {
    startAnnounce(() => {
      void (async () => {
        try {
          await api(`/api/admin/announcements/${id}`, { method: "DELETE" });
          const res = await api<{ ops: HomeOps }>("/api/admin/home-ops");
          setHomeOps(res.ops);
        } catch {
          /* ignore */
        }
      })();
    });
  }

  useEffect(() => {
    if (tab !== "users") setPeoplePanel(null);
  }, [tab]);

  const meta = useMemo(() => tabMeta[tab], [tab]);
  const totalPeople = useMemo(
    () => stats.reduce((sum, s) => sum + s._count.role, 0),
    [stats]
  );
  const countFor = (role: Role) =>
    stats.find((s) => s.role === role)?._count.role ?? 0;

  const lockedCount = useMemo(
    () =>
      users.filter((u) => u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now())
        .length,
    [users]
  );
  const staffNoDeptCount = useMemo(
    () => users.filter((u) => u.role === "STAFF" && !u.program).length,
    [users]
  );
  const attentionItems = useMemo(() => {
    const items: { key: string; title: string; detail: string; href: string }[] = [];
    if (lockedCount > 0) {
      items.push({
        key: "locked",
        title: `${lockedCount} locked account${lockedCount === 1 ? "" : "s"}`,
        detail: "Unlock in People so they can sign in again",
        href: "/dashboard/admin?tab=users",
      });
    }
    if (staffNoDeptCount > 0) {
      items.push({
        key: "dept",
        title: `${staffNoDeptCount} staff without department`,
        detail: "Assign a department so staff dashboards work",
        href: "/dashboard/admin?tab=users",
      });
    }
    if (pendingResults > 0) {
      items.push({
        key: "results",
        title: `${pendingResults} result alert${pendingResults === 1 ? "" : "s"}`,
        detail: "Scores waiting to be released or reviewed",
        href: "/dashboard/admin/results",
      });
    }
    const overdue = homeOps?.schedule.overduePublish.length ?? 0;
    if (overdue > 0) {
      items.push({
        key: "overdue",
        title: `${overdue} test${overdue === 1 ? "" : "s"} need results`,
        detail: "Exam ended or students submitted — release scores",
        href: "/dashboard/admin/results",
      });
    }
    const unlinked = homeOps?.classGaps.unlinked.length ?? 0;
    if (unlinked > 0) {
      const students = homeOps!.classGaps.unlinked.reduce(
        (sum, c) => sum + c.studentCount,
        0
      );
      items.push({
        key: "classes",
        title: `${unlinked} class${unlinked === 1 ? "" : "es"} without staff`,
        detail: `${students} student${students === 1 ? "" : "s"} in a class no one covers`,
        href: "/dashboard/admin?tab=users",
      });
    }
    return items;
  }, [lockedCount, staffNoDeptCount, pendingResults, homeOps]);

  const liveCount = homeOps?.schedule.live.length ?? 0;
  const dueCount = homeOps?.schedule.overduePublish.length ?? 0;
  const draftCount = homeOps?.schedule.drafts.length ?? 0;

  return (
    <DashboardShell
      title={meta.title}
      subtitle={meta.subtitle}
      nav={adminSidebarNav}
      fillViewport={tab === "users"}
    >
      {tab === "home" ? (
        <div className="zoho-home">
          <header className="zoho-home__bar">
            <div className="zoho-home__bar-brand">
              <span className="zoho-home__mark" aria-hidden>
                {COLLEGE_BRAND.shortName.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="zoho-home__bar-kicker">{COLLEGE_BRAND.shortName}</p>
                <h2 className="zoho-home__bar-title">Campus control</h2>
                <p className="zoho-home__bar-sub">
                  People · assessments · results
                </p>
              </div>
            </div>
            <div className="zoho-home__bar-actions">
              <Link to="/dashboard/admin/tests/new" className="zoho-home__btn zoho-home__btn--primary">
                <IconPlus className="h-3.5 w-3.5" aria-hidden />
                New assessment
              </Link>
              <Link to="/dashboard/admin?tab=users" className="zoho-home__btn">
                Open People
              </Link>
              <Link to="/dashboard/admin/results" className="zoho-home__btn">
                Results
              </Link>
            </div>
          </header>

          <section className="zoho-home__section" aria-labelledby="zoho-apps-heading">
            <div className="zoho-home__section-head">
              <h3 id="zoho-apps-heading">Apps</h3>
              <span>Jump to a workspace</span>
            </div>
            <div className="zoho-apps">
              {(
                [
                  {
                    to: "/dashboard/admin?tab=users",
                    label: "People",
                    sub: "Directory & access",
                    tone: "blue",
                    icon: <IconUsers className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin?tab=tests",
                    label: "Assessments",
                    sub: "Draft & publish",
                    tone: "teal",
                    icon: <IconClipboard className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin/results",
                    label: "Results",
                    sub: "Release scores",
                    tone: "amber",
                    icon: <IconChart className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin/analytics",
                    label: "Analytics",
                    sub: "Campus insights",
                    tone: "cyan",
                    icon: <IconChart className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin/leaderboard",
                    label: "Leaderboard",
                    sub: "Rankings",
                    tone: "green",
                    icon: <IconGraduation className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin?tab=audit",
                    label: "Activity",
                    sub: "Security log",
                    tone: "slate",
                    icon: <IconShield className="h-5 w-5" />,
                  },
                  {
                    to: "/dashboard/admin/settings",
                    label: "Settings",
                    sub: "Portal & branding",
                    tone: "coral",
                    icon: <IconStaff className="h-5 w-5" />,
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

          <section className="zoho-kpis" aria-label="Campus counts">
            <Link to="/dashboard/admin?tab=users" className="zoho-kpi">
              <span className="zoho-kpi__label">People</span>
              <span className="zoho-kpi__value">{totalPeople || users.length}</span>
            </Link>
            <Link to="/dashboard/admin?tab=users" className="zoho-kpi">
              <span className="zoho-kpi__label">Students</span>
              <span className="zoho-kpi__value">{countFor("STUDENT")}</span>
            </Link>
            <Link to="/dashboard/admin?tab=users" className="zoho-kpi">
              <span className="zoho-kpi__label">Staff</span>
              <span className="zoho-kpi__value">{countFor("STAFF")}</span>
            </Link>
            <Link to="/dashboard/admin?tab=tests" className={`zoho-kpi${liveCount > 0 ? " zoho-kpi--live" : ""}`}>
              <span className="zoho-kpi__label">Live now</span>
              <span className="zoho-kpi__value">{homeOps ? liveCount : "—"}</span>
            </Link>
            <Link
              to="/dashboard/admin/results"
              className={`zoho-kpi${dueCount > 0 ? " zoho-kpi--hot" : ""}`}
            >
              <span className="zoho-kpi__label">Results due</span>
              <span className="zoho-kpi__value">{homeOps ? dueCount : "—"}</span>
            </Link>
            <Link to="/dashboard/admin/analytics" className="zoho-kpi">
              <span className="zoho-kpi__label">Readiness</span>
              <span className="zoho-kpi__value">
                {homeOps?.readinessOverall != null
                  ? `${Math.round(homeOps.readinessOverall)}%`
                  : "—"}
              </span>
            </Link>
          </section>

          {attentionItems.length > 0 ? (
            <section className="zoho-alert" aria-label="Needs attention">
              <div className="zoho-alert__head">
                <h3>Needs attention</h3>
                <span>{attentionItems.length} item{attentionItems.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="zoho-alert__list">
                {attentionItems.map((item) => (
                  <li key={item.key}>
                    <Link to={item.href} className="zoho-alert__item">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {homeOps ? (
            <section className="zoho-panel" aria-labelledby="zoho-schedule-heading">
              <div className="zoho-panel__head">
                <h3 id="zoho-schedule-heading">
                  <IconCalendar className="h-4 w-4" aria-hidden />
                  Today’s schedule
                </h3>
                <Link to="/dashboard/admin?tab=tests">All assessments →</Link>
              </div>
              <div className="zoho-schedule">
                {(
                  [
                    {
                      label: "Live now",
                      hint: "Students can take these",
                      list: homeOps.schedule.live,
                      tone: "live",
                      empty: "Nothing is open right now",
                      time: (t: HomeOpsTestCard) =>
                        t.availableUntil
                          ? `Ends ${shortWhen(t.availableUntil)}`
                          : "Open",
                    },
                    {
                      label: "Starting soon",
                      hint: "Opens in the next 48 hours",
                      list: homeOps.schedule.upcoming,
                      tone: "soon",
                      empty: "Nothing starting soon",
                      time: (t: HomeOpsTestCard) =>
                        t.availableFrom
                          ? `Opens ${shortWhen(t.availableFrom)}`
                          : "Scheduled",
                    },
                    {
                      label: "Release results",
                      hint: "Scores stay hidden until you release them",
                      list: homeOps.schedule.overduePublish,
                      tone: "due",
                      empty: "No scores waiting",
                      time: (t: HomeOpsTestCard) =>
                        t.pendingSubmissions > 0
                          ? `${t.pendingSubmissions} submitted`
                          : t.availableUntil
                            ? `Ended ${shortWhen(t.availableUntil)}`
                            : "Waiting",
                    },
                    {
                      label: "Drafts",
                      hint: "Finish when you are ready — not urgent",
                      list: homeOps.schedule.drafts,
                      tone: "draft",
                      empty: "No drafts",
                      time: (_t: HomeOpsTestCard) => "Not published",
                    },
                  ] as const
                ).map((col) => {
                  const shown = col.list.slice(0, 5);
                  const extra = col.list.length - shown.length;
                  return (
                    <div
                      key={col.label}
                      className={`zoho-schedule__block zoho-schedule__block--${col.tone}`}
                    >
                      <p className="zoho-schedule__label">
                        {col.label}
                        <em>{col.list.length}</em>
                      </p>
                      <p className="zoho-schedule__hint">{col.hint}</p>
                      {shown.length === 0 ? (
                        <p className="zoho-schedule__empty">{col.empty}</p>
                      ) : (
                        <ul>
                          {shown.map((t) => (
                            <li key={t.id}>
                              <Link to={t.href}>
                                <span>{t.title}</span>
                                <small>{col.time(t)}</small>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {extra > 0 ? (
                        <Link to="/dashboard/admin?tab=tests" className="zoho-more">
                          {extra} more
                        </Link>
                      ) : col.tone === "draft" && draftCount > 0 ? (
                        <Link to="/dashboard/admin?tab=tests" className="zoho-more">
                          Open drafts
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="zoho-panel__hint px-1">Loading today’s schedule…</p>
          )}

          <div className="zoho-ops">
            {homeOps ? (
              <section className="zoho-panel">
                <div className="zoho-panel__head">
                  <h3>
                    <IconGraduation className="h-4 w-4" aria-hidden />
                    Campus snapshot
                  </h3>
                  <Link to="/dashboard/admin/analytics">Insights →</Link>
                </div>
                <div className="zoho-panel__body">
                  <div className="zoho-mini-stats zoho-mini-stats--pair">
                    <div>
                      <span>Readiness</span>
                      <strong>
                        {homeOps.readinessOverall != null
                          ? `${Math.round(homeOps.readinessOverall)}%`
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Drafts</span>
                      <strong>{draftCount}</strong>
                    </div>
                    {health ? (
                      <>
                        <div>
                          <span>Campus avg</span>
                          <strong>
                            {health.summary.averagePercent != null
                              ? `${Math.round(health.summary.averagePercent)}%`
                              : "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Pass rate</span>
                          <strong>
                            {health.summary.passRate != null
                              ? `${Math.round(health.summary.passRate)}%`
                              : "—"}
                          </strong>
                        </div>
                      </>
                    ) : null}
                  </div>
                  <p className="zoho-panel__hint">
                    Readiness uses released scores only. Students see a result after the exam end time you set.
                  </p>
                  <div className="zoho-panel__actions">
                    <Link to="/dashboard/admin/leaderboard" className="zoho-home__btn">
                      Leaderboard
                    </Link>
                    <Link to="/dashboard/admin/results" className="zoho-home__btn">
                      Release results
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="zoho-panel">
              <div className="zoho-panel__head">
                <h3>Campus announcement</h3>
              </div>
              <div className="zoho-panel__body">
                <p className="zoho-panel__hint">
                  Posts to the student notification bell for 7 days.
                </p>
                <form onSubmit={postAnnouncement} className="zoho-announce">
                  <input
                    required
                    value={announceTitle}
                    onChange={(e) => setAnnounceTitle(e.target.value)}
                    placeholder="Title"
                  />
                  <textarea
                    required
                    rows={2}
                    value={announceBody}
                    onChange={(e) => setAnnounceBody(e.target.value)}
                    placeholder="Short message for students…"
                  />
                  <button type="submit" disabled={announcePending} className="zoho-home__btn zoho-home__btn--primary">
                    {announcePending ? "Sending…" : "Post announcement"}
                  </button>
                </form>
                {announceErr ? (
                  <p className="mt-2 text-sm text-red-600">{announceErr}</p>
                ) : null}
                {announceMsg ? (
                  <p className="mt-2 text-sm text-emerald-800">{announceMsg}</p>
                ) : null}
                {homeOps?.announcements?.length ? (
                  <ul className="zoho-announce-list">
                    {homeOps.announcements.map((a) => (
                      <li key={a.id}>
                        <div>
                          <strong>{a.title}</strong>
                          <span>{a.body}</span>
                        </div>
                        <button type="button" onClick={() => archiveAnnouncement(a.id)}>
                          Archive
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>

            {homeOps?.recentAudit?.length ? (
              <section className="zoho-panel">
                <div className="zoho-panel__head">
                  <h3>Recent activity</h3>
                  <Link to="/dashboard/admin?tab=audit">Full log →</Link>
                </div>
                <ul className="zoho-activity">
                  {homeOps.recentAudit.map((l) => (
                    <li key={l.id}>
                      <strong>{actionLabel(l.action)}</strong>
                      <span>
                        {l.actorEmail} · {shortWhen(l.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {health ? (
            <section className="zoho-panel zoho-panel--wide">
              <div className="zoho-panel__head">
                <h3>Campus health</h3>
                <Link to="/dashboard/admin/analytics">Insights →</Link>
              </div>
              <div className="zoho-health">
                <div className="zoho-health__rings">
                  <ScoreRing
                    percent={health.summary.averagePercent}
                    label="Campus avg"
                    sublabel={`${health.summary.submittedAttempts} attempts`}
                  />
                  <ScoreRing
                    percent={health.summary.passRate}
                    label="Pass rate"
                    sublabel={`${health.summary.testsIncluded} tests`}
                  />
                </div>
                <div className="zoho-health__chart">
                  <p className="zoho-panel__hint">Score bands across submitted attempts</p>
                  <DistributionBars
                    bands={(health.scoreDistribution ?? []).map((b) => ({
                      label: b.label,
                      count: b.count,
                    }))}
                  />
                  <p className="zoho-panel__hint mt-2">
                    Flagged attempts: {health.summary.flaggedAttempts}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : tab === "users" ? (
        <div className="people-page">
          <section className="people-toolbar">
            <div className="people-toolbar__left">
              <span className="people-toolbar__icon" aria-hidden>
                <IconUsers className="h-4 w-4" />
              </span>
              <h2 className="people-toolbar__title">Directory</h2>
              <ul className="people-toolbar__stats" aria-label="Counts">
                <li>
                  <IconGraduation className="h-3.5 w-3.5" />
                  <strong>{countFor("STUDENT")}</strong>
                  <span>students</span>
                </li>
                <li>
                  <IconStaff className="h-3.5 w-3.5" />
                  <strong>{countFor("STAFF")}</strong>
                  <span>staff</span>
                </li>
                <li>
                  <IconShield className="h-3.5 w-3.5" />
                  <strong>{countFor("ADMIN") + countFor("SUPER_ADMIN")}</strong>
                  <span>admins</span>
                </li>
                <li className="people-toolbar__total">
                  <strong>{totalPeople || users.length}</strong>
                  <span>total</span>
                </li>
              </ul>
            </div>
            <div className="people-toolbar__actions">
              <button
                type="button"
                onClick={() => setPeoplePanel("add")}
                className="btn-primary people-toolbar__btn"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Add
              </button>
              <button
                type="button"
                onClick={() => setPeoplePanel("import")}
                className="btn-secondary people-toolbar__btn"
              >
                <IconUpload className="h-3.5 w-3.5" />
                Import
              </button>
              <button
                type="button"
                onClick={() => setMarksOpen((v) => !v)}
                className="btn-secondary people-toolbar__btn"
                aria-expanded={marksOpen}
              >
                <IconDownload className="h-3.5 w-3.5" />
                {marksOpen ? "Hide" : "CSV"}
              </button>
            </div>
          </section>

          {marksOpen ? (
            <div className="people-page__extra shrink-0">
              <MarksDownloadPanel mode="admin" />
            </div>
          ) : null}

          <UserManagement
            users={users}
            onRefresh={() => void load()}
            externalPanel={peoplePanel}
            onExternalPanelHandled={() => setPeoplePanel(null)}
            hidePrimaryActions
            compact
          />
        </div>
      ) : tab === "audit" ? (
        <AuditLogPanel />
      ) : (
        <TestsPanel
          mode="admin"
          newTestPath="/dashboard/admin/tests/new"
          viewQuestionsPath={(id) => `/dashboard/admin/tests/${id}`}
          editQuestionsPath={(id) => `/dashboard/admin/tests/${id}/edit`}
          resultsPath={(id) => `/dashboard/admin/tests/${id}/results`}
        />
      )}
    </DashboardShell>
  );
}
