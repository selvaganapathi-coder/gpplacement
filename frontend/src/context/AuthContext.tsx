/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types";
import {
  fetchMe,
  onSessionEnded,
  touchSession,
  type SessionInfo,
} from "@/lib/api";
import {
  confirm2faSetupRequest,
  loginRequest,
  logoutRequest,
  verify2faRequest,
  type LoginNeeds2faSetup,
  type LoginResponse,
} from "@/services/authApi";

export type LoginChallenge =
  | { kind: "2fa"; pendingToken: string; email: string }
  | {
      kind: "2fa_setup";
      pendingToken: string;
      email: string;
      setup: LoginNeeds2faSetup["setup"];
    };

type AuthValue = {
  user: User | null;
  loading: boolean;
  session: SessionInfo | null;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  /** Returns a challenge when password OK but 2FA is required / needs setup. */
  login: (email: string, password: string) => Promise<LoginChallenge | null>;
  complete2fa: (pendingToken: string, code: string) => Promise<void>;
  /** Returns one-time recovery codes when 2FA was just enabled. */
  complete2faSetup: (pendingToken: string, code: string) => Promise<string[] | undefined>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  staySignedIn: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const lastTouchRef = useRef(0);
  const expiresAtRef = useRef<number | null>(null);

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const applySession = useCallback((s: SessionInfo | null) => {
    setSession(s);
    expiresAtRef.current = s ? new Date(s.expiresAt).getTime() : null;
  }, []);

  const endLocalSession = useCallback((message: string) => {
    setUser(null);
    applySession(null);
    setWarnOpen(false);
    setSessionNotice(message);
    try {
      sessionStorage.setItem("placement_session_notice", message);
    } catch {
      /* ignore */
    }
  }, [applySession]);

  const refresh = useCallback(async () => {
    const { user: u, session: s } = await fetchMe();
    setUser(u);
    applySession(s);
  }, [applySession]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    return onSessionEnded(({ message }) => {
      endLocalSession(message);
      if (!window.location.pathname.startsWith("/login")) {
        const q = new URLSearchParams({ notice: message });
        window.location.assign(`/login?${q.toString()}`);
      }
    });
  }, [endLocalSession]);

  const staySignedIn = useCallback(async () => {
    const s = await touchSession();
    if (s) {
      applySession(s);
      setWarnOpen(false);
      lastTouchRef.current = Date.now();
    }
  }, [applySession]);

  // Activity → touch session (throttled client-side too)
  useEffect(() => {
    if (!user) return;

    const onActivity = () => {
      const now = Date.now();
      // Align with server TOUCH_THROTTLE (5 min) — avoid hammering /session/touch at scale.
      if (now - lastTouchRef.current < 4 * 60_000) return;
      lastTouchRef.current = now;
      void touchSession().then((s) => {
        if (s) applySession(s);
      });
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [user, applySession]);

  // Warn / expire countdown from server expiresAt
  useEffect(() => {
    if (!user || !session) {
      setWarnOpen(false);
      return;
    }
    const warnMs = (session.warnMinutes || 5) * 60 * 1000;
    const id = window.setInterval(() => {
      const exp = expiresAtRef.current;
      if (!exp) return;
      const left = exp - Date.now();
      if (left <= 0) {
        endLocalSession(
          "Your session timed out after 2 hours of inactivity. Please sign in again."
        );
        window.location.assign(
          `/login?notice=${encodeURIComponent("Your session timed out after 2 hours of inactivity. Please sign in again.")}`
        );
        return;
      }
      setWarnOpen(left <= warnMs);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [user, session, endLocalSession]);

  const applyLoginOk = useCallback(
    async (j: { user?: User; session?: SessionInfo }) => {
      if (j.user) setUser(j.user);
      else await refresh();
      if (j.session) applySession(j.session);
      setSessionNotice(null);
      setWarnOpen(false);
      try {
        sessionStorage.removeItem("placement_session_notice");
      } catch {
        /* ignore */
      }
    },
    [refresh, applySession]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginChallenge | null> => {
      const j: LoginResponse = await loginRequest(email, password);
      if (j.status === "2FA_REQUIRED") {
        return {
          kind: "2fa",
          pendingToken: j.pendingToken,
          email: j.email,
        } satisfies LoginChallenge;
      }
      if (j.status === "2FA_SETUP_REQUIRED") {
        return {
          kind: "2fa_setup",
          pendingToken: j.pendingToken,
          email: j.email,
          setup: j.setup,
        } satisfies LoginChallenge;
      }
      await applyLoginOk(j);
      return null;
    },
    [applyLoginOk]
  );

  const complete2fa = useCallback(
    async (pendingToken: string, code: string) => {
      const j = await verify2faRequest(pendingToken, code);
      await applyLoginOk(j);
    },
    [applyLoginOk]
  );

  const complete2faSetup = useCallback(
    async (pendingToken: string, code: string) => {
      const j = await confirm2faSetupRequest(pendingToken, code);
      await applyLoginOk(j);
      return j.recoveryCodes;
    },
    [applyLoginOk]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      /* still clear local session */
    }
    setUser(null);
    applySession(null);
    setWarnOpen(false);
  }, [applySession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      session,
      sessionNotice,
      clearSessionNotice,
      login,
      complete2fa,
      complete2faSetup,
      logout,
      refresh,
      staySignedIn,
    }),
    [
      user,
      loading,
      session,
      sessionNotice,
      clearSessionNotice,
      login,
      complete2fa,
      complete2faSetup,
      logout,
      refresh,
      staySignedIn,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {warnOpen && user ? (
        <div className="session-warn" role="alertdialog" aria-labelledby="session-warn-title">
          <div className="session-warn__card">
            <h2 id="session-warn-title" className="session-warn__title">
              Are you still here?
            </h2>
            <p className="session-warn__text">
              You’ll be signed out soon if there’s no activity. Tap <strong>Keep me signed in</strong>{" "}
              to continue. Only one device can use your account at a time.
            </p>
            <div className="session-warn__actions">
              <button type="button" className="btn-primary" onClick={() => void staySignedIn()}>
                Keep me signed in
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void logout().then(() => window.location.assign("/login"))}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
