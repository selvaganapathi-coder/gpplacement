import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BulkStudentImport } from "@/components/BulkStudentImport";
import {
  CreateUserForm,
  type CreatedUserInfo,
} from "@/components/CreateUserForm";
import { type EditableUser } from "@/components/EditUserForm";
import {
  IconAlert,
  IconPlus,
  IconUpload,
  IconUsers,
} from "@/components/Icons";
import {
  defaultUserFilters,
  filterUsers,
  isUserLocked,
  sortUsers,
  UserFiltersBar,
  type UserFilterState,
} from "@/components/UserFilters";
import { api } from "@/lib/api";
import {
  academicYearOf,
  effectiveRollNo,
  formatRollDisplay,
  formatStudyLabel,
  programOptions,
  type Program,
} from "@/lib/academic";
import { COLLEGE_BRAND, collegeBrandMark } from "@/lib/collegeBrand";
import type { Role } from "@/types";

export type UserRow = EditableUser & {
  createdAt: string;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  isActive?: boolean;
};

type Panel = "none" | "add" | "import";

function isLocked(u: UserRow): boolean {
  return isUserLocked(u);
}

function roleLabel(role: Role): string {
  if (role === "STUDENT") return "Student";
  if (role === "STAFF") return "Staff";
  return "Admin";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function courseLabel(program: Program | null | undefined): string {
  if (!program) return "—";
  return programOptions().find((p) => p.id === program)?.label ?? program;
}

function courseTone(program: Program | null | undefined): string {
  if (program === "DPHARM") return "dir-course--dpharm";
  if (program === "BPHARM") return "dir-course--bpharm";
  if (program === "MPHARM") return "dir-course--mpharm";
  if (program === "PHARMD") return "dir-course--pharmd";
  return "dir-course--none";
}

export function UserManagement({
  users,
  onRefresh,
  externalPanel = null,
  onExternalPanelHandled,
  hidePrimaryActions = false,
  compact = false,
}: {
  users: UserRow[];
  onRefresh: () => void;
  /** Open add/import from a parent hero. */
  externalPanel?: "add" | "import" | null;
  onExternalPanelHandled?: () => void;
  /** Hide the in-list Add / Import buttons when the parent already shows them. */
  hidePrimaryActions?: boolean;
  /** Fill parent height; only the table body scrolls. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>("none");
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [highlightEmail, setHighlightEmail] = useState<string | null>(null);
  const [filters, setFilters] = useState<UserFilterState>(() => ({
    ...defaultUserFilters,
    sortBy: "name",
  }));

  useEffect(() => {
    if (!highlightEmail) return;
    const id = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-user-email="${CSS.escape(highlightEmail)}"]`
      );
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    const clear = window.setTimeout(() => setHighlightEmail(null), 5000);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(clear);
    };
  }, [highlightEmail, users]);

  useEffect(() => {
    if (!externalPanel) return;
    setPanel(externalPanel);
    setRemoving(null);
    setMessage(null);
    onExternalPanelHandled?.();
    // Only react when parent requests a panel open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear callback is intentionally fire-once
  }, [externalPanel]);

  function closePanels() {
    setPanel("none");
    setRemoving(null);
  }

  useEffect(() => {
    if (panel === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel("none");
        setRemoving(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [panel]);

  const tableRows = useMemo(() => {
    return sortUsers(filterUsers(users, filters), filters.sortBy);
  }, [users, filters]);

  function setSort(sortBy: UserFilterState["sortBy"]) {
    setFilters((f) => ({ ...f, sortBy }));
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/users/${removing.id}`, { method: "DELETE" });
      setMessage(`Removed ${removing.name}.`);
      setRemoving(null);
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not remove user.");
    } finally {
      setBusy(false);
    }
  }

  async function unlockUser(u: UserRow) {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/users/${u.id}/unlock`, { method: "POST" });
      setMessage(`Unlocked ${u.name}.`);
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not unlock user.");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(u: UserRow, isActive: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/admin/users/${u.id}/set-active`, {
        method: "POST",
        body: JSON.stringify({ isActive }),
      });
      setMessage(
        isActive ? `Reactivated ${u.name}.` : `Deactivated ${u.name} (kept in records).`
      );
      onRefresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not update enrollment status."
      );
    } finally {
      setBusy(false);
    }
  }

  const staffMissingDept = useMemo(
    () => users.filter((u) => u.role === "STAFF" && !u.program),
    [users]
  );

  return (
    <div className={compact ? "people-dir people-dir--fill" : "people-dir space-y-4"}>
      {staffMissingDept.length > 0 ? (
        <div className="soft-alert shrink-0 border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/70 py-2 text-amber-950">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              {staffMissingDept.length} staff need a department — open a name to set
              course.
            </span>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {staffMissingDept.slice(0, 6).map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/admin/people/${u.id}`)}
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
                >
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact ? (
        <header className="dir-head">
          <div className="dir-head__mark" aria-hidden>
            {collegeBrandMark()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="dir-head__kicker">{COLLEGE_BRAND.name}</p>
            <h2 className="dir-head__title">Account directory</h2>
            <p className="dir-head__sub">
              Campus roster by course — click any row to open details.
            </p>
            <ul className="dir-head__courses" aria-label="Courses">
              {programOptions().map((p) => (
                <li key={p.id} className={`dir-course ${courseTone(p.id)}`}>
                  {p.label}
                </li>
              ))}
            </ul>
          </div>
          {!hidePrimaryActions ? (
            <div className="dir-head__actions">
              <button
                type="button"
                onClick={() => {
                  setPanel("add");
                  setRemoving(null);
                  setMessage(null);
                }}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <IconPlus className="h-4 w-4" />
                Add person
              </button>
              <button
                type="button"
                onClick={() => {
                  setPanel("import");
                  setRemoving(null);
                  setMessage(null);
                }}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <IconUpload className="h-4 w-4" />
                Import people
              </button>
            </div>
          ) : null}
        </header>
      ) : null}

      {message ? (
        <div
          className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-sm text-emerald-950"
          role="status"
        >
          <p>{message}</p>
          {highlightEmail ? (
            <button
              type="button"
              className="rounded-md bg-emerald-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-900"
              onClick={() => {
                setPanel("none");
                const el = document.querySelector(
                  `[data-user-email="${CSS.escape(highlightEmail)}"]`
                );
                el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
            >
              Show in list
            </button>
          ) : null}
        </div>
      ) : null}

      {panel === "add" || panel === "import"
        ? createPortal(
            <div
              className="people-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="people-modal-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) closePanels();
              }}
            >
              <div className="people-modal__panel" onClick={(e) => e.stopPropagation()}>
                <div className="people-modal__head">
                  <div className="min-w-0">
                    <p className="people-modal__kicker">
                      {panel === "add" ? "Account directory" : "Bulk upload"}
                    </p>
                    <h3 id="people-modal-title" className="people-modal__title">
                      {panel === "add" ? "Add person" : "Import people"}
                    </h3>
                    <p className="people-modal__sub">
                      {panel === "add"
                        ? "New accounts start Active and can sign in immediately."
                        : "Preview first · duplicates update existing emails."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-brand-50"
                    onClick={closePanels}
                  >
                    Close
                  </button>
                </div>
                <div className="people-modal__body">
                  {panel === "add" ? (
                    <CreateUserForm
                      onCreated={(info: CreatedUserInfo) => {
                        onRefresh();
                        setHighlightEmail(info.email);
                        const who =
                          info.role === "STUDENT"
                            ? "student"
                            : info.role === "STAFF"
                              ? "staff"
                              : "admin";
                        setMessage(
                          info.updated
                            ? `Updated 1 ${who}: ${info.name}.`
                            : `1 ${who} added: ${info.name}.`
                        );
                      }}
                    />
                  ) : (
                    <BulkStudentImport
                      existingEmails={users.map((u) => u.email.toLowerCase())}
                      onImported={(summary) => {
                        onRefresh();
                        const parts: string[] = [];
                        if (summary.created)
                          parts.push(
                            `${summary.created} ${summary.created === 1 ? "person" : "people"} added`
                          );
                        if (summary.updated)
                          parts.push(`${summary.updated} updated`);
                        if (summary.skipped)
                          parts.push(`${summary.skipped} skipped`);
                        if (summary.errors.length)
                          parts.push(
                            `${summary.errors.length} error${summary.errors.length === 1 ? "" : "s"}`
                          );
                        setMessage(
                          parts.length ? parts.join(" · ") + "." : "Import finished."
                        );
                      }}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {removing ? (
        <div
          className="animate-fade-in rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-warm-sm sm:p-5"
          role="alertdialog"
          aria-labelledby="remove-title"
        >
          <p id="remove-title" className="font-display text-base font-semibold text-red-950">
            Remove {removing.name}?
          </p>
          <p className="mt-1 text-sm text-red-900/90">
            Deletes {removing.email}. This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmRemove()}
              className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-60"
            >
              {busy ? "Removing…" : "Remove"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(null)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="people-directory people-directory--fill">
        <div className="people-directory__toolbar">
          <UserFiltersBar
            filters={filters}
            onChange={setFilters}
            resultCount={tableRows.length}
            totalCount={users.length}
          />
        </div>

        {tableRows.length === 0 ? (
          <div className="empty-state m-4 space-y-2">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-800 ring-1 ring-brand-100">
              <IconUsers className="h-6 w-6" />
            </span>
            <p className="font-display text-base font-semibold text-slate-800">
              No matching accounts
            </p>
            <p className="text-sm text-slate-500">
              Try clearing search or filters, or add a person.
            </p>
          </div>
        ) : (
          <div className="dir-table-wrap">
            <table className="dir-table">
              <colgroup>
                <col className="dir-col-person" />
                <col className="dir-col-role" />
                <col className="dir-col-course" />
                <col className="dir-col-year" />
                <col className="dir-col-roll" />
                <col className="dir-col-status" />
                <col className="dir-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th className="dir-th--left">
                    <button
                      type="button"
                      className={`dir-sort ${filters.sortBy === "name" ? "dir-sort--active" : ""}`}
                      onClick={() => setSort("name")}
                    >
                      Person A–Z
                    </button>
                  </th>
                  <th className="dir-th--center">Role</th>
                  <th className="dir-th--center">Course</th>
                  <th className="dir-th--center">Batch / Sec</th>
                  <th className="dir-th--center">
                    <button
                      type="button"
                      className={`dir-sort ${filters.sortBy === "roll_name" ? "dir-sort--active" : ""}`}
                      onClick={() => setSort("roll_name")}
                    >
                      Roll
                    </button>
                  </th>
                  <th className="dir-th--center">Status</th>
                  <th className="dir-th--right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((u, index) => {
                  const locked = isLocked(u);
                  const active = u.isActive !== false;
                  const year = academicYearOf(u.program, u.levelType, u.level);
                  const roll =
                    u.role === "STUDENT"
                      ? formatRollDisplay(effectiveRollNo(u.rollNo, u.email))
                      : "—";
                  const sec =
                    u.section === "A" || u.section === "B" ? u.section : "—";
                  return (
                    <tr
                      key={u.id}
                      data-user-email={u.email.toLowerCase()}
                      className={`dir-table__row ${locked ? "dir-table__row--locked" : ""} ${
                        !active ? "dir-table__row--inactive" : ""
                      } ${
                        highlightEmail &&
                        highlightEmail.toLowerCase() === u.email.toLowerCase()
                          ? "dir-table__row--flash"
                          : ""
                      }`}
                      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
                      onClick={() => navigate(`/dashboard/admin/people/${u.id}`)}
                    >
                      <td data-label="Person" className="dir-td--left">
                        <div className="dir-person">
                          <span
                            className={`dir-avatar ${
                              u.role === "STAFF"
                                ? "dir-avatar--staff"
                                : u.role === "STUDENT"
                                  ? "dir-avatar--student"
                                  : "dir-avatar--admin"
                            }`}
                          >
                            {initials(u.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="dir-person__name">{u.name}</span>
                            <span className="dir-person__email">{u.email}</span>
                          </span>
                        </div>
                      </td>
                      <td data-label="Role" className="dir-td--center">
                        <span
                          className={`dir-role ${
                            u.role === "STUDENT"
                              ? "dir-role--student"
                              : u.role === "STAFF"
                                ? "dir-role--staff"
                                : "dir-role--admin"
                          }`}
                        >
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td data-label="Course" className="dir-td--center">
                        <span className={`dir-course ${courseTone(u.program)}`}>
                          {courseLabel(u.program)}
                        </span>
                      </td>
                      <td data-label="Batch / Sec" className="dir-td--center whitespace-nowrap">
                        {year != null ? (
                          <span className="tabular-nums">
                            {formatStudyLabel(u.program, u.levelType, year)}
                            {sec !== "—" ? (
                              <span className="text-slate-400"> · </span>
                            ) : null}
                            {sec !== "—" ? (
                              <span className="font-semibold text-slate-800">{sec}</span>
                            ) : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Roll" className="dir-td--center dir-roll">
                        {roll}
                      </td>
                      <td data-label="Status" className="dir-td--center">
                        {!active ? (
                          <span className="badge-inactive" title="Cannot sign in">
                            Inactive
                          </span>
                        ) : locked ? (
                          <span className="badge-danger">Locked</span>
                        ) : u.role === "STAFF" && !u.program ? (
                          <span className="badge-warn">No dept</span>
                        ) : (
                          <span className="badge-ok">Active</span>
                        )}
                      </td>
                      <td
                        data-label="Actions"
                        className="dir-td--right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="dir-actions">
                          {locked ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void unlockUser(u)}
                              className="dir-actions__btn dir-actions__btn--ok"
                            >
                              Unlock
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setActive(u, !active)}
                            className={
                              active
                                ? "dir-actions__btn"
                                : "dir-actions__btn dir-actions__btn--ok"
                            }
                            title={
                              active
                                ? "Disable — keep records, block login & app use"
                                : "Enable — allow login again"
                            }
                          >
                            {active ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/dashboard/admin/people/${u.id}`)}
                            className="dir-actions__btn"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRemoving(u);
                              setMessage(null);
                            }}
                            className="dir-actions__btn dir-actions__btn--danger"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
