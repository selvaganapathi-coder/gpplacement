import type { Program, LevelType } from "../shared/academic";
import { formatAcademic } from "./academic";
import { isMcqAssessment } from "../shared/assessmentTypes";
import { escapeCsvCell } from "./csvSanitize";

export { escapeCsvCell, sanitizeCsvFormula } from "./csvSanitize";

type ResultsRowUser = {
  name: string;
  email: string;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
};

type ResultsAttempt = {
  id?: string;
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  percentage?: number | null;
  rank?: number | null;
  passed?: boolean | null;
  tabSwitchCount?: number;
  fullscreenExitCount?: number;
  proctorFlagged?: boolean;
  user: ResultsRowUser;
};

export function buildResultsCsv(
  testTitle: string,
  attempts: ResultsAttempt[],
  maxScore: number
): { csv: string; filename: string } {
  const header = [
    "Rank",
    "Student Name",
    "Email",
    "Program / Branch",
    "Started",
    "Submitted",
    "Score",
    "Max Score",
    "Percent",
    "Pass",
    "Tab switches",
    "Fullscreen exits",
    "Flagged",
  ];
  const rows = attempts.map((a) => {
    const score = a.score ?? 0;
    const pct =
      a.percentage != null && Number.isFinite(a.percentage)
        ? Math.round(a.percentage)
        : maxScore > 0
          ? Math.round((score / maxScore) * 100)
          : 0;
    return [
      a.rank ?? "",
      a.user.name,
      a.user.email,
      formatAcademic(a.user.program, a.user.levelType, a.user.level),
      a.startedAt.toISOString(),
      a.submittedAt?.toISOString() ?? "",
      score,
      maxScore,
      `${pct}%`,
      a.passed == null ? "" : a.passed ? "PASS" : "FAIL",
      a.tabSwitchCount ?? 0,
      a.fullscreenExitCount ?? 0,
      a.proctorFlagged ? "YES" : "NO",
    ]
      .map(escapeCsvCell)
      .join(",");
  });

  const csv = [header.map(escapeCsvCell).join(","), ...rows].join("\r\n");
  const safeTitle = testTitle.replace(/[^\w.-]+/g, "_").slice(0, 60);
  return { csv: "\uFEFF" + csv, filename: `${safeTitle}-results.csv` };
}

export type MarksAttemptRow = {
  rollNo: string;
  name: string;
  email: string;
  classLabel: string;
  testTitle: string;
  assessmentType: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number;
  resultsPublished: boolean;
  createdByName: string;
  status: string;
};

function percentCell(score: number | null, maxScore: number): string {
  if (score == null || maxScore <= 0) return "";
  return `${Math.round((score / maxScore) * 100)}%`;
}

export function maxScoreForTest(
  assessmentType: string,
  questionCount: number,
  maxScore: number
): number {
  if (maxScore > 0) return maxScore;
  return isMcqAssessment(assessmentType) ? questionCount : 100;
}

/** Individual student marks report (all tests / attempts). */
export function buildStudentMarksReportCsv(
  student: {
    name: string;
    email: string;
    rollNo: string;
    classLabel: string;
  },
  rows: MarksAttemptRow[]
): { csv: string; filename: string } {
  const scored = rows.filter((r) => r.submittedAt && r.score != null && r.maxScore > 0);
  const avg =
    scored.length > 0
      ? Math.round(
          scored.reduce((s, r) => s + ((r.score ?? 0) / r.maxScore) * 100, 0) /
            scored.length
        )
      : null;

  const summary = [
    ["Report", "Individual student marks"],
    ["Student", student.name],
    ["Roll", student.rollNo || "—"],
    ["Email", student.email],
    ["Class", student.classLabel || "—"],
    ["Attempts listed", rows.length],
    ["Scored attempts", scored.length],
    ["Average percent", avg != null ? `${avg}%` : "—"],
    [],
  ];

  const header = [
    "Roll",
    "Student Name",
    "Email",
    "Class",
    "Test",
    "Type",
    "Status",
    "Started",
    "Submitted",
    "Score",
    "Max Score",
    "Percent",
    "Results released",
    "Uploaded by",
  ];

  const body = rows.map((r) =>
    [
      r.rollNo,
      r.name,
      r.email,
      r.classLabel,
      r.testTitle,
      r.assessmentType,
      r.status,
      r.startedAt?.toISOString() ?? "",
      r.submittedAt?.toISOString() ?? "",
      r.score ?? "",
      r.maxScore,
      percentCell(r.score, r.maxScore),
      r.resultsPublished ? "YES" : "NO",
      r.createdByName,
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  const lines = [
    ...summary.map((line) =>
      line.length === 0 ? "" : line.map(escapeCsvCell).join(",")
    ),
    header.map(escapeCsvCell).join(","),
    ...body,
  ];

  const safe = student.name.replace(/[^\w.-]+/g, "_").slice(0, 40) || "student";
  const roll = student.rollNo.replace(/[^\w.-]+/g, "_").slice(0, 12);
  return {
    csv: "\uFEFF" + lines.join("\r\n"),
    filename: `student-marks-${roll || safe}.csv`,
  };
}

/** Department / class marks report (summary + detail rows). */
export function buildDepartmentMarksReportCsv(
  scopeLabel: string,
  rows: MarksAttemptRow[]
): { csv: string; filename: string } {
  const byStudent = new Map<string, MarksAttemptRow[]>();
  for (const r of rows) {
    const key = r.email.toLowerCase();
    const list = byStudent.get(key) ?? [];
    list.push(r);
    byStudent.set(key, list);
  }

  const summaryRows: string[] = [];
  summaryRows.push(["Report", "Department / class marks"].map(escapeCsvCell).join(","));
  summaryRows.push(["Scope", scopeLabel].map(escapeCsvCell).join(","));
  summaryRows.push(["Students", byStudent.size].map(escapeCsvCell).join(","));
  summaryRows.push(["Rows", rows.length].map(escapeCsvCell).join(","));
  summaryRows.push("");
  summaryRows.push(
    ["Student summary", "Roll", "Email", "Class", "Attempts", "Scored", "Avg %"]
      .map(escapeCsvCell)
      .join(",")
  );

  for (const [, list] of [...byStudent.entries()].sort((a, b) =>
    a[1][0].name.localeCompare(b[1][0].name)
  )) {
    const head = list[0];
    const realAttempts = list.filter((r) => r.status !== "No attempt");
    const scored = realAttempts.filter(
      (r) => r.submittedAt && r.score != null && r.maxScore > 0
    );
    const avg =
      scored.length > 0
        ? Math.round(
            scored.reduce((s, r) => s + ((r.score ?? 0) / r.maxScore) * 100, 0) /
              scored.length
          )
        : null;
    summaryRows.push(
      [
        head.name,
        head.rollNo,
        head.email,
        head.classLabel,
        realAttempts.length,
        scored.length,
        avg != null ? `${avg}%` : "—",
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  summaryRows.push("");
  const header = [
    "Roll",
    "Student Name",
    "Email",
    "Class",
    "Test",
    "Type",
    "Status",
    "Started",
    "Submitted",
    "Score",
    "Max Score",
    "Percent",
    "Results released",
    "Uploaded by",
  ];

  const body = rows.map((r) =>
    [
      r.rollNo,
      r.name,
      r.email,
      r.classLabel,
      r.testTitle,
      r.assessmentType,
      r.status,
      r.startedAt?.toISOString() ?? "",
      r.submittedAt?.toISOString() ?? "",
      r.score ?? "",
      r.maxScore || "",
      percentCell(r.score, r.maxScore),
      r.resultsPublished ? "YES" : "NO",
      r.createdByName,
    ]
      .map(escapeCsvCell)
      .join(",")
  );

  const lines = [...summaryRows, header.map(escapeCsvCell).join(","), ...body];
  const safe = scopeLabel.replace(/[^\w.-]+/g, "_").slice(0, 50) || "department";
  return {
    csv: "\uFEFF" + lines.join("\r\n"),
    filename: `department-marks-${safe}.csv`,
  };
}
