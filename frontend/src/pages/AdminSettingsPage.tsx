import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { SessionDevices } from "@/components/SessionDevices";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import { rememberCatalog, useAcademicCatalog, type CatalogDepartment } from "@/hooks/useAcademicCatalog";
import { api, downloadFileFromUrl } from "@/lib/api";
import { adminSidebarNav } from "@/lib/dashboardNav";

type CollegeSettings = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  emailDomain: string;
};

const ADVANCED_LINKS = [
  {
    href: "/dashboard/admin?tab=audit",
    title: "Activity log",
    sub: "Sign-ins, unlocks, imports, and security events",
  },
  {
    href: "/dashboard/admin/analytics",
    title: "Insights",
    sub: "Campus charts — averages, pass rates, weak topics",
  },
  {
    href: "/dashboard/admin/students",
    title: "Student scores",
    sub: "Per-student score cards and personal CSV",
  },
  {
    href: "/dashboard/admin/skills/master",
    title: "Skill Master",
    sub: "Skill categories for self-assessment (optional)",
  },
] as const;

function AcademicSetup() {
  const catalog = useAcademicCatalog();
  const [years, setYears] = useState<number[] | null>(null);
  const [departments, setDepartments] = useState<CatalogDepartment[] | null>(null);
  const [newYear, setNewYear] = useState("");
  const [deptName, setDeptName] = useState("");
  const [durationYears, setDurationYears] = useState(2);
  const [pickProgram, setPickProgram] = useState("");
  const [pickYear, setPickYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [totals, setTotals] = useState<{
    label: string;
    students: number;
    activeStudents: number;
    tests: number;
    submittedAttempts: number;
    passedAttempts: number;
    averagePercent: number | null;
  } | null>(null);
  const [allRows, setAllRows] = useState<
    {
      program: string;
      name: string;
      students: number;
      activeStudents: number;
      tests: number;
      submittedAttempts: number;
      passedAttempts: number;
      averagePercent: number | null;
    }[] | null
  >(null);
  const shownYears = years ?? catalog.batchYears;
  const shownDepartments = departments ?? catalog.departments;

  async function addYear(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMessage(null);
    try {
      const res = await api<{ batchYears: number[] }>("/api/admin/academic/batches", {
        method: "POST",
        body: JSON.stringify({ year: Number(newYear) }),
      });
      setYears(res.batchYears);
      rememberCatalog({ batchYears: res.batchYears, departments: shownDepartments });
      setNewYear("");
      setMessage(`Batch ${Number(newYear)} added.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not add that batch.");
    } finally {
      setBusy(false);
    }
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMessage(null);
    try {
      const res = await api<{ departments: CatalogDepartment[] }>("/api/admin/academic/departments", {
        method: "POST",
        body: JSON.stringify({ name: deptName.trim(), durationYears }),
      });
      setDepartments(res.departments);
      rememberCatalog({ batchYears: shownYears, departments: res.departments });
      setDeptName("");
      setMessage(`${deptName.trim()} added.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not add that department.");
    } finally {
      setBusy(false);
    }
  }

  async function calculate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setTotals(null);
    setAllRows(null);
    try {
      const programs = pickProgram === "ALL" ? shownDepartments : shownDepartments.filter((d) => d.program === pickProgram);
      const rows = await Promise.all(
        programs.map(async (dept) => {
          const res = await api<{
            students: number;
            activeStudents: number;
            tests: number;
            submittedAttempts: number;
            averagePercent: number | null;
            passedAttempts: number;
          }>(`/api/admin/academic/summary?program=${dept.program}&year=${pickYear}`);
          return { program: dept.program, name: dept.name, ...res };
        })
      );
      if (pickProgram === "ALL") {
        setAllRows(rows);
      } else {
        const row = rows[0];
        if (!row) return;
        setTotals({
          label: `${row.name} · ${pickYear} batch`,
          students: row.students,
          activeStudents: row.activeStudents,
          tests: row.tests,
          submittedAttempts: row.submittedAttempts,
          passedAttempts: row.passedAttempts,
          averagePercent: row.averagePercent,
        });
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not calculate that group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-5 p-5">
      <div>
        <h2 className="section-title">Departments and batches</h2>
        <p className="section-sub">
          Choose all departments, or one department, and a joining year. Add a year or a department when the college needs one.
        </p>
      </div>

      <form
        onSubmit={(e) => void calculate(e)}
        className="rounded-2xl border border-sky-200/80 bg-sky-50/40 p-4"
      >
        <h3 className="text-sm font-semibold text-slate-900">Look up a group</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="form-label">Department</span>
            <select
              required
              value={pickProgram}
              onChange={(e) => {
                setPickProgram(e.target.value);
                setTotals(null);
                setAllRows(null);
              }}
              className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select department…</option>
              <option value="ALL">All departments</option>
              {shownDepartments.map((dept) => (
                <option key={dept.program} value={dept.program}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-36 text-sm">
            <span className="form-label">Batch</span>
            <select
              required
              value={pickYear}
              onChange={(e) => {
                setPickYear(e.target.value);
                setTotals(null);
                setAllRows(null);
              }}
              className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select batch…</option>
              {shownYears.map((year) => (
                <option key={year} value={year}>
                  {year} batch
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Calculating…" : "Show totals"}
          </button>
        </div>
        {totals ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800">{totals.label}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Students", String(totals.students)],
                ["Active", String(totals.activeStudents)],
                ["Tests", String(totals.tests)],
                ["Submitted", String(totals.submittedAttempts)],
                ["Passed", String(totals.passedAttempts)],
                ["Average", totals.averagePercent != null ? `${totals.averagePercent}%` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white px-3 py-2 ring-1 ring-sky-100">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : allRows ? (
          <div className="mt-4 overflow-x-auto">
            <p className="text-sm font-semibold text-slate-800">All departments · {pickYear} batch</p>
            <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3 font-semibold">Department</th>
                  <th className="py-1 pr-3 font-semibold">Students</th>
                  <th className="py-1 pr-3 font-semibold">Active</th>
                  <th className="py-1 pr-3 font-semibold">Tests</th>
                  <th className="py-1 pr-3 font-semibold">Submitted</th>
                  <th className="py-1 pr-3 font-semibold">Passed</th>
                  <th className="py-1 font-semibold">Average</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => (
                  <tr key={row.program} className="border-t border-sky-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.name}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.students}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.activeStudents}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.tests}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.submittedAttempts}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.passedAttempts}</td>
                    <td className="py-2 tabular-nums">
                      {row.averagePercent != null ? `${row.averagePercent}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            All departments uses the same batch. One department shows only that group.
          </p>
        )}
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Batches</h3>
          <p className="mt-1 text-xs text-slate-500">The same joining years are used by every department.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shownYears.map((year) => (
              <span
                key={year}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800"
              >
                {year}
              </span>
            ))}
          </div>
          <form onSubmit={(e) => void addYear(e)} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="form-label">New batch year</span>
              <input
                required
                inputMode="numeric"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="2028"
                className="mt-1 w-28 rounded-xl border border-sky-200/90 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" disabled={busy} className="btn-secondary">
              Add batch
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Departments</h3>
          <ul className="mt-3 space-y-1.5">
            {shownDepartments.map((dept) => (
              <li
                key={dept.program}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">{dept.name}</span>
                <span className="text-xs text-slate-500">{dept.durationYears} years</span>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void addDepartment(e)} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[10rem] flex-1 text-sm">
              <span className="form-label">New department</span>
              <input
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Department name"
                className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="form-label">Course length</span>
              <input
                required
                type="number"
                min={1}
                max={12}
                value={durationYears}
                onChange={(e) => setDurationYears(Number(e.target.value) || 2)}
                className="mt-1 w-20 rounded-xl border border-sky-200/90 bg-white px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" disabled={busy} className="btn-secondary">
              Add department
            </button>
          </form>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </section>
  );
}

export function AdminSettingsPage() {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [tagline, setTagline] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<{ settings: CollegeSettings }>("/api/college-settings")
      .then((res) => {
        if (cancelled) return;
        setName(res.settings.name);
        setShortName(res.settings.shortName);
        setTagline(res.settings.tagline);
        setEmailDomain(res.settings.emailDomain);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load settings.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api<{ settings: CollegeSettings }>("/api/college-settings", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim(),
          tagline: tagline.trim(),
          emailDomain: emailDomain.trim().replace(/^@/, ""),
        }),
      });
      setName(res.settings.name);
      setShortName(res.settings.shortName);
      setTagline(res.settings.tagline);
      setEmailDomain(res.settings.emailDomain);
      setSuccess("College settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadExportPack() {
    setExporting(true);
    setExportErr(null);
    try {
      await downloadFileFromUrl(
        "/api/admin/export-pack.zip",
        `campus-export-${new Date().toISOString().slice(0, 10)}.zip`
      );
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardShell
      title="Settings"
      subtitle="Departments, batches, and college setup"
      nav={adminSidebarNav}
    >
      <div className="mb-4">
        <Link to="/dashboard/admin" className="text-sm font-semibold text-brand-800 hover:underline">
          ← Admin home
        </Link>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading settings…</p> : null}

      {!loading ? (
        <div className="space-y-6">
          <AcademicSetup />

          <div className="max-w-xl space-y-4">
            <TwoFactorSettings />
            <SessionDevices />
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="panel max-w-xl space-y-4 p-5">
            <div>
              <h2 className="section-title">College branding</h2>
              <p className="section-sub">
                Shown on the portal. Email domain is used when suggesting account emails.
              </p>
            </div>

            <div>
              <label className="form-label" htmlFor="college-name">
                College / portal name
              </label>
              <input
                id="college-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="college-short">
                Short name
              </label>
              <input
                id="college-short"
                required
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="college-tagline">
                Tagline
              </label>
              <input
                id="college-tagline"
                required
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="mt-1 w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="college-domain">
                Email domain
              </label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-slate-500">@</span>
                <input
                  id="college-domain"
                  required
                  value={emailDomain}
                  onChange={(e) => setEmailDomain(e.target.value.replace(/^@/, ""))}
                  placeholder="gppharmacy.edu"
                  className="w-full rounded-xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>

          <section className="panel max-w-xl space-y-3 p-5">
            <div>
              <h2 className="section-title">More tools</h2>
              <p className="section-sub">
                Less common admin actions — kept here so the main menu stays simple.
              </p>
            </div>
            <ul className="space-y-2">
              {ADVANCED_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className="block rounded-xl border border-sky-200/80 bg-white px-3 py-3 transition hover:border-brand-300 hover:bg-sky-50/50"
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">{item.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3">
              <p className="text-sm font-semibold text-slate-900">Export pack (ZIP)</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Backup published tests and attempts — for technical admins.
              </p>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void downloadExportPack()}
                className="btn-secondary mt-3 !min-h-9"
              >
                {exporting ? "Building ZIP…" : "Download export pack"}
              </button>
              {exportErr ? <p className="mt-2 text-sm text-red-600">{exportErr}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
