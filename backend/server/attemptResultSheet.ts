import {
  buildAttemptPlan,
  materializePlanForStudent,
  parseAttemptPlan,
} from "./attemptShuffle";

type OptionRow = {
  id: string;
  text: string;
  isCorrect: boolean;
};

type QuestionRow = {
  id: string;
  prompt: string;
  topic: string | null;
  marks: number;
  explanation: string | null;
  options: OptionRow[];
};

type AnswerRow = {
  questionId: string;
  optionId: string | null;
};

/**
 * Build per-question correct/incorrect review for an MCQ attempt (staff or student).
 */
export function buildMcqAttemptResultSheet(args: {
  attemptId: string;
  questionPlan: string | null;
  questionsPerAttempt: number | null;
  questions: QuestionRow[];
  answers: AnswerRow[];
  maxScoreFromMarks: (qs: { marks?: number | null }[]) => number;
}) {
  const bank = args.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    topic: q.topic,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }));
  const plan = parseAttemptPlan(args.questionPlan);
  const ordered = plan
    ? materializePlanForStudent(bank, plan)
    : materializePlanForStudent(
        bank,
        buildAttemptPlan(
          bank,
          args.questionsPerAttempt,
          `${args.attemptId}:legacy`
        )
      );

  const maxScore = args.maxScoreFromMarks(
    ordered.map((q) => {
      const full = args.questions.find((fq) => fq.id === q.id);
      return { marks: full?.marks };
    })
  );

  const questions = ordered.map((q) => {
    const full = args.questions.find((fq) => fq.id === q.id)!;
    const answer = args.answers.find((a) => a.questionId === q.id);
    const chosen = full.options.find((o) => o.id === answer?.optionId);
    const correct = full.options.find((o) => o.isCorrect);
    return {
      id: q.id,
      prompt: q.prompt,
      marks: full.marks,
      explanation: full.explanation,
      chosenText: chosen?.text ?? null,
      correctText: correct?.text ?? "",
      isCorrect: !!chosen?.isCorrect,
    };
  });

  return { maxScore, questions };
}
