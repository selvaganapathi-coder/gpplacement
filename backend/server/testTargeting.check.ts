/**
 * Pure audience-chain checks (no DB / API).
 *   npx tsx server/testTargeting.check.ts
 */
import { LevelType, Program } from "@prisma/client";
import { testTargetsStudent } from "./testTargeting";

type Case = {
  name: string;
  test: {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    section?: string | null;
  };
  student: {
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    section?: string | null;
  };
  expect: boolean;
};

const cases: Case[] = [
  {
    name: "campus-wide → any student",
    test: { program: null, levelType: null, level: null },
    student: {
      program: Program.BPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    expect: true,
  },
  {
    name: "D.Pharm degree-wide → D.Pharm Y2",
    test: { program: Program.DPHARM, levelType: null, level: null },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 2,
      section: "B",
    },
    expect: true,
  },
  {
    name: "D.Pharm degree-wide → B.Pharm blocked",
    test: { program: Program.DPHARM, levelType: null, level: null },
    student: {
      program: Program.BPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    expect: false,
  },
  {
    name: "D.Pharm Y1 any section → D.Pharm Y1 Sec B",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: null,
    },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "B",
    },
    expect: true,
  },
  {
    name: "D.Pharm Y1 Sec A → D.Pharm Y1 Sec A",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    expect: true,
  },
  {
    name: "D.Pharm Y1 Sec A → D.Pharm Y1 Sec B blocked",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "B",
    },
    expect: false,
  },
  {
    name: "D.Pharm Y1 Sec A → D.Pharm Y2 Sec A blocked",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 2,
      section: "A",
    },
    expect: false,
  },
  {
    name: "D.Pharm Y1 Sec A → B.Pharm Y1 Sec A blocked",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    student: {
      program: Program.BPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    expect: false,
  },
  {
    name: "section case-insensitive",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "a",
    },
    student: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: "A",
    },
    expect: true,
  },
  {
    name: "student with no program cannot take degree test",
    test: { program: Program.DPHARM, levelType: null, level: null },
    student: { program: null, levelType: null, level: null },
    expect: false,
  },
  {
    name: "student with null year cannot take year-specific test",
    test: {
      program: Program.DPHARM,
      levelType: LevelType.YEAR,
      level: 1,
      section: null,
    },
    student: {
      program: Program.DPHARM,
      levelType: null,
      level: null,
      section: null,
    },
    expect: false,
  },
];

let failed = 0;
for (const c of cases) {
  const got = testTargetsStudent(c.test, c.student);
  const ok = got === c.expect;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name} (got ${got}, expect ${c.expect})`);
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} audience check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} audience checks passed.`);
