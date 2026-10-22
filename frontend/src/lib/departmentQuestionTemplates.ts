import * as XLSX from "xlsx";

export type DepartmentTemplateId = "DPHARM" | "BPHARM" | "MPHARM" | "PHARMD";

type TemplateRow = {
  Question: string;
  "Option A": string;
  "Option B": string;
  "Option C": string;
  "Option D": string;
  Correct: "A" | "B" | "C" | "D";
  Category: string;
  Difficulty: "EASY" | "MEDIUM" | "HARD";
  Tags: string;
};

export type DepartmentQuestionTemplate = {
  id: DepartmentTemplateId;
  label: string;
  fileName: string;
  rows: TemplateRow[];
};

/** Sample papers using the categories already in the college bank. */
export const DEPARTMENT_QUESTION_TEMPLATES: DepartmentQuestionTemplate[] = [
  {
    id: "DPHARM",
    label: "D.Pharm",
    fileName: "dpharm-questions-template.xlsx",
    rows: [
      {
        Question: "A strip of 10 tablets costs Rs 50. The price of 1 tablet is:",
        "Option A": "Rs 2",
        "Option B": "Rs 5",
        "Option C": "Rs 10",
        "Option D": "Rs 15",
        Correct: "B",
        Category: "Aptitude",
        Difficulty: "EASY",
        Tags: "arithmetic, price",
      },
      {
        Question: "Which number does not belong: 3, 6, 9, 12, 16?",
        "Option A": "3",
        "Option B": "9",
        "Option C": "12",
        "Option D": "16",
        Correct: "D",
        Category: "Logical Reasoning",
        Difficulty: "EASY",
        Tags: "series",
      },
      {
        Question: "In India, drug approvals are regulated by:",
        "Option A": "CDSCO",
        "Option B": "UGC",
        "Option C": "NCERT",
        "Option D": "RBI",
        Correct: "A",
        Category: "General Knowledge",
        Difficulty: "EASY",
        Tags: "cdsco, regulatory",
      },
    ],
  },
  {
    id: "BPHARM",
    label: "B.Pharm",
    fileName: "bpharm-questions-template.xlsx",
    rows: [
      {
        Question: "Which dosage form is typically sterile?",
        "Option A": "Tablet",
        "Option B": "Capsule",
        "Option C": "Injectable solution",
        "Option D": "Syrup",
        Correct: "C",
        Category: "B.Pharm — Pharmaceutics",
        Difficulty: "EASY",
        Tags: "dosage, sterile",
      },
      {
        Question: "A drug that binds a receptor and produces a response is an:",
        "Option A": "Agonist",
        "Option B": "Antagonist",
        "Option C": "Excipient",
        "Option D": "Preservative",
        Correct: "A",
        Category: "B.Pharm — Pharmacology",
        Difficulty: "EASY",
        Tags: "receptor, agonist",
      },
      {
        Question: "Good Manufacturing Practice is mainly about:",
        "Option A": "Advertising a brand",
        "Option B": "Consistent quality during manufacture",
        "Option C": "Setting the retail price",
        "Option D": "Choosing a shop name",
        Correct: "B",
        Category: "B.Pharm — QA/QC",
        Difficulty: "EASY",
        Tags: "gmp, quality",
      },
    ],
  },
  {
    id: "MPHARM",
    label: "M.Pharm",
    fileName: "mpharm-questions-template.xlsx",
    rows: [
      {
        Question: "A research hypothesis is best described as:",
        "Option A": "A guess with no link to the question",
        "Option B": "A testable statement about the study question",
        "Option C": "The list of references",
        "Option D": "The consent form title",
        Correct: "B",
        Category: "M.Pharm — Research Methodology",
        Difficulty: "MEDIUM",
        Tags: "hypothesis, research",
      },
      {
        Question: "A sustained-release tablet is designed to:",
        "Option A": "Release the drug over a longer time",
        "Option B": "Dissolve only in the mouth",
        "Option C": "Be injected",
        "Option D": "Replace the need for a label",
        Correct: "A",
        Category: "M.Pharm — Pharmaceutics",
        Difficulty: "MEDIUM",
        Tags: "sustained-release",
      },
      {
        Question: "A validation protocol in quality assurance mainly shows:",
        "Option A": "How a process will be proved fit for use",
        "Option B": "The student's roll number",
        "Option C": "The shop closing time",
        "Option D": "A marketing slogan",
        Correct: "A",
        Category: "M.Pharm — Quality Assurance",
        Difficulty: "MEDIUM",
        Tags: "validation, qa",
      },
    ],
  },
  {
    id: "PHARMD",
    label: "Pharm.D",
    fileName: "pharmd-questions-template.xlsx",
    rows: [
      {
        Question: "An adverse drug reaction is:",
        "Option A": "A harmful response to a medicine at a normal dose",
        "Option B": "The brand name on the pack",
        "Option C": "The expiry date",
        "Option D": "The batch number only",
        Correct: "A",
        Category: "Pharm.D — Clinical Pharmacy",
        Difficulty: "EASY",
        Tags: "adr, clinical",
      },
      {
        Question: "Pharmacotherapeutics is mainly the study of:",
        "Option A": "Using medicines to treat a disease",
        "Option B": "Shop interior design",
        "Option C": "Tablet colour only",
        "Option D": "Hospital parking",
        Correct: "A",
        Category: "Pharm.D — Pharmacotherapeutics",
        Difficulty: "EASY",
        Tags: "therapy",
      },
      {
        Question: "A hospital formulary is:",
        "Option A": "The list of medicines approved for use in that hospital",
        "Option B": "The visitor register",
        "Option C": "The canteen menu",
        "Option D": "The duty roster",
        Correct: "A",
        Category: "Pharm.D — Hospital Pharmacy",
        Difficulty: "EASY",
        Tags: "formulary, hospital",
      },
    ],
  },
];

export function downloadDepartmentQuestionTemplate(id: DepartmentTemplateId): void {
  const template = DEPARTMENT_QUESTION_TEMPLATES.find((t) => t.id === id);
  if (!template) return;
  const ws = XLSX.utils.json_to_sheet(template.rows);
  ws["!cols"] = [
    { wch: 62 },
    { wch: 42 },
    { wch: 42 },
    { wch: 42 },
    { wch: 28 },
    { wch: 10 },
    { wch: 36 },
    { wch: 12 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.label);
  XLSX.writeFile(wb, template.fileName);
}
