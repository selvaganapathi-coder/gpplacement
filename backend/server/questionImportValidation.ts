/**
 * Shared limits + structural validation for bulk question import (JSON API).
 * Do not trust client file extensions — callers should sniff content when reading files.
 */

export const IMPORT_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxQuestions: 500,
  maxPromptLength: 2000,
  maxOptionLength: 500,
  maxOptions: 4,
  minOptions: 2,
  maxTagLength: 200,
  maxTopicLength: 120,
  maxExplanationLength: 4000,
} as const;

export type ImportQuestionInput = {
  prompt: string;
  options: string[];
  correctIndex: number;
  marks?: number | null;
  negativeMarks?: number | null;
  topic?: string | null;
  category?: string | null;
  tags?: string | null;
  difficulty?: string | null;
  explanation?: string | null;
};

export type ImportValidationOk = {
  ok: true;
  questions: ImportQuestionInput[];
};

export type ImportValidationErr = {
  ok: false;
  error: string;
  code:
    | "IMPORT_TOO_MANY"
    | "IMPORT_EMPTY"
    | "IMPORT_INVALID_ROW"
    | "IMPORT_INVALID_STRUCTURE";
};

function clampText(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/** Validate and normalize an array of question payloads from JSON / form body. */
export function validateImportQuestions(
  raw: unknown
): ImportValidationOk | ImportValidationErr {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: "Questions must be a JSON array.",
      code: "IMPORT_INVALID_STRUCTURE",
    };
  }
  if (raw.length === 0) {
    return { ok: false, error: "No questions provided.", code: "IMPORT_EMPTY" };
  }
  if (raw.length > IMPORT_LIMITS.maxQuestions) {
    return {
      ok: false,
      error: `Too many questions (max ${IMPORT_LIMITS.maxQuestions}).`,
      code: "IMPORT_TOO_MANY",
    };
  }

  const out: ImportQuestionInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return {
        ok: false,
        error: `Question ${i + 1}: invalid object.`,
        code: "IMPORT_INVALID_ROW",
      };
    }
    const r = row as Record<string, unknown>;
    const prompt = String(r.prompt ?? "").trim();
    if (!prompt) {
      return {
        ok: false,
        error: `Question ${i + 1}: missing prompt.`,
        code: "IMPORT_INVALID_ROW",
      };
    }
    if (prompt.length > IMPORT_LIMITS.maxPromptLength) {
      return {
        ok: false,
        error: `Question ${i + 1}: prompt too long (max ${IMPORT_LIMITS.maxPromptLength}).`,
        code: "IMPORT_INVALID_ROW",
      };
    }

    if (!Array.isArray(r.options)) {
      return {
        ok: false,
        error: `Question ${i + 1}: options must be an array.`,
        code: "IMPORT_INVALID_ROW",
      };
    }
    if (r.options.length > IMPORT_LIMITS.maxOptions) {
      return {
        ok: false,
        error: `Question ${i + 1}: at most ${IMPORT_LIMITS.maxOptions} options.`,
        code: "IMPORT_INVALID_ROW",
      };
    }
    const options = r.options
      .map((o) => String(o ?? "").trim())
      .filter(Boolean);
    if (options.length < IMPORT_LIMITS.minOptions) {
      return {
        ok: false,
        error: `Question ${i + 1}: need at least ${IMPORT_LIMITS.minOptions} non-empty options.`,
        code: "IMPORT_INVALID_ROW",
      };
    }
    if (options.some((o) => o.length > IMPORT_LIMITS.maxOptionLength)) {
      return {
        ok: false,
        error: `Question ${i + 1}: an option exceeds ${IMPORT_LIMITS.maxOptionLength} characters.`,
        code: "IMPORT_INVALID_ROW",
      };
    }

    const correctIndex = Number(r.correctIndex);
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= options.length
    ) {
      return {
        ok: false,
        error: `Question ${i + 1}: invalid correctIndex.`,
        code: "IMPORT_INVALID_ROW",
      };
    }

    const marks =
      r.marks != null && Number.isFinite(Number(r.marks)) && Number(r.marks) > 0
        ? Math.min(100, Number(r.marks))
        : 1;
    const negativeMarks =
      r.negativeMarks != null &&
      Number.isFinite(Number(r.negativeMarks)) &&
      Number(r.negativeMarks) >= 0
        ? Math.min(100, Number(r.negativeMarks))
        : 0;

    const diffRaw = r.difficulty != null ? String(r.difficulty).trim().toUpperCase() : "";
    const difficulty =
      diffRaw === "EASY" || diffRaw === "MEDIUM" || diffRaw === "HARD"
        ? diffRaw
        : null;

    out.push({
      prompt,
      options,
      correctIndex,
      marks,
      negativeMarks,
      topic: r.topic != null ? clampText(String(r.topic).trim(), IMPORT_LIMITS.maxTopicLength) || null : null,
      category:
        r.category != null
          ? clampText(String(r.category).trim(), IMPORT_LIMITS.maxTopicLength) || null
          : null,
      tags:
        r.tags != null
          ? clampText(
              Array.isArray(r.tags) ? r.tags.map(String).join(",") : String(r.tags),
              IMPORT_LIMITS.maxTagLength
            ) || null
          : null,
      difficulty,
      explanation:
        r.explanation != null
          ? clampText(String(r.explanation).trim(), IMPORT_LIMITS.maxExplanationLength) ||
            null
          : null,
    });
  }

  return { ok: true, questions: out };
}

/** Sniff buffer kind without trusting the filename extension. */
export function sniffImportKind(
  bytes: Uint8Array,
  textSample?: string
): "xlsx" | "xls" | "json" | "csv" | "unknown" {
  if (bytes.length >= 4) {
    // ZIP / OOXML (.xlsx)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return "xlsx";
    }
    // OLE Compound File (.xls)
    if (
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    ) {
      return "xls";
    }
  }
  // Reject obvious PE / ELF binaries
  if (
    bytes.length >= 2 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x5a // MZ
  ) {
    return "unknown";
  }
  const sample =
    textSample ??
    new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512)).trimStart();
  if (sample.startsWith("{") || sample.startsWith("[")) return "json";
  // Heuristic CSV: printable + commas/newlines, no NULs
  if (bytes.includes(0)) return "unknown";
  if (/^[\uFEFF\s]*["']?\w/.test(sample) && (sample.includes(",") || sample.includes("\n"))) {
    return "csv";
  }
  return "unknown";
}
