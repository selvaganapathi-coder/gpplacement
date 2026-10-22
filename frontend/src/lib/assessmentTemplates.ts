import type { Program } from "@/lib/academic";
import type { AssessmentTypeId } from "@/lib/assessmentTypes";

export type AssessmentTemplate = {
  id: string;
  label: string;
  description: string;
  title: string;
  assessmentType: AssessmentTypeId;
  durationMin: number;
  program: Program;
  levelType: "YEAR";
  level: number;
  questionsPerAttempt: number | "";
  passPercentage: number;
};

/** Named paper presets for G.P. Pharmacy College. */
export const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    id: "bpharm-1-aptitude",
    label: "B.Pharm 1st Year Aptitude",
    description: "Timed aptitude paper for B.Pharm Year 1.",
    title: "B.Pharm 1st Year — Aptitude",
    assessmentType: "APTITUDE",
    durationMin: 30,
    program: "BPHARM",
    levelType: "YEAR",
    level: 1,
    questionsPerAttempt: 25,
    passPercentage: 40,
  },
  {
    id: "dpharm-1-aptitude",
    label: "D.Pharm 1st Year Aptitude",
    description: "Timed aptitude paper for D.Pharm Year 1.",
    title: "D.Pharm 1st Year — Aptitude",
    assessmentType: "APTITUDE",
    durationMin: 30,
    program: "DPHARM",
    levelType: "YEAR",
    level: 1,
    questionsPerAttempt: 25,
    passPercentage: 40,
  },
  {
    id: "bpharm-2-aptitude",
    label: "B.Pharm 2nd Year Aptitude",
    description: "Timed aptitude paper for B.Pharm Year 2.",
    title: "B.Pharm 2nd Year — Aptitude",
    assessmentType: "APTITUDE",
    durationMin: 30,
    program: "BPHARM",
    levelType: "YEAR",
    level: 2,
    questionsPerAttempt: 25,
    passPercentage: 40,
  },
  {
    id: "pharmd-technical",
    label: "Pharm.D Technical",
    description: "Pharmacy technical MCQ for Pharm.D students.",
    title: "Pharm.D — Technical Assessment",
    assessmentType: "TECHNICAL",
    durationMin: 45,
    program: "PHARMD",
    levelType: "YEAR",
    level: 1,
    questionsPerAttempt: 30,
    passPercentage: 50,
  },
  {
    id: "mpharm-technical",
    label: "M.Pharm Technical",
    description: "Advanced technical MCQ for M.Pharm.",
    title: "M.Pharm — Technical Assessment",
    assessmentType: "TECHNICAL",
    durationMin: 45,
    program: "MPHARM",
    levelType: "YEAR",
    level: 1,
    questionsPerAttempt: 30,
    passPercentage: 50,
  },
  {
    id: "placement-mock",
    label: "Placement Mock Test",
    description: "Full placement mock (aptitude style) for all degrees.",
    title: "Placement Mock Test",
    assessmentType: "APTITUDE",
    durationMin: 60,
    program: "BPHARM",
    levelType: "YEAR",
    level: 3,
    questionsPerAttempt: 50,
    passPercentage: 50,
  },
];
