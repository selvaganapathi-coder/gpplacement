import type { Program, LevelType } from "./academic";
import type { SkillCategoryId, SkillDifficulty } from "./skillEngine";
import { APTITUDE_CURRICULUM } from "./aptitudeCurriculum";

export type CatalogSkill = {
  categoryId: SkillCategoryId;
  name: string;
  description?: string;
  difficulty: SkillDifficulty;
  weight: number;
  /** Programs this skill applies to */
  programs: Program[];
  /** Semester/year targets (empty = program-level only) */
  semesters: { program: Program; levelType: LevelType; level: number }[];
};

function topicsAsSkills(
  moduleId: string,
  categoryId: SkillCategoryId,
  difficulty: SkillDifficulty,
  programs: Program[],
  semesters: CatalogSkill["semesters"]
): CatalogSkill[] {
  const mod = APTITUDE_CURRICULUM.find((m) => m.id === moduleId);
  if (!mod) return [];
  return mod.topics.map((t) => ({
    categoryId,
    name: t.label,
    description: `${mod.label}: ${t.label}`,
    difficulty,
    weight: 1,
    programs,
    semesters,
  }));
}

const ALL: Program[] = ["DPHARM", "BPHARM", "MPHARM"];
const B8: CatalogSkill["semesters"] = [
  { program: "BPHARM", levelType: "SEMESTER", level: 8 },
];
const D_YEARS: CatalogSkill["semesters"] = [
  { program: "DPHARM", levelType: "YEAR", level: 1 },
  { program: "DPHARM", levelType: "YEAR", level: 2 },
  { program: "DPHARM", levelType: "SEMESTER", level: 3 },
  { program: "DPHARM", levelType: "SEMESTER", level: 4 },
];
const M_LATE: CatalogSkill["semesters"] = [
  { program: "MPHARM", levelType: "SEMESTER", level: 3 },
  { program: "MPHARM", levelType: "SEMESTER", level: 4 },
];

/** B.Pharm Sem VIII placement map categories from the plan. */
const B8_MAP_SEMESTERS: CatalogSkill["semesters"] = [...B8];

/**
 * Full Skill Master catalog for Sprint 1 seed.
 * B.Pharm VIII → Aptitude, Reasoning, English, Technical, Communication, Interview
 * D.Pharm / M.Pharm get subset maps.
 */
export function buildSkillCatalog(): CatalogSkill[] {
  const out: CatalogSkill[] = [];

  // Aptitude + Reasoning + English + Technical from curriculum (B.Pharm VIII + all programs)
  out.push(
    ...topicsAsSkills("quantitative", "APTITUDE", "MEDIUM", ALL, [
      ...B8_MAP_SEMESTERS,
      ...D_YEARS,
      ...M_LATE,
    ])
  );
  out.push(
    ...topicsAsSkills("logical", "REASONING", "MEDIUM", ALL, [
      ...B8_MAP_SEMESTERS,
      ...D_YEARS,
    ])
  );
  out.push(
    ...topicsAsSkills("verbal", "ENGLISH", "MEDIUM", ALL, [
      ...B8_MAP_SEMESTERS,
      ...D_YEARS,
      ...M_LATE,
    ])
  );
  out.push(
    ...topicsAsSkills("pharmacy_technical", "TECHNICAL", "HARD", ALL, [
      ...B8_MAP_SEMESTERS,
      ...D_YEARS,
      ...M_LATE,
    ])
  );

  // Communication (B.Pharm VIII map)
  const comm = [
    "Speaking",
    "Listening",
    "Presentation",
    "Professional communication",
    "Confidence",
  ];
  for (const name of comm) {
    out.push({
      categoryId: "COMMUNICATION",
      name,
      description: `Communication: ${name}`,
      difficulty: "MEDIUM",
      weight: 1,
      programs: ALL,
      semesters: [...B8_MAP_SEMESTERS, ...D_YEARS],
    });
  }

  // Interview (B.Pharm VIII map)
  const interview = [
    "Self introduction",
    "HR questions",
    "Technical interview",
    "Body language",
    "Salary discussion basics",
  ];
  for (const name of interview) {
    out.push({
      categoryId: "INTERVIEW",
      name,
      description: `Interview: ${name}`,
      difficulty: "MEDIUM",
      weight: 1,
      programs: ["BPHARM", "MPHARM"],
      semesters: [...B8_MAP_SEMESTERS, ...M_LATE],
    });
  }

  // Employability (D.Pharm + M.Pharm subset; also B.Pharm)
  const employ = [
    "Resume",
    "Group discussion",
    "Workplace behaviour",
    "Problem solving",
    "Teamwork",
    "Leadership",
  ];
  for (const name of employ) {
    out.push({
      categoryId: "EMPLOYABILITY",
      name,
      description: `Employability: ${name}`,
      difficulty: "EASY",
      weight: 1,
      programs: ALL,
      semesters: [...D_YEARS, ...M_LATE, ...B8],
    });
  }

  // Digital
  const digital = [
    "MS Office",
    "Email",
    "Internet research",
    "Basic data handling",
    "Professional online communication",
  ];
  for (const name of digital) {
    out.push({
      categoryId: "DIGITAL",
      name,
      description: `Digital: ${name}`,
      difficulty: "EASY",
      weight: 1,
      programs: ALL,
      semesters: [...D_YEARS, ...B8, ...M_LATE],
    });
  }

  return out;
}
