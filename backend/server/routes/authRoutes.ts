import { Router } from "express";
import QRCode from "qrcode";
import { Role } from "@prisma/client";
import { AuditAction, logAudit } from "../audit";
import {
  ACCESS_TOKEN_MINUTES,
  LOGIN_LOCKOUT_MINUTES,
  LOGIN_LOCKOUT_THRESHOLD,
  SESSION_HOURS,
  SESSION_MS,
  SESSION_WARN_MINUTES,
} from "../config";
import {
  changePasswordLimiter,
  loginLimiter,
  passwordResetLimiter,
} from "../rateLimit";
import {
  invalidateUserGateCache,
  requireAuth,
  requirePermission,
  requireRole,
} from "../middleware/auth";
import {
  PERMISSION_MATRIX,
  permissionsForRole,
  type PermissionCode,
} from "../permissions";
import { prisma } from "../prisma";
import {
  allowDemoSeedPasswordLogin,
  hashPassword,
  isDefaultSeedPassword,
  seedForcePasswordChange,
  validatePasswordStrength,
  verifyPassword,
} from "../password";
import { readJwt } from "../jwt";
import {
  assertActiveSession,
  clearAuthCookies,
  createUserSession,
  listUserSessions,
  revokeAllUserSessions,
  revokeSession,
  revokeSessionFromRefreshCookie,
  rotateRefreshSession,
} from "../sessions";
import { sendPasswordResetEmail } from "../mail";
import {
  hashPasswordResetToken,
  newPasswordResetToken,
  PASSWORD_RESET_MINUTES,
} from "../passwordReset";
import { parseStoredHashes, serializeHashes } from "../recoveryCodes";
import {
  beginTotpSetup,
  buildTotpEnableData,
  checkTotpCode,
  migrateTotpSecretIfNeeded,
  mustEnforceTotp,
  readTwoFaPending,
  roleAllowsMultiSession,
  roleRequiresTotp,
  signTwoFaPending,
  verifySecondFactor,
} from "../twoFactor";

function userPublic(u: {
  id: string;
  email: string;
  name: string;
  role: Role;
  program?: import("@prisma/client").Program | null;
  levelType?: import("@prisma/client").LevelType | null;
  level?: number | null;
  section?: string | null;
  rollNo?: string | null;
  mustChangePassword?: boolean;
  totpEnabled?: boolean;
  totpRecoveryHashes?: string | null;
}) {
  const recoveryLeft = parseStoredHashes(u.totpRecoveryHashes).length;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    program: u.program ?? null,
    levelType: u.levelType ?? null,
    level: u.level ?? null,
    section: u.section ?? null,
    rollNo: u.rollNo ?? null,
    mustChangePassword: !!u.mustChangePassword,
    totpEnabled: !!u.totpEnabled,
    totpRequired: roleRequiresTotp(u.role),
    totpRecoveryRemaining: u.totpEnabled ? recoveryLeft : 0,
  };
}

async function issueSessionResponse(
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    program?: import("@prisma/client").Program | null;
    levelType?: import("@prisma/client").LevelType | null;
    level?: number | null;
    section?: string | null;
    rollNo?: string | null;
    mustChangePassword?: boolean;
    totpEnabled?: boolean;
  },
  mustChange: boolean,
  req: import("express").Request,
  res: import("express").Response,
  extras?: { recoveryCodes?: string[] }
) {
  const exclusive = !roleAllowsMultiSession(user.role);
  const session = await createUserSession(user, req, res, { exclusive });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: AuditAction.LOGIN,
    targetType: "User",
    targetId: user.id,
    success: true,
    req,
    meta: {
      sessionId: session.id,
      exclusive,
      sessionHours: SESSION_HOURS,
      accessTokenMinutes: ACCESS_TOKEN_MINUTES,
      totp: !!user.totpEnabled,
    },
  });
  return res.json({
    status: "OK",
    user: userPublic({ ...user, mustChangePassword: mustChange }),
    session: {
      expiresAt: session.expiresAt.toISOString(),
      idleHours: SESSION_HOURS,
      warnMinutes: SESSION_WARN_MINUTES,
      accessTokenMinutes: ACCESS_TOKEN_MINUTES,
    },
    ...(extras?.recoveryCodes ? { recoveryCodes: extras.recoveryCodes } : {}),
  });
}

export const authRouter = Router();

authRouter.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required." });

    const user = await prisma.user.findUnique({ where: { email } });
    const now = Date.now();

    if (user && user.isActive === false) {
      await logAudit({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.FAILED_LOGIN,
        targetType: "User",
        targetId: user.id,
        success: false,
        req,
        meta: { reason: "ACCOUNT_INACTIVE" },
      });
      return res.status(403).json({
        error: "This account is inactive. Contact an administrator.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    if (user?.lockedUntil && user.lockedUntil.getTime() > now) {
      const mins = Math.ceil((user.lockedUntil.getTime() - now) / 60000);
      await logAudit({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.FAILED_LOGIN,
        targetType: "User",
        targetId: user.id,
        success: false,
        req,
        meta: { reason: "ACCOUNT_LOCKED" },
      });
      return res.status(423).json({
        error: `Account locked after too many failed attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        code: "ACCOUNT_LOCKED",
      });
    }

    const passwordOk =
      !!user && (await verifyPassword(password, user.passwordHash));

    if (!user || !passwordOk) {
      if (user) {
        const failedLoginCount = (user.failedLoginCount ?? 0) + 1;
        const lock =
          failedLoginCount >= LOGIN_LOCKOUT_THRESHOLD
            ? new Date(now + LOGIN_LOCKOUT_MINUTES * 60 * 1000)
            : null;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            ...(lock ? { lockedUntil: lock } : {}),
          },
        });
        await logAudit({
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: AuditAction.FAILED_LOGIN,
          targetType: "User",
          targetId: user.id,
          success: false,
          req,
          meta: { failedLoginCount, locked: !!lock },
        });
        if (lock) {
          return res.status(423).json({
            error: `Too many failed attempts. Account locked for ${LOGIN_LOCKOUT_MINUTES} minutes.`,
            code: "ACCOUNT_LOCKED",
          });
        }
      } else {
        await logAudit({
          actorId: "anonymous",
          actorEmail: email,
          action: AuditAction.FAILED_LOGIN,
          success: false,
          req,
          meta: { reason: "unknown_user" },
        });
      }
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (isDefaultSeedPassword(password) && !allowDemoSeedPasswordLogin()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: true },
      });
      await logAudit({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.FAILED_LOGIN,
        targetType: "User",
        targetId: user.id,
        success: false,
        req,
        meta: { reason: "SEED_PASSWORD_FORBIDDEN" },
      });
      return res.status(403).json({
        error:
          "The demo seed password (changeme123) is disabled in production. Ask an administrator to set a temporary password for your account.",
        code: "SEED_PASSWORD_FORBIDDEN",
      });
    }

    let mustChange = user.mustChangePassword;
    if (
      isDefaultSeedPassword(password) &&
      seedForcePasswordChange()
    ) {
      mustChange = true;
      if (!user.mustChangePassword) {
        await prisma.user.update({
          where: { id: user.id },
          data: { mustChangePassword: true },
        });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const totpStep = mustEnforceTotp(user);
    if (totpStep === "verify") {
      const pendingToken = signTwoFaPending({
        userId: user.id,
        email: user.email,
      });
      return res.json({
        status: "2FA_REQUIRED",
        code: "2FA_REQUIRED",
        pendingToken,
        email: user.email,
        mustChangePassword: mustChange,
      });
    }

    if (totpStep === "setup") {
      const setup = beginTotpSetup(user.email);
      const pendingToken = signTwoFaPending({
        userId: user.id,
        email: user.email,
        setupSecret: setup.secret,
      });
      const qrDataUrl = await QRCode.toDataURL(setup.otpauthUrl, {
        margin: 1,
        width: 220,
      });
      return res.json({
        status: "2FA_SETUP_REQUIRED",
        code: "2FA_SETUP_REQUIRED",
        pendingToken,
        email: user.email,
        mustChangePassword: mustChange,
        setup: {
          otpauthUrl: setup.otpauthUrl,
          secret: setup.secret,
          qrDataUrl,
          mandatory: true,
        },
      });
    }

    return issueSessionResponse(
      { ...user, mustChangePassword: mustChange },
      mustChange,
      req,
      res
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

/** Complete login after password when 2FA already enabled (TOTP or recovery code). */
authRouter.post("/api/auth/2fa/verify", loginLimiter, async (req, res) => {
  const pendingToken = String(req.body?.pendingToken ?? "");
  const code = String(req.body?.code ?? "");
  const pending = readTwoFaPending(pendingToken);
  if (!pending) {
    return res.status(401).json({
      error: "2FA session expired. Sign in again.",
      code: "2FA_PENDING_EXPIRED",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: pending.sub } });
  if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret) {
    return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }

  const verified = verifySecondFactor(user, code);
  if (!verified.ok) {
    await logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.TWO_FA_FAILED,
      targetType: "User",
      targetId: user.id,
      success: false,
      req,
    });
    return res.status(401).json({
      error: "Invalid authenticator or recovery code.",
      code: "2FA_INVALID",
    });
  }

  const patch: {
    totpRecoveryHashes?: string;
    totpSecret?: string;
  } = {};
  if (verified.usedRecovery && verified.remainingHashes) {
    patch.totpRecoveryHashes = serializeHashes(verified.remainingHashes);
    await logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.TWO_FA_RECOVERY_USED,
      targetType: "User",
      targetId: user.id,
      success: true,
      req,
      meta: { remaining: verified.remainingHashes.length },
    });
  }
  const migrated = migrateTotpSecretIfNeeded(user.totpSecret);
  if (migrated && migrated !== user.totpSecret) {
    patch.totpSecret = migrated;
  }
  const fresh =
    Object.keys(patch).length > 0
      ? await prisma.user.update({ where: { id: user.id }, data: patch })
      : user;

  return issueSessionResponse(fresh, !!fresh.mustChangePassword, req, res);
});

/** First-time mandatory (or login-time) 2FA enrollment after password OK. */
authRouter.post("/api/auth/2fa/setup/confirm", loginLimiter, async (req, res) => {
  const pendingToken = String(req.body?.pendingToken ?? "");
  const code = String(req.body?.code ?? "");
  const pending = readTwoFaPending(pendingToken);
  if (!pending?.setupSecret) {
    return res.status(401).json({
      error: "2FA setup expired. Sign in again.",
      code: "2FA_PENDING_EXPIRED",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: pending.sub } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }

  if (!checkTotpCode(pending.setupSecret, code)) {
    await logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.TWO_FA_FAILED,
      targetType: "User",
      targetId: user.id,
      success: false,
      req,
      meta: { phase: "setup" },
    });
    return res.status(401).json({
      error: "Invalid authenticator code. Check the time on your device.",
      code: "2FA_INVALID",
    });
  }

  const enable = buildTotpEnableData(pending.setupSecret);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: enable.totpSecret,
      totpRecoveryHashes: enable.totpRecoveryHashes,
      totpEnabled: true,
      totpVerifiedAt: new Date(),
    },
  });

  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: AuditAction.TWO_FA_ENABLED,
    targetType: "User",
    targetId: user.id,
    success: true,
    req,
    meta: {
      mandatory: roleRequiresTotp(user.role),
      recoveryCodesIssued: enable.recoveryCodes.length,
    },
  });

  return issueSessionResponse(updated, !!updated.mustChangePassword, req, res, {
    recoveryCodes: enable.recoveryCodes,
  });
});

/** Authenticated staff/admin: start optional (or re-setup) enrollment. */
authRouter.post(
  "/api/auth/2fa/enable",
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN, Role.FACULTY),
  async (req, res) => {
    const auth = (req as typeof req & { auth: { sub: string; email: string; role: Role } }).auth;
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.totpEnabled) {
      return res.status(400).json({
        error: "Authenticator is already enabled.",
        code: "2FA_ALREADY_ENABLED",
      });
    }
    const setup = beginTotpSetup(user.email);
    const pendingToken = signTwoFaPending({
      userId: user.id,
      email: user.email,
      setupSecret: setup.secret,
    });
    const qrDataUrl = await QRCode.toDataURL(setup.otpauthUrl, {
      margin: 1,
      width: 220,
    });
    res.json({
      pendingToken,
      setup: {
        otpauthUrl: setup.otpauthUrl,
        secret: setup.secret,
        qrDataUrl,
        mandatory: roleRequiresTotp(user.role),
      },
    });
  }
);

authRouter.post(
  "/api/auth/2fa/enable/confirm",
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN, Role.SUPER_ADMIN, Role.FACULTY),
  async (req, res) => {
    const auth = (req as typeof req & { auth: { sub: string; email: string; role: Role } }).auth;
    const pendingToken = String(req.body?.pendingToken ?? "");
    const code = String(req.body?.code ?? "");
    const pending = readTwoFaPending(pendingToken);
    if (!pending?.setupSecret || pending.sub !== auth.sub) {
      return res.status(400).json({
        error: "Setup expired. Start again.",
        code: "2FA_PENDING_EXPIRED",
      });
    }
    if (!checkTotpCode(pending.setupSecret, code)) {
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.TWO_FA_FAILED,
        targetType: "User",
        targetId: auth.sub,
        success: false,
        req,
        meta: { phase: "enable" },
      });
      return res.status(401).json({
        error: "Invalid authenticator code.",
        code: "2FA_INVALID",
      });
    }
    const enable = buildTotpEnableData(pending.setupSecret);
    const updated = await prisma.user.update({
      where: { id: auth.sub },
      data: {
        totpSecret: enable.totpSecret,
        totpRecoveryHashes: enable.totpRecoveryHashes,
        totpEnabled: true,
        totpVerifiedAt: new Date(),
      },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.TWO_FA_ENABLED,
      targetType: "User",
      targetId: auth.sub,
      success: true,
      req,
      meta: { recoveryCodesIssued: enable.recoveryCodes.length },
    });
    res.json({
      ok: true,
      user: userPublic(updated),
      recoveryCodes: enable.recoveryCodes,
    });
  }
);

/** Staff may disable 2FA. Admins cannot (mandatory). */
authRouter.post(
  "/api/auth/2fa/disable",
  requireAuth,
  requireRole(Role.STAFF, Role.FACULTY, Role.ADMIN, Role.SUPER_ADMIN),
  async (req, res) => {
    const auth = (req as typeof req & { auth: { sub: string; email: string; role: Role } }).auth;
    if (roleRequiresTotp(auth.role)) {
      return res.status(403).json({
        error: "Administrators must keep two-factor authentication enabled.",
        code: "2FA_REQUIRED",
      });
    }
    const password = String(req.body?.password ?? "");
    const code = String(req.body?.code ?? "");
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.totpEnabled || !user.totpSecret) {
      return res.json({ ok: true, user: userPublic(user) });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Password is incorrect." });
    }
    if (!checkTotpCode(user.totpSecret, code)) {
      return res.status(401).json({
        error: "Invalid authenticator code.",
        code: "2FA_INVALID",
      });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpRecoveryHashes: null,
        totpVerifiedAt: null,
      },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.TWO_FA_DISABLED,
      targetType: "User",
      targetId: auth.sub,
      success: true,
      req,
    });
    res.json({ ok: true, user: userPublic(updated) });
  }
);

authRouter.post("/api/auth/logout", async (req, res) => {
  const j = readJwt(req);
  if (j) {
    await logAudit({
      actorId: j.sub,
      actorEmail: j.email,
      actorRole: j.role,
      action: AuditAction.LOGOUT,
      targetType: "User",
      targetId: j.sub,
      success: true,
      req,
      meta: { sessionId: j.sid },
    });
  }
  if (j?.sid) {
    await revokeSession(j.sid, "LOGOUT");
  } else {
    await revokeSessionFromRefreshCookie(req, "LOGOUT");
  }
  clearAuthCookies(res);
  res.status(204).end();
});

/**
 * Rotate refresh cookie → new access + refresh pair (HttpOnly).
 * Browser never sees token values; only Set-Cookie.
 */
authRouter.post("/api/auth/refresh", async (req, res) => {
  const rotated = await rotateRefreshSession(req, res);
  if (!rotated.ok) {
    clearAuthCookies(res);
    return res.status(rotated.status).json({
      error: rotated.error,
      code: rotated.code,
    });
  }
  res.json({
    ok: true,
    session: {
      expiresAt: rotated.expiresAt.toISOString(),
      lastSeenAt: rotated.lastSeenAt.toISOString(),
      idleHours: SESSION_HOURS,
      warnMinutes: SESSION_WARN_MINUTES,
      accessTokenMinutes: ACCESS_TOKEN_MINUTES,
    },
  });
});

authRouter.get("/api/auth/me", async (req, res) => {
  let j = readJwt(req);
  if (!j) {
    const rotated = await rotateRefreshSession(req, res);
    if (!rotated.ok) {
      return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }
    j = rotated.user;
  }
  const user = await prisma.user.findUnique({ where: { id: j.sub } });
  if (!user) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }
  if ((user.tokenVersion ?? 0) !== j.tv) {
    clearAuthCookies(res);
    return res.status(401).json({
      error: "Session expired. Please sign in again.",
      code: "SESSION_REVOKED",
    });
  }
  if (user.isActive === false) {
    clearAuthCookies(res);
    return res.status(403).json({
      error: "This account is inactive. Contact an administrator.",
      code: "ACCOUNT_INACTIVE",
    });
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return res.status(403).json({
      error: "This account is temporarily locked.",
      code: "ACCOUNT_LOCKED",
    });
  }

  // Admins who somehow lack 2FA must enroll before using the app.
  if (roleRequiresTotp(user.role) && !user.totpEnabled) {
    clearAuthCookies(res);
    return res.status(403).json({
      error: "Administrator accounts require two-factor authentication. Sign in again to set it up.",
      code: "2FA_SETUP_REQUIRED",
    });
  }

  const session = await assertActiveSession(req, res, j, { touch: true });
  if (!session.ok) {
    clearAuthCookies(res);
    return res.status(session.status).json({ error: session.error, code: session.code });
  }

  const permissions: PermissionCode[] = await permissionsForRole(user.role);
  res.json({
    user: userPublic(user),
    permissions,
    permissionMatrix: PERMISSION_MATRIX,
    session: {
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      idleHours: SESSION_HOURS,
      warnMinutes: SESSION_WARN_MINUTES,
      idleMs: SESSION_MS,
      accessTokenMinutes: ACCESS_TOKEN_MINUTES,
    },
  });
});

/** Lightweight keep-alive so open tabs stay signed in while the user is active. */
authRouter.post("/api/auth/session/touch", requireAuth, async (req, res) => {
  const expiresAt = (req as typeof req & { sessionExpiresAt?: Date }).sessionExpiresAt;
  res.json({
    ok: true,
    expiresAt: (expiresAt ?? new Date(Date.now() + SESSION_MS)).toISOString(),
    idleHours: SESSION_HOURS,
    warnMinutes: SESSION_WARN_MINUTES,
    accessTokenMinutes: ACCESS_TOKEN_MINUTES,
  });
});

/** Request a password-reset email. Always returns ok (no email enumeration). */
authRouter.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const generic = {
    ok: true,
    message:
      "If that email is registered, a reset link has been sent. Check your inbox (and spam).",
  };
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.isActive !== false) {
    const raw = newPasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashPasswordResetToken(raw),
        passwordResetExpiresAt: expiresAt,
      },
    });
    const mail = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      rawToken: raw,
      expiresMinutes: PASSWORD_RESET_MINUTES,
    });
    await logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      targetType: "User",
      targetId: user.id,
      success: mail.sent,
      req,
      meta: { mailMode: mail.mode },
    });
  } else {
    await logAudit({
      actorId: "anonymous",
      actorEmail: email,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      success: true,
      req,
      meta: { unknown: true },
    });
  }
  res.json(generic);
});

authRouter.post("/api/auth/password-reset", passwordResetLimiter, async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  const next = String(req.body?.newPassword ?? "");
  if (!token || !next) {
    return res.status(400).json({ error: "Token and new password are required." });
  }
  const strengthErr = validatePasswordStrength(next);
  if (strengthErr) return res.status(400).json({ error: strengthErr });

  const tokenHash = hashPasswordResetToken(token);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
      isActive: true,
    },
  });
  if (!user) {
    return res.status(400).json({
      error: "This reset link is invalid or has expired. Request a new one.",
      code: "RESET_TOKEN_INVALID",
    });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });

  invalidateUserGateCache(user.id);
  await revokeAllUserSessions(user.id, "PASSWORD_RESET");
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: AuditAction.PASSWORD_RESET_COMPLETED,
    targetType: "User",
    targetId: user.id,
    success: true,
    req,
  });

  // Do not auto-login after reset if 2FA required — force clean sign-in.
  if (mustEnforceTotp(updated)) {
    return res.json({
      ok: true,
      requiresLogin: true,
      message: "Password updated. Sign in with your new password.",
    });
  }

  const exclusive = !roleAllowsMultiSession(updated.role);
  const session = await createUserSession(updated, req, res, { exclusive });
  await logAudit({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: AuditAction.LOGIN,
    targetType: "User",
    targetId: user.id,
    success: true,
    req,
    meta: { via: "password_reset", sessionId: session.id },
  });
  res.json({
    ok: true,
    user: userPublic(updated),
    session: {
      expiresAt: session.expiresAt.toISOString(),
      idleHours: SESSION_HOURS,
      warnMinutes: SESSION_WARN_MINUTES,
      accessTokenMinutes: ACCESS_TOKEN_MINUTES,
    },
  });
});

authRouter.get("/api/auth/sessions", requireAuth, async (req, res) => {
  const auth = (req as typeof req & { auth: { sub: string; sid?: string } }).auth;
  const sessions = await listUserSessions(auth.sub, auth.sid);
  res.json({ sessions });
});

authRouter.delete("/api/auth/sessions/:id", requireAuth, async (req, res) => {
  const auth = (
    req as typeof req & { auth: { sub: string; email: string; role: Role; sid?: string } }
  ).auth;
  const id = req.params.id;
  const row = await prisma.session.findFirst({
    where: { id, userId: auth.sub, revokedAt: null },
  });
  if (!row) return res.status(404).json({ error: "Session not found." });
  await revokeSession(id, "USER_REVOKED");
  await logAudit({
    actorId: auth.sub,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: AuditAction.SESSION_REVOKED,
    targetType: "Session",
    targetId: id,
    success: true,
    req,
    meta: { current: id === auth.sid },
  });
  if (id === auth.sid) {
    clearAuthCookies(res);
    return res.json({ ok: true, signedOut: true });
  }
  res.json({ ok: true, signedOut: false });
});

authRouter.post("/api/auth/sessions/revoke-others", requireAuth, async (req, res) => {
  const auth = (
    req as typeof req & { auth: { sub: string; email: string; role: Role; sid?: string } }
  ).auth;
  if (!auth.sid) {
    return res.status(400).json({ error: "No current session." });
  }
  const others = await prisma.session.findMany({
    where: { userId: auth.sub, revokedAt: null, id: { not: auth.sid } },
    select: { id: true },
  });
  for (const s of others) {
    await revokeSession(s.id, "USER_REVOKED_OTHERS");
  }
  await logAudit({
    actorId: auth.sub,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: AuditAction.SESSION_REVOKED,
    targetType: "User",
    targetId: auth.sub,
    success: true,
    req,
    meta: { revokedCount: others.length, others: true },
  });
  res.json({ ok: true, revoked: others.length });
});

authRouter.post(
  "/api/auth/change-password",
  changePasswordLimiter,
  requireAuth,
  requirePermission("PROFILE_UPDATE_OWN"),
  async (req, res) => {
    const auth = (
      req as typeof req & { auth: { sub: string; email: string; role: Role; sid?: string } }
    ).auth;
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (!current || !next)
      return res.status(400).json({ error: "Current and new password are required." });

    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!(await verifyPassword(current, user.passwordHash)))
      return res.status(401).json({ error: "Current password is incorrect." });

    const strengthErr = validatePasswordStrength(next);
    if (strengthErr) return res.status(400).json({ error: strengthErr });
    if (await verifyPassword(next, user.passwordHash))
      return res.status(400).json({ error: "New password must be different from the current one." });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(next),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });

    invalidateUserGateCache(user.id);
    await revokeAllUserSessions(user.id, "PASSWORD_CHANGE");
    const exclusive = !roleAllowsMultiSession(updated.role);
    const session = await createUserSession(updated, req, res, { exclusive });

    await logAudit({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.PASSWORD_CHANGED,
      targetType: "User",
      targetId: user.id,
      success: true,
      req,
      meta: { sessionsRevoked: true, sessionId: session.id },
    });

    res.json({ ok: true });
  }
);
