import { PrismaClient } from "@prisma/client";
import {
  ensureSkillCategories,
  seedDemoStudentSkillScores,
  seedSkillCatalog,
} from "../server/skillsService";

const prisma = new PrismaClient();

async function main() {
  await ensureSkillCategories();
  const catalog = await seedSkillCatalog({ force: process.env.SKILL_SEED_FORCE === "true" });
  console.log(
    `Skill catalog: ${catalog.created} skills created${
      catalog.skipped ? `, ${catalog.skipped} already present` : ""
    }`
  );

  const student = await prisma.user.findFirst({
    where: { email: "student@gppharmacy.edu" },
    select: { id: true },
  });
  if (student) {
    const readiness = await seedDemoStudentSkillScores(student.id);
    console.log(`Demo student readiness seeded: ~${readiness}%`);
  } else {
    console.log("Demo student not found — skip readiness scores (run npm run db:seed first).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
