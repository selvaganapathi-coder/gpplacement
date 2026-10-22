import crypto from "crypto";
import type { Request, Response } from "express";
import { prisma } from "./prisma";
import {
  ACCESS_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SESSION_MS,
  accessCookieOptions,
  clearCookieOptions,
  refreshCookieOptions,
} from "./config";
import { signAccessToken, type JwtUser } from "./jwt";

export type SessionCheckOk = {
  ok: true;
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
};

export type SessionCheckFail = {
  ok: false;
  status: number;
  error: string;
  code: "SESSION_EXPIRED" | "SESSION_REVOKED" | "SESSION_REPLACED" | "UNAUTHORIZED";
};

const TOUCH_THROTTLE_MS = 5 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 20_000;

type CachedSession = {
  userId: string;
  expiresAt: number;
  lastSeenAt: number;
  revokedAt: number | null;
  revokeReason: string | null;
  cachedAt: number;
};

const sessionCache = new Map<string, CachedSession>();

function cacheSession(row: {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}) {
  sessionCache.set(row.id, {
    userId: row.userId,
    expiresAt: row.expiresAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
    revokedAt: row.revokedAt ? row.revokedAt.getTime() : null,
    revokeReason: row.revokeReason,
    cachedAt: Date.now(),
  });
}

function invalidateSessionCache(sessionId: string) {
  sessionCache.delete(sessionId);
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  const ua = req.get("user-agent");
  const fwd = req.get("x-forwarded-for");
  const ip =
    (fwd ? fwd.split(",")[0]?.trim() : null) ||
    req.socket.remoteAddress ||
    null;
  return {
    userAgent: ua ? ua.slice(0, 240) : null,
    ip: ip ? ip.slice(0, 64) : null,
  };
}

function newRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function clearAuthCookies(res: Response) {
  const opts = clearCookieOptions();
  res.clearCookie(ACCESS_COOKIE_NAME, opts);
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
  res.clearCookie(LEGACY_COOKIE_NAME, opts);
}

function setAuthCookies(
  res: Response,
  accessJwt: string,
  refreshRaw: string
) {
  res.cookie(ACCESS_COOKIE_NAME, accessJwt, accessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions());
  // Drop legacy single cookie if present
  res.clearCookie(LEGACY_COOKIE_NAME, clearCookieOptions());
}

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: import("@prisma/client").Role;
  tokenVersion?: number;
};

function issuePair(user: SessionUser, sessionId: string, res: Response) {
  const refreshRaw = newRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshRaw);
  const accessJwt = signAccessToken(user, sessionId);
  setAuthCookies(res, accessJwt, refreshRaw);
  return { refreshRaw, refreshTokenHash, accessJwt };
}

const MAX_MULTI_SESSIONS = 5;

/** Create a new session and revoke every other session for this user (single login). */
export async function createExclusiveSession(
  user: SessionUser,
  req: Request,
  res: Response
) {
  return createUserSession(user, req, res, { exclusive: true });
}

/**
 * Create a login session.
 * - exclusive: revoke all other sessions (students / default)
 * - multi: keep up to MAX_MULTI_SESSIONS (staff/admin devices)
 */
export async function createUserSession(
  user: SessionUser,
  req: Request,
  res: Response,
  opts?: { exclusive?: boolean }
) {
  const exclusive = opts?.exclusive !== false;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  const meta = clientMeta(req);

  if (exclusive) {
    await prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: {
        revokedAt: now,
        revokeReason: "REPLACED",
        refreshTokenHash: null,
        refreshExpiresAt: null,
      },
    });
  } else {
    const open = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { lastSeenAt: "asc" },
      select: { id: true },
    });
    const overflow = open.length + 1 - MAX_MULTI_SESSIONS;
    if (overflow > 0) {
      const toRevoke = open.slice(0, overflow);
      for (const s of toRevoke) {
        await revokeSession(s.id, "SESSION_LIMIT");
      }
    }
  }

  const refreshRaw = newRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshRaw);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      lastSeenAt: now,
      expiresAt,
      refreshTokenHash,
      refreshExpiresAt: expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  });

  cacheSession(session);
  setAuthCookies(res, signAccessToken(user, session.id), refreshRaw);
  return session;
}

export async function listUserSessions(userId: string, currentSessionId?: string) {
  const rows = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      userAgent: true,
      ip: true,
    },
  });
  return rows.map((s) => ({
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    userAgent: s.userAgent,
    ip: s.ip,
    current: currentSessionId ? s.id === currentSessionId : false,
  }));
}

export async function revokeSession(
  sessionId: string | undefined,
  reason: string
) {
  if (!sessionId) return;
  invalidateSessionCache(sessionId);
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokeReason: reason,
      refreshTokenHash: null,
      refreshExpiresAt: null,
    },
  });
}

/** Logout helper when access JWT is already expired — revoke via refresh cookie. */
export async function revokeSessionFromRefreshCookie(
  req: Request,
  reason: string
) {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!raw || typeof raw !== "string") return;
  const hash = hashRefreshToken(raw);
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: hash },
    select: { id: true },
  });
  if (session) await revokeSession(session.id, reason);
}

export async function revokeAllUserSessions(userId: string, reason: string) {
  const open = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  for (const s of open) invalidateSessionCache(s.id);
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokeReason: reason,
      refreshTokenHash: null,
      refreshExpiresAt: null,
    },
  });
}

export type RefreshResult =
  | { ok: true; user: JwtUser; expiresAt: Date; lastSeenAt: Date }
  | { ok: false; status: number; error: string; code: string };

/**
 * Validate refresh cookie, rotate refresh token, issue new access JWT.
 * Reuse of an old refresh token after rotation revokes the whole session family.
 */
export async function rotateRefreshSession(
  req: Request,
  res: Response
): Promise<RefreshResult> {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!raw || typeof raw !== "string") {
    return {
      ok: false,
      status: 401,
      error: "Your sign-in expired. Please sign in again.",
      code: "SESSION_EXPIRED",
    };
  }

  const hash = hashRefreshToken(raw);
  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: hash },
  });

  if (!session) {
    // Unknown / already-rotated refresh. Caller may clear cookies.
    return {
      ok: false,
      status: 401,
      error: "Your sign-in ended. Please sign in again.",
      code: "SESSION_REVOKED",
    };
  }

  if (session.revokedAt) {
    invalidateSessionCache(session.id);
    clearAuthCookies(res);
    const replaced = session.revokeReason === "REPLACED";
    return {
      ok: false,
      status: 401,
      error: replaced
        ? "You were signed out because this account was used on another device."
        : "Your sign-in ended. Please sign in again.",
      code: replaced ? "SESSION_REPLACED" : "SESSION_REVOKED",
    };
  }

  const now = Date.now();
  const refreshExp = session.refreshExpiresAt?.getTime() ?? session.expiresAt.getTime();
  if (session.expiresAt.getTime() <= now || refreshExp <= now) {
    invalidateSessionCache(session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokeReason: "EXPIRED",
        refreshTokenHash: null,
        refreshExpiresAt: null,
      },
    });
    clearAuthCookies(res);
    return {
      ok: false,
      status: 401,
      error: "Your sign-in timed out after 2 hours without activity. Please sign in again.",
      code: "SESSION_EXPIRED",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tokenVersion: true,
      isActive: true,
    },
  });

  if (!user || user.isActive === false) {
    await revokeAllUserSessions(session.userId, "ACCOUNT_DEACTIVATED");
    clearAuthCookies(res);
    return {
      ok: false,
      status: 403,
      error: "This account is inactive. Contact an administrator.",
      code: "ACCOUNT_INACTIVE",
    };
  }

  const expiresAt = new Date(now + SESSION_MS);
  const lastSeenAt = new Date(now);
  const pair = issuePair(user, session.id, res);

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      lastSeenAt,
      expiresAt,
      refreshTokenHash: pair.refreshTokenHash,
      refreshExpiresAt: expiresAt,
    },
  });
  cacheSession(updated);

  return {
    ok: true,
    user: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      sid: session.id,
      typ: "access",
    },
    expiresAt,
    lastSeenAt,
  };
}

/**
 * Validate JWT session row; sliding-extend on activity (throttled).
 * Uses a short memory cache on read-only checks to survive exam autosave storms.
 */
export async function assertActiveSession(
  req: Request,
  res: Response,
  jwtUser: JwtUser,
  opts?: { touch?: boolean }
): Promise<SessionCheckOk | SessionCheckFail> {
  if (!jwtUser.sid) {
    return {
      ok: false,
      status: 401,
      error: "Your sign-in timed out after 2 hours without activity. Please sign in again.",
      code: "SESSION_EXPIRED",
    };
  }

  const touch = opts?.touch === true;
  const now = Date.now();
  const cached = sessionCache.get(jwtUser.sid);

  if (
    !touch &&
    cached &&
    now - cached.cachedAt < SESSION_CACHE_TTL_MS &&
    cached.userId === jwtUser.sub
  ) {
    if (cached.revokedAt) {
      const replaced = cached.revokeReason === "REPLACED";
      return {
        ok: false,
        status: 401,
        error: replaced
          ? "You were signed out because this account was used on another device."
          : "Your sign-in ended. Please sign in again.",
        code: replaced ? "SESSION_REPLACED" : "SESSION_REVOKED",
      };
    }
    if (cached.expiresAt <= now) {
      invalidateSessionCache(jwtUser.sid);
      return {
        ok: false,
        status: 401,
        error: "Your sign-in timed out after 2 hours without activity. Please sign in again.",
        code: "SESSION_EXPIRED",
      };
    }
    return {
      ok: true,
      sessionId: jwtUser.sid,
      expiresAt: new Date(cached.expiresAt),
      lastSeenAt: new Date(cached.lastSeenAt),
    };
  }

  const session = await prisma.session.findUnique({ where: { id: jwtUser.sid } });

  // Netlify Functions + SQLite: /tmp DB can reset on cold start while cookies remain.
  if (!session || session.userId !== jwtUser.sub) {
    invalidateSessionCache(jwtUser.sid);
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenVersion: true,
        isActive: true,
      },
    });
    if (
      user &&
      user.isActive !== false &&
      (user.tokenVersion ?? 0) === (jwtUser.tv ?? 0)
    ) {
      const nowDate = new Date();
      const expiresAt = new Date(nowDate.getTime() + SESSION_MS);
      const meta = clientMeta(req);
      const refreshRaw = newRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshRaw);
      try {
        const healed = await prisma.session.upsert({
          where: { id: jwtUser.sid },
          create: {
            id: jwtUser.sid,
            userId: user.id,
            lastSeenAt: nowDate,
            expiresAt,
            refreshTokenHash,
            refreshExpiresAt: expiresAt,
            userAgent: meta.userAgent,
            ip: meta.ip,
          },
          update: {
            userId: user.id,
            lastSeenAt: nowDate,
            expiresAt,
            revokedAt: null,
            revokeReason: null,
            refreshTokenHash,
            refreshExpiresAt: expiresAt,
            userAgent: meta.userAgent,
            ip: meta.ip,
          },
        });
        cacheSession(healed);
        setAuthCookies(res, signAccessToken(user, healed.id), refreshRaw);
        return {
          ok: true,
          sessionId: healed.id,
          expiresAt: healed.expiresAt,
          lastSeenAt: healed.lastSeenAt,
        };
      } catch {
        /* fall through */
      }
    }
    return {
      ok: false,
      status: 401,
      error: "Your sign-in timed out after 2 hours without activity. Please sign in again.",
      code: "SESSION_EXPIRED",
    };
  }

  if (session.revokedAt) {
    cacheSession(session);
    const replaced = session.revokeReason === "REPLACED";
    return {
      ok: false,
      status: 401,
      error: replaced
        ? "You were signed out because this account was used on another device."
        : "Your sign-in ended. Please sign in again.",
      code: replaced ? "SESSION_REPLACED" : "SESSION_REVOKED",
    };
  }

  if (session.expiresAt.getTime() <= now) {
    invalidateSessionCache(session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokeReason: "EXPIRED",
        refreshTokenHash: null,
        refreshExpiresAt: null,
      },
    });
    return {
      ok: false,
      status: 401,
      error: "Your sign-in timed out after 2 hours without activity. Please sign in again.",
      code: "SESSION_EXPIRED",
    };
  }

  const shouldExtend =
    touch && now - session.lastSeenAt.getTime() >= TOUCH_THROTTLE_MS;

  if (shouldExtend) {
    const expiresAt = new Date(now + SESSION_MS);
    const lastSeenAt = new Date(now);
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenVersion: true,
        isActive: true,
      },
    });
    if (!user || user.isActive === false) {
      await revokeAllUserSessions(jwtUser.sub, "ACCOUNT_DEACTIVATED");
      return {
        ok: false,
        status: 403,
        error: "This account is inactive. Contact an administrator.",
        code: "SESSION_REVOKED",
      };
    }

    const pair = issuePair(user, session.id, res);
    const updated = await prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt,
        expiresAt,
        refreshTokenHash: pair.refreshTokenHash,
        refreshExpiresAt: expiresAt,
      },
    });
    cacheSession(updated);
    return { ok: true, sessionId: session.id, expiresAt, lastSeenAt };
  }

  cacheSession(session);
  return {
    ok: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
  };
}
