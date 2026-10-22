import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TITLE = "Sample Aptitude — All Classes";

type Q = {
  prompt: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
};

const QUESTIONS: Q[] = [
  {
    prompt: "A pharmacist should always verify which of the following before dispensing?",
    options: [
      "Patient identity, drug, dose, and route",
      "Only the selling price",
      "Staff lunch schedule",
      "Store lighting only",
    ],
    correct: 0,
  },
  {
    prompt: "If each tablet contains 250 mg API and the prescription is 1 g, how many tablets are needed?",
    options: ["2", "4", "8", "10"],
    correct: 1,
  },
  {
    prompt: "Normal saline (0.9% NaCl) is mainly used as:",
    options: [
      "An intravenous fluid / diluent",
      "A solid oral tablet base",
      "An antibiotic",
      "A vaccine adjuvant only",
    ],
    correct: 0,
  },
  {
    prompt: "Expired medicines in the pharmacy should be:",
    options: [
      "Dispensed at a discount",
      "Segregated and disposed per SOP",
      "Mixed with new stock",
      "Ignored if packaging looks fine",
    ],
    correct: 1,
  },
  {
    prompt: "Good documentation practice means you should:",
    options: [
      "Skip notes when busy",
      "Record accurately, clearly, and on time",
      "Use pencil only so errors can be erased",
      "Copy another student’s answers",
    ],
    correct: 1,
  },
  {
    prompt: "FIFO in pharmacy inventory usually means:",
    options: [
      "First In, First Out",
      "Fast In, Fast Out",
      "Fill In For Orders",
      "Final Inventory For Outlet",
    ],
    correct: 0,
  },
  {
    prompt: "Which is the safest response if a prescription is unclear?",
    options: [
      "Guess the dose from similar prescriptions",
      "Clarify with the prescriber before dispensing",
      "Ask another patient what they usually take",
      "Dispense half the quantity and wait",
    ],
    correct: 1,
  },
  {
    prompt: "Hand hygiene before compounding is important mainly to:",
    options: [
      "Reduce contamination risk",
      "Improve tablet color",
      "Speed up billing",
      "Change drug chemistry",
    ],
    correct: 0,
  },
  {
    prompt: "A Schedule H drug in India typically requires:",
    options: [
      "No documentation",
      "A valid prescription for sale",
      "Sale only online",
      "Sale only to staff",
    ],
    correct: 1,
  },
  {
    prompt: "Cold-chain medicines should generally be stored:",
    options: [
      "At uncontrolled room temperature",
      "In direct sunlight",
      "Within the labeled refrigerated range",
      "In the freezer always",
    ],
    correct: 2,
  },
  {
    prompt: "If 5 mL syrup contains 125 mg drug, how much drug is in 10 mL?",
    options: ["125 mg", "200 mg", "250 mg", "500 mg"],
    correct: 2,
  },
  {
    prompt: "Patient counseling after dispensing should preferably include:",
    options: [
      "Dose, timing, and key precautions",
      "Only the MRP",
      "Store staff birthdays",
      "Competitor brands only",
    ],
    correct: 0,
  },
  {
    prompt: "A near-miss medication error should be:",
    options: [
      "Hidden to avoid blame",
      "Reported and reviewed to prevent recurrence",
      "Ignored if the patient was unharmed",
      "Shared only on social media",
    ],
    correct: 1,
  },
  {
    prompt: "Which label detail is essential on a dispensed medicine?",
    options: [
      "Patient name and directions for use",
      "Staff favorite color",
      "Competitor pricing",
      "Random batch jokes",
    ],
    correct: 0,
  },
  {
    prompt: "PPE during cytotoxic handling is mainly for:",
    options: [
      "Fashion",
      "Protecting staff and reducing exposure",
      "Making bottles look premium",
      "Speeding inventory counts",
    ],
    correct: 1,
  },
  {
    prompt: "1 gram equals how many milligrams?",
    options: ["10 mg", "100 mg", "1000 mg", "10,000 mg"],
    correct: 2,
  },
  {
    prompt: "Before mixing two injectables, a pharmacist should check:",
    options: [
      "Compatibility and stability information",
      "Only the bottle color",
      "Whether the patient likes the brand",
      "Social media reviews",
    ],
    correct: 0,
  },
  {
    prompt: "Controlled substances records must be:",
    options: [
      "Optional",
      "Accurate, complete, and auditable",
      "Deleted weekly",
      "Stored only in memory",
    ],
    correct: 1,
  },
  {
    prompt: "If a patient reports a severe allergic reaction after a new medicine, you should:",
    options: [
      "Tell them to ignore it",
      "Advise urgent medical care and document/report as required",
      "Double the next dose",
      "Switch brands without assessment",
    ],
    correct: 1,
  },
  {
    prompt: "Which practice best supports medication safety?",
    options: [
      "Independent double-check for high-risk medicines",
      "Skipping labels to save time",
      "Storing look-alike drugs together tightly",
      "Using abbreviations that no one understands",
    ],
    correct: 0,
  },
  {
    prompt: "A prescription written for “OD” usually means:",
    options: ["Once daily", "Every other day", "Only daytime", "Over dose"],
    correct: 0,
  },
  {
    prompt: "Stock that is short-dated should be:",
    options: [
      "Hidden at the back forever",
      "Prioritized for use / monitoring per policy",
      "Sold after expiry if sealed",
      "Thrown without recording",
    ],
    correct: 1,
  },
  {
    prompt: "Which is a key part of Good Pharmacy Practice?",
    options: [
      "Patient-centered, ethical, evidence-based care",
      "Maximizing sales of unnecessary items only",
      "Avoiding all counseling",
      "Ignoring storage conditions",
    ],
    correct: 0,
  },
  {
    prompt: "If two drugs look similar (LASA), you should:",
    options: [
      "Store them with clear separation and alerts",
      "Keep them in the same bin for convenience",
      "Remove all labels",
      "Ask patients to choose randomly",
    ],
    correct: 0,
  },
  {
    prompt: "Aseptic technique is most relevant when preparing:",
    options: [
      "Sterile injectables / IV admixtures",
      "Cardboard packaging",
      "Shelf labels",
      "Billing receipts",
    ],
    correct: 0,
  },
  {
    prompt: "Which unit is commonly used for liquid medicine volume?",
    options: ["Millilitre (mL)", "Kilogram only", "Celsius", "Volt"],
    correct: 0,
  },
  {
    prompt: "If the prescribed dose seems unusually high, the pharmacist should:",
    options: [
      "Dispense anyway without checking",
      "Verify with the prescriber before dispensing",
      "Reduce it secretly",
      "Replace with a different drug silently",
    ],
    correct: 1,
  },
  {
    prompt: "Batch number and expiry date help mainly to:",
    options: [
      "Trace and recall products when needed",
      "Decorate the shelf",
      "Calculate staff salary",
      "Choose wall paint",
    ],
    correct: 0,
  },
  {
    prompt: "Patient confidentiality means pharmacy staff should:",
    options: [
      "Share health details publicly",
      "Protect patient information and discuss only as needed for care",
      "Post prescriptions online",
      "Leave records on the counter overnight",
    ],
    correct: 1,
  },
  {
    prompt: "Which action best shows professional ethics in placement aptitude?",
    options: [
      "Honesty, patient safety first, and following SOPs",
      "Copying answers in exams",
      "Falsifying attendance",
      "Ignoring safety to finish faster",
    ],
    correct: 0,
  },
];

function questionCreates() {
  return QUESTIONS.map((q, i) => ({
    order: i + 1,
    prompt: q.prompt,
    difficulty: i < 10 ? "EASY" : i < 20 ? "MEDIUM" : "HARD",
    options: {
      create: q.options.map((text, oi) => ({
        text,
        isCorrect: oi === q.correct,
      })),
    },
  }));
}

async function main() {
  const author = await prisma.user.findFirst({
    where: { email: { in: ["staff@gppharmacy.edu", "admin@gppharmacy.edu"] } },
    orderBy: { role: "asc" },
    select: { id: true, email: true },
  });
  if (!author) throw new Error("No staff/admin found. Run npm run db:seed first.");

  const existing = await prisma.test.findFirst({
    where: { title: TITLE },
    select: { id: true },
  });

  if (existing) {
    await prisma.testAttempt.deleteMany({ where: { testId: existing.id } });
    await prisma.question.deleteMany({ where: { testId: existing.id } });
    await prisma.test.update({
      where: { id: existing.id },
      data: {
        isPublished: true,
        resultsPublished: false,
        resultsPublishedAt: null,
        availableFrom: null,
        availableUntil: null,
        program: null,
        levelType: null,
        level: null,
        allowRetake: true,
        durationMin: 45,
        description:
          "Sample placement aptitude (30 MCQs) open to every student — all programs and levels.",
        questions: { create: questionCreates() },
      },
    });
    console.log(`Updated "${TITLE}" with ${QUESTIONS.length} questions (id ${existing.id})`);
    return;
  }

  const test = await prisma.test.create({
    data: {
      title: TITLE,
      description:
        "Sample placement aptitude (30 MCQs) open to every student — all programs and levels.",
      durationMin: 45,
      isPublished: true,
      resultsPublished: false,
      allowRetake: true,
      program: null,
      levelType: null,
      level: null,
      createdById: author.id,
      questions: { create: questionCreates() },
    },
  });

  console.log(`Created "${test.title}" with ${QUESTIONS.length} questions (id ${test.id})`);
  console.log(`Author: ${author.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
