import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany({
    orderBy: [
      { role: "asc" },
      { program: "asc" },
      { level: "asc" },
      { section: "asc" },
      { email: "asc" },
    ],
    select: {
      email: true,
      name: true,
      role: true,
      program: true,
      levelType: true,
      level: true,
      section: true,
      rollNo: true,
    },
  });

  const counts = { ADMIN: 0, STAFF: 0, STUDENT: 0 };
  for (const u of users) counts[u.role as keyof typeof counts]++;

  const outPath = path.join(process.cwd(), "..", "docs", "ALL_LOGINS.md");
  const PW = "changeme123";

  const lines: string[] = [];
  lines.push("# All demo logins — every department, year & section");
  lines.push("");
  lines.push(`**Password for every account below:** \`${PW}\``);
  lines.push("");
  lines.push(
    `| Total | Admin | Staff | Students |`
  );
  lines.push(`|-------|-------|-------|----------|`);
  lines.push(
    `| ${users.length} | ${counts.ADMIN} | ${counts.STAFF} | ${counts.STUDENT} |`
  );
  lines.push("");
  lines.push("## Admin");
  lines.push("");
  lines.push("| Email | Password | Name |");
  lines.push("|-------|----------|------|");
  for (const u of users.filter((x) => x.role === "ADMIN")) {
    lines.push(`| \`${u.email}\` | \`${PW}\` | ${u.name} |`);
  }

  const depts = [
    { id: "DPHARM", label: "D.Pharm", years: [1, 2] },
    { id: "BPHARM", label: "B.Pharm", years: [1, 2, 3, 4] },
    { id: "MPHARM", label: "M.Pharm", years: [1, 2] },
  ] as const;

  for (const dept of depts) {
    lines.push("");
    lines.push(`## ${dept.label} (${dept.id})`);
    lines.push("");

    const deptStaff = users.filter(
      (u) =>
        u.role === "STAFF" &&
        u.program === dept.id &&
        (u.level == null || u.levelType == null)
    );
    lines.push("### Department staff (all years)");
    lines.push("");
    lines.push("| Email | Password | Name |");
    lines.push("|-------|----------|------|");
    if (deptStaff.length === 0) {
      lines.push("| — | — | (none) |");
    } else {
      for (const u of deptStaff) {
        lines.push(`| \`${u.email}\` | \`${PW}\` | ${u.name} |`);
      }
    }

    for (const year of dept.years) {
      for (const section of ["A", "B"] as const) {
        const staff = users.filter(
          (u) =>
            u.role === "STAFF" &&
            u.program === dept.id &&
            u.levelType === "YEAR" &&
            u.level === year &&
            u.section === section
        );
        const students = users.filter(
          (u) =>
            u.role === "STUDENT" &&
            u.program === dept.id &&
            u.levelType === "YEAR" &&
            u.level === year &&
            u.section === section
        );

        lines.push("");
        lines.push(`### Year ${year} · Section ${section}`);
        lines.push("");
        lines.push("**Staff**");
        lines.push("");
        lines.push("| Email | Password | Name |");
        lines.push("|-------|----------|------|");
        for (const u of staff) {
          lines.push(`| \`${u.email}\` | \`${PW}\` | ${u.name} |`);
        }
        if (staff.length === 0) lines.push("| — | — | (none) |");

        lines.push("");
        lines.push("**Students**");
        lines.push("");
        lines.push("| Email | Password | Roll | Name |");
        lines.push("|-------|----------|------|------|");
        for (const u of students) {
          lines.push(
            `| \`${u.email}\` | \`${PW}\` | ${u.rollNo ?? "—"} | ${u.name} |`
          );
        }
        if (students.length === 0) lines.push("| — | — | — | (none) |");
      }
    }
  }

  // Orphans / demo aliases not in dept year tables
  const listed = new Set<string>();
  for (const u of users) {
    if (u.role === "ADMIN") listed.add(u.email);
    if (u.role === "STAFF" && u.program && (u.level == null || u.levelType == null))
      listed.add(u.email);
    if (
      u.role === "STAFF" &&
      u.program &&
      u.levelType === "YEAR" &&
      u.level != null &&
      u.section
    )
      listed.add(u.email);
    if (
      u.role === "STUDENT" &&
      u.program &&
      u.levelType === "YEAR" &&
      u.level != null &&
      u.section
    )
      listed.add(u.email);
  }
  const extra = users.filter((u) => !listed.has(u.email));
  if (extra.length) {
    lines.push("");
    lines.push("## Other / demo aliases");
    lines.push("");
    lines.push("| Email | Password | Role | Program | Year | Sec | Name |");
    lines.push("|-------|----------|------|---------|------|-----|------|");
    for (const u of extra) {
      lines.push(
        `| \`${u.email}\` | \`${PW}\` | ${u.role} | ${u.program ?? "—"} | ${u.level ?? "—"} | ${u.section ?? "—"} | ${u.name} |`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Generated from the seeded database. Re-run seed if you need a fresh list:");
  lines.push("");
  lines.push("```bash");
  lines.push("cd backend");
  lines.push("set SEED_FORCE_PASSWORD_CHANGE=false");
  lines.push("npm run db:seed");
  lines.push("```");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
