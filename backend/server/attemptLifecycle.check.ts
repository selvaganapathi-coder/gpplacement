/**
 * Server timer + single active attempt + no client score.
 *   npx tsx server/attemptLifecycle.check.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  computeAttemptEndsAt,
  isAttemptTimeExpired,
  openAttemptLockKey,
} from "./attemptTiming";
import { rejectClientScoringFields } from "./attemptLifecycle";

const prisma = new PrismaClient();
const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const PASSWORD = "changeme123";
const EMAIL = "student.dpharm.y1.a.01@gppharmacy.edu";

async function login(email: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  return raw.map((c) => c.split(";")[0]!).filter(Boolean).join("; ");
}

async function api(
  path: string,
  cookie: string,
  init?: RequestInit
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const started = new Date("2020-01-01T00:00:00.000Z");
  const ends = computeAttemptEndsAt(started, 30, null);
  check(
    "timer.endsAt_from_duration",
    ends.getTime() === started.getTime() + 30 * 60 * 1000
  );
  check(
    "timer.expired_after_endsAt",
    isAttemptTimeExpired(started, 30, new Date("2020-01-01T00:31:00.000Z"), ends)
  );
  check(
    "timer.not_expired_before_endsAt",
    !isAttemptTimeExpired(started, 30, new Date("2020-01-01T00:29:00.000Z"), ends)
  );
  check(
    "score.reject_client_score",
    rejectClientScoringFields({ score: 100 })?.code === "CLIENT_SCORE_FORBIDDEN"
  );
  check(
    "score.reject_passed",
    rejectClientScoringFields({ passed: true })?.code === "CLIENT_SCORE_FORBIDDEN"
  );
  check(
    "score.allow_answers_only",
    rejectClientScoringFields({ answers: { q1: "o1" } }) == null
  );

  const cookie = await login(EMAIL);
  const tests = await api("/api/student/tests", cookie);
  const testId = (tests.data.tests as { id: string }[] | undefined)?.[0]?.id;
  check("api.has_test", !!testId);
  if (!testId) throw new Error("No test");

  const s1 = await api(`/api/student/tests/${testId}/session`, cookie);
  const s2 = await api(`/api/student/tests/${testId}/session`, cookie);
  check("api.session_ok", s1.status === 200, `status ${s1.status}`);
  const a1 = (s1.data.attempt as { id?: string; endsAt?: string } | undefined)?.id;
  const a2 = (s2.data.attempt as { id?: string } | undefined)?.id;
  check("api.single_active_attempt", !!a1 && a1 === a2, `${a1} vs ${a2}`);
  check(
    "api.session_has_endsAt",
    typeof (s1.data.attempt as { endsAt?: string })?.endsAt === "string" ||
      typeof s1.data.deadlineIso === "string"
  );
  check("api.session_has_serverNow", typeof s1.data.serverNowIso === "string");

  if (a1) {
    const row = await prisma.testAttempt.findUnique({ where: { id: a1 } });
    check("db.openLock_set", row?.openLock === openAttemptLockKey(
      (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).id,
      testId
    ));
    check("db.endsAt_set", !!row?.endsAt);

    const scoreHack = await api(`/api/student/attempts/${a1}/answers`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ score: 100, answers: {} }),
    });
    check(
      "api.reject_client_score",
      scoreHack.status === 400 && scoreHack.data.code === "CLIENT_SCORE_FORBIDDEN",
      `status ${scoreHack.status}`
    );

    // Force expiry then autosave → auto-submit
    await prisma.testAttempt.update({
      where: { id: a1 },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const expired = await api(`/api/student/attempts/${a1}/answers`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ answers: { fake: "x" } }),
    });
    check(
      "api.expired_autosubmit",
      expired.status === 403 && expired.data.code === "ATTEMPT_EXPIRED",
      `status ${expired.status} code=${String(expired.data.code)}`
    );
    const after = await prisma.testAttempt.findUnique({ where: { id: a1 } });
    check("db.submitted_after_expiry", !!after?.submittedAt);
    check("db.openLock_cleared", after?.openLock == null);
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll attempt lifecycle checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
