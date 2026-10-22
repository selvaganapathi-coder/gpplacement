/** Shared API error types (no React / no fetch). */

export type ApiErrorCode =
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "SESSION_REPLACED"
  | "TOKEN_EXPIRED"
  | "ACCOUNT_INACTIVE"
  | "UNAUTHORIZED"
  | "ACCOUNT_LOCKED"
  | "MUST_CHANGE_PASSWORD"
  | string;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ApiErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  if (!base) return path;
  if (path.startsWith("http")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
