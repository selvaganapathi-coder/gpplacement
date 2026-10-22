import { Router } from "express";
import type express from "express";
import { Prisma, Program, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { requireAuth, requireRole, type JwtUser } from "./middleware/auth";
import { ensureResultsAutoReleased } from "./autoReleaseResults";
import { studentWhereResultsVisibleToStaff } from "./staffVisibility";
import {
  loadStaffForPermission,
  staffManagedPrograms,
  testWhereVisibleToStaff,
} from "./testPermissions";
import { PROGRAM_CONFIG, parseProgram } from "./academic";
import { testTargetsStudent, prismaTestAudienceForStudent } from "./testTargeting";
import { testWindowStatus } from "./testSchedule";

export type NotificationType =
  | "submissions"
  | "awaiting_release"
  | "new_assessment"
  | "exam_starting"
  | "assessment_reminder"
  | "result_published"
  | "placement_announcement";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  count: number;
};

const MAX_ITEMS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const START_REMINDER_MS = 15 * 60 * 1000;

function minutesUntil(from: Date, now: Date): number {
  return Math.max(1, Math.ceil((from.getTime() - now.getTime()) / 60_000));
}

function departmentLabel(program: Program | null | undefined): string {
  if (!program) return "All departments";
  return PROGRAM_CONFIG[program]?.label.split(" (")[0] ?? program;
}

function startReminderBody(program: Program | null | undefined, from: Date, now: Date): string {
  const mins = minutesUntil(from, now);
  const when = mins === 1 ? "1 minute" : `${mins} minutes`;
  return `${departmentLabel(program)} · starts in ${when}.`;
}

function groupCount(g: { _count: true | { _all: number } }): number {
  if (typeof g._count === "object" && g._count && "_all" in g._count) {
    return g._count._all ?? 0;
  }
  return 0;
}

function isPlacementAnnouncement(title: string, assessmentType: string): boolean {
  if (/placement|mock test|campus drive|hiring|recruit/i.test(title)) return true;
  return assessmentType === "MOCK_INTERVIEW" || assessmentType === "RESUME";
}

async function buildStaffNotifications(staffId: string): Promise<NotificationItem[]> {
  const staff = await loadStaffForPermission(prisma, staffId);
  if (!staff) return [];

  const programs = await staffManagedPrograms(prisma, staff);
  const testWhere = testWhereVisibleToStaff(programs);
  const studentWhere = await studentWhereResultsVisibleToStaff(prisma, staffId);

  const pendingFilter: Prisma.TestAttemptWhereInput = {
    submittedAt: { not: null },
    test: { AND: [testWhere, { resultsPublished: false, isPublished: true }] },
    user: studentWhere,
  };

  const now = new Date();
  const in15m = new Date(now.getTime() + START_REMINDER_MS);
  const [pendingSubmissions, grouped, startingSoon] = await Promise.all([
    prisma.testAttempt.count({ where: pendingFilter }),
    prisma.testAttempt.groupBy({
      by: ["testId"],
      where: pendingFilter,
      _count: { _all: true },
      orderBy: { _count: { testId: "desc" } },
      take: MAX_ITEMS,
    }),
    prisma.test.findMany({
      where: {
        isPublished: true,
        availableFrom: { gt: now, lte: in15m },
        AND: [testWhere],
      },
      select: { id: true, title: true, program: true, availableFrom: true },
      orderBy: { availableFrom: "asc" },
    }),
  ]);

  const testIds = grouped.map((g) => g.testId);
  const tests =
    testIds.length === 0
      ? []
      : await prisma.test.findMany({
          where: { id: { in: testIds } },
          select: { id: true, title: true },
        });
  const titleById = new Map(tests.map((t) => [t.id, t.title]));

  const items: NotificationItem[] = [];

  for (const test of startingSoon) {
    if (!test.availableFrom) continue;
    items.push({
      id: `staff-start-${test.id}`,
      type: "exam_starting",
      title: test.title,
      body: startReminderBody(test.program, test.availableFrom, now),
      href: `/dashboard/staff/tests/${test.id}/results`,
      count: 1,
    });
  }

  if (pendingSubmissions > 0) {
    items.push({
      id: "staff-submissions-summary",
      type: "submissions",
      title: "Pending submissions",
      body: `${pendingSubmissions} submitted attempt${pendingSubmissions === 1 ? "" : "s"} awaiting review or release`,
      href: "/dashboard/staff/results",
      count: pendingSubmissions,
    });
  }

  for (const g of grouped) {
    if (items.length >= MAX_ITEMS) break;
    const count = groupCount(g);
    if (count <= 0) continue;
    const title = titleById.get(g.testId) ?? "Test";
    items.push({
      id: `staff-awaiting-${g.testId}`,
      type: "awaiting_release",
      title,
      body: `${count} submission${count === 1 ? "" : "s"} — results still hidden`,
      href: `/dashboard/staff/tests/${g.testId}/results`,
      count,
    });
  }

  return items.slice(0, MAX_ITEMS);
}

async function buildAdminNotifications(program: Program | null): Promise<NotificationItem[]> {
  const audience: Prisma.TestWhereInput = program ? { program } : {};
  const pendingFilter: Prisma.TestAttemptWhereInput = {
    submittedAt: { not: null },
    test: { isPublished: true, resultsPublished: false, ...audience },
  };

  const now = new Date();
  const in15m = new Date(now.getTime() + START_REMINDER_MS);
  const [pendingSubmissions, testCount, grouped, startingSoon] = await Promise.all([
    prisma.testAttempt.count({ where: pendingFilter }),
    prisma.test.count({
      where: {
        isPublished: true,
        resultsPublished: false,
        attempts: { some: { submittedAt: { not: null } } },
        ...audience,
      },
    }),
    prisma.testAttempt.groupBy({
      by: ["testId"],
      where: pendingFilter,
      _count: { _all: true },
      orderBy: { _count: { testId: "desc" } },
      take: MAX_ITEMS,
    }),
    prisma.test.findMany({
      where: {
        isPublished: true,
        availableFrom: { gt: now, lte: in15m },
        ...audience,
      },
      select: { id: true, title: true, program: true, availableFrom: true },
      orderBy: { availableFrom: "asc" },
    }),
  ]);

  const testIds = grouped.map((g) => g.testId);
  const tests =
    testIds.length === 0
      ? []
      : await prisma.test.findMany({
          where: { id: { in: testIds } },
          select: { id: true, title: true },
        });
  const titleById = new Map(tests.map((t) => [t.id, t.title]));

  const items: NotificationItem[] = [];

  for (const test of startingSoon) {
    if (!test.availableFrom) continue;
    items.push({
      id: `admin-start-${test.id}`,
      type: "exam_starting",
      title: test.title,
      body: startReminderBody(test.program, test.availableFrom, now),
      href: `/dashboard/admin/tests/${test.id}/results`,
      count: 1,
    });
  }

  if (pendingSubmissions > 0) {
    items.push({
      id: "admin-awaiting-summary",
      type: "submissions",
      title: "Results awaiting release",
      body: `${testCount} test${testCount === 1 ? "" : "s"} · ${pendingSubmissions} submission${pendingSubmissions === 1 ? "" : "s"} campus-wide`,
      href: "/dashboard/admin/results",
      count: pendingSubmissions,
    });
  }

  for (const g of grouped) {
    if (items.length >= MAX_ITEMS) break;
    const count = groupCount(g);
    if (count <= 0) continue;
    const title = titleById.get(g.testId) ?? "Test";
    items.push({
      id: `admin-awaiting-${g.testId}`,
      type: "awaiting_release",
      title,
      body: `${count} submission${count === 1 ? "" : "s"} — results still hidden`,
      href: `/dashboard/admin/tests/${g.testId}/results`,
      count,
    });
  }

  return items.slice(0, MAX_ITEMS);
}

async function buildStudentNotifications(userId: string): Promise<NotificationItem[]> {
  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      program: true,
      levelType: true,
      level: true,
      section: true,
    },
  });
  if (!student) return [];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const in15m = new Date(now.getTime() + START_REMINDER_MS);
  const in48h = new Date(now.getTime() + 2 * DAY_MS);

  const testSelect = {
    id: true,
    title: true,
    assessmentType: true,
    program: true,
    levelType: true,
    level: true,
    availableFrom: true,
    availableUntil: true,
    resultsPublished: true,
    resultsPublishedAt: true,
    createdAt: true,
    isPublished: true,
    attempts: {
      where: { userId },
      orderBy: { startedAt: "desc" as const },
      take: 1,
      select: { id: true, submittedAt: true, startedAt: true },
    },
  };

  const [recentTests, startingTests, campusAnnouncements] = await Promise.all([
    prisma.test.findMany({
      where: {
        isPublished: true,
        AND: [prismaTestAudienceForStudent(student)],
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: testSelect,
    }),
    prisma.test.findMany({
      where: {
        isPublished: true,
        availableFrom: { gt: now, lte: in15m },
        AND: [prismaTestAudienceForStudent(student)],
      },
      select: testSelect,
    }),
    prisma.campusAnnouncement.findMany({
      where: {
        active: true,
        createdAt: { gte: weekAgo },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const tests = [...startingTests, ...recentTests].filter(
    (test, index, all) => all.findIndex((row) => row.id === test.id) === index
  );

  const items: NotificationItem[] = [];

  for (const a of campusAnnouncements) {
    items.push({
      id: `campus-announce-${a.id}`,
      type: "placement_announcement",
      title: a.title,
      body: a.body,
      href: "/dashboard/student",
      count: 1,
    });
  }

  for (const t of tests) {
    const window = testWindowStatus(t, now);
    const latest = t.attempts[0] ?? null;
    const openedAt = t.availableFrom ?? t.createdAt;
    const startsInMs = t.availableFrom ? t.availableFrom.getTime() - now.getTime() : null;
    const startingSoon =
      startsInMs != null &&
      startsInMs > 0 &&
      startsInMs <= START_REMINDER_MS &&
      !latest?.submittedAt;
    const forThisStudent = testTargetsStudent(t, student);
    if (!forThisStudent) continue;

    if (startingSoon && t.availableFrom) {
      items.push({
        id: `student-start-${t.id}`,
        type: "exam_starting",
        title: t.title,
        body: startReminderBody(t.program, t.availableFrom, now),
        href: "/dashboard/student/tests",
        count: 1,
      });
    }

    // Placement / mock announcements
    if (
      isPlacementAnnouncement(t.title, t.assessmentType) &&
      openedAt >= weekAgo &&
      (window === "open" || window === "upcoming")
    ) {
      items.push({
        id: `student-announce-${t.id}`,
        type: "placement_announcement",
        title: "Placement announcement",
        body: t.title,
        href: `/dashboard/student/test/${t.id}`,
        count: 1,
      });
    }

    // Assigned when staff or admin publish a test for this student.
    if (
      t.createdAt >= weekAgo &&
      (window === "open" || window === "upcoming") &&
      !latest?.submittedAt &&
      !startingSoon
    ) {
      const when = t.availableFrom
        ? `Starts ${t.availableFrom.toLocaleString()}.`
        : "It is open now.";
      items.push({
        id: `student-new-${t.id}`,
        type: "new_assessment",
        title: t.title,
        body: `New exam assigned to you. ${when}`,
        href:
          window === "open"
            ? `/dashboard/student/test/${t.id}`
            : "/dashboard/student/tests",
        count: 1,
      });
    }

    // Reminder — open, ending soon, not submitted
    if (
      window === "open" &&
      t.availableUntil &&
      t.availableUntil <= in48h &&
      t.availableUntil > now &&
      !latest?.submittedAt
    ) {
      items.push({
        id: `student-remind-${t.id}`,
        type: "assessment_reminder",
        title: "Assessment reminder",
        body: `${t.title} closes ${t.availableUntil.toLocaleString()}`,
        href: `/dashboard/student/test/${t.id}`,
        count: 1,
      });
    }

    // Result published
    if (
      t.resultsPublished &&
      latest?.submittedAt &&
      t.resultsPublishedAt &&
      t.resultsPublishedAt >= weekAgo
    ) {
      items.push({
        id: `student-result-${latest.id}`,
        type: "result_published",
        title: "Result published",
        body: t.title,
        href: `/dashboard/student/attempts/${latest.id}/result`,
        count: 1,
      });
    }
  }

  // Prefer variety: announcements → reminders → results → new
  const order: NotificationType[] = [
    "exam_starting",
    "new_assessment",
    "assessment_reminder",
    "result_published",
    "placement_announcement",
  ];
  items.sort(
    (a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.title.localeCompare(b.title)
  );

  // Dedupe by id
  const seen = new Set<string>();
  const unique: NotificationItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= MAX_ITEMS) break;
  }
  return unique;
}

export const notificationsRouter = Router();

notificationsRouter.get(
  "/api/staff/notifications",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    try {
      await ensureResultsAutoReleased();
      const auth = (req as express.Request & { auth: JwtUser }).auth;
      const items = await buildStaffNotifications(auth.sub);
      res.json({ items });
    } catch (e) {
      console.error("staff notifications", e);
      res.status(500).json({ error: "Failed to load notifications." });
    }
  }
);

notificationsRouter.get(
  "/api/admin/notifications",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    try {
      await ensureResultsAutoReleased();
      const raw = String(req.query.program ?? "");
      const program = raw ? parseProgram(raw) : null;
      const items = await buildAdminNotifications(program);
      res.json({ items });
    } catch (e) {
      console.error("admin notifications", e);
      res.status(500).json({ error: "Failed to load notifications." });
    }
  }
);

notificationsRouter.get(
  "/api/student/notifications",
  requireAuth,
  requireRole(Role.STUDENT),
  async (req, res) => {
    try {
      await ensureResultsAutoReleased();
      const auth = (req as express.Request & { auth: JwtUser }).auth;
      const items = await buildStudentNotifications(auth.sub);
      res.json({ items });
    } catch (e) {
      console.error("student notifications", e);
      res.status(500).json({ error: "Failed to load notifications." });
    }
  }
);
