import { useEffect, useState, useTransition } from "react";
import { PersonTestsSection } from "@/components/PersonTestsSection";
import { StudentAcademicFields } from "@/components/StudentAcademicFields";
import { api } from "@/lib/api";
import {
  effectiveRollNo,
  formatAcademic,
  formatRollDisplay,
  type LevelType,
  type Program,
  type Section,
} from "@/lib/academic";
import type { Role } from "@/types";

export type EditableUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  program: Program | null;
  levelType: LevelType | null;
  level: number | null;
  section?: string | null;
  rollNo?: string | null;
  isActive?: boolean;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  createdAt?: string;
};

function isLocked(u: { lockedUntil?: string | null }): boolean {
  if (!u.lockedUntil) return false;
  return new Date(u.lockedUntil).getTime() > Date.now();
}

function roleLabel(role: Role): string {
  if (role === "STUDENT") return "Student";
  if (role === "STAFF") return "Staff";
  return "Admin";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EditUserForm({
  user,
  onCancel,
  onSaved,
  onUnlock,
  onRemove,
  unlockBusy,
  showTests = true,
}: {
  user: EditableUser;
  onCancel: () => void;
  onSaved: () => void;
  onUnlock?: () => void;
  onRemove?: () => void;
  unlockBusy?: boolean;
  /** When false, hide embedded test graphics (used on the dedicated person page). */
  showTests?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusBusy, setStatusBusy] = useState(false);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [rollNo, setRollNo] = useState(user.rollNo ?? "");
  const [program, setProgram] = useState<Program | "">(user.program ?? "");
  const [levelType, setLevelType] = useState<LevelType | "">(user.levelType ?? "");
  const [level, setLevel] = useState<number | "">(user.level ?? "");
  const [section, setSection] = useState<Section | "">(
    user.section === "A" || user.section === "B" ? user.section : ""
  );

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setPassword("");
    setRollNo(user.rollNo ?? "");
    setProgram(user.program ?? "");
    setLevelType(user.levelType ?? "");
    setLevel(user.level ?? "");
    setSection(user.section === "A" || user.section === "B" ? user.section : "");
    setError(null);
  }, [user]);

  const locked = isLocked(user);
  const active = user.isActive !== false;
  const classLabel =
    user.role !== "ADMIN" && user.program
      ? formatAcademic(user.program, user.levelType, user.level, user.section)
      : null;
  const rollDisplay =
    user.role === "STUDENT"
      ? formatRollDisplay(effectiveRollNo(user.rollNo, user.email))
      : null;

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-sky-200/80 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  function save() {
    setError(null);
    if (
      user.role !== "ADMIN" &&
      (!program || !levelType || level === "" || (user.role === "STUDENT" && !section))
    ) {
      setError(
        user.role === "STUDENT"
          ? "Select program, year, and section for this student."
          : "Select a class for this user."
      );
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const body: Record<string, unknown> = { name, email };
          if (password) body.password = password;
          if (user.role !== "ADMIN") {
            body.program = program;
            body.levelType = levelType;
            body.level = level;
            body.section = section || null;
          }
          if (user.role === "STUDENT") {
            body.rollNo = rollNo.trim();
          }
          await api(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          onSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save changes.");
        }
      })();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e8eb] bg-white shadow-warm-sm">
      <div className="relative border-b border-[#e5e8eb] bg-[#fafbfc] px-5 py-5 sm:px-6">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-sky-300/20 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/3 h-28 w-28 rounded-full bg-amber-300/15 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {user.role === "STUDENT" ? (
              <span className="people-roll">{rollDisplay}</span>
            ) : (
              <span className="people-avatar text-sm">{initials(user.name)}</span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-800/75">
                Account details
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-slate-900">
                {user.name}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-500">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    user.role === "STUDENT"
                      ? "bg-sky-100 text-sky-900"
                      : user.role === "STAFF"
                        ? "bg-teal-100 text-teal-950"
                        : "bg-slate-200 text-slate-800"
                  }`}
                >
                  {roleLabel(user.role)}
                </span>
                {classLabel ? (
                  <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-sky-200/80">
                    {classLabel}
                  </span>
                ) : null}
                {locked ? (
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-800">
                    Locked
                  </span>
                ) : (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="btn-ghost px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        <dl className="relative mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-100 bg-white/90 px-3 py-2.5 shadow-warm-sm">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Role
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {roleLabel(user.role)}
            </dd>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/90 px-3 py-2.5 shadow-warm-sm">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {user.role === "STUDENT" ? "Roll" : "Class"}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {user.role === "STUDENT"
                ? rollDisplay
                : classLabel ?? "—"}
            </dd>
          </div>
          <div className="rounded-xl border border-sky-100 bg-white/90 px-3 py-2.5 shadow-warm-sm">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Status
            </dt>
            <dd className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  !active ? "bg-slate-400" : locked ? "bg-red-500" : "bg-emerald-500"
                }`}
                aria-hidden
              />
              {!active
                ? "Inactive"
                : locked
                  ? `Locked${user.failedLoginCount ? ` · ${user.failedLoginCount} fails` : ""}`
                  : "Active"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <section className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Enrollment
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Deactivate to keep marks and history without allowing login. Prefer this over
                Remove for alumni or dropouts.
              </p>
            </div>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => {
                setError(null);
                setStatusBusy(true);
                void (async () => {
                  try {
                    await api(`/api/admin/users/${user.id}/set-active`, {
                      method: "POST",
                      body: JSON.stringify({ isActive: !active }),
                    });
                    onSaved();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not update enrollment status."
                    );
                  } finally {
                    setStatusBusy(false);
                  }
                })();
              }}
              className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-sm disabled:opacity-60 ${
                active
                  ? "border border-amber-300 bg-white text-amber-950 hover:bg-amber-50"
                  : "bg-emerald-700 text-white hover:bg-emerald-800"
              }`}
            >
              {statusBusy
                ? "Saving…"
                : active
                  ? "Deactivate account"
                  : "Reactivate account"}
            </button>
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm font-semibold text-slate-900">Profile</h3>
          <p className="mt-0.5 text-xs text-slate-500">Update name and login email.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            {user.role === "STUDENT" ? (
              <div>
                <label className="text-sm font-medium text-slate-700">Roll number</label>
                <input
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  placeholder="e.g. 01"
                  className={inputClass}
                />
              </div>
            ) : null}
            <div className={user.role === "STUDENT" ? "" : "sm:col-span-2"}>
              <label className="text-sm font-medium text-slate-700">
                New password{" "}
                <span className="font-normal text-slate-500">(leave blank to keep)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {user.role !== "ADMIN" ? (
          <section className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {user.role === "STAFF" ? "Department / class scope" : "Class"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {user.role === "STAFF"
                ? "Staff see tests and students for this program and year."
                : "Student cohort used for tests and placement lists."}
            </p>
            {program && levelType && level !== "" ? (
              <p className="mt-2 text-xs font-medium text-brand-800">
                Selected: {formatAcademic(program, levelType, level, section || null)}
              </p>
            ) : null}
            <div className="mt-3">
              <StudentAcademicFields
                program={program}
                levelType={levelType}
                level={level}
                section={section}
                idPrefix={`edit-${user.id}-`}
                onChange={(v) => {
                  setProgram(v.program);
                  setLevelType(v.levelType);
                  setLevel(v.level);
                  setSection(v.section);
                }}
              />
            </div>
          </section>
        ) : null}

        {showTests && (user.role === "STUDENT" || user.role === "STAFF") ? (
          <PersonTestsSection userId={user.id} role={user.role} />
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-sky-100 pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="btn-primary disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save all changes"}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            {locked && onUnlock ? (
              <button
                type="button"
                disabled={unlockBusy}
                onClick={onUnlock}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
              >
                Unlock account
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
