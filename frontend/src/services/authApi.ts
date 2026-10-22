/** Auth API — UI talks here; never stores tokens in localStorage. */
import { api } from "@/lib/api";
import type { User } from "@/types";
import type { SessionInfo } from "@/lib/api";

export type TotpSetupPayload = {
  otpauthUrl: string;
  secret: string;
  qrDataUrl: string;
  mandatory?: boolean;
};

export type LoginOk = {
  status: "OK";
  user: User;
  session: SessionInfo;
  recoveryCodes?: string[];
};

export type LoginNeeds2fa = {
  status: "2FA_REQUIRED";
  code: "2FA_REQUIRED";
  pendingToken: string;
  email: string;
  mustChangePassword?: boolean;
};

export type LoginNeeds2faSetup = {
  status: "2FA_SETUP_REQUIRED";
  code: "2FA_SETUP_REQUIRED";
  pendingToken: string;
  email: string;
  mustChangePassword?: boolean;
  setup: TotpSetupPayload;
};

export type LoginResponse = LoginOk | LoginNeeds2fa | LoginNeeds2faSetup;

export type DeviceSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
};

export async function loginRequest(
  email: string,
  password: string
): Promise<LoginResponse> {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function verify2faRequest(
  pendingToken: string,
  code: string
): Promise<LoginOk> {
  return api("/api/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ pendingToken, code }),
  });
}

export async function confirm2faSetupRequest(
  pendingToken: string,
  code: string
): Promise<LoginOk> {
  return api("/api/auth/2fa/setup/confirm", {
    method: "POST",
    body: JSON.stringify({ pendingToken, code }),
  });
}

export async function enable2faStartRequest(): Promise<{
  pendingToken: string;
  setup: TotpSetupPayload;
}> {
  return api("/api/auth/2fa/enable", { method: "POST" });
}

export async function enable2faConfirmRequest(
  pendingToken: string,
  code: string
): Promise<{ ok: boolean; user: User; recoveryCodes?: string[] }> {
  return api("/api/auth/2fa/enable/confirm", {
    method: "POST",
    body: JSON.stringify({ pendingToken, code }),
  });
}

export async function disable2faRequest(
  password: string,
  code: string
): Promise<{ ok: boolean; user: User }> {
  return api("/api/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}

export async function forgotPasswordRequest(email: string): Promise<{ ok: boolean; message: string }> {
  return api("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function passwordResetRequest(
  token: string,
  newPassword: string
): Promise<{
  ok: boolean;
  requiresLogin?: boolean;
  message?: string;
  user?: User;
  session?: SessionInfo;
}> {
  return api("/api/auth/password-reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function listSessionsRequest(): Promise<{ sessions: DeviceSession[] }> {
  return api("/api/auth/sessions");
}

export async function revokeSessionRequest(
  id: string
): Promise<{ ok: boolean; signedOut?: boolean }> {
  return api(`/api/auth/sessions/${id}`, { method: "DELETE" });
}

export async function revokeOtherSessionsRequest(): Promise<{ ok: boolean; revoked: number }> {
  return api("/api/auth/sessions/revoke-others", { method: "POST" });
}

export async function logoutRequest(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export async function changePasswordRequest(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean }> {
  return api("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
