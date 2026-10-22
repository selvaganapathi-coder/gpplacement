import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { EditUserForm, type EditableUser } from "@/components/EditUserForm";
import { PersonTestsSection } from "@/components/PersonTestsSection";
import { api, downloadStudentMarksReport } from "@/lib/api";
import { adminSidebarNav } from "@/lib/dashboardNav";

export function AdminPersonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<EditableUser | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api<{ user: EditableUser }>(`/api/admin/users/${id}`);
      setUser(res.user);
      setErr(null);
    } catch (e) {
      setUser(null);
      setErr(e instanceof Error ? e.message : "Could not load this person.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlock() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/users/${user.id}/unlock`, { method: "POST" });
      setMessage("Account unlocked.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not unlock.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadMarks() {
    if (!user || user.role !== "STUDENT") return;
    setDlBusy(true);
    setMessage(null);
    try {
      await downloadStudentMarksReport(user.id, "admin");
      setMessage("Student marks report downloaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not download report.");
    } finally {
      setDlBusy(false);
    }
  }

  async function confirmRemove() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      navigate("/dashboard/admin", { replace: true });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not remove user.");
      setBusy(false);
      setRemoving(false);
    }
  }

  if (err) {
    return (
      <DashboardShell title="Person" subtitle="" nav={adminSidebarNav}>
        <p className="text-sm text-slate-600">{err}</p>
        <Link
          to="/dashboard/admin"
          className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          ← Back to People
        </Link>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading person…
      </div>
    );
  }

  const roleTitle =
    user.role === "STUDENT" ? "Student" : user.role === "STAFF" ? "Staff" : "Admin";

  return (
    <DashboardShell
      title={user.name}
      subtitle={`${roleTitle} profile, account updates, and assessment graphics`}
      nav={adminSidebarNav}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/dashboard/admin"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to People
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === "STUDENT" ? (
            <button
              type="button"
              disabled={dlBusy}
              onClick={() => void downloadMarks()}
              className="btn-secondary disabled:opacity-60"
            >
              {dlBusy ? "Preparing…" : "Download marks report"}
            </button>
          ) : null}
          {message ? (
            <p className="text-sm font-medium text-emerald-800" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>

      {removing ? (
        <div
          className="mb-5 animate-fade-in rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-warm-sm sm:p-5"
          role="alertdialog"
          aria-labelledby="remove-person-title"
        >
          <p
            id="remove-person-title"
            className="font-display text-base font-semibold text-red-950"
          >
            Remove {user.name}?
          </p>
          <p className="mt-1 text-sm text-red-900/90">
            Deletes {user.email}. This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmRemove()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Removing…" : "Yes, remove"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {user.role === "STUDENT" || user.role === "STAFF" ? (
          <PersonTestsSection userId={user.id} role={user.role} />
        ) : null}

        <EditUserForm
          user={user}
          showTests={false}
          onCancel={() => navigate("/dashboard/admin")}
          onSaved={() => {
            setMessage("Saved all changes.");
            void load();
          }}
          unlockBusy={busy}
          onUnlock={() => void unlock()}
          onRemove={() => setRemoving(true)}
        />
      </div>
    </DashboardShell>
  );
}
