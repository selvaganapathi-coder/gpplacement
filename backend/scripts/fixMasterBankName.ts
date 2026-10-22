import { PrismaClient } from "@prisma/client";
import {
  isPharmacyMasterBankName,
  PHARMACY_MASTER_BANK_NAME,
} from "../shared/pharmacyBankTaxonomy";

const prisma = new PrismaClient();

async function main() {
  const banks = await prisma.questionBank.findMany({
    select: { id: true, name: true },
  });
  for (const b of banks) {
    if (!isPharmacyMasterBankName(b.name)) continue;
    if (b.name === PHARMACY_MASTER_BANK_NAME) {
      console.log(`OK: ${b.name}`);
      continue;
    }
    await prisma.questionBank.update({
      where: { id: b.id },
      data: { name: PHARMACY_MASTER_BANK_NAME },
    });
    console.log(
      `Renamed: ${JSON.stringify(b.name)} → ${JSON.stringify(PHARMACY_MASTER_BANK_NAME)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
