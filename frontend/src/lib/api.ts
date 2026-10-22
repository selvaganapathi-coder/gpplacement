import type { User } from "@/types";
import {
  ApiError,
  apiBaseUrl,
  apiUrl,
  type ApiErrorCode,
} from "@/lib/apiErrors";
import { apiRequest, http, onSessionEnded } from "@/services/http";

export { ApiError, apiBaseUrl, apiUrl, onSessionEnded };
export type { ApiErrorCode };

/**
 * Generic JSON helper (Axios). Prefer `src/services/*Api.ts` for new calls.
 * Never put secrets in the client — auth is httpOnly cookie only.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = { ...(init?.headers as Record<string, string> | undefined) };
  let data: unknown;
  if (init?.body != null) {
    data =
      typeof init.body === "string"
        ? JSON.parse(init.body as string)
        : init.body;
  }
  return apiRequest<T>(path, { method, headers, data });
}

export type SessionInfo = {
  expiresAt: string;
  lastSeenAt?: string;
  idleHours: number;
  warnMinutes: number;
  idleMs?: number;
};

export async function fetchMe(): Promise<{
  user: User | null;
  session: SessionInfo | null;
}> {
  try {
    const j = await apiRequest<{ user: User; session?: SessionInfo }>(
      "/api/auth/me"
    );
    return { user: j.user, session: j.session ?? null };
  } catch {
    return { user: null, session: null };
  }
}

export async function touchSession(): Promise<SessionInfo | null> {
  try {
    const j = await apiRequest<{
      ok: boolean;
      expiresAt: string;
      idleHours: number;
      warnMinutes: number;
    }>("/api/auth/session/touch", { method: "POST" });
    return {
      expiresAt: j.expiresAt,
      idleHours: j.idleHours,
      warnMinutes: j.warnMinutes,
    };
  } catch {
    return null;
  }
}

function filenameFromDisposition(
  header: string | null | undefined,
  fallback: string
): string {
  if (!header) return fallback;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? fallback;
}

async function downloadBlobFromUrl(
  path: string,
  fallbackName: string
): Promise<void> {
  const res = await http.get(path, { responseType: "blob" });
  const filename = filenameFromDisposition(
    res.headers["content-disposition"],
    fallbackName
  );
  const url = URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Alias used by admin export pack (ZIP or CSV). */
export async function downloadFileFromUrl(
  path: string,
  fallbackName: string
): Promise<void> {
  await downloadBlobFromUrl(path, fallbackName);
}

export async function downloadCsvFromUrl(
  path: string,
  fallbackName: string
): Promise<void> {
  await downloadBlobFromUrl(path, fallbackName);
}

export async function downloadResultsCsv(
  testId: string,
  mode: "staff" | "admin",
  filters?: { program?: string; year?: number; minScore?: number; maxScore?: number }
): Promise<void> {
  const base = mode === "admin" ? "/api/admin/tests" : "/api/staff/tests";
  const params = new URLSearchParams();
  if (filters?.program) params.set("program", filters.program);
  if (filters?.year != null && !Number.isNaN(filters.year)) {
    params.set("year", String(filters.year));
  }
  if (filters?.minScore != null && !Number.isNaN(filters.minScore)) {
    params.set("minScore", String(filters.minScore));
  }
  if (filters?.maxScore != null && !Number.isNaN(filters.maxScore)) {
    params.set("maxScore", String(filters.maxScore));
  }
  const qs = params.toString();
  await downloadBlobFromUrl(
    `${base}/${testId}/results/export.csv${qs ? `?${qs}` : ""}`,
    `test-${testId}-results.csv`
  );
}

export async function downloadStudentMarksReport(
  studentId: string,
  mode: "staff" | "admin"
): Promise<void> {
  const base = mode === "admin" ? "/api/admin/reports" : "/api/staff/reports";
  await downloadBlobFromUrl(
    `${base}/students/${studentId}.csv`,
    `student-marks-${studentId}.csv`
  );
}

export async function downloadDepartmentMarksReport(
  mode: "staff" | "admin",
  filters?: {
    program?: string;
    levelType?: string;
    level?: number;
    year?: number;
  }
): Promise<void> {
  const base = mode === "admin" ? "/api/admin/reports" : "/api/staff/reports";
  const params = new URLSearchParams();
  if (filters?.program) params.set("program", filters.program);
  if (filters?.levelType) params.set("levelType", filters.levelType);
  if (filters?.level != null && !Number.isNaN(filters.level)) {
    params.set("level", String(filters.level));
  }
  if (filters?.year != null && !Number.isNaN(filters.year)) {
    params.set("year", String(filters.year));
  }
  const qs = params.toString();
  await downloadBlobFromUrl(
    `${base}/department.csv${qs ? `?${qs}` : ""}`,
    "department-marks.csv"
  );
}
