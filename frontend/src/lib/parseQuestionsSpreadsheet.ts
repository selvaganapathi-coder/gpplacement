import * as XLSX from "xlsx";
import { normalizeMarks } from "@/lib/questionMarks";
import type { QuestionInput } from "@/types";

export type ParseResult =
  | { ok: true; questions: QuestionInput[] }
  | { ok: false; error: string };

/** Hard limits for bulk import (do not trust file extension alone). */
export const IMPORT_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxQuestions: 500,
  maxPromptLength: 2000,
  maxOptionLength: 500,
  maxOptions: 4,
  minOptions: 2,
  maxTagLength: 200,
  maxTopicLength: 120,
} as const;

const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  question: "prompt",
  prompt: "prompt",
  q: "prompt",
  "option a": "optA",
  optiona: "optA",
  a: "optA",
  "option b": "optB",
  optionb: "optB",
  b: "optB",
  "option c": "optC",
  optionc: "optC",
  c: "optC",
  "option d": "optD",
  optiond: "optD",
  d: "optD",
  "option 1": "optA",
  "option 2": "optB",
  "option 3": "optC",
  "option 4": "optD",
  option1: "optA",
  option2: "optB",
  option3: "optC",
  option4: "optD",
  correct: "correct",
  answer: "correct",
  "correct answer": "correct",
  "correct option": "correct",
  key: "correct",
  ans: "correct",
  topic: "topic",
  subject: "topic",
  subcategory: "topic",
  "sub category": "topic",
  category: "category",
  "question category": "category",
  section: "category",
  tag: "tags",
  tags: "tags",
  labels: "tags",
  difficulty: "difficulty",
  level: "difficulty",
  marks: "marks",
  mark: "marks",
  score: "marks",
  points: "marks",
  weight: "marks",
};

type ParsedRow = {
  prompt?: string;
  optA?: string;
  optB?: string;
  optC?: string;
  optD?: string;
  correct?: string;
  topic?: string;
  category?: string;
  tags?: string;
  difficulty?: string;
  marks?: string;
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function resolveCorrectIndex(correctRaw: string, options: string[]): number | null {
  const c = correctRaw.trim();
  if (!c) return null;
  const upper = c.toUpperCase();
  const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  if (upper in letterMap && letterMap[upper]! < options.length) return letterMap[upper]!;
  const num = parseInt(c, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= options.length) return num - 1;
  const idx = options.findIndex((o) => o.toLowerCase() === c.toLowerCase());
  if (idx >= 0) return idx;
  return null;
}

function resolveDifficulty(raw: string): "EASY" | "MEDIUM" | "HARD" | null {
  const d = raw.trim().toUpperCase();
  if (!d) return null;
  if (d === "EASY" || d === "E" || d === "1") return "EASY";
  if (d === "MEDIUM" || d === "MED" || d === "M" || d === "2") return "MEDIUM";
  if (d === "HARD" || d === "H" || d === "3") return "HARD";
  return null;
}

/** Infer category name when spreadsheet only has a topic path. */
function inferCategoryFromTopic(topic: string): string | null {
  const t = topic.toLowerCase();
  if (!t) return null;
  if (t.includes("pharmacy") || t.includes("pharma") || t.includes("dosage"))
    return "Pharmacy Technical";
  if (t.includes("logical") || t.includes("reasoning") || t.includes("series"))
    return "Logical Reasoning";
  if (t.includes("verbal") || t.includes("english") || t.includes("grammar"))
    return "Verbal";
  if (t.includes("aptitude") || t.includes("quant") || t.includes("percent"))
    return "Aptitude";
  if (t.includes("placement") || t.includes("hr") || t.includes("interview") || t.includes("gk"))
    return "General Placement";
  return null;
}

function rowToQuestion(row: ParsedRow, rowNum: number): QuestionInput | string {
  const prompt = cellStr(row.prompt);
  if (prompt.length > IMPORT_LIMITS.maxPromptLength) {
    return `Row ${rowNum}: question text too long (max ${IMPORT_LIMITS.maxPromptLength}).`;
  }
  const rawOpts = [row.optA, row.optB, row.optC, row.optD].map((o) => cellStr(o));
  // Reject more than 4 option columns with content (only A-D are mapped).
  const nonEmpty = rawOpts.filter(Boolean);
  if (nonEmpty.length > IMPORT_LIMITS.maxOptions) {
    return `Row ${rowNum}: at most ${IMPORT_LIMITS.maxOptions} options.`;
  }
  if (nonEmpty.some((o) => o.length > IMPORT_LIMITS.maxOptionLength)) {
    return `Row ${rowNum}: an option exceeds ${IMPORT_LIMITS.maxOptionLength} characters.`;
  }
  const options = nonEmpty;
  if (!prompt) return `Row ${rowNum}: missing question text.`;
  if (options.length < IMPORT_LIMITS.minOptions) {
    return `Row ${rowNum}: need at least ${IMPORT_LIMITS.minOptions} options (A and B).`;
  }
  const correctIndex = resolveCorrectIndex(cellStr(row.correct), options);
  if (correctIndex == null)
    return `Row ${rowNum}: invalid Correct value (use A, B, C, D, 1-4, or matching option text).`;
  const difficultyRaw = cellStr(row.difficulty);
  const difficulty = resolveDifficulty(difficultyRaw);
  if (difficultyRaw && !difficulty)
    return `Row ${rowNum}: invalid Difficulty (use EASY, MEDIUM, or HARD).`;
  const topic = cellStr(row.topic).slice(0, IMPORT_LIMITS.maxTopicLength) || null;
  const category =
    cellStr(row.category).slice(0, IMPORT_LIMITS.maxTopicLength) ||
    (topic ? inferCategoryFromTopic(topic) : null) ||
    null;
  const tags = cellStr(row.tags).slice(0, IMPORT_LIMITS.maxTagLength) || null;
  const marksRaw = cellStr(row.marks);
  if (marksRaw) {
    const m = Number(marksRaw);
    if (!Number.isFinite(m) || m <= 0)
      return `Row ${rowNum}: Marks must be a positive number.`;
  }
  const marks = normalizeMarks(marksRaw || 1);
  return {
    prompt,
    options,
    correctIndex,
    marks,
    negativeMarks: 0,
    topic,
    category,
    tags,
    difficulty,
  };
}

function mapSheetRow(raw: Record<string, unknown>): ParsedRow {
  const mapped: ParsedRow = {};
  for (const [key, val] of Object.entries(raw)) {
    const field = HEADER_ALIASES[normHeader(key)];
    if (field) mapped[field] = cellStr(val);
  }
  return mapped;
}

function parseRows(rows: Record<string, unknown>[]): ParseResult {
  const questions: QuestionInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    const mapped = mapSheetRow(rows[i]!);
    const hasContent =
      cellStr(mapped.prompt) ||
      [mapped.optA, mapped.optB, mapped.optC, mapped.optD].some((o) => cellStr(o));
    if (!hasContent) continue;
    const result = rowToQuestion(mapped, i + 2);
    if (typeof result === "string") return { ok: false, error: result };
    questions.push(result);
    if (questions.length > IMPORT_LIMITS.maxQuestions) {
      return {
        ok: false,
        error: `Too many questions (max ${IMPORT_LIMITS.maxQuestions}).`,
      };
    }
  }
  if (questions.length === 0)
    return {
      ok: false,
      error:
        "No questions found. Use columns: Question, Option A-D, Correct. Optional: Category, Difficulty, Tags.",
    };
  return { ok: true, questions };
}

export function parseQuestionsWorkbook(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return { ok: false, error: "The file has no worksheets." };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return parseRows(rows);
}

/** Sniff content; never trust the filename alone. */
export function sniffImportKind(bytes: Uint8Array): "xlsx" | "xls" | "json" | "csv" | "unknown" {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return "xlsx";
    }
    if (
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    ) {
      return "xls";
    }
  }
  // PE executable (e.g. renamed .exe)
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return "unknown";
  }
  if (bytes.includes(0)) return "unknown";
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart();
  if (sample.startsWith("{") || sample.startsWith("[")) return "json";
  if (/^[\uFEFF\s]*["']?\w/.test(sample) && (sample.includes(",") || sample.includes("\n"))) {
    return "csv";
  }
  return "unknown";
}

export async function parseQuestionsFile(file: File): Promise<ParseResult> {
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: `File too large (max ${IMPORT_LIMITS.maxFileBytes / (1024 * 1024)} MB).`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const kind = sniffImportKind(bytes);

  if (kind === "json") {
    return {
      ok: false,
      error: "JSON is not accepted. Download a department Excel template, or use CSV.",
    };
  }

  if (kind === "unknown") {
    return {
      ok: false,
      error:
        "Unrecognized file content. Use a real .xlsx, .xls, or .csv (renaming a file is not enough).",
    };
  }
  if (kind === "csv") {
    const text = new TextDecoder("utf-8").decode(bytes);
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return { ok: false, error: "Could not read CSV." };
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    return parseRows(rows);
  }
  // xlsx / xls — validated by magic bytes above
  return parseQuestionsWorkbook(buffer);
}
