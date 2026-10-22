/**
 * IDOR / BOLA checks for student attempts (API).
 *   npx tsx server/attemptAccess.check.ts
 */
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const PASSWORD = "changeme123";
const EMAIL_DOMAIN = "gppharmacy.edu";

async function login(email: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(`Login failed ${email}: ${body.error ?? res.status}`);
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookie = raw.map((c) => c.split(";")[0]!).filter(Boolean).join("; ");
  if (!cookie.includes("placement_at=") && !cookie.includes("placement_token=")) {
    throw new Error(`No auth cookie for ${email}`);
  }
  return cookie;
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

async function ensureOpenAttempt(userId: string, program: "DPHARM" | "BPHARM") {
  const existing = await prisma.testAttempt.findFirst({
    where: { userId, submittedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;

  const test = await prisma.test.findFirst({
    where: {
      isPublished: true,
      program,
      level: 1,
      ...(program === "DPHARM" ? {} : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!test) throw new Error(`No published ${program} test for IDOR fixture`);

  return prisma.testAttempt.create({
    data: { userId, testId: test.id },
  });
}

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const aEmail = `student.dpharm.y1.a.01@${EMAIL_DOMAIN}`;
  const bEmail = `student.dpharm.y1.b.01@${EMAIL_DOMAIN}`;
  const cookieA = await login(aEmail);
  const cookieB = await login(bEmail);

  const userA = await prisma.user.findUnique({ where: { email: aEmail } });
  const userB = await prisma.user.findUnique({ where: { email: bEmail } });
  if (!userA || !userB) throw new Error("Seed students missing");

  const attemptA = await ensureOpenAttempt(userA.id, "DPHARM");
  // Prefer a test aimed at Sec B so cohort check is realistic for B
  let attemptB = await prisma.testAttempt.findFirst({
    where: { userId: userB.id, submittedAt: null },
  });
  if (!attemptB) {
    const testB = await prisma.test.findFirst({
      where: {
        isPublished: true,
        program: "DPHARM",
        level: 1,
        section: "B",
      },
    });
    if (!testB) throw new Error("No D.Pharm Y1 Sec B test");
    attemptB = await prisma.testAttempt.create({
      data: { userId: userB.id, testId: testB.id },
    });
  }

  // Align attempt A to Sec A test for cohort gate
  const testA = await prisma.test.findFirst({
    where: { isPublished: true, program: "DPHARM", level: 1, section: "A" },
  });
  if (testA && attemptA.testId !== testA.id) {
    await prisma.testAttempt.update({
      where: { id: attemptA.id },
      data: { testId: testA.id },
    });
    attemptA.testId = testA.id;
  }

  check("setup.distinct_attempts", attemptA.id !== attemptB.id);

  const patchCross = await api(
    `/api/student/attempts/${attemptA.id}/answers`,
    cookieB,
    { method: "PATCH", body: JSON.stringify({ answers: { fakeQ: "fakeO" } }) }
  );
  check(
    "idor.answers.cross_student",
    patchCross.status === 404,
    `status ${patchCross.status} code=${String(patchCross.data.code ?? "")}`
  );

  const proctorCross = await api(
    `/api/student/attempts/${attemptA.id}/proctor`,
    cookieB,
    { method: "POST", body: JSON.stringify({ event: "TAB_SWITCH" }) }
  );
  check("idor.proctor.cross_student", proctorCross.status === 404, `status ${proctorCross.status}`);

  const submitCross = await api(
    `/api/student/attempts/${attemptA.id}/submit`,
    cookieB,
    { method: "POST", body: JSON.stringify({ answers: {} }) }
  );
  check("idor.submit.cross_student", submitCross.status === 404, `status ${submitCross.status}`);

  const resultCross = await api(`/api/student/attempts/${attemptA.id}/result`, cookieB);
  check("idor.result.cross_student", resultCross.status === 404, `status ${resultCross.status}`);

  const patchOwn = await api(
    `/api/student/attempts/${attemptA.id}/answers`,
    cookieA,
    { method: "PATCH", body: JSON.stringify({ answers: {} }) }
  );
  check("owner.answers.own", patchOwn.status !== 404, `status ${patchOwn.status}`);

  // Wrong section cohort: Sec B student writing to Sec A attempt they somehow own shouldn't happen,
  // but Sec B cookie against Sec A attempt of A is already covered. Extra: A cannot use B's attempt.
  const reverse = await api(
    `/api/student/attempts/${attemptB.id}/answers`,
    cookieA,
    { method: "PATCH", body: JSON.stringify({ answers: { x: "y" } }) }
  );
  check("idor.answers.reverse", reverse.status === 404, `status ${reverse.status}`);

  const bpharmStudent = await prisma.user.findFirst({
    where: { email: { startsWith: "student.bpharm." }, role: Role.STUDENT },
  });
  const bpharmAttempt = bpharmStudent
    ? await prisma.testAttempt.findFirst({
        where: { userId: bpharmStudent.id, submittedAt: { not: null } },
      })
    : null;
  if (bpharmAttempt) {
    const staffCookie = await login(`staff@${EMAIL_DOMAIN}`);
    const staffReview = await api(
      `/api/staff/tests/${bpharmAttempt.testId}/attempts/${bpharmAttempt.id}`,
      staffCookie
    );
    check(
      "idor.staff.other_degree_attempt",
      staffReview.status === 403 || staffReview.status === 404,
      `status ${staffReview.status}`
    );
  } else {
    check("idor.staff.other_degree_attempt", true, "skipped (no submitted B.Pharm attempt)");
  }

  // Cross-wire staff URL: valid staff test + foreign attempt id
  const staffCookie = await login(`staff.dpharm.y1.a.1@${EMAIL_DOMAIN}`);
  const dpharmTest = await prisma.test.findFirst({
    where: { program: "DPHARM", level: 1, section: "A", isPublished: true },
  });
  if (dpharmTest && bpharmAttempt) {
    const crossWire = await api(
      `/api/staff/tests/${dpharmTest.id}/attempts/${bpharmAttempt.id}`,
      staffCookie
    );
    check(
      "idor.staff.cross_wire_test_attempt",
      crossWire.status === 404,
      `status ${crossWire.status}`
    );
  } else {
    check("idor.staff.cross_wire_test_attempt", true, "skipped");
  }

  if (failed) {
    console.error(`\n${failed} IDOR check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll IDOR checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
