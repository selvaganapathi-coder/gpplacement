import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import { api } from "@/lib/api";

export type NotificationType =
  | "submissions"
  | "awaiting_release"
  | "new_assessment"
  | "exam_starting"
  | "assessment_reminder"
  | "result_published"
  | "placement_announcement";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  count: number;
};

type RoleMode = "staff" | "admin" | "student";

const POLL_MS = 60_000;

function endpointFor(role: RoleMode): string {
  if (role === "admin") return "/api/admin/notifications";
  if (role === "staff") return "/api/staff/notifications";
  return "/api/student/notifications";
}

function chipClass(type: NotificationType): string {
  switch (type) {
    case "awaiting_release":
    case "exam_starting":
    case "assessment_reminder":
      return "notif-bell__chip notif-bell__chip--await";
    case "placement_announcement":
      return "notif-bell__chip notif-bell__chip--place";
    case "result_published":
      return "notif-bell__chip notif-bell__chip--ok";
    default:
      return "notif-bell__chip notif-bell__chip--sub";
  }
}

function chipLabel(n: NotificationItem): string {
  if (n.type === "new_assessment") return "NEW";
  if (n.type === "exam_starting") return "15 MIN";
  if (n.type === "assessment_reminder") return "DUE";
  if (n.type === "result_published") return "SCORE";
  if (n.type === "placement_announcement") return "PLACE";
  return n.count > 0 ? String(n.count) : "•";
}

export function NotificationBell({ role }: { role: RoleMode }) {
  const catalog = useAcademicCatalog();
  const [department, setDepartment] = useState(() => {
    if (role !== "admin" || typeof localStorage === "undefined") return "";
    return localStorage.getItem("admin-notif-department") ?? "";
  });
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const load = useCallback(async () => {
    try {
      const base = endpointFor(role);
      const path =
        role === "admin" && department
          ? `${base}?program=${encodeURIComponent(department)}`
          : base;
      const res = await api<{ items: NotificationItem[] }>(path);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch {
      /* keep last good list */
    } finally {
      setLoaded(true);
    }
  }, [role, department]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badgeCount = items.reduce((sum, n) => sum + (n.count > 0 ? 1 : 0), 0);
  const badgeLabel = badgeCount > 9 ? "9+" : String(badgeCount);

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="notif-bell__btn"
        aria-label={
          badgeCount > 0
            ? `Notifications, ${badgeCount} pending`
            : "Notifications"
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="notif-bell__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {badgeCount > 0 ? (
          <span className="notif-bell__badge">{badgeLabel}</span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          className="notif-bell__panel"
          role="region"
          aria-label="Notifications"
        >
          <div className="notif-bell__head">
            <p className="notif-bell__head-title">Notifications</p>
            <button
              type="button"
              className="notif-bell__refresh"
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
          {role === "admin" ? (
            <label className="notif-bell__dept">
              <span className="sr-only">Department</span>
              <select
                value={department}
                onChange={(e) => {
                  const next = e.target.value;
                  setDepartment(next);
                  localStorage.setItem("admin-notif-department", next);
                }}
              >
                <option value="">All departments</option>
                {catalog.departments.map((dept) => (
                  <option key={dept.program} value={dept.program}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!loaded ? (
            <p className="notif-bell__empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="notif-bell__empty">You’re all caught up.</p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.href}
                    className="notif-bell__item"
                    onClick={() => setOpen(false)}
                  >
                    <div className="notif-bell__item-top">
                      <span className="notif-bell__item-title">{n.title}</span>
                      <span className={chipClass(n.type)}>{chipLabel(n)}</span>
                    </div>
                    <span className="notif-bell__item-body">{n.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
