import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import { globalErrorHandler, publicErrorMessage } from "./errors";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Role, Prisma, Program, LevelType } from "@prisma/client";
import { prisma, tuneDatabaseForConcurrency } from "./prisma";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/authRoutes";
import { skillsRouter } from "./routes/skillsRoutes";
import { notificationsRouter } from "./notifications";
import {
  autosaveLimiter,
  globalApiLimiter,
  proctorLimiter,
  sensitiveOpLimiter,
  submitLimiter,
} from "./rateLimit";
import { buildAllowedOrigins, isOriginAllowed } from "./corsOrigins";
import {
  requireAuth,
  requirePermission,
  requireRole,
  type JwtUser,
} from "./middleware/auth";
import {
  loadAttemptAnswersMap,
  mergeAnswerMaps,
  parseMarkedQuestionIds,
  saveAttemptAnswers,
  serializeMarkedQuestionIds,
} from "./attemptAnswers";
import {
  loadOwnedStudentAttempt,
  sanitizeAttemptAnswers,
} from "./attemptAccess";
import {
  autoFinalizeOpenAttempt,
  startAutoSubmitScheduler,
} from "./autoSubmitAttempts";
import { buildMcqAttemptResultSheet } from "./attemptResultSheet";
import {
  assignRanks,
  isPassingPercent,
  percentFromScore,
} from "./ranking";
import { buildAdminHomeOps } from "./adminHomeOps";
import { buildPlacementReadiness } from "./placementReadiness";
import { loadReadinessAttempts } from "./loadReadinessAttempts";
import { buildLeaderboard, type LeaderboardScope } from "./leaderboard";
import { AuditAction, logAudit, serializeAuditLog } from "./audit";
import { hashPassword, validatePasswordStrength } from "./password";
import {
  buildScopeKey,
  formatAcademic,
  formatYearLabel,
  inferRollNoFromEmail,
  nextYearAfterPromote,
  normalizeRollNo,
  parseLevelType,
  batchYearOf,
  parseProgram,
  parseSection,
  programOptions,
  validateStudentAcademic,
  type Section,
} from "./academic";
import { buildResultsCsv } from "./resultsExport";
import {
  exportDepartmentMarksReport,
  exportStudentMarksReport,
} from "./marksReports";
import { streamAdminExportPack } from "./exportPack";
import {
  buildStudentPerformance,
  buildStudentRoster,
} from "./studentRoster";
import {
  canStaffViewStudent,
  studentWhereResultsVisibleToStaff,
  studentWhereVisibleToStaff,
} from "./staffVisibility";
import {
  parseOptionalDate,
  prismaWhereStudentCanTake,
  studentTakeTestMessage,
  testWindowStatus,
  validateSchedule,
} from "./testSchedule";
import {
  canStaffEditTest,
  loadStaffForPermission,
  canStaffViewTest,
  resolveStaffCanEditTest,
  resolveStaffCanAccessTest,
  serializeCohorts,
  staffCanAuthorAudience,
  staffManagedCohorts,
  staffManagedPrograms,
  testWhereVisibleToStaffCohorts,
} from "./testPermissions";
import { prismaTestAudienceForStudent, testTargetsStudent } from "./testTargeting";
import {
  buildAttemptPlan,
  assertNoAnswerKeysInStudentPayload,
  materializePlanForStudent,
  newPlanSeed,
  parseAttemptPlan,
  parseDifficultyBlueprint,
  questionsInPlan,
  serializeAttemptPlan,
  type AttemptQuestionPlan,
} from "./attemptShuffle";
import {
  getOrCreateOpenAttempt,
  rejectClientScoringFields,
  studentResultVisibility,
} from "./attemptLifecycle";
import { IMPORT_LIMITS, validateImportQuestions } from "./questionImportValidation";
import {
  isAttemptTimeExpired,
  resolveAttemptEndsAt,
} from "./attemptTiming";
import { finalizeStudentAttempt } from "./finalizeAttempt";
import { registerQuestionBankRoutes } from "./questionBankRoutes";
import { registerAcademicCatalogRoutes } from "./academicCatalog";
import { ensurePermissionCatalog } from "./permissions";
import {
  buildAnalytics,
  shouldFlagProctor,
  TAB_SWITCH_FLAG_THRESHOLD,
  FULLSCREEN_EXIT_FLAG_THRESHOLD,
} from "./analytics";
import {
  IS_PRODUCTION,
  RESULTS_AUTO_RELEASE_MINUTES,
  ALLOW_NETLIFY_PREVIEWS,
} from "./config";
import {
  TRUST_PROXY,
  buildCapacityReport,
  logCapacitySummary,
} from "./capacity";
import { applySecurityBasics } from "./securityHeaders";
import {
  ensureResultsAutoReleased,
  resultsAutoReleaseAt,
  startResultsAutoReleaseScheduler,
  studentCanViewResults,
} from "./autoReleaseResults";
import { revokeAllUserSessions } from "./sessions";
import { invalidateUserGateCache } from "./middleware/auth";
import {
  getAssessmentType,
  isFacultyScoredAssessment,
  isMcqAssessment,
  isSelfAssessment,
  normalizeAssessmentType,
} from "../shared/assessmentTypes";

function userPublic(u: {
  id: string;
  email: string;
  name: string;
  role: Role;
  program?: Program | null;
  levelType?: LevelType | null;
  level?: number | null;
  section?: string | null;
  rollNo?: string | null;
  mustChangePassword?: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    program: u.program ?? null,
    levelType: u.levelType ?? null,
    level: u.level ?? null,
    section: u.section ?? null,
    rollNo: u.rollNo ?? null,
    mustChangePassword: !!u.mustChangePassword,
  };
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const allowedOrigins = buildAllowedOrigins();
if (IS_PRODUCTION) {
  console.log(
    `[cors] allowlist: ${[...allowedOrigins].join(", ") || "(empty — set CLIENT_ORIGIN)"}`
  );
}

applySecurityBasics(app);
/** Required behind Nginx / Render so rate limits & audits see real client IPs. */
if (TRUST_PROXY !== false) {
  app.set("trust proxy", TRUST_PROXY);
}

app.use(
  cors({
    // Never use Access-Control-Allow-Origin: * — credentials require an exact origin.
    origin(origin, callback) {
      if (
        isOriginAllowed(origin, allowedOrigins, {
          isProduction: IS_PRODUCTION,
          allowNetlifyPreviews: ALLOW_NETLIFY_PREVIEWS,
        })
      ) {
        // Reflect the exact request origin (never `*`).
        return callback(null, origin || true);
      }
      callback(new Error(`CORS not allowed for origin: ${origin ?? "(none)"}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api", globalApiLimiter);

app.use(healthRouter);
app.use(authRouter);
app.use(skillsRouter);
app.use(notificationsRouter);
registerQuestionBankRoutes(app);
registerAcademicCatalogRoutes(app);

async function ensureOpenAttempt(userId: string, testId: string) {
  const existing = await prisma.testAttempt.findFirst({
    where: { userId, testId, submittedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.testAttempt.create({ data: { userId, testId } });
}

function studentResultsUnlockMeta(test: {
  resultsPublished: boolean;
  availableUntil: Date | null;
}) {
  const visible = studentCanViewResults(test);
  const unlockAt = !visible && test.availableUntil ? test.availableUntil : null;
  return {
    resultsPublished: visible,
    resultsAutoReleaseAt: unlockAt?.toISOString() ?? null,
    resultsAutoReleaseMinutes: RESULTS_AUTO_RELEASE_MINUTES,
    availableUntil: test.availableUntil?.toISOString() ?? null,
  };
}

function formatUnlockAtIso(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

app.get(
  "/api/student/tests",
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_VIEW_ELIGIBLE"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const student = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: {
        program: true,
        levelType: true,
        level: true,
        section: true,
        rollNo: true,
        name: true,
      },
    });
    if (!student) return res.status(401).json({ error: "Unauthorized" });
    const now = new Date();
    const audience = prismaTestAudienceForStudent(student);
    const [tests, upcoming] = await Promise.all([
      prisma.test.findMany({
        where: { AND: [prismaWhereStudentCanTake(now), audience] },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { questions: true } },
          attempts: {
            where: { userId: auth.sub },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              submittedAt: true,
              score: true,
              startedAt: true,
            },
          },
        },
      }),
      prisma.test.findMany({
        where: {
          AND: [
            { isPublished: true },
            { availableFrom: { gt: now } },
            audience,
          ],
        },
        orderBy: { availableFrom: "asc" },
        select: {
          id: true,
          title: true,
          durationMin: true,
          availableFrom: true,
          availableUntil: true,
          program: true,
          levelType: true,
          level: true,
          section: true,
          assessmentType: true,
          maxScore: true,
          _count: { select: { questions: true } },
        },
      }),
    ]);
    res.json({
      student: {
        program: student.program,
        levelType: student.levelType,
        level: student.level,
        rollNo: student.rollNo,
        section: student.section,
        classLabel:
          student.program != null
            ? formatAcademic(
                student.program,
                student.levelType,
                student.level,
                student.section
              )
            : null,
      },
      tests: tests.map(({ attempts, ...t }) => {
        const latest = attempts[0] ?? null;
        return {
          ...t,
          latestAttempt: latest
            ? {
                id: latest.id,
                submittedAt: latest.submittedAt,
                startedAt: latest.startedAt,
                // Never expose score until results are released.
                ...(studentCanViewResults(t) ? { score: latest.score } : { score: null }),
              }
            : null,
          windowStatus: "open" as const,
          ...studentResultsUnlockMeta(t),
        };
      }),
      upcoming,
    });
  }
);

app.get(
  "/api/student/attempts",
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("RESULT_VIEW_OWN"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const attempts = await prisma.testAttempt.findMany({
      where: {
        userId: auth.sub,
        test: { isPublished: true },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        test: {
          select: {
            title: true,
            isPublished: true,
            resultsPublished: true,
            availableUntil: true,
            assessmentType: true,
            maxScore: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });
    res.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        testId: a.testId,
        startedAt: a.startedAt.toISOString(),
        submittedAt: a.submittedAt?.toISOString() ?? null,
        // Hide scores until the exam end time has passed and results are released.
        score: studentCanViewResults(a.test) ? a.score : null,
        maxScore: studentCanViewResults(a.test) ? a.test.maxScore : null,
        test: {
          title: a.test.title,
          isPublished: a.test.isPublished,
          assessmentType: a.test.assessmentType,
          ...studentResultsUnlockMeta(a.test),
        },
      })),
    });
  }
);

/** Student performance graphics — published scores only. */
app.get(
  "/api/student/analytics",
  requireAuth,
  requireRole(Role.STUDENT),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const readinessInputs = await loadReadinessAttempts(prisma, {
      userId: auth.sub,
      test: {
        OR: [{ availableUntil: null }, { availableUntil: { lte: new Date() } }],
      },
    }, { take: 100 });
    const readiness = buildPlacementReadiness(readinessInputs);

    const rows = readiness.testHistory
      .slice()
      .reverse()
      .map((r) => ({
        attemptId: r.attemptId,
        testId: r.testId,
        title: r.title,
        score: r.score,
        maxScore: r.maxScore,
        percent: r.percent,
        submittedAt: r.submittedAt,
        assessmentType: r.assessmentType,
        pillar: r.pillar,
      }));

    const bands = [
      { label: "0–39%", count: 0 },
      { label: "40–59%", count: 0 },
      { label: "60–74%", count: 0 },
      { label: "75–89%", count: 0 },
      { label: "90–100%", count: 0 },
    ];
    for (const r of rows) {
      if (r.percent < 40) bands[0]!.count += 1;
      else if (r.percent < 60) bands[1]!.count += 1;
      else if (r.percent < 75) bands[2]!.count += 1;
      else if (r.percent < 90) bands[3]!.count += 1;
      else bands[4]!.count += 1;
    }

    const avg = readiness.readiness.overall;
    const best =
      rows.length > 0 ? rows.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;
    const passMark = 50;
    const passed = rows.filter((r) => r.percent >= passMark).length;

    res.json({
      summary: {
        scoredTests: rows.length,
        averagePercent: avg,
        bestPercent: best?.percent ?? null,
        bestTitle: best?.title ?? null,
        passRate:
          rows.length > 0
            ? Math.round((passed / rows.length) * 1000) / 10
            : null,
        passMark,
        readinessOverall: readiness.readiness.overall,
      },
      readiness,
      trend: readiness.improvement.trend.map((r) => ({
        id: r.id,
        label: r.label,
        percent: r.percent,
        submittedAt: r.submittedAt,
      })),
      byTest: readiness.testHistory.map((r) => ({
        id: r.attemptId,
        testId: r.testId,
        title: r.title,
        percent: r.percent,
        score: r.score,
        maxScore: r.maxScore,
        assessmentType: r.assessmentType,
        pillar: r.pillarLabel,
      })),
      scoreDistribution: bands,
    });
  }
);

app.get(
  "/api/student/tests/:testId/session",
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_START"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const test = await prisma.test.findUnique({
      where: { id: req.params.testId },
      include: {
        questions: {
          orderBy: { order: "asc" },
          // Never load isCorrect for the student-facing session path.
          include: { options: { select: { id: true, text: true } } },
        },
      },
    });
    if (!test) return res.status(404).json({ error: "Not found" });

    if (!isMcqAssessment(test.assessmentType)) {
      return res.status(400).json({
        error: isSelfAssessment(test.assessmentType)
          ? "This is a self-assessment. Open it from your dashboard to submit your score."
          : "This assessment is scored by faculty — you do not take an MCQ for it.",
        code: "NOT_MCQ",
        assessmentType: test.assessmentType,
      });
    }

    const student = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { program: true, levelType: true, level: true, section: true },
    });
    if (!student || !testTargetsStudent(test, student)) {
      return res.status(404).json({
        error: "This test is not available for your class (degree / year / section).",
      });
    }

    let latest = await prisma.testAttempt.findFirst({
      where: { userId: auth.sub, testId: test.id },
      orderBy: { startedAt: "desc" },
    });

    const window = testWindowStatus(test);
    if (window === "draft" || window === "upcoming") {
      const code = window === "upcoming" ? 403 : 404;
      return res.status(code).json({ error: studentTakeTestMessage(window) });
    }
    if (window === "closed") {
      if (latest && !latest.submittedAt) {
        await autoFinalizeOpenAttempt(latest.id, {
          actor: { id: auth.sub, email: auth.email },
          force: true,
        });
        latest = await prisma.testAttempt.findFirst({
          where: { userId: auth.sub, testId: test.id },
          orderBy: { startedAt: "desc" },
        });
      }
      if (!latest?.submittedAt) {
        return res.status(403).json({ error: studentTakeTestMessage("closed") });
      }
    }

    if (latest?.submittedAt && !test.allowRetake) {
      const maxScore = mcqMaxScoreForTest(test);
      return res.json({
        status: "submitted" as const,
        test: {
          id: test.id,
          title: test.title,
          questionCount: test.questionsPerAttempt ?? test.questions.length,
          ...studentResultsUnlockMeta(test),
        },
        attempt: {
          id: latest.id,
          submittedAt: latest.submittedAt.toISOString(),
          ...(studentCanViewResults(test)
            ? { score: latest.score, maxScore }
            : {}),
        },
      });
    }

    const started = await getOrCreateOpenAttempt({
      userId: auth.sub,
      testId: test.id,
      durationMin: test.durationMin,
      availableUntil: test.availableUntil,
      allowRetake: test.allowRetake,
      maxAttempts: test.maxAttempts,
    });
    if (!started.ok) {
      if (started.attempt?.submittedAt) {
        const maxScore = mcqMaxScoreForTest(test);
        return res.json({
          status: "submitted" as const,
          test: {
            id: test.id,
            title: test.title,
            questionCount: test.questionsPerAttempt ?? test.questions.length,
            ...studentResultsUnlockMeta(test),
          },
          attempt: {
            id: started.attempt.id,
            submittedAt: started.attempt.submittedAt.toISOString(),
            ...(studentCanViewResults(test)
              ? { score: started.attempt.score, maxScore }
              : {}),
          },
        });
      }
      return res.status(403).json({
        error: "You have already used your allowed attempts for this test.",
        code: started.code,
      });
    }
    const attempt = started.attempt;

    const bankForPlan = test.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      topic: q.topic,
      difficulty: q.difficulty,
      sourceBankQuestionId: q.sourceBankQuestionId,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    }));
    const plan = await ensureAttemptQuestionPlan(
      { ...attempt, userId: auth.sub },
      bankForPlan,
      test.questionsPerAttempt,
      auth,
      test.difficultyBlueprint
    );
    const planQuestions = questionsInPlan(test.questions, plan);

    if (
      isAttemptTimeExpired(
        attempt.startedAt,
        test.durationMin,
        new Date(),
        attempt.endsAt,
        test.availableUntil
      )
    ) {
      const scored = await autoFinalizeOpenAttempt(attempt.id, {
        actor: { id: auth.sub, email: auth.email },
        force: true,
      });
      const closed = await prisma.testAttempt.findUnique({
        where: { id: attempt.id },
        select: { id: true, submittedAt: true, score: true },
      });
      if (closed?.submittedAt) {
        const maxScore =
          scored?.maxScore ??
          mcqMaxScoreFromQuestionMarks(
            planQuestions.map((q) => ({ marks: q.marks })),
            null
          );
        return res.json({
          status: "submitted" as const,
          test: {
            id: test.id,
            title: test.title,
            questionCount: plan.questionIds.length,
            ...studentResultsUnlockMeta(test),
          },
          attempt: {
            id: closed.id,
            submittedAt: closed.submittedAt.toISOString(),
            ...(studentCanViewResults(test)
              ? { score: closed.score, maxScore }
              : {}),
          },
        });
      }
    }

    const endsAt = resolveAttemptEndsAt(
      attempt,
      test.durationMin,
      test.availableUntil
    );
    // Never send isCorrect / correctIndex / explanations / marks during the attempt.
    const questions = materializePlanForStudent(bankForPlan, plan);
    assertNoAnswerKeysInStudentPayload(questions);
    const savedAnswers = await loadAttemptAnswersMap(attempt.id);
    const allowed = new Set(plan.questionIds);
    const filteredAnswers: Record<string, string> = {};
    for (const [qid, oid] of Object.entries(savedAnswers)) {
      if (allowed.has(qid)) filteredAnswers[qid] = oid;
    }
    const markedQuestionIds = parseMarkedQuestionIds(attempt.markedForReview).filter(
      (qid) => allowed.has(qid)
    );
    res.json({
      status: "in_progress" as const,
      test: {
        id: test.id,
        title: test.title,
        durationMin: test.durationMin,
        questions,
        questionsPerAttempt: questions.length,
      },
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      /** Server clock deadline — client countdown is display-only. */
      deadlineIso: endsAt.toISOString(),
      serverNowIso: new Date().toISOString(),
      savedAnswers: filteredAnswers,
      markedQuestionIds,
    });
  }
);

app.patch(
  "/api/student/attempts/:attemptId/answers",
  autosaveLimiter,
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_ANSWER"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const attemptId = req.params.attemptId;
    const scoreReject = rejectClientScoringFields(req.body);
    if (scoreReject) {
      return res.status(400).json({
        error: scoreReject.error,
        code: scoreReject.code,
      });
    }
    const answers = (req.body?.answers ?? {}) as Record<string, string>;
    if (answers && typeof answers !== "object") {
      return res.status(400).json({ error: "answers must be an object of questionId → optionId." });
    }
    const keys = Object.keys(answers);
    const markedIncoming = Array.isArray(req.body?.markedQuestionIds)
      ? (req.body.markedQuestionIds as unknown[])
      : null;
    if (keys.length === 0 && markedIncoming == null)
      return res.json({ ok: true, saved: 0 });
    if (keys.length > 80) {
      return res.status(400).json({ error: "Too many answers in one save." });
    }

    const access = await loadOwnedStudentAttempt(attemptId, auth.sub, {
      requireCohort: true,
    });
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, code: access.code });
    }
    const attempt = access.attempt;
    if (attempt.submittedAt)
      return res.status(400).json({ error: "This attempt is already submitted." });

    if (
      isAttemptTimeExpired(
        attempt.startedAt,
        attempt.test.durationMin,
        new Date(),
        attempt.endsAt,
        attempt.test.availableUntil
      )
    ) {
      await autoFinalizeOpenAttempt(attemptId, {
        actor: { id: auth.sub, email: auth.email },
        force: true,
      });
      return res.status(403).json({
        error: "Time is up. Your attempt was auto-submitted.",
        code: "ATTEMPT_EXPIRED",
        autoSubmitted: true,
      });
    }

    const filtered = await sanitizeAttemptAnswers(
      attemptId,
      attempt.testId,
      attempt.questionPlan,
      answers
    );

    if (Object.keys(filtered).length > 0) {
      await saveAttemptAnswers(prisma, attemptId, filtered);
    }

    const plan = parseAttemptPlan(attempt.questionPlan);
    const allowed = plan ? new Set(plan.questionIds) : null;
    let markedSaved = 0;
    if (markedIncoming != null) {
      const marked = markedIncoming
        .filter((id): id is string => typeof id === "string" && !!id)
        .filter((id) => !allowed || allowed.has(id))
        .slice(0, 200);
      await prisma.testAttempt.update({
        where: { id: attemptId, userId: auth.sub },
        data: { markedForReview: serializeMarkedQuestionIds(marked) },
      });
      markedSaved = marked.length;
    }

    const endsAt = resolveAttemptEndsAt(
      attempt,
      attempt.test.durationMin,
      attempt.test.availableUntil
    );
    res.json({
      ok: true,
      saved: Object.keys(filtered).length,
      markedSaved,
      endsAt: endsAt.toISOString(),
      serverNowIso: new Date().toISOString(),
    });
  }
);

app.post(
  "/api/student/attempts/:attemptId/proctor",
  proctorLimiter,
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_ANSWER"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const attemptId = req.params.attemptId;
    const event = String(req.body?.event ?? "").toUpperCase();
    if (event !== "TAB_SWITCH" && event !== "FULLSCREEN_EXIT") {
      return res.status(400).json({ error: "event must be TAB_SWITCH or FULLSCREEN_EXIT." });
    }

    const access = await loadOwnedStudentAttempt(attemptId, auth.sub, {
      requireCohort: true,
    });
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, code: access.code });
    }
    const attempt = access.attempt;
    if (attempt.submittedAt)
      return res.status(400).json({ error: "This attempt is already submitted." });
    if (
      isAttemptTimeExpired(
        attempt.startedAt,
        attempt.test.durationMin,
        new Date(),
        attempt.endsAt,
        attempt.test.availableUntil
      )
    ) {
      await autoFinalizeOpenAttempt(attemptId, {
        actor: { id: auth.sub, email: auth.email },
        force: true,
      });
      return res.status(403).json({
        error: "Time is up. Your attempt was auto-submitted.",
        code: "ATTEMPT_EXPIRED",
        autoSubmitted: true,
      });
    }

    const updated = await prisma.testAttempt.update({
      where: { id: attemptId, userId: auth.sub },
      data:
        event === "TAB_SWITCH"
          ? { tabSwitchCount: { increment: 1 } }
          : { fullscreenExitCount: { increment: 1 } },
      select: {
        tabSwitchCount: true,
        fullscreenExitCount: true,
        proctorFlagged: true,
      },
    });

    const shouldFlag = shouldFlagProctor(
      updated.tabSwitchCount,
      updated.fullscreenExitCount
    );
    const proctorFlagged = updated.proctorFlagged || shouldFlag;
    if (shouldFlag && !updated.proctorFlagged) {
      await prisma.testAttempt.update({
        where: { id: attemptId, userId: auth.sub },
        data: { proctorFlagged: true },
      });
    }

    res.json({
      ok: true,
      tabSwitchCount: updated.tabSwitchCount,
      fullscreenExitCount: updated.fullscreenExitCount,
      proctorFlagged,
      thresholds: {
        tabSwitch: TAB_SWITCH_FLAG_THRESHOLD,
        fullscreenExit: FULLSCREEN_EXIT_FLAG_THRESHOLD,
      },
    });
  }
);

app.get(
  "/api/student/attempts/:attemptId/result",
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("RESULT_VIEW_OWN"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    // Ownership only (no cohort) so a transferred student can still see past scores.
    const access = await loadOwnedStudentAttempt(req.params.attemptId, auth.sub);
    if (!access.ok) {
      return res.status(access.status).json({ error: "Not found", code: access.code });
    }
    if (!access.attempt.submittedAt)
      return res.status(400).json({ error: "This attempt is not submitted yet." });
    if (!access.attempt.test.isPublished)
      return res.status(403).json({ error: "This test is not available." });
    if (!studentCanViewResults(access.attempt.test)) {
      const unlock = studentResultsUnlockMeta(access.attempt.test);
      return res.status(403).json({
        error: unlock.resultsAutoReleaseAt
          ? `Your result is not available yet. Results unlock at ${formatUnlockAtIso(unlock.resultsAutoReleaseAt)}.`
          : `Your result is not available yet. Scores appear automatically ${RESULTS_AUTO_RELEASE_MINUTES} minutes after the exam ends — check back soon.`,
        code: "RESULTS_PENDING",
        resultStatus: "PENDING" as const,
        ...unlock,
      });
    }

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: access.attempt.id, userId: auth.sub },
      include: {
        test: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: true },
            },
          },
        },
        answers: true,
      },
    });
    if (!attempt) return res.status(404).json({ error: "Not found" });

    const { maxScore, questions } = buildMcqAttemptResultSheet({
      attemptId: attempt.id,
      questionPlan: attempt.questionPlan,
      questionsPerAttempt: attempt.test.questionsPerAttempt,
      questions: attempt.test.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        topic: q.topic,
        marks: q.marks,
        explanation: q.explanation,
        options: q.options,
      })),
      answers: attempt.answers,
      maxScoreFromMarks: (qs) => mcqMaxScoreFromQuestionMarks(qs, null),
    });

    const peers = await prisma.testAttempt.findMany({
      where: { testId: attempt.testId, submittedAt: { not: null } },
      select: { id: true, score: true, submittedAt: true },
    });
    const ranks = assignRanks(peers);
    const rankInfo = ranks.get(attempt.id);
    const percentage =
      attempt.percentage ??
      percentFromScore(attempt.score ?? 0, maxScore);
    const passed = isPassingPercent(percentage, attempt.test.passPercentage);

    res.json({
      resultStatus: "RELEASED" as const,
      attempt: {
        id: attempt.id,
        score: attempt.score,
        percentage,
        submittedAt: attempt.submittedAt!.toISOString(),
        startedAt: attempt.startedAt.toISOString(),
      },
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        passPercentage: attempt.test.passPercentage,
      },
      maxScore,
      rank: rankInfo?.rank ?? null,
      cohortSize: rankInfo?.cohortSize ?? peers.length,
      passed,
      questions,
    });
  }
);

app.post(
  "/api/student/attempts/:attemptId/submit",
  submitLimiter,
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_SUBMIT"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const attemptId = req.params.attemptId;
    const scoreReject = rejectClientScoringFields(req.body);
    if (scoreReject) {
      return res.status(400).json({
        error: scoreReject.error,
        code: scoreReject.code,
      });
    }
    const incoming = (req.body?.answers ?? {}) as Record<string, string>;
    const autoFlag = !!req.body?.auto;

    const access = await loadOwnedStudentAttempt(attemptId, auth.sub, {
      requireCohort: true,
    });
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error, code: access.code });
    }
    if (access.attempt.submittedAt)
      return res.status(400).json({ error: "Already submitted" });

    const attempt = await prisma.testAttempt.findFirst({
      where: { id: attemptId, userId: auth.sub },
      include: {
        test: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: true },
            },
          },
        },
      },
    });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const window = testWindowStatus(attempt.test);
    if (window === "draft" || window === "upcoming")
      return res.status(403).json({ error: studentTakeTestMessage(window) });

    const plan =
      parseAttemptPlan(attempt.questionPlan) ??
      (await ensureAttemptQuestionPlan(
        attempt,
        attempt.test.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          topic: q.topic,
          difficulty: q.difficulty,
          sourceBankQuestionId: q.sourceBankQuestionId,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
        })),
        attempt.test.questionsPerAttempt,
        auth,
        attempt.test.difficultyBlueprint
      ));
    const scoredQuestions = questionsInPlan(attempt.test.questions, plan);

    const saved = await loadAttemptAnswersMap(attemptId);
    const safeIncoming = await sanitizeAttemptAnswers(
      attemptId,
      attempt.testId,
      attempt.questionPlan ?? serializeAttemptPlan(plan),
      incoming
    );
    const answers = mergeAnswerMaps(saved, safeIncoming);
    const auto =
      autoFlag ||
      isAttemptTimeExpired(
        attempt.startedAt,
        attempt.test.durationMin,
        new Date(),
        attempt.endsAt,
        attempt.test.availableUntil
      ) ||
      window === "closed";

    const { score, maxScore } = await prisma.$transaction(async (tx) =>
      finalizeStudentAttempt(
        tx,
        {
          id: attempt.id,
          test: {
            questions: scoredQuestions.map((q) => ({
              id: q.id,
              options: q.options,
              marks: q.marks,
              negativeMarks: q.negativeMarks,
            })),
            negativeMarking: attempt.test.negativeMarking,
          },
        },
        answers,
        { auto }
      )
    );
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.SUBMIT_ATTEMPT,
      targetType: "TestAttempt",
      targetId: attemptId,
      success: true,
      req,
      meta: {
        testId: attempt.testId,
        drawn: plan.questionIds.length,
        auto,
      },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.RESULT_GENERATED,
      targetType: "TestAttempt",
      targetId: attemptId,
      success: true,
      req,
      meta: { testId: attempt.testId, maxScore, auto },
    });
    console.log(auto ? "[submit:auto]" : "[submit]", {
      attemptId,
      userId: auth.sub,
      score,
      maxScore,
      resultsPublished: attempt.test.resultsPublished,
    });
    // Score is stored server-side; students only see it after RELEASED.
    const resultStatus = studentResultVisibility(
      studentCanViewResults(attempt.test)
    );
    res.json({
      ok: true,
      attemptId,
      submitted: true,
      auto,
      resultStatus,
      ...(resultStatus === "RELEASED" ? { score, maxScore } : {}),
      ...studentResultsUnlockMeta(attempt.test),
    });
  }
);

type QuestionInput = {
  prompt: string;
  options: string[];
  correctIndex: number;
  marks?: number | null;
  negativeMarks?: number | null;
  topic?: string | null;
  difficulty?: string | null;
  explanation?: string | null;
  tags?: string | null;
  categoryId?: string | null;
  sourceBankQuestionId?: string | null;
};

function normalizeQuestionTopic(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  return t ? t.slice(0, 80) : null;
}

function normalizeQuestionDifficulty(raw: unknown): string | null {
  const d = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (d === "EASY" || d === "MEDIUM" || d === "HARD") return d;
  return null;
}

function normalizeQuestionMarks(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(100, Math.round(n * 100) / 100);
}

function normalizeNegativeMarks(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** Paper max from per-question marks (full bank or avg × draw size). */
function mcqMaxScoreFromQuestionMarks(
  questions: { marks?: number | null }[],
  questionsPerAttempt: number | null
): number {
  if (questions.length === 0) return 1;
  const bankSum = questions.reduce(
    (sum, q) => sum + normalizeQuestionMarks(q.marks),
    0
  );
  if (
    questionsPerAttempt == null ||
    questionsPerAttempt <= 0 ||
    questionsPerAttempt >= questions.length
  ) {
    return Math.max(1, Math.round(bankSum));
  }
  return Math.max(1, Math.round((bankSum / questions.length) * questionsPerAttempt));
}

const testListInclude = {
  _count: { select: { questions: true, attempts: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  lastEditedBy: { select: { id: true, name: true, role: true } },
} as const;

function parseTestAudienceBody(body: {
  program?: string;
  levelType?: string;
  level?: number | string;
  section?: string;
}): {
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section: Section | null;
} {
  let program: Program | null = null;
  let levelType: LevelType | null = null;
  let level: number | null = null;
  let section: Section | null = null;
  if (body.program) {
    program = parseProgram(String(body.program));
    if (!program) {
      throw new Error("Invalid degree for test audience.");
    }
    const levelRaw = body.level;
    const hasLevel = levelRaw != null && String(levelRaw) !== "";
    if (hasLevel) {
      levelType = body.levelType
        ? parseLevelType(String(body.levelType))
        : LevelType.YEAR;
      level = Number(levelRaw);
      if (!levelType || level == null || Number.isNaN(level)) {
        throw new Error("Select a valid year, or leave year empty for the whole degree.");
      }
      // Section only applies with a year (exact class).
      if (body.section != null && String(body.section).trim() !== "") {
        section = parseSection(String(body.section));
        if (!section) {
          throw new Error("Choose a valid section (A or B), or leave section empty.");
        }
      }
    } else {
      // Degree-wide (all years / sections).
      levelType = null;
      level = null;
      section = null;
    }
  }
  return { program, levelType, level, section };
}

function buildQuestionCreates(
  questions: QuestionInput[],
  defaults?: { topic?: string | null; difficulty?: string | null }
) {
  const defaultTopic = normalizeQuestionTopic(defaults?.topic);
  const defaultDifficulty = normalizeQuestionDifficulty(defaults?.difficulty);
  return questions.map((q, idx) => {
    const opts = q.options.map((o) => String(o).trim()).filter(Boolean);
    return {
      order: idx + 1,
      prompt: String(q.prompt).trim(),
      topic: normalizeQuestionTopic(q.topic) ?? defaultTopic,
      difficulty: normalizeQuestionDifficulty(q.difficulty) ?? defaultDifficulty,
      marks: normalizeQuestionMarks(q.marks),
      negativeMarks: normalizeNegativeMarks(q.negativeMarks),
      explanation: q.explanation ? String(q.explanation).trim() : null,
      tags: q.tags ? String(q.tags).trim() : null,
      categoryId: q.categoryId ? String(q.categoryId) : null,
      sourceBankQuestionId: q.sourceBankQuestionId
        ? String(q.sourceBankQuestionId)
        : null,
      options: {
        create: opts.map((text, i) => ({
          text,
          isCorrect: i === q.correctIndex,
        })),
      },
    };
  });
}

function validateQuestionInputs(
  questions: QuestionInput[],
  opts?: { requireQuestions?: boolean }
): string | null {
  if (questions.length === 0) {
    if (opts?.requireQuestions === false) return null;
    return "Title and at least one question are required.";
  }
  if (questions.length > IMPORT_LIMITS.maxQuestions) {
    return `Too many questions (max ${IMPORT_LIMITS.maxQuestions}).`;
  }
  const checked = validateImportQuestions(questions);
  if (!checked.ok) return checked.error;
  return null;
}

/** How many MCQs each student draws from the bank. null = entire bank. */
function parseQuestionsPerAttempt(
  raw: unknown,
  bankSize: number
): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const floored = Math.max(1, Math.floor(n));
  if (bankSize <= 0) return floored;
  return Math.min(floored, bankSize);
}

function mcqMaxScoreForTest(test: {
  assessmentType: string;
  questionsPerAttempt: number | null;
  questions: { marks?: number | null }[] | { length: number };
  maxScore: number;
}): number {
  if (!isMcqAssessment(test.assessmentType)) return test.maxScore;
  if (Array.isArray(test.questions) && test.questions.length > 0) {
    return mcqMaxScoreFromQuestionMarks(
      test.questions as { marks?: number | null }[],
      test.questionsPerAttempt
    );
  }
  return test.maxScore > 0 ? test.maxScore : 1;
}

async function ensureAttemptQuestionPlan(
  attempt: {
    id: string;
    questionPlan: string | null;
    testId: string;
    userId?: string;
  },
  bank: {
    id: string;
    prompt: string;
    topic: string | null;
    difficulty?: string | null;
    options: { id: string; text: string }[];
    sourceBankQuestionId?: string | null;
  }[],
  questionsPerAttempt: number | null,
  actor: { sub: string; email: string; role?: string },
  difficultyBlueprintRaw?: string | null
): Promise<AttemptQuestionPlan> {
  const existing = parseAttemptPlan(attempt.questionPlan);
  if (existing && existing.questionIds.length > 0) {
    return existing;
  }

  const userId = attempt.userId ?? actor.sub;
  const excludeIds = new Set<string>();
  const excludePrompts = new Set<string>();

  // No-repeat: prior attempts on this test
  const priorSameTest = await prisma.testAttempt.findMany({
    where: {
      userId,
      testId: attempt.testId,
      id: { not: attempt.id },
      questionPlan: { not: null },
    },
    select: { questionPlan: true },
  });
  for (const p of priorSameTest) {
    const plan = parseAttemptPlan(p.questionPlan);
    if (!plan) continue;
    for (const id of plan.questionIds) excludeIds.add(id);
  }

  // No-repeat across tests via sourceBankQuestionId / prompt
  const priorAnswers = await prisma.studentAnswer.findMany({
    where: {
      attempt: { userId, submittedAt: { not: null } },
      optionId: { not: null },
    },
    select: {
      question: {
        select: {
          id: true,
          prompt: true,
          sourceBankQuestionId: true,
        },
      },
    },
    take: 2000,
  });
  const seenSource = new Set(
    priorAnswers
      .map((a) => a.question.sourceBankQuestionId)
      .filter((id): id is string => !!id)
  );
  for (const q of bank) {
    if (q.sourceBankQuestionId && seenSource.has(q.sourceBankQuestionId)) {
      excludeIds.add(q.id);
    }
    for (const a of priorAnswers) {
      if (
        a.question.prompt.trim().toLowerCase() === q.prompt.trim().toLowerCase()
      ) {
        excludeIds.add(q.id);
        excludePrompts.add(q.prompt);
      }
    }
  }

  const seed = newPlanSeed();
  const blueprint = parseDifficultyBlueprint(difficultyBlueprintRaw);
  const plan = buildAttemptPlan(bank, questionsPerAttempt, seed, blueprint, {
    excludeIds,
    excludePrompts,
  });
  await prisma.testAttempt.update({
    where: { id: attempt.id },
    data: {
      questionPlan: serializeAttemptPlan(plan),
      status: "IN_PROGRESS",
    },
  });
  await logAudit({
    actorId: actor.sub,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: AuditAction.START_ATTEMPT,
    targetType: "TestAttempt",
    targetId: attempt.id,
    success: true,
    meta: {
      testId: attempt.testId,
      drawn: plan.questionIds.length,
      bankSize: bank.length,
      questionsPerAttempt,
      blueprint: blueprint ?? null,
      excluded: excludeIds.size,
    },
  });
  return plan;
}

async function createTestDraft(
  createdById: string,
  body: {
    title?: string;
    description?: string;
    durationMin?: number;
    allowRetake?: boolean;
    questionsPerAttempt?: number | null;
    difficultyBlueprint?: string | Record<string, number> | null;
    passPercentage?: number | null;
    negativeMarking?: boolean;
    maxAttempts?: number | null;
    totalMarks?: number | null;
    questionBankId?: string | null;
    categoryId?: string | null;
    topic?: string | null;
    difficulty?: string | null;
    assessmentType?: string;
    maxScore?: number;
    questions?: QuestionInput[];
    program?: string;
    levelType?: string;
    level?: number | string;
    section?: string;
  }
) {
  const title = String(body.title ?? "").trim();
  const questions = body.questions ?? [];
  if (!title) throw new Error("Title is required.");
  const assessmentType = normalizeAssessmentType(body.assessmentType);
  const mcq = isMcqAssessment(assessmentType);
  const qErr = validateQuestionInputs(questions, { requireQuestions: mcq });
  if (qErr) throw new Error(qErr);

  const { program, levelType, level, section } = parseTestAudienceBody(body);
  const topic = normalizeQuestionTopic(body.topic);
  const difficulty = normalizeQuestionDifficulty(body.difficulty);
  const questionsPerAttempt = mcq
    ? parseQuestionsPerAttempt(body.questionsPerAttempt, questions.length)
    : null;
  const blueprint =
    body.difficultyBlueprint == null
      ? null
      : typeof body.difficultyBlueprint === "string"
        ? body.difficultyBlueprint
        : JSON.stringify(body.difficultyBlueprint);
  const passPercentage =
    body.passPercentage != null && Number.isFinite(Number(body.passPercentage))
      ? Math.max(0, Math.min(100, Math.floor(Number(body.passPercentage))))
      : null;
  const maxAttempts =
    body.maxAttempts != null && Number(body.maxAttempts) > 0
      ? Math.min(20, Math.floor(Number(body.maxAttempts)))
      : null;
  const maxScore = Math.max(
    1,
    Math.min(
      1000,
      mcq
        ? mcqMaxScoreFromQuestionMarks(questions, questionsPerAttempt)
        : Number(body.maxScore) || Number(body.totalMarks) || 100
    )
  );

  return prisma.test.create({
    data: {
      title,
      description: body.description?.trim() || null,
      durationMin: Math.max(5, Math.min(180, Number(body.durationMin) || 30)),
      allowRetake: !!body.allowRetake || (maxAttempts != null && maxAttempts > 1),
      questionsPerAttempt,
      difficultyBlueprint: blueprint,
      passPercentage,
      negativeMarking: !!body.negativeMarking,
      maxAttempts,
      totalMarks: body.totalMarks != null ? maxScore : null,
      questionBankId: body.questionBankId ? String(body.questionBankId) : null,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      isPublished: false,
      program,
      levelType,
      level,
      section,
      topic,
      difficulty,
      assessmentType,
      maxScore,
      createdById,
      questions: {
        create: mcq ? buildQuestionCreates(questions, { topic, difficulty }) : [],
      },
    },
  });
}

async function updateTestContent(
  testId: string,
  body: {
    title?: string;
    description?: string;
    durationMin?: number;
    allowRetake?: boolean;
    questionsPerAttempt?: number | null;
    difficultyBlueprint?: string | Record<string, number> | null;
    passPercentage?: number | null;
    negativeMarking?: boolean;
    maxAttempts?: number | null;
    totalMarks?: number | null;
    questionBankId?: string | null;
    categoryId?: string | null;
    topic?: string | null;
    difficulty?: string | null;
    assessmentType?: string;
    maxScore?: number;
    questions?: QuestionInput[];
    program?: string;
    levelType?: string;
    level?: number | string;
    section?: string;
  },
  editorId?: string
) {
  const title = String(body.title ?? "").trim();
  const questions = body.questions ?? [];
  if (!title) throw new Error("Title is required.");
  const assessmentType = normalizeAssessmentType(body.assessmentType);
  const mcq = isMcqAssessment(assessmentType);
  const qErr = validateQuestionInputs(questions, { requireQuestions: mcq });
  if (qErr) throw new Error(qErr);

  const { program, levelType, level, section } = parseTestAudienceBody(body);
  const topic = normalizeQuestionTopic(body.topic);
  const difficulty = normalizeQuestionDifficulty(body.difficulty);
  const questionsPerAttempt = mcq
    ? parseQuestionsPerAttempt(body.questionsPerAttempt, questions.length)
    : null;
  const blueprint =
    body.difficultyBlueprint == null
      ? null
      : typeof body.difficultyBlueprint === "string"
        ? body.difficultyBlueprint
        : JSON.stringify(body.difficultyBlueprint);
  const passPercentage =
    body.passPercentage != null && Number.isFinite(Number(body.passPercentage))
      ? Math.max(0, Math.min(100, Math.floor(Number(body.passPercentage))))
      : null;
  const maxAttempts =
    body.maxAttempts != null && Number(body.maxAttempts) > 0
      ? Math.min(20, Math.floor(Number(body.maxAttempts)))
      : null;
  const maxScore = Math.max(
    1,
    Math.min(
      1000,
      mcq
        ? mcqMaxScoreFromQuestionMarks(questions, questionsPerAttempt)
        : Number(body.maxScore) || Number(body.totalMarks) || 100
    )
  );

  await prisma.$transaction(async (tx) => {
    await tx.test.update({
      where: { id: testId },
      data: {
        title,
        description: body.description?.trim() || null,
        durationMin: Math.max(5, Math.min(180, Number(body.durationMin) || 30)),
        allowRetake: !!body.allowRetake || (maxAttempts != null && maxAttempts > 1),
        questionsPerAttempt,
        difficultyBlueprint: blueprint,
        passPercentage,
        negativeMarking: !!body.negativeMarking,
        maxAttempts,
        totalMarks: body.totalMarks != null ? maxScore : null,
        questionBankId: body.questionBankId ? String(body.questionBankId) : null,
        categoryId: body.categoryId ? String(body.categoryId) : null,
        program,
        levelType,
        level,
        section,
        topic,
        difficulty,
        assessmentType,
        maxScore,
        ...(editorId
          ? { lastEditedById: editorId, lastEditedAt: new Date() }
          : {}),
      },
    });
    await tx.question.deleteMany({ where: { testId } });
    if (mcq) {
      for (const q of buildQuestionCreates(questions, { topic, difficulty })) {
        await tx.question.create({
          data: {
            testId,
            prompt: q.prompt,
            order: q.order,
            topic: q.topic,
            difficulty: q.difficulty,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            options: q.options,
          },
        });
      }
    }
  });
}

app.get(
  "/api/staff/tests",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("ASSESSMENT_VIEW"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });

    const cohorts = await staffManagedCohorts(prisma, staff);
    const managedPrograms = [...new Set(cohorts.map((c) => c.program))];
    const where = testWhereVisibleToStaffCohorts(cohorts);

    const tests = await prisma.test.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: testListInclude,
    });

    const withEdit = tests.map((t) => ({
      ...t,
      canEdit:
        t.createdById === auth.sub || t.createdBy?.role === Role.ADMIN,
    }));
    res.json({
      tests: withEdit,
      managedPrograms,
      managedCohorts: serializeCohorts(cohorts),
    });
  }
);

app.post(
  "/api/staff/tests",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("ASSESSMENT_CREATE"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const cohorts = await staffManagedCohorts(prisma, staff);
    if (cohorts.length === 0) {
      return res.status(400).json({
        error: "Your account has no department assigned. Ask an admin to link your degree (e.g. B.Pharm).",
      });
    }

    const body = { ...(req.body as Record<string, unknown>) };
    const requested = body.program ? parseProgram(String(body.program)) : null;
    const reqLevelType = body.levelType
      ? parseLevelType(String(body.levelType))
      : null;
    const reqLevel =
      body.level != null && String(body.level) !== ""
        ? Number(body.level)
        : null;

    // Default to staff's whole department (no year/section required).
    if (!requested) {
      const first = cohorts[0];
      body.program = first.program;
      body.levelType = null;
      body.level = null;
      body.section = null;
    } else if (reqLevel == null) {
      // Degree-wide — section does not apply
      body.program = requested;
      body.levelType = null;
      body.level = null;
      body.section = null;
    } else {
      // Exact class: year required; section optional (A/B or all sections)
      body.program = requested;
      body.levelType = reqLevelType ?? "YEAR";
      body.level = reqLevel;
      const sec =
        body.section != null && String(body.section).trim() !== ""
          ? parseSection(String(body.section))
          : null;
      body.section = sec;
    }

    const program = parseProgram(String(body.program));
    const levelType =
      body.levelType != null && String(body.levelType) !== ""
        ? parseLevelType(String(body.levelType))
        : null;
    const level =
      body.level != null && String(body.level) !== ""
        ? Number(body.level)
        : null;
    const section =
      body.section != null && String(body.section).trim() !== ""
        ? parseSection(String(body.section))
        : null;
    if (
      !program ||
      !staffCanAuthorAudience(cohorts, program, levelType, level, section)
    ) {
      return res.status(403).json({
        error: "You can only create tests for your assigned department / class.",
      });
    }

    try {
      const created = await createTestDraft(
        auth.sub,
        body as Parameters<typeof createTestDraft>[1]
      );
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.CREATE_TEST,
        targetType: "Test",
        targetId: created.id,
        success: true,
        req,
        meta: { title: created.title },
      });
      res.status(201).json({ ok: true, id: created.id });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid test." });
    }
  }
);

app.get(
  "/api/staff/tests/:id",
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  async (req, res) => {
    const test = await prisma.test.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        lastEditedBy: { select: { id: true, name: true, role: true } },
        questions: {
          orderBy: { order: "asc" },
          include: { options: true },
        },
      },
    });
    if (!test?.createdBy) return res.status(404).json({ error: "Test not found." });

    const auth = (req as express.Request & { auth: JwtUser }).auth;
    let canEdit = auth.role === Role.ADMIN;
    if (auth.role === Role.STAFF) {
      const staff = await loadStaffForPermission(prisma, auth.sub);
      if (!staff) return res.status(401).json({ error: "Unauthorized" });
      const testPerm = { ...test, createdBy: test.createdBy };
      const canView = await canStaffViewTest(prisma, testPerm, staff);
      if (!canView) {
        return res.status(403).json({
          error: "This test is outside your department.",
        });
      }
      canEdit = await canStaffEditTest(prisma, testPerm, staff);
    }

    res.json({
      test: {
        id: test.id,
        title: test.title,
        description: test.description,
        durationMin: test.durationMin,
        allowRetake: test.allowRetake,
        assessmentType: test.assessmentType,
        maxScore: test.maxScore,
        topic: test.topic,
        difficulty: test.difficulty,
        isPublished: test.isPublished,
        resultsPublished: test.resultsPublished,
        resultsPublishedAt: test.resultsPublishedAt,
        availableFrom: test.availableFrom,
        availableUntil: test.availableUntil,
        program: test.program,
        levelType: test.levelType,
        level: test.level,
        createdById: test.createdById,
        createdBy: test.createdBy
          ? { id: test.createdBy.id, name: test.createdBy.name, role: test.createdBy.role }
          : null,
        lastEditedAt: test.lastEditedAt,
        lastEditedBy: test.lastEditedBy
          ? {
              id: test.lastEditedBy.id,
              name: test.lastEditedBy.name,
              role: test.lastEditedBy.role,
            }
          : null,
        questions: test.questions.map((q) => ({
          id: q.id,
          order: q.order,
          prompt: q.prompt,
          marks: q.marks,
          negativeMarks: q.negativeMarks,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        })),
      },
      canEdit,
    });
  }
);

app.patch(
  "/api/staff/tests/:id",
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const test = await prisma.test.findUnique({
      where: { id: req.params.id },
      include: { createdBy: { select: { id: true, role: true } } },
    });
    if (!test?.createdBy) return res.status(404).json({ error: "Test not found." });

    if (auth.role === Role.STAFF) {
      const allowed = await resolveStaffCanEditTest(prisma, test.id, auth.sub);
      if (!allowed) {
        return res.status(403).json({
          error: "You can only edit tests for classes you own.",
        });
      }
    }

    const body = req.body as {
      title?: string;
      description?: string;
      durationMin?: number;
      allowRetake?: boolean;
      assessmentType?: string;
      maxScore?: number;
      topic?: string | null;
      difficulty?: string | null;
      questions?: QuestionInput[];
      program?: string;
      levelType?: string;
      level?: number | string;
      section?: string;
    };

    if (auth.role === Role.STAFF) {
      const staff = await loadStaffForPermission(prisma, auth.sub);
      if (!staff) return res.status(401).json({ error: "Unauthorized" });
      const cohorts = await staffManagedCohorts(prisma, staff);
      const requested =
        body.program != null ? parseProgram(String(body.program)) : test.program;
      const nextLevelType =
        body.levelType != null
          ? parseLevelType(String(body.levelType))
          : test.levelType;
      const nextLevel =
        body.level != null && String(body.level) !== ""
          ? Number(body.level)
          : test.level;
      const nextSection =
        body.section != null
          ? parseSection(String(body.section))
          : parseSection(test.section);
      if (
        !requested ||
        !staffCanAuthorAudience(
          cohorts,
          requested,
          nextLevelType,
          nextLevel,
          nextSection
        )
      ) {
        return res.status(403).json({
          error: "You can only keep tests in classes you own (course + year + section).",
        });
      }
    }

    try {
      await updateTestContent(test.id, body, auth.sub);
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.UPDATE_TEST,
        targetType: "Test",
        targetId: test.id,
        success: true,
        req,
        meta: { title: body.title ?? test.title },
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid test." });
    }
  }
);

app.post(
  "/api/staff/tests/:id/publish",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  requirePermission("ASSESSMENT_PUBLISH"),
  async (req, res) => {
    const existing = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Test not found." });

    const auth = (req as express.Request & { auth: JwtUser }).auth;
    if (auth.role === Role.STAFF) {
      const ok = await resolveStaffCanEditTest(prisma, existing.id, auth.sub);
      if (!ok) {
        return res.status(403).json({
          error: "You can only publish tests for classes you own.",
        });
      }
    }

    const isPublished = !!req.body?.isPublished;
    const availableFrom = parseOptionalDate(req.body?.availableFrom);
    const availableUntil = parseOptionalDate(req.body?.availableUntil);
    const scheduleErr = validateSchedule(availableFrom, availableUntil);
    if (scheduleErr) return res.status(400).json({ error: scheduleErr });
    if (isPublished && !availableUntil) {
      return res.status(400).json({
        error: "Set an exam end time. Students see results only after that time.",
      });
    }
    if (isPublished && availableUntil && availableUntil.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "Exam end time must be in the future so students can take the test.",
      });
    }

    let audiencePatch: {
      program: Program | null;
      levelType: LevelType | null;
      level: number | null;
      section: string | null;
    } | null = null;
    if (isPublished && req.body && "program" in req.body) {
      const rawProgram = req.body.program;
      if (rawProgram == null || String(rawProgram).trim() === "") {
        if (auth.role === Role.STAFF) {
          return res.status(400).json({
            error: "Choose a degree / department before publishing.",
          });
        }
        audiencePatch = {
          program: null,
          levelType: null,
          level: null,
          section: null,
        };
      } else {
        try {
          audiencePatch = parseTestAudienceBody({
            program: String(rawProgram),
            levelType: req.body.levelType,
            level: req.body.level,
            section: req.body.section,
          });
        } catch (e) {
          return res.status(400).json({
            error: e instanceof Error ? e.message : "Invalid audience.",
          });
        }
      }
    }

    if (isPublished && auth.role === Role.STAFF) {
      const finalProgram = audiencePatch ? audiencePatch.program : existing.program;
      if (!finalProgram) {
        return res.status(400).json({
          error: "Choose a degree / department before publishing.",
        });
      }
    }

    await prisma.test.update({
      where: { id: req.params.id },
      data: isPublished
        ? {
            isPublished: true,
            availableFrom,
            availableUntil,
            ...(audiencePatch ?? {}),
          }
        : {
            isPublished: false,
            availableFrom: null,
            availableUntil: null,
          },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: isPublished ? AuditAction.PUBLISH_TEST : AuditAction.UNPUBLISH_TEST,
      targetType: "Test",
      targetId: existing.id,
      success: true,
      req,
      meta: { title: existing.title },
    });
    res.json({
      ok: true,
      resultsAutoReleaseAt:
        isPublished && availableUntil
          ? resultsAutoReleaseAt(availableUntil).toISOString()
          : null,
      resultsAutoReleaseMinutes: RESULTS_AUTO_RELEASE_MINUTES,
    });
  }
);

app.post(
  "/api/staff/tests/:id/publish-results",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  requirePermission("RESULT_RELEASE"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const publish = req.body?.resultsPublished !== false;
    const test = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!test) return res.status(404).json({ error: "Test not found." });
    if (!test.isPublished)
      return res.status(400).json({ error: "Publish the test before releasing results to students." });

    if (auth.role === Role.STAFF) {
      const ok = await resolveStaffCanAccessTest(prisma, test.id, auth.sub);
      if (!ok) {
        return res.status(403).json({
          error: "You can only manage results for your department.",
        });
      }
    }

    await prisma.test.update({
      where: { id: test.id },
      data: publish
        ? { resultsPublished: true, resultsPublishedAt: new Date() }
        : { resultsPublished: false, resultsPublishedAt: null },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: publish ? AuditAction.RESULT_RELEASED : "RESULTS_UNPUBLISHED",
      targetType: "Test",
      targetId: test.id,
      success: true,
      req,
      meta: { title: test.title },
    });
    res.json({ ok: true, resultsPublished: publish });
  }
);

app.post(
  "/api/staff/tests/publish-results-bulk",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const testIds = Array.isArray(req.body?.testIds) ? (req.body.testIds as string[]) : [];
    const publish = req.body?.resultsPublished !== false;
    if (testIds.length === 0)
      return res.status(400).json({ error: "Provide testIds array." });

    let scopedIds = testIds;
    if (auth.role === Role.STAFF) {
      const staff = await loadStaffForPermission(prisma, auth.sub);
      if (!staff) return res.status(401).json({ error: "Unauthorized" });
      const cohorts = await staffManagedCohorts(prisma, staff);
      const allowed = await prisma.test.findMany({
        where: {
          id: { in: testIds },
          isPublished: true,
          AND: [testWhereVisibleToStaffCohorts(cohorts)],
        },
        select: { id: true },
      });
      scopedIds = allowed.map((t) => t.id);
      if (scopedIds.length === 0) {
        return res.status(403).json({
          error: "None of the selected tests belong to your classes.",
        });
      }
    }

    const tests = await prisma.test.findMany({
      where: { id: { in: scopedIds }, isPublished: true },
      select: { id: true, title: true },
    });
    await prisma.test.updateMany({
      where: { id: { in: tests.map((t) => t.id) } },
      data: publish
        ? { resultsPublished: true, resultsPublishedAt: new Date() }
        : { resultsPublished: false, resultsPublishedAt: null },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: publish ? AuditAction.RESULT_RELEASED : "RESULTS_UNPUBLISHED_BULK",
      targetType: "Test",
      success: true,
      req,
      meta: { count: tests.length, testIds: tests.map((t) => t.id), bulk: true },
    });
    res.json({ ok: true, updated: tests.length });
  }
);

app.get(
  "/api/staff/dashboard-summary",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const cohorts = await staffManagedCohorts(prisma, staff);
    const programs = [...new Set(cohorts.map((c) => c.program))];
    const testWhere = testWhereVisibleToStaffCohorts(cohorts);
    const studentWhere = await studentWhereResultsVisibleToStaff(prisma, auth.sub);

    const [draftTests, publishedAwaitingResults, testsWithPendingAttempts] =
      await Promise.all([
        prisma.test.count({ where: { AND: [testWhere, { isPublished: false }] } }),
        prisma.test.count({
          where: {
            AND: [testWhere, { isPublished: true, resultsPublished: false }],
          },
        }),
        prisma.test.count({
          where: {
            AND: [
              testWhere,
              {
                isPublished: true,
                attempts: {
                  some: {
                    submittedAt: { not: null },
                    user: studentWhere,
                  },
                },
                resultsPublished: false,
              },
            ],
          },
        }),
      ]);

    const pendingSubmissions = await prisma.testAttempt.count({
      where: {
        submittedAt: { not: null },
        test: { AND: [testWhere, { resultsPublished: false, isPublished: true }] },
        user: studentWhere,
      },
    });

    res.json({
      draftTests,
      publishedAwaitingResults,
      testsWithPendingAttempts,
      pendingSubmissions,
      managedPrograms: programs,
      managedCohorts: serializeCohorts(cohorts),
    });
  }
);

async function loadStaffResults(
  testId: string,
  auth: JwtUser,
  filters?: { program?: string; year?: number; minScore?: number; maxScore?: number }
) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: { questions: true },
  });
  if (!test) return null;

  if (auth.role === Role.STAFF) {
    const ok = await resolveStaffCanAccessTest(prisma, testId, auth.sub);
    if (!ok) return { forbidden: true as const };
  }

  const attemptWhere: Prisma.TestAttemptWhereInput = {
    submittedAt: { not: null },
  };
  if (auth.role === Role.STAFF) {
    // Department students who sat this test (optionally narrowed to the test's class).
    const deptWhere = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
    const cohort: Prisma.UserWhereInput = { ...deptWhere };
    if (test.program) {
      attemptWhere.user = {
        AND: [
          deptWhere,
          { program: test.program },
          ...(test.levelType ? [{ levelType: test.levelType }] : []),
          ...(test.level != null ? [{ level: test.level }] : []),
        ],
      };
    } else {
      attemptWhere.user = cohort;
    }
  }

  let attempts = await prisma.testAttempt.findMany({
    where: { testId, ...attemptWhere },
    orderBy: { submittedAt: "desc" },
    take: 500,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          program: true,
          levelType: true,
          level: true,
        },
      },
    },
  });

  if (filters?.program) {
    const p = parseProgram(filters.program);
    if (p) attempts = attempts.filter((a) => a.user.program === p);
  }
  if (filters?.year != null && !Number.isNaN(filters.year)) {
    attempts = attempts.filter((a) => batchYearOf(a.user.level) === filters.year);
  }
  if (filters?.minScore != null && !Number.isNaN(filters.minScore)) {
    attempts = attempts.filter((a) => (a.score ?? 0) >= filters.minScore!);
  }
  if (filters?.maxScore != null && !Number.isNaN(filters.maxScore)) {
    attempts = attempts.filter((a) => (a.score ?? 0) <= filters.maxScore!);
  }

  const maxScore = isMcqAssessment(test.assessmentType)
    ? mcqMaxScoreFromQuestionMarks(test.questions, test.questionsPerAttempt) ||
      test.maxScore
    : test.maxScore;
  const ranks = assignRanks(attempts);
  const enriched = attempts.map((a) => {
    const percentage =
      a.percentage ?? percentFromScore(a.score ?? 0, maxScore);
    const rankInfo = ranks.get(a.id);
    return {
      ...a,
      percentage,
      rank: rankInfo?.rank ?? null,
      cohortSize: rankInfo?.cohortSize ?? attempts.length,
      passed: isPassingPercent(percentage, test.passPercentage),
    };
  });
  // Merit order: rank asc, then name
  enriched.sort((a, b) => {
    if (a.rank != null && b.rank != null && a.rank !== b.rank)
      return a.rank - b.rank;
    if (a.rank != null && b.rank == null) return -1;
    if (a.rank == null && b.rank != null) return 1;
    return a.user.name.localeCompare(b.user.name);
  });

  const rosterByDepartment = await buildResultsRosterByDepartment({
    test,
    attempts: enriched,
    auth,
  });

  return {
    test,
    attempts: enriched,
    maxScore,
    rosterByDepartment,
  };
}

/** Eligible cohort students grouped by department, with attended + absent. */
async function buildResultsRosterByDepartment(args: {
  test: {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
  };
  attempts: {
    id: string;
    userId: string;
    score: number | null;
    percentage: number | null;
    rank: number | null;
    passed: boolean | null;
    submittedAt: Date | null;
    proctorFlagged: boolean;
    user: {
      name: string;
      email: string;
      program: Program | null;
      levelType: LevelType | null;
      level: number | null;
    };
  }[];
  auth: JwtUser;
}) {
  const { test, attempts, auth } = args;

  const audienceWhere: Prisma.UserWhereInput = {
    role: Role.STUDENT,
    isActive: true,
  };
  if (test.program) {
    audienceWhere.program = test.program;
    if (test.levelType && test.level != null) {
      audienceWhere.levelType = test.levelType;
      audienceWhere.level = test.level;
    }
  }

  const studentWhere: Prisma.UserWhereInput =
    auth.role === Role.STAFF
      ? {
          AND: [
            audienceWhere,
            await studentWhereResultsVisibleToStaff(prisma, auth.sub),
          ],
        }
      : audienceWhere;

  const eligible = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      name: true,
      email: true,
      program: true,
      levelType: true,
      level: true,
      rollNo: true,
    },
    orderBy: [{ program: "asc" }, { level: "asc" }, { name: "asc" }],
    take: 3000,
  });

  const attemptByUser = new Map(attempts.map((a) => [a.userId, a]));

  // Ensure every submitted attempt appears even if outside current audience filter.
  const seen = new Set(eligible.map((s) => s.id));
  for (const a of attempts) {
    if (seen.has(a.userId)) continue;
    seen.add(a.userId);
    eligible.push({
      id: a.userId,
      name: a.user.name,
      email: a.user.email,
      program: a.user.program,
      levelType: a.user.levelType,
      level: a.user.level,
      rollNo: null,
    });
  }

  type RosterStudent = {
    id: string;
    name: string;
    email: string;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    rollNo: string | null;
    status: "attended" | "absent";
    attempt: {
      id: string;
      score: number | null;
      percentage: number | null;
      rank: number | null;
      passed: boolean | null;
      submittedAt: string | null;
      proctorFlagged: boolean;
    } | null;
  };

  const byProgram = new Map<string, RosterStudent[]>();

  for (const s of eligible) {
    const key = s.program ?? "__ALL__";
    const attempt = attemptByUser.get(s.id);
    const row: RosterStudent = {
      id: s.id,
      name: s.name,
      email: s.email,
      program: s.program,
      levelType: s.levelType,
      level: s.level,
      rollNo: s.rollNo,
      status: attempt ? "attended" : "absent",
      attempt: attempt
        ? {
            id: attempt.id,
            score: attempt.score,
            percentage: attempt.percentage,
            rank: attempt.rank,
            passed: attempt.passed,
            submittedAt: attempt.submittedAt
              ? attempt.submittedAt.toISOString()
              : null,
            proctorFlagged: attempt.proctorFlagged,
          }
        : null,
    };
    const list = byProgram.get(key) ?? [];
    list.push(row);
    byProgram.set(key, list);
  }

  const labelFor = (program: Program | null) =>
    program
      ? programOptions().find((p) => p.id === program)?.label ?? program
      : "Unassigned / other";

  const departments = [...byProgram.entries()]
    .map(([key, students]) => {
      const program = key === "__ALL__" ? null : (key as Program);
      students.sort((a, b) => {
        if (a.status !== b.status) return a.status === "attended" ? -1 : 1;
        if ((a.level ?? 99) !== (b.level ?? 99))
          return (a.level ?? 99) - (b.level ?? 99);
        return a.name.localeCompare(b.name);
      });
      const attended = students.filter((s) => s.status === "attended");
      const absent = students.filter((s) => s.status === "absent");
      const scored = attended.filter((s) => s.attempt?.percentage != null);
      const avgPct =
        scored.length > 0
          ? Math.round(
              (scored.reduce((n, s) => n + (s.attempt!.percentage ?? 0), 0) /
                scored.length) *
                10
            ) / 10
          : null;

      // Year buckets inside department
      const yearMap = new Map<string, RosterStudent[]>();
      for (const s of students) {
        const batch = s.level == null ? null : batchYearOf(s.level);
        const yKey = batch != null ? `B${batch}` : "Y_NONE";
        const list = yearMap.get(yKey) ?? [];
        list.push(s);
        yearMap.set(yKey, list);
      }
      const years = [...yearMap.entries()]
        .map(([yKey, yearStudents]) => {
          const level = yKey === "Y_NONE" ? null : Number(yKey.slice(1));
          const yAtt = yearStudents.filter((s) => s.status === "attended");
          const yAbs = yearStudents.filter((s) => s.status === "absent");
          return {
            level,
            label: level != null ? `${level} batch` : "Batch not set",
            total: yearStudents.length,
            attendedCount: yAtt.length,
            notAttendedCount: yAbs.length,
            students: yearStudents,
          };
        })
        .sort((a, b) => (a.level ?? 99) - (b.level ?? 99));

      return {
        program,
        label: labelFor(program),
        total: students.length,
        attendedCount: attended.length,
        notAttendedCount: absent.length,
        averagePercent: avgPct,
        years,
        students,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return departments;
}

function resultsFiltersFromQuery(query: express.Request["query"]) {
  return {
    program: query.program ? String(query.program) : undefined,
    year: query.year != null && query.year !== "" ? Number(query.year) : undefined,
    minScore: query.minScore != null ? Number(query.minScore) : undefined,
    maxScore: query.maxScore != null ? Number(query.maxScore) : undefined,
  };
}

function jsonTestResultsPayload(
  data: Extract<Awaited<ReturnType<typeof loadStaffResults>>, { test: unknown }>
) {
  const autoAt =
    !data.test.resultsPublished && data.test.availableUntil
      ? resultsAutoReleaseAt(data.test.availableUntil)
      : null;
  return {
    test: {
      id: data.test.id,
      title: data.test.title,
      isPublished: data.test.isPublished,
      resultsPublished: data.test.resultsPublished,
      resultsPublishedAt: data.test.resultsPublishedAt,
      availableUntil: data.test.availableUntil,
      assessmentType: data.test.assessmentType,
      passPercentage: data.test.passPercentage,
      program: data.test.program,
      levelType: data.test.levelType,
      level: data.test.level,
      resultsAutoReleaseAt: autoAt?.toISOString() ?? null,
      resultsAutoReleaseMinutes: RESULTS_AUTO_RELEASE_MINUTES,
      questions: data.test.questions.map((q) => ({ id: q.id })),
      attempts: data.attempts,
    },
    maxScore: data.maxScore,
    rosterByDepartment: data.rosterByDepartment ?? [],
  };
}

async function loadStaffAttemptReview(
  testId: string,
  attemptId: string,
  auth: JwtUser
) {
  // Block cross-wiring: /tests/{A}/attempts/{B} where B belongs to another test.
  const bound = await prisma.testAttempt.findFirst({
    where: { id: attemptId, testId },
    select: { id: true, userId: true, submittedAt: true },
  });
  if (!bound || !bound.submittedAt) return { notFound: true as const };

  const data = await loadStaffResults(testId, auth);
  if (!data) return null;
  if ("forbidden" in data) return { forbidden: true as const };

  const attempt = await prisma.testAttempt.findFirst({
    where: { id: attemptId, testId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          program: true,
          levelType: true,
          level: true,
        },
      },
      test: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: true },
          },
        },
      },
      answers: true,
    },
  });
  if (!attempt || !attempt.submittedAt) {
    return { notFound: true as const };
  }
  if (auth.role === Role.STAFF) {
    const visible = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
    const allowed = await prisma.user.findFirst({
      where: { id: attempt.userId, AND: [visible] },
      select: { id: true },
    });
    if (!allowed) return { forbidden: true as const };
  }

  const row = data.attempts.find((a) => a.id === attemptId);
  if (!isMcqAssessment(attempt.test.assessmentType)) {
    const percentage =
      attempt.percentage ??
      percentFromScore(attempt.score ?? 0, data.maxScore);
    return {
      attempt: {
        id: attempt.id,
        score: attempt.score,
        percentage,
        scoreNote: attempt.scoreNote,
        submittedAt: attempt.submittedAt.toISOString(),
        startedAt: attempt.startedAt.toISOString(),
        tabSwitchCount: attempt.tabSwitchCount,
        fullscreenExitCount: attempt.fullscreenExitCount,
        proctorFlagged: attempt.proctorFlagged,
      },
      student: attempt.user,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        assessmentType: attempt.test.assessmentType,
        passPercentage: attempt.test.passPercentage,
      },
      maxScore: data.maxScore,
      rank: row?.rank ?? null,
      cohortSize: row?.cohortSize ?? null,
      passed: row?.passed ?? isPassingPercent(percentage, attempt.test.passPercentage),
      questions: [] as {
        id: string;
        prompt: string;
        marks: number;
        explanation: string | null;
        chosenText: string | null;
        correctText: string;
        isCorrect: boolean;
      }[],
    };
  }

  const sheet = buildMcqAttemptResultSheet({
    attemptId: attempt.id,
    questionPlan: attempt.questionPlan,
    questionsPerAttempt: attempt.test.questionsPerAttempt,
    questions: attempt.test.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      topic: q.topic,
      marks: q.marks,
      explanation: q.explanation,
      options: q.options,
    })),
    answers: attempt.answers,
    maxScoreFromMarks: (qs) => mcqMaxScoreFromQuestionMarks(qs, null),
  });
  const percentage =
    attempt.percentage ??
    percentFromScore(attempt.score ?? 0, sheet.maxScore);

  return {
    attempt: {
      id: attempt.id,
      score: attempt.score,
      percentage,
      scoreNote: attempt.scoreNote,
      submittedAt: attempt.submittedAt.toISOString(),
      startedAt: attempt.startedAt.toISOString(),
      tabSwitchCount: attempt.tabSwitchCount,
      fullscreenExitCount: attempt.fullscreenExitCount,
      proctorFlagged: attempt.proctorFlagged,
    },
    student: attempt.user,
    test: {
      id: attempt.test.id,
      title: attempt.test.title,
      assessmentType: attempt.test.assessmentType,
      passPercentage: attempt.test.passPercentage,
    },
    maxScore: sheet.maxScore,
    rank: row?.rank ?? null,
    cohortSize: row?.cohortSize ?? null,
    passed: row?.passed ?? isPassingPercent(percentage, attempt.test.passPercentage),
    questions: sheet.questions,
  };
}

app.get(
  "/api/staff/tests/:id/results",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("RESULT_VIEW"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const data = await loadStaffResults(
      req.params.id,
      auth,
      resultsFiltersFromQuery(req.query)
    );
    if (!data) return res.status(404).json({ error: "Not found" });
    if ("forbidden" in data) {
      return res.status(403).json({ error: "This test is outside your department." });
    }
    res.json(jsonTestResultsPayload(data));
  }
);

/** Staff review of one student's attempt (answer sheet + rank). */
app.get(
  "/api/staff/tests/:testId/attempts/:attemptId",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("RESULT_VIEW"),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const review = await loadStaffAttemptReview(
      req.params.testId,
      req.params.attemptId,
      auth
    );
    if (!review) return res.status(404).json({ error: "Not found" });
    if ("forbidden" in review) {
      return res.status(403).json({ error: "This attempt is outside your department." });
    }
    if ("notFound" in review) return res.status(404).json({ error: "Attempt not found." });
    res.json(review);
  }
);

/** Faculty / practical: enter or update a score for one student. */
app.post(
  "/api/staff/tests/:id/scores",
  requireAuth,
  requireRole(Role.STAFF, Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const test = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!test) return res.status(404).json({ error: "Not found" });
    if (auth.role === Role.STAFF) {
      const ok = await resolveStaffCanEditTest(prisma, test.id, auth.sub);
      if (!ok) return res.status(403).json({ error: "No access." });
    }
    if (!isFacultyScoredAssessment(test.assessmentType)) {
      return res.status(400).json({
        error: "This assessment is not faculty-scored. Use the MCQ exam flow instead.",
      });
    }
    if (!test.isPublished) {
      return res.status(400).json({ error: "Publish the assessment before entering scores." });
    }

    const studentIdRaw = String(req.body?.studentId ?? "").trim();
    const studentEmail = String(req.body?.studentEmail ?? "")
      .trim()
      .toLowerCase();
    const score = Number(req.body?.score);
    const scoreNote =
      req.body?.scoreNote != null ? String(req.body.scoreNote).trim().slice(0, 2000) : null;
    if (!studentIdRaw && !studentEmail) {
      return res.status(400).json({ error: "studentId or studentEmail is required." });
    }
    if (!Number.isFinite(score) || score < 0 || score > test.maxScore) {
      return res.status(400).json({
        error: `Score must be between 0 and ${test.maxScore}.`,
      });
    }

    const student = await prisma.user.findFirst({
      where: {
        role: Role.STUDENT,
        ...(studentIdRaw ? { id: studentIdRaw } : { email: studentEmail }),
      },
    });
    if (!student || !testTargetsStudent(test, student)) {
      return res.status(404).json({ error: "Student not found for this assessment cohort." });
    }
    const studentId = student.id;
    if (auth.role === Role.STAFF) {
      const visible = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
      const allowed = await prisma.user.findFirst({
        where: { id: studentId, AND: [visible] },
        select: { id: true },
      });
      if (!allowed) {
        return res.status(403).json({ error: "This student is not in your assigned results scope." });
      }
    }

    const existing = await prisma.testAttempt.findFirst({
      where: { testId: test.id, userId: studentId },
      orderBy: { startedAt: "desc" },
    });

    const rounded = Math.round(score);
    const percentage = percentFromScore(rounded, test.maxScore);
    const attempt = existing
      ? await prisma.testAttempt.update({
          where: { id: existing.id },
          data: {
            score: rounded,
            percentage,
            scoreNote,
            scoredById: auth.sub,
            submittedAt: existing.submittedAt ?? new Date(),
            status: "SUBMITTED",
          },
        })
      : await prisma.testAttempt.create({
          data: {
            testId: test.id,
            userId: studentId,
            score: rounded,
            percentage,
            scoreNote,
            scoredById: auth.sub,
            submittedAt: new Date(),
            status: "SUBMITTED",
          },
        });

    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      action: "FACULTY_SCORE",
      entityType: "TestAttempt",
      entityId: attempt.id,
      meta: { testId: test.id, studentId, score: attempt.score, percentage },
    });

    res.json({
      ok: true,
      attemptId: attempt.id,
      score: attempt.score,
      percentage: attempt.percentage,
    });
  }
);

/** Student self-assessment submission. */
app.post(
  "/api/student/tests/:testId/self-assess",
  requireAuth,
  requireRole(Role.STUDENT),
  requirePermission("TEST_SUBMIT"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
    if (!test || !test.isPublished) return res.status(404).json({ error: "Not found" });
    if (!isSelfAssessment(test.assessmentType)) {
      return res.status(400).json({ error: "This is not a self-assessment." });
    }

    const student = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { program: true, levelType: true, level: true, section: true },
    });
    if (!student || !testTargetsStudent(test, student)) {
      return res.status(404).json({
        error: "This assessment is not available for your class (degree / year / section).",
      });
    }

    const window = testWindowStatus(test);
    if (window !== "open") {
      return res.status(403).json({ error: studentTakeTestMessage(window) });
    }

    const score = Number(req.body?.score);
    const scoreNote =
      req.body?.scoreNote != null ? String(req.body.scoreNote).trim().slice(0, 2000) : null;
    if (!Number.isFinite(score) || score < 0 || score > test.maxScore) {
      return res.status(400).json({
        error: `Score must be between 0 and ${test.maxScore}.`,
      });
    }

    const latest = await prisma.testAttempt.findFirst({
      where: { userId: auth.sub, testId: test.id },
      orderBy: { startedAt: "desc" },
    });
    if (latest?.submittedAt && !test.allowRetake) {
      return res.status(400).json({ error: "You already submitted this self-assessment." });
    }

    const rounded = Math.round(score);
    const percentage = percentFromScore(rounded, test.maxScore);
    const attempt =
      latest && !latest.submittedAt
        ? await prisma.testAttempt.update({
            where: { id: latest.id, userId: auth.sub },
            data: {
              score: rounded,
              percentage,
              scoreNote,
              submittedAt: new Date(),
              status: "SUBMITTED",
            },
          })
        : await prisma.testAttempt.create({
            data: {
              testId: test.id,
              userId: auth.sub,
              score: rounded,
              percentage,
              scoreNote,
              submittedAt: new Date(),
              status: "SUBMITTED",
            },
          });

    const resultStatus = studentResultVisibility(studentCanViewResults(test));
    res.json({
      ok: true,
      attemptId: attempt.id,
      resultStatus,
      ...(resultStatus === "RELEASED"
        ? {
            score: attempt.score,
            percentage: attempt.percentage,
            maxScore: test.maxScore,
          }
        : {}),
      ...studentResultsUnlockMeta(test),
    });
  }
);

app.get(
  "/api/staff/tests/:id/results/export.csv",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("RESULT_EXPORT"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const data = await loadStaffResults(
      req.params.id,
      auth,
      resultsFiltersFromQuery(req.query)
    );
    if (!data) return res.status(404).json({ error: "Not found" });
    if ("forbidden" in data) {
      return res.status(403).json({ error: "This test is outside your department." });
    }
    const { csv, filename } = buildResultsCsv(
      data.test.title,
      data.attempts,
      data.maxScore
    );
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.CSV_EXPORTED,
      targetType: "Test",
      targetId: req.params.id,
      success: true,
      req,
      meta: { kind: "results", title: data.test.title, rows: data.attempts.length },
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
);

app.get(
  "/api/admin/tests/:id/results",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const data = await loadStaffResults(
      req.params.id,
      auth,
      resultsFiltersFromQuery(req.query)
    );
    if (!data || "forbidden" in data) return res.status(404).json({ error: "Not found" });
    res.json(jsonTestResultsPayload(data));
  }
);

app.get(
  "/api/admin/tests/:testId/attempts/:attemptId",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    await ensureResultsAutoReleased();
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const review = await loadStaffAttemptReview(
      req.params.testId,
      req.params.attemptId,
      auth
    );
    if (!review || "notFound" in review) {
      return res.status(404).json({ error: "Attempt not found." });
    }
    if ("forbidden" in review) {
      return res.status(403).json({ error: "No access." });
    }
    res.json(review);
  }
);

app.get(
  "/api/admin/tests/:id/results/export.csv",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const data = await loadStaffResults(
      req.params.id,
      auth,
      resultsFiltersFromQuery(req.query)
    );
    if (!data || "forbidden" in data) return res.status(404).json({ error: "Not found" });
    const { csv, filename } = buildResultsCsv(
      data.test.title,
      data.attempts,
      data.maxScore
    );
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.CSV_EXPORTED,
      targetType: "Test",
      targetId: req.params.id,
      success: true,
      req,
      meta: { kind: "results", title: data.test.title, rows: data.attempts.length },
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }
);

app.get(
  "/api/admin/reports/students/:id.csv",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const report = await exportStudentMarksReport(prisma, req.params.id);
    if (!report) return res.status(404).json({ error: "Student not found." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.csv);
  }
);

app.get(
  "/api/admin/reports/department.csv",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const program = req.query.program
      ? parseProgram(String(req.query.program))
      : null;
    const levelType = req.query.levelType
      ? parseLevelType(String(req.query.levelType))
      : null;
    const levelRaw = req.query.level;
    const level =
      levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : null;
    const yearRaw = req.query.year;
    const year =
      yearRaw != null && String(yearRaw) !== "" ? Number(yearRaw) : null;
    if (req.query.program && !program) {
      return res.status(400).json({ error: "Invalid program." });
    }
    const report = await exportDepartmentMarksReport(prisma, {
      program,
      levelType,
      level: level != null && !Number.isNaN(level) ? level : null,
      year: year != null && !Number.isNaN(year) ? year : null,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.csv);
  }
);

app.get(
  "/api/staff/reports/students/:id.csv",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const allowed = await canStaffViewStudent(prisma, auth.sub, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: "This student is outside your scope." });
    }
    const report = await exportStudentMarksReport(prisma, req.params.id);
    if (!report) return res.status(404).json({ error: "Student not found." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.csv);
  }
);

/** Student-based roster with averages (department scope). */
app.get(
  "/api/staff/students",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("STUDENT_VIEW"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const managedPrograms = await staffManagedPrograms(prisma, staff);
    const studentWhere = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
    const program = req.query.program
      ? parseProgram(String(req.query.program)) ?? undefined
      : undefined;
    if (program && managedPrograms.length && !managedPrograms.includes(program)) {
      return res.status(403).json({ error: "That department is outside your scope." });
    }
    const q = req.query.q ? String(req.query.q) : undefined;
    const data = await buildStudentRoster(prisma, studentWhere, {
      program,
      q,
    });
    res.json({ ...data, managedPrograms });
  }
);

app.get(
  "/api/staff/students/:id",
  requireAuth,
  requireRole(Role.STAFF),
  requirePermission("STUDENT_VIEW"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const allowed = await canStaffViewStudent(prisma, auth.sub, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: "This student is outside your scope." });
    }
    const detail = await buildStudentPerformance(prisma, req.params.id);
    if (!detail) return res.status(404).json({ error: "Student not found." });
    res.json(detail);
  }
);

app.get(
  "/api/admin/students-roster",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const program = req.query.program
      ? parseProgram(String(req.query.program)) ?? undefined
      : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;
    const data = await buildStudentRoster(prisma, { role: Role.STUDENT }, {
      program,
      q,
      take: 800,
    });
    res.json(data);
  }
);

app.get(
  "/api/admin/students-roster/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const detail = await buildStudentPerformance(prisma, req.params.id);
    if (!detail) return res.status(404).json({ error: "Student not found." });
    res.json(detail);
  }
);

app.get(
  "/api/staff/reports/department.csv",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const managed = await staffManagedPrograms(prisma, staff);
    const program = req.query.program
      ? parseProgram(String(req.query.program))
      : null;
    if (program && managed.length && !managed.includes(program)) {
      return res.status(403).json({ error: "That department is outside your scope." });
    }
    const levelType = req.query.levelType
      ? parseLevelType(String(req.query.levelType))
      : null;
    const levelRaw = req.query.level;
    const level =
      levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : null;
    const yearRaw = req.query.year;
    const year =
      yearRaw != null && String(yearRaw) !== "" ? Number(yearRaw) : null;

    const visibleWhere = await studentWhereVisibleToStaff(prisma, auth.sub);
    const report = await exportDepartmentMarksReport(prisma, {
      program: program ?? (managed.length === 1 ? managed[0] : null),
      levelType,
      level: level != null && !Number.isNaN(level) ? level : null,
      year: year != null && !Number.isNaN(year) ? year : null,
      studentWhereExtra: visibleWhere,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.send(report.csv);
  }
);

app.get(
  "/api/staff/analytics",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const managedPrograms = await staffManagedPrograms(prisma, staff);

    const testId = req.query.testId ? String(req.query.testId) : undefined;
    let program = req.query.program
      ? parseProgram(String(req.query.program)) ?? undefined
      : undefined;
    if (program && !managedPrograms.includes(program)) {
      return res.status(403).json({
        error: "You can only view analytics for your department.",
      });
    }
    // Default to staff department when they manage exactly one
    if (!program && managedPrograms.length === 1) {
      program = managedPrograms[0];
    }
    const passRatio =
      req.query.passRatio != null ? Number(req.query.passRatio) : undefined;
    const studentWhere = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
    const data = await buildAnalytics(
      prisma,
      { testId, program: program ?? undefined, passRatio },
      studentWhere
    );
    res.json({ ...data, managedPrograms });
  }
);

app.get(
  "/api/admin/analytics",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const testId = req.query.testId ? String(req.query.testId) : undefined;
    const program = req.query.program
      ? parseProgram(String(req.query.program)) ?? undefined
      : undefined;
    const passRatio =
      req.query.passRatio != null ? Number(req.query.passRatio) : undefined;
    const data = await buildAnalytics(prisma, {
      testId,
      program: program ?? undefined,
      passRatio,
    });
    res.json(data);
  }
);

app.get(
  "/api/admin/home-ops",
  requireAuth,
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  async (_req, res) => {
    try {
      const ops = await buildAdminHomeOps(prisma);
      res.json({ ops });
    } catch (e) {
      console.error("admin home-ops", e);
      res.status(500).json({ error: "Could not load admin home ops." });
    }
  }
);

app.post(
  "/api/admin/announcements",
  requireAuth,
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const title = String(req.body?.title ?? "").trim();
    const body = String(req.body?.body ?? "").trim();
    if (!title || !body) {
      return res.status(400).json({ error: "Title and message are required." });
    }
    let expiresAt: Date | null = null;
    if (req.body?.expiresAt) {
      const d = new Date(String(req.body.expiresAt));
      if (!Number.isNaN(d.getTime())) expiresAt = d;
    }
    const announcement = await prisma.campusAnnouncement.create({
      data: {
        title,
        body,
        createdById: auth.sub,
        expiresAt,
        active: true,
      },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      action: "CAMPUS_ANNOUNCEMENT_CREATED",
      entityType: "CampusAnnouncement",
      entityId: announcement.id,
      meta: { title },
    });
    res.status(201).json({ announcement });
  }
);

app.delete(
  "/api/admin/announcements/:id",
  requireAuth,
  requireRole(Role.ADMIN, Role.SUPER_ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    await prisma.campusAnnouncement
      .update({
        where: { id: req.params.id },
        data: { active: false },
      })
      .catch(() => null);
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      action: "CAMPUS_ANNOUNCEMENT_ARCHIVED",
      entityType: "CampusAnnouncement",
      entityId: req.params.id,
    });
    res.json({ ok: true });
  }
);

function parseLeaderboardScope(raw: unknown): LeaderboardScope {
  const s = String(raw ?? "overall").toLowerCase();
  if (s === "course" || s === "year" || s === "section") return s;
  return "overall";
}

app.get(
  "/api/staff/leaderboard",
  requireAuth,
  requireRole(Role.STAFF),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const staff = await loadStaffForPermission(prisma, auth.sub);
    if (!staff) return res.status(401).json({ error: "Unauthorized" });
    const managed = await staffManagedPrograms(prisma, staff);
    let program = req.query.program
      ? parseProgram(String(req.query.program)) ?? undefined
      : undefined;
    if (program && !managed.includes(program)) {
      return res.status(403).json({ error: "Outside your department." });
    }
    if (!program && managed.length === 1) program = managed[0];
    const studentWhere = await studentWhereResultsVisibleToStaff(prisma, auth.sub);
    const levelRaw = req.query.level != null ? Number(req.query.level) : undefined;
    const data = await buildLeaderboard(
      prisma,
      {
        scope: parseLeaderboardScope(req.query.scope),
        program,
        levelType: req.query.levelType
          ? parseLevelType(String(req.query.levelType)) ?? undefined
          : undefined,
        level: levelRaw != null && Number.isFinite(levelRaw) ? levelRaw : undefined,
        section: req.query.section ? String(req.query.section) : undefined,
        testId: req.query.testId ? String(req.query.testId) : undefined,
      },
      studentWhere
    );
    res.json(data);
  }
);

app.get(
  "/api/admin/leaderboard",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const levelRaw = req.query.level != null ? Number(req.query.level) : undefined;
    const data = await buildLeaderboard(prisma, {
      scope: parseLeaderboardScope(req.query.scope),
      program: req.query.program
        ? parseProgram(String(req.query.program)) ?? undefined
        : undefined,
      levelType: req.query.levelType
        ? parseLevelType(String(req.query.levelType)) ?? undefined
        : undefined,
      level: levelRaw != null && Number.isFinite(levelRaw) ? levelRaw : undefined,
      section: req.query.section ? String(req.query.section) : undefined,
      testId: req.query.testId ? String(req.query.testId) : undefined,
    });
    res.json(data);
  }
);

app.get(
  "/api/student/leaderboard",
  requireAuth,
  requireRole(Role.STUDENT),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const me = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: {
        program: true,
        levelType: true,
        level: true,
        section: true,
      },
    });
    if (!me?.program) {
      return res.json({
        scope: "year",
        filters: {
          program: null,
          levelType: null,
          level: null,
          section: null,
          testId: null,
        },
        rows: [],
        groups: [],
        you: null,
      });
    }
    const scope = parseLeaderboardScope(req.query.scope ?? "year");
    const data = await buildLeaderboard(prisma, {
      scope: scope === "overall" ? "year" : scope,
      program: me.program,
      levelType: me.levelType ?? undefined,
      level: me.level ?? undefined,
      section:
        scope === "section" && me.section ? me.section : undefined,
    });
    const flat =
      data.rows.length > 0
        ? data.rows
        : data.groups.flatMap((g) => g.rows);
    const you = flat.find((r) => r.userId === auth.sub) ?? null;
    res.json({ ...data, you });
  }
);

app.get(
  "/api/admin/export-pack.zip",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req, res) => {
    try {
      await streamAdminExportPack(prisma, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({
          error: publicErrorMessage(e, "Export failed."),
        });
      }
    }
  }
);

app.get(
  "/api/admin/tests",
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req, res) => {
    const tests = await prisma.test.findMany({
      orderBy: { createdAt: "desc" },
      include: testListInclude,
    });
    res.json({
      tests: tests.map((t) => ({ ...t, canEdit: true })),
    });
  }
);

app.post(
  "/api/admin/tests",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const body = req.body as {
      title?: string;
      description?: string;
      durationMin?: number;
      allowRetake?: boolean;
      questions?: QuestionInput[];
      program?: string;
      levelType?: string;
      level?: number | string;
    };
    try {
      const created = await createTestDraft(auth.sub, body);
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.CREATE_TEST,
        targetType: "Test",
        targetId: created.id,
        success: true,
        req,
        meta: { title: created.title },
      });
      res.status(201).json({ ok: true, id: created.id });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid test." });
    }
  }
);

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("USER_READ"),
  async (_req, res) => {
    const [users, stats] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          program: true,
          levelType: true,
          level: true,
          section: true,
          rollNo: true,
          isActive: true,
          createdAt: true,
          failedLoginCount: true,
          lockedUntil: true,
        },
      }),
      prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    ]);
    res.json({ users, stats });
  }
);

app.get(
  "/api/admin/users/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("USER_READ"),
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        program: true,
        levelType: true,
        level: true,
        section: true,
        rollNo: true,
        isActive: true,
        createdAt: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ user });
  }
);

app.get(
  "/api/admin/students",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const program = parseProgram(String(req.query.program ?? ""));
    const levelType = parseLevelType(String(req.query.levelType ?? ""));
    const levelRaw = req.query.level;
    const level =
      levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : undefined;

    const where: Prisma.UserWhereInput = { role: Role.STUDENT };
    if (program) where.program = program;
    if (levelType) where.levelType = levelType;
    if (level != null && !Number.isNaN(level)) where.level = level;

    const students = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        program: true,
        levelType: true,
        level: true,
        section: true,
        rollNo: true,
        assignedTo: { select: { staff: { select: { id: true, name: true } } } },
      },
    });
    res.json({ students });
  }
);

app.post(
  "/api/admin/students/import",
  sensitiveOpLimiter,
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const rows = Array.isArray(req.body?.students)
      ? req.body.students
      : Array.isArray(req.body?.people)
        ? req.body.people
        : [];
    if (rows.length === 0)
      return res.status(400).json({ error: "Provide students (or people) array in body." });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const defaultPassword = String(req.body?.defaultPassword ?? "TempPass1");
    const pwdErr = validatePasswordStrength(defaultPassword);
    if (pwdErr) return res.status(400).json({ error: pwdErr });
    const forceChange = req.body?.mustChangePassword !== false;
    const hash = await hashPassword(defaultPassword);

    // Drop duplicate emails in the payload (keep last).
    const byEmail = new Map<string, { row: Record<string, unknown>; index: number }>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const email = String(row.email ?? "")
        .trim()
        .toLowerCase();
      if (!email) {
        errors.push(`Row ${i + 1}: email and name required.`);
        continue;
      }
      byEmail.set(email, { row, index: i + 1 });
    }

    for (const [email, { row, index }] of byEmail) {
      const name = String(row.name ?? "").trim();
      const roleRaw = String(row.role ?? "STUDENT")
        .trim()
        .toUpperCase();
      const role =
        roleRaw === "STAFF" || roleRaw === "TEACHER" || roleRaw === "FACULTY"
          ? Role.STAFF
          : Role.STUDENT;
      const program = row.program ? parseProgram(String(row.program)) : null;
      let levelType = row.levelType ? parseLevelType(String(row.levelType)) : null;
      const level =
        row.level != null && String(row.level) !== "" ? Number(row.level) : null;
      if (!levelType && level != null) levelType = LevelType.YEAR;
      const section = parseSection(
        row.section != null ? String(row.section) : null
      );
      const rollNo =
        role === Role.STUDENT
          ? normalizeRollNo(row.rollNo != null ? String(row.rollNo) : "") ??
            inferRollNoFromEmail(email)
          : null;
      if (!name) {
        errors.push(`Row ${index}: email and name required.`);
        skipped++;
        continue;
      }
      if (role === Role.STAFF) {
        if (!program) {
          errors.push(`Row ${index}: staff need a course/department.`);
          skipped++;
          continue;
        }
      } else {
        const acErr = validateStudentAcademic(program, levelType, level, section);
        if (acErr) {
          errors.push(`Row ${index}: ${acErr}`);
          skipped++;
          continue;
        }
      }
      try {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });
        if (existing) {
          if (existing.role !== role) {
            errors.push(
              `Row ${index}: ${email} is already a ${existing.role.toLowerCase()} — not updated.`
            );
            skipped++;
            continue;
          }
          await prisma.user.update({
            where: { email },
            data:
              role === Role.STAFF
                ? { name, program, levelType: null, level: null, section: null, rollNo: null }
                : { name, program, levelType, level, section, rollNo },
          });
          updated++;
        } else {
          await prisma.user.create({
            data:
              role === Role.STAFF
                ? {
                    email,
                    name,
                    role: Role.STAFF,
                    passwordHash: hash,
                    program,
                    mustChangePassword: forceChange,
                  }
                : {
                    email,
                    name,
                    role: Role.STUDENT,
                    passwordHash: hash,
                    program,
                    levelType,
                    level,
                    section,
                    rollNo,
                    mustChangePassword: forceChange,
                  },
          });
          created++;
        }
      } catch {
        skipped++;
        errors.push(`Row ${index}: could not save ${email}.`);
      }
    }

    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      action: "STUDENTS_IMPORTED",
      meta: { created, updated, skipped, errors: errors.length },
    });

    res.json({ ok: true, created, updated, skipped, errors });
  }
);

/**
 * Preview / apply year promotion for students.
 * Body/query: program, year (from), section? (A|B; omit = both sections).
 * POST may include excludeIds[] to skip students (held back).
 */
app.get(
  "/api/admin/students/promote/preview",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("CLASS_UPDATE"),
  async (req, res) => {
    const program = parseProgram(String(req.query.program ?? ""));
    const yearRaw = req.query.year;
    const fromYear =
      yearRaw != null && String(yearRaw) !== "" ? Number(yearRaw) : NaN;
    const section = parseSection(
      req.query.section != null && String(req.query.section) !== ""
        ? String(req.query.section)
        : null
    );
    if (!program || !Number.isFinite(fromYear) || fromYear < 1) {
      return res.status(400).json({
        error: "Select a program and year to promote from.",
      });
    }
    const toYear = nextYearAfterPromote(program, fromYear);
    if (toYear == null) {
      return res.status(400).json({
        error: `${formatYearLabel(fromYear)} is the final year for this program — cannot promote.`,
      });
    }

    const students = await prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        program,
        ...(section ? { section } : {}),
        OR: [
          { levelType: LevelType.YEAR, level: fromYear },
          // Legacy semester rows that map to this academic year
          {
            levelType: LevelType.SEMESTER,
            level: { in: [fromYear * 2 - 1, fromYear * 2] },
          },
        ],
      },
      orderBy: [{ section: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        program: true,
        levelType: true,
        level: true,
        section: true,
        rollNo: true,
      },
      take: 2000,
    });

    const fromLabel = section
      ? formatAcademic(program, "YEAR", fromYear, section)
      : `${formatAcademic(program, "YEAR", fromYear)} (Sec A + B)`;
    const toLabel = section
      ? formatAcademic(program, "YEAR", toYear, section)
      : `${formatAcademic(program, "YEAR", toYear)} (Sec A + B)`;

    res.json({
      program,
      fromYear,
      toYear,
      section: section ?? null,
      fromLabel,
      toLabel,
      count: students.length,
      students: students.map((s) => ({
        ...s,
        classLabel: formatAcademic(s.program, s.levelType, s.level, s.section),
      })),
    });
  }
);

app.post(
  "/api/admin/students/promote",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("CLASS_UPDATE"),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const program = parseProgram(String(req.body?.program ?? ""));
    const fromYear = Number(req.body?.year);
    const section = parseSection(
      req.body?.section != null && String(req.body.section) !== ""
        ? String(req.body.section)
        : null
    );
    const excludeIds = Array.isArray(req.body?.excludeIds)
      ? (req.body.excludeIds as unknown[]).map((id) => String(id))
      : [];
    const excludeSet = new Set(excludeIds);

    if (!program || !Number.isFinite(fromYear) || fromYear < 1) {
      return res.status(400).json({
        error: "Select a program and year to promote from.",
      });
    }
    const toYear = nextYearAfterPromote(program, fromYear);
    if (toYear == null) {
      return res.status(400).json({
        error: `${formatYearLabel(fromYear)} is the final year for this program — cannot promote.`,
      });
    }

    const candidates = await prisma.user.findMany({
      where: {
        role: Role.STUDENT,
        program,
        ...(section ? { section } : {}),
        OR: [
          { levelType: LevelType.YEAR, level: fromYear },
          {
            levelType: LevelType.SEMESTER,
            level: { in: [fromYear * 2 - 1, fromYear * 2] },
          },
        ],
      },
      select: { id: true, section: true },
      take: 2000,
    });

    const toPromote = candidates.filter((s) => !excludeSet.has(s.id));
    if (toPromote.length === 0) {
      return res.status(400).json({
        error: "No students to promote (list empty or all excluded).",
      });
    }

    const result = await prisma.user.updateMany({
      where: { id: { in: toPromote.map((s) => s.id) } },
      data: {
        levelType: LevelType.YEAR,
        level: toYear,
      },
    });

    const fromLabel = section
      ? formatAcademic(program, "YEAR", fromYear, section)
      : `${formatAcademic(program, "YEAR", fromYear)} (Sec A + B)`;
    const toLabel = section
      ? formatAcademic(program, "YEAR", toYear, section)
      : `${formatAcademic(program, "YEAR", toYear)} (Sec A + B)`;

    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      action: "STUDENTS_PROMOTED",
      meta: {
        program,
        fromYear,
        toYear,
        section: section ?? null,
        promoted: result.count,
        excluded: excludeIds.length,
        fromLabel,
        toLabel,
      },
    });

    res.json({
      ok: true,
      promoted: result.count,
      excluded: excludeIds.length,
      program,
      fromYear,
      toYear,
      section: section ?? null,
      fromLabel,
      toLabel,
    });
  }
);

app.get(
  "/api/admin/audit-logs",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("AUDIT_LOG_VIEW"),
  async (req, res) => {
    const take = Math.min(300, Math.max(1, Number(req.query.take) || 150));
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json({
      logs: logs.map(serializeAuditLog),
    });
  }
);

app.post(
  "/api/admin/users/:id/unlock",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found." });
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.ACCOUNT_UNLOCKED,
      targetType: "User",
      targetId: user.id,
      success: true,
      req,
      meta: { email: user.email },
    });
    res.json({ ok: true });
  }
);

/** Soft-deactivate or reactivate a person (keeps history; blocks login when inactive). */
app.post(
  "/api/admin/users/:id/set-active",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found." });
    const isActive = req.body?.isActive === true || req.body?.isActive === "true";
    if (!isActive && user.id === auth.sub) {
      return res.status(400).json({ error: "You cannot deactivate your own account." });
    }
    if (!isActive && user.role === Role.ADMIN) {
      const activeAdmins = await prisma.user.count({
        where: { role: Role.ADMIN, isActive: true, id: { not: user.id } },
      });
      if (activeAdmins < 1) {
        return res
          .status(400)
          .json({ error: "Cannot deactivate the only active administrator." });
      }
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isActive,
        ...(isActive ? {} : { tokenVersion: { increment: 1 } }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
      },
    });
    if (!isActive) {
      invalidateUserGateCache(user.id);
      await revokeAllUserSessions(user.id, "ACCOUNT_DEACTIVATED");
    }
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: isActive ? AuditAction.ACCOUNT_ACTIVATED : AuditAction.ACCOUNT_DEACTIVATED,
      targetType: "User",
      targetId: user.id,
      success: true,
      req,
      entityType: "User",
      entityId: user.id,
      meta: { email: user.email, isActive },
    });
    res.json({ ok: true, user: updated });
  }
);

/** Student attempts + staff-uploaded tests for this person (People detail panel). */
app.get(
  "/api/admin/users/:id/tests",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        role: true,
        program: true,
        levelType: true,
        level: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.role === Role.STUDENT) {
      const [attempts, assigned] = await Promise.all([
        prisma.testAttempt.findMany({
          where: { userId: user.id },
          orderBy: { startedAt: "desc" },
          take: 40,
          select: {
            id: true,
            startedAt: true,
            submittedAt: true,
            score: true,
            scoreNote: true,
            test: {
              select: {
                id: true,
                title: true,
                assessmentType: true,
                maxScore: true,
                resultsPublished: true,
                isPublished: true,
                durationMin: true,
                program: true,
                levelType: true,
                level: true,
                availableFrom: true,
                availableUntil: true,
                createdBy: { select: { id: true, name: true, role: true } },
                _count: { select: { questions: true } },
              },
            },
          },
        }),
        prisma.test.findMany({
          where: {
            isPublished: true,
            ...prismaTestAudienceForStudent({
              program: user.program,
              levelType: user.levelType,
              level: user.level,
            }),
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            title: true,
            assessmentType: true,
            maxScore: true,
            durationMin: true,
            resultsPublished: true,
            availableFrom: true,
            availableUntil: true,
            program: true,
            levelType: true,
            level: true,
            createdBy: { select: { id: true, name: true, role: true } },
            _count: { select: { questions: true } },
            attempts: {
              where: { userId: user.id },
              orderBy: { startedAt: "desc" },
              take: 1,
              select: {
                id: true,
                startedAt: true,
                submittedAt: true,
                score: true,
              },
            },
          },
        }),
      ]);

      res.json({
        role: user.role,
        attempts: attempts.map((a) => ({
          id: a.id,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          score: a.score,
          scoreNote: a.scoreNote,
          maxScore: a.test.maxScore,
          test: {
            id: a.test.id,
            title: a.test.title,
            assessmentType: a.test.assessmentType,
            resultsPublished: a.test.resultsPublished,
            isPublished: a.test.isPublished,
            durationMin: a.test.durationMin,
            questionCount: a.test._count.questions,
            audience: a.test.program
              ? formatAcademic(a.test.program, a.test.levelType, a.test.level)
              : "All students",
            availableFrom: a.test.availableFrom,
            availableUntil: a.test.availableUntil,
            createdBy: a.test.createdBy,
          },
        })),
        assignedTests: assigned.map((t) => {
          const latest = t.attempts[0] ?? null;
          return {
            id: t.id,
            title: t.title,
            assessmentType: t.assessmentType,
            maxScore: t.maxScore,
            durationMin: t.durationMin,
            questionCount: t._count.questions,
            resultsPublished: t.resultsPublished,
            availableFrom: t.availableFrom,
            availableUntil: t.availableUntil,
            audience: t.program
              ? formatAcademic(t.program, t.levelType, t.level)
              : "All students",
            createdBy: t.createdBy,
            latestAttempt: latest,
          };
        }),
        uploadedTests: [],
      });
      return;
    }

    if (user.role === Role.STAFF || user.role === Role.ADMIN) {
      const uploaded = await prisma.test.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          assessmentType: true,
          maxScore: true,
          durationMin: true,
          isPublished: true,
          resultsPublished: true,
          availableFrom: true,
          availableUntil: true,
          program: true,
          levelType: true,
          level: true,
          createdAt: true,
          _count: { select: { questions: true, attempts: true } },
        },
      });

      res.json({
        role: user.role,
        attempts: [],
        assignedTests: [],
        uploadedTests: uploaded.map((t) => ({
          id: t.id,
          title: t.title,
          assessmentType: t.assessmentType,
          maxScore: t.maxScore,
          durationMin: t.durationMin,
          questionCount: t._count.questions,
          attemptCount: t._count.attempts,
          isPublished: t.isPublished,
          resultsPublished: t.resultsPublished,
          availableFrom: t.availableFrom,
          availableUntil: t.availableUntil,
          audience: t.program
            ? formatAcademic(t.program, t.levelType, t.level)
            : "All students",
          createdAt: t.createdAt,
        })),
      });
      return;
    }

    res.json({ role: user.role, attempts: [], assignedTests: [], uploadedTests: [] });
  }
);

function studentBranchWhere(
  program: Program,
  levelType: LevelType | null,
  level: number | null,
  section?: Section | string | null
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: Role.STUDENT, program };
  if (levelType) where.levelType = levelType;
  if (level != null) where.level = level;
  const sec = parseSection(section ?? null);
  if (sec) where.section = sec;
  return where;
}

/** Link students to staff; skips pairs that already exist. */
async function linkStudentsToStaff(
  staffId: string,
  studentIds: string[]
): Promise<number> {
  if (studentIds.length === 0) return 0;
  const existing = await prisma.staffAssignment.findMany({
    where: { staffId, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const have = new Set(existing.map((e) => e.studentId));
  const missing = studentIds.filter((id) => !have.has(id));
  if (missing.length === 0) return 0;
  const result = await prisma.staffAssignment.createMany({
    data: missing.map((studentId) => ({ staffId, studentId })),
  });
  return result.count;
}

app.get(
  "/api/admin/staff/:staffId/roster",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const staff = await prisma.user.findFirst({
      where: { id: req.params.staffId, role: Role.STAFF },
      select: {
        id: true,
        name: true,
        email: true,
        branchScopes: true,
        staffOf: {
          orderBy: { student: { name: "asc" } },
          select: {
            id: true,
            student: {
              select: {
                id: true,
                name: true,
                email: true,
                program: true,
                levelType: true,
                level: true,
                section: true,
              },
            },
          },
        },
      },
    });
    if (!staff) return res.status(404).json({ error: "Staff not found." });
    const visibleWhere = await studentWhereVisibleToStaff(prisma, staff.id);
    const allUnderStaff = await prisma.user.findMany({
      where: visibleWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        program: true,
        levelType: true,
        level: true,
        section: true,
      },
    });
    const assignmentByStudent = new Map(
      staff.staffOf.map((a) => [a.student.id, a.id] as const)
    );
    const students = allUnderStaff.map((student) => ({
      assignmentId: assignmentByStudent.get(student.id) ?? null,
      student,
    }));
    res.json({
      staff: { id: staff.id, name: staff.name, email: staff.email },
      branchScopes: staff.branchScopes,
      students,
      assignments: staff.staffOf.map((a) => ({
        assignmentId: a.id,
        student: a.student,
      })),
    });
  }
);

app.get(
  "/api/admin/staff",
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req, res) => {
    const staff = await prisma.user.findMany({
      where: { role: Role.STAFF },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        staffOf: { select: { studentId: true } },
        branchScopes: true,
      },
    });
    res.json({
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        assignedCount: s.staffOf.length,
        branchScopes: s.branchScopes.map((b) => ({
          id: b.id,
          scopeKey: b.scopeKey,
          program: b.program,
          levelType: b.levelType,
          level: b.level,
        })),
      })),
    });
  }
);

app.get(
  "/api/admin/allocations",
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req, res) => {
    const [assignments, scopes] = await Promise.all([
      prisma.staffAssignment.findMany({
        include: {
          staff: { select: { id: true, name: true } },
          student: {
            select: {
              id: true,
              name: true,
              program: true,
              levelType: true,
              level: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.staffBranchScope.findMany({
        include: { staff: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({ assignments, scopes });
  }
);

app.post(
  "/api/admin/assignments",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("CLASS_ASSIGN"),
  async (req, res) => {
    const staffId = String(req.body?.staffId ?? "");
    const studentIds = Array.isArray(req.body?.studentIds)
      ? (req.body.studentIds as string[])
      : req.body?.studentId
        ? [String(req.body.studentId)]
        : [];
    if (!staffId || studentIds.length === 0)
      return res.status(400).json({ error: "staffId and studentIds required." });

    const staff = await prisma.user.findFirst({ where: { id: staffId, role: Role.STAFF } });
    if (!staff) return res.status(400).json({ error: "Invalid staff member." });

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds }, role: Role.STUDENT },
    });
    if (students.length !== studentIds.length)
      return res.status(400).json({ error: "One or more students are invalid." });

    const assigned = await linkStudentsToStaff(staffId, studentIds);
    const auth = (req as express.Request & { auth: JwtUser }).auth;
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.STUDENT_ASSIGNED,
      targetType: "User",
      targetId: staffId,
      success: true,
      req,
      meta: { studentIds, count: assigned },
    });
    res.status(201).json({ ok: true, assigned });
  }
);

app.delete(
  "/api/admin/assignments/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("CLASS_ASSIGN"),
  async (req, res) => {
    await prisma.staffAssignment.delete({ where: { id: req.params.id } }).catch(() => null);
    res.status(204).end();
  }
);

app.post(
  "/api/admin/assign-branch",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const staffId = String(req.body?.staffId ?? "");
    const program = parseProgram(String(req.body?.program ?? ""));
    const levelType = parseLevelType(String(req.body?.levelType ?? ""));
    const levelRaw = req.body?.level;
    const level =
      levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : null;
    const section = parseSection(
      req.body?.section != null ? String(req.body.section) : null
    );
    if (!staffId || !program)
      return res.status(400).json({
        error: "Select staff and program (year optional; section optional).",
      });

    const err = validateStudentAcademic(program, levelType, level, section);
    if (err) return res.status(400).json({ error: err });

    const staff = await prisma.user.findFirst({ where: { id: staffId, role: Role.STAFF } });
    if (!staff) return res.status(400).json({ error: "Invalid staff member." });

    const scopeKey = buildScopeKey(program, levelType, level, section);
    const branchWhere = studentBranchWhere(program, levelType, level, section);

    const [scope, students] = await Promise.all([
      prisma.staffBranchScope.upsert({
        where: { staffId_scopeKey: { staffId, scopeKey } },
        create: {
          staffId,
          program,
          levelType,
          level,
          section,
          scopeKey,
        },
        update: { section, levelType, level },
      }),
      prisma.user.findMany({
        where: branchWhere,
        select: { id: true },
      }),
    ]);

    const linked = await linkStudentsToStaff(
      staffId,
      students.map((s) => s.id)
    );

    const auth = (req as express.Request & { auth: JwtUser }).auth;
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.CLASS_ASSIGNED,
      targetType: "User",
      targetId: staffId,
      success: true,
      req,
      meta: { program, levelType, level, section, studentCount: students.length, linked },
    });

    res.status(201).json({
      ok: true,
      studentCount: students.length,
      linked,
      scopeKey,
      scopeId: scope.id,
    });
  }
);

app.post(
  "/api/admin/branch-scopes",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    const staffId = String(req.body?.staffId ?? "");
    const program = parseProgram(String(req.body?.program ?? ""));
    const levelType = req.body?.levelType
      ? parseLevelType(String(req.body.levelType))
      : null;
    const levelRaw = req.body?.level;
    const level =
      levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : null;
    const section = parseSection(
      req.body?.section != null ? String(req.body.section) : null
    );

    if (!staffId || !program)
      return res.status(400).json({ error: "staffId and program required." });

    const staff = await prisma.user.findFirst({ where: { id: staffId, role: Role.STAFF } });
    if (!staff) return res.status(400).json({ error: "Invalid staff member." });

    if (levelType && level != null) {
      const err = validateStudentAcademic(program, levelType, level, section);
      if (err) return res.status(400).json({ error: err });
    }

    const scopeKey = buildScopeKey(program, levelType, level, section);
    try {
      await prisma.staffBranchScope.create({
        data: { staffId, program, levelType, level, section, scopeKey },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return res.status(400).json({ error: "This branch scope is already assigned." });
      throw e;
    }
    res.status(201).json({ ok: true });
  }
);

app.delete(
  "/api/admin/branch-scopes/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res) => {
    await prisma.staffBranchScope.delete({ where: { id: req.params.id } }).catch(() => null);
    res.status(204).end();
  }
);

app.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("USER_UPDATE"),
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const name = req.body?.name != null ? String(req.body.name).trim() : user.name;
    const email =
      req.body?.email != null
        ? String(req.body.email).trim().toLowerCase()
        : user.email;
    const password = req.body?.password != null ? String(req.body.password) : "";

    if (!name || !email)
      return res.status(400).json({ error: "Name and email are required." });
    if (password) {
      const pErr = validatePasswordStrength(password);
      if (pErr) return res.status(400).json({ error: pErr });
    }

    let program = user.program;
    let levelType = user.levelType;
    let level = user.level;
    let section = parseSection(user.section);
    let rollNo = user.rollNo;

    if (user.role === Role.STUDENT || user.role === Role.STAFF) {
      if (req.body?.program !== undefined) {
        const raw = String(req.body.program ?? "");
        program = raw ? parseProgram(raw) : null;
      }
      if (req.body?.levelType !== undefined) {
        const raw = String(req.body.levelType ?? "");
        levelType = raw ? parseLevelType(raw) : null;
      }
      if (req.body?.level !== undefined) {
        const levelRaw = req.body.level;
        level =
          levelRaw != null && String(levelRaw) !== ""
            ? Number(levelRaw)
            : null;
      }
      if (req.body?.section !== undefined) {
        section = parseSection(
          req.body.section != null ? String(req.body.section) : null
        );
      }
      if (req.body?.rollNo !== undefined) {
        rollNo = normalizeRollNo(String(req.body.rollNo ?? ""));
      }
      if (user.role === Role.STUDENT) {
        const err = validateStudentAcademic(program, levelType, level, section);
        if (err) return res.status(400).json({ error: err });
        if (!rollNo) rollNo = inferRollNoFromEmail(email);
      } else if (program && (levelType || level != null)) {
        const err = validateStudentAcademic(program, levelType, level, section);
        if (err) return res.status(400).json({ error: err });
      }
    }

    const data: Prisma.UserUpdateInput = {
      name,
      email,
      program,
      levelType,
      level,
      section,
      rollNo,
    };
    if (req.body?.isActive !== undefined) {
      const nextActive = req.body.isActive === true || req.body.isActive === "true";
      if (!nextActive && user.role === Role.ADMIN) {
        const activeAdmins = await prisma.user.count({
          where: {
            role: Role.ADMIN,
            isActive: true,
            id: { not: user.id },
          },
        });
        if (activeAdmins < 1) {
          return res.status(400).json({
            error: "Cannot deactivate the only active administrator.",
          });
        }
      }
      data.isActive = nextActive;
      if (!nextActive) {
        data.tokenVersion = { increment: 1 };
      }
    }
    if (password) {
      data.passwordHash = await hashPassword(password);
      data.tokenVersion = { increment: 1 };
      data.mustChangePassword = true;
      data.failedLoginCount = 0;
      data.lockedUntil = null;
    }

    try {
      const updated = await prisma.user.update({ where: { id: user.id }, data });
      if (password) {
        invalidateUserGateCache(user.id);
        await revokeAllUserSessions(user.id, "ADMIN_PASSWORD_RESET");
      } else if (req.body?.isActive !== undefined) {
        const nextActive =
          req.body.isActive === true || req.body.isActive === "true";
        if (!nextActive) {
          invalidateUserGateCache(user.id);
          await revokeAllUserSessions(user.id, "ACCOUNT_DEACTIVATED");
        }
      }
      const auth = (req as express.Request & { auth: JwtUser }).auth;
      if (password) {
        await logAudit({
          actorId: auth.sub,
          actorEmail: auth.email,
          actorRole: auth.role,
          action: AuditAction.PASSWORD_CHANGED,
          targetType: "User",
          targetId: user.id,
          success: true,
          req,
          meta: { email: updated.email, byAdmin: true },
        });
      }
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.UPDATE_USER,
        targetType: "User",
        targetId: user.id,
        success: true,
        req,
        meta: { email: updated.email },
      });
      res.json({ user: userPublic(updated) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return res.status(400).json({ error: "That email is already in use." });
      throw e;
    }
  }
);

app.delete(
  "/api/admin/users/:id",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("USER_DELETE"),
  async (req, res) => {
    const id = req.params.id;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: "User not found." });

    if (user.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1)
        return res.status(400).json({ error: "Cannot remove the only administrator." });
    }

    const auth = (req as express.Request & { auth: JwtUser }).auth;
    await prisma.$transaction(async (tx) => {
      await tx.staffAssignment.deleteMany({
        where: { OR: [{ staffId: id }, { studentId: id }] },
      });
      await tx.staffBranchScope.deleteMany({ where: { staffId: id } });
      await tx.testAttempt.deleteMany({ where: { userId: id } });
      const fallbackAdmin = await tx.user.findFirst({
        where: { role: Role.ADMIN, id: { not: id } },
      });
      if (fallbackAdmin) {
        await tx.test.updateMany({
          where: { createdById: id },
          data: { createdById: fallbackAdmin.id },
        });
      }
      await tx.user.delete({ where: { id } });
    });

    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: AuditAction.DELETE_USER,
      targetType: "User",
      targetId: id,
      success: true,
      req,
      meta: { email: user.email, role: user.role },
    });

    res.status(204).end();
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole(Role.ADMIN),
  requirePermission("USER_CREATE"),
  async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(req.body?.name ?? "").trim();
    const password = String(req.body?.password ?? "");
    const roleRaw = String(req.body?.role ?? "STUDENT").toUpperCase();
    if (!email || !name || !password) {
      return res.status(400).json({
        error: "Email, name, and password are required.",
      });
    }
    const pErr = validatePasswordStrength(password);
    if (pErr) return res.status(400).json({ error: pErr });
    const role =
      roleRaw === "STAFF" ? Role.STAFF : roleRaw === "ADMIN" ? Role.ADMIN : Role.STUDENT;

    let program: Program | null = null;
    let levelType: LevelType | null = null;
    let level: number | null = null;
    let section: Section | null = null;
    let rollNo: string | null = normalizeRollNo(
      req.body?.rollNo != null ? String(req.body.rollNo) : ""
    );
    if (role === Role.STUDENT || role === Role.STAFF) {
      const programRaw = String(req.body?.program ?? "");
      if (programRaw) program = parseProgram(programRaw);
      levelType = req.body?.levelType
        ? parseLevelType(String(req.body.levelType))
        : null;
      const levelRaw = req.body?.level;
      level =
        levelRaw != null && String(levelRaw) !== "" ? Number(levelRaw) : null;
      section = parseSection(
        req.body?.section != null ? String(req.body.section) : null
      );
      if (role === Role.STUDENT) {
        const err = validateStudentAcademic(program, levelType, level, section);
        if (err) return res.status(400).json({ error: err });
        if (!rollNo) rollNo = inferRollNoFromEmail(email);
      } else if (program && (levelType || level != null)) {
        const err = validateStudentAcademic(program, levelType, level, section);
        if (err) return res.status(400).json({ error: err });
      }
    } else {
      rollNo = null;
    }

    const passwordHash = await hashPassword(password);
    const updateIfExists = req.body?.updateIfExists === true;
    let userId: string;
    let updatedExisting = false;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (existing) {
      if (!updateIfExists) {
        return res.status(400).json({
          error: "That email is already registered.",
          code: "EMAIL_EXISTS",
        });
      }
      if (existing.role !== role) {
        return res.status(400).json({
          error: `That email belongs to a ${existing.role.toLowerCase()} account — role cannot change here.`,
          code: "ROLE_MISMATCH",
        });
      }
      if (role === Role.ADMIN) {
        return res.status(400).json({
          error: "Admin accounts cannot be bulk-updated from Add person.",
        });
      }
      await prisma.user.update({
        where: { email },
        data: {
          name,
          program,
          levelType,
          level,
          section: role === Role.STUDENT || role === Role.STAFF ? section : null,
          rollNo: role === Role.STUDENT ? rollNo : null,
          ...(password ? { passwordHash } : {}),
        },
      });
      userId = existing.id;
      updatedExisting = true;
    } else {
      try {
        const user = await prisma.user.create({
          data: {
            email,
            name,
            role,
            passwordHash,
            program,
            levelType,
            level,
            section: role === Role.STUDENT || role === Role.STAFF ? section : null,
            rollNo: role === Role.STUDENT ? rollNo : null,
          },
        });
        userId = user.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
          return res.status(400).json({
            error: "That email is already registered.",
            code: "EMAIL_EXISTS",
          });
        throw e;
      }
    }

    if (
      role === Role.STAFF &&
      !!req.body?.assignClassAccess &&
      program &&
      levelType &&
      level != null &&
      section
    ) {
      const scopeKey = buildScopeKey(program, levelType, level, section);
      await prisma.staffBranchScope.upsert({
        where: { staffId_scopeKey: { staffId: userId, scopeKey } },
        create: { staffId: userId, program, levelType, level, section, scopeKey },
        update: { section },
      });
      const classStudents = await prisma.user.findMany({
        where: studentBranchWhere(program, levelType, level, section),
        select: { id: true },
      });
      await linkStudentsToStaff(
        userId,
        classStudents.map((s) => s.id)
      );
    }

    const auth = (req as express.Request & { auth: JwtUser }).auth;
    if (
      role === Role.STAFF &&
      !!req.body?.assignClassAccess &&
      program &&
      levelType &&
      level != null &&
      section
    ) {
      await logAudit({
        actorId: auth.sub,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: AuditAction.CLASS_ASSIGNED,
        targetType: "User",
        targetId: userId,
        success: true,
        req,
        meta: { program, levelType, level, section },
      });
    }
    await logAudit({
      actorId: auth.sub,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: updatedExisting ? AuditAction.UPDATE_USER : AuditAction.CREATE_USER,
      targetType: "User",
      targetId: userId,
      success: true,
      req,
      meta: { email, role, updated: updatedExisting },
    });

    res.status(updatedExisting ? 200 : 201).json({
      ok: true,
      id: userId,
      email,
      updated: updatedExisting,
    });
  }
);

const dist = path.join(process.cwd(), "dist");
const indexHtml = path.join(dist, "index.html");
if (fs.existsSync(indexHtml)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(indexHtml);
  });
}

app.use((req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
  res.status(404).type("text").send("Not found");
});

app.use(globalErrorHandler);

export { app };

export async function bootServerSideEffects(): Promise<void> {
  await tuneDatabaseForConcurrency();
  try {
    await ensurePermissionCatalog();
    await ensureDefaultCategories();
    await prisma.collegeSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  } catch (e) {
    console.error("[boot] catalog seed", e);
  }
  startResultsAutoReleaseScheduler();
  startAutoSubmitScheduler();
  console.log(
    "Results show at the exam end time that was set"
  );
  console.log("Expired / closed attempts auto-submit scheduler started");
  let dbReachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbReachable = false;
  }
  logCapacitySummary(buildCapacityReport({ dbReachable }));
}

async function ensureDefaultCategories() {
  /** Full G.P. Pharmacy placement taxonomy (B.Pharm / Pharm.D / M.Pharm). */
  const { PHARMACY_BANK_CATEGORIES } = await import(
    "../shared/pharmacyBankTaxonomy"
  );
  const idByName = new Map<string, string>();
  const parents = PHARMACY_BANK_CATEGORIES.filter((c) => !c.parentName);
  const children = PHARMACY_BANK_CATEGORIES.filter((c) => !!c.parentName);
  for (const row of [...parents, ...children]) {
    const parentId = row.parentName ? idByName.get(row.parentName) ?? null : null;
    const existingParent =
      row.parentName && !parentId
        ? await prisma.questionCategory.findUnique({
            where: { name: row.parentName },
            select: { id: true },
          })
        : null;
    const cat = await prisma.questionCategory.upsert({
      where: { name: row.name },
      create: {
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        parentId: parentId ?? existingParent?.id ?? null,
        active: true,
      },
      update: {
        description: row.description,
        sortOrder: row.sortOrder,
        parentId: parentId ?? existingParent?.id ?? null,
        active: true,
      },
    });
    idByName.set(cat.name, cat.id);
  }
  // Legacy aliases
  for (const name of ["Verbal", "Technical", "Programming", "Communication", "Soft Skills"]) {
    await prisma.questionCategory.upsert({
      where: { name },
      create: { name, sortOrder: 90, active: true },
      update: {},
    });
  }
}

/** Skip listen on Netlify / Vercel Functions / Lambda (they import `app` only). */
const isServerless =
  !!process.env.NETLIFY ||
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!isServerless) {
  app
    .listen(PORT, async () => {
      await bootServerSideEffects();
      console.log(`Server http://127.0.0.1:${PORT}`);
    })
    .on("listening", function (this: import("http").Server) {
      // Survive slow DB under concurrent exam autosaves (~1000 users).
      this.keepAliveTimeout = 65_000;
      this.headersTimeout = 70_000;
      this.requestTimeout = 120_000;
      this.timeout = 120_000;
    });
}
