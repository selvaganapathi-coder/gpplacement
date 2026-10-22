import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatAcademic } from "@/lib/academic";
import { CAMPUS_DEFAULT_PASSWORD } from "@/lib/passwordStrength";
import {
  downloadImportErrorsCsv,
  downloadStudentTemplate,
  parseStudentsFile,
  type ImportInvalidRow,
  type StudentImportRow,
} from "@/lib/parseStudentsSpreadsheet";

type ImportResponse = {
  ok: boolean;
  created: number;
  updated?: number;
  skipped: number;
  errors: string[];
};

export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export function BulkStudentImport({
  onImported,
  existingEmails,
}: {
  onImported?: (summary: ImportSummary) => void;
  /** Lowercase emails already in the directory — marks Update vs New. */
  existingEmails?: Set<string> | string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<StudentImportRow[]>([]);
  const [invalid, setInvalid] = useState<ImportInvalidRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [defaultPassword, setDefaultPassword] = useState(CAMPUS_DEFAULT_PASSWORD);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [previewTab, setPreviewTab] = useState<"valid" | "invalid">("valid");

  const existing = useMemo(() => {
    if (!existingEmails) return new Set<string>();
    if (existingEmails instanceof Set) return existingEmails;
    return new Set(existingEmails.map((e) => e.toLowerCase()));
  }, [existingEmails]);

  const previewStats = useMemo(() => {
    let willUpdate = 0;
    let willCreate = 0;
    let students = 0;
    let staff = 0;
    for (const s of preview) {
      if (s.role === "STAFF") staff++;
      else students++;
      if (existing.has(s.email.toLowerCase())) willUpdate++;
      else willCreate++;
    }
    return { willUpdate, willCreate, students, staff };
  }, [preview, existing]);

  async function handleFile(file: File) {
    setPending(true);
    setError(null);
    setMessage(null);
    setServerErrors([]);
    setWarnings([]);
    setPreview([]);
    setInvalid([]);
    setFileName(null);
    try {
      const result = await parseStudentsFile(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.students);
      setInvalid(result.invalid);
      setWarnings(result.warnings);
      setFileName(file.name);
      setPreviewTab(result.students.length === 0 && result.invalid.length > 0 ? "invalid" : "valid");
      const updateN = result.students.filter((s) =>
        existing.has(s.email.toLowerCase())
      ).length;
      const createN = result.students.length - updateN;
      const parts = [
        `${result.students.length} valid`,
        `${createN} new`,
        `${updateN} update`,
      ];
      if (result.invalid.length)
        parts.push(`${result.invalid.length} invalid`);
      setMessage(parts.join(" · ") + ".");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Could not read that file. Check the format and try again.");
    } finally {
      setPending(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleFile(file);
  }

  async function confirmImport() {
    if (preview.length === 0) return;
    const pwd = defaultPassword.trim();
    if (pwd.length < 8) {
      setError("Default password must be at least 8 characters.");
      return;
    }
    setImporting(true);
    setError(null);
    setMessage(null);
    setServerErrors([]);
    try {
      const res = await api<ImportResponse>("/api/admin/students/import", {
        method: "POST",
        body: JSON.stringify({
          students: preview,
          defaultPassword: pwd,
          mustChangePassword,
        }),
      });
      const created = res.created ?? 0;
      const updated = res.updated ?? 0;
      const skipped = res.skipped ?? 0;
      const parts: string[] = [];
      if (created) parts.push(`${created} added`);
      if (updated) parts.push(`${updated} updated`);
      if (skipped) parts.push(`${skipped} skipped`);
      if (res.errors.length)
        parts.push(`${res.errors.length} error${res.errors.length === 1 ? "" : "s"}`);
      setMessage(parts.length ? parts.join(" · ") + "." : "Import finished.");
      setServerErrors(res.errors);
      setPreview([]);
      setFileName(null);
      setWarnings([]);
      onImported?.({
        created,
        updated,
        skipped,
        errors: res.errors,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function clearPreview() {
    setPreview([]);
    setInvalid([]);
    setFileName(null);
    setWarnings([]);
    setMessage(null);
    setServerErrors([]);
    setError(null);
  }

  const errorCount = invalid.length + serverErrors.length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-sky-300/90 bg-sky-50/40 p-4">
        <h2 className="text-base font-semibold text-slate-900">Import people</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload Excel / CSV / JSON. Preview valid and invalid rows first. Duplicate emails in
          the file are removed; emails already in the portal are <strong>updated</strong>.
        </p>
        <p className="mt-2 rounded-md bg-white/80 px-2 py-1.5 font-mono text-xs text-slate-700">
          Email | Name | Course | Year | Roll No | Role
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Course = BPHARM / DPHARM / MPHARM / PHARMD · Year = 1–4 · Role = Student or Staff.
          Leave Email blank for students — it is built from Course + Year + Roll.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Default password (new accounts)</span>
            <input
              type="text"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900"
              autoComplete="off"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
              className="rounded border-sky-300"
            />
            Require password change on first login
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadStudentTemplate()}
            className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-sky-50"
          >
            Download template
          </button>
          <label className="cursor-pointer rounded-md bg-gradient-to-r from-brand-600 to-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-warm hover:from-brand-700 hover:to-sky-700">
            {pending ? "Reading…" : "Upload file"}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json"
              className="sr-only"
              disabled={pending || importing}
              onChange={onFileChange}
            />
          </label>
          {preview.length > 0 ? (
            <>
              <button
                type="button"
                disabled={importing}
                onClick={() => void confirmImport()}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {importing
                  ? "Importing…"
                  : `Import ${preview.length} (${previewStats.willCreate} new · ${previewStats.willUpdate} update)`}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={clearPreview}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Clear
              </button>
            </>
          ) : null}
          {errorCount > 0 ? (
            <button
              type="button"
              onClick={() => downloadImportErrorsCsv(invalid, serverErrors)}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Download errors CSV ({errorCount})
            </button>
          ) : null}
        </div>

        {message ? (
          <p className="mt-3 text-sm text-brand-800" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="mt-2 max-h-28 list-inside list-disc overflow-y-auto text-xs text-amber-900">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {serverErrors.length > 0 ? (
          <div className="mt-2">
            <p className="text-xs font-semibold text-red-800">
              Server errors ({serverErrors.length})
            </p>
            <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs text-red-700">
              {serverErrors.slice(0, 40).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {preview.length > 0 || invalid.length > 0 ? (
        <div className="panel">
          <div className="panel-header flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Preview{fileName ? ` — ${fileName}` : ""}
              </h3>
              <p className="text-xs text-slate-500">
                {previewStats.students} student
                {previewStats.students === 1 ? "" : "s"} · {previewStats.staff} staff ·{" "}
                {invalid.length} invalid
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPreviewTab("valid")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  previewTab === "valid"
                    ? "bg-emerald-100 text-emerald-950"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Valid ({preview.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("invalid")}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  previewTab === "invalid"
                    ? "bg-red-100 text-red-950"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Invalid ({invalid.length})
              </button>
            </div>
          </div>
          <div className="data-table-wrap max-h-72">
            {previewTab === "valid" ? (
              preview.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No valid rows to import.</p>
              ) : (
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Class / dept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((s) => {
                      const isUpdate = existing.has(s.email.toLowerCase());
                      return (
                        <tr key={`${s.role}:${s.email}`}>
                          <td>
                            <span
                              className={
                                isUpdate
                                  ? "badge-warn"
                                  : "badge-ok"
                              }
                            >
                              {isUpdate ? "Update" : "New"}
                            </span>
                          </td>
                          <td className="text-xs font-medium text-slate-700">
                            {s.role === "STAFF" ? "Staff" : "Student"}
                          </td>
                          <td className="font-medium text-slate-900">{s.name}</td>
                          <td className="truncate text-slate-600">{s.email}</td>
                          <td className="text-xs text-brand-800">
                            {s.role === "STAFF"
                              ? s.program ?? "—"
                              : formatAcademic(s.program, s.levelType, s.level, s.section)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : invalid.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No invalid rows.</p>
            ) : (
              <table className="data-table data-table--compact data-table--danger">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name / email</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {invalid.map((r) => (
                    <tr key={`${r.rowNum}-${r.email}-${r.error}`}>
                      <td className="font-mono text-xs text-slate-600">{r.rowNum}</td>
                      <td>
                        <span className="block font-medium text-slate-900">
                          {r.name || "—"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {r.email || "—"}
                        </span>
                      </td>
                      <td className="text-xs text-red-800">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
