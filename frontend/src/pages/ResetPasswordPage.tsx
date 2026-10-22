import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { passwordResetRequest } from "@/services/authApi";
import { COLLEGE_BRAND, collegeBrandMark } from "@/lib/collegeBrand";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await passwordResetRequest(token, password);
      if (res.requiresLogin || !res.session) {
        setDone(res.message ?? "Password updated. Sign in with your new password.");
        return;
      }
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-screen">
        <main className="login-side">
          <div className="login-card">
            <h2 className="login-card__title">Invalid link</h2>
            <p className="login-card__lede">This reset link is missing a token.</p>
            <Link to="/forgot-password" className="font-semibold text-brand-800 underline">
              Request a new link
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-screen" data-login-page>
      <aside className="login-hero" aria-label={COLLEGE_BRAND.name}>
        <div className="login-hero__content">
          <h1 className="login-hero__brand">
            <span className="login-hero__brand-main">{COLLEGE_BRAND.name}</span>
          </h1>
        </div>
      </aside>
      <main className="login-side">
        <div className="login-card">
          <header className="login-card__head">
            <div className="login-card__mark" aria-hidden>
              {collegeBrandMark()}
            </div>
            <div>
              <p className="login-card__kicker">Account</p>
              <h2 className="login-card__title">Choose a new password</h2>
            </div>
          </header>
          {done ? (
            <>
              <p className="login-alert login-alert--warn" role="status">
                {done}
              </p>
              <Link to="/login" className="login-submit mt-4 inline-flex justify-center">
                Sign in
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} className="login-form">
              <div className="login-field">
                <label className="login-label" htmlFor="new-pass">
                  New password
                </label>
                <input
                  id="new-pass"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="confirm-pass">
                  Confirm password
                </label>
                <input
                  id="confirm-pass"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="login-input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error ? (
                <p className="login-alert login-alert--error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
