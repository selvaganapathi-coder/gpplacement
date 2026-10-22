import type { PrismaClient } from "@prisma/client";
import type { Archiver, ArchiverOptions } from "archiver";
import type { Response } from "express";
import { publicErrorMessage } from "./errors";
import { buildResultsCsv } from "./resultsExport";
import { exportDepartmentMarksReport } from "./marksReports";
import { isMcqAssessment } from "../shared/assessmentTypes";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require("archiver") as (
  format: string,
  options?: ArchiverOptions
) => Archiver;

function safeName(title: string, id: string): string {
  const base = title.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "test";
  return `${base}-${id.slice(0, 8)}`;
}

/**
 * Stream a ZIP: campus marks CSV + every published test (JSON) + results CSVs.
 */
export async function streamAdminExportPack(
  prisma: PrismaClient,
  res: Response
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `campus-export-${stamp}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err: Error) => {
    if (!res.headersSent) {
      res.status(500).json({ error: publicErrorMessage(err, "Export failed.") });
    } else {
      res.destroy(err);
    }
  });
  archive.pipe(res);

  const dept = await exportDepartmentMarksReport(prisma, {});
  archive.append(dept.csv, { name: `marks/${dept.filename}` });

  const allTests = await prisma.test.findMany({
    where: { isPublished: true },
    orderBy: { title: "asc" },
    take: 120,
    include: {
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          prompt: true,
          topic: true,
          difficulty: true,
          options: { select: { id: true, text: true, isCorrect: true } },
        },
      },
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 500,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              program: true,
              levelType: true,
              level: true,
            },
          },
        },
      },
    },
  });

  const indexLines = [
    "Test Title,Published Results,Question Count,Attempt Count,Definition File,Results File",
    ...allTests.map((t) => {
      const slug = safeName(t.title, t.id);
      const defFile = `tests/${slug}.json`;
      const resultsFile = t.attempts.length > 0 ? `results/${slug}.csv` : "";
      return [
        `"${t.title.replace(/"/g, '""')}"`,
        t.resultsPublished,
        t.questions.length,
        t.attempts.length,
        defFile,
        resultsFile,
      ].join(",");
    }),
  ];
  archive.append(indexLines.join("\n"), { name: "index.csv" });

  for (const t of allTests) {
    const slug = safeName(t.title, t.id);
    const definition = {
      id: t.id,
      title: t.title,
      assessmentType: t.assessmentType,
      durationMin: t.durationMin,
      maxScore: t.maxScore,
      isPublished: t.isPublished,
      resultsPublished: t.resultsPublished,
      createdAt: t.createdAt,
      questions: t.questions,
    };
    archive.append(JSON.stringify(definition, null, 2), {
      name: `tests/${slug}.json`,
    });

    if (t.attempts.length === 0) continue;

    const maxScore =
      t.maxScore && t.maxScore > 0
        ? t.maxScore
        : isMcqAssessment(t.assessmentType)
          ? t.questions.length
          : 100;
    const { csv } = buildResultsCsv(t.title, t.attempts, maxScore);
    archive.append(csv, { name: `results/${slug}.csv` });
  }

  archive.append(
    [
      "GP Pharmacy Placement - campus export pack",
      `Generated: ${new Date().toISOString()}`,
      `Published tests: ${allTests.length}`,
      `Results CSVs: ${allTests.filter((t) => t.attempts.length > 0).length}`,
      "",
      "Folder layout:",
      "  marks/     - campus marks report",
      "  tests/     - full test definitions (JSON)",
      "  results/   - per-test results CSVs",
      "  index.csv  - inventory",
      "",
    ].join("\n"),
    { name: "README.txt" }
  );

  await archive.finalize();
}
