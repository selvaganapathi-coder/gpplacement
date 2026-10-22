/** Client-side rules aligned with backend/server/password.ts (campus defaults allowed here). */
const DEMO_BLOCKED = "changeme123";

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export function validatePasswordClient(password: string): string | null {
  if (password === DEMO_BLOCKED)
    return "Choose a new password — the default demo password is not allowed.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[a-z]/.test(password)) return "Include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Include a number.";
  return null;
}

export function passwordStrength(password: string): {
  score: StrengthLevel;
  label: string;
  ok: boolean;
} {
  if (!password) return { score: 0, label: "Enter a password", ok: false };
  const issues = validatePasswordClient(password);
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score++;
  const clamped = Math.min(4, Math.max(0, score)) as StrengthLevel;
  if (issues) {
    return {
      score: Math.min(clamped, 2) as StrengthLevel,
      label: issues,
      ok: false,
    };
  }
  const labels: Record<StrengthLevel, string> = {
    0: "Too weak",
    1: "Weak",
    2: "Fair",
    3: "Good",
    4: "Strong",
  };
  return { score: clamped, label: labels[clamped], ok: true };
}

export const CAMPUS_DEFAULT_PASSWORD = "TempPass1";
