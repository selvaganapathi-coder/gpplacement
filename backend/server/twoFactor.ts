import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { JWT_SECRET } from "./config";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  hashesFromCodes,
  looksLikeRecoveryCode,
  serializeHashes,
} from "./recoveryCodes";
import {
  decryptSecret,
  encryptSecret,
  ensureEncryptedSecret,
  isEncryptedSecret,
} from "./secretCrypto";
import {
  buildOtpauthUrl,
  generateTotpSecret,
  isAdmin2faMandatory,
  roleRequiresTotp,
  verifyTotp,
} from "./totp";

const PENDING_MINUTES = 5;

export type TwoFaPendingPayload = {
  sub: string;
  email: string;
  purpose: "2fa_pending";
  /** Provisional secret during first-time setup (not yet persisted as enabled). */
  setupSecret?: string;
};

export function signTwoFaPending(params: {
  userId: string;
  email: string;
  setupSecret?: string;
}): string {
  const payload: TwoFaPendingPayload = {
    sub: params.userId,
    email: params.email,
    purpose: "2fa_pending",
    ...(params.setupSecret ? { setupSecret: params.setupSecret } : {}),
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${PENDING_MINUTES}m` });
}

export function readTwoFaPending(token: string): TwoFaPendingPayload | null {
  try {
    const v = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (
      v.purpose !== "2fa_pending" ||
      typeof v.sub !== "string" ||
      typeof v.email !== "string"
    ) {
      return null;
    }
    return {
      sub: v.sub,
      email: v.email,
      purpose: "2fa_pending",
      setupSecret: typeof v.setupSecret === "string" ? v.setupSecret : undefined,
    };
  } catch {
    return null;
  }
}

export function beginTotpSetup(accountEmail: string, issuer?: string) {
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl({
    secret,
    accountName: accountEmail,
    issuer,
  });
  return { secret, otpauthUrl };
}

export function checkTotpCode(secretPlainOrStored: string, code: string): boolean {
  try {
    const plain = isEncryptedSecret(secretPlainOrStored)
      ? decryptSecret(secretPlainOrStored)
      : secretPlainOrStored;
    return verifyTotp(plain, code);
  } catch {
    return false;
  }
}

/** Verify authenticator code OR a one-time recovery code. */
export function verifySecondFactor(user: {
  totpSecret: string | null;
  totpRecoveryHashes: string | null;
}, code: string): { ok: true; usedRecovery: boolean; remainingHashes: string[] | null } | { ok: false } {
  if (!user.totpSecret) return { ok: false };
  if (checkTotpCode(user.totpSecret, code)) {
    return { ok: true, usedRecovery: false, remainingHashes: null };
  }
  if (looksLikeRecoveryCode(code)) {
    const remaining = consumeRecoveryCode(user.totpRecoveryHashes, code);
    if (remaining) {
      return { ok: true, usedRecovery: true, remainingHashes: remaining };
    }
  }
  return { ok: false };
}

export function buildTotpEnableData(plainSecret: string): {
  totpSecret: string;
  totpRecoveryHashes: string;
  recoveryCodes: string[];
} {
  const recoveryCodes = generateRecoveryCodes();
  return {
    totpSecret: encryptSecret(plainSecret),
    totpRecoveryHashes: serializeHashes(hashesFromCodes(recoveryCodes)),
    recoveryCodes,
  };
}

export function migrateTotpSecretIfNeeded(
  stored: string | null
): string | null {
  if (!stored) return null;
  return ensureEncryptedSecret(stored);
}

export { isAdmin2faMandatory, roleRequiresTotp, encryptSecret, decryptSecret };

export function mustEnforceTotp(user: {
  role: Role | string;
  totpEnabled: boolean;
}): "setup" | "verify" | null {
  // When admin 2FA is not mandatory, never interrupt login with QR / codes
  // (optional 2FA can still be enabled later from Settings).
  if (!isAdmin2faMandatory()) return null;
  if (user.totpEnabled) return "verify";
  if (roleRequiresTotp(String(user.role))) return "setup";
  return null;
}

/** Staff/admin may keep several devices; students stay single-session. */
export function roleAllowsMultiSession(role: Role | string): boolean {
  const r = String(role);
  return (
    r === Role.ADMIN ||
    r === Role.SUPER_ADMIN ||
    r === Role.STAFF ||
    r === Role.FACULTY
  );
}
