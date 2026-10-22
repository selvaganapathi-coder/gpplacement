import { normalizeAssessmentType } from "../shared/assessmentTypes";

export type ReadinessPillarId =
  | "APTITUDE"
  | "TECHNICAL"
  | "PHARMACY"
  | "COMMUNICATION";

export const READINESS_PILLARS: {
  id: ReadinessPillarId;
  label: string;
}[] = [
  { id: "APTITUDE", label: "Aptitude" },
  { id: "TECHNICAL", label: "Technical" },
  { id: "PHARMACY", label: "Pharmacy" },
  { id: "COMMUNICATION", label: "Communication" },
];

export type ReadinessAttemptInput = {
  attemptId: string;
  testId: string;
  title: string;
  assessmentType: string;
  topic?: string | null;
  score: number | null;
  percentage: number | null;
  maxScore: number;
  submittedAt: Date | string;
  /** Per-question outcomes for subject strength (MCQ). */
  questionOutcomes?: {
    topic: string | null;
    isCorrect: boolean;
    answered: boolean;
  }[];
};

export type PlacementReadinessPayload = {
  readiness: {
    overall: number | null;
    pillars: {
      id: ReadinessPillarId;
      label: string;
      percent: number | null;
      attempts: number;
    }[];
  };
  strongSubjects: {
    topic: string;
    percent: number;
    answered: number;
    correct: number;
  }[];
  weakSubjects: {
    topic: string;
    percent: number;
    answered: number;
    correct: number;
  }[];
  improvement: {
    direction: "up" | "down" | "flat" | "insufficient";
    delta: number | null;
    message: string;
    trend: {
      id: string;
      label: string;
      percent: number;
      submittedAt: string;
      assessmentType: string;
      pillar: ReadinessPillarId | null;
    }[];
  };
  testHistory: {
    attemptId: string;
    testId: string;
    title: string;
    assessmentType: string;
    pillar: ReadinessPillarId | null;
    pillarLabel: string | null;
    percent: number;
    score: number;
    maxScore: number;
    submittedAt: string;
  }[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isPharmacyContext(...parts: (string | null | undefined)[]): boolean {
  const t = parts.filter(Boolean).join(" ").toLowerCase();
  return /pharma|pharmacy|dosage|pharmaceut|pharmacol|drug|medicin|dispens|formulation|g\.?p\.?\s*pharm/.test(
    t
  );
}

export function pillarForAssessment(
  assessmentType: string,
  opts?: { topic?: string | null; title?: string | null }
): ReadinessPillarId | null {
  const type = normalizeAssessmentType(assessmentType);
  if (type === "APTITUDE" || type === "ENGLISH") return "APTITUDE";
  if (
    type === "COMMUNICATION" ||
    type === "PRESENTATION" ||
    type === "GD" ||
    type === "MOCK_INTERVIEW" ||
    type === "RESUME"
  ) {
    return "COMMUNICATION";
  }
  if (type === "TECHNICAL" || type === "DIGITAL") {
    if (isPharmacyContext(opts?.topic, opts?.title)) return "PHARMACY";
    // Digital skills → Technical; TECHNICAL without pharmacy keywords → Technical
    // If title/topic empty for TECHNICAL, treat as Pharmacy for G.P. Pharmacy campus default
    if (type === "TECHNICAL" && !String(opts?.topic ?? "").trim() && !String(opts?.title ?? "").trim()) {
      return "PHARMACY";
    }
    if (type === "TECHNICAL") {
      // Prefer Pharmacy when clearly pharmacy; otherwise Technical general
      return "TECHNICAL";
    }
    return "TECHNICAL";
  }
  return null;
}

function attemptPercent(a: ReadinessAttemptInput): number | null {
  if (a.score == null) return null;
  if (a.percentage != null && Number.isFinite(a.percentage)) return a.percentage;
  if (a.maxScore > 0) return round1((a.score / a.maxScore) * 100);
  return null;
}

export function buildPlacementReadiness(
  attempts: ReadinessAttemptInput[]
): PlacementReadinessPayload {
  const pillarBuckets = new Map<
    ReadinessPillarId,
    { sum: number; n: number }
  >();
  for (const p of READINESS_PILLARS) {
    pillarBuckets.set(p.id, { sum: 0, n: 0 });
  }

  const topicMap = new Map<
    string,
    { answered: number; correct: number }
  >();

  const history: PlacementReadinessPayload["testHistory"] = [];
  const trend: PlacementReadinessPayload["improvement"]["trend"] = [];

  const chronological = [...attempts].sort(
    (a, b) =>
      new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  for (const a of chronological) {
    const percent = attemptPercent(a);
    if (percent == null) continue;
    const pillar = pillarForAssessment(a.assessmentType, {
      topic: a.topic,
      title: a.title,
    });
    const pillarLabel =
      READINESS_PILLARS.find((p) => p.id === pillar)?.label ?? null;

    if (pillar) {
      const bucket = pillarBuckets.get(pillar)!;
      bucket.sum += percent;
      bucket.n += 1;
    }

    const submittedAt = new Date(a.submittedAt).toISOString();
    history.push({
      attemptId: a.attemptId,
      testId: a.testId,
      title: a.title,
      assessmentType: a.assessmentType,
      pillar,
      pillarLabel,
      percent,
      score: a.score ?? 0,
      maxScore: a.maxScore,
      submittedAt,
    });
    trend.push({
      id: a.attemptId,
      label: a.title,
      percent,
      submittedAt,
      assessmentType: a.assessmentType,
      pillar,
    });

    for (const q of a.questionOutcomes ?? []) {
      if (!q.answered) continue;
      const topic = (q.topic ?? "").trim() || "General";
      const row = topicMap.get(topic) ?? { answered: 0, correct: 0 };
      row.answered += 1;
      if (q.isCorrect) row.correct += 1;
      topicMap.set(topic, row);
    }
  }

  const pillars = READINESS_PILLARS.map((p) => {
    const b = pillarBuckets.get(p.id)!;
    return {
      id: p.id,
      label: p.label,
      percent: b.n > 0 ? round1(b.sum / b.n) : null,
      attempts: b.n,
    };
  });

  const scoredPillars = pillars.filter((p) => p.percent != null);
  const overall =
    scoredPillars.length > 0
      ? round1(
          scoredPillars.reduce((s, p) => s + (p.percent ?? 0), 0) /
            scoredPillars.length
        )
      : history.length > 0
        ? round1(history.reduce((s, h) => s + h.percent, 0) / history.length)
        : null;

  const subjects = [...topicMap.entries()]
    .map(([topic, row]) => ({
      topic,
      answered: row.answered,
      correct: row.correct,
      percent:
        row.answered > 0 ? round1((row.correct / row.answered) * 100) : 0,
    }))
    .filter((s) => s.answered >= 2);

  const strongSubjects = [...subjects]
    .sort((a, b) => b.percent - a.percent || b.answered - a.answered)
    .slice(0, 5);
  const weakSubjects = [...subjects]
    .sort((a, b) => a.percent - b.percent || b.answered - a.answered)
    .slice(0, 5);

  let direction: PlacementReadinessPayload["improvement"]["direction"] =
    "insufficient";
  let delta: number | null = null;
  let message = "Take more assessments to see improvement over time.";
  if (trend.length >= 2) {
    const mid = Math.floor(trend.length / 2);
    const first = trend.slice(0, mid);
    const second = trend.slice(mid);
    const avg = (xs: typeof trend) =>
      xs.reduce((s, x) => s + x.percent, 0) / xs.length;
    delta = round1(avg(second) - avg(first));
    if (delta >= 3) {
      direction = "up";
      message = `Improving — recent scores are about ${delta} points higher than earlier ones.`;
    } else if (delta <= -3) {
      direction = "down";
      message = `Recent scores are about ${Math.abs(delta)} points lower — focus on weak subjects.`;
    } else {
      direction = "flat";
      message = "Performance is steady across recent assessments.";
    }
  }

  return {
    readiness: { overall, pillars },
    strongSubjects,
    weakSubjects,
    improvement: { direction, delta, message, trend },
    testHistory: [...history].reverse(),
  };
}

/** Merge many students' readiness into a campus/class overall view. */
export function aggregateReadinessOverall(
  payloads: PlacementReadinessPayload[]
): PlacementReadinessPayload["readiness"] {
  const pillarBuckets = new Map<
    ReadinessPillarId,
    { sum: number; n: number }
  >();
  for (const p of READINESS_PILLARS) {
    pillarBuckets.set(p.id, { sum: 0, n: 0 });
  }
  let overallSum = 0;
  let overallN = 0;

  for (const payload of payloads) {
    if (payload.readiness.overall != null) {
      overallSum += payload.readiness.overall;
      overallN += 1;
    }
    for (const pillar of payload.readiness.pillars) {
      if (pillar.percent == null) continue;
      const b = pillarBuckets.get(pillar.id)!;
      b.sum += pillar.percent;
      b.n += 1;
    }
  }

  return {
    overall: overallN > 0 ? round1(overallSum / overallN) : null,
    pillars: READINESS_PILLARS.map((p) => {
      const b = pillarBuckets.get(p.id)!;
      return {
        id: p.id,
        label: p.label,
        percent: b.n > 0 ? round1(b.sum / b.n) : null,
        attempts: b.n,
      };
    }),
  };
}
