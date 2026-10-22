import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { studentSidebarNav } from "@/lib/dashboardNav";

type PracticeQ = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctId: string;
};

const SAMPLE: PracticeQ[] = [
  {
    id: "p1",
    prompt: "Which unit is commonly used for measuring liquid medicine volume?",
    options: [
      { id: "a", text: "Millilitre (mL)" },
      { id: "b", text: "Kilogram (kg)" },
      { id: "c", text: "Celsius (°C)" },
      { id: "d", text: "Pascal (Pa)" },
    ],
    correctId: "a",
  },
  {
    id: "p2",
    prompt: "What should you do first when you are unsure about a test question?",
    options: [
      { id: "a", text: "Leave the tab" },
      { id: "b", text: "Read all options carefully, then choose" },
      { id: "c", text: "Refresh the page repeatedly" },
      { id: "d", text: "Skip without selecting anything forever" },
    ],
    correctId: "b",
  },
  {
    id: "p3",
    prompt: "In this portal, when can you move to the next question?",
    options: [
      { id: "a", text: "Only after selecting an answer" },
      { id: "b", text: "Anytime, even blank" },
      { id: "c", text: "Only after the timer ends" },
      { id: "d", text: "Only on mobile" },
    ],
    correctId: "a",
  },
];

const LETTERS = ["A", "B", "C", "D"] as const;

/** Untimed practice so students learn the one-question UI before a real exam. */
export function StudentPracticePage() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);
  const [flag, setFlag] = useState<string | null>(null);

  const q = SAMPLE[index]!;
  const answered = !!answers[q.id];
  const isLast = index >= SAMPLE.length - 1;

  const summary = useMemo(() => {
    const correct = SAMPLE.filter((item) => answers[item.id] === item.correctId).length;
    return { correct, total: SAMPLE.length };
  }, [answers]);

  function goNext() {
    if (!answered) {
      setFlag("Answer this question before you go to the next one.");
      return;
    }
    setFlag(null);
    if (isLast) setShowResult(true);
    else setIndex((i) => i + 1);
  }

  function goPrev() {
    setFlag(null);
    setIndex((i) => Math.max(0, i - 1));
  }

  if (showResult) {
    return (
      <DashboardShell
        title="Practice complete"
        subtitle="This was a sample — real tests are timed and scored."
        nav={studentSidebarNav}
      >
        <div className="result-hero max-w-lg animate-scale-in">
          <p className="exam-eyebrow">Practice mode</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">
            {summary.correct} / {summary.total} correct
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            You’re ready for a real aptitude test when one is open on your home page.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => {
                setAnswers({});
                setIndex(0);
                setShowResult(false);
                setFlag(null);
              }}
            >
              Practice again
            </button>
            <Link to="/dashboard/student" className="btn-primary min-h-11">
              Back to aptitude tests
            </Link>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Practice mode"
      subtitle="Untimed sample — learn Previous / Next and answer choices. Nothing is saved."
      nav={studentSidebarNav}
    >
      <p className="mb-4 text-sm text-slate-600">
        <Link to="/dashboard/student" className="font-semibold text-brand-700 hover:underline">
          ← Aptitude tests
        </Link>
      </p>

      <div className="exam-question max-w-2xl">
        <p className="font-display text-sm font-semibold text-brand-800">
          Question {index + 1}
          <span className="font-sans font-normal text-slate-400"> of {SAMPLE.length}</span>
        </p>
        <p className="mt-3 text-lg leading-relaxed text-slate-900">{q.prompt}</p>
        <div className="mt-5 space-y-3">
          {q.options.map((o, oi) => {
            const selected = answers[q.id] === o.id;
            return (
              <label
                key={o.id}
                className={`exam-option exam-option--touch ${selected ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={selected}
                  onChange={() => {
                    setAnswers((prev) => ({ ...prev, [q.id]: o.id }));
                    setFlag(null);
                  }}
                  className="sr-only"
                />
                <span className="exam-option__letter">{LETTERS[oi]}</span>
                <span className="exam-option__text">{o.text}</span>
              </label>
            );
          })}
        </div>
        {flag ? (
          <p className="exam-nav-flag mt-4" role="alert">
            {flag}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary min-h-12"
            disabled={index === 0}
            onClick={goPrev}
          >
            Previous
          </button>
          <button type="button" className="btn-primary min-h-12" onClick={goNext}>
            {isLast ? "See practice score" : "Next"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
