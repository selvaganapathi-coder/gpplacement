import type { Request } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import {
  ACCESS_COOKIE_NAME,
  ACCESS_TOKEN_MINUTES,
  JWT_SECRET,
  LEGACY_COOKIE_NAME,
} from "./config";

export type JwtUser = {
  sub: string;
  email: string;
  name: string;
  role: Role;
  tv: number;
  sid: string;
  typ: "access";
};

export function signAccessToken(
  u: {
    id: string;
    email: string;
    name: string;
    role: Role;
    tokenVersion?: number;
  },
  sessionId: string
) {
  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      tv: u.tokenVersion ?? 0,
      sid: sessionId,
      typ: "access",
    },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_MINUTES}m` }
  );
}

/** @deprecated alias — access tokens only */
export function signToken(
  u: {
    id: string;
    email: string;
    name: string;
    role: Role;
    tokenVersion?: number;
  },
  sessionId: string
) {
  return signAccessToken(u, sessionId);
}

function parseAccessPayload(raw: string): JwtUser | null {
  try {
    const v = jwt.verify(raw, JWT_SECRET) as jwt.JwtPayload;
    // Reject refresh-shaped or unknown tokens; allow legacy cookies without typ.
    if (v.typ != null && v.typ !== "access") return null;
    if (
      typeof v.sub !== "string" ||
      typeof v.email !== "string" ||
      typeof v.name !== "string" ||
      typeof v.sid !== "string" ||
      !Object.values(Role).includes(v.role as Role)
    )
      return null;
    const tv = typeof v.tv === "number" && Number.isFinite(v.tv) ? v.tv : 0;
    return {
      sub: v.sub,
      email: v.email,
      name: v.name,
      role: v.role as Role,
      tv,
      sid: v.sid,
      typ: "access",
    };
  } catch {
    return null;
  }
}

/** Read short-lived access JWT from HttpOnly cookie only (never Authorization header). */
export function readJwt(req: Request): JwtUser | null {
  const raw =
    (typeof req.cookies?.[ACCESS_COOKIE_NAME] === "string"
      ? req.cookies[ACCESS_COOKIE_NAME]
      : null) ||
    (typeof req.cookies?.[LEGACY_COOKIE_NAME] === "string"
      ? req.cookies[LEGACY_COOKIE_NAME]
      : null);
  if (!raw) return null;
  return parseAccessPayload(raw);
}

/** True when an access cookie is present but failed verify (usually expired). */
export function accessTokenPresentButInvalid(req: Request): boolean {
  const raw =
    (typeof req.cookies?.[ACCESS_COOKIE_NAME] === "string"
      ? req.cookies[ACCESS_COOKIE_NAME]
      : null) ||
    (typeof req.cookies?.[LEGACY_COOKIE_NAME] === "string"
      ? req.cookies[LEGACY_COOKIE_NAME]
      : null);
  if (!raw) return false;
  return parseAccessPayload(raw) == null;
}
