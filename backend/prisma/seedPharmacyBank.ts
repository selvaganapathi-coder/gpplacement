/**
 * Seed GP Pharmacy — Master Question Bank + full category taxonomy.
 *
 *   cd backend && npm run db:seed-pharmacy-bank
 */
import { PrismaClient, QuestionItemStatus, Role } from "@prisma/client";
import {
  PHARMACY_BANK_CATEGORIES,
  isPharmacyMasterBankName,
  PHARMACY_MASTER_BANK_NAME,
} from "../shared/pharmacyBankTaxonomy";
import { PHARMACY_BANK_QUESTIONS } from "./pharmacyBankQuestions";

const prisma = new PrismaClient();

export async function ensurePharmacyCategories(): Promise<Map<string, string>> {
  const idByName = new Map<string, string>();

  // Parents first (no parentName), then children
  const parents = PHARMACY_BANK_CATEGORIES.filter((c) => !c.parentName);
  const children = PHARMACY_BANK_CATEGORIES.filter((c) => !!c.parentName);

  for (const row of [...parents, ...children]) {
    const parentId = row.parentName
      ? idByName.get(row.parentName) ??
        (
          await prisma.questionCategory.findUnique({
            where: { name: row.parentName },
            select: { id: true },
          })
        )?.id ??
        null
      : null;

    const cat = await prisma.questionCategory.upsert({
      where: { name: row.name },
      create: {
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        parentId,
        active: true,
      },
      update: {
        description: row.description,
        sortOrder: row.sortOrder,
        parentId,
        active: true,
      },
    });
    idByName.set(cat.name, cat.id);
  }

  // Alias: keep legacy "Verbal" pointing users to Verbal Ability content
  await prisma.questionCategory.upsert({
    where: { name: "Verbal" },
    create: {
      name: "Verbal",
      description: "Legacy alias of Verbal Ability",
      sortOrder: 3,
      active: true,
    },
    update: { description: "Legacy alias of Verbal Ability", active: true },
  });

  return idByName;
}

async function main() {
  console.log("Ensuring pharmacy category taxonomy…");
  const idByName = await ensurePharmacyCategories();

  const admin =
    (await prisma.user.findFirst({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    })) ??
    (await prisma.user.findFirst({
      where: { role: Role.STAFF },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    }));

  if (!admin) {
    throw new Error(
      "No ADMIN/STAFF user found. Run the main seed first (npm run db:seed)."
    );
  }

  const existingBanks = await prisma.questionBank.findMany({
    take: 50,
    orderBy: { updatedAt: "desc" },
  });
  let bank =
    existingBanks.find((b) => isPharmacyMasterBankName(b.name)) ?? null;
  if (bank && bank.name !== PHARMACY_MASTER_BANK_NAME) {
    bank = await prisma.questionBank.update({
      where: { id: bank.id },
      data: { name: PHARMACY_MASTER_BANK_NAME },
    });
    console.log(`Renamed master bank → ${bank.name}`);
  }
  if (!bank) {
    bank = await prisma.questionBank.create({
      data: {
        name: PHARMACY_MASTER_BANK_NAME,
        description:
          "Main G.P. Pharmacy placement bank — Aptitude, Reasoning, Verbal, GK, B.Pharm, Pharm.D, M.Pharm tracks.",
        status: "ACTIVE",
        createdById: admin.id,
      },
    });
    console.log(`Created bank: ${bank.name}`);
  } else {
    console.log(`Using existing bank: ${bank.name}`);
  }

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const q of PHARMACY_BANK_QUESTIONS) {
    const categoryId = idByName.get(q.category) ?? null;
    if (!categoryId) {
      console.warn(`Missing category: ${q.category}`);
    }

    const existing = await prisma.bankQuestion.findFirst({
      where: { bankId: bank.id, prompt: q.prompt },
      include: { options: true },
    });

    if (existing) {
      await prisma.bankQuestion.update({
        where: { id: existing.id },
        data: {
          categoryId,
          subCategory: q.topic,
          difficulty: q.difficulty ?? "EASY",
          marks: q.marks ?? 1,
          explanation: q.explanation ?? null,
          tags: q.tags ?? null,
          status: QuestionItemStatus.ACTIVE,
        },
      });
      // Refresh options if count mismatch
      if (existing.options.length !== q.options.length) {
        await prisma.bankOption.deleteMany({ where: { questionId: existing.id } });
        await prisma.bankOption.createMany({
          data: q.options.map((text, i) => ({
            questionId: existing.id,
            text,
            isCorrect: i === q.correctIndex,
          })),
        });
      } else {
        for (let i = 0; i < q.options.length; i++) {
          const opt = existing.options[i];
          if (!opt) continue;
          await prisma.bankOption.update({
            where: { id: opt.id },
            data: {
              text: q.options[i]!,
              isCorrect: i === q.correctIndex,
            },
          });
        }
      }
      updated += 1;
      continue;
    }

    await prisma.bankQuestion.create({
      data: {
        bankId: bank.id,
        prompt: q.prompt,
        categoryId,
        subCategory: q.topic,
        difficulty: q.difficulty ?? "EASY",
        marks: q.marks ?? 1,
        explanation: q.explanation ?? null,
        tags: q.tags ?? null,
        status: QuestionItemStatus.ACTIVE,
        createdById: admin.id,
        options: {
          create: q.options.map((text, i) => ({
            text,
            isCorrect: i === q.correctIndex,
          })),
        },
      },
    });
    created += 1;
  }

  const total = await prisma.bankQuestion.count({ where: { bankId: bank.id } });
  console.log(
    `Done. created=${created} updated=${updated} skipped=${skipped} bankTotal=${total}`
  );
  console.log(`Categories: ${idByName.size}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
