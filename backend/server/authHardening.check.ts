/**
 * Recovery codes + TOTP encryption + password-reset token hashing.
 *   npx tsx server/authHardening.check.ts
 */
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  hashesFromCodes,
  looksLikeRecoveryCode,
  serializeHashes,
} from "./recoveryCodes";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "./secretCrypto";
import {
  hashPasswordResetToken,
  newPasswordResetToken,
} from "./passwordReset";
import { verifySecondFactor, buildTotpEnableData } from "./twoFactor";
import { generateTotpCode } from "./totp";

async function main() {
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const codes = generateRecoveryCodes(8);
  check("recovery.count", codes.length === 8);
  check("recovery.format", codes.every((c) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)));
  const hashes = hashesFromCodes(codes);
  const stored = serializeHashes(hashes);
  const left = consumeRecoveryCode(stored, codes[0]!);
  check("recovery.consume", !!left && left.length === 7);
  check("recovery.consume_again", consumeRecoveryCode(serializeHashes(left!), codes[0]!) == null);
  check("recovery.looks_like", looksLikeRecoveryCode(codes[1]!));
  check("recovery.not_totp_digits", !looksLikeRecoveryCode("123456"));

  const plain = "JBSWY3DPEHPK3PXP";
  const enc = encryptSecret(plain);
  check("crypto.prefixed", isEncryptedSecret(enc));
  check("crypto.roundtrip", decryptSecret(enc) === plain);
  check("crypto.legacy_plain", decryptSecret(plain) === plain);

  const enable = buildTotpEnableData(plain);
  check("enable.encrypted", isEncryptedSecret(enable.totpSecret));
  check("enable.codes", enable.recoveryCodes.length === 8);
  const totp = generateTotpCode(plain);
  const okTotp = verifySecondFactor(
    { totpSecret: enable.totpSecret, totpRecoveryHashes: enable.totpRecoveryHashes },
    totp
  );
  check("verify.totp_against_encrypted", okTotp.ok && !okTotp.usedRecovery);
  const okRec = verifySecondFactor(
    { totpSecret: enable.totpSecret, totpRecoveryHashes: enable.totpRecoveryHashes },
    enable.recoveryCodes[0]!
  );
  check("verify.recovery", okRec.ok && okRec.usedRecovery === true);

  const raw = newPasswordResetToken();
  const h1 = hashPasswordResetToken(raw);
  const h2 = hashPasswordResetToken(raw);
  check("reset.hash_stable", h1 === h2 && h1.length === 64);
  check("reset.hash_differs", hashPasswordResetToken(newPasswordResetToken()) !== h1);

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll auth hardening checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
