import { useMemo } from "react";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import {
  formatAcademic,
  programOptions,
  type LevelType,
  type Program,
} from "@/lib/academic";

export type TestFilterState = {
  search: string;
  program: Program | "";
  level: number | "";
  status: "all" | "draft" | "published";
  access: "all" | "can_edit" | "view_only" | "mine";
};

export const defaultTestFilters: TestFilterState = {
  search: "",
  program: "",
  level: "",
  status: "all",
  access: "all",
};

export type FilterableTest = {
  id: string;
  title: string;
  isPublished: boolean;
  resultsPublished: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
  assessmentType?: string;
  maxScore?: number;
  canEdit?: boolean;
  _count: { questions: number; attempts: number };
  createdBy?: { id: string; name: string; role: string };
  lastEditedBy?: { id: string; name: string; role: string } | null;
  lastEditedAt?: string | null;
};

export function filterTests(
  tests: FilterableTest[],
  filters: TestFilterState,
  currentStaffId?: string
): FilterableTest[] {
  const q = filters.search.trim().toLowerCase();
  return tests.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (filters.program && t.program !== filters.program) return false;
    if (filters.level !== "" && t.level !== filters.level) return false;
    if (filters.status === "draft" && t.isPublished) return false;
    if (filters.status === "published" && !t.isPublished) return false;
    if (filters.access === "can_edit" && !t.canEdit) return false;
    if (filters.access === "view_only" && t.canEdit) return false;
    if (filters.access === "mine" && currentStaffId && t.createdBy?.id !== currentStaffId) {
      return false;
    }
    return true;
  });
}

type TestListFiltersProps = {
  filters: TestFilterState;
  onChange: (next: TestFilterState) => void;
  resultCount: number;
  totalCount: number;
  allowedPrograms?: Program[];
  hideAccessFilter?: boolean;
  /** Status is controlled by parent tabs — hide duplicate status select. */
  hideStatusFilter?: boolean;
  /** Nested inside tests directory toolbar (no outer card). */
  embedded?: boolean;
  /** Single-row compact toolbar. */
  compact?: boolean;
};

export function TestListFilters({
  filters,
  onChange,
  resultCount,
  totalCount,
  allowedPrograms,
  hideAccessFilter,
  hideStatusFilter,
  embedded,
  compact,
}: TestListFiltersProps) {
  const catalog = useAcademicCatalog();
  const degreeOptions = useMemo(() => {
    const all = catalog.departments.map((dept) => ({
      id: dept.program,
      label: dept.name,
    }));
    if (!allowedPrograms?.length) return all.length ? all : programOptions();
    return all.filter((p) => allowedPrograms.includes(p.id));
  }, [allowedPrograms, catalog.departments]);

  const effectiveProgram =
    filters.program || (degreeOptions.length === 1 ? degreeOptions[0]!.id : "");

  const levelOptions = useMemo(() => {
    if (!effectiveProgram) return [];
    return catalog.batchYears.map((year) => ({ value: year, label: `${year} batch` }));
  }, [effectiveProgram, catalog.batchYears]);

  const hasFilters =
    filters.search ||
    (degreeOptions.length > 1 && !!filters.program) ||
    filters.level !== "" ||
    (!hideStatusFilter && filters.status !== "all") ||
    (!hideAccessFilter && filters.access !== "all");

  const fieldClass =
    "mt-1 w-full rounded-xl border border-brand-200/70 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  if (compact) {
    const compactField =
      "tests-filters__control w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15";
    return (
      <div className="tests-filters">
        <div className="tests-filters__search">
          <label className="tests-filters__label" htmlFor="tests-filter-search">
            Search
          </label>
          <input
            id="tests-filter-search"
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search by title…"
            className={compactField}
          />
        </div>
        {degreeOptions.length > 1 ? (
          <div className="tests-filters__field">
            <label className="tests-filters__label" htmlFor="tests-filter-degree">
              Degree
            </label>
            <select
              id="tests-filter-degree"
              value={filters.program}
              onChange={(e) =>
                onChange({
                  ...filters,
                  program: e.target.value as Program | "",
                  level: "",
                })
              }
              className={compactField}
            >
              <option value="">All degrees</option>
              {degreeOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="tests-filters__field">
          <label className="tests-filters__label" htmlFor="tests-filter-year">
            Batch
          </label>
          <select
            id="tests-filter-year"
            value={filters.level === "" ? "" : String(filters.level)}
            onChange={(e) =>
              onChange({
                ...filters,
                program: effectiveProgram || filters.program,
                level: e.target.value ? Number(e.target.value) : "",
              })
            }
            disabled={!effectiveProgram}
            className={`${compactField} disabled:opacity-50`}
          >
            <option value="">All batches</option>
            {levelOptions.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        {!hideAccessFilter ? (
          <div className="tests-filters__field">
            <label className="tests-filters__label" htmlFor="tests-filter-access">
              Access
            </label>
            <select
              id="tests-filter-access"
              value={filters.access}
              onChange={(e) =>
                onChange({
                  ...filters,
                  access: e.target.value as TestFilterState["access"],
                })
              }
              className={compactField}
            >
              <option value="all">All tests</option>
              <option value="can_edit">I can edit</option>
              <option value="view_only">View only</option>
              <option value="mine">Created by me</option>
            </select>
          </div>
        ) : null}
        <div className="tests-filters__meta">
          <span className="tests-filters__count" title="Showing / total">
            {resultCount}
            <span className="tests-filters__count-sep">/</span>
            {totalCount}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...defaultTestFilters,
                  program: degreeOptions.length === 1 ? degreeOptions[0]!.id : "",
                })
              }
              className="tests-filters__clear"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "space-y-3"
          : "mb-4 rounded-2xl border border-brand-200/60 bg-white/90 p-4 shadow-warm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Filter &amp; search</h3>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand-900 ring-1 ring-brand-100">
          {resultCount} / {totalCount}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-600">Search title</label>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Test name…"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Degree</label>
          <select
            value={filters.program || (degreeOptions.length === 1 ? degreeOptions[0]!.id : "")}
            onChange={(e) =>
              onChange({
                ...filters,
                program: e.target.value as Program | "",
                level: "",
              })
            }
            className={fieldClass}
            disabled={degreeOptions.length <= 1}
          >
            {degreeOptions.length === 1 ? (
              <option value={degreeOptions[0]!.id}>{degreeOptions[0]!.label}</option>
            ) : (
              <>
                <option value="">All degrees</option>
                {degreeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Batch</label>
          <select
            value={filters.level === "" ? "" : String(filters.level)}
            onChange={(e) =>
              onChange({
                ...filters,
                program: effectiveProgram || filters.program,
                level: e.target.value ? Number(e.target.value) : "",
              })
            }
            disabled={!effectiveProgram}
            className={`${fieldClass} disabled:opacity-50`}
          >
            <option value="">All batches</option>
            {levelOptions.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        {!hideAccessFilter ? (
          <div>
            <label className="text-xs font-medium text-slate-600">Access</label>
            <select
              value={filters.access}
              onChange={(e) =>
                onChange({
                  ...filters,
                  access: e.target.value as TestFilterState["access"],
                })
              }
              className={fieldClass}
            >
              <option value="all">All tests</option>
              <option value="can_edit">I can edit</option>
              <option value="view_only">View only</option>
              <option value="mine">Created by me</option>
            </select>
          </div>
        ) : null}
        {!hideStatusFilter ? (
          <div>
            <label className="text-xs font-medium text-slate-600">List status</label>
            <select
              value={filters.status}
              onChange={(e) =>
                onChange({
                  ...filters,
                  status: e.target.value as TestFilterState["status"],
                })
              }
              className={fieldClass}
            >
              <option value="all">Draft &amp; published</option>
              <option value="draft">Draft only</option>
              <option value="published">Published only</option>
            </select>
          </div>
        ) : null}
      </div>
      {hasFilters ? (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...defaultTestFilters,
              program: degreeOptions.length === 1 ? degreeOptions[0]!.id : "",
            })
          }
          className="text-xs font-semibold text-brand-700 hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function testAudienceShort(t: FilterableTest): string {
  if (!t.program) return "All students";
  return formatAcademic(t.program, t.levelType, t.level);
}
