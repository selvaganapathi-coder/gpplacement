/**
 * Seed sample submitted attempts so Results desk has data to show.
 * Usage: npx tsx prisma/seed-sample-results.ts
 */
import { AttemptStatus, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const SAMPLE_SCORES = [
  { pct: 92, flagged: false },
  { pct: 84, flagged: false },
  { pct: 76, flagged: false },
  { pct: 68, flagged: false },
  { pct: 55, flagged: true },
  { pct: 48, flagged: false },
  { pct: 91, flagged: false },
  { pct: 73, flagged: false },
  { pct: 61, flagged: false },
  { pct: 38, flagged: true },
  { pct: 88, flagged: false },
  { pct: 70, flagged: false },
];

async function ensureDemoTest() {
  const existing = await prisma.test.findFirst({
    where: { title: "Sample Results — Aptitude Demo" },
    include: { _count: { select: { questions: true } } },
  });
  if (existing) return existing;

  const author =
    (await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: Role.STAFF },
      select: { id: true },
    }));
  if (!author) throw new Error("No admin/staff user to own the demo test.");

  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const test = await prisma.test.create({
    data: {
      title: "Sample Results — Aptitude Demo",
      description: "Demo paper with sample submissions for the Results desk.",
      durationMin: 30,
      isPublished: true,
      resultsPublished: false,
      availableFrom: new Date(Date.now() - 2 * 60 * 60 * 1000),
      availableUntil: until,
      program: "BPHARM",
      levelType: "YEAR",
      level: 3,
      assessmentType: "APTITUDE",
      maxScore: 100,
      passPercentage: 50,
      createdById: author.id,
      questions: {
        create: [
          {
            order: 0,
            prompt: "Sample: 2 + 2 = ?",
            marks: 25,
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
            order: 1,
            prompt: "Sample: Which is a solid oral dosage form?",
            marks: 25,
            options: {
              create: [
                { text: "Tablet", isCorrect: true },
                { text: "Syrup", isCorrect: false },
                { text: "IV fluid", isCorrect: false },
                { text: "Nebulizer solution", isCorrect: false },
              ],
            },
          },
          {
            order: 2,
            prompt: "Sample: FIFO means First In, First Out.",
            marks: 25,
            options: {
              create: [
                { text: "True", isCorrect: true },
                { text: "False", isCorrect: false },
                { text: "Only for cold chain", isCorrect: false },
                { text: "Only for Schedule H", isCorrect: false },
              ],
            },
          },
          {
            order: 3,
            prompt: "Sample: Normal saline concentration is approximately:",
            marks: 25,
            options: {
              create: [
                { text: "0.9% NaCl", isCorrect: true },
                { text: "9% NaCl", isCorrect: false },
                { text: "0.09% NaCl", isCorrect: false },
                { text: "90% NaCl", isCorrect: false },
              ],
            },
          },
        ],
      },
    },
    include: { _count: { select: { questions: true } } },
  });
  console.log(`Created demo test: ${test.title}`);
  return test;
}

async function main() {
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, isActive: true },
    select: { id: true, name: true, program: true, level: true },
    take: 40,
    orderBy: { createdAt: "asc" },
  });
  if (students.length === 0) {
    throw new Error("No students in DB. Run npm run db:seed first.");
  }

  let tests = await prisma.test.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      maxScore: true,
      resultsPublished: true,
      program: true,
      level: true,
    },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  if (tests.length === 0) {
    const demo = await ensureDemoTest();
    tests = [
      {
        id: demo.id,
        title: demo.title,
        maxScore: 100,
        resultsPublished: false,
        program: "BPHARM",
        level: 3,
      },
    ];
  } else {
    // Ensure at least one demo paper exists for a clean Results showcase.
    const demo = await ensureDemoTest();
    if (!tests.some((t) => t.id === demo.id)) {
      tests = [
        {
          id: demo.id,
          title: demo.title,
          maxScore: 100,
          resultsPublished: false,
          program: "BPHARM",
          level: 3,
        },
        ...tests.slice(0, 3),
      ];
    }
  }

  let created = 0;
  let skipped = 0;

  for (let ti = 0; ti < tests.length; ti++) {
    const test = tests[ti]!;
    const maxScore = test.maxScore > 0 ? test.maxScore : 100;
    const perTest = Math.min(students.length, SAMPLE_SCORES.length);
    const pick = students.slice(0, perTest);

    // First test stays awaiting release; second is visible; rest alternate.
    const resultsPublished = ti === 0 ? false : ti === 1 ? true : ti % 2 === 1;
    await prisma.test.update({
      where: { id: test.id },
      data: {
        resultsPublished,
        resultsPublishedAt: resultsPublished ? new Date() : null,
        isPublished: true,
      },
    });

    for (let i = 0; i < pick.length; i++) {
      const student = pick[i]!;
      const sample = SAMPLE_SCORES[i % SAMPLE_SCORES.length]!;
      const existing = await prisma.testAttempt.findFirst({
        where: {
          testId: test.id,
          userId: student.id,
          status: AttemptStatus.SUBMITTED,
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const score = Math.round((sample.pct / 100) * maxScore);
      const submittedAt = new Date(Date.now() - (i + 1) * 37 * 60 * 1000);
      await prisma.testAttempt.create({
        data: {
          testId: test.id,
          userId: student.id,
          status: AttemptStatus.SUBMITTED,
          startedAt: new Date(submittedAt.getTime() - 28 * 60 * 1000),
          endedAt: submittedAt,
          submittedAt,
          attemptNumber: 1,
          score,
          percentage: sample.pct,
          proctorFlagged: sample.flagged,
          tabSwitchCount: sample.flagged ? 3 : 0,
          fullscreenExitCount: sample.flagged ? 1 : 0,
        },
      });
      created++;
    }
    console.log(
      `• ${test.title}: ${perTest} sample attempts (${resultsPublished ? "visible" : "needs release"})`
    );
  }

  console.log(`\nDone. Created ${created} attempts, skipped ${skipped} existing.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
