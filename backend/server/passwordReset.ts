import { createHash, randomBytes } from "crypto";

export const PASSWORD_RESET_MINUTES = 30;

export function newPasswordResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(raw: string): string {
  return createHash("sha256").update(`pwreset:${raw}`).digest("hex");
}
