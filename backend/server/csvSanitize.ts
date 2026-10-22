/**
 * CSV cell escaping + Excel/Sheets formula-injection defense.
 * Prefix values that Excel may treat as formulas when opening CSV.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvFormula(value: string): string {
  if (!value) return value;
  // Neutralize formula / command injection when opened in Excel / Sheets.
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(v: string | number | null | undefined): string {
  const raw = v == null ? "" : String(v);
  const s = sanitizeCsvFormula(raw);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
