import { Router } from "express";
import { buildCapacityReport } from "../capacity";
import { prisma } from "../prisma";

export const healthRouter = Router();

/** Liveness — load balancer / Docker HEALTHCHECK. */
healthRouter.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, error: "Database unavailable" });
  }
});

/** Readiness — LB should only send traffic when DB is up and capacity is not FAIL. */
healthRouter.get("/api/ready", async (_req, res) => {
  let dbReachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbReachable = false;
  }
  const report = buildCapacityReport({ dbReachable });
  if (!dbReachable || report.status === "fail") {
    return res.status(503).json({
      ok: false,
      ready: false,
      status: report.status,
      time: report.time,
      instanceId: report.instanceId,
      checks: report.checks.filter((c) => c.status !== "ok"),
    });
  }
  return res.json({
    ok: true,
    ready: true,
    status: report.status,
    time: report.time,
    instanceId: report.instanceId,
  });
});

/**
 * Overall capacity check from .env (exam-day ~1000 users).
 * Public for ops/monitors — no secrets returned.
 */
healthRouter.get("/api/capacity", async (_req, res) => {
  let dbReachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbReachable = false;
  }
  const report = buildCapacityReport({ dbReachable });
  const statusCode = report.status === "fail" ? 503 : 200;
  res.status(statusCode).json(report);
});
