import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { readJwt, type JwtUser } from "../jwt";
import { prisma } from "../prisma";
import {
  expandAllowedRoles,
  roleHasPermission,
  type PermissionCode,
} from "../permissions";
import { assertActiveSession, clearAuthCookies } from "../sessions";

export type { JwtUser };
export { signToken, readJwt } from "../jwt";

const PASSWORD_CHANGE_EXEMPT = new Set([
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/session/touch",
  "/api/auth/refresh",
]);

type UserGate = {
  mustChangePassword: boolean;
  tokenVersion: number;
  lockedUntil: number | null;
  isActive: boolean;
  cachedAt: number;
};

const USER_GATE_TTL_MS = 30_000;
const userGateCache = new Map<string, UserGate>();

async function loadUserGate(userId: string): Promise<UserGate | null> {
  const hit = userGateCache.get(userId);
  if (hit && Date.now() - hit.cachedAt < USER_GATE_TTL_MS) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mustChangePassword: true,
      tokenVersion: true,
      lockedUntil: true,
      isActive: true,
    },
  });
  if (!user) return null;

  const gate: UserGate = {
    mustChangePassword: user.mustChangePassword,
    tokenVersion: user.tokenVersion ?? 0,
    lockedUntil: user.lockedUntil ? user.lockedUntil.getTime() : null,
    isActive: user.isActive !== false,
    cachedAt: Date.now(),
  };
  userGateCache.set(userId, gate);
  return gate;
}

export function invalidateUserGateCache(userId: string) {
  userGateCache.delete(userId);
}

/** Access JWT from HttpOnly cookie (refresh is handled by POST /api/auth/refresh). */
export async function resolveAuthUser(
  req: Request,
  _res: Response
): Promise<JwtUser | null> {
  return readJwt(req);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const j = readJwt(req);
    if (!j) {
      return res.status(401).json({
        error: "Access token expired or missing. Refresh or sign in again.",
        code: "TOKEN_EXPIRED",
      });
    }
    (req as Request & { auth: JwtUser }).auth = j;
    const skipPasswordGate = PASSWORD_CHANGE_EXEMPT.has(req.path);

    const user = await loadUserGate(j.sub);
    if (!user) {
      clearAuthCookies(res);
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
    if (!user.isActive) {
      clearAuthCookies(res);
      res.status(403).json({
        error: "This account is inactive. Contact an administrator.",
        code: "ACCOUNT_INACTIVE",
      });
      return;
    }
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      res.status(403).json({
        error: "This account is temporarily locked. Try again later or ask an administrator.",
        code: "ACCOUNT_LOCKED",
      });
      return;
    }
    if (user.tokenVersion !== j.tv) {
      userGateCache.delete(j.sub);
      clearAuthCookies(res);
      res.status(401).json({
        error: "Session expired. Please sign in again.",
        code: "SESSION_REVOKED",
      });
      return;
    }

    const touchSession =
      req.path === "/api/auth/me" ||
      req.path === "/api/auth/session/touch" ||
      (req.method === "GET" && !req.path.includes("/answers"));

    const session = await assertActiveSession(req, res, j, { touch: touchSession });
    if (!session.ok) {
      clearAuthCookies(res);
      res.status(session.status).json({ error: session.error, code: session.code });
      return;
    }
    (req as Request & { sessionExpiresAt?: Date }).sessionExpiresAt = session.expiresAt;

    if (!skipPasswordGate && user.mustChangePassword) {
      res.status(403).json({
        error: "You must change your password before continuing.",
        code: "MUST_CHANGE_PASSWORD",
      });
      return;
    }
    next();
  })();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as Request & { auth?: JwtUser }).auth;
    if (!auth) return res.status(403).json({ error: "Forbidden" });
    const expanded = expandAllowedRoles(roles);
    if (!expanded.has(auth.role))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

/**
 * Explicit permission gate (use after requireAuth).
 * Prefer this over role-only checks for new / sensitive routes.
 */
export function requirePermission(...codes: PermissionCode[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const auth = (req as Request & { auth?: JwtUser }).auth;
      if (!auth) {
        res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
        return;
      }
      for (const code of codes) {
        const ok = await roleHasPermission(auth.role, code);
        if (!ok) {
          res.status(403).json({
            error: "You do not have permission for this action.",
            code: "FORBIDDEN_PERMISSION",
            permission: code,
          });
          return;
        }
      }
      next();
    })();
  };
}
