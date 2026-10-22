import type { ErrorRequestHandler, Request, Response } from "express";
import { IS_PRODUCTION } from "./config";

/** Safe client-facing message; never forward raw DB / stack text in production. */
export function publicErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!IS_PRODUCTION && err instanceof Error && err.message) {
    return err.message;
  }
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status?: number }).status);
    if (status >= 400 && status < 500) {
      const msg = (err as { message?: string }).message;
      if (msg && !looksLikeDbLeak(msg)) return msg;
    }
  }
  return fallback;
}

function looksLikeDbLeak(msg: string): boolean {
  return /prisma|sqlite|postgres|sqlstate|constraint|ECONN|ENOENT|at Object\.|stack/i.test(
    msg
  );
}

export function sendSafeError(
  res: Response,
  err: unknown,
  fallbackStatus = 500,
  fallbackMessage = "Something went wrong. Please try again."
): void {
  const statusRaw =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: number }).status)
      : NaN;
  const status =
    Number.isFinite(statusRaw) && statusRaw >= 400 && statusRaw < 600
      ? statusRaw
      : fallbackStatus;
  const body: { error: string; code?: string } = {
    error: publicErrorMessage(err, fallbackMessage),
  };
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length < 64) body.code = code;
  }
  if (!res.headersSent) {
    res.status(status).json(body);
  }
}

export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (IS_PRODUCTION) {
    console.error("[api]", err instanceof Error ? err.message : err);
  } else {
    console.error(err);
  }
  sendSafeError(res, err);
};

/** Express 404 for unmatched /api routes (mount after routers). */
export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
