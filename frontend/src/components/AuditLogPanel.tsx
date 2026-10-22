import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type AuditLog = {
  id: string;
  timestamp: string;
  createdAt: string;
  userId: string;
  actorId: string;
  actorEmail: string;
  role: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  entityType: string | null;
  entityId: string | null;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  meta: unknown;
};

function actionLabel(action: string): string {
  return action.replace(/_/g, " ").toLowerCase();
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<{ logs: AuditLog[] }>("/api/admin/audit-logs");
      setLogs(res.logs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load audit logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-title">Security audit log</h2>
          <p className="section-sub">
            Login, users, tests, attempts, result release, imports, and CSV exports — with IP and
            success/failure. Passwords and tokens are never stored.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary">
          Refresh
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading logs…</p> : null}

      {!loading && logs.length === 0 ? (
        <p className="empty-state">No audit events yet.</p>
      ) : null}

      {!loading && logs.length > 0 ? (
        <div className="panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th>OK</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs text-slate-600">
                      {new Date(l.timestamp || l.createdAt).toLocaleString()}
                    </td>
                    <td className="text-sm">
                      <span className="font-medium text-slate-900">{l.actorEmail}</span>
                    </td>
                    <td className="text-xs text-slate-600">{l.role ?? l.actorRole ?? "—"}</td>
                    <td>
                      <span
                        className={
                          !l.success ||
                          l.action.includes("FAIL") ||
                          l.action.includes("LOCK")
                            ? "badge-danger"
                            : l.action.includes("LOGIN") ||
                                l.action.includes("RELEASE") ||
                                l.action.includes("SUCCESS")
                              ? "badge-ok"
                              : "badge-warn"
                        }
                      >
                        {actionLabel(l.action)}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600">
                      {l.targetType ?? l.entityType ?? "—"}
                      {(l.targetId ?? l.entityId) ? (
                        <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                          {(l.targetId ?? l.entityId)!.slice(0, 10)}…
                        </span>
                      ) : null}
                    </td>
                    <td className="font-mono text-[11px] text-slate-500">{l.ip ?? "—"}</td>
                    <td className="text-xs">{l.success ? "Yes" : "No"}</td>
                    <td className="max-w-[12rem] truncate text-xs text-slate-500">
                      {l.meta != null ? JSON.stringify(l.meta) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
