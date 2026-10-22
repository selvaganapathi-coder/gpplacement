import { useEffect, useMemo, useState } from "react";
import {
  batchYearOf,
  programOptions,
  SECTIONS,
  type LevelType,
  type Program,
  type Section,
} from "@/lib/academic";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import { api } from "@/lib/api";
import type { ManagedCohort } from "@/hooks/useStaffDepartmentScope";

export type TestAudience = {
  target: "all" | "class";
  program: Program | "";
  levelType: LevelType | "";
  level: number | "";
  /** Exact class section when year is set (optional). */
  section: Section | "";
};

type TestCohortPickerProps = {
  value: TestAudience;
  onChange: (next: TestAudience) => void;
  allowedPrograms?: Program[];
  allowedCohorts?: ManagedCohort[];
};

function programAllowed(
  cohorts: ManagedCohort[] | undefined,
  program: Program
): boolean {
  if (!cohorts?.length) return true;
  return cohorts.some((c) => c.program === program);
}

function yearAllowed(
  cohorts: ManagedCohort[] | undefined,
  program: Program,
  level: number
): boolean {
  if (!cohorts?.length) return true;
  return cohorts.some((c) => {
    if (c.program !== program) return false;
    if (c.wholeProgram || c.level == null) return true;
    return batchYearOf(c.level) === batchYearOf(level);
  });
}

export function TestCohortPicker({
  value,
  onChange,
  allowedPrograms,
  allowedCohorts,
}: TestCohortPickerProps) {
  const catalog = useAcademicCatalog();
  const [totals, setTotals] = useState<{
    students: number;
    activeStudents: number;
    tests: number;
    submittedAttempts: number;
    averagePercent: number | null;
  } | null>(null);
  const degreeOptions = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    const base = all.length ? all : programOptions();
    if (allowedCohorts?.length) {
      const programs = new Set(allowedCohorts.map((c) => c.program));
      return base.filter((p) => programs.has(p.id));
    }
    if (!allowedPrograms?.length) return base;
    return base.filter((p) => allowedPrograms.includes(p.id));
  }, [allowedPrograms, allowedCohorts, catalog.departments]);

  const staffScoped = !!(allowedPrograms?.length || allowedCohorts?.length);
  const defaultProgram = (degreeOptions[0]?.id ?? programOptions()[0]!.id) as Program;

  const levelOptions = useMemo(() => {
    if (!value.program) return [];
    return catalog.batchYears
      .filter((year) => yearAllowed(allowedCohorts, value.program as Program, year))
      .map((year) => ({ value: year, label: `${year} batch` }));
  }, [catalog.batchYears, allowedCohorts, value.program]);

  useEffect(() => {
    if (value.target !== "class" || !value.program || value.level === "" || !batchYearOf(Number(value.level))) {
      setTotals(null);
      return;
    }
    let cancelled = false;
    void api<{
      students: number;
      activeStudents: number;
      tests: number;
      submittedAttempts: number;
      averagePercent: number | null;
    }>(`/api/admin/academic/summary?program=${value.program}&year=${value.level}`)
      .then((res) => {
        if (!cancelled) setTotals(res);
      })
      .catch(() => {
        if (!cancelled) setTotals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value.target, value.program, value.level]);

  const summary = useMemo(() => {
    const deptName =
      catalog.departments.find((d) => d.program === value.program)?.name ??
      programOptions().find((p) => p.id === value.program)?.label ??
      value.program;
    if (value.target === "all") return "All departments";
    if (value.program && value.level !== "") {
      const batch = batchYearOf(Number(value.level)) ?? value.level;
      const sec = value.section ? ` · Sec ${value.section}` : "";
      return `${deptName} · ${batch} batch${sec}`;
    }
    if (value.program) {
      return `${deptName} · all batches`;
    }
    return "Select who can take this test";
  }, [value, catalog.departments]);

  return (
    <div className="new-test-bank">
      <h3 className="new-test-bank__title">Who can take this test?</h3>
      <p className="new-test-bank__sub">{summary}</p>
      <p className="mt-1 text-xs text-slate-500">
        Only matching students can open the exam. Other degrees / years / sections cannot.
      </p>
      {staffScoped ? (
        <p className="mt-1 text-xs text-slate-500">
          You can set tests for your assigned department.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {!staffScoped ? (
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="testTarget"
              checked={value.target === "all"}
              onChange={() =>
                onChange({
                  target: "all",
                  program: "",
                  levelType: "",
                  level: "",
                  section: "",
                })
              }
            />
            All departments
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="testTarget"
            checked={value.target === "class"}
            onChange={() => {
              const firstCohort = allowedCohorts?.[0];
              const program =
                value.program || firstCohort?.program || defaultProgram;
              onChange({
                target: "class",
                program,
                levelType: "",
                level: "",
                section: "",
              });
            }}
          />
          One degree / class
        </label>
      </div>

      {value.target === "class" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Degree</label>
            <select
              value={value.program}
              onChange={(e) => {
                const p = e.target.value as Program | "";
                if (p && !programAllowed(allowedCohorts, p)) return;
                onChange({
                  target: "class",
                  program: p,
                  levelType: "",
                  level: "",
                  section: "",
                });
              }}
              className="new-test-field__input"
              disabled={staffScoped && degreeOptions.length === 1}
            >
              <option value="">Select…</option>
              {degreeOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {value.program ? (
            <div>
              <label className="text-xs font-medium text-slate-600">
                Batch (optional)
              </label>
              <select
                value={value.level === "" ? "" : String(value.level)}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    ...value,
                    target: "class",
                    levelType: v ? "YEAR" : "",
                    level: v ? Number(v) : "",
                    section: "",
                  });
                }}
                className="new-test-field__input"
              >
                <option value="">All batches in this degree</option>
                {levelOptions.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {catalog.departments.find((d) => d.program === value.program)?.name ?? "This department"}
                {" · "}
                {catalog.departments.find((d) => d.program === value.program)?.durationYears ?? "—"}{" "}
                years. Batches run {catalog.batchYears[0]} to {catalog.batchYears[catalog.batchYears.length - 1]}.
              </p>
              {totals && value.level !== "" ? (
                <p className="mt-1 text-[11px] leading-snug text-slate-700">
                  {totals.students} students ({totals.activeStudents} active) · {totals.tests} tests ·{" "}
                  {totals.submittedAttempts} submitted
                  {totals.averagePercent != null ? ` · average ${totals.averagePercent}%` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {value.program && value.level !== "" ? (
            <div>
              <label className="text-xs font-medium text-slate-600">
                Section (optional)
              </label>
              <select
                value={value.section}
                onChange={(e) =>
                  onChange({
                    ...value,
                    target: "class",
                    section: (e.target.value || "") as Section | "",
                  })
                }
                className="new-test-field__input"
              >
                <option value="">All sections</option>
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    Sec {s}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
