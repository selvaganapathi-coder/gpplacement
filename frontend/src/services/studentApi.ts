/** Student exam API — all validation/permissions enforced on the server. */
import { api } from "@/lib/api";

export async function listStudentTests() {
  return api<{ tests: unknown[]; upcoming?: unknown[] }>("/api/student/tests");
}

export async function listStudentAttempts() {
  return api<{ attempts: unknown[] }>("/api/student/attempts");
}

export async function openExamSession(testId: string) {
  return api<Record<string, unknown>>(`/api/student/tests/${testId}/session`);
}

export async function saveAnswers(
  attemptId: string,
  answers: Record<string, string>
) {
  return api<{ ok: boolean }>(`/api/student/attempts/${attemptId}/answers`, {
    method: "PATCH",
    body: JSON.stringify({ answers }),
  });
}

export async function reportProctor(
  attemptId: string,
  event: "TAB_SWITCH" | "FULLSCREEN_EXIT"
) {
  return api<{ ok: boolean; proctorFlagged?: boolean }>(
    `/api/student/attempts/${attemptId}/proctor`,
    {
      method: "POST",
      body: JSON.stringify({ event }),
    }
  );
}

export async function submitAttempt(
  attemptId: string,
  answers: Record<string, string>
) {
  return api<Record<string, unknown>>(
    `/api/student/attempts/${attemptId}/submit`,
    {
      method: "POST",
      body: JSON.stringify({ answers }),
    }
  );
}

export async function fetchAttemptResult(attemptId: string) {
  return api<Record<string, unknown>>(
    `/api/student/attempts/${attemptId}/result`
  );
}
