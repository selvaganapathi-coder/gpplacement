/**
 * Campus exam-day capacity (~1000 concurrent users).
 * All knobs come from .env — use GET /api/capacity to check overall readiness.
 */

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

const databaseUrl = process.env.DATABASE_URL ?? "";

/** Expected simultaneous signed-in examinees (campus exam wave). */
export const EXPECTED_CONCURRENT_USERS = envInt(
  "EXPECTED_CONCURRENT_USERS",
  1000,
  1,
  50_000
);

/** How many API processes sit behind the load balancer. */
export const API_REPLICAS = envInt("API_REPLICAS", 1, 1, 64);

/** Unique label for this process (docker replica name, hostname, etc.). */
export const INSTANCE_ID =
  process.env.INSTANCE_ID?.trim() ||
  process.env.HOSTNAME?.trim() ||
  `pid-${process.pid}`;

/**
 * Trust X-Forwarded-* from the load balancer (Render / Nginx).
 * Set TRUST_PROXY=true|1|hop-count. False disables (local single process).
 */
export function resolveTrustProxy(): boolean | number {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (!raw || raw === "false" || raw === "0" || raw === "off") {
    return process.env.NODE_ENV === "production";
  }
  if (raw === "true" || raw === "1" || raw === "on" || raw === "yes") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export const TRUST_PROXY = resolveTrustProxy();

/** Prefer Postgres connection pool size when using postgresql:// */
export const DB_POOL_SIZE = envInt("DB_POOL_SIZE", 20, 2, 100);

export const isSqlite = /^file:/i.test(databaseUrl);
export const isPostgres = /^postgres(ql)?:/i.test(databaseUrl);

/** Rate-limit ceilings (per user or IP — see rateLimit.ts). Tunable for exam day. */
export const RATE_LIMITS = {
  globalPerMin: envInt("RATE_LIMIT_GLOBAL_PER_MIN", 600, 60, 5000),
  loginPer15Min: envInt("RATE_LIMIT_LOGIN_PER_15MIN", 120, 10, 1000),
  submitPerMin: envInt("RATE_LIMIT_SUBMIT_PER_MIN", 30, 5, 200),
  autosavePerMin: envInt("RATE_LIMIT_AUTOSAVE_PER_MIN", 90, 20, 300),
  proctorPerMin: envInt("RATE_LIMIT_PROCTOR_PER_MIN", 40, 10, 200),
  sensitivePerMin: envInt("RATE_LIMIT_SENSITIVE_PER_MIN", 30, 5, 200),
  passwordResetPer15Min: envInt("RATE_LIMIT_PASSWORD_RESET_PER_15MIN", 10, 3, 100),
  changePasswordPer15Min: envInt("RATE_LIMIT_CHANGE_PASSWORD_PER_15MIN", 20, 5, 100),
} as const;

export type CapacityStatus = "ok" | "warn" | "fail";

export type CapacityCheck = {
  id: string;
  status: CapacityStatus;
  message: string;
};

export type CapacityReport = {
  ok: boolean;
  status: CapacityStatus;
  time: string;
  instanceId: string;
  expectedConcurrentUsers: number;
  apiReplicas: number;
  database: {
    engine: "sqlite" | "postgresql" | "unknown";
    poolSize: number | null;
  };
  trustProxy: boolean | number;
  rateLimits: typeof RATE_LIMITS;
  checks: CapacityCheck[];
  guidance: string[];
};

function worst(a: CapacityStatus, b: CapacityStatus): CapacityStatus {
  const rank = { ok: 0, warn: 1, fail: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Overall readiness for the configured concurrent-user target.
 * Call from /api/capacity and boot logs.
 */
export function buildCapacityReport(opts?: {
  dbReachable?: boolean;
}): CapacityReport {
  const checks: CapacityCheck[] = [];
  const guidance: string[] = [];

  if (opts?.dbReachable === false) {
    checks.push({
      id: "database_reachable",
      status: "fail",
      message: "Database did not respond to SELECT 1.",
    });
  } else {
    checks.push({
      id: "database_reachable",
      status: "ok",
      message: "Database responded.",
    });
  }

  if (isSqlite && EXPECTED_CONCURRENT_USERS >= 200) {
    checks.push({
      id: "database_engine",
      status: "fail",
      message: `SQLite cannot serve ~${EXPECTED_CONCURRENT_USERS} concurrent examinees. Use PostgreSQL.`,
    });
    guidance.push(
      "Set DATABASE_URL to postgresql://… and provider = postgresql in prisma/schema.prisma (see docs/CAPACITY.md)."
    );
  } else if (isSqlite) {
    checks.push({
      id: "database_engine",
      status: "warn",
      message: "SQLite is fine for local demos only — not for campus exam day.",
    });
    guidance.push("Switch to PostgreSQL before a live exam with hundreds of students.");
  } else if (isPostgres) {
    checks.push({
      id: "database_engine",
      status: "ok",
      message: "PostgreSQL configured (required for load / multi-instance).",
    });
  } else {
    checks.push({
      id: "database_engine",
      status: "warn",
      message: "DATABASE_URL engine not recognized — expected postgresql:// or file:.",
    });
  }

  if (EXPECTED_CONCURRENT_USERS >= 500 && API_REPLICAS < 2) {
    checks.push({
      id: "api_replicas",
      status: "warn",
      message: `API_REPLICAS=${API_REPLICAS}. For ~${EXPECTED_CONCURRENT_USERS} users, run 2+ API instances behind Nginx/Render.`,
    });
    guidance.push(
      "Raise API_REPLICAS and start docker compose (api + nginx) or scale the Render web service."
    );
  } else {
    checks.push({
      id: "api_replicas",
      status: "ok",
      message: `API_REPLICAS=${API_REPLICAS} for target ${EXPECTED_CONCURRENT_USERS} users.`,
    });
  }

  if (isPostgres && DB_POOL_SIZE * API_REPLICAS > 80) {
    checks.push({
      id: "db_pool",
      status: "warn",
      message: `Pool ${DB_POOL_SIZE} × ${API_REPLICAS} replicas = ${DB_POOL_SIZE * API_REPLICAS} connections — confirm Postgres max_connections.`,
    });
    guidance.push(
      "Lower DB_POOL_SIZE or raise Postgres max_connections so total pools fit."
    );
  } else if (isPostgres) {
    checks.push({
      id: "db_pool",
      status: "ok",
      message: `DB_POOL_SIZE=${DB_POOL_SIZE} per API process.`,
    });
  }

  const jwt = process.env.JWT_SECRET?.trim() ?? "";
  if (process.env.NODE_ENV === "production") {
    if (!jwt || jwt.length < 32 || /dev-|change/i.test(jwt)) {
      checks.push({
        id: "jwt_secret",
        status: "fail",
        message: "JWT_SECRET must be a strong 32+ character secret in production.",
      });
    } else {
      checks.push({
        id: "jwt_secret",
        status: "ok",
        message: "JWT_SECRET looks set for production.",
      });
    }
    if (!process.env.CLIENT_ORIGIN?.trim()) {
      checks.push({
        id: "client_origin",
        status: "fail",
        message: "CLIENT_ORIGIN must be set in production for CORS/cookies.",
      });
    } else {
      checks.push({
        id: "client_origin",
        status: "ok",
        message: "CLIENT_ORIGIN is set.",
      });
    }
  } else {
    checks.push({
      id: "jwt_secret",
      status: "ok",
      message: "Non-production — JWT_SECRET soft-checked.",
    });
  }

  if (TRUST_PROXY === false && API_REPLICAS > 1) {
    checks.push({
      id: "trust_proxy",
      status: "warn",
      message: "TRUST_PROXY is off but API_REPLICAS > 1 — set TRUST_PROXY=1 behind Nginx/Render.",
    });
  } else {
    checks.push({
      id: "trust_proxy",
      status: "ok",
      message: `TRUST_PROXY=${String(TRUST_PROXY)}.`,
    });
  }

  if (RATE_LIMITS.autosavePerMin < 60 && EXPECTED_CONCURRENT_USERS >= 500) {
    checks.push({
      id: "rate_limits",
      status: "warn",
      message: "RATE_LIMIT_AUTOSAVE_PER_MIN is low for exam autosave under load.",
    });
  } else {
    checks.push({
      id: "rate_limits",
      status: "ok",
      message: "Rate limits loaded from .env (per-user keys — shared lab IP safe).",
    });
  }

  let status: CapacityStatus = "ok";
  for (const c of checks) status = worst(status, c.status);

  return {
    ok: status !== "fail",
    status,
    time: new Date().toISOString(),
    instanceId: INSTANCE_ID,
    expectedConcurrentUsers: EXPECTED_CONCURRENT_USERS,
    apiReplicas: API_REPLICAS,
    database: {
      engine: isSqlite ? "sqlite" : isPostgres ? "postgresql" : "unknown",
      poolSize: isPostgres ? DB_POOL_SIZE : null,
    },
    trustProxy: TRUST_PROXY,
    rateLimits: RATE_LIMITS,
    checks,
    guidance,
  };
}

/** One-line boot summary for operators. */
export function logCapacitySummary(report: CapacityReport): void {
  const flag =
    report.status === "ok" ? "OK" : report.status === "warn" ? "WARN" : "FAIL";
  console.log(
    `[capacity] ${flag} target=${report.expectedConcurrentUsers} users · db=${report.database.engine} · replicas=${report.apiReplicas} · instance=${report.instanceId}`
  );
  for (const c of report.checks) {
    if (c.status === "ok") continue;
    console.log(`[capacity]   ${c.status.toUpperCase()} ${c.id}: ${c.message}`);
  }
  for (const g of report.guidance.slice(0, 3)) {
    console.log(`[capacity]   → ${g}`);
  }
}

/** Append Prisma pool params to a postgres URL when missing. */
export function withPrismaPoolParams(url: string): string {
  if (!/^postgres(ql)?:/i.test(url)) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", String(DB_POOL_SIZE));
    }
    if (!u.searchParams.has("pool_timeout")) {
      u.searchParams.set("pool_timeout", "20");
    }
    return u.toString();
  } catch {
    return url;
  }
}
