import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  IconCheck,
  IconGraduation,
  IconPlus,
  IconSearch,
  IconStaff,
  IconUsers,
} from "@/components/Icons";
import { api } from "@/lib/api";
import {
  defaultUserFilters,
  filterUsers,
  UserFiltersBar,
  type UserFilterState,
} from "@/components/UserFilters";
import {
  allClassCohorts,
  formatAcademic,
  programOptions,
  type LevelType,
  type Program,
  type Section,
} from "@/lib/academic";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  assignedCount: number;
  branchScopes: {
    id: string;
    program: Program;
    levelType: LevelType | null;
    level: number | null;
    section?: string | null;
  }[];
};

type RosterStudent = {
  assignmentId: string | null;
  student: {
    id: string;
    name: string;
    email: string;
    program: Program | null;
    levelType: LevelType | null;
    level: number | null;
    section?: string | null;
  };
};

type Roster = {
  staff: { id: string; name: string; email: string };
  branchScopes: {
    id: string;
    scopeKey: string;
    program: Program;
    levelType: LevelType | null;
    level: number | null;
    section?: string | null;
  }[];
  students: RosterStudent[];
  assignments: {
    assignmentId: string;
    student: RosterStudent["student"];
  }[];
};

type StudentRow = {
  id: string;
  name: string;
  email: string;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
  assignedTo: { staff: { id: string; name: string } }[];
};

type ClassCohort = {
  key: string;
  program: Program;
  levelType: LevelType;
  level: number;
  section: Section;
  label: string;
};

const CLASS_COHORTS: ClassCohort[] = allClassCohorts();

export function StaffAllocationManager() {
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffId, setStaffId] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [moreTab, setMoreTab] = useState<"pick" | "manage">("pick");
  const [courseFilter, setCourseFilter] = useState<Program | "">("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [studentFilters, setStudentFilters] = useState<UserFilterState>(defaultUserFilters);
  const [linkFilter, setLinkFilter] = useState<"not_linked" | "linked" | "all">("not_linked");
  const [picked, setPicked] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    const { staff } = await api<{ staff: StaffRow[] }>("/api/admin/staff");
    setStaffList(staff);
  }, []);

  const loadRoster = useCallback(async (id: string) => {
    if (!id) {
      setRoster(null);
      return;
    }
    setRoster(await api<Roster>(`/api/admin/staff/${id}/roster`));
  }, []);

  const loadStudents = useCallback(async () => {
    const { students: list } = await api<{ students: StudentRow[] }>("/api/admin/students");
    setStudents(list);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadStaff(), loadStudents(), staffId ? loadRoster(staffId) : Promise.resolve()]);
  }, [loadStaff, loadStudents, loadRoster, staffId]);

  useEffect(() => {
    void loadStaff();
    void loadStudents();
  }, [loadStaff, loadStudents]);

  useEffect(() => {
    void loadRoster(staffId);
    setPicked([]);
    setMessage(null);
    setError(null);
  }, [staffId, loadRoster]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [staffList, staffSearch]);

  const selectedStaff = staffList.find((s) => s.id === staffId);

  const classCards = useMemo(() => {
    return CLASS_COHORTS.map((c) => {
      const count = students.filter(
        (s) =>
          s.program === c.program &&
          s.levelType === c.levelType &&
          s.level === c.level &&
          (s.section ?? null) === c.section
      ).length;
      const linked = Boolean(
        roster?.branchScopes.some(
          (b) =>
            b.program === c.program &&
            b.levelType === c.levelType &&
            b.level === c.level &&
            (b.section ?? null) === c.section
        )
      );
      return { ...c, count, linked };
    }).filter((c) => (courseFilter ? c.program === courseFilter : true));
  }, [students, roster, courseFilter]);

  const filteredStudents = useMemo(() => {
    let list = filterUsers(
      students.map((s) => ({ ...s, role: "STUDENT" as const })),
      { ...studentFilters, role: "STUDENT" }
    );
    if (staffId && linkFilter === "linked") {
      list = list.filter((s) => s.assignedTo.some((a) => a.staff.id === staffId));
    }
    if (staffId && linkFilter === "not_linked") {
      list = list.filter((s) => !s.assignedTo.some((a) => a.staff.id === staffId));
    }
    return list;
  }, [students, studentFilters, linkFilter, staffId]);

  const unlinkedVisible = useMemo(
    () =>
      filteredStudents.filter((s) => !s.assignedTo.some((a) => a.staff.id === staffId)),
    [filteredStudents, staffId]
  );

  const filteredRosterStudents = useMemo(() => {
    if (!roster?.students) return [];
    const q = rosterSearch.trim().toLowerCase();
    const list = roster.students;
    if (!q) return list;
    return list.filter(
      (row) =>
        row.student.name.toLowerCase().includes(q) ||
        row.student.email.toLowerCase().includes(q) ||
        formatAcademic(row.student.program, row.student.levelType, row.student.level, row.student.section)
          .toLowerCase()
          .includes(q)
    );
  }, [roster, rosterSearch]);

  const rosterByClass = useMemo(() => {
    const groups = new Map<string, RosterStudent[]>();
    for (const row of filteredRosterStudents) {
      const label = formatAcademic(
        row.student.program,
        row.student.levelType,
        row.student.level,
        row.student.section
      );
      const key = label || "No class set";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRosterStudents]);

  const staffName = selectedStaff?.name ?? "staff";

  function assignWholeClass(cohort: ClassCohort) {
    if (!staffId) {
      setError("Choose a staff member first.");
      return;
    }
    setError(null);
    setLinkingKey(cohort.key);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{ studentCount: number; linked: number }>(
            "/api/admin/assign-branch",
            {
              method: "POST",
              body: JSON.stringify({
                staffId,
                program: cohort.program,
                levelType: cohort.levelType,
                level: cohort.level,
                section: cohort.section,
              }),
            }
          );
          setMessage(
            `${staffName} now owns ${cohort.label} for creating tests (${res.studentCount} students). Other staff cannot create tests for this class.`
          );
          await refresh();
          setMoreTab("manage");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not assign class.");
        } finally {
          setLinkingKey(null);
        }
      })();
    });
  }

  function assignWholeProgram(program: Program) {
    if (!staffId) {
      setError("Choose a staff member first.");
      return;
    }
    setError(null);
    setLinkingKey(`prog:${program}`);
    startTransition(() => {
      void (async () => {
        try {
          await api("/api/admin/branch-scopes", {
            method: "POST",
            body: JSON.stringify({ staffId, program }),
          });
          const label =
            programOptions().find((p) => p.id === program)?.label ?? program;
          setMessage(
            `${staffName} owns all ${label} classes — they can create tests for any year/section in that course.`
          );
          await refresh();
          setMoreTab("manage");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not assign department.");
        } finally {
          setLinkingKey(null);
        }
      })();
    });
  }

  function assignStudentIds(ids: string[], label: string) {
    if (!staffId || ids.length === 0) return;
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api<{ assigned: number }>("/api/admin/assignments", {
            method: "POST",
            body: JSON.stringify({ staffId, studentIds: ids }),
          });
          setMessage(
            `${label}: ${res.assigned} student(s) now under ${staffName}.`
          );
          setPicked([]);
          await refresh();
          setMoreTab("manage");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Assignment failed.");
        }
      })();
    });
  }

  async function removeAssignment(assignmentId: string) {
    await api(`/api/admin/assignments/${assignmentId}`, { method: "DELETE" });
    setMessage("Student unlinked.");
    await refresh();
  }

  async function removeScope(scopeId: string) {
    await api(`/api/admin/branch-scopes/${scopeId}`, { method: "DELETE" });
    setMessage("Class access removed.");
    await refresh();
  }

  function toggleAllVisible() {
    const ids = unlinkedVisible.map((s) => s.id);
    const allOn = ids.length > 0 && ids.every((id) => picked.includes(id));
    setPicked((prev) =>
      allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    );
  }

  const inputClass =
    "w-full rounded-lg border border-brand-200/80 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="classes-easy space-y-3">
      <section className="classes-easy__bar">
        <div className="classes-easy__bar-left">
          <span className="classes-easy__icon" aria-hidden>
            <IconStaff className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="classes-easy__title">Who teaches which class?</h2>
            <p className="classes-easy__hint">
              Pick staff → tap a course or class. Done.
            </p>
          </div>
        </div>
        <label className="classes-easy__staff-pick">
          <IconSearch className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            aria-label="Choose staff"
          >
            <option value="">Choose staff…</option>
            {filteredStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.branchScopes.length
                  ? ` · ${s.branchScopes.length} class${s.branchScopes.length === 1 ? "" : "es"}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!staffId ? (
        <div className="classes-easy__empty">
          <IconUsers className="mx-auto h-8 w-8 text-brand-700/70" />
          <p className="mt-2 font-medium text-slate-800">Choose a staff member</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Then assign their course or one class below.
          </p>
          {staffList.length > 6 ? (
            <input
              type="search"
              placeholder="Filter staff list…"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              className={`${inputClass} mx-auto mt-3 max-w-sm`}
            />
          ) : null}
          <ul className="classes-easy__staff-grid">
            {filteredStaff.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="classes-easy__staff-card"
                  onClick={() => setStaffId(s.id)}
                >
                  <span className="classes-easy__staff-avatar">
                    {s.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate font-semibold text-slate-900">
                      {s.name}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {s.branchScopes.length
                        ? `${s.branchScopes.length} linked`
                        : "Not linked yet"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <section className="classes-easy__panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Linking for <span className="text-brand-800">{staffName}</span>
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-brand-800 hover:underline"
                onClick={() => setStaffId("")}
              >
                Change staff
              </button>
            </div>

            {roster && roster.branchScopes.length > 0 ? (
              <ul className="classes-easy__linked">
                {roster.branchScopes.map((b) => (
                  <li key={b.id}>
                    <IconCheck className="h-3 w-3 text-emerald-700" />
                    <span>
                      {formatAcademic(b.program, b.levelType, b.level, b.section)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeScope(b.id)}
                      className="text-[11px] font-semibold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No classes linked yet.</p>
            )}
          </section>

          <section className="classes-easy__panel">
            <h3 className="classes-easy__section-title">
              <IconGraduation className="h-4 w-4" />
              Give whole course
            </h3>
            <p className="classes-easy__section-sub">
              One tap = every year &amp; section in that degree.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {programOptions().map((p) => {
                const owned = Boolean(
                  roster?.branchScopes.some(
                    (b) => b.program === p.id && b.levelType == null
                  )
                );
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={pending || owned}
                    onClick={() => assignWholeProgram(p.id)}
                    className={
                      owned
                        ? "classes-easy__chip classes-easy__chip--done"
                        : "classes-easy__chip"
                    }
                  >
                    {linkingKey === `prog:${p.id}`
                      ? "Saving…"
                      : owned
                        ? `✓ ${p.label}`
                        : `All ${p.label}`}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="classes-easy__panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="classes-easy__section-title">
                  <IconPlus className="h-4 w-4" />
                  Or one class
                </h3>
                <p className="classes-easy__section-sub">
                  Exact year + section only.
                </p>
              </div>
              <select
                value={courseFilter}
                onChange={(e) =>
                  setCourseFilter((e.target.value || "") as Program | "")
                }
                className="rounded-lg border border-brand-200/80 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                aria-label="Filter by course"
              >
                <option value="">All courses</option>
                {programOptions().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <ul className="classes-easy__class-list">
              {classCards.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-slate-500">
                  No classes for this filter.
                </li>
              ) : (
                classCards.map((c) => (
                  <li key={c.key} className={c.linked ? "is-linked" : undefined}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {c.label}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {c.count} student{c.count === 1 ? "" : "s"}
                        {c.linked ? " · linked" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending || c.count === 0 || c.linked}
                      onClick={() => assignWholeClass(c)}
                      className={
                        c.linked
                          ? "classes-easy__assign classes-easy__assign--done"
                          : "classes-easy__assign"
                      }
                    >
                      {linkingKey === c.key
                        ? "…"
                        : c.linked
                          ? "Linked"
                          : c.count === 0
                            ? "Empty"
                            : "Assign"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <button
            type="button"
            className="classes-easy__advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? "Hide" : "Show"} advanced (pick students / manage)
            {roster ? (
              <span className="font-normal text-slate-500">
                {" "}
                · {roster.students?.length ?? 0} under staff
              </span>
            ) : null}
          </button>

          {showAdvanced ? (
            <section className="classes-easy__panel space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "pick" as const, label: "Pick students" },
                    { id: "manage" as const, label: "Manage access" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMoreTab(t.id)}
                    className={
                      moreTab === t.id
                        ? "classes-easy__chip classes-easy__chip--active"
                        : "classes-easy__chip"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {moreTab === "pick" ? (
                <div className="space-y-3">
                  <UserFiltersBar
                    filters={studentFilters}
                    onChange={setStudentFilters}
                    resultCount={filteredStudents.length}
                    totalCount={students.length}
                    showClassFilters
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={linkFilter}
                      onChange={(e) =>
                        setLinkFilter(e.target.value as typeof linkFilter)
                      }
                      className="rounded-lg border border-brand-200/80 px-2 py-1.5 text-xs"
                    >
                      <option value="not_linked">Not linked yet</option>
                      <option value="linked">Already linked</option>
                      <option value="all">All</option>
                    </select>
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      className="dir-actions__btn"
                    >
                      Select all unlinked
                    </button>
                    <button
                      type="button"
                      disabled={pending || picked.length === 0}
                      onClick={() => assignStudentIds(picked, "Selected")}
                      className="btn-primary !min-h-8 !px-3 !text-xs"
                    >
                      Assign {picked.length} selected
                    </button>
                  </div>
                  <div className="data-table-wrap max-h-64 rounded-xl border border-brand-100">
                    <table className="data-table data-table--compact">
                      <thead>
                        <tr>
                          <th className="w-10" />
                          <th>Student</th>
                          <th>Class</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.slice(0, 80).map((st) => {
                          const linked = st.assignedTo.some(
                            (a) => a.staff.id === staffId
                          );
                          return (
                            <tr key={st.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={picked.includes(st.id)}
                                  disabled={linked}
                                  onChange={(e) => {
                                    setPicked((ids) =>
                                      e.target.checked
                                        ? [...ids, st.id]
                                        : ids.filter((id) => id !== st.id)
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                <p className="font-medium text-slate-900">{st.name}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {st.email}
                                </p>
                              </td>
                              <td className="text-xs text-slate-600">
                                {formatAcademic(
                                  st.program,
                                  st.levelType,
                                  st.level,
                                  st.section
                                )}
                                {linked ? " · linked" : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {moreTab === "manage" && roster ? (
                <div className="space-y-3">
                  <input
                    type="search"
                    placeholder="Search under this staff…"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className={inputClass}
                  />
                  {rosterByClass.length === 0 ? (
                    <p className="text-sm text-slate-500">No students under this staff yet.</p>
                  ) : (
                    <div className="max-h-72 space-y-3 overflow-y-auto">
                      {rosterByClass.map(([classLabel, rows]) => (
                        <div key={classLabel}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {classLabel} ({rows.length})
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {rows.map((row) => (
                              <li
                                key={row.student.id}
                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-brand-50/50"
                              >
                                <span className="truncate">
                                  <span className="font-medium text-slate-900">
                                    {row.student.name}
                                  </span>
                                </span>
                                {row.assignmentId ? (
                                  <button
                                    type="button"
                                    onClick={() => void removeAssignment(row.assignmentId!)}
                                    className="shrink-0 text-[11px] font-semibold text-red-600"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Via class</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
