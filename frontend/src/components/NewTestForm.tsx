import { useEffect, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { AssessmentTypePicker } from "@/components/AssessmentTypePicker";
import { BulkQuestionUpload } from "@/components/BulkQuestionUpload";
import { TestCohortPicker, type TestAudience } from "@/components/TestCohortPicker";
import { api } from "@/lib/api";
import { programOptions, type Program } from "@/lib/academic";
import type { ManagedCohort } from "@/hooks/useStaffDepartmentScope";
import {
  getAssessmentType,
  isMcqAssessment,
  type AssessmentTypeId,
} from "@/lib/assessmentTypes";
import { mcqMaxScoreFromQuestions, normalizeMarks } from "@/lib/questionMarks";
import { ASSESSMENT_TEMPLATES } from "@/lib/assessmentTemplates";
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

type NewTestFormProps = {
  createUrl: string;
  redirectTo: string;
  submitLabel?: string;
  allowedPrograms?: Program[];
  allowedCohorts?: ManagedCohort[];
};

type FormTab = "paper" | "rules" | "questions";

const FORM_TABS: { id: FormTab; label: string; sub: string }[] = [
  { id: "paper", label: "Paper", sub: "Type & title" },
  { id: "rules", label: "Rules", sub: "Timing & audience" },
  { id: "questions", label: "Questions", sub: "Bank & items" },
];

export function NewTestForm({
  createUrl,
  redirectTo,
  submitLabel = "Create draft",
  allowedPrograms,
  allowedCohorts,
}: NewTestFormProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [allowRetake, setAllowRetake] = useState(false);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState<number | "">("");
  const [easyCount, setEasyCount] = useState<number | "">("");
  const [mediumCount, setMediumCount] = useState<number | "">("");
  const [hardCount, setHardCount] = useState<number | "">("");
  const [passPercentage, setPassPercentage] = useState<number | "">(40);
  const [maxAttempts, setMaxAttempts] = useState<number | "">(1);
  const [assessmentType, setAssessmentType] = useState<AssessmentTypeId>("APTITUDE");
  const [maxScore, setMaxScore] = useState(100);
  const [topic, setTopic] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuestionInput["difficulty"]>(null);
  const staffScoped = Boolean(allowedPrograms?.length || allowedCohorts?.length);
  const defaultProgram = allowedPrograms?.[0] ?? programOptions()[0]!.id;
  const [audience, setAudience] = useState<TestAudience>(
    staffScoped
      ? {
          target: "class",
          program: defaultProgram,
          levelType: "",
          level: "",
          section: "",
        }
      : {
          target: "all",
          program: "",
          levelType: "",
          level: "",
          section: "",
        }
  );
  const [questions, setQuestions] = useState<QuestionInput[]>(() => emptyQuestionBank(6));
  const [activeQ, setActiveQ] = useState<number>(0);
  const [templateId, setTemplateId] = useState("");
  const [tab, setTab] = useState<FormTab>("paper");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mcq = isMcqAssessment(assessmentType);
  const typeDef = getAssessmentType(assessmentType);
  const tabIndex = FORM_TABS.findIndex((t) => t.id === tab);
  const safeActiveQ = Math.min(activeQ, Math.max(0, questions.length - 1));
  const activeQuestion = questions[safeActiveQ];

  function applyTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = ASSESSMENT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (
      allowedPrograms?.length &&
      !allowedPrograms.includes(t.program) &&
      !allowedCohorts?.some((c) => c.program === t.program)
    ) {
      setError(`Template “${t.label}” is outside your department scope.`);
      return;
    }
    setError(null);
    setTitle(t.title);
    setDescription(t.description);
    setAssessmentType(t.assessmentType);
    setDurationMin(t.durationMin);
    setQuestionsPerAttempt(t.questionsPerAttempt);
    setPassPercentage(t.passPercentage);
    setAudience({
      target: "class",
      program: t.program,
      levelType: t.levelType,
      level: t.level,
      section: "",
    });
  }
  const perStudentForMax =
    mcq && questionsPerAttempt !== "" ? Number(questionsPerAttempt) : null;
  const computedMcqMax = mcqMaxScoreFromQuestions(questions, perStudentForMax);
  const displayMax = mcq ? computedMcqMax : maxScore;
  const filledQuestions = questions.filter((q) => q.prompt.trim()).length;

  useEffect(() => {
    if (!allowedPrograms?.length && !allowedCohorts?.length) return;
    setAudience((prev) => {
      if (
        prev.program &&
        (!allowedCohorts?.length ||
          allowedCohorts.some((c) => c.program === prev.program))
      ) {
        return prev;
      }
      const first = allowedCohorts?.[0];
      const program = first?.program ?? allowedPrograms?.[0] ?? programOptions()[0]!.id;
      return {
        target: "class",
        program,
        levelType: "",
        level: "",
        section: "",
      };
    });
  }, [allowedPrograms, allowedCohorts]);

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

  function updateQuestion(i: number, patch: Partial<QuestionInput>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function updateOption(qIndex: number, oIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qIndex) return q;
        const options = q.options.map((o, j) => (j === oIndex ? text : o));
        return { ...q, options };
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

  function goNext() {
    if (tabIndex < FORM_TABS.length - 1) setTab(FORM_TABS[tabIndex + 1]!.id);
  }

  function goBack() {
    if (tabIndex > 0) setTab(FORM_TABS[tabIndex - 1]!.id);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Enter a title for the assessment.");
      setTab("paper");
      return;
    }
    if (audience.target === "class" && !audience.program) {
      setError("Choose a degree, or select “All students”.");
      setTab("rules");
      return;
    }
    const paperQuestions = mcq
      ? questions.filter((q) => !isBlankQuestion(q))
      : [];
    if (mcq && paperQuestions.length === 0) {
      setError("MCQ assessments need at least one question.");
      setTab("questions");
      return;
    }
    if (mcq) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]!;
        if (isBlankQuestion(q)) continue;
        if (!q.prompt.trim()) {
          setError(`Question ${i + 1} needs a prompt.`);
          setTab("questions");
          setActiveQ(i);
          return;
        }
        if (q.options.some((o) => !o.trim())) {
          setError(`Question ${i + 1} needs all four options.`);
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
      setError(
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
          const blueprint =
            mcq &&
            (easyCount !== "" || mediumCount !== "" || hardCount !== "")
              ? {
                  easy: easyCount === "" ? 0 : Number(easyCount),
                  medium: mediumCount === "" ? 0 : Number(mediumCount),
                  hard: hardCount === "" ? 0 : Number(hardCount),
                }
              : null;
          const payload: Record<string, unknown> = {
            title,
            description,
            durationMin,
            allowRetake,
            questionsPerAttempt: perStudent,
            difficultyBlueprint: blueprint,
            passPercentage: passPercentage === "" ? null : Number(passPercentage),
            negativeMarking: false,
            maxAttempts: maxAttempts === "" ? 1 : Number(maxAttempts),
            topic,
            difficulty,
            assessmentType,
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
          await api(createUrl, {
            method: "POST",
            body: JSON.stringify(payload),
          });
          navigate(redirectTo, { replace: true });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create assessment.");
        }
      })();
    });
  }

  return (
    <form onSubmit={onSubmit} className="new-test-form" noValidate>
      <div className="new-test-tabs" role="tablist" aria-label="Assessment steps">
        {FORM_TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`new-test-panel-${t.id}`}
              id={`new-test-tab-${t.id}`}
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
            id="new-test-panel-paper"
            aria-labelledby="new-test-tab-paper"
          >
            <div>
              <label className="new-test-field__label" htmlFor="template">
                Template
              </label>
              <select
                id="template"
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="new-test-field__input"
              >
                <option value="">Custom</option>
                {ASSESSMENT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <AssessmentTypePicker
              id="assessment-type"
              value={assessmentType}
              onChange={setAssessmentType}
            />

            <div>
              <label className="new-test-field__label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="new-test-field__input"
                placeholder="Assessment title"
              />
            </div>

            <div>
              <label className="new-test-field__label" htmlFor="desc">
                Description <span className="new-test-field__optional">optional</span>
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="new-test-field__input"
                placeholder="Short note"
              />
            </div>
          </div>
        ) : null}

        {tab === "rules" ? (
          <div
            className="new-test-section__body"
            role="tabpanel"
            id="new-test-panel-rules"
            aria-labelledby="new-test-tab-rules"
          >
            {mcq ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="new-test-field__label" htmlFor="dur">
                    Duration (minutes)
                  </label>
                  <input
                    id="dur"
                    type="number"
                    min={5}
                    max={180}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="new-test-field__input"
                  />
                </div>
                <div>
                  <label className="new-test-field__label" htmlFor="qpa">
                    Questions per student
                  </label>
                  <input
                    id="qpa"
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
                <div>
                  <label className="new-test-field__label" htmlFor="pass-pct">
                    Pass percentage
                  </label>
                  <input
                    id="pass-pct"
                    type="number"
                    min={0}
                    max={100}
                    value={passPercentage}
                    onChange={(e) =>
                      setPassPercentage(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="new-test-field__input"
                  />
                </div>
                <div>
                  <label className="new-test-field__label" htmlFor="max-att">
                    Maximum attempts
                  </label>
                  <input
                    id="max-att"
                    type="number"
                    min={1}
                    max={20}
                    value={maxAttempts}
                    onChange={(e) =>
                      setMaxAttempts(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="new-test-field__input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className="new-test-field__label">Difficulty blueprint (optional)</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      min={0}
                      placeholder="Easy"
                      value={easyCount}
                      onChange={(e) =>
                        setEasyCount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="new-test-field__input"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Medium"
                      value={mediumCount}
                      onChange={(e) =>
                        setMediumCount(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="new-test-field__input"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Hard"
                      value={hardCount}
                      onChange={(e) =>
                        setHardCount(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      className="new-test-field__input"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="new-test-field__label" htmlFor="max-score">
                  Max score
                </label>
                <input
                  id="max-score"
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
            id="new-test-panel-questions"
            aria-labelledby="new-test-tab-questions"
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
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <div>
                        <label
                          className="new-test-field__label"
                          htmlFor={`marks-${safeActiveQ}`}
                        >
                          Marks
                        </label>
                        <input
                          id={`marks-${safeActiveQ}`}
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
                    </div>
                    <p className="new-test-field__label mt-3">
                      Options (select correct)
                    </p>
                    <div className="mt-1.5 space-y-2">
                      {activeQuestion.options.map((opt, oi) => (
                        <div key={oi} className="flex flex-wrap items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${safeActiveQ}`}
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
          <span className="new-test-sticky__draft">Draft</span>
        </div>
        <div className="new-test-sticky__actions">
          {tabIndex > 0 ? (
            <button type="button" onClick={goBack} className="new-test-sticky__nav">
              Back
            </button>
          ) : null}
          {tabIndex < FORM_TABS.length - 1 ? (
            <button type="button" onClick={goNext} className="new-test-sticky__nav new-test-sticky__nav--next">
              Next
            </button>
          ) : (
            <button type="submit" disabled={pending} className="new-test-sticky__submit">
              {pending ? "Saving…" : submitLabel}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
