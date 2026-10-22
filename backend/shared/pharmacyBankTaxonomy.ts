/** G.P. Pharmacy College — master placement question-bank taxonomy. */

export type PharmacyCategoryDef = {
  name: string;
  description: string;
  sortOrder: number;
  parentName?: string;
};

export const PHARMACY_BANK_CATEGORIES: PharmacyCategoryDef[] = [
  // Foundation / placement
  {
    name: "Aptitude",
    description: "Quantitative aptitude for campus placements",
    sortOrder: 1,
  },
  {
    name: "Logical Reasoning",
    description: "Series, odd-one-out, coding–decoding, deductions",
    sortOrder: 2,
  },
  {
    name: "Verbal Ability",
    description: "Grammar, vocabulary, voice, and usage",
    sortOrder: 3,
  },
  {
    name: "General Knowledge",
    description: "Pharmacy-relevant GK — WHO, GMP, CDSCO, API",
    sortOrder: 4,
  },

  // B.Pharm track
  {
    name: "B.Pharm",
    description: "Bachelor of Pharmacy subject banks",
    sortOrder: 10,
  },
  {
    name: "B.Pharm — Pharmaceutics",
    description: "Dosage forms, manufacturing, sterilization",
    sortOrder: 11,
    parentName: "B.Pharm",
  },
  {
    name: "B.Pharm — Pharmacology",
    description: "Drug action, receptors, therapeutics basics",
    sortOrder: 12,
    parentName: "B.Pharm",
  },
  {
    name: "B.Pharm — Pharmaceutical Chemistry",
    description: "Functional groups, drug chemistry, analysis basics",
    sortOrder: 13,
    parentName: "B.Pharm",
  },
  {
    name: "B.Pharm — Pharmacognosy",
    description: "Natural products and plant-derived drugs",
    sortOrder: 14,
    parentName: "B.Pharm",
  },
  {
    name: "B.Pharm — Pharmaceutical Analysis",
    description: "Titration, spectroscopy, HPLC, indicators",
    sortOrder: 15,
    parentName: "B.Pharm",
  },
  {
    name: "B.Pharm — QA/QC",
    description: "GMP, QA, QC, SOPs",
    sortOrder: 16,
    parentName: "B.Pharm",
  },

  // Pharm.D track
  {
    name: "Pharm.D",
    description: "Doctor of Pharmacy clinical banks",
    sortOrder: 20,
  },
  {
    name: "Pharm.D — Clinical Pharmacy",
    description: "Clinical pharmacist role, ADR, adherence",
    sortOrder: 21,
    parentName: "Pharm.D",
  },
  {
    name: "Pharm.D — Pharmacotherapeutics",
    description: "Disease-oriented drug therapy",
    sortOrder: 22,
    parentName: "Pharm.D",
  },
  {
    name: "Pharm.D — Hospital Pharmacy",
    description: "Formulary, dispensing, LASA, storage",
    sortOrder: 23,
    parentName: "Pharm.D",
  },
  {
    name: "Pharm.D — Clinical Cases",
    description: "Case-based clinical decision MCQs",
    sortOrder: 24,
    parentName: "Pharm.D",
  },
  {
    name: "Pharm.D — Patient Counselling",
    description: "Counselling skills and communication",
    sortOrder: 25,
    parentName: "Pharm.D",
  },

  // M.Pharm track (specialization nodes are dynamic leaves)
  {
    name: "M.Pharm",
    description: "Master of Pharmacy — specialization & research",
    sortOrder: 30,
  },
  {
    name: "M.Pharm — Pharmaceutics",
    description: "M.Pharm specialization: Pharmaceutics",
    sortOrder: 31,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Pharmacology",
    description: "M.Pharm specialization: Pharmacology",
    sortOrder: 32,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Pharmaceutical Chemistry",
    description: "M.Pharm specialization: Pharmaceutical Chemistry",
    sortOrder: 33,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Pharmacognosy",
    description: "M.Pharm specialization: Pharmacognosy",
    sortOrder: 34,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Pharmaceutical Analysis",
    description: "M.Pharm specialization: Pharmaceutical Analysis",
    sortOrder: 35,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Quality Assurance",
    description: "M.Pharm specialization: Quality Assurance",
    sortOrder: 36,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Industrial Pharmacy",
    description: "M.Pharm specialization: Industrial Pharmacy",
    sortOrder: 37,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Other Specialization",
    description: "Other M.Pharm specializations",
    sortOrder: 38,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Research Methodology",
    description: "Hypothesis, literature review, sampling, ethics",
    sortOrder: 39,
    parentName: "M.Pharm",
  },
  {
    name: "M.Pharm — Advanced Technical",
    description:
      "Case-based, research, data interpretation, instrumentation, regulatory",
    sortOrder: 40,
    parentName: "M.Pharm",
  },

  // Legacy aliases kept active for older imports
  {
    name: "Pharmacy Technical",
    description: "Legacy umbrella — prefer B.Pharm / Pharm.D / M.Pharm categories",
    sortOrder: 50,
  },
  {
    name: "General Placement",
    description: "HR / soft skills / interview readiness",
    sortOrder: 51,
  },
];

/** Canonical master bank title (ASCII hyphen — avoid em-dash encoding issues). */
export const PHARMACY_MASTER_BANK_NAME = "GP Pharmacy - Master Question Bank";

export function isPharmacyMasterBankName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.replace(/[\u2013\u2014]/g, "-").trim().toLowerCase();
  return n === PHARMACY_MASTER_BANK_NAME.toLowerCase();
}
