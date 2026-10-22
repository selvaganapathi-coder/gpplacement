import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordRequest } from "@/services/authApi";
import { COLLEGE_BRAND, collegeBrandMark } from "@/lib/collegeBrand";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await forgotPasswordRequest(email.trim().toLowerCase());
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen" data-login-page>
      <aside className="login-hero" aria-label={COLLEGE_BRAND.name}>
        <div className="login-hero__content">
          <h1 className="login-hero__brand">
            <span className="login-hero__brand-main">{COLLEGE_BRAND.name}</span>
          </h1>
          <p className="login-hero__line">Reset your password securely.</p>
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
              <h2 className="login-card__title">Forgot password</h2>
            </div>
          </header>
          <p className="login-card__lede">
            Enter your college email. If it is registered, we send a one-time reset link (expires in
            30 minutes).
          </p>
          <form onSubmit={onSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label" htmlFor="forgot-email">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="username"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? (
              <p className="login-alert login-alert--error" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="login-alert login-alert--warn" role="status">
                {message}
              </p>
            ) : null}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <p className="login-meta mt-4">
            <Link to="/login" className="font-semibold text-brand-800 underline">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
