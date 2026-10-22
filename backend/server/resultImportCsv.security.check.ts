/**
 * Result security + bulk import limits + CSV formula injection.
 *   npx tsx server/resultImportCsv.security.check.ts
 */
import {
  rejectClientScoringFields,
  studentResultVisibility,
} from "./attemptLifecycle";
import { escapeCsvCell, sanitizeCsvFormula } from "./csvSanitize";
import {
  IMPORT_LIMITS,
  sniffImportKind,
  validateImportQuestions,
} from "./questionImportValidation";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  // --- Result security: clients cannot assert scores ---
  check(
    "result.reject_score",
    rejectClientScoringFields({ score: 100, passed: true })?.code ===
      "CLIENT_SCORE_FORBIDDEN"
  );
  check(
    "result.reject_passed",
    rejectClientScoringFields({ passed: true })?.code === "CLIENT_SCORE_FORBIDDEN"
  );
  check(
    "result.reject_resultsPublished",
    rejectClientScoringFields({ resultsPublished: true })?.code ===
      "CLIENT_SCORE_FORBIDDEN"
  );
  check(
    "result.allow_answers",
    rejectClientScoringFields({ answers: { q1: "opt1" } }) == null
  );
  check("result.pending", studentResultVisibility(false) === "PENDING");
  check("result.released", studentResultVisibility(true) === "RELEASED");

  // --- Bulk import validation ---
  const good = validateImportQuestions([
    {
      prompt: "What is 2+2?",
      options: ["3", "4", "5", "6"],
      correctIndex: 1,
      marks: 1,
    },
  ]);
  check("import.valid_row", good.ok === true);

  const missingPrompt = validateImportQuestions([
    { prompt: "", options: ["a", "b"], correctIndex: 0 },
  ]);
  check(
    "import.reject_missing_prompt",
    !missingPrompt.ok && missingPrompt.code === "IMPORT_INVALID_ROW"
  );

  const badIndex = validateImportQuestions([
    { prompt: "Q", options: ["a", "b"], correctIndex: 5 },
  ]);
  check("import.reject_bad_correctIndex", !badIndex.ok);

  const tooManyOpts = validateImportQuestions([
    {
      prompt: "Q",
      options: ["a", "b", "c", "d", "e"],
      correctIndex: 0,
    },
  ]);
  check("import.reject_over_4_options", !tooManyOpts.ok);

  const emptyOpt = validateImportQuestions([
    { prompt: "Q", options: ["a", ""], correctIndex: 0 },
  ]);
  check("import.reject_empty_option", !emptyOpt.ok);

  const oversized = validateImportQuestions([
    {
      prompt: "x".repeat(IMPORT_LIMITS.maxPromptLength + 1),
      options: ["a", "b"],
      correctIndex: 0,
    },
  ]);
  check("import.reject_oversized_prompt", !oversized.ok);

  const tooMany = validateImportQuestions(
    Array.from({ length: IMPORT_LIMITS.maxQuestions + 1 }, (_, i) => ({
      prompt: `Q${i}`,
      options: ["a", "b"],
      correctIndex: 0,
    }))
  );
  check(
    "import.reject_too_many",
    !tooMany.ok && tooMany.code === "IMPORT_TOO_MANY"
  );

  // MIME / magic sniff (do not trust extension)
  const pk = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  check("sniff.xlsx", sniffImportKind(pk) === "xlsx");
  const mz = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // PE / exe
  check("sniff.reject_exe", sniffImportKind(mz) === "unknown");
  const jsonBytes = new TextEncoder().encode('[{"prompt":"x"}]');
  check("sniff.json", sniffImportKind(jsonBytes) === "json");

  // --- CSV formula injection ---
  check("csv.sanitize_equals", sanitizeCsvFormula("=HYPERLINK(\"http://x\")").startsWith("'"));
  check("csv.sanitize_plus", sanitizeCsvFormula("+cmd|'/c calc'!A0").startsWith("'"));
  check("csv.sanitize_minus", sanitizeCsvFormula("-2+3").startsWith("'"));
  check("csv.sanitize_at", sanitizeCsvFormula("@SUM(A1)").startsWith("'"));
  check("csv.safe_text", sanitizeCsvFormula("Alice") === "Alice");
  check(
    "csv.escape_formula_quoted",
    escapeCsvCell("=1+1") === "'=1+1" || escapeCsvCell("=1+1").startsWith("'")
  );
  check(
    "csv.escape_name_with_comma",
    escapeCsvCell("Doe, Jane") === '"Doe, Jane"'
  );

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll result/import/CSV security checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
