/** Module 1 — Placement aptitude curriculum (topics for tagging MCQs). */

export type AptitudeModuleId =
  | "quantitative"
  | "logical"
  | "verbal"
  | "pharmacy_technical"
  | "communication"
  | "employability"
  | "digital";

export type AptitudeTopic = {
  id: string;
  label: string;
};

export type AptitudeModule = {
  id: AptitudeModuleId;
  label: string;
  /** Short code shown in UI / imports */
  code: string;
  topics: AptitudeTopic[];
};

export const APTITUDE_CURRICULUM: AptitudeModule[] = [
  {
    id: "quantitative",
    code: "QA",
    label: "Quantitative Aptitude",
    topics: [
      { id: "percentages", label: "Percentages" },
      { id: "profit_loss", label: "Profit & Loss" },
      { id: "ratio", label: "Ratio" },
      { id: "average", label: "Average" },
      { id: "time_work", label: "Time & Work" },
      { id: "time_distance", label: "Time & Distance" },
      { id: "simple_interest", label: "Simple Interest" },
      { id: "compound_interest", label: "Compound Interest" },
      { id: "data_interpretation", label: "Data Interpretation" },
    ],
  },
  {
    id: "logical",
    code: "LR",
    label: "Logical Reasoning",
    topics: [
      { id: "number_series", label: "Number series" },
      { id: "coding_decoding", label: "Coding & decoding" },
      { id: "blood_relations", label: "Blood relations" },
      { id: "directions", label: "Directions" },
      { id: "syllogism", label: "Syllogism" },
      { id: "puzzles", label: "Puzzles" },
      { id: "data_sufficiency", label: "Data sufficiency" },
      { id: "logical_sequences", label: "Logical sequences" },
    ],
  },
  {
    id: "verbal",
    code: "VE",
    label: "Verbal & English",
    topics: [
      { id: "grammar", label: "Grammar" },
      { id: "vocabulary", label: "Vocabulary" },
      { id: "reading_comprehension", label: "Reading comprehension" },
      { id: "sentence_correction", label: "Sentence correction" },
      { id: "fill_blanks", label: "Fill in the blanks" },
      { id: "communication_english", label: "Communication" },
    ],
  },
  {
    id: "pharmacy_technical",
    code: "PT",
    label: "Pharmacy Technical Skills",
    topics: [
      { id: "pharmaceutics_dosage", label: "Pharmaceutics — Dosage forms" },
      { id: "pharmaceutics_manufacturing", label: "Pharmaceutics — Manufacturing" },
      { id: "pharmaceutics_formulation", label: "Pharmaceutics — Formulation" },
      { id: "pharmaceutics_qc", label: "Pharmaceutics — Quality control" },
      { id: "pharmacology_classes", label: "Pharmacology — Drug classes" },
      { id: "pharmacology_moa", label: "Pharmacology — Mechanism of action" },
      { id: "pharmacology_adverse", label: "Pharmacology — Adverse effects" },
      { id: "pharmacology_therapeutic", label: "Pharmacology — Therapeutic uses" },
      { id: "pharm_chem_structures", label: "Pharm. Chemistry — Drug structures" },
      { id: "pharm_chem_properties", label: "Pharm. Chemistry — Chemical properties" },
      { id: "pharm_chem_analysis", label: "Pharm. Chemistry — Analysis" },
      { id: "pharmacognosy_crude", label: "Pharmacognosy — Crude drugs" },
      { id: "pharmacognosy_natural", label: "Pharmacognosy — Natural products" },
      { id: "pharmacognosy_id", label: "Pharmacognosy — Identification" },
      { id: "practice_dispensing", label: "Pharmacy Practice — Dispensing" },
      { id: "practice_counselling", label: "Pharmacy Practice — Patient counselling" },
      { id: "practice_hospital", label: "Pharmacy Practice — Hospital pharmacy" },
      { id: "practice_prescription", label: "Pharmacy Practice — Prescription interpretation" },
    ],
  },
  {
    id: "communication",
    code: "CS",
    label: "Communication Skills",
    topics: [
      { id: "speaking", label: "Speaking" },
      { id: "listening", label: "Listening" },
      { id: "presentation", label: "Presentation" },
      { id: "professional_communication", label: "Professional communication" },
      { id: "confidence", label: "Confidence" },
    ],
  },
  {
    id: "employability",
    code: "ES",
    label: "Employability Skills",
    topics: [
      { id: "resume", label: "Resume" },
      { id: "interview", label: "Interview skills" },
      { id: "group_discussion", label: "Group discussion" },
      { id: "workplace_behaviour", label: "Workplace behaviour" },
      { id: "problem_solving", label: "Problem solving" },
      { id: "teamwork", label: "Teamwork" },
      { id: "leadership", label: "Leadership" },
    ],
  },
  {
    id: "digital",
    code: "DS",
    label: "Digital Skills",
    topics: [
      { id: "ms_office", label: "MS Office" },
      { id: "email", label: "Email" },
      { id: "internet_research", label: "Internet research" },
      { id: "data_handling", label: "Basic data handling" },
      { id: "online_communication", label: "Professional online communication" },
    ],
  },
];

/** Canonical topic label stored on Question.topic (module › topic). */
export function aptitudeTopicLabel(moduleLabel: string, topicLabel: string): string {
  return `${moduleLabel} › ${topicLabel}`;
}

export function listAptitudeTopicLabels(): string[] {
  const out: string[] = [];
  for (const mod of APTITUDE_CURRICULUM) {
    for (const t of mod.topics) {
      out.push(aptitudeTopicLabel(mod.label, t.label));
    }
  }
  return out;
}

export function findAptitudeTopicByLabel(label: string | null | undefined): {
  module: AptitudeModule;
  topic: AptitudeTopic;
} | null {
  const raw = String(label ?? "").trim();
  if (!raw) return null;
  for (const mod of APTITUDE_CURRICULUM) {
    for (const t of mod.topics) {
      const full = aptitudeTopicLabel(mod.label, t.label);
      if (
        full.toLowerCase() === raw.toLowerCase() ||
        t.label.toLowerCase() === raw.toLowerCase()
      ) {
        return { module: mod, topic: t };
      }
    }
  }
  return null;
}
