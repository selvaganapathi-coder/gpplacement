import type { QuestionInput } from "@/types";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function ImportedQuestionsPreview({ questions }: { questions: QuestionInput[] }) {
  if (questions.length === 0) return null;

  return (
    <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-3">
      <p className="text-xs font-semibold text-emerald-900">
        Imported {questions.length} question{questions.length === 1 ? "" : "s"} (answers set)
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs text-slate-800">
        {questions.map((q, i) => {
          const opts = q.options.filter(Boolean);
          const correct = opts[q.correctIndex] ?? "—";
          return (
            <li key={i}>
              <span className="font-medium">{q.prompt}</span>
              <ul className="mt-0.5 list-none pl-0 text-slate-600">
                {opts.map((o, j) => (
                  <li key={j}>
                    {LETTERS[j] ?? j + 1}) {o}
                    {j === q.correctIndex ? (
                      <span className="ml-1 font-semibold text-emerald-800"> ✓ answer</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <span className="text-emerald-800">Correct: {LETTERS[q.correctIndex] ?? q.correctIndex + 1} — {correct}</span>
              <span className="mt-0.5 block text-slate-500">
                {[
                  `${q.marks != null && q.marks > 0 ? q.marks : 1} mark${
                    (q.marks != null && q.marks > 0 ? q.marks : 1) === 1 ? "" : "s"
                  }`,
                  q.category,
                  q.topic,
                  q.difficulty,
                  q.tags,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
