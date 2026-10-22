/** Placement assessment catalog — not every assessment is an MCQ. */

export type AssessmentMethod = "MCQ" | "FACULTY_SCORE" | "PRACTICAL" | "SELF";

export type AssessmentTypeId =
  | "APTITUDE"
  | "TECHNICAL"
  | "ENGLISH"
  | "COMMUNICATION"
  | "PRESENTATION"
  | "GD"
  | "MOCK_INTERVIEW"
  | "RESUME"
  | "DIGITAL"
  | "SELF_ASSESSMENT";

export type AssessmentTypeDef = {
  id: AssessmentTypeId;
  label: string;
  method: AssessmentMethod;
  methodLabel: string;
  description: string;
};

export const ASSESSMENT_TYPES: AssessmentTypeDef[] = [
  {
    id: "APTITUDE",
    label: "Aptitude",
    method: "MCQ",
    methodLabel: "MCQ",
    description: "Timed multiple-choice aptitude paper.",
  },
  {
    id: "TECHNICAL",
    label: "Technical",
    method: "MCQ",
    methodLabel: "MCQ",
    description: "Pharmacy / technical MCQ assessment.",
  },
  {
    id: "ENGLISH",
    label: "English",
    method: "MCQ",
    methodLabel: "MCQ",
    description: "Verbal and English MCQ assessment.",
  },
  {
    id: "COMMUNICATION",
    label: "Communication",
    method: "FACULTY_SCORE",
    methodLabel: "Faculty assessment",
    description: "Faculty rates speaking, listening, and professional communication.",
  },
  {
    id: "PRESENTATION",
    label: "Presentation",
    method: "FACULTY_SCORE",
    methodLabel: "Faculty score",
    description: "Faculty scores a student presentation.",
  },
  {
    id: "GD",
    label: "Group Discussion (GD)",
    method: "FACULTY_SCORE",
    methodLabel: "Faculty score",
    description: "Faculty scores group discussion performance.",
  },
  {
    id: "MOCK_INTERVIEW",
    label: "Mock Interview",
    method: "FACULTY_SCORE",
    methodLabel: "Faculty score",
    description: "Faculty scores a mock interview.",
  },
  {
    id: "RESUME",
    label: "Resume",
    method: "FACULTY_SCORE",
    methodLabel: "Faculty evaluation",
    description: "Faculty evaluates the student resume.",
  },
  {
    id: "DIGITAL",
    label: "Digital Skills",
    method: "PRACTICAL",
    methodLabel: "Practical",
    description: "Practical digital skills task; faculty records the score.",
  },
  {
    id: "SELF_ASSESSMENT",
    label: "Self Assessment",
    method: "SELF",
    methodLabel: "Student",
    description: "Student submits a self-assessment score and brief reflection.",
  },
];

export function getAssessmentType(id: string | null | undefined): AssessmentTypeDef {
  return (
    ASSESSMENT_TYPES.find((t) => t.id === id) ??
    ASSESSMENT_TYPES.find((t) => t.id === "APTITUDE")!
  );
}

export function isMcqAssessment(id: string | null | undefined): boolean {
  return getAssessmentType(id).method === "MCQ";
}

export function isFacultyScoredAssessment(id: string | null | undefined): boolean {
  const m = getAssessmentType(id).method;
  return m === "FACULTY_SCORE" || m === "PRACTICAL";
}

export function isSelfAssessment(id: string | null | undefined): boolean {
  return getAssessmentType(id).method === "SELF";
}

export function normalizeAssessmentType(raw: unknown): AssessmentTypeId {
  const id = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (ASSESSMENT_TYPES.some((t) => t.id === id)) return id as AssessmentTypeId;
  return "APTITUDE";
}
