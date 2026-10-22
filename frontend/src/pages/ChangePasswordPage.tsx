import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { SignOutButton } from "@/components/SignOutButton";
import { changePasswordRequest } from "@/services/authApi";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";

export function ChangePasswordPage() {
  const { user, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setErr("New passwords do not match.");
      return;
    }
    setPending(true);
    setErr(null);
    try {
      await changePasswordRequest(current, next);
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-shell flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-brand-900/10 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
            {COLLEGE_BRAND.name}
          </p>
          <p className="truncate text-sm text-slate-600">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="w-full max-w-md rounded-2xl border border-brand-900/10 bg-white/95 p-6 shadow-warm"
        >
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <p className="mt-2 text-sm text-slate-600">
            For security, set your own password before continuing. Use at least 8 characters,
            with one uppercase letter, one lowercase letter, and a number. You can also sign out
            and return later.
          </p>
          <label className="form-label mt-4 block">
            Current password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label mt-3 block">
            New password
            <input
              type="password"
              required
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="form-input"
            />
          </label>
          <label className="form-label mt-3 block">
            Type new password again
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="form-input"
            />
          </label>
          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="btn-primary mt-5 w-full disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
