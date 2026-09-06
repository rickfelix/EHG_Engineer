/**
 * Google chairman OAuth — the ONE chairman-user grant Michael runs on (spec docs/michael/02-SPEC.md §4).
 * SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C. Generalizes lib/integrations/youtube/oauth-manager.js.
 *
 * Venue and key (ratifications ff4ef5b4 / 0daf3bd8): the refresh token is decrypted only on the
 * chairman's host. The master key is MICHAEL_ENCRYPTION_KEY in the host .env and nowhere else — this
 * module REFUSES when it is absent and never generates one (VALIDATION b4ed3c2c measured that the
 * encryption.cjs singleton mints a throwaway key on a missing .leo-keys and the blob is then
 * unrecoverable). GitHub Actions is refused before any decrypt. Storage is ciphertext only in
 * michael_credentials (child B migration, chairman-applied); the gauge predicates last_error and
 * expires_at are written here so child G's michael-oauth-health can read them.
 *
 * Nothing runs at import time: every default is a call-time parameter.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import encryptionSingleton from '../../security/encryption.cjs';
import { createMichaelClient, readRows, writeRows, TABLES_ABSENT } from '../../michael/db.mjs';

const { CredentialEncryption } = encryptionSingleton;

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
]; // youtube is v1.1 (spec §4)
export const REDIRECT_PORT = 3456;
export const REDIRECT_HOST = '127.0.0.1';
export const REDIRECT_PATH = '/oauth2callback';
export const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;
export const CREDENTIAL_IDENTIFIER = 'google_chairman_oauth';
export const STATUS_COLUMNS = 'identifier,scopes,expires_at,last_refreshed_at,last_error,key_fingerprint';
// Operational label in the ciphertext metadata, NOT a domain separator (oauth-manager.js:34-40).
const TOKEN_VAULT_APP_ID = 'michael-google-chairman-oauth';
const EXPIRING_MS = 48 * 60 * 60 * 1000;
const HEX64 = /^[0-9a-f]{64}$/i;
export const KEY_PROVISIONING = 'MICHAEL_ENCRYPTION_KEY is not set. On the chairman host generate 32 random bytes as hex '
  + "(node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"), add MICHAEL_ENCRYPTION_KEY=<hex> "
  + 'to the host .env, back it up with the .env, never commit it and never add it to GHA secrets.';

export function codedError(code, message) { const e = new Error(message); e.code = code; return e; }

/** Host-venue guard (ff4ef5b4): injectable env so the unit tier, which runs under GITHUB_ACTIONS, never needs a bypass. */
export function assertHostVenue(env = process.env) {
  if (env.GITHUB_ACTIONS === 'true' || env.CI === 'true' || env.CI === '1') {
    throw codedError('HOST_VENUE_REQUIRED', 'The chairman Google grant is host-only; GitHub Actions holds no credential and no key (ratification 0daf3bd8).');
  }
}

/** First 16 hex of sha256 over the RAW key bytes; leaks nothing, makes a wrong host key diagnosable. */
export function keyFingerprint(keyBuffer) {
  return crypto.createHash('sha256').update(keyBuffer).digest('hex').slice(0, 16);
}

export function readHostKey(env = process.env) {
  const raw = String(env.MICHAEL_ENCRYPTION_KEY || '').trim();
  if (!raw) throw codedError('MICHAEL_ENCRYPTION_KEY_MISSING', KEY_PROVISIONING);
  if (!HEX64.test(raw)) throw codedError('MICHAEL_ENCRYPTION_KEY_INVALID', 'MICHAEL_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
  return Buffer.from(raw, 'hex');
}

/** AES-256-GCM via encryption.cjs, key bound to the host .env only. Never falls back to the self-generating parent. */
export class HostKeyEncryption extends CredentialEncryption {
  constructor(env = process.env) { super(); this._env = env; this._key = null; }
  async getMasterKey() { if (!this._key) this._key = readHostKey(this._env); return this._key; }
  async fingerprint() { return keyFingerprint(await this.getMasterKey()); }
}

export function createOAuth2Client(env = process.env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw codedError('GOOGLE_CLIENT_MISSING', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in the host .env (never in GHA secrets).');
  }
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

/** The single 48h / invalid_grant predicate (spec §9 michael-oauth-health); child G imports it. */
export function oauthHealth(row, now = Date.now()) {
  if (!row) return 'absent';
  if (row.last_error === 'invalid_grant') return 'invalid_grant';
  const t = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (Number.isFinite(t) && t < now + EXPIRING_MS) return 'expiring';
  return 'ok';
}

export function hoursToExpiry(row, now = Date.now()) {
  const t = row && row.expires_at ? Date.parse(row.expires_at) : NaN;
  return Number.isFinite(t) ? Math.round(((t - now) / 3600000) * 10) / 10 : null;
}

/** Reads the one credential row through db.mjs; a missing relation is a coded TABLES_ABSENT throw, never a crash. */
export async function readCredentialRow(sb, select = STATUS_COLUMNS) {
  const r = await readRows(sb, 'michael_credentials', (q) => q.eq('identifier', CREDENTIAL_IDENTIFIER), { select });
  if (r.tables_absent) throw codedError(TABLES_ABSENT, 'michael_credentials is not applied yet (child B migration is chairman-gated); nothing can be recorded.');
  if (r.error) throw codedError('READ_FAILED', r.error);
  return r.rows[0] || null;
}

/** Decrypt the stored token object. null = no grant yet or unreadable blob (re-consent); coded throws for key/venue/fingerprint. */
export async function getStoredTokens({ sb, enc, env = process.env, warn = console.warn } = {}) {
  assertHostVenue(env);
  enc = enc || new HostKeyEncryption(env);
  const fp = await enc.fingerprint();
  const row = await readCredentialRow(sb || createMichaelClient(), 'encrypted_blob,encryption_metadata,key_fingerprint');
  if (!row || !row.encrypted_blob) return null;
  if (!row.key_fingerprint) throw codedError('KEY_FINGERPRINT_ABSENT', 'Stored credential carries no key_fingerprint; refusing to decrypt an unattributed blob. Re-consent on the host.');
  if (row.key_fingerprint !== fp) throw codedError('KEY_FINGERPRINT_MISMATCH', `Stored blob was encrypted under key ${row.key_fingerprint}, host key is ${fp}. Restore the original MICHAEL_ENCRYPTION_KEY or re-consent.`);
  try {
    return await enc.decrypt(row.encrypted_blob, row.encryption_metadata || {});
  } catch (err) {
    warn(`[chairman-oauth] stored token vault present but UNREADABLE (corruption?) -- re-consent required: ${err.message}`);
    return null;
  }
}

/** Ciphertext-only upsert; no property of the token object ever becomes a column. Throws on a failed persist (F8 rationale). */
export async function storeTokens(tokens, { sb, enc, env = process.env, now = new Date() } = {}) {
  assertHostVenue(env);
  enc = enc || new HostKeyEncryption(env);
  const key_fingerprint = await enc.fingerprint();
  const { encrypted, metadata } = await enc.encrypt(tokens, TOKEN_VAULT_APP_ID);
  const row = {
    identifier: CREDENTIAL_IDENTIFIER, encrypted_blob: encrypted, encryption_metadata: metadata, key_fingerprint, scopes: SCOPES,
    expires_at: tokens && tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    last_refreshed_at: now.toISOString(), last_error: null,
  };
  const w = await writeRows(sb || createMichaelClient(), 'michael_credentials', (t) => t.upsert(row, { onConflict: 'identifier' }).select('identifier'));
  if (!w.ok) throw codedError(w.refusal || 'WRITE_FAILED', `storeTokens: failed to persist encrypted tokens: ${w.error}`);
  return { identifier: CREDENTIAL_IDENTIFIER, key_fingerprint, expires_at: row.expires_at };
}

export async function recordLastError(sb, last_error) {
  return writeRows(sb, 'michael_credentials', (t) => t.update({ last_error }).eq('identifier', CREDENTIAL_IDENTIFIER));
}

/** Authenticated client; refreshes an expired access token; invalid_grant is recorded as last_error (the gauge source) and rethrown. */
export async function getAuthenticatedClient({ sb, enc, env = process.env, client, now = Date.now() } = {}) {
  sb = sb || createMichaelClient();
  const oauth2Client = client || createOAuth2Client(env);
  const tokens = await getStoredTokens({ sb, enc, env });
  if (!tokens) throw codedError('NO_STORED_TOKENS', 'No stored Google grant. Run node scripts/michael/google-consent.mjs on the chairman host.');
  oauth2Client.setCredentials(tokens);
  if (tokens.expiry_date && now >= tokens.expiry_date) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await storeTokens(credentials, { sb, enc, env });
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      const text = String((err && err.message) || '') + String((err && err.response && err.response.data && err.response.data.error) || '');
      if (/invalid_grant/i.test(text)) await recordLastError(sb, 'invalid_grant');
      throw err;
    }
  }
  return oauth2Client;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`;
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function defaultOpenBrowser(url) {
  return import('node:child_process').then(({ exec }) => {
    if (process.platform === 'win32') exec(`start "" "${url}"`);
    else exec(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${url}"`);
  });
}

/**
 * The consent flow (the whole re-consent runbook under the seven-day posture, D4 8e6ac764).
 * Pre-flight order: venue, key, client id/secret, table present — all BEFORE the browser opens, so a
 * grant can never be completed into an unrecordable store. State nonce + PKCE S256, loopback-only
 * listener started before the browser is launched (SECURITY S-2, DESIGN D-1).
 */
export async function runConsentFlow({ sb, enc, env = process.env, client, openBrowser = defaultOpenBrowser, createServer = http.createServer, timeoutMs = 300000, log = console.log } = {}) {
  assertHostVenue(env);
  enc = enc || new HostKeyEncryption(env);
  await enc.fingerprint();
  const oauth2Client = client || createOAuth2Client(env);
  sb = sb || createMichaelClient();
  await readCredentialRow(sb, 'identifier');
  const state = crypto.randomBytes(16).toString('hex');
  const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync();
  const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent', state, code_challenge: codeChallenge, code_challenge_method: 'S256' });
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://${REDIRECT_HOST}:${REDIRECT_PORT}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (url.pathname !== REDIRECT_PATH || !safeEqual(url.searchParams.get('state') || '', state) || (!authCode && !error)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page('Ignored', 'This request did not match the consent in progress.'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (error) {
        res.end(page('Authorization failed', `Google reported: ${error}. You can close this window.`));
        server.close(); reject(codedError('OAUTH_DENIED', `Google reported: ${error}`)); return;
      }
      res.end(page('Authorization successful', 'You can close this window and return to the terminal.'));
      server.close(); resolve(authCode);
    });
    server.on('error', (e) => reject(e && e.code === 'EADDRINUSE' ? codedError('REDIRECT_PORT_IN_USE', `Port ${REDIRECT_PORT} is in use (the YouTube consent flow shares it); close it and retry.`) : e));
    server.listen(REDIRECT_PORT, REDIRECT_HOST, () => {
      log(`  Waiting for the Google callback on ${REDIRECT_HOST}:${REDIRECT_PORT}. If the browser did not open, visit:\n  ${authUrl}`);
      Promise.resolve(openBrowser(authUrl)).catch(() => {});
    });
    const timer = setTimeout(() => { server.close(); reject(codedError('OAUTH_TIMEOUT', `No callback within ${Math.round(timeoutMs / 60000)} minutes.`)); }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
  const { tokens } = await oauth2Client.getToken({ code, codeVerifier });
  return storeTokens(tokens, { sb, enc, env });
}

export default { assertHostVenue, keyFingerprint, readHostKey, HostKeyEncryption, createOAuth2Client, oauthHealth, hoursToExpiry, readCredentialRow, getStoredTokens, storeTokens, recordLastError, getAuthenticatedClient, runConsentFlow };
