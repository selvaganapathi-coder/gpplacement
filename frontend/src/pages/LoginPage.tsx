import { Suspense, useEffect, useId, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, type LoginChallenge } from "@/context/AuthContext";
import { ApiError } from "@/lib/apiErrors";
import { COLLEGE_BRAND, collegeBrandMark } from "@/lib/collegeBrand";

const authErrors: Record<string, string> = {
  AccessDenied: "You do not have access to that page.",
  Configuration: "Sign-in is misconfigured. Contact the administrator.",
  Verification: "The verification link expired or was already used.",
  Default: "Sign-in failed. Please try again.",
};

/** Demo helpers are local-dev only — never ship passwords in production UI. */
const SHOW_DEMO_LOGIN = import.meta.env.DEV;
const DEMO_PASSWORD = "changeme123";

/** Only warn about missing API after a real failed call — same-origin /api works on Netlify Functions. */
function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) {
    return "API not found (404). If this is a static-only host, set VITE_API_URL to your API, or open the local app at http://127.0.0.1:5173 with the API on :3001.";
  }
  if (e instanceof ApiError && e.code === "ACCOUNT_INACTIVE") {
    return "This account is inactive. Ask an administrator to enable it again.";
  }
  if (e instanceof Error) return e.message;
  return "Invalid email or password.";
}

type DemoAccount = {
  role: string;
  email: string;
  hint: string;
  tone: "admin" | "staff" | "student";
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "Admin",
    email: "admin@gppharmacy.edu",
    hint: "Campus control",
    tone: "admin",
  },
];

/** One staff login per department — questions/tests stay in that program. */
const DEPT_STAFF_ACCOUNTS: DemoAccount[] = [
  {
    role: "D.Pharm",
    email: "staff.dpharm@gppharmacy.edu",
    hint: "Dept questions",
    tone: "staff",
  },
  {
    role: "B.Pharm",
    email: "staff.bpharm@gppharmacy.edu",
    hint: "Dept questions",
    tone: "staff",
  },
  {
    role: "M.Pharm",
    email: "staff.mpharm@gppharmacy.edu",
    hint: "Dept questions",
    tone: "staff",
  },
  {
    role: "Pharm.D",
    email: "staff.pharmd@gppharmacy.edu",
    hint: "Dept questions",
    tone: "staff",
  },
];

/** One student login per department — take exams for that program. */
const DEPT_STUDENT_ACCOUNTS: DemoAccount[] = [
  {
    role: "D.Pharm",
    email: "student.dpharm@gppharmacy.edu",
    hint: "Take exams",
    tone: "student",
  },
  {
    role: "B.Pharm",
    email: "student.bpharm@gppharmacy.edu",
    hint: "Take exams",
    tone: "student",
  },
  {
    role: "M.Pharm",
    email: "student.mpharm@gppharmacy.edu",
    hint: "Take exams",
    tone: "student",
  },
  {
    role: "Pharm.D",
    email: "student.pharmd@gppharmacy.edu",
    hint: "Take exams",
    tone: "student",
  },
];

function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    login,
    complete2fa,
    complete2faSetup,
    user,
    loading: authLoading,
    sessionNotice,
    clearSessionNotice,
  } = useAuth();
  const from =
    (location.state as { from?: string } | null)?.from ||
    searchParams.get("from") ||
    "/dashboard";
  const urlError = searchParams.get("error");
  const urlNotice = searchParams.get("notice");
  const emailId = useId();
  const passwordId = useId();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const totpId = useId();

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("placement_session_notice");
      if (stored) sessionStorage.removeItem("placement_session_notice");
    } catch {
      /* ignore */
    }
    const msg = urlNotice || sessionNotice || stored;
    if (msg) {
      setNotice(msg);
      clearSessionNotice();
    }
  }, [urlNotice, sessionNotice, clearSessionNotice]);

  useEffect(() => {
    if (!authLoading && !user) {
      emailRef.current?.focus();
    }
  }, [authLoading, user]);

  if (authLoading) {
    return <LoginFallback />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const urlErrorMessage =
    urlError && (authErrors[urlError] ?? authErrors.Default);

  function fillDemo(account: DemoAccount) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setActiveDemo(account.email);
    setError(null);
    setShowPassword(false);
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShake(false);
    try {
      const next = await login(email.trim().toLowerCase(), password);
      if (next) {
        setChallenge(next);
        setTotpCode("");
        setNotice(null);
        return;
      }
      setNotice(null);
      navigate(from, { replace: true });
    } catch (e) {
      setError(loginErrorMessage(e));
      setShake(true);
      window.setTimeout(() => setShake(false), 520);
    } finally {
      setLoading(false);
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setLoading(true);
    setError(null);
    setShake(false);
    try {
      if (challenge.kind === "2fa") {
        await complete2fa(challenge.pendingToken, totpCode.trim());
        setChallenge(null);
        setNotice(null);
        navigate(from, { replace: true });
      } else {
        const codes = await complete2faSetup(challenge.pendingToken, totpCode.trim());
        setChallenge(null);
        setNotice(null);
        if (codes && codes.length > 0) {
          setRecoveryCodes(codes);
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      setError(loginErrorMessage(err));
      setShake(true);
      window.setTimeout(() => setShake(false), 520);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen" data-login-page>
      <aside className="login-hero" aria-label={COLLEGE_BRAND.name}>
        <div className="login-hero__bg" aria-hidden>
          <span className="login-hero__orb login-hero__orb--a" />
          <span className="login-hero__orb login-hero__orb--b" />
          <span className="login-hero__orb login-hero__orb--c" />
          <span className="login-hero__ray" />
        </div>

        <div className="login-hero__content">
          <p className="login-hero__eyebrow">{COLLEGE_BRAND.tagline}</p>
          <h1 className="login-hero__brand">
            <span className="login-hero__brand-main">{COLLEGE_BRAND.name}</span>
          </h1>
          <p className="login-hero__line">One portal for assessments, departments, and every role.</p>
        </div>

        <p className="login-hero__credit">Training &amp; placement cell</p>
      </aside>

      <main className="login-side">
        <div className="login-side__glow" aria-hidden />

        <div className={`login-card${shake ? " login-card--shake" : ""}`}>
          <header className="login-card__head">
            <div className="login-card__mark" aria-hidden>
              {collegeBrandMark()}
            </div>
            <div>
              <p className="login-card__kicker">Welcome back</p>
              <h2 className="login-card__title">
                {challenge
                  ? challenge.kind === "2fa_setup"
                    ? "Set up authenticator"
                    : "Authenticator code"
                  : "Sign in"}
              </h2>
            </div>
          </header>

          {recoveryCodes ? (
            <>
              <p className="login-card__lede">
                Save these one-time recovery codes in a safe place. Each code can be used once if you
                lose your authenticator.
              </p>
              <ul className="my-3 space-y-1 rounded-lg bg-stone-50 p-3 font-mono text-sm">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button
                type="button"
                className="login-submit"
                onClick={() => navigate(from, { replace: true })}
              >
                I saved my codes — continue
              </button>
            </>
          ) : challenge ? (
            <>
              <p className="login-card__lede">
                {challenge.kind === "2fa_setup"
                  ? "Admin accounts require two-factor authentication. Scan the QR code with Google Authenticator or Authy, then enter the 6-digit code."
                  : `Enter the 6-digit authenticator code (or a recovery code) for ${challenge.email}.`}
              </p>
              {challenge.kind === "2fa_setup" ? (
                <div className="mt-3 space-y-2 text-center">
                  <img
                    src={challenge.setup.qrDataUrl}
                    alt="Authenticator QR code"
                    className="mx-auto rounded-lg ring-1 ring-stone-200"
                    width={220}
                    height={220}
                  />
                  <p className="font-mono text-xs text-slate-600 break-all">
                    {challenge.setup.secret}
                  </p>
                </div>
              ) : null}
              {notice ? (
                <p className="login-alert login-alert--warn" role="status">
                  {notice}
                </p>
              ) : null}
              <form onSubmit={onTotpSubmit} className="login-form" noValidate>
                <div className="login-field">
                  <label className="login-label" htmlFor={totpId}>
                    {challenge.kind === "2fa" ? "Authenticator or recovery code" : "Authentication code"}
                  </label>
                  <input
                    id={totpId}
                    name="totp"
                    type="text"
                    inputMode={challenge.kind === "2fa_setup" ? "numeric" : "text"}
                    autoComplete="one-time-code"
                    maxLength={challenge.kind === "2fa_setup" ? 6 : 20}
                    required
                    value={totpCode}
                    onChange={(e) =>
                      setTotpCode(
                        challenge.kind === "2fa_setup"
                          ? e.target.value.replace(/\D/g, "").slice(0, 6)
                          : e.target.value.toUpperCase().slice(0, 20)
                      )
                    }
                    placeholder={challenge.kind === "2fa_setup" ? "000000" : "000000 or XXXX-XXXX"}
                    className="login-input"
                    autoFocus
                  />
                </div>
                <div aria-live="polite" className="login-error-slot">
                  {error ? (
                    <p className="login-alert login-alert--error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    (challenge.kind === "2fa_setup"
                      ? totpCode.length !== 6
                      : totpCode.replace(/[^A-Z0-9]/gi, "").length < 6)
                  }
                  className="login-submit"
                >
                  {loading ? "Verifying…" : "Verify and continue"}
                </button>
                <button
                  type="button"
                  className="login-show mt-2"
                  onClick={() => {
                    setChallenge(null);
                    setTotpCode("");
                    setError(null);
                  }}
                >
                  ← Back to email and password
                </button>
              </form>
            </>
          ) : (
            <>
          <p className="login-card__lede">
            {SHOW_DEMO_LOGIN
              ? "Tap Admin, a department staff, or a department student to fill the form."
              : "Use your college email and password to continue."}
          </p>

          {SHOW_DEMO_LOGIN ? (
          <>
          <div className="login-roles login-roles--roles" role="group" aria-label="Demo admin">
            {DEMO_ACCOUNTS.map((account) => {
              const selected = activeDemo === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  className={`login-role login-role--${account.tone}${
                    selected ? " is-on" : ""
                  }`}
                  onClick={() => fillDemo(account)}
                >
                  <span className="login-role__name">{account.role}</span>
                  <span className="login-role__hint">{account.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="login-roles__label">Department staff (make questions)</p>
          <div
            className="login-roles login-roles--depts"
            role="group"
            aria-label="Department staff logins"
          >
            {DEPT_STAFF_ACCOUNTS.map((account) => {
              const selected = activeDemo === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  className={`login-role login-role--${account.tone}${
                    selected ? " is-on" : ""
                  }`}
                  onClick={() => fillDemo(account)}
                  title={account.email}
                >
                  <span className="login-role__name">{account.role}</span>
                  <span className="login-role__hint">{account.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="login-roles__label">Department students (take exams)</p>
          <div
            className="login-roles login-roles--depts"
            role="group"
            aria-label="Department student logins"
          >
            {DEPT_STUDENT_ACCOUNTS.map((account) => {
              const selected = activeDemo === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  className={`login-role login-role--${account.tone}${
                    selected ? " is-on" : ""
                  }`}
                  onClick={() => fillDemo(account)}
                  title={account.email}
                >
                  <span className="login-role__name">{account.role}</span>
                  <span className="login-role__hint">{account.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="login-roles__pass">
            Demo password <code>{DEMO_PASSWORD}</code>
          </p>
          </>
          ) : null}

          {notice ? (
            <p className="login-alert login-alert--warn" role="status">
              {notice}
            </p>
          ) : null}
          {urlErrorMessage ? (
            <p className="login-alert login-alert--warn" role="alert">
              {urlErrorMessage}
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="login-form" noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor={emailId}>
                Email
              </label>
              <input
                ref={emailRef}
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setActiveDemo(null);
                }}
                placeholder={`name@${COLLEGE_BRAND.emailDomain}`}
                className="login-input"
              />
            </div>

            <div className="login-field">
              <div className="login-field__row">
                <label className="login-label" htmlFor={passwordId}>
                  Password
                </label>
                <button
                  type="button"
                  className="login-show"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id={passwordId}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setActiveDemo(null);
                }}
                placeholder="Enter password"
                className="login-input"
              />
            </div>

            <div aria-live="polite" className="login-error-slot">
              {error ? (
                <p className="login-alert login-alert--error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? (
                <>
                  <span className="login-submit__spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                <>
                  Continue
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </form>
          <p className="login-meta mt-3">
            <a href="/forgot-password" className="font-semibold text-brand-800 underline">
              Forgot password?
            </a>
          </p>
            </>
          )}

          <p className="login-meta">
            Sessions last 2 hours · one device at a time
            {challenge ? " · admin 2FA required" : ""}
          </p>
        </div>
      </main>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="login-fallback" data-login-page>
      <div className="login-fallback__card">
        <span className="login-submit__spin login-submit__spin--brand" aria-hidden />
        <span>Preparing sign-in…</span>
      </div>
    </div>
  );
}

export function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
