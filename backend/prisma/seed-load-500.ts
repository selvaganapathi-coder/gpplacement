/**
 * Load seed: ~500 users + cohort tests + sample attempts, then verify API workflows.
 *
 * Usage:
 *   npx tsx prisma/seed-load-500.ts
 *   npx tsx prisma/seed-load-500.ts --verify-only
 *
 * Env:
 *   TARGET_USERS=500   (default 500)
 *   API_BASE=http://localhost:3001
 */
import {
  AttemptStatus,
  LevelType,
  PrismaClient,
  Program,
  Role,
} from "@prisma/client";
import {
  buildScopeKey,
  listCohortPresets,
  suggestName,
  type CohortPreset,
} from "../shared/academic";
import {
  assertDemoSeedAllowed,
  DEFAULT_SEED_PASSWORD,
  hashPassword,
  seedForcePasswordChange,
} from "../server/password";

const prisma = new PrismaClient();

const PASSWORD = DEFAULT_SEED_PASSWORD;
const FORCE_PASSWORD_CHANGE = seedForcePasswordChange();
const EMAIL_DOMAIN = "gppharmacy.edu";
const TARGET_USERS = Math.max(50, Number(process.env.TARGET_USERS ?? 500) || 500);
const API_BASE = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const VERIFY_ONLY = process.argv.includes("--verify-only");
const QUESTIONS_PER_TEST = 6;

function cohortEmail(
  role: "STUDENT" | "STAFF",
  cohort: CohortPreset,
  slot: number
): string {
  const sec = String(cohort.section ?? "A").toLowerCase();
  if (role === "STAFF") {
    return `staff.${cohort.slug}.y${cohort.level}.${sec}.${slot}@${EMAIL_DOMAIN}`;
  }
  return `student.${cohort.slug}.y${cohort.level}.${sec}.${String(slot).padStart(2, "0")}@${EMAIL_DOMAIN}`;
}

async function login(email: string, password: string): Promise<{
  cookie: string;
  user: { id: string; role: string; email: string; name: string };
}> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    user?: { id: string; role: string; email: string; name: string };
  };
  if (!res.ok || !body.user) {
    throw new Error(`Login failed for ${email}: ${body.error ?? res.status}`);
  }
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookie = raw
    .map((c) => c.split(";")[0]!)
    .filter(Boolean)
    .join("; ");
  if (!cookie) throw new Error(`Login OK but no cookie for ${email}`);
  return { cookie, user: body.user };
}

async function apiJson<T>(
  path: string,
  cookie: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

function buildQuestions(cohort: CohortPreset, set: number) {
  return Array.from({ length: QUESTIONS_PER_TEST }, (_, i) => {
    const n = i + 1;
    const correct = (n + set) % 4;
    return {
      order: n,
      prompt: `[Load] ${cohort.label} Q${n}: Choose the best practice option.`,
      topic: "Load seed",
      difficulty: n <= 2 ? "EASY" : n <= 4 ? "MEDIUM" : "HARD",
      marks: 1,
      options: {
        create: [
          { text: "Option A", isCorrect: correct === 0 },
          { text: "Option B", isCorrect: correct === 1 },
          { text: "Option C", isCorrect: correct === 2 },
          { text: "Option D", isCorrect: correct === 3 },
        ],
      },
    };
  });
}

async function ensureAdmin(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: `admin@${EMAIL_DOMAIN}` },
    update: {
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
      isActive: true,
      role: Role.ADMIN,
      name: "G.P. Pharmacy Admin",
    },
    create: {
      email: `admin@${EMAIL_DOMAIN}`,
      name: "G.P. Pharmacy Admin",
      role: Role.ADMIN,
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
    },
  });
}

async function ensureDemoStaff(passwordHash: string) {
  const staff = await prisma.user.upsert({
    where: { email: `staff@${EMAIL_DOMAIN}` },
    update: {
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
      isActive: true,
      role: Role.STAFF,
      program: Program.DPHARM,
      name: "Demo Staff (D.Pharm all years)",
    },
    create: {
      email: `staff@${EMAIL_DOMAIN}`,
      name: "Demo Staff (D.Pharm all years)",
      role: Role.STAFF,
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
      program: Program.DPHARM,
    },
  });
  await prisma.staffBranchScope.deleteMany({ where: { staffId: staff.id } });
  await prisma.staffBranchScope.create({
    data: {
      staffId: staff.id,
      program: Program.DPHARM,
      levelType: null,
      level: null,
      section: null,
      scopeKey: buildScopeKey(Program.DPHARM),
    },
  });
  return staff;
}

async function ensureDemoStudent(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: `student@${EMAIL_DOMAIN}` },
    update: {
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
      isActive: true,
      role: Role.STUDENT,
      program: Program.BPHARM,
      levelType: LevelType.YEAR,
      level: 2,
      section: "A",
      rollNo: "01",
      name: "Demo Student (B.Pharm Year 2 Sec A)",
    },
    create: {
      email: `student@${EMAIL_DOMAIN}`,
      name: "Demo Student (B.Pharm Year 2 Sec A)",
      role: Role.STUDENT,
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
      program: Program.BPHARM,
      levelType: LevelType.YEAR,
      level: 2,
      section: "A",
      rollNo: "01",
    },
  });
}

async function seedUsersAndTests() {
  assertDemoSeedAllowed("db:load-500");
  const passwordHash = await hashPassword(PASSWORD);
  const admin = await ensureAdmin(passwordHash);
  const demoStaff = await ensureDemoStaff(passwordHash);
  await ensureDemoStudent(passwordHash);

  const cohorts = listCohortPresets();
  const current = await prisma.user.count();
  const need = Math.max(0, TARGET_USERS - current);
  const studentsPerClass = Math.max(
    5,
    Math.ceil((need + cohorts.length) / Math.max(1, cohorts.length))
  );

  console.log(`Target users: ${TARGET_USERS}`);
  console.log(`Current users: ${current}`);
  console.log(`Cohorts: ${cohorts.length}`);
  console.log(`Students per class (upsert): ${studentsPerClass}`);

  let staffCreated = 0;
  let studentsUpserted = 0;
  let testsCreated = 0;
  let testsUpdated = 0;
  let attemptsCreated = 0;

  for (const cohort of cohorts) {
    const sk = buildScopeKey(
      cohort.program,
      cohort.levelType,
      cohort.level,
      cohort.section
    );

    const staffEmail = cohortEmail("STAFF", cohort, 1);
    const staff = await prisma.user.upsert({
      where: { email: staffEmail },
      update: {
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
        isActive: true,
        program: cohort.program as Program,
        levelType: LevelType.YEAR,
        level: cohort.level,
        section: cohort.section,
        name: `${suggestName("STAFF", cohort, 1)} Sec ${cohort.section}`,
      },
      create: {
        email: staffEmail,
        name: `${suggestName("STAFF", cohort, 1)} Sec ${cohort.section}`,
        role: Role.STAFF,
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
        program: cohort.program as Program,
        levelType: LevelType.YEAR,
        level: cohort.level,
        section: cohort.section,
      },
    });
    staffCreated++;
    await prisma.staffBranchScope.upsert({
      where: { staffId_scopeKey: { staffId: staff.id, scopeKey: sk } },
      update: {
        program: cohort.program as Program,
        levelType: LevelType.YEAR,
        level: cohort.level,
        section: cohort.section,
      },
      create: {
        staffId: staff.id,
        program: cohort.program as Program,
        levelType: LevelType.YEAR,
        level: cohort.level,
        section: cohort.section,
        scopeKey: sk,
      },
    });

    const studentIds: string[] = [];
    for (let n = 1; n <= studentsPerClass; n++) {
      const email = cohortEmail("STUDENT", cohort, n);
      const student = await prisma.user.upsert({
        where: { email },
        update: {
          passwordHash,
          mustChangePassword: FORCE_PASSWORD_CHANGE,
          isActive: true,
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
          rollNo: String(n).padStart(2, "0"),
          name: `${suggestName("STUDENT", cohort, n)} Sec ${cohort.section}`,
        },
        create: {
          email,
          name: `${suggestName("STUDENT", cohort, n)} Sec ${cohort.section}`,
          role: Role.STUDENT,
          passwordHash,
          mustChangePassword: FORCE_PASSWORD_CHANGE,
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
          rollNo: String(n).padStart(2, "0"),
        },
      });
      studentIds.push(student.id);
      studentsUpserted++;
      await prisma.staffAssignment.upsert({
        where: {
          staffId_studentId: { staffId: staff.id, studentId: student.id },
        },
        update: {},
        create: { staffId: staff.id, studentId: student.id },
      });
    }

    const title = `Load · ${cohort.label} Aptitude`;
    let test = await prisma.test.findFirst({ where: { title } });
    if (!test) {
      test = await prisma.test.create({
        data: {
          title,
          description: `Load-seed paper for ${cohort.label}`,
          durationMin: 20,
          isPublished: true,
          resultsPublished: false,
          availableFrom: new Date(Date.now() - 60 * 60 * 1000),
          availableUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
          assessmentType: "APTITUDE",
          maxScore: QUESTIONS_PER_TEST,
          passPercentage: 50,
          createdById: staff.id,
          questions: { create: buildQuestions(cohort, 1) },
        },
      });
      testsCreated++;
    } else {
      await prisma.test.update({
        where: { id: test.id },
        data: {
          isPublished: true,
          availableFrom: new Date(Date.now() - 60 * 60 * 1000),
          availableUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      testsUpdated++;
    }

    // Sample attempts for first 8 students in each class
    const pick = studentIds.slice(0, 8);
    for (let i = 0; i < pick.length; i++) {
      const userId = pick[i]!;
      const existing = await prisma.testAttempt.findFirst({
        where: { testId: test.id, userId },
        select: { id: true },
      });
      if (existing) continue;
      const pct = 40 + ((i * 7) % 55);
      const score = Math.round((pct / 100) * QUESTIONS_PER_TEST);
      await prisma.testAttempt.create({
        data: {
          testId: test.id,
          userId,
          status: AttemptStatus.SUBMITTED,
          startedAt: new Date(Date.now() - 40 * 60 * 1000),
          submittedAt: new Date(Date.now() - 20 * 60 * 1000),
          endedAt: new Date(Date.now() - 20 * 60 * 1000),
          score,
          percentage: pct,
        },
      });
      attemptsCreated++;
    }

    // Publish results on every other cohort for leaderboard coverage
    if (cohort.level % 2 === 0) {
      await prisma.test.update({
        where: { id: test.id },
        data: {
          resultsPublished: true,
          resultsPublishedAt: new Date(),
        },
      });
    }
  }

  // Campus-wide published demo
  const demoTitle = "Demo Aptitude — All Students";
  const demo = await prisma.test.findFirst({ where: { title: demoTitle } });
  if (!demo) {
    await prisma.test.create({
      data: {
        title: demoTitle,
        description: "Live demo for every student",
        durationMin: 15,
        isPublished: true,
        resultsPublished: true,
        resultsPublishedAt: new Date(),
        createdById: demoStaff.id,
        maxScore: 3,
        questions: {
          create: [
            {
              order: 1,
              prompt: "2 + 2 = ?",
              options: {
                create: [
                  { text: "3", isCorrect: false },
                  { text: "4", isCorrect: true },
                  { text: "5", isCorrect: false },
                  { text: "22", isCorrect: false },
                ],
              },
            },
            {
              order: 2,
              prompt: "Normal saline is ~0.9% NaCl.",
              options: {
                create: [
                  { text: "True", isCorrect: true },
                  { text: "False", isCorrect: false },
                  { text: "Only cold chain", isCorrect: false },
                  { text: "Only Schedule H", isCorrect: false },
                ],
              },
            },
            {
              order: 3,
              prompt: "FIFO means First In, First Out.",
              options: {
                create: [
                  { text: "True", isCorrect: true },
                  { text: "False", isCorrect: false },
                  { text: "Last In First Out", isCorrect: false },
                  { text: "Fill In Form Online", isCorrect: false },
                ],
              },
            },
          ],
        },
      },
    });
    testsCreated++;
  }

  const totals = {
    users: await prisma.user.count(),
    students: await prisma.user.count({ where: { role: Role.STUDENT } }),
    staff: await prisma.user.count({ where: { role: Role.STAFF } }),
    tests: await prisma.test.count(),
    published: await prisma.test.count({ where: { isPublished: true } }),
    attempts: await prisma.testAttempt.count(),
  };

  console.log("\nSeed summary");
  console.log(`  Admin: ${admin.email}`);
  console.log(`  Staff upserts (cohort): ${staffCreated}`);
  console.log(`  Student upserts: ${studentsUpserted}`);
  console.log(`  Tests created: ${testsCreated}, refreshed: ${testsUpdated}`);
  console.log(`  Attempts created: ${attemptsCreated}`);
  console.log(
    `  Totals → users ${totals.users}, students ${totals.students}, staff ${totals.staff}, tests ${totals.tests} (${totals.published} published), attempts ${totals.attempts}`
  );
  console.log(`  Password: ${PASSWORD}`);
  return totals;
}

type Check = { name: string; ok: boolean; detail: string };

async function verifyWorkflows(): Promise<Check[]> {
  const checks: Check[] = [];
  const push = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  };

  try {
    const admin = await login(`admin@${EMAIL_DOMAIN}`, PASSWORD);
    push("admin.login", true, admin.user.email);

    const me = await apiJson<{ user?: { role: string } }>("/api/auth/me", admin.cookie);
    push("admin.me", me.ok && me.data.user?.role === "ADMIN", `status ${me.status}`);

    const adminTests = await apiJson<{ tests?: unknown[] }>(
      "/api/admin/tests",
      admin.cookie
    );
    const testCount = Array.isArray(adminTests.data.tests)
      ? adminTests.data.tests.length
      : 0;
    push(
      "admin.tests.list",
      adminTests.ok && testCount > 0,
      `${testCount} tests`
    );

    const people = await apiJson<{ users?: unknown[]; students?: unknown[] }>(
      "/api/admin/users?role=STUDENT&limit=20",
      admin.cookie
    );
    // endpoint shape may vary — try roster too
    const roster = await apiJson<{ students?: unknown[]; totals?: { students: number } }>(
      "/api/admin/students-roster",
      admin.cookie
    );
    const studentN =
      roster.data.totals?.students ??
      roster.data.students?.length ??
      people.data.users?.length ??
      0;
    push(
      "admin.students.roster",
      (roster.ok || people.ok) && studentN > 0,
      `${studentN} students visible`
    );

    const lb = await apiJson<{ rows?: unknown[]; groups?: unknown[] }>(
      "/api/admin/leaderboard?scope=overall",
      admin.cookie
    );
    const ranked =
      (lb.data.rows?.length ?? 0) +
      (lb.data.groups?.reduce(
        (n, g) => n + ((g as { rows?: unknown[] }).rows?.length ?? 0),
        0
      ) ?? 0);
    push("admin.leaderboard", lb.ok, `${ranked} ranked rows`);

    const staff = await login(`staff@${EMAIL_DOMAIN}`, PASSWORD);
    push("staff.login", true, staff.user.email);

    const staffTests = await apiJson<{ tests?: unknown[] }>(
      "/api/staff/tests",
      staff.cookie
    );
    push(
      "staff.tests.list",
      staffTests.ok,
      `status ${staffTests.status}, ${Array.isArray(staffTests.data.tests) ? staffTests.data.tests.length : "?"} tests`
    );

    const staffStudents = await apiJson<{ students?: unknown[] }>(
      "/api/staff/students",
      staff.cookie
    );
    push(
      "staff.students",
      staffStudents.ok,
      `${staffStudents.data.students?.length ?? 0} students`
    );

    const student = await login(`student@${EMAIL_DOMAIN}`, PASSWORD);
    push("student.login", true, student.user.email);

    const openTests = await apiJson<{ tests?: { id: string; title: string }[] }>(
      "/api/student/tests",
      student.cookie
    );
    push(
      "student.tests.open",
      openTests.ok && (openTests.data.tests?.length ?? 0) > 0,
      `${openTests.data.tests?.length ?? 0} open`
    );

    const attempts = await apiJson<{ attempts?: unknown[] }>(
      "/api/student/attempts",
      student.cookie
    );
    push("student.attempts", attempts.ok, `status ${attempts.status}`);

    const studentLb = await apiJson<{ rows?: unknown[]; groups?: unknown[] }>(
      "/api/student/leaderboard?scope=year",
      student.cookie
    );
    push("student.leaderboard", studentLb.ok, `status ${studentLb.status}`);

    // --- Audience chain: degree → year → section ---
    const dpharmY1A = await login(
      `student.dpharm.y1.a.01@${EMAIL_DOMAIN}`,
      PASSWORD
    );
    const dpharmY1B = await login(
      `student.dpharm.y1.b.01@${EMAIL_DOMAIN}`,
      PASSWORD
    );
    const dpharmY2A = await login(
      `student.dpharm.y2.a.01@${EMAIL_DOMAIN}`,
      PASSWORD
    );
    const bpharmY1A = await login(
      `student.bpharm.y1.a.01@${EMAIL_DOMAIN}`,
      PASSWORD
    );

    const listFor = async (cookie: string) => {
      const res = await apiJson<{
        tests?: { id: string; title: string; program?: string | null; level?: number | null; section?: string | null }[];
      }>("/api/student/tests", cookie);
      return res;
    };

    const dA = await listFor(dpharmY1A.cookie);
    const dB = await listFor(dpharmY1B.cookie);
    const d2 = await listFor(dpharmY2A.cookie);
    const bA = await listFor(bpharmY1A.cookie);

    const titleY1A = "Load · D.Pharm · 1st Year · Sec A Aptitude";
    const hasTitle = (
      res: { ok: boolean; data: { tests?: { title: string }[] } },
      title: string
    ) => !!res.data.tests?.some((t) => t.title === title);

    push(
      "audience.dpharm.y1a.sees_own",
      dA.ok && hasTitle(dA, titleY1A),
      dA.ok ? `sees own class paper: ${hasTitle(dA, titleY1A)}` : `status ${dA.status}`
    );
    push(
      "audience.dpharm.y1b.blocked_other_section",
      dB.ok && !hasTitle(dB, titleY1A),
      dB.ok
        ? `Sec B must not see Sec A paper: ${!hasTitle(dB, titleY1A)}`
        : `status ${dB.status}`
    );
    push(
      "audience.dpharm.y2a.blocked_other_year",
      d2.ok && !hasTitle(d2, titleY1A),
      d2.ok
        ? `Y2 must not see Y1 paper: ${!hasTitle(d2, titleY1A)}`
        : `status ${d2.status}`
    );
    push(
      "audience.bpharm.blocked_other_degree",
      bA.ok && !hasTitle(bA, titleY1A),
      bA.ok
        ? `B.Pharm must not see D.Pharm paper: ${!hasTitle(bA, titleY1A)}`
        : `status ${bA.status}`
    );

    // Take endpoint: matching class OK path / others 404
    const ownId = dA.data.tests?.find((t) => t.title === titleY1A)?.id;
    if (ownId) {
      const takeOk = await apiJson<Record<string, unknown>>(
        `/api/student/tests/${ownId}/session`,
        dpharmY1A.cookie
      );
      push(
        "audience.take.own_class",
        takeOk.ok || takeOk.status === 403,
        `status ${takeOk.status} (200/403 window ok; not 404)`
      );
      const takeBlocked = await apiJson<{ error?: string }>(
        `/api/student/tests/${ownId}/session`,
        bpharmY1A.cookie
      );
      push(
        "audience.take.other_degree_blocked",
        takeBlocked.status === 404,
        `status ${takeBlocked.status}: ${takeBlocked.data.error ?? ""}`
      );
      const takeSecBlocked = await apiJson<{ error?: string }>(
        `/api/student/tests/${ownId}/session`,
        dpharmY1B.cookie
      );
      push(
        "audience.take.other_section_blocked",
        takeSecBlocked.status === 404,
        `status ${takeSecBlocked.status}: ${takeSecBlocked.data.error ?? ""}`
      );
    } else {
      push("audience.take.own_class", false, "D.Pharm Y1 Sec A load test missing — re-run seed");
    }

    // Degree-wide publish: create + publish D.Pharm-only, B.Pharm cannot see
    const degreeTitle = `Audience check · D.Pharm all years ${Date.now()}`;
    const create = await apiJson<{ ok?: boolean; error?: string }>(
      "/api/admin/tests",
      admin.cookie,
      {
        method: "POST",
        body: JSON.stringify({
          title: degreeTitle,
          durationMin: 15,
          assessmentType: "APTITUDE",
          maxScore: 2,
          program: "DPHARM",
          levelType: null,
          level: null,
          section: null,
          questions: [
            {
              prompt: "Audience check Q1",
              marks: 1,
              options: ["A", "B", "C", "D"],
              correctIndex: 0,
            },
            {
              prompt: "Audience check Q2",
              marks: 1,
              options: ["A", "B", "C", "D"],
              correctIndex: 0,
            },
          ],
        }),
      }
    );
    let createdId: string | null = null;
    if (create.ok) {
      const listed = await apiJson<{ tests?: { id: string; title: string }[] }>(
        "/api/admin/tests",
        admin.cookie
      );
      createdId =
        listed.data.tests?.find((t) => t.title === degreeTitle)?.id ?? null;
    }
    if (create.ok && createdId) {
      const until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const pub = await apiJson<{ ok?: boolean }>(
        `/api/staff/tests/${createdId}/publish`,
        admin.cookie,
        {
          method: "POST",
          body: JSON.stringify({
            isPublished: true,
            availableFrom: null,
            availableUntil: until,
            program: "DPHARM",
            levelType: null,
            level: null,
            section: null,
          }),
        }
      );
      push("audience.publish.degree_wide", pub.ok, `status ${pub.status}`);

      const dAfter = await listFor(dpharmY1A.cookie);
      const bAfter = await listFor(bpharmY1A.cookie);
      const dSees = !!dAfter.data.tests?.some((t) => t.id === createdId);
      const bSees = !!bAfter.data.tests?.some((t) => t.id === createdId);
      push(
        "audience.degree_wide.dpharm_sees",
        dAfter.ok && dSees,
        `D.Pharm sees published degree paper: ${dSees}`
      );
      push(
        "audience.degree_wide.bpharm_blocked",
        bAfter.ok && !bSees,
        `B.Pharm blocked from D.Pharm degree paper: ${!bSees}`
      );

      // Unpublish so it does not clutter open lists
      await apiJson(`/api/staff/tests/${createdId}/publish`, admin.cookie, {
        method: "POST",
        body: JSON.stringify({ isPublished: false }),
      }).catch(() => undefined);
    } else {
      push(
        "audience.publish.degree_wide",
        false,
        `create failed status ${create.status}: ${create.data.error ?? "no id"}`
      );
    }

    // Publish results on one admin test if any pending
    if (adminTests.ok && Array.isArray(adminTests.data.tests)) {
      const first = (adminTests.data.tests as { id: string; title?: string }[])[0];
      if (first) {
        const results = await apiJson<Record<string, unknown>>(
          `/api/admin/tests/${first.id}/results`,
          admin.cookie
        );
        push(
          "admin.test.results",
          results.ok || results.status === 404,
          `status ${results.status} for ${first.title ?? first.id}`
        );
      }
    }
  } catch (e) {
    push("workflow", false, e instanceof Error ? e.message : String(e));
  }

  return checks;
}

async function main() {
  if (!VERIFY_ONLY) {
    console.log("=== Load seed (~500 users + tests) ===\n");
    await seedUsersAndTests();
  } else {
    console.log("=== Verify only (skip seed) ===\n");
  }

  console.log("\n=== Workflow checks ===\n");
  const checks = await verifyWorkflows();
  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed.`
  );
  if (failed.length) {
    console.error("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("All workflows OK.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
