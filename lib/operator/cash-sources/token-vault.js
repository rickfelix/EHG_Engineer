/**
 * lib/operator/cash-sources/token-vault.js
 *
 * SD-EHG-OPERATOR-CASH-BANK-FEED-001 — FR-1: server-side vault for the long-lived
 * bank-READ token.
 *
 * HARD CONTRACT (security):
 *   - The token is encrypted at rest via the existing AES-256-GCM credential
 *     encryption (lib/security/encryption.cjs). It is NEVER stored in plaintext,
 *     NEVER written to the operator_cash_burn_monthly row, and NEVER returned to
 *     the gauge / browser code path — only the bank-read service (server-side)
 *     ever holds the decrypted value, and only the derived numeric cash slice
 *     flows onward.
 *   - loadBankReadToken() is INERT when the chairman has not enrolled: a missing
 *     vault returns null (no throw), so the whole feature ships and runs with zero
 *     live bank credentials.
 *
 * `enc` is injectable so unit tests run hermetically (no .leo-keys / filesystem).
 */

import credentialEncryption from '../../security/encryption.cjs';

/** App namespace for the operator bank-read credential vault. */
export const BANK_READ_APP_ID = 'operator-bank-read';
const TOKEN_KEY = 'bank_read_token';

/**
 * SEPARATE app namespace for the Teller mTLS client certificate + private key
 * (SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001 FR-1/TR-2). Kept apart from
 * BANK_READ_APP_ID deliberately -- encryptAppCredentials() overwrites its target
 * file wholesale, so storing the token and the cert pair under the SAME app id via
 * two separate calls would silently clobber whichever was written first. A second
 * long-lived secret, so it goes through the SAME encrypted-vault mechanism, never
 * argv/logs/repo.
 */
export const TELLER_MTLS_APP_ID = 'operator-bank-read-mtls';
const CERT_KEY = 'teller_cert_pem';
const KEY_KEY = 'teller_key_pem';

/**
 * Encrypt a bank-read token in memory. Returns the AES-256-GCM blob
 * ({ encrypted, metadata }) — never the plaintext.
 */
export async function encryptBankReadToken(token, { enc = credentialEncryption } = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('bank-read token must be a non-empty string');
  }
  return enc.encrypt({ [TOKEN_KEY]: token }, BANK_READ_APP_ID);
}

/** Decrypt an in-memory vault blob back to the token string (or null if absent). */
export async function decryptBankReadToken(blob, { enc = credentialEncryption } = {}) {
  if (!blob || !blob.encrypted) return null;
  const obj = await enc.decrypt(blob.encrypted, blob.metadata);
  return obj?.[TOKEN_KEY] ?? null;
}

/**
 * Persist the bank-read token to the server-side encrypted credential store
 * (applications/operator-bank-read/.env.encrypted). This is the CHAIRMAN
 * ENROLLMENT action (FR-4) — it provisions the only path by which a live token
 * ever enters the vault.
 */
export async function storeBankReadToken(token, { enc = credentialEncryption } = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('bank-read token must be a non-empty string');
  }
  return enc.encryptAppCredentials(BANK_READ_APP_ID, { [TOKEN_KEY]: token });
}

/**
 * Load the decrypted bank-read token server-side. INERT until enrollment: returns
 * null (never throws) when no vault exists, so the bank-read path connects nothing
 * and the feeder degrades to the Stripe slice alone.
 */
export async function loadBankReadToken({ enc = credentialEncryption } = {}) {
  try {
    const creds = await enc.decryptAppCredentials(BANK_READ_APP_ID);
    return creds?.[TOKEN_KEY] ?? null;
  } catch (err) {
    // Distinguish "no vault yet" (legitimately inert) from a GENUINE decrypt/auth-tag
    // failure (tampered or corrupted vault, rotated key). Both stay fail-soft (return
    // null so the feeder degrades to bank-absent), but a real integrity failure is
    // surfaced loudly — never silently masked as "not enrolled". No token is ever in
    // the message (the failure happens before any plaintext exists).
    const msg = String(err?.message || err);
    const missing = err?.code === 'ENOENT' || /ENOENT|no such file|not found/i.test(msg);
    if (!missing) {
      console.warn(`[bank-read-vault] WARN bank-read vault present but UNREADABLE (tamper/corruption/key-rotation?) — staying inert: ${msg}`);
    }
    return null;
  }
}

/**
 * Persist the Teller mTLS client certificate + private key together, under the
 * SEPARATE TELLER_MTLS_APP_ID namespace (never the token's app id — see the
 * constant's comment). Part of the same chairman ENROLLMENT action as the token.
 */
export async function storeTellerCertPair({ certPem, keyPem }, { enc = credentialEncryption } = {}) {
  if (!certPem || typeof certPem !== 'string') throw new Error('Teller cert (certPem) must be a non-empty string');
  if (!keyPem || typeof keyPem !== 'string') throw new Error('Teller private key (keyPem) must be a non-empty string');
  return enc.encryptAppCredentials(TELLER_MTLS_APP_ID, { [CERT_KEY]: certPem, [KEY_KEY]: keyPem });
}

/**
 * Load the decrypted Teller mTLS cert pair. INERT until enrollment: returns
 * { certPem: null, keyPem: null } (never throws) when no vault exists, mirroring
 * loadBankReadToken()'s fail-soft contract.
 */
export async function loadTellerCertPair({ enc = credentialEncryption } = {}) {
  try {
    const creds = await enc.decryptAppCredentials(TELLER_MTLS_APP_ID);
    return { certPem: creds?.[CERT_KEY] ?? null, keyPem: creds?.[KEY_KEY] ?? null };
  } catch (err) {
    const msg = String(err?.message || err);
    const missing = err?.code === 'ENOENT' || /ENOENT|no such file|not found/i.test(msg);
    if (!missing) {
      console.warn(`[bank-read-vault] WARN Teller mTLS vault present but UNREADABLE (tamper/corruption/key-rotation?) — staying inert: ${msg}`);
    }
    return { certPem: null, keyPem: null };
  }
}
