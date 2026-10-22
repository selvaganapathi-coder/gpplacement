import { useEffect, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { AssessmentTypePicker } from "@/components/AssessmentTypePicker";
import { AptitudeTopicPicker } from "@/components/AptitudeTopicPicker";
import { BulkQuestionUpload } from "@/components/BulkQuestionUpload";
import { TestCohortPicker, type TestAudience } from "@/components/TestCohortPicker";
import { api } from "@/lib/api";
import type { LevelType, Program } from "@/lib/academic";
import type { ManagedCohort } from "@/hooks/useStaffDepartmentScope";
import {
  getAssessmentType,
  isMcqAssessment,
  normalizeAssessmentType,
  type AssessmentTypeId,
} from "@/lib/assessmentTypes";
import { mcqMaxScoreFromQuestions, normalizeMarks } from "@/lib/questionMarks";
import type { QuestionInput } from "@/types";

function emptyQuestion(): QuestionInput {
  return { prompt: "", options: ["", "", "", ""], correctIndex: 0, marks: 1 };
}

function emptyQuestionBank(count = 6): QuestionInput[] {
  return Array.from({ length: count }, () => emptyQuestion());
}

function isBlankQuestion(q: QuestionInput): boolean {
  return !q.prompt.trim() && q.options.every((o) => !o.trim());
}

function padOptions(options: string[]): string[] {
  const padded = [...options];
  while (padded.length < 4) padded.push("");
  return padded;
}

type EditTestFormProps = {
  testId: string;
  redirectTo: string;
  allowedPrograms?: Program[];
  allowedCohorts?: ManagedCohort[];
};

type EditorInfo = { id: string; name: string; role: string };

type LoadedTest = {
  title: string;
  description: string | null;
  durationMin: number;
  allowRetake: boolean;
  questionsPerAttempt?: number | null;
  assessmentType?: string;
  maxScore?: number;
  topic?: string | null;
  difficulty?: string | null;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
  createdBy?: EditorInfo | null;
  lastEditedBy?: EditorInfo | null;
  lastEditedAt?: string | null;
  questions: {
    prompt: string;
    marks?: number;
    negativeMarks?: number;
    options: { text: string; isCorrect: boolean }[];
  }[];
};

type FormTab = "paper" | "rules" | "questions";

const FORM_TABS: { id: FormTab; label: string; sub: string }[] = [
  { id: "paper", label: "Paper", sub: "Type & title" },
  { id: "rules", label: "Rules", sub: "Timing & audience" },
  { id: "questions", label: "Questions", sub: "Bank & items" },
];

export function EditTestForm({
  testId,
  redirectTo,
  allowedPrograms,
  allowedCohorts,
}: EditTestFormProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [allowRetake, setAllowRetake] = useState(false);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState<number | "">("");
  const [assessmentType, setAssessmentType] = useState<AssessmentTypeId>("APTITUDE");
  const [maxScore, setMaxScore] = useState(100);
  const [topic, setTopic] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuestionInput["difficulty"]>(null);
  const [audience, setAudience] = useState<TestAudience>({
    target: "all",
    program: "",
    levelType: "",
    level: "",
    section: "",
  });
  const [questions, setQuestions] = useState<QuestionInput[]>([]);
  const [activeQ, setActiveQ] = useState(0);
  const [tab, setTab] = useState<FormTab>("paper");
  const [error, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [createdBy, setCreatedBy] = useState<EditorInfo | null>(null);
  const [lastEditedBy, setLastEditedBy] = useState<EditorInfo | null>(null);
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mcq = isMcqAssessment(assessmentType);
  const typeDef = getAssessmentType(assessmentType);
  const tabIndex = FORM_TABS.findIndex((t) => t.id === tab);
  const safeActiveQ = Math.min(activeQ, Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeActiveQ];
  const perStudentForMax =
    mcq && questionsPerAttempt !== "" ? Number(questionsPerAttempt) : null;
  const computedMcqMax = mcqMaxScoreFromQuestions(questions, perStudentForMax);
  const displayMax = mcq ? computedMcqMax : maxScore;
  const filledQuestions = questions.filter((q) => q.prompt.trim()).length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{
          test: LoadedTest;
          canEdit: boolean;
        }>(`/api/staff/tests/${testId}`);
        if (cancelled) return;
        setCanEdit(!!res.canEdit);
        if (!res.canEdit) {
          setErr(
            "View only — only the creator, admin, or department access holders can edit."
          );
          setLoading(false);
          setLoaded(false);
          return;
        }
        const t = res.test;
        setCreatedBy(t.createdBy ?? null);
        setLastEditedBy(t.lastEditedBy ?? null);
        setLastEditedAt(t.lastEditedAt ?? null);
        setTitle(t.title);
        setDescription(t.description ?? "");
        setDurationMin(t.durationMin);
        setAllowRetake(!!t.allowRetake);
        setQuestionsPerAttempt(
          t.questionsPerAttempt != null && t.questionsPerAttempt > 0
            ? t.questionsPerAttempt
            : ""
        );
        setAssessmentType(normalizeAssessmentType(t.assessmentType));
        setMaxScore(t.maxScore && t.maxScore > 0 ? t.maxScore : 100);
        setTopic(t.topic ?? null);
        setDifficulty(
          t.difficulty === "EASY" || t.difficulty === "MEDIUM" || t.difficulty === "HARD"
            ? t.difficulty
            : null
        );
        if (t.program) {
          setAudience({
            target: "class",
            program: t.program,
            levelType: t.levelType && t.level != null ? t.levelType : "",
            level: t.level != null ? t.level : "",
            section:
              t.level != null && (t.section === "A" || t.section === "B")
                ? t.section
                : "",
          });
        } else if (allowedPrograms?.length) {
          setAudience({
            target: "class",
            program: allowedPrograms[0]!,
            levelType: "",
            level: "",
            section: "",
          });
        } else {
          setAudience({
            target: "all",
            program: "",
            levelType: "",
            level: "",
            section: "",
          });
        }
        const mapped = t.questions.map((q) => {
          const opts = q.options.map((o) => o.text);
          const correctIndex = Math.max(
            0,
            q.options.findIndex((o) => o.isCorrect)
          );
          return {
            prompt: q.prompt,
            options: padOptions(opts),
            correctIndex,
            marks: normalizeMarks(q.marks),
            negativeMarks: 0,
          };
        });
        setQuestions(mapped.length > 0 ? mapped : emptyQuestionBank(6));
        setActiveQ(0);
        setLoaded(true);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErr("Could not load assessment.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [testId, allowedPrograms]);

  function updateQuestion(i: number, patch: Partial<QuestionInput>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qIndex) return q;
        return { ...q, options: q.options.map((o, j) => (j === oIndex ? text : o)) };
      })
    );
  }

  function onBulkImport(imported: QuestionInput[], mode: "replace" | "append") {
    const normalized = imported.map((q) => ({
      ...q,
      options: padOptions(q.options),
      marks: normalizeMarks(q.marks),
      negativeMarks: 0,
    }));
    setQuestions((prev) => (mode === "replace" ? normalized : [...prev, ...normalized]));
    setActiveQ(0);
  }

  function addQuestion() {
    setQuestions((q) => {
      const next = [...q, emptyQuestion()];
      setActiveQ(next.length - 1);
      return next;
    });
  }

  function removeActiveQuestion() {
    if (questions.length <= 1) return;
    setQuestions((qs) => {
      const next = qs.filter((_, j) => j !== safeActiveQ);
      setActiveQ(Math.min(safeActiveQ, next.length - 1));
      return next;
    });
  }

  function goNext() {
    if (tabIndex < FORM_TABS.length - 1) setTab(FORM_TABS[tabIndex + 1]!.id);
  }

  function goBack() {
    if (tabIndex > 0) setTab(FORM_TABS[tabIndex - 1]!.id);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr("Enter a title for the assessment.");
      setTab("paper");
      return;
    }
    if (audience.target === "class" && !audience.program) {
      setErr("Choose a degree, or select “All students”.");
      setTab("rules");
      return;
    }
    const paperQuestions = mcq
      ? questions.filter((q) => !isBlankQuestion(q))
      : [];
    if (mcq && paperQuestions.length === 0) {
      setErr("MCQ assessments need at least one question.");
      setTab("questions");
      return;
    }
    if (mcq) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]!;
        if (isBlankQuestion(q)) continue;
        if (!q.prompt.trim()) {
          setErr(`Question ${i + 1} needs a prompt.`);
          setTab("questions");
          setActiveQ(i);
          return;
        }
        if (q.options.some((o) => !o.trim())) {
          setErr(`Question ${i + 1} needs all four options.`);
          setTab("questions");
          setActiveQ(i);
          return;
        }
      }
    }
    if (
      mcq &&
      questionsPerAttempt !== "" &&
      (Number(questionsPerAttempt) < 1 ||
        Number(questionsPerAttempt) > paperQuestions.length)
    ) {
      setErr(
        `Questions per student must be between 1 and the bank size (${paperQuestions.length}).`
      );
      setTab("rules");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const perStudent =
            mcq && questionsPerAttempt !== ""
              ? Number(questionsPerAttempt)
              : null;
          const payload: Record<string, unknown> = {
            title,
            description,
            durationMin,
            allowRetake,
            questionsPerAttempt: perStudent,
            topic,
            difficulty,
            assessmentType,
            negativeMarking: false,
            maxScore: mcq
              ? mcqMaxScoreFromQuestions(paperQuestions, perStudent)
              : maxScore,
            questions: mcq ? paperQuestions : [],
          };
          if (audience.target === "class" && audience.program) {
            payload.program = audience.program;
            if (audience.level !== "" && audience.levelType) {
              payload.levelType = audience.levelType;
              payload.level = audience.level;
              payload.section = audience.section || null;
            } else {
              payload.levelType = null;
              payload.level = null;
              payload.section = null;
            }
          } else {
            payload.program = null;
            payload.levelType = null;
            payload.level = null;
            payload.section = null;
          }
          await api(`/api/staff/tests/${testId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          navigate(redirectTo, { replace: true });
        } catch (err) {
          setErr(err instanceof Error ? err.message : "Could not save assessment.");
        }
      })();
    });
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading assessment…</p>;
  }

  if (error && !loaded) {
    return (
      <p className="new-test-error" role="alert">
        {error}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="new-test-form" noValidate>
      {(createdBy || lastEditedBy) && canEdit ? (
        <p className="rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-xs text-slate-600">
          {createdBy ? (
            <>
              Created by <strong className="text-slate-900">{createdBy.name}</strong>
            </>
          ) : null}
          {lastEditedBy ? (
            <>
              {createdBy ? " · " : null}
              Last edited by{" "}
              <strong className="text-slate-900">{lastEditedBy.name}</strong>
              {lastEditedAt
                ? ` · ${new Date(lastEditedAt).toLocaleString()}`
                : null}
            </>
          ) : (
            <> · Not edited since create</>
          )}
        </p>
      ) : null}
      <div className="new-test-tabs" role="tablist" aria-label="Edit assessment steps">
        {FORM_TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`edit-test-panel-${t.id}`}
              id={`edit-test-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`new-test-tab ${active ? "new-test-tab--active" : ""}`}
            >
              <span className="new-test-tab__num">{i + 1}</span>
              <span className="new-test-tab__text">
                <span className="new-test-tab__label">{t.label}</span>
                <span className="new-test-tab__sub">{t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="new-test-section">
        {tab === "paper" ? (
          <div
            className="new-test-section__body new-test-section__body--paper"
            role="tabpanel"
            id="edit-test-panel-paper"
            aria-labelledby="edit-test-tab-paper"
          >
            <AssessmentTypePicker
              id="edit-assessment-type"
              value={assessmentType}
              onChange={setAssessmentType}
            />
            <div>
              <label className="new-test-field__label" htmlFor="edit-title">
                Title
              </label>
              <input
                id="edit-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="new-test-field__input"
              />
            </div>
            <div>
              <label className="new-test-field__label" htmlFor="edit-desc">
                Description{" "}
                <span className="new-test-field__optional">(optional)</span>
              </label>
              <textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="new-test-field__input"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AptitudeTopicPicker id="edit-test-topic" value={topic} onChange={setTopic} />
              <div>
                <label className="new-test-field__label" htmlFor="edit-difficulty">
                  Difficulty
                </label>
                <select
                  id="edit-difficulty"
                  value={difficulty ?? ""}
                  onChange={(e) =>
                    setDifficulty((e.target.value || null) as QuestionInput["difficulty"])
                  }
                  className="new-test-field__input"
                >
                  <option value="">Any</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "rules" ? (
          <div
            className="new-test-section__body"
            role="tabpanel"
            id="edit-test-panel-rules"
            aria-labelledby="edit-test-tab-rules"
          >
            {mcq ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="new-test-field__label" htmlFor="edit-dur">
                    Duration (minutes)
                  </label>
                  <input
                    id="edit-dur"
                    type="number"
                    min={5}
                    max={180}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="new-test-field__input"
                  />
                </div>
                <div>
                  <label className="new-test-field__label" htmlFor="edit-qpa">
                    Questions per student
                  </label>
                  <input
                    id="edit-qpa"
                    type="number"
                    min={1}
                    max={Math.max(questions.length, 1)}
                    placeholder={`All (${questions.length})`}
                    value={questionsPerAttempt}
                    onChange={(e) =>
                      setQuestionsPerAttempt(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="new-test-field__input"
                  />
                  <p className="new-test-field__hint">
                    Bank has {questions.length} · max score {computedMcqMax}. Blank = all.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="new-test-field__label" htmlFor="edit-max-score">
                  Max score
                </label>
                <input
                  id="edit-max-score"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value) || 100)}
                  className="new-test-field__input new-test-field__input--narrow"
                />
                <p className="new-test-field__hint">
                  {typeDef.methodLabel}: score entered out of this maximum after publish.
                </p>
              </div>
            )}

            <label className="new-test-check">
              <input
                type="checkbox"
                checked={allowRetake}
                onChange={(e) => setAllowRetake(e.target.checked)}
              />
              <span>
                <span className="font-medium">Allow retake / rescore</span>
                <span className="block text-xs text-slate-500">
                  Submit again after the first score.
                </span>
              </span>
            </label>

            <TestCohortPicker
              value={audience}
              onChange={setAudience}
              allowedPrograms={allowedPrograms}
              allowedCohorts={allowedCohorts}
            />
          </div>
        ) : null}

        {tab === "questions" ? (
          <div
            className="new-test-section__body"
            role="tabpanel"
            id="edit-test-panel-questions"
            aria-labelledby="edit-test-tab-questions"
          >
            {mcq ? (
              <>
                <BulkQuestionUpload onImport={onBulkImport} />

                <div
                  className="new-test-qtabs"
                  role="tablist"
                  aria-label="Questions"
                >
                  {questions.map((_, qi) => (
                    <button
                      key={qi}
                      type="button"
                      role="tab"
                      aria-selected={safeActiveQ === qi}
                      className={`new-test-qtab ${
                        safeActiveQ === qi ? "new-test-qtab--active" : ""
                      }`}
                      onClick={() => setActiveQ(qi)}
                    >
                      Q{qi + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="new-test-qtab new-test-qtab--add"
                    onClick={addQuestion}
                    title="Add question"
                  >
                    +
                  </button>
                </div>

                {activeQuestion ? (
                  <div
                    className="new-test-qpanel"
                    role="tabpanel"
                    aria-label={`Question ${safeActiveQ + 1}`}
                  >
                    <div className="new-test-qpanel__head">
                      <p className="new-test-qpanel__title">
                        Question {safeActiveQ + 1}
                        <span className="ml-2 text-xs font-medium text-slate-500">
                          {activeQuestion.marks ?? 1} mk
                        </span>
                      </p>
                      {questions.length > 1 ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-700 hover:underline"
                          onClick={removeActiveQuestion}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <label className="new-test-field__label">Prompt</label>
                    <textarea
                      value={activeQuestion.prompt}
                      onChange={(e) =>
                        updateQuestion(safeActiveQ, { prompt: e.target.value })
                      }
                      rows={3}
                      className="new-test-field__input"
                    />
                    <div className="mt-2">
                      <label
                        className="new-test-field__label"
                        htmlFor={`edit-marks-${safeActiveQ}`}
                      >
                        Marks
                      </label>
                      <input
                        id={`edit-marks-${safeActiveQ}`}
                        type="number"
                        min={0.5}
                        max={100}
                        step={0.5}
                        value={activeQuestion.marks ?? 1}
                        onChange={(e) =>
                          updateQuestion(safeActiveQ, {
                            marks: normalizeMarks(
                              e.target.value === ""
                                ? 1
                                : Number(e.target.value)
                            ),
                          })
                        }
                        className="new-test-field__input new-test-field__input--narrow"
                      />
                    </div>
                    <p className="new-test-field__label mt-3">
                      Options (select correct)
                    </p>
                    <div className="mt-1.5 space-y-2">
                      {activeQuestion.options.map((opt, oi) => (
                        <div key={oi} className="flex flex-wrap items-center gap-2">
                          <input
                            type="radio"
                            name={`edit-correct-${safeActiveQ}`}
                            checked={activeQuestion.correctIndex === oi}
                            onChange={() =>
                              updateQuestion(safeActiveQ, { correctIndex: oi })
                            }
                            className="shrink-0"
                          />
                          <span className="w-6 font-mono text-xs text-slate-500">
                            {String.fromCharCode(65 + oi)})
                          </span>
                          <input
                            value={opt}
                            onChange={(e) =>
                              updateOption(safeActiveQ, oi, e.target.value)
                            }
                            className="new-test-field__input min-w-[12rem] flex-1"
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="new-test-non-mcq">
                <p className="new-test-non-mcq__title">No MCQ paper for this type</p>
                <p>
                  Method: <strong>{typeDef.methodLabel}</strong>. After you publish,{" "}
                  {typeDef.method === "SELF"
                    ? "students submit a self-score from their dashboard."
                    : "faculty enter scores on the Results page."}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="new-test-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="new-test-sticky">
        <div className="new-test-sticky__meta">
          <span>
            {mcq
              ? `${filledQuestions}/${questions.length} questions`
              : typeDef.label}
          </span>
          <span aria-hidden>·</span>
          <span>Max {displayMax}</span>
          <span aria-hidden>·</span>
          <span className="new-test-sticky__draft">
            {lastEditedBy ? `Edited by ${lastEditedBy.name}` : "Editing"}
          </span>
        </div>
        <div className="new-test-sticky__actions">
          {tabIndex > 0 ? (
            <button type="button" onClick={goBack} className="new-test-sticky__nav">
              Back
            </button>
          ) : null}
          {tabIndex < FORM_TABS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="new-test-sticky__nav new-test-sticky__nav--next"
            >
              Next
            </button>
          ) : (
            <button type="submit" disabled={pending} className="new-test-sticky__submit">
              {pending ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
