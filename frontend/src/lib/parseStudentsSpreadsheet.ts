import * as XLSX from "xlsx";
import {
  inferRollNoFromEmail,
  listCohortPresets,
  normalizeRollNo,
  parseLevelType,
  parseProgram,
  parseSection,
  suggestEmail,
  validateStudentAcademic,
  type LevelType,
  type Program,
  type Section,
} from "../../shared/academic";

export type PeopleImportRole = "STUDENT" | "STAFF";

export type StudentImportRow = {
  email: string;
  name: string;
  role: PeopleImportRole;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section: Section | null;
  rollNo: string | null;
};

export type ImportInvalidRow = {
  rowNum: number;
  email: string;
  name: string;
  role: string;
  error: string;
};

export type ParseStudentsResult =
  | {
      ok: true;
      students: StudentImportRow[];
      invalid: ImportInvalidRow[];
      warnings: string[];
    }
  | { ok: false; error: string };

type ParsedRaw = {
  email?: string;
  name?: string;
  role?: string;
  program?: string;
  levelType?: string;
  level?: string;
  section?: string;
  rollNo?: string;
};

const HEADER_ALIASES: Record<string, keyof ParsedRaw> = {
  email: "email",
  "e mail": "email",
  "email address": "email",
  "student email": "email",
  mail: "email",
  name: "name",
  "full name": "name",
  "student name": "name",
  student: "name",
  role: "role",
  type: "role",
  "account type": "role",
  program: "program",
  course: "program",
  degree: "program",
  branch: "program",
  department: "program",
  "level type": "levelType",
  leveltype: "levelType",
  track: "levelType",
  level: "level",
  semester: "level",
  sem: "level",
  year: "level",
  "year semester": "level",
  section: "section",
  sec: "section",
  class: "section",
  roll: "rollNo",
  "roll no": "rollNo",
  "roll number": "rollNo",
  rollno: "rollNo",
  "roll no.": "rollNo",
  regno: "rollNo",
  "reg no": "rollNo",
  "register no": "rollNo",
  "registration no": "rollNo",
};

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function mapSheetRow(raw: Record<string, unknown>): ParsedRaw {
  const mapped: ParsedRaw = {};
  for (const [key, val] of Object.entries(raw)) {
    const field = HEADER_ALIASES[normHeader(key)];
    if (field) mapped[field] = cellStr(val);
  }
  return mapped;
}

function parseRole(raw: string): PeopleImportRole | null {
  const u = raw.trim().toUpperCase();
  if (!u || u === "STUDENT" || u === "STU" || u === "S") return "STUDENT";
  if (u === "STAFF" || u === "TEACHER" || u === "FACULTY" || u === "T") return "STAFF";
  return null;
}

function autoEmail(
  role: PeopleImportRole,
  program: Program | null,
  level: number | null,
  rollNo: string | null
): string | null {
  if (!program || level == null || !rollNo) return null;
  const slot = Number(rollNo);
  if (!Number.isFinite(slot) || slot < 1) return null;
  const cohort = listCohortPresets().find(
    (c) => c.program === program && c.level === level
  );
  if (!cohort) return null;
  return suggestEmail(role === "STAFF" ? "STAFF" : "STUDENT", cohort, slot);
}

function rowToPerson(
  row: ParsedRaw,
  rowNum: number
): { student: StudentImportRow } | { error: string; email: string; name: string; role: string } | null {
  let email = cellStr(row.email).toLowerCase();
  const name = cellStr(row.name);
  const roleRaw = cellStr(row.role);
  const programRaw = cellStr(row.program);
  const levelTypeRaw = cellStr(row.levelType);
  const levelRaw = cellStr(row.level);
  const sectionRaw = cellStr(row.section);
  const rollRaw = cellStr(row.rollNo);

  if (!email && !name && !programRaw && !levelRaw && !sectionRaw && !rollRaw && !roleRaw)
    return null;

  const role = parseRole(roleRaw || "STUDENT");
  if (!role) {
    return {
      error: `Unknown role "${roleRaw}" (use Student or Staff).`,
      email,
      name,
      role: roleRaw,
    };
  }

  const program = programRaw ? parseProgram(programRaw) : null;
  if (programRaw && !program) {
    return {
      error: `Unknown course "${programRaw}" (use DPHARM, BPHARM, MPHARM, or PHARMD).`,
      email,
      name,
      role,
    };
  }

  let levelType = levelTypeRaw ? parseLevelType(levelTypeRaw) : null;
  if (levelTypeRaw && !levelType) {
    return {
      error: `Unknown level type "${levelTypeRaw}" (use YEAR, or leave blank).`,
      email,
      name,
      role,
    };
  }

  const level =
    levelRaw !== "" && !Number.isNaN(Number(levelRaw)) ? Number(levelRaw) : null;
  if (levelRaw !== "" && level == null) {
    return {
      error: "Year must be a number.",
      email,
      name,
      role,
    };
  }

  if (!levelType && level != null) levelType = "YEAR";
  const section = parseSection(sectionRaw || null);
  const rollNo = normalizeRollNo(rollRaw) ?? (email ? inferRollNoFromEmail(email) : null);

  if (!email) {
    const generated = autoEmail(role, program, level, rollNo);
    if (generated) email = generated;
  }

  if (!email || !name) {
    return {
      error:
        role === "STAFF"
          ? "Email and name are required."
          : "Email and name are required (or Course + Year + Roll to auto-build email).",
      email,
      name,
      role,
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: `Invalid email "${email}".`, email, name, role };
  }

  if (role === "STAFF") {
    if (!program) {
      return {
        error: "Staff need a course/department (BPHARM, DPHARM, …).",
        email,
        name,
        role,
      };
    }
    return {
      student: {
        email,
        name,
        role,
        program,
        levelType: null,
        level: null,
        section: null,
        rollNo: null,
      },
    };
  }

  const acErr = validateStudentAcademic(program, levelType, level, section);
  if (acErr) return { error: acErr, email, name, role };

  return {
    student: { email, name, role, program, levelType, level, section, rollNo },
  };
}

function parseRows(rows: Record<string, unknown>[]): ParseStudentsResult {
  const students: StudentImportRow[] = [];
  const invalid: ImportInvalidRow[] = [];
  const warnings: string[] = [];
  const seenEmail = new Set<string>();
  const seenRollKey = new Set<string>();
  let duplicatesRemoved = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const mapped = mapSheetRow(rows[i]!);
    const result = rowToPerson(mapped, rowNum);
    if (result == null) continue;
    if ("error" in result) {
      invalid.push({
        rowNum,
        email: result.email,
        name: result.name,
        role: result.role,
        error: result.error,
      });
      continue;
    }
    const s = result.student;

    if (seenEmail.has(s.email)) {
      duplicatesRemoved++;
      warnings.push(`Duplicate email removed (kept last): ${s.email}`);
      const idx = students.findIndex((x) => x.email === s.email);
      if (idx >= 0) {
        const old = students[idx]!;
        const oldRollKey = `${old.role}:${old.program}:${old.level}:${old.section ?? ""}:${old.rollNo ?? ""}`;
        seenRollKey.delete(oldRollKey);
        students.splice(idx, 1);
      }
    }

    const rollKey = `${s.role}:${s.program}:${s.level}:${s.section ?? ""}:${s.rollNo ?? ""}`;
    if (s.role === "STUDENT" && s.rollNo && seenRollKey.has(rollKey)) {
      duplicatesRemoved++;
      warnings.push(
        `Duplicate roll in same class removed (kept last): ${s.rollNo} · ${s.program} Y${s.level}`
      );
      const idx = students.findIndex(
        (x) =>
          x.role === "STUDENT" &&
          x.program === s.program &&
          x.level === s.level &&
          (x.section ?? "") === (s.section ?? "") &&
          (x.rollNo ?? "") === (s.rollNo ?? "")
      );
      if (idx >= 0) {
        const old = students[idx]!;
        seenEmail.delete(old.email);
        students.splice(idx, 1);
      }
    }

    seenEmail.add(s.email);
    if (s.role === "STUDENT" && s.rollNo) seenRollKey.add(rollKey);
    students.push(s);
  }

  if (duplicatesRemoved > 0) {
    warnings.unshift(
      `Removed ${duplicatesRemoved} duplicate row${duplicatesRemoved === 1 ? "" : "s"} from the file.`
    );
  }

  if (students.length === 0 && invalid.length === 0) {
    return {
      ok: false,
      error:
        "No people found. Use columns: Email, Name, Course, Year, Roll No (Role optional). See template.",
    };
  }

  return { ok: true, students, invalid, warnings };
}

export function parseStudentsWorkbook(buffer: ArrayBuffer): ParseStudentsResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return { ok: false, error: "The file has no worksheets." };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return parseRows(rows);
}

export function parseStudentsJson(text: string): ParseStudentsResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON. Check brackets, commas, and quotes." };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { ok: false, error: "JSON array is empty." };
    return parseRows(data as Record<string, unknown>[]);
  }

  if (data && typeof data === "object") {
    const obj = data as { students?: unknown; people?: unknown };
    if (Array.isArray(obj.people)) {
      return parseStudentsJson(JSON.stringify(obj.people));
    }
    if (Array.isArray(obj.students)) {
      return parseStudentsJson(JSON.stringify(obj.students));
    }
  }

  return {
    ok: false,
    error:
      'Use a JSON array, or { "students": [...] } / { "people": [...] }. See samples/bulk-students.json.',
  };
}

export async function parseStudentsFile(file: File): Promise<ParseStudentsResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    return parseStudentsJson(await file.text());
  }
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return { ok: false, error: "Could not read CSV." };
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    return parseRows(rows);
  }
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return { ok: false, error: "Use .xlsx, .xls, .csv, or .json files." };
  }
  return parseStudentsWorkbook(await file.arrayBuffer());
}

/** Simple campus template — only columns staff need day to day. */
export function downloadStudentTemplate(): void {
  const rows = [
    {
      Email: "student.bpharm.y1.01@gppharmacy.edu",
      Name: "B.Pharm Y1 Student 01",
      Course: "BPHARM",
      Year: 1,
      "Roll No": "01",
      Role: "Student",
    },
    {
      Email: "",
      Name: "D.Pharm Y2 Student 05",
      Course: "DPHARM",
      Year: 2,
      "Roll No": "05",
      Role: "Student",
    },
    {
      Email: "staff.bpharm@gppharmacy.edu",
      Name: "B.Pharm Staff",
      Course: "BPHARM",
      Year: "",
      "Roll No": "",
      Role: "Staff",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "People");
  XLSX.writeFile(wb, "people-import-template.xlsx");
}

export function downloadImportErrorsCsv(
  invalid: ImportInvalidRow[],
  serverErrors: string[] = []
): void {
  const rows: { Row: string; Email: string; Name: string; Role: string; Error: string }[] =
    invalid.map((r) => ({
      Row: String(r.rowNum),
      Email: r.email,
      Name: r.name,
      Role: r.role,
      Error: r.error,
    }));
  for (const err of serverErrors) {
    rows.push({ Row: "", Email: "", Name: "", Role: "", Error: err });
  }
  if (rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  XLSX.writeFile(wb, "import-errors.csv");
}
