/**
 * One-time 2FA recovery codes. Plaintext shown once; only SHA-256 hashes stored.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

const CODE_COUNT = 8;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code);
  return createHash("sha256").update(`recovery:${normalized}`).digest("hex");
}

export function normalizeRecoveryCode(code: string): string {
  return String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function generateRecoveryCodes(count = CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(8);
    let s = "";
    for (const b of raw) s += ALPHABET[b! % ALPHABET.length]!;
    // Format XXXX-XXXX
    codes.push(`${s.slice(0, 4)}-${s.slice(4, 8)}`);
  }
  return codes;
}

export function hashesFromCodes(codes: string[]): string[] {
  return codes.map(hashRecoveryCode);
}

export function parseStoredHashes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((h): h is string => typeof h === "string" && /^[a-f0-9]{64}$/i.test(h));
  } catch {
    return [];
  }
}

export function serializeHashes(hashes: string[]): string {
  return JSON.stringify(hashes);
}

/**
 * If `code` matches a stored hash, return remaining hashes (without the used one).
 * Otherwise null.
 */
export function consumeRecoveryCode(
  storedRaw: string | null | undefined,
  code: string
): string[] | null {
  const hashes = parseStoredHashes(storedRaw);
  if (hashes.length === 0) return null;
  const target = Buffer.from(hashRecoveryCode(code), "hex");
  let matched = -1;
  for (let i = 0; i < hashes.length; i++) {
    const candidate = Buffer.from(hashes[i]!, "hex");
    if (
      candidate.length === target.length &&
      timingSafeEqual(candidate, target)
    ) {
      matched = i;
      break;
    }
  }
  if (matched < 0) return null;
  return hashes.filter((_, i) => i !== matched);
}

export function looksLikeRecoveryCode(code: string): boolean {
  const n = normalizeRecoveryCode(code);
  return n.length >= 8 && n.length <= 16 && !/^\d{6}$/.test(n);
}
