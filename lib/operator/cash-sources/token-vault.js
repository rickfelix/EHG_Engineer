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
  } catch {
    return null; // not enrolled — inert by design
  }
}
