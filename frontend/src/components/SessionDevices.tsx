import { useCallback, useEffect, useState } from "react";
import {
  listSessionsRequest,
  revokeOtherSessionsRequest,
  revokeSessionRequest,
  type DeviceSession,
} from "@/services/authApi";

export function SessionDevices() {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listSessionsRequest();
      setSessions(res.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sessions.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    setBusy(true);
    try {
      const res = await revokeSessionRequest(id);
      if (res.signedOut) {
        window.location.assign("/login?notice=" + encodeURIComponent("Signed out of this device."));
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke session.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeOthers() {
    setBusy(true);
    try {
      await revokeOtherSessionsRequest();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke other sessions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Signed-in devices</h3>
        <p className="mt-1 text-sm text-slate-600">
          Staff and admins may use more than one device. Students are limited to one active session.
          Revoke any device you do not recognize.
        </p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900">
                {s.current ? "This device" : "Other device"}
                {s.ip ? ` · ${s.ip}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                Last seen {new Date(s.lastSeenAt).toLocaleString()}
                {s.userAgent ? ` · ${s.userAgent.slice(0, 60)}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary !min-h-8 text-xs"
              disabled={busy}
              onClick={() => void revoke(s.id)}
            >
              {s.current ? "Sign out" : "Revoke"}
            </button>
          </li>
        ))}
      </ul>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No active sessions.</p>
      ) : null}
      {sessions.some((s) => !s.current) ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void revokeOthers()}
        >
          Sign out other devices
        </button>
      ) : null}
    </section>
  );
}
