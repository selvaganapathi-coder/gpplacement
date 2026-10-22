/**
 * Aggregated ops snapshot for Admin home dashboard.
 */
import { Role, type PrismaClient } from "@prisma/client";
import { formatAcademic, parseScopeKey } from "./academic";
import {
  isPharmacyMasterBankName,
  PHARMACY_MASTER_BANK_NAME,
} from "../shared/pharmacyBankTaxonomy";
import { loadReadinessAttempts } from "./loadReadinessAttempts";
import { buildPlacementReadiness } from "./placementReadiness";
import { testWindowStatus } from "./testSchedule";

export type HomeOpsTestCard = {
  id: string;
  title: string;
  status: "live" | "upcoming" | "closed" | "draft";
  availableFrom: string | null;
  availableUntil: string | null;
  resultsPublished: boolean;
  pendingSubmissions: number;
  href: string;
};

export type HomeOpsClassGap = {
  key: string;
  label: string;
  studentCount: number;
  inactiveCount: number;
};

function scopeCoversClass(
  scopes: {
    program: string;
    levelType: string | null;
    level: number | null;
    section: string | null;
    scopeKey: string;
  }[],
  cls: {
    program: string;
    levelType: string | null;
    level: number | null;
    section: string | null;
  }
): boolean {
  for (const s of scopes) {
    let program = s.program;
    let levelType = s.levelType;
    let level = s.level;
    let section = s.section;
    try {
      const parsed = parseScopeKey(s.scopeKey);
      program = parsed.program;
      levelType = parsed.levelType;
      level = parsed.level;
      section = parsed.section ?? s.section;
    } catch {
      /* keep row fields */
    }
    if (program !== cls.program) continue;
    if (levelType == null && level == null) return true; // whole program
    if (levelType !== cls.levelType || level !== cls.level) continue;
    if (!section) return true; // whole year
    if (section === cls.section) return true;
  }
  return false;
}

export async function buildAdminHomeOps(prisma: PrismaClient) {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const tests = await prisma.test.findMany({
    select: {
      id: true,
      title: true,
      isPublished: true,
      availableFrom: true,
      availableUntil: true,
      resultsPublished: true,
      createdAt: true,
      _count: {
        select: {
          attempts: {
            where: { submittedAt: { not: null } },
          },
        },
      },
      attempts: {
        where: { submittedAt: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Pending submissions per unpublished-results test
  const pendingGrouped = await prisma.testAttempt.groupBy({
    by: ["testId"],
    where: {
      submittedAt: { not: null },
      test: { isPublished: true, resultsPublished: false },
    },
    _count: { _all: true },
  });
  const pendingByTest = new Map(
    pendingGrouped.map((g) => [
      g.testId,
      typeof g._count === "object" ? g._count._all ?? 0 : 0,
    ])
  );

  const live: HomeOpsTestCard[] = [];
  const upcoming: HomeOpsTestCard[] = [];
  const overduePublish: HomeOpsTestCard[] = [];
  const drafts: HomeOpsTestCard[] = [];

  for (const t of tests) {
    const window = testWindowStatus(t, now);
    const pending = pendingByTest.get(t.id) ?? 0;
    const card: HomeOpsTestCard = {
      id: t.id,
      title: t.title,
      status:
        window === "open"
          ? "live"
          : window === "upcoming"
            ? "upcoming"
            : window === "closed"
              ? "closed"
              : "draft",
      availableFrom: t.availableFrom?.toISOString() ?? null,
      availableUntil: t.availableUntil?.toISOString() ?? null,
      resultsPublished: t.resultsPublished,
      pendingSubmissions: pending,
      href:
        window === "draft"
          ? `/dashboard/admin/tests/${t.id}/edit`
          : `/dashboard/admin/tests/${t.id}/results`,
    };

    if (window === "draft") {
      drafts.push(card);
      continue;
    }
    if (window === "open") live.push(card);
    if (
      window === "upcoming" &&
      t.availableFrom &&
      t.availableFrom <= in48h
    ) {
      upcoming.push(card);
    }
    // Overdue: window closed OR has pending submissions and results not published
    if (
      !t.resultsPublished &&
      (window === "closed" || (pending > 0 && window !== "upcoming"))
    ) {
      overduePublish.push({
        ...card,
        href: `/dashboard/admin/tests/${t.id}/results`,
      });
    }
  }

  // Class gaps
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, program: { not: null } },
    select: {
      program: true,
      levelType: true,
      level: true,
      section: true,
      isActive: true,
    },
  });
  const scopes = await prisma.staffBranchScope.findMany({
    select: {
      program: true,
      levelType: true,
      level: true,
      section: true,
      scopeKey: true,
    },
  });

  type CohortAgg = {
    program: NonNullable<(typeof students)[0]["program"]>;
    levelType: (typeof students)[0]["levelType"];
    level: (typeof students)[0]["level"];
    section: string | null;
    studentCount: number;
    inactiveCount: number;
  };
  const cohortMap = new Map<string, CohortAgg>();
  for (const s of students) {
    if (!s.program) continue;
    const section = s.section ?? null;
    const key = `${s.program}|${s.levelType ?? ""}|${s.level ?? ""}|${section ?? ""}`;
    const row =
      cohortMap.get(key) ??
      ({
        program: s.program,
        levelType: s.levelType,
        level: s.level,
        section,
        studentCount: 0,
        inactiveCount: 0,
      } satisfies CohortAgg);
    row.studentCount += 1;
    if (!s.isActive) row.inactiveCount += 1;
    cohortMap.set(key, row);
  }

  const unlinkedClasses: HomeOpsClassGap[] = [];
  const inactiveInActiveClasses: HomeOpsClassGap[] = [];
  for (const [key, c] of cohortMap) {
    const label = formatAcademic(c.program, c.levelType, c.level, c.section);
    const covered = scopeCoversClass(scopes, c);
    if (!covered && c.studentCount - c.inactiveCount > 0) {
      unlinkedClasses.push({
        key,
        label,
        studentCount: c.studentCount,
        inactiveCount: c.inactiveCount,
      });
    }
    if (c.inactiveCount > 0 && c.studentCount - c.inactiveCount > 0) {
      inactiveInActiveClasses.push({
        key,
        label,
        studentCount: c.studentCount,
        inactiveCount: c.inactiveCount,
      });
    }
  }
  unlinkedClasses.sort((a, b) => b.studentCount - a.studentCount);
  inactiveInActiveClasses.sort((a, b) => b.inactiveCount - a.inactiveCount);

  // Bank pulse
  const categories = await prisma.questionCategory.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { bankQuestions: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  const banksForMaster = await prisma.questionBank.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { questions: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const masterBank =
    banksForMaster.find((b) => isPharmacyMasterBankName(b.name)) ??
    banksForMaster.find((b) => b.name === PHARMACY_MASTER_BANK_NAME) ??
    null;
  const emptyCategories = categories
    .filter((c) => c._count.bankQuestions === 0 && !!c.parentId)
    .slice(0, 12)
    .map((c) => ({ id: c.id, name: c.name }));

  // Readiness campus avg
  let readinessOverall: number | null = null;
  try {
    const inputs = await loadReadinessAttempts(prisma, {});
    const payload = buildPlacementReadiness(inputs);
    readinessOverall = payload.readiness.overall;
  } catch {
    readinessOverall = null;
  }

  const recentAudit = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      actorEmail: true,
      action: true,
      entityType: true,
      createdAt: true,
    },
  });

  const announcements = await prisma.campusAnnouncement.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    schedule: {
      live: live.slice(0, 8),
      upcoming: upcoming.slice(0, 8),
      overduePublish: overduePublish.slice(0, 8),
      drafts: drafts.slice(0, 8),
    },
    classGaps: {
      unlinked: unlinkedClasses.slice(0, 10),
      inactiveInActive: inactiveInActiveClasses.slice(0, 10),
    },
    bank: {
      master: masterBank
        ? {
            id: masterBank.id,
            name: masterBank.name,
            questionCount: masterBank._count.questions,
          }
        : null,
      emptyCategories,
      categoryCount: categories.length,
    },
    readinessOverall,
    recentAudit: recentAudit.map((l) => ({
      id: l.id,
      actorEmail: l.actorEmail,
      action: l.action,
      entityType: l.entityType,
      createdAt: l.createdAt.toISOString(),
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
    })),
  };
}

export type AdminHomeOps = Awaited<ReturnType<typeof buildAdminHomeOps>>;
