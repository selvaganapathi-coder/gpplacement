import { useRef, useState } from "react";
import { ImportedQuestionsPreview } from "@/components/ImportedQuestionsPreview";
import {
  DEPARTMENT_QUESTION_TEMPLATES,
  downloadDepartmentQuestionTemplate,
  type DepartmentTemplateId,
} from "@/lib/departmentQuestionTemplates";
import { IMPORT_LIMITS, parseQuestionsFile } from "@/lib/parseQuestionsSpreadsheet";
import type { QuestionInput } from "@/types";

export function BulkQuestionUpload({
  onImport,
}: {
  onImport: (questions: QuestionInput[], mode: "replace" | "append") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<QuestionInput[]>([]);

  async function handleFile(file: File) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await parseQuestionsFile(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onImport(result.questions, "replace");
      setPreview(result.questions);
      setMessage(
        `${result.questions.length} question${result.questions.length === 1 ? "" : "s"} replaced the questions on this paper (${file.name}).`
      );
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Could not read that file. Check the format and try again.");
    } finally {
      setPending(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
  }

  return (
    <div className="new-test-bank border-dashed">
      <h3 className="new-test-bank__title">Bulk import from Excel</h3>
      <p className="new-test-bank__sub">
        Upload <strong>.xlsx</strong> or <strong>.csv</strong> (content is checked — renaming a
        file is not enough). Max {IMPORT_LIMITS.maxFileBytes / (1024 * 1024)} MB,{" "}
        {IMPORT_LIMITS.maxQuestions} questions, {IMPORT_LIMITS.maxOptions} options each. Required:
        Question, Option A–D, Correct. Optional: Category, Difficulty, Tags. The file replaces the
        questions already on this paper.
      </p>
      <p className="mt-2 rounded-lg bg-white px-2 py-1.5 font-mono text-xs text-slate-700 ring-1 ring-stone-200/80">
        Question | Option A–D | Correct | Category | Difficulty | Tags
      </p>
      <p className="mt-3 text-sm font-medium text-slate-700">Department templates</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {DEPARTMENT_QUESTION_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => downloadDepartmentQuestionTemplate(t.id as DepartmentTemplateId)}
            className="new-test-add-q"
          >
            {t.label} .xlsx
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="new-test-bank__fill cursor-pointer">
          {pending ? "Reading…" : "Upload file"}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            disabled={pending}
            onChange={onFileChange}
          />
        </label>
      </div>
      {message ? (
        <p className="mt-3 text-sm text-brand-800" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <ImportedQuestionsPreview questions={preview} />
    </div>
  );
}
