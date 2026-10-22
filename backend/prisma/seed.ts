import { PrismaClient, Role, Program, LevelType } from "@prisma/client";
import {
  buildScopeKey,
  listCohortPresets,
  suggestEmail,
  suggestName,
  type CohortPreset,
  type Section,
} from "../shared/academic";
import {
  APTITUDE_CURRICULUM,
  aptitudeTopicLabel,
} from "../shared/aptitudeCurriculum";
import {
  assertDemoSeedAllowed,
  DEFAULT_SEED_PASSWORD,
  hashPassword,
  seedForcePasswordChange,
} from "../server/password";

const prisma = new PrismaClient();

const PASSWORD_PLAIN = DEFAULT_SEED_PASSWORD;
const FORCE_PASSWORD_CHANGE = seedForcePasswordChange();
const STUDENTS_PER_CLASS = 5;
const STAFF_PER_CLASS = 1;

const EMAIL_DOMAIN = "gppharmacy.edu";
const PHARMACY_PROGRAMS: Program[] = [
  Program.DPHARM,
  Program.BPHARM,
  Program.MPHARM,
  Program.PHARMD,
];

/**
 * G.P. Pharmacy College cohorts only (D.Pharm / B.Pharm / M.Pharm / Pharm.D).
 * Set SEED_FULL_COHORTS=1 to seed every year × section.
 */
const COHORTS =
  process.env.SEED_FULL_COHORTS === "1"
    ? listCohortPresets()
    : listCohortPresets().filter((c) => {
        if (c.section !== "A") return false;
        if (c.level === 1) return true;
        // Extra year samples for longer programs
        if (c.level === 2 && (c.program === "DPHARM" || c.program === "BPHARM"))
          return true;
        if (c.level === 3 && c.program === "BPHARM") return true;
        if (c.level === 4 && c.program === "PHARMD") return true;
        return false;
      });

async function ensureCollegeSettings() {
  await prisma.collegeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      name: "G.P. Pharmacy College",
      shortName: "GP Pharmacy",
      tagline: "The Future of Pharmacy",
      emailDomain: EMAIL_DOMAIN,
    },
    update: {
      name: "G.P. Pharmacy College",
      shortName: "GP Pharmacy",
      tagline: "The Future of Pharmacy",
      emailDomain: EMAIL_DOMAIN,
    },
  });
}

/** Reset staff/students so the directory matches a fresh GP Pharmacy seed. */
async function purgeLegacyAccounts(keepAdminId: string) {
  const legacy = await prisma.user.findMany({
    where: {
      id: { not: keepAdminId },
      OR: [
        { email: { endsWith: "@college.edu" } },
        { role: { in: [Role.STUDENT, Role.STAFF, Role.FACULTY] } },
        {
          role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
          email: { not: `admin@${EMAIL_DOMAIN}` },
        },
      ],
    },
    select: { id: true },
  });
  const ids = legacy.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.test.updateMany({
    where: { createdById: { in: ids } },
    data: { createdById: keepAdminId },
  });
  await prisma.questionBank.updateMany({
    where: { createdById: { in: ids } },
    data: { createdById: keepAdminId },
  });
  await prisma.bankQuestion.updateMany({
    where: { createdById: { in: ids } },
    data: { createdById: keepAdminId },
  });
  // TestAttempt has no onDelete cascade — remove attempts before users.
  await prisma.testAttempt.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} accounts before pharmacy reseed.`);
}

const QUESTIONS_PER_SAMPLE_TEST = 10;
const SAMPLE_TEST_COUNT = 30;

function curriculumTopicAt(index: number): string {
  const flat = APTITUDE_CURRICULUM.flatMap((m) =>
    m.topics.map((t) => aptitudeTopicLabel(m.label, t.label))
  );
  return flat[index % flat.length]!;
}

function buildCohortQuestions(cohort: CohortPreset, set: number) {
  return Array.from({ length: QUESTIONS_PER_SAMPLE_TEST }, (_, i) => {
    const n = i + 1;
    const correct = (n + set) % 4;
    const topic = curriculumTopicAt(i + set * 3);
    return {
      order: n,
      prompt: `${cohort.label} (Set ${set}) Q${n}: Best practice related to “${topic}” is to:`,
      topic,
      difficulty: n <= 3 ? "EASY" : n <= 7 ? "MEDIUM" : "HARD",
      options: {
        create: [
          { text: "Skip documentation if busy", isCorrect: correct === 0 },
          { text: "Follow SOP and verify twice", isCorrect: correct === 1 },
          { text: "Guess when unsure", isCorrect: correct === 2 },
          { text: "Ignore batch/expiry", isCorrect: correct === 3 },
        ],
      },
    };
  });
}

async function seedSampleClassTests(authorId: string) {
  let created = 0;
  let skipped = 0;
  for (const cohort of COHORTS) {
    if (created >= SAMPLE_TEST_COUNT) break;
    const title = `${cohort.label} Placement Aptitude`;
    const exists = await prisma.test.findFirst({ where: { title } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.test.create({
      data: {
        title,
        description: `Sample placement test for ${cohort.label} (${QUESTIONS_PER_SAMPLE_TEST} MCQs).`,
        durationMin: 30,
        isPublished: false,
        program: cohort.program as Program,
        levelType: LevelType.YEAR,
        level: cohort.level,
        section: cohort.section,
        createdById: authorId,
        questions: { create: buildCohortQuestions(cohort, 1) },
      },
    });
    created++;
  }
  console.log(
    `Sample tests: ${created} created, ${skipped} already existed (cap ${SAMPLE_TEST_COUNT}).`
  );
}

const DEMO_ALL_STUDENTS_TITLE = "Demo Aptitude — All Students";

async function ensurePublishedDemoForAllStudents(authorId: string) {
  const existing = await prisma.test.findFirst({
    where: { title: DEMO_ALL_STUDENTS_TITLE },
  });
  if (existing) {
    await prisma.test.update({
      where: { id: existing.id },
      data: {
        isPublished: true,
        availableFrom: null,
        availableUntil: null,
        program: null,
        levelType: null,
        level: null,
        section: null,
      },
    });
    console.log(`Published demo for all students: "${DEMO_ALL_STUDENTS_TITLE}"`);
    return;
  }

  await prisma.test.create({
    data: {
      title: DEMO_ALL_STUDENTS_TITLE,
      description: "Live demo — every student can take this test after login.",
      durationMin: 15,
      isPublished: true,
      program: null,
      levelType: null,
      level: null,
      section: null,
      createdById: authorId,
      questions: {
        create: [
          {
            order: 1,
            prompt: "If 2 tablets contain 500 mg API each, the total API is:",
            options: {
              create: [
                { text: "500 mg", isCorrect: false },
                { text: "1000 mg", isCorrect: true },
                { text: "250 mg", isCorrect: false },
                { text: "1500 mg", isCorrect: false },
              ],
            },
          },
          {
            order: 2,
            prompt: "Normal saline is primarily:",
            options: {
              create: [
                { text: "NaCl solution", isCorrect: true },
                { text: "Distilled water only", isCorrect: false },
                { text: "Ethanol", isCorrect: false },
                { text: "Glycerin", isCorrect: false },
              ],
            },
          },
          {
            order: 3,
            prompt: "Before dispensing, verify:",
            options: {
              create: [
                { text: "Only price", isCorrect: false },
                { text: "Patient, drug, dose, route", isCorrect: true },
                { text: "Uniform colour", isCorrect: false },
                { text: "Batch after expiry", isCorrect: false },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(`Created published demo for all students: "${DEMO_ALL_STUDENTS_TITLE}"`);
}

async function main() {
  assertDemoSeedAllowed("db:seed");
  const passwordHash = await hashPassword(PASSWORD_PLAIN);
  if (FORCE_PASSWORD_CHANGE) {
    console.log("SEED_FORCE_PASSWORD_CHANGE: seeded users must change password on first login.");
  }
  if (process.env.NODE_ENV === "production") {
    console.log(
      "Production seed: ALLOW_DEMO_SEED=true. Demo password login is blocked unless ALLOW_DEMO_SEED_PASSWORD=true (trial only)."
    );
  }

  await ensureCollegeSettings();

  const admin = await prisma.user.upsert({
    where: { email: `admin@${EMAIL_DOMAIN}` },
    update: {
      passwordHash,
      name: "G.P. Pharmacy Admin",
      mustChangePassword: FORCE_PASSWORD_CHANGE,
    },
    create: {
      email: `admin@${EMAIL_DOMAIN}`,
      name: "G.P. Pharmacy Admin",
      role: Role.ADMIN,
      passwordHash,
      mustChangePassword: FORCE_PASSWORD_CHANGE,
    },
  });

  await purgeLegacyAccounts(admin.id);

  let totalStaff = 0;
  let totalStudents = 0;
  let firstStaffId: string | null = null;

  for (const cohort of COHORTS) {
    const sk = buildScopeKey(
      cohort.program,
      cohort.levelType,
      cohort.level,
      cohort.section
    );

    const staffIds: string[] = [];
    for (let i = 1; i <= STAFF_PER_CLASS; i++) {
      const email = suggestEmail("STAFF", cohort, i);
      const staff = await prisma.user.upsert({
        where: { email },
        update: {
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
          passwordHash,
          mustChangePassword: FORCE_PASSWORD_CHANGE,
        },
        create: {
          email,
          name: suggestName("STAFF", cohort, i),
          role: Role.STAFF,
          passwordHash,
          mustChangePassword: FORCE_PASSWORD_CHANGE,
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
        },
      });
      staffIds.push(staff.id);
      if (!firstStaffId) firstStaffId = staff.id;
      totalStaff++;

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
    }

    for (let n = 1; n <= STUDENTS_PER_CLASS; n++) {
      const email = suggestEmail("STUDENT", cohort, n);
      const student = await prisma.user.upsert({
        where: { email },
        update: {
          program: cohort.program as Program,
          levelType: LevelType.YEAR,
          level: cohort.level,
          section: cohort.section,
          rollNo: String(n).padStart(2, "0"),
          passwordHash,
          mustChangePassword: FORCE_PASSWORD_CHANGE,
        },
        create: {
          email,
          name: suggestName("STUDENT", cohort, n),
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
      totalStudents++;

      const staffId = staffIds[(n - 1) % STAFF_PER_CLASS];
      if (staffId) {
        await prisma.staffAssignment.upsert({
          where: { staffId_studentId: { staffId, studentId: student.id } },
          update: {},
          create: { staffId, studentId: student.id },
        });
      }
    }
  }

  const deptStaffSpecs: {
    email: string;
    name: string;
    program: Program;
  }[] = [
    {
      email: `staff.dpharm@${EMAIL_DOMAIN}`,
      name: "D.Pharm Staff (all years)",
      program: Program.DPHARM,
    },
    {
      email: `staff.bpharm@${EMAIL_DOMAIN}`,
      name: "B.Pharm Staff (all years)",
      program: Program.BPHARM,
    },
    {
      email: `staff.mpharm@${EMAIL_DOMAIN}`,
      name: "M.Pharm Staff (all years)",
      program: Program.MPHARM,
    },
    {
      email: `staff.pharmd@${EMAIL_DOMAIN}`,
      name: "Pharm.D Staff (all years)",
      program: Program.PHARMD,
    },
    {
      email: `staff@${EMAIL_DOMAIN}`,
      name: "Demo Staff (D.Pharm all years)",
      program: Program.DPHARM,
    },
  ];

  for (const spec of deptStaffSpecs) {
    const staff = await prisma.user.upsert({
      where: { email: spec.email },
      update: {
        name: spec.name,
        program: spec.program,
        levelType: null,
        level: null,
        section: null,
        role: Role.STAFF,
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
      },
      create: {
        email: spec.email,
        name: spec.name,
        role: Role.STAFF,
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
        program: spec.program,
      },
    });

    await prisma.staffBranchScope.deleteMany({ where: { staffId: staff.id } });
    const scopeKey = buildScopeKey(spec.program);
    await prisma.staffBranchScope.create({
      data: {
        staffId: staff.id,
        program: spec.program,
        levelType: null,
        level: null,
        section: null,
        scopeKey,
      },
    });
  }

  const deptStudentSpecs: {
    email: string;
    name: string;
    program: Program;
    level: number;
    section: Section;
  }[] = [
    {
      email: `student.dpharm@${EMAIL_DOMAIN}`,
      name: "Demo Student (D.Pharm Year 1 Sec A)",
      program: Program.DPHARM,
      level: 1,
      section: "A",
    },
    {
      email: `student.bpharm@${EMAIL_DOMAIN}`,
      name: "Demo Student (B.Pharm Year 2 Sec A)",
      program: Program.BPHARM,
      level: 2,
      section: "A",
    },
    {
      email: `student.mpharm@${EMAIL_DOMAIN}`,
      name: "Demo Student (M.Pharm Year 1 Sec A)",
      program: Program.MPHARM,
      level: 1,
      section: "A",
    },
    {
      email: `student.pharmd@${EMAIL_DOMAIN}`,
      name: "Demo Student (Pharm.D Year 1 Sec A)",
      program: Program.PHARMD,
      level: 1,
      section: "A",
    },
    {
      email: `student@${EMAIL_DOMAIN}`,
      name: "Demo Student (B.Pharm Year 2 Sec A)",
      program: Program.BPHARM,
      level: 2,
      section: "A",
    },
  ];

  for (const spec of deptStudentSpecs) {
    await prisma.user.upsert({
      where: { email: spec.email },
      update: {
        name: spec.name,
        program: spec.program,
        levelType: LevelType.YEAR,
        level: spec.level,
        section: spec.section,
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
        rollNo: "01",
      },
      create: {
        email: spec.email,
        name: spec.name,
        role: Role.STUDENT,
        passwordHash,
        mustChangePassword: FORCE_PASSWORD_CHANGE,
        program: spec.program,
        levelType: LevelType.YEAR,
        level: spec.level,
        section: spec.section,
        rollNo: "01",
      },
    });
  }

  const demoStaff = await prisma.user.findUniqueOrThrow({
    where: { email: `staff@${EMAIL_DOMAIN}` },
  });
  const testAuthorId = firstStaffId ?? demoStaff.id;
  await seedSampleClassTests(testAuthorId);
  await ensurePublishedDemoForAllStudents(demoStaff.id);

  try {
    const {
      ensureSkillCategories,
      seedSkillCatalog,
      seedDemoStudentSkillScores,
    } = await import("../server/skillsService");
    await ensureSkillCategories();
    const cat = await seedSkillCatalog();
    console.log(
      `Skill Master: ${cat.created} skills seeded${cat.skipped ? ` (${cat.skipped} already existed)` : ""}`
    );
    const demoStudent = await prisma.user.findUnique({
      where: { email: `student@${EMAIL_DOMAIN}` },
      select: { id: true },
    });
    if (demoStudent) {
      const readiness = await seedDemoStudentSkillScores(demoStudent.id);
      console.log(`Demo student career readiness ~${readiness}%`);
    }
  } catch (e) {
    console.warn("Skill Master seed skipped:", e);
  }

  console.log("Seed complete — G.P. Pharmacy College");
  console.log("Password for all accounts:", PASSWORD_PLAIN);
  console.log("");
  console.log("Admin:", admin.email);
  console.log("");
  console.log("Quick demos:");
  console.log(`  staff@${EMAIL_DOMAIN}`);
  console.log(`  student@${EMAIL_DOMAIN}`);
  console.log("");
  console.log(
    `Classes: ${COHORTS.length}${
      process.env.SEED_FULL_COHORTS === "1"
        ? " (full presets)"
        : " (lean pharmacy sample — set SEED_FULL_COHORTS=1 for all)"
    }`
  );
  console.log(
    `Students: ${totalStudents} (${STUDENTS_PER_CLASS} per class)`
  );
  console.log(
    `Class staff: ${totalStaff} (${STAFF_PER_CLASS} per class) + dept demos`
  );
  console.log("");
  console.log("Courses: D.Pharm · B.Pharm · M.Pharm · Pharm.D");
  console.log("Email pattern:");
  console.log(`  Staff:   staff.<course>.y<year>.<a|b>.<n>@${EMAIL_DOMAIN}`);
  console.log(`  Student: student.<course>.y<year>.<a|b>.<nn>@${EMAIL_DOMAIN}`);
  console.log("");
  console.log("Examples:");
  console.log(`  staff.bpharm.y1.a.1@${EMAIL_DOMAIN}`);
  console.log(`  student.dpharm.y1.a.01@${EMAIL_DOMAIN}`);
  console.log(`  student.pharmd.y1.a.01@${EMAIL_DOMAIN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
