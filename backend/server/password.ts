import bcrypt from "bcryptjs";

/** Well-known demo seed password — never allowed as a lasting production credential. */
export const DEFAULT_SEED_PASSWORD = "changeme123";

/**
 * bcrypt cost (2^rounds). 12 is a solid default for bcryptjs in Node.
 * Override with BCRYPT_COST (10–15).
 */
export const BCRYPT_COST = Math.min(
  15,
  Math.max(10, Number(process.env.BCRYPT_COST) || 12)
);

/** bcrypt / bcryptjs hashes look like $2a$12$… or $2b$… */
export function isBcryptHash(hash: string | null | undefined): boolean {
  return typeof hash === "string" && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{22,}$/.test(hash);
}

export function isDefaultSeedPassword(password: string): boolean {
  return password === DEFAULT_SEED_PASSWORD;
}

/**
 * Production must not treat the demo seed password as a normal login.
 * Trial hosts may set ALLOW_DEMO_SEED_PASSWORD=true (forces password change instead).
 */
export function allowDemoSeedPasswordLogin(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_DEMO_SEED_PASSWORD === "true";
}

/** Demo user seeding is blocked in production unless explicitly opted in. */
export function allowDemoSeed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_DEMO_SEED === "true";
}

/**
 * Forced password change after seed.
 * Production always forces change (SEED_FORCE_PASSWORD_CHANGE=true implied).
 * Dev/demo: default true unless SEED_FORCE_PASSWORD_CHANGE=false.
 */
export function seedForcePasswordChange(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.SEED_FORCE_PASSWORD_CHANGE !== "false";
}

export function assertDemoSeedAllowed(scriptName: string): void {
  if (allowDemoSeed()) return;
  throw new Error(
    `[${scriptName}] Refusing to seed demo accounts in production. ` +
      `Do not load changeme123 users into a live database. ` +
      `For a trial/staging host only, set ALLOW_DEMO_SEED=true and SEED_FORCE_PASSWORD_CHANGE=true.`
  );
}

export function validatePasswordStrength(password: string): string | null {
  if (isDefaultSeedPassword(password))
    return "Choose a new password — the default demo password is not allowed.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  return null;
}

/** Hash with bcrypt (bcryptjs). Never store MD5, SHA-256(password), or plain text. */
export async function hashPassword(plain: string): Promise<string> {
  const hash = await bcrypt.hash(plain, BCRYPT_COST);
  if (!isBcryptHash(hash)) {
    throw new Error("Password hashing failed — expected a bcrypt hash.");
  }
  return hash;
}

/**
 * Constant-time compare against a bcrypt hash.
 * Non-bcrypt stored values (plain / MD5 / SHA) always fail.
 */
export async function verifyPassword(
  plain: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (!plain || !isBcryptHash(storedHash)) return false;
  return bcrypt.compare(plain, storedHash!);
}
