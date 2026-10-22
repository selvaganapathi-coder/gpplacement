import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  disable2faRequest,
  enable2faConfirmRequest,
  enable2faStartRequest,
  type TotpSetupPayload,
} from "@/services/authApi";

export function TwoFactorSettings() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<(TotpSetupPayload & { pendingToken: string }) | null>(
    null
  );
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  if (!user) return null;
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "STAFF" && user.role !== "FACULTY") {
    return null;
  }

  const mandatory = !!user.totpRequired;
  const enabled = !!user.totpEnabled;

  async function startEnable() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setRecoveryCodes(null);
    try {
      const res = await enable2faStartRequest();
      setSetup({ ...res.setup, pendingToken: res.pendingToken });
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start 2FA setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    try {
      const res = await enable2faConfirmRequest(setup.pendingToken, code.trim());
      setSetup(null);
      setCode("");
      setMessage("Authenticator enabled.");
      if (res.recoveryCodes?.length) setRecoveryCodes(res.recoveryCodes);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await disable2faRequest(password, code.trim());
      setPassword("");
      setCode("");
      setRecoveryCodes(null);
      setMessage("Authenticator disabled.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Two-factor authentication</h3>
        <p className="mt-1 text-sm text-slate-600">
          {mandatory
            ? "Required for administrator accounts. Use an authenticator app (Google Authenticator, Authy, Microsoft Authenticator)."
            : "Strongly recommended for staff. Protects your account if a password is leaked."}
        </p>
      </div>

      <p className="text-sm">
        Status:{" "}
        <span className={enabled ? "badge-ok" : "badge-warn"}>
          {enabled ? "Enabled" : mandatory ? "Required — not set" : "Off"}
        </span>
        {enabled && user.totpRecoveryRemaining != null ? (
          <span className="ml-2 text-slate-500">
            · {user.totpRecoveryRemaining} recovery code
            {user.totpRecoveryRemaining === 1 ? "" : "s"} left
          </span>
        ) : null}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-brand-800">{message}</p> : null}

      {recoveryCodes ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-950">Save these recovery codes now</p>
          <p className="mt-1 text-amber-900">They will not be shown again.</p>
          <ul className="mt-2 space-y-1 font-mono text-amber-950">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-secondary mt-2"
            onClick={() => setRecoveryCodes(null)}
          >
            Done
          </button>
        </div>
      ) : null}

      {!enabled && !setup ? (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void startEnable()}>
          {busy ? "Starting…" : "Enable authenticator"}
        </button>
      ) : null}

      {setup ? (
        <form onSubmit={confirmEnable} className="space-y-3">
          <img
            src={setup.qrDataUrl}
            alt="Authenticator QR"
            width={200}
            height={200}
            className="rounded-lg ring-1 ring-stone-200"
          />
          <p className="font-mono text-xs break-all text-slate-600">{setup.secret}</p>
          <label className="block text-sm">
            Enter 6-digit code
            <input
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              required
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
              Confirm
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSetup(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {enabled && !mandatory ? (
        <form onSubmit={onDisable} className="space-y-2 border-t border-stone-100 pt-3">
          <p className="text-sm text-slate-600">Disable requires your password and a current code.</p>
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-lg border border-stone-200 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            placeholder="6-digit code"
            className="w-full rounded-lg border border-stone-200 px-3 py-2"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            required
          />
          <button type="submit" className="btn-secondary" disabled={busy}>
            Disable 2FA
          </button>
        </form>
      ) : null}
    </section>
  );
}
