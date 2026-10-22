/**
 * AES-256-GCM for TOTP secrets at rest.
 * Format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * Legacy plaintext base32 secrets are still accepted on read (then re-encrypted on write).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { IS_PRODUCTION, JWT_SECRET } from "./config";

const PREFIX = "enc:v1:";

function resolveKey(): Buffer {
  const fromEnv = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (fromEnv) {
    // Accept 64-char hex or any string (hashed to 32 bytes).
    if (/^[0-9a-fA-F]{64}$/.test(fromEnv)) {
      return Buffer.from(fromEnv, "hex");
    }
    return createHash("sha256").update(fromEnv).digest();
  }
  if (IS_PRODUCTION) {
    // Derive a dedicated key from JWT_SECRET so prod works without a second env,
    // but prefer setting TOTP_ENCRYPTION_KEY so JWT rotation does not break decrypt.
    return createHash("sha256")
      .update(`placement-totp-v1:${JWT_SECRET}`)
      .digest();
  }
  return createHash("sha256")
    .update(`placement-totp-dev:${JWT_SECRET}`)
    .digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) throw new Error("Empty secret");
  if (!isEncryptedSecret(stored)) {
    // Legacy plaintext base32 — return as-is for verify; callers should re-encrypt.
    return stored;
  }
  const body = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Corrupt encrypted secret");
  const key = resolveKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt if not already encrypted. */
export function ensureEncryptedSecret(storedOrPlain: string): string {
  if (isEncryptedSecret(storedOrPlain)) return storedOrPlain;
  return encryptSecret(storedOrPlain);
}
