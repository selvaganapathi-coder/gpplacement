import { useMemo, type ReactNode } from "react";
import {
  IconBook,
  IconCheck,
  IconClipboard,
  IconFlask,
  IconGraduation,
  IconLock,
  IconSearch,
  IconShield,
  IconSort,
  IconStaff,
  IconUsers,
} from "@/components/Icons";
import {
  compareByRollThenName,
  effectiveRollNo,
  formatYearLabel,
  matchesAcademicYear,
  programOptions,
  yearOptionsForProgram,
  type LevelType,
  type Program,
} from "@/lib/academic";
import type { Role } from "@/types";

export type FilterableUser = {
  name: string;
  email: string;
  role?: Role;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  rollNo?: string | null;
  lockedUntil?: string | null;
  /** Enrollment status; undefined treated as active for older payloads. */
  isActive?: boolean;
  createdAt?: string;
};

export type ClassStatusFilter = "all" | "with_class" | "no_class";
export type LockStatusFilter = "all" | "locked" | "unlocked";
export type ActiveStatusFilter = "all" | "active" | "inactive";
export type SortUsersBy = "roll_name" | "name" | "email" | "newest" | "oldest";

export type UserFilterState = {
  search: string;
  role: Role | "";
  program: Program | "";
  levelType: LevelType | "";
  level: number | "";
  /** Academic year (1–4). Works across any department. */
  year: number | "";
  classStatus: ClassStatusFilter;
  lockStatus: LockStatusFilter;
  /** Enrollment / employment — default Active for daily roster use. */
  activeStatus: ActiveStatusFilter;
  sortBy: SortUsersBy;
  rollQuery: string;
};

export const defaultUserFilters: UserFilterState = {
  search: "",
  role: "",
  program: "",
  levelType: "",
  level: "",
  year: "",
  classStatus: "all",
  lockStatus: "all",
  activeStatus: "active",
  sortBy: "name",
  rollQuery: "",
};

const SORT_OPTIONS: { value: SortUsersBy; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "email", label: "Email A–Z" },
  { value: "roll_name", label: "By roll" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export function isUserLocked(u: { lockedUntil?: string | null }): boolean {
  if (!u.lockedUntil) return false;
  return new Date(u.lockedUntil).getTime() > Date.now();
}

function isAdminRole(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function filterUsers<T extends FilterableUser>(
  users: T[],
  filters: UserFilterState
): T[] {
  const q = filters.search.trim().toLowerCase();
  const rollQ = filters.rollQuery.trim().toLowerCase();
  const roleFilter = filters.role;
  const adminOnly = roleFilter === "ADMIN";

  return users.filter((u) => {
    if (adminOnly) {
      if (!isAdminRole(u.role)) return false;
    } else if (roleFilter) {
      if (u.role !== roleFilter) return false;
    }

    if (filters.classStatus === "with_class") {
      if (isAdminRole(u.role)) return false;
      if (!u.program || u.level == null) return false;
    }
    if (filters.classStatus === "no_class") {
      if (isAdminRole(u.role)) return true;
      if (u.program && u.level != null) return false;
    }

    if (filters.lockStatus === "locked" && !isUserLocked(u)) return false;
    if (filters.lockStatus === "unlocked" && isUserLocked(u)) return false;

    if (filters.activeStatus === "active" && u.isActive === false) return false;
    if (filters.activeStatus === "inactive" && u.isActive !== false) return false;

    if (filters.program && u.program !== filters.program) return false;
    if (filters.levelType && u.levelType !== filters.levelType) return false;
    if (filters.level !== "" && u.level !== filters.level) return false;
    if (
      filters.year !== "" &&
      !matchesAcademicYear(u.program, u.levelType, u.level, filters.year)
    ) {
      return false;
    }

    if (rollQ) {
      const roll = (effectiveRollNo(u.rollNo, u.email) ?? "").toLowerCase();
      if (!roll.includes(rollQ)) return false;
    }

    if (q) {
      const hay = `${u.name} ${u.email} ${u.rollNo ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortUsers<T extends FilterableUser>(
  users: T[],
  sortBy: SortUsersBy
): T[] {
  const list = [...users];
  if (sortBy === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "email") {
    list.sort((a, b) => a.email.localeCompare(b.email));
  } else if (sortBy === "newest") {
    list.sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
  } else if (sortBy === "oldest") {
    list.sort(
      (a, b) =>
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
    );
  } else {
    list.sort(compareByRollThenName);
  }
  return list;
}

export function filtersAreActive(filters: UserFilterState): boolean {
  return (
    !!filters.search.trim() ||
    !!filters.role ||
    !!filters.program ||
    filters.year !== "" ||
    filters.level !== "" ||
    !!filters.levelType ||
    filters.classStatus !== "all" ||
    filters.lockStatus !== "all" ||
    filters.activeStatus !== "active" ||
    !!filters.rollQuery.trim()
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-brand-700 text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-brand-200/70 hover:bg-brand-50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

type UserFiltersBarProps = {
  filters: UserFilterState;
  onChange: (next: UserFilterState) => void;
  resultCount: number;
  totalCount: number;
  showClassFilters?: boolean;
  showLockFilters?: boolean;
  showSort?: boolean;
  showQuickClasses?: boolean;
  lockedCount?: number;
};

export function UserFiltersBar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: UserFiltersBarProps) {
  const adminOnly = filters.role === "ADMIN";
  const staffOnly = filters.role === "STAFF";
  const showCourse = !adminOnly;
  const showYear = !adminOnly && !staffOnly && !!filters.program;

  const yearOptions = useMemo(
    () => (filters.program ? yearOptionsForProgram(filters.program) : []),
    [filters.program]
  );

  const hasActive = filtersAreActive(filters);

  function patch(p: Partial<UserFilterState>) {
    onChange({ ...filters, ...p });
  }

  function setRole(role: Role | "") {
    if (role === "ADMIN") {
      patch({
        role,
        program: "",
        level: "",
        levelType: "",
        year: "",
        rollQuery: "",
      });
      return;
    }
    if (role === "STAFF") {
      patch({ role, year: "", level: "", levelType: "", rollQuery: "" });
      return;
    }
    patch({ role });
  }

  const courseIcon = (id: string) => {
    if (id === "DPHARM") return IconFlask;
    if (id === "BPHARM") return IconBook;
    if (id === "MPHARM") return IconClipboard;
    if (id === "PHARMD") return IconGraduation;
    return IconBook;
  };

  return (
    <div className="people-filters">
      <div className="people-filters__row">
        <label className="people-filters__search">
          <span className="sr-only">Search</span>
          <IconSearch className="people-filters__search-icon" />
          <input
            type="search"
            placeholder="Name, email, or roll…"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value, rollQuery: "" })}
            autoComplete="off"
          />
        </label>
        <label className="people-filters__sort">
          <IconSort className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={filters.sortBy}
            onChange={(e) => patch({ sortBy: e.target.value as SortUsersBy })}
            aria-label="Sort"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="people-filters__count">
          <strong>{resultCount}</strong>/{totalCount}
          {filters.year !== "" ? (
            <span className="text-slate-400"> · {formatYearLabel(filters.year)}</span>
          ) : null}
        </p>
        {hasActive ? (
          <button
            type="button"
            onClick={() => onChange({ ...defaultUserFilters, sortBy: filters.sortBy })}
            className="people-filters__clear"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="people-filters__chips">
        <Chip active={!filters.role} onClick={() => setRole("")}>
          <IconUsers className="h-3 w-3" />
          All
        </Chip>
        {(
          [
            { id: "STUDENT" as const, label: "Students", Icon: IconGraduation },
            { id: "STAFF" as const, label: "Staff", Icon: IconStaff },
            { id: "ADMIN" as const, label: "Admins", Icon: IconShield },
          ] as const
        ).map((r) => (
          <Chip
            key={r.id}
            active={filters.role === r.id}
            onClick={() => setRole(filters.role === r.id ? "" : r.id)}
          >
            <r.Icon className="h-3 w-3" />
            {r.label}
          </Chip>
        ))}
        <span className="people-filters__sep" aria-hidden />
        <Chip
          active={filters.activeStatus === "active"}
          onClick={() => patch({ activeStatus: "active" })}
        >
          <IconCheck className="h-3 w-3" />
          Active
        </Chip>
        <Chip
          active={filters.activeStatus === "inactive"}
          onClick={() => patch({ activeStatus: "inactive" })}
        >
          <IconLock className="h-3 w-3" />
          Inactive
        </Chip>
        <Chip
          active={filters.activeStatus === "all"}
          onClick={() => patch({ activeStatus: "all" })}
        >
          Everyone
        </Chip>

        {showCourse ? (
          <>
            <span className="people-filters__sep" aria-hidden />
            <Chip
              active={!filters.program}
              onClick={() =>
                patch({ program: "", level: "", levelType: "", year: "" })
              }
            >
              All courses
            </Chip>
            {programOptions().map((p) => {
              const Icon = courseIcon(p.id);
              return (
                <Chip
                  key={p.id}
                  active={filters.program === p.id}
                  onClick={() =>
                    patch(
                      filters.program === p.id
                        ? { program: "", level: "", levelType: "", year: "" }
                        : {
                            program: p.id,
                            level: "",
                            levelType: "",
                            year: "",
                          }
                    )
                  }
                >
                  <Icon className="h-3 w-3" />
                  {p.label}
                </Chip>
              );
            })}
            {showYear
              ? yearOptions.map((y) => (
                  <Chip
                    key={y.value}
                    active={filters.year === y.value}
                    onClick={() =>
                      patch(
                        filters.year === y.value
                          ? { year: "", level: "", levelType: "" }
                          : { year: y.value, level: "", levelType: "" }
                      )
                    }
                  >
                    {y.label.replace(" Year", "")}
                  </Chip>
                ))
              : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
