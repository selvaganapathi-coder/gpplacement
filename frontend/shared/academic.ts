export type Program =
  | "ENGINEERING"
  | "CSE"
  | "IT"
  | "SCIENCE"
  | "ARTS"
  | "MANAGEMENT"
  | "COMMERCE"
  | "BPHARM"
  | "DPHARM"
  | "MPHARM"
  | "PHARMD"
  | "OTHER";
/** Always YEAR in the portal UI — SEMESTER kept for legacy DB rows only. */
export type LevelType = "YEAR" | "SEMESTER";
export type Section = "A" | "B";

export const SECTIONS: Section[] = ["A", "B"];

/**
 * Courses offered at G.P. Pharmacy College (https://gppharmacycollege.com/):
 * D.Pharm (2y), B.Pharm (4y), M.Pharm (2y), Pharm.D (6y).
 * Other Program enum values stay for legacy DB rows only.
 */
export const COLLEGE_ACTIVE_PROGRAMS: Program[] = [
  "DPHARM",
  "BPHARM",
  "MPHARM",
  "PHARMD",
];

export const COLLEGE_EMAIL_DOMAIN = "gppharmacy.edu";

type Track = {
  levelType: LevelType;
  trackLabel: string;
  levels: { value: number; label: string }[];
};

const YEAR_ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"] as const;

/** Batches the college starts with. Admin can add more. */
export const DEFAULT_BATCH_YEARS = [2023, 2024, 2025, 2026, 2027] as const;

/** College batches are named from this joining year onward. */
export const EARLIEST_BATCH_YEAR = 1990;

/** Academic year turns over in June (month index 5). */
const ACADEMIC_YEAR_START_MONTH = 5;

/** Joining year of the batch that is in 1st year right now. */
export function currentAdmissionYear(now = new Date()): number {
  const year = now.getFullYear();
  return now.getMonth() >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
}

export function isBatchYear(level: number): boolean {
  return level >= EARLIEST_BATCH_YEAR && level <= 2100;
}

/** Calendar joining year. Legacy study years 1–12 map onto the current course. */
export function batchYearOf(
  level: number | null | undefined,
  now = new Date()
): number | null {
  if (level == null || Number.isNaN(level)) return null;
  if (isBatchYear(level)) return level;
  if (level >= 1 && level <= 12) return currentAdmissionYear(now) - (level - 1);
  return null;
}

/** Stored level plus the other form (study year or calendar batch) of the same cohort. */
export function equivalentLevels(level: number | null | undefined, now = new Date()): number[] {
  if (level == null) return [];
  const batch = batchYearOf(level, now);
  const out = new Set<number>([level]);
  if (batch != null) {
    out.add(batch);
    const study = currentAdmissionYear(now) - batch + 1;
    if (study >= 1 && study <= 12) out.add(study);
  }
  return [...out];
}

function yearLevels(_count?: number): { value: number; label: string }[] {
  return DEFAULT_BATCH_YEARS.map((year) => ({
    value: year,
    label: `${year} batch`,
  }));
}

export const PROGRAM_CONFIG: Record<
  Program,
  { label: string; duration: string; tracks: Track[] }
> = {
  ENGINEERING: {
    label: "B.Tech / Engineering",
    duration: "4 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(4) }],
  },
  CSE: {
    label: "Computer Science",
    duration: "4 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(4) }],
  },
  IT: {
    label: "Information Technology",
    duration: "4 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(4) }],
  },
  SCIENCE: {
    label: "B.Sc / Science",
    duration: "3 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(3) }],
  },
  ARTS: {
    label: "B.A / Arts",
    duration: "3 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(3) }],
  },
  MANAGEMENT: {
    label: "MBA / Management",
    duration: "2 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(2) }],
  },
  COMMERCE: {
    label: "B.Com / Commerce",
    duration: "3 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(3) }],
  },
  DPHARM: {
    label: "D.Pharm (Diploma in Pharmacy)",
    duration: "2 years",
    tracks: [{ levelType: "YEAR", trackLabel: "Batch", levels: yearLevels(2) }],
  },
  BPHARM: {
    label: "B.Pharm (Bachelor of Pharmacy)",
    duration: "4 years",
    tracks: [{ levelType: "YEAR", trackLabel: "Batch", levels: yearLevels(4) }],
  },
  MPHARM: {
    label: "M.Pharm (Master of Pharmacy)",
    duration: "2 years after B.Pharm",
    tracks: [{ levelType: "YEAR", trackLabel: "Batch", levels: yearLevels(2) }],
  },
  PHARMD: {
    label: "Pharm.D (Doctor of Pharmacy)",
    duration: "6 years after 12th: 5 years of study plus 1 year of internship",
    tracks: [{ levelType: "YEAR", trackLabel: "Batch", levels: yearLevels() }],
  },
  OTHER: {
    label: "Other / Custom",
    duration: "4 years · sections A / B",
    tracks: [{ levelType: "YEAR", trackLabel: "Year", levels: yearLevels(4) }],
  },
};

const PROGRAM_SLUG: Record<Program, string> = {
  ENGINEERING: "eng",
  CSE: "cse",
  IT: "it",
  SCIENCE: "sci",
  ARTS: "arts",
  MANAGEMENT: "mgmt",
  COMMERCE: "com",
  BPHARM: "bpharm",
  DPHARM: "dpharm",
  MPHARM: "mpharm",
  PHARMD: "pharmd",
  OTHER: "other",
};

/** Active college courses only — used in Account directory, create user, class links. */
export function programOptions(): { id: Program; label: string }[] {
  return COLLEGE_ACTIVE_PROGRAMS.map((id) => ({
    id,
    label: PROGRAM_CONFIG[id].label.split(" (")[0]!,
  }));
}

export function tracksForProgram(program: Program): Track[] {
  return PROGRAM_CONFIG[program].tracks;
}

function yearTrackForProgram(program: Program): Track {
  const track = PROGRAM_CONFIG[program].tracks.find((t) => t.levelType === "YEAR");
  if (!track) throw new Error(`No YEAR track for ${program}`);
  return track;
}

export { yearTrackForProgram };

export function parseSection(v: string | null | undefined): Section | null {
  if (v == null) return null;
  const u = String(v).trim().toUpperCase();
  if (u === "A" || u === "SEC A" || u === "SECTION A") return "A";
  if (u === "B" || u === "SEC B" || u === "SECTION B") return "B";
  return null;
}

export function formatAcademic(
  program: Program | null | undefined,
  levelType: LevelType | null | undefined,
  level: number | null | undefined,
  section?: Section | string | null | undefined
): string {
  if (!program) return "—";
  const short =
    PROGRAM_CONFIG[program]?.label.split(" (")[0] ??
    programOptions().find((p) => p.id === program)?.label ??
    program;
  if (!levelType || level == null) return short;
  const levelLabel = formatStudyLabel(program, levelType, level);
  const sec = parseSection(section ?? null);
  return sec ? `${short} · ${levelLabel} · Sec ${sec}` : `${short} · ${levelLabel}`;
}

export function buildScopeKey(
  program: Program,
  levelType?: LevelType | null,
  level?: number | null,
  section?: Section | string | null
): string {
  if (!levelType) return program;
  if (level == null) return `${program}:${levelType}`;
  const sec = parseSection(section ?? null);
  if (!sec) return `${program}:${levelType}:${level}`;
  return `${program}:${levelType}:${level}:${sec}`;
}

export function parseScopeKey(key: string): {
  program: Program;
  levelType: LevelType | null;
  level: number | null;
  section: Section | null;
} {
  const parts = key.split(":");
  const program = parts[0] as Program;
  if (parts.length === 1) return { program, levelType: null, level: null, section: null };
  const levelType = parts[1] as LevelType;
  if (parts.length === 2) return { program, levelType, level: null, section: null };
  const level = Number(parts[2]);
  const section = parts.length >= 4 ? parseSection(parts[3]) : null;
  return { program, levelType, level, section };
}

export function parseProgram(v: string): Program | null {
  const u = v
    .toUpperCase()
    .trim()
    .replace(/[.\s_-]+/g, "");
  if (u === "ENGINEERING" || u === "ENG" || u === "BTECH") return "ENGINEERING";
  if (u === "CSE" || u === "CS" || u === "COMPUTERSCIENCE") return "CSE";
  if (u === "IT" || u === "INFORMATIONTECHNOLOGY") return "IT";
  if (u === "SCIENCE" || u === "BSC" || u === "SC") return "SCIENCE";
  if (u === "ARTS" || u === "BA") return "ARTS";
  if (u === "MANAGEMENT" || u === "MBA" || u === "MGMT") return "MANAGEMENT";
  if (u === "COMMERCE" || u === "BCOM") return "COMMERCE";
  if (u === "DPHARM" || u === "DPHARMACY") return "DPHARM";
  if (u === "BPHARM" || u === "BPHARMACY") return "BPHARM";
  if (u === "MPHARM" || u === "MPHARMACY") return "MPHARM";
  if (u === "PHARMD" || u === "PHARMDDOCTOR" || u === "DOCTOROFPHARMACY") return "PHARMD";
  if (u === "OTHER" || u === "CUSTOM") return "OTHER";
  if ((Object.keys(PROGRAM_CONFIG) as Program[]).includes(u as Program)) return u as Program;
  return null;
}

export function parseLevelType(v: string): LevelType | null {
  const u = v
    .toUpperCase()
    .trim()
    .replace(/[.\s_-]+/g, "");
  if (u === "YEAR" || u === "YR" || u === "Y") return "YEAR";
  if (u === "SEMESTER" || u === "SEM" || u === "S") return "SEMESTER";
  return null;
}

export type CohortPreset = {
  program: Program;
  levelType: LevelType;
  level: number;
  section: Section;
  label: string;
  slug: string;
};

export function listCohortPresets(): CohortPreset[] {
  const out: CohortPreset[] = [];
  for (const program of COLLEGE_ACTIVE_PROGRAMS) {
    const track = yearTrackForProgram(program);
    const slug = PROGRAM_SLUG[program];
    const short = PROGRAM_CONFIG[program].label.split(" (")[0]!;
    for (const l of track.levels) {
      for (const section of SECTIONS) {
        out.push({
          program,
          levelType: "YEAR",
          level: l.value,
          section,
          label: `${short} · ${l.label} · Sec ${section}`,
          slug,
        });
      }
    }
  }
  return out;
}

/** All class cohorts (degree × year × section) for allocation pickers. */
export function allClassCohorts(): {
  key: string;
  program: Program;
  levelType: LevelType;
  level: number;
  section: Section;
  label: string;
}[] {
  return listCohortPresets().map((c) => ({
    key: buildScopeKey(c.program, c.levelType, c.level, c.section),
    program: c.program,
    levelType: c.levelType,
    level: c.level,
    section: c.section,
    label: c.label,
  }));
}

export function suggestEmail(
  role: "STUDENT" | "STAFF",
  preset: CohortPreset,
  slot: number
): string {
  const prefix = role === "STAFF" ? "staff" : "student";
  const slotStr = role === "STAFF" ? String(slot) : String(slot).padStart(2, "0");
  return `${prefix}.${preset.slug}.y${preset.level}.${slotStr}@${COLLEGE_EMAIL_DOMAIN}`;
}

export function suggestName(
  role: "STUDENT" | "STAFF",
  preset: CohortPreset,
  slot: number
): string {
  const slotStr = role === "STAFF" ? String(slot) : String(slot).padStart(2, "0");
  const short = programOptions().find((p) => p.id === preset.program)?.label ?? preset.program;
  return role === "STAFF"
    ? `${short} Y${preset.level} Staff ${slotStr}`
    : `${short} Y${preset.level} Student ${slotStr}`;
}

export function validateStudentAcademic(
  program: Program | null,
  levelType: LevelType | null,
  level: number | null,
  _section?: Section | null
): string | null {
  if (!program) {
    if (levelType || level != null) return "Set program when assigning year.";
    return null;
  }
  // Year is optional — department-only assignment is allowed.
  if (!levelType && level == null) return null;
  if (!levelType || level == null) return "Select a batch, or clear it for the whole department.";
  if (isBatchYear(level) || (level >= 1 && level <= 12)) return null;
  return "Invalid batch year.";
}

/** Normalize roll / register number for storage (trim; keep leading zeros). */
export function normalizeRollNo(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

/** Infer roll from emails like student.cse.y3.a.01@… */
export function inferRollNoFromEmail(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const m = local.match(/\.(\d+)$/);
  if (m) return m[1];
  const digits = local.match(/(\d+)$/);
  return digits ? digits[1] : null;
}

export function effectiveRollNo(
  rollNo: string | null | undefined,
  email: string
): string | null {
  return normalizeRollNo(rollNo) ?? inferRollNoFromEmail(email);
}

export function formatRollDisplay(roll: string | null | undefined): string {
  if (!roll) return "—";
  return roll;
}

/** Sort: roll ascending (numeric when possible), then name A→Z. */
export function compareByRollThenName(
  a: { rollNo?: string | null; email: string; name: string },
  b: { rollNo?: string | null; email: string; name: string }
): number {
  const ra = effectiveRollNo(a.rollNo, a.email);
  const rb = effectiveRollNo(b.rollNo, b.email);
  if (ra && rb) {
    const cmp = ra.localeCompare(rb, undefined, { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return cmp;
  } else if (ra && !rb) return -1;
  else if (!ra && rb) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function classSortKey(
  program: Program | null | undefined,
  levelType: LevelType | null | undefined,
  level: number | null | undefined,
  section?: Section | string | null
): string {
  const p = program ?? "ZZZ";
  const t = levelType === "YEAR" ? "0" : levelType === "SEMESTER" ? "1" : "9";
  const l = level != null ? String(level).padStart(2, "0") : "99";
  const s = parseSection(section ?? null) ?? "Z";
  return `${p}:${t}:${l}:${s}`;
}

/** Map stored year/semester to academic year (1–4). */
export function academicYearOf(
  program: Program | null | undefined,
  levelType: LevelType | null | undefined,
  level: number | null | undefined
): number | null {
  if (!program || level == null) return null;
  if (levelType === "YEAR") return level;
  if (levelType === "SEMESTER") return Math.ceil(level / 2);
  return level;
}

export function formatYearLabel(year: number): string {
  const ord = YEAR_ORDINAL[year - 1];
  return ord ? `${ord} Year` : `Year ${year}`;
}

/** Always "2025 batch", including when the row still stores a study year (1–6). */
export function formatStudyLabel(
  _program: Program | null | undefined,
  _levelType: LevelType | null | undefined,
  level: number | null | undefined
): string {
  if (level == null) return "—";
  const batch = batchYearOf(level);
  if (batch != null) return `${batch} batch`;
  return formatYearLabel(level);
}

/** Years for a selected course only — empty until a program is chosen. */
export function yearOptionsForProgram(program?: Program | "" | null): {
  value: number;
  label: string;
}[] {
  if (!program) return [];
  return yearTrackForProgram(program).levels.map((l) => ({
    value: l.value,
    label: l.label,
  }));
}

export function matchesAcademicYear(
  program: Program | null | undefined,
  levelType: LevelType | null | undefined,
  level: number | null | undefined,
  year: number
): boolean {
  return batchYearOf(level) === batchYearOf(year);
}

/** Max year for a program (final year — cannot promote past this). */
export function maxYearForProgram(program: Program): number {
  const track = yearTrackForProgram(program);
  return Math.max(...track.levels.map((l) => l.value));
}

/** Next year after promotion, or null if already at final year. */
export function nextYearAfterPromote(
  program: Program,
  fromYear: number
): number | null {
  const max = maxYearForProgram(program);
  if (fromYear < 1 || fromYear >= max) return null;
  return fromYear + 1;
}

/** Cohorts that can be promoted (excludes final-year classes). */
export function promotableClassCohorts(): {
  key: string;
  program: Program;
  levelType: LevelType;
  level: number;
  section: Section;
  label: string;
  toYear: number;
  toLabel: string;
}[] {
  const out: {
    key: string;
    program: Program;
    levelType: LevelType;
    level: number;
    section: Section;
    label: string;
    toYear: number;
    toLabel: string;
  }[] = [];
  for (const c of listCohortPresets()) {
    const toYear = nextYearAfterPromote(c.program, c.level);
    if (toYear == null) continue;
    out.push({
      key: buildScopeKey(c.program, c.levelType, c.level, c.section),
      program: c.program,
      levelType: c.levelType,
      level: c.level,
      section: c.section,
      label: c.label,
      toYear,
      toLabel: formatAcademic(c.program, "YEAR", toYear, c.section),
    });
  }
  return out;
}

/** Year batches (both sections) that can be promoted. */
export function promotableYearBatches(): {
  key: string;
  program: Program;
  levelType: LevelType;
  level: number;
  label: string;
  toYear: number;
  toLabel: string;
}[] {
  const seen = new Set<string>();
  const out: {
    key: string;
    program: Program;
    levelType: LevelType;
    level: number;
    label: string;
    toYear: number;
    toLabel: string;
  }[] = [];
  for (const c of listCohortPresets()) {
    const batchKey = `${c.program}:YEAR:${c.level}`;
    if (seen.has(batchKey)) continue;
    seen.add(batchKey);
    const toYear = nextYearAfterPromote(c.program, c.level);
    if (toYear == null) continue;
    out.push({
      key: batchKey,
      program: c.program,
      levelType: "YEAR",
      level: c.level,
      label: `${formatAcademic(c.program, "YEAR", c.level)} (Sec A + B)`,
      toYear,
      toLabel: `${formatAcademic(c.program, "YEAR", toYear)} (Sec A + B)`,
    });
  }
  return out;
}
