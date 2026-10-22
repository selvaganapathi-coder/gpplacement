import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAcademicCatalog } from "@/hooks/useAcademicCatalog";
import {
  academicYearOf,
  formatYearLabel,
  listCohortPresets,
  suggestEmail,
  suggestName,
  type CohortPreset,
  type LevelType,
  type Program,
} from "@/lib/academic";
import { COLLEGE_BRAND } from "@/lib/collegeBrand";
import {
  CAMPUS_DEFAULT_PASSWORD,
  passwordStrength,
  validatePasswordClient,
} from "@/lib/passwordStrength";

type RoleChoice = "STUDENT" | "STAFF" | "ADMIN";

export type CreatedUserInfo = {
  id: string;
  email: string;
  updated: boolean;
  role: RoleChoice;
  name: string;
};

const COHORTS = listCohortPresets();

const ROLE_META: Record<
  RoleChoice,
  {
    label: string;
    title: string;
    blurb: string;
    accent: string;
    ring: string;
    btn: string;
  }
> = {
  STUDENT: {
    label: "Student",
    title: "Add student",
    blurb: "Course + year + roll → email fills in automatically.",
    accent: "from-brand-600 to-amber-500",
    ring: "ring-amber-400",
    btn: "Save student",
  },
  STAFF: {
    label: "Staff",
    title: "Add staff",
    blurb: "Department required. Class sections are optional (set under Class links).",
    accent: "from-amber-500 to-brand-700",
    ring: "ring-amber-400",
    btn: "Save staff",
  },
  ADMIN: {
    label: "Admin",
    title: "Add administrator",
    blurb: "Full portal access — no course required.",
    accent: "from-brand-800 to-brand-950",
    ring: "ring-brand-400",
    btn: "Create admin",
  },
};

function cohortForProgramYear(
  program: Program,
  year: number
): CohortPreset | null {
  return (
    COHORTS.find(
      (c) =>
        c.program === program &&
        academicYearOf(c.program, c.levelType, c.level) === year
    ) ?? null
  );
}

function StrengthBar({ password }: { password: string }) {
  const { score, label, ok } = passwordStrength(password);
  const colors = [
    "bg-slate-200",
    "bg-red-400",
    "bg-amber-400",
    "bg-lime-500",
    "bg-emerald-600",
  ];
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              score >= i ? colors[score]! : "bg-slate-100"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${ok ? "text-slate-500" : "text-amber-800"}`}>{label}</p>
    </div>
  );
}

export function CreateUserForm({
  onCreated,
}: {
  onCreated?: (info: CreatedUserInfo) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loginNote, setLoginNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const [role, setRole] = useState<RoleChoice>("STUDENT");
  const [program, setProgram] = useState<Program | "">("BPHARM");
  const [year, setYear] = useState<number | "">("");
  const [slot, setSlot] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(CAMPUS_DEFAULT_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [autoFill, setAutoFill] = useState(true);
  const [updateIfExists, setUpdateIfExists] = useState(true);

  const [levelType, setLevelType] = useState<LevelType | "">("");
  const [level, setLevel] = useState<number | "">("");

  const meta = ROLE_META[role];
  const catalog = useAcademicCatalog();
  const departments = catalog.departments.map((dept) => ({
    id: dept.program,
    label: dept.name,
  }));
  const yearOptions = useMemo(
    () =>
      program
        ? catalog.batchYears.map((year) => ({ value: year, label: `${year} batch` }))
        : [],
    [program, catalog.batchYears]
  );

  const selectedCohort = useMemo(() => {
    if (!program || year === "") return null;
    return cohortForProgramYear(program, year);
  }, [program, year]);

  useEffect(() => {
    if (role === "ADMIN") {
      setProgram("");
      setYear("");
      setLevelType("");
      setLevel("");
      setAutoFill(false);
      return;
    }
    if (role === "STAFF") {
      setYear("");
      setLevelType("");
      setLevel("");
      setAutoFill(false);
      return;
    }
    setAutoFill(true);
  }, [role]);

  useEffect(() => {
    if (role !== "STUDENT") return;
    if (!program || year === "") {
      setLevelType("");
      setLevel("");
      return;
    }
    const c = cohortForProgramYear(program, year);
    if (c) {
      setLevelType(c.levelType);
      setLevel(c.level);
    } else {
      setLevelType("YEAR");
      setLevel(year);
    }
  }, [role, program, year]);

  useEffect(() => {
    if (!autoFill || role !== "STUDENT" || !selectedCohort) return;
    setEmail(suggestEmail("STUDENT", selectedCohort, slot));
    setName(suggestName("STUDENT", selectedCohort, slot));
  }, [autoFill, role, selectedCohort, slot]);

  function switchRole(next: RoleChoice) {
    setRole(next);
    setError(null);
    setSuccess(null);
    setLoginNote(null);
    setCopied(false);
    setSlot(1);
    setPassword(CAMPUS_DEFAULT_PASSWORD);
    setEmail("");
    setName("");
    if (next !== "STUDENT") {
      setYear("");
      setLevelType("");
      setLevel("");
    }
    if (next === "ADMIN") {
      setProgram("");
    } else if (!program) {
      setProgram("BPHARM");
    }
  }

  async function copyLogin() {
    if (!loginNote) return;
    try {
      await navigator.clipboard.writeText(loginNote);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the login note and copy manually.");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoginNote(null);
    setCopied(false);

    if (role === "STUDENT" && (!program || year === "" || !levelType || level === "")) {
      setError("Select a course and year for the student.");
      return;
    }
    if (role === "STAFF" && !program) {
      setError("Select a department for this staff member.");
      return;
    }
    const pwdErr = validatePasswordClient(password);
    if (pwdErr) {
      setError(pwdErr);
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload: Record<string, unknown> = {
            email: email.trim().toLowerCase(),
            name: name.trim(),
            password,
            role,
            updateIfExists: role !== "ADMIN" && updateIfExists,
          };
          if (role === "STUDENT") {
            payload.program = program;
            payload.levelType = levelType;
            payload.level = level;
            payload.section = null;
            payload.rollNo = String(slot).padStart(2, "0");
          }
          if (role === "STAFF") {
            payload.program = program;
          }

          const res = await api<{
            ok: true;
            id: string;
            email: string;
            updated?: boolean;
          }>("/api/admin/users", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          const verb = res.updated ? "updated" : "added";
          const savedName = name.trim();
          if (role === "STUDENT") {
            setSuccess(
              `1 student ${verb}: ${savedName} · Roll ${String(slot).padStart(2, "0")}.`
            );
            if (!res.updated) {
              setSlot((s) => s + 1);
              if (autoFill && selectedCohort) {
                setEmail(suggestEmail("STUDENT", selectedCohort, slot + 1));
                setName(suggestName("STUDENT", selectedCohort, slot + 1));
              }
            }
          } else if (role === "STAFF") {
            const dept =
              departments.find((p) => p.id === program)?.label ?? "department";
            setSuccess(`1 staff ${verb}: ${savedName} · ${dept}.`);
            if (!res.updated) {
              setEmail("");
              setName("");
            }
          } else {
            setSuccess(`1 admin created: ${savedName}.`);
            setEmail("");
            setName("");
          }

          const note = [
            `Login for ${COLLEGE_BRAND.name}`,
            `Name: ${savedName}`,
            `Email: ${res.email}`,
            `Password: ${password}`,
            `Portal: sign in with the email and password above.`,
          ].join("\n");
          setLoginNote(note);

          onCreated?.({
            id: res.id,
            email: res.email,
            updated: !!res.updated,
            role,
            name: savedName,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save user.");
        }
      })();
    });
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-brand-200/80 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

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
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          active
            ? "bg-brand-700 text-white shadow-sm"
            : "bg-white text-slate-600 ring-1 ring-brand-200/80 hover:bg-brand-50"
        }`}
      >
        {children}
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="add-person-form">
      <div className="add-person-step">
        <p className="add-person-step__label">1 · Who</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ROLE_META) as RoleChoice[]).map((id) => {
            const m = ROLE_META[id];
            const active = role === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchRole(id)}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? `bg-gradient-to-r ${m.accent} text-white shadow-sm`
                    : "bg-white text-slate-700 ring-1 ring-brand-200/80 hover:bg-brand-50"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">{meta.blurb}</p>
      </div>

      {role === "STUDENT" ? (
        <div className="add-person-step">
          <p className="add-person-step__label">2 · Class</p>
          <div className="flex flex-wrap gap-1.5">
            {departments.map((p) => (
              <Chip
                key={p.id}
                active={program === p.id}
                onClick={() => {
                  setProgram(p.id);
                  setYear("");
                }}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium text-slate-600">Batch</p>
              <div className="flex flex-wrap gap-1.5">
                {!program ? (
                  <p className="text-xs text-slate-500">Pick a course first.</p>
                ) : (
                  yearOptions.map((y) => (
                    <Chip
                      key={y.value}
                      active={year === y.value}
                      onClick={() => setYear(y.value)}
                    >
                      {y.label}
                    </Chip>
                  ))
                )}
              </div>
            </div>
            <div className="w-20">
              <label className="text-xs font-medium text-slate-600" htmlFor="roll">
                Roll
              </label>
              <input
                id="roll"
                type="number"
                min={1}
                max={99}
                value={slot}
                onChange={(e) => setSlot(Math.max(1, Number(e.target.value) || 1))}
                className={inputClass}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={autoFill}
              onChange={(e) => setAutoFill(e.target.checked)}
              className="rounded border-brand-300"
            />
            Auto-fill email & name from course + roll
          </label>
          {program && year !== "" && autoFill && selectedCohort ? (
            <p className="rounded-lg bg-white/80 px-2.5 py-1.5 font-mono text-xs text-slate-800 ring-1 ring-brand-100">
              {suggestEmail("STUDENT", selectedCohort, slot)}
              <span className="ml-2 font-sans text-slate-500">
                {departments.find((p) => p.id === program)?.label} ·{" "}
                {yearOptions.find((y) => y.value === year)?.label ?? formatYearLabel(year)}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {role === "STAFF" ? (
        <div className="add-person-step">
          <p className="add-person-step__label">2 · Department</p>
          <div className="flex flex-wrap gap-1.5">
            {departments.map((p) => (
              <Chip
                key={p.id}
                active={program === p.id}
                onClick={() => setProgram(p.id)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Required for staff login. Link specific classes later under Class links.
          </p>
        </div>
      ) : null}

      {role === "ADMIN" ? (
        <div className="add-person-step border-amber-200 bg-amber-50/50">
          <p className="add-person-step__label text-amber-900">2 · Admin access</p>
          <p className="text-xs text-amber-950/90">
            Full portal control. No course needed. Use a strong password.
          </p>
        </div>
      ) : null}

      <div className="add-person-step">
        <p className="add-person-step__label">
          {role === "STUDENT" || role === "STAFF" ? "3" : "3"} · Login details
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (role === "STUDENT") setAutoFill(false);
              }}
              placeholder={`name@${COLLEGE_BRAND.emailDomain}`}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (role === "STUDENT") setAutoFill(false);
              }}
              placeholder="Full name"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => setPassword(CAMPUS_DEFAULT_PASSWORD)}
              >
                Campus default
              </button>
            </div>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass + " mt-0 pr-16"}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-brand-50"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <StrengthBar password={password} />
          </div>
        </div>
        {role !== "ADMIN" ? (
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={updateIfExists}
              onChange={(e) => setUpdateIfExists(e.target.checked)}
              className="mt-0.5 rounded border-brand-300"
            />
            <span>If email exists, update that person (no duplicate).</span>
          </label>
        ) : null}
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
          role="status"
        >
          <p className="font-medium">{success}</p>
          {loginNote ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyLogin()}
                className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                {copied ? "Copied" : "Copy login details"}
              </button>
              <span className="text-xs text-emerald-800/80">Share with the person</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-xl bg-gradient-to-r ${meta.accent} px-4 py-3 text-sm font-semibold text-white shadow-warm transition disabled:opacity-60`}
      >
        {pending ? "Saving…" : meta.btn}
      </button>
    </form>
  );
}
