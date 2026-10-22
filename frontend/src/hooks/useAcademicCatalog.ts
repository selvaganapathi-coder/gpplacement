import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_BATCH_YEARS, programOptions, type Program } from "@/lib/academic";

export type CatalogDepartment = {
  program: Program;
  name: string;
  durationYears: number;
  builtin: boolean;
};

export type AcademicCatalog = {
  batchYears: number[];
  departments: CatalogDepartment[];
};

const FALLBACK: AcademicCatalog = {
  batchYears: [...DEFAULT_BATCH_YEARS],
  departments: programOptions().map((program) => ({
    program: program.id,
    name: program.label,
    durationYears: program.id === "DPHARM" || program.id === "MPHARM" ? 2 : program.id === "BPHARM" ? 4 : 6,
    builtin: true,
  })),
};

let cached: AcademicCatalog | null = null;

export function useAcademicCatalog() {
  const [catalog, setCatalog] = useState<AcademicCatalog>(cached ?? FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void api<AcademicCatalog>("/api/academic-catalog")
      .then((res) => {
        if (cancelled) return;
        const next = {
          batchYears: res.batchYears?.length ? res.batchYears : FALLBACK.batchYears,
          departments: res.departments?.length ? res.departments : FALLBACK.departments,
        };
        cached = next;
        setCatalog(next);
      })
      .catch(() => {
        /* keep the built-in 2023–2027 list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return catalog;
}

export function rememberCatalog(next: AcademicCatalog) {
  cached = next;
}
