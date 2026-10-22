import type { Request } from "express";
import { prisma } from "./prisma";
import type { AuditActionName } from "./auditActions";

export { AuditAction } from "./auditActions";

const SENSITIVE_META_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "pendingToken",
  "totpSecret",
  "secret",
  "authorization",
  "cookie",
]);

export function clientIp(req?: Request | null): string | null {
  if (!req) return null;
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0]!.trim().slice(0, 128);
  }
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).slice(0, 128);
  return (req.socket?.remoteAddress ?? req.ip ?? null)?.toString().slice(0, 128) ?? null;
}

export function clientUserAgent(req?: Request | null): string | null {
  if (!req) return null;
  const ua = req.headers["user-agent"];
  if (!ua) return null;
  return String(ua).slice(0, 512);
}

function scrubMeta(
  meta?: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_META_KEYS.has(k.toLowerCase()) || SENSITIVE_META_KEYS.has(k)) {
      continue;
    }
    if (typeof v === "string" && /password|token|secret/i.test(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export type LogAuditParams = {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: AuditActionName | string;
  /** Preferred name for the target entity type. */
  targetType?: string | null;
  targetId?: string | null;
  /** @deprecated use targetType */
  entityType?: string | null;
  /** @deprecated use targetId */
  entityId?: string | null;
  success?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
  /** When provided, IP + User-Agent are taken from the request. */
  req?: Request | null;
};

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const cleaned = scrubMeta(params.meta ?? null);
    const ip = params.ip ?? clientIp(params.req);
    const userAgent = params.userAgent ?? clientUserAgent(params.req);
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId?.trim() || "anonymous",
        actorEmail: (params.actorEmail ?? "unknown").slice(0, 320),
        actorRole: params.actorRole ? String(params.actorRole).slice(0, 40) : null,
        action: String(params.action).slice(0, 80),
        entityType: (params.targetType ?? params.entityType ?? null)?.slice(0, 80) ?? null,
        entityId: (params.targetId ?? params.entityId ?? null)?.slice(0, 80) ?? null,
        success: params.success !== false,
        ip,
        userAgent,
        meta: cleaned ? JSON.stringify(cleaned) : null,
      },
    });
  } catch (e) {
    console.error("[audit]", params.action, e);
  }
}

/** Shape returned by GET /api/admin/audit-logs */
export function serializeAuditLog(l: {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  meta: string | null;
  createdAt: Date;
}) {
  let meta: unknown = null;
  if (l.meta) {
    try {
      meta = JSON.parse(l.meta) as unknown;
    } catch {
      meta = l.meta;
    }
  }
  return {
    id: l.id,
    timestamp: l.createdAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
    userId: l.actorId,
    actorId: l.actorId,
    actorEmail: l.actorEmail,
    role: l.actorRole,
    actorRole: l.actorRole,
    action: l.action,
    targetType: l.entityType,
    targetId: l.entityId,
    entityType: l.entityType,
    entityId: l.entityId,
    success: l.success,
    ip: l.ip,
    userAgent: l.userAgent,
    meta,
  };
}
