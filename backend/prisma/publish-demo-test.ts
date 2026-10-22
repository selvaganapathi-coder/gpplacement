import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TITLE = "Demo Aptitude — All Students";

async function main() {
  const author = await prisma.user.findFirst({
    where: { email: "staff@gppharmacy.edu" },
    select: { id: true },
  });
  if (!author) throw new Error("Demo staff not found. Run npm run db:seed first.");

  const existing = await prisma.test.findFirst({ where: { title: DEMO_TITLE } });

  if (existing) {
    await prisma.test.update({
      where: { id: existing.id },
      data: {
        isPublished: true,
        resultsPublished: true,
        resultsPublishedAt: new Date(),
        availableFrom: null,
        availableUntil: null,
        program: null,
        levelType: null,
        level: null,
      },
    });
    console.log(`Published: "${DEMO_TITLE}" (id ${existing.id})`);
    return;
  }

  const test = await prisma.test.create({
    data: {
      title: DEMO_TITLE,
      description:
        "Live demo for every student — login as any student to try submit and view result.",
      durationMin: 15,
      isPublished: true,
      resultsPublished: true,
      resultsPublishedAt: new Date(),
      program: null,
      levelType: null,
      level: null,
      createdById: author.id,
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
            prompt: "Normal saline infusion is primarily:",
            options: {
              create: [
                { text: "Sodium chloride solution", isCorrect: true },
                { text: "Distilled water only", isCorrect: false },
                { text: "Ethanol", isCorrect: false },
                { text: "Glycerin", isCorrect: false },
              ],
            },
          },
          {
            order: 3,
            prompt: "Before dispensing, a pharmacist must verify:",
            options: {
              create: [
                { text: "Only the bill amount", isCorrect: false },
                { text: "Patient, drug, dose, and route", isCorrect: true },
                { text: "Staff roster only", isCorrect: false },
                { text: "Expiry after dispensing", isCorrect: false },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Created and published: "${test.title}" (id ${test.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
