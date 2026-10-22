/**
 * Axios HTTP client for the placement API.
 * Credentials (cookies) only — never attach secrets from localStorage / sessionStorage / URL.
 */
import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { apiBaseUrl, ApiError, type ApiErrorCode } from "@/lib/apiErrors";

type SessionListener = (detail: { code: ApiErrorCode; message: string }) => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionEnded(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSessionEnded(code: ApiErrorCode, message: string) {
  sessionListeners.forEach((fn) => fn({ code, message }));
}

function maybeNotifySession(status: number, code: string | undefined, message: string) {
  if (status !== 401 && status !== 403) return;
  if (
    code === "SESSION_EXPIRED" ||
    code === "SESSION_REVOKED" ||
    code === "SESSION_REPLACED" ||
    code === "ACCOUNT_INACTIVE"
  ) {
    emitSessionEnded(code as ApiErrorCode, message);
  }
}

const base = apiBaseUrl();

export const http = axios.create({
  baseURL: base || undefined,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 120_000,
});

/** Single-flight refresh so parallel 401s share one rotate. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessCookie(): Promise<boolean> {
  if (!refreshInFlight) {
    const cfg: AxiosRequestConfig & { _retry?: boolean } = {
      headers: { "X-Skip-Auth-Refresh": "1" },
      _retry: true,
    };
    refreshInFlight = http
      .post("/api/auth/refresh", undefined, cfg)
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ error?: string; code?: string }>) => {
    const status = error.response?.status ?? 0;
    const data = error.response?.data;
    const message =
      typeof data?.error === "string"
        ? data.error
        : error.message || "Request failed";
    const code = typeof data?.code === "string" ? data.code : undefined;
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    // Access JWT expired → rotate refresh cookie once, then retry.
    const url = String(original?.url || "");
    const skipRefresh =
      original?._retry ||
      original?.headers?.["X-Skip-Auth-Refresh"] === "1" ||
      url.includes("/api/auth/refresh") ||
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/logout") ||
      url.includes("/api/auth/2fa/") ||
      url.includes("/api/auth/forgot-password") ||
      url.includes("/api/auth/password-reset");

    if (
      original &&
      !skipRefresh &&
      status === 401 &&
      (code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED")
    ) {
      original._retry = true;
      const ok = await refreshAccessCookie();
      if (ok) {
        return http.request(original);
      }
    }

    maybeNotifySession(status, code, message);
    const details =
      data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
    return Promise.reject(new ApiError(message, status, code, details));
  }
);

export async function apiRequest<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await http.request<T>({
    url: path,
    ...config,
  });
  if (res.status === 204) return undefined as T;
  return res.data;
}
