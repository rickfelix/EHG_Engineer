// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C — the refusal paths and the no-plaintext invariant are pinned
// before the chairman applies -B and consents. Real AES-256-GCM (encryption.cjs) in the storage tests; injected
// Supabase / OAuth2 / http factories everywhere (stricter than vi.mock-ing the module).
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  assertHostVenue, keyFingerprint, readHostKey, HostKeyEncryption, oauthHealth, hoursToExpiry,
  getStoredTokens, storeTokens, getAuthenticatedClient, runConsentFlow, SCOPES, CREDENTIAL_IDENTIFIER, REDIRECT_HOST,
} from './chairman-oauth.js';

const KEY = 'ab'.repeat(32);
const HOST_ENV = { MICHAEL_ENCRYPTION_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' };
const TOKENS = { access_token: 'ya29.fixture-access', refresh_token: '1//fixture-refresh', id_token: 'eyJ.fixture', expiry_date: Date.parse('2026-09-13T12:00:00Z'), scope: SCOPES.join(' '), token_type: 'Bearer' };

/** Recording Supabase stub: reads come from `row`, writes are recorded; `missing` simulates the unapplied migration. */
function fakeSb({ row = null, missing = false, writeError = null } = {}) {
  const writes = [];
  const from = (table) => {
    let kind = null;
    const q = {
      select() { if (!kind) kind = 'read'; return q; },
      eq() { return q; }, limit() { return q; },
      upsert(payload, opts) { kind = 'write'; writes.push({ table, op: 'upsert', payload, opts }); return q; },
      update(payload) { kind = 'write'; writes.push({ table, op: 'update', payload }); return q; },
      then(res, rej) {
        if (missing) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }).then(res, rej);
        if (kind === 'write') return Promise.resolve({ data: writeError ? null : [{ identifier: CREDENTIAL_IDENTIFIER }], error: writeError }).then(res, rej);
        return Promise.resolve({ data: row ? [row] : [], error: null }).then(res, rej);
      },
    };
    return q;
  };
  return { from, writes };
}

beforeEach(() => { delete process.env.MICHAEL_ENCRYPTION_KEY; });

describe('key source (FR-2): MICHAEL_ENCRYPTION_KEY only, refuse-never-generate', () => {
  it('TS-1: missing key refuses and writes nothing (key explicitly deleted, not assumed absent)', async () => {
    delete process.env.MICHAEL_ENCRYPTION_KEY;
    const sb = fakeSb();
    await expect(storeTokens(TOKENS, { sb, env: { GOOGLE_CLIENT_ID: 'x' } })).rejects.toMatchObject({ code: 'MICHAEL_ENCRYPTION_KEY_MISSING' });
    await expect(getStoredTokens({ sb, env: {} })).rejects.toMatchObject({ code: 'MICHAEL_ENCRYPTION_KEY_MISSING' });
    expect(sb.writes).toEqual([]);
    expect(() => readHostKey({ MICHAEL_ENCRYPTION_KEY: '' })).toThrow(expect.objectContaining({ code: 'MICHAEL_ENCRYPTION_KEY_MISSING' }));
    expect(() => readHostKey({ MICHAEL_ENCRYPTION_KEY: 'ab'.repeat(31) + 'a' })).toThrow(expect.objectContaining({ code: 'MICHAEL_ENCRYPTION_KEY_INVALID' }));
    expect(() => readHostKey({ MICHAEL_ENCRYPTION_KEY: 'zz'.repeat(32) })).toThrow(expect.objectContaining({ code: 'MICHAEL_ENCRYPTION_KEY_INVALID' }));
  });
  it('known-answer fingerprint over the RAW bytes (S-5)', () => {
    expect(keyFingerprint(Buffer.alloc(32, 0))).toBe('66687aadf862bd77');
    expect(keyFingerprint(Buffer.alloc(32, 0))).toBe(crypto.createHash('sha256').update(Buffer.alloc(32, 0)).digest('hex').slice(0, 16));
  });
  it('HostKeyEncryption never touches .leo-keys and memoizes the key', async () => {
    const enc = new HostKeyEncryption({ MICHAEL_ENCRYPTION_KEY: KEY });
    expect((await enc.getMasterKey()).equals(Buffer.from(KEY, 'hex'))).toBe(true);
    expect(await enc.fingerprint()).toBe(keyFingerprint(Buffer.from(KEY, 'hex')));
    const src = fs.readFileSync(new URL('./chairman-oauth.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/NODE_ENV|VITEST|SKIP_VENUE|keyPath|readFile/); // S-1: no test-mode bypass, no key file read
  });
});

describe('venue guard (TR-3, S-1): injectable env, no bypass', () => {
  it('refuses under GITHUB_ACTIONS / CI before any decrypt', async () => {
    expect(() => assertHostVenue({ GITHUB_ACTIONS: 'true' })).toThrow(expect.objectContaining({ code: 'HOST_VENUE_REQUIRED' }));
    expect(() => assertHostVenue({ CI: 'true' })).toThrow(expect.objectContaining({ code: 'HOST_VENUE_REQUIRED' }));
    expect(() => assertHostVenue({})).not.toThrow();
    const sb = fakeSb({ row: { encrypted_blob: 'x', key_fingerprint: 'y' } });
    const enc = { fingerprint: async () => 'y', decrypt: async () => { throw new Error('must not be called'); } };
    await expect(getStoredTokens({ sb, enc, env: { GITHUB_ACTIONS: 'true', MICHAEL_ENCRYPTION_KEY: KEY } })).rejects.toMatchObject({ code: 'HOST_VENUE_REQUIRED' });
  });
});

describe('storage (FR-3): ciphertext only, fingerprint stamped and compared', () => {
  it('TS-2: real AES-256-GCM write carries no token property and no fixture string', async () => {
    const sb = fakeSb();
    const enc = new HostKeyEncryption(HOST_ENV);
    const out = await storeTokens(TOKENS, { sb, enc, env: HOST_ENV, now: new Date('2026-09-06T12:00:00Z') });
    expect(sb.writes).toHaveLength(1);
    const { payload, opts } = sb.writes[0];
    expect(opts).toEqual({ onConflict: 'identifier' });
    expect(Object.keys(payload).sort()).toEqual(['encrypted_blob', 'encryption_metadata', 'expires_at', 'identifier', 'key_fingerprint', 'last_error', 'last_refreshed_at', 'scopes']);
    expect(typeof payload.encrypted_blob).toBe('string');
    expect(payload.encryption_metadata.algorithm).toBe('aes-256-gcm');
    expect(payload.key_fingerprint).toBe(keyFingerprint(Buffer.from(KEY, 'hex')));
    expect(payload.scopes).toEqual(SCOPES);
    expect(payload.expires_at).toBe('2026-09-13T12:00:00.000Z');
    expect(payload.last_error).toBeNull();
    const serialized = JSON.stringify(payload);
    for (const s of ['ya29.fixture-access', '1//fixture-refresh', 'eyJ.fixture', 'access_token', 'refresh_token', 'id_token']) expect(serialized).not.toContain(s);
    expect(out.key_fingerprint).toBe(payload.key_fingerprint);
    // round trip through the same key
    const back = await getStoredTokens({ sb: fakeSb({ row: { encrypted_blob: payload.encrypted_blob, encryption_metadata: payload.encryption_metadata, key_fingerprint: payload.key_fingerprint } }), enc, env: HOST_ENV });
    expect(back).toEqual(TOKENS);
  });
  it('failed persist throws (F8) and an unapplied table is TABLES_ABSENT', async () => {
    const enc = new HostKeyEncryption(HOST_ENV);
    await expect(storeTokens(TOKENS, { sb: fakeSb({ writeError: { message: 'boom' } }), enc, env: HOST_ENV })).rejects.toMatchObject({ code: 'WRITE_FAILED' });
    await expect(storeTokens(TOKENS, { sb: fakeSb({ missing: true }), enc, env: HOST_ENV })).rejects.toMatchObject({ code: 'TABLES_ABSENT' });
    await expect(getStoredTokens({ sb: fakeSb({ missing: true }), enc, env: HOST_ENV })).rejects.toMatchObject({ code: 'TABLES_ABSENT' });
  });
  it('TS-3: fingerprint mismatch and absence are coded throws; decrypt is never reached', async () => {
    let decrypts = 0;
    const enc = { fingerprint: async () => 'aaaaaaaaaaaaaaaa', decrypt: async () => { decrypts++; return TOKENS; } };
    await expect(getStoredTokens({ sb: fakeSb({ row: { encrypted_blob: 'blob', key_fingerprint: 'deadbeefdeadbeef' } }), enc, env: HOST_ENV })).rejects.toMatchObject({ code: 'KEY_FINGERPRINT_MISMATCH' });
    await expect(getStoredTokens({ sb: fakeSb({ row: { encrypted_blob: 'blob', key_fingerprint: null } }), enc, env: HOST_ENV })).rejects.toMatchObject({ code: 'KEY_FINGERPRINT_ABSENT' });
    expect(decrypts).toBe(0);
    expect(await getStoredTokens({ sb: fakeSb({ row: null }), enc, env: HOST_ENV })).toBeNull();
  });
});

describe('refresh (FR-3): gauge predicates written by the module', () => {
  const stored = { access_token: 'old', refresh_token: 'r', expiry_date: 1000 };
  const enc = { fingerprint: async () => 'f', decrypt: async () => stored, encrypt: async () => ({ encrypted: 'ct', metadata: { algorithm: 'aes-256-gcm' } }) };
  const row = { encrypted_blob: 'ct', encryption_metadata: {}, key_fingerprint: 'f' };
  it('TS-4: invalid_grant is recorded as last_error and rethrown', async () => {
    const sb = fakeSb({ row });
    const client = { setCredentials() {}, refreshAccessToken: async () => { throw new Error('invalid_grant: Token has been expired or revoked.'); } };
    await expect(getAuthenticatedClient({ sb, enc, env: HOST_ENV, client, now: 2000 })).rejects.toThrow(/invalid_grant/);
    expect(sb.writes).toEqual([{ table: 'michael_credentials', op: 'update', payload: { last_error: 'invalid_grant' } }]);
  });
  it('TS-5: a successful refresh re-stores with new expires_at and clears last_error', async () => {
    const sb = fakeSb({ row });
    const set = [];
    const client = { setCredentials: (c) => set.push(c), refreshAccessToken: async () => ({ credentials: { access_token: 'new', refresh_token: 'r', expiry_date: Date.parse('2026-09-06T13:00:00Z') } }) };
    await getAuthenticatedClient({ sb, enc, env: HOST_ENV, client, now: 2000 });
    expect(sb.writes[0].op).toBe('upsert');
    expect(sb.writes[0].payload.expires_at).toBe('2026-09-06T13:00:00.000Z');
    expect(sb.writes[0].payload.last_error).toBeNull();
    expect(set[1].access_token).toBe('new');
  });
  it('no stored grant is a coded NO_STORED_TOKENS', async () => {
    await expect(getAuthenticatedClient({ sb: fakeSb({ row: null }), enc, env: HOST_ENV, client: { setCredentials() {} } })).rejects.toMatchObject({ code: 'NO_STORED_TOKENS' });
  });
});

describe('oauthHealth (spec §9) is the single predicate', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  it('four row shapes', () => {
    expect(oauthHealth(null, now)).toBe('absent');
    expect(oauthHealth({ last_error: 'invalid_grant', expires_at: '2026-09-20T00:00:00Z' }, now)).toBe('invalid_grant');
    expect(oauthHealth({ last_error: null, expires_at: '2026-09-07T12:00:00Z' }, now)).toBe('expiring');
    expect(oauthHealth({ last_error: null, expires_at: '2026-09-13T12:00:00Z' }, now)).toBe('ok');
    expect(oauthHealth({ last_error: null, expires_at: null }, now)).toBe('ok'); // DATABASE note: NULL expires_at is not "expiring"
    expect(hoursToExpiry({ expires_at: '2026-09-07T12:00:00Z' }, now)).toBe(24);
    expect(hoursToExpiry({ expires_at: null }, now)).toBeNull();
  });
});

describe('consent flow (FR-4, TS-7, TS-11): pre-flight before the browser, state + PKCE, loopback only', () => {
  function fakeClient(calls) {
    return {
      generateCodeVerifierAsync: async () => ({ codeVerifier: 'verifier-1', codeChallenge: 'challenge-1' }),
      generateAuthUrl: (p) => { calls.push(['generateAuthUrl', p]); return `https://accounts.google.com/o/oauth2/v2/auth?state=${p.state}&code_challenge=${p.code_challenge}&code_challenge_method=${p.code_challenge_method}`; },
      getToken: async (a) => { calls.push(['getToken', a]); return { tokens: TOKENS }; },
    };
  }
  function fakeHttp(script) {
    // script(handler) is invoked after listen succeeds; returns { events } for assertions
    const events = [];
    const createServer = (handler) => {
      const server = {
        on: (ev, fn) => { server[`_${ev}`] = fn; },
        listen: (port, host, cb) => { events.push(['listen', port, host]); if (script.addrInUse) { server._error({ code: 'EADDRINUSE' }); return; } events.push(['listening']); cb(); script.drive(handler, events); },
        close: () => events.push(['close']),
      };
      return server;
    };
    return { createServer, events };
  }
  const res = () => ({ statuses: [], writeHead(s) { this.statuses.push(s); }, end() {} });
  it('TABLES_ABSENT refuses before generateAuthUrl and before the browser', async () => {
    const calls = []; let opened = 0;
    await expect(runConsentFlow({ sb: fakeSb({ missing: true }), env: HOST_ENV, client: fakeClient(calls), openBrowser: () => { opened++; }, createServer: () => { throw new Error('must not bind'); } })).rejects.toMatchObject({ code: 'TABLES_ABSENT' });
    expect(calls).toEqual([]); expect(opened).toBe(0);
  });
  it('missing key / GHA venue refuse before any Google call', async () => {
    const calls = [];
    await expect(runConsentFlow({ sb: fakeSb(), env: { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }, client: fakeClient(calls) })).rejects.toMatchObject({ code: 'MICHAEL_ENCRYPTION_KEY_MISSING' });
    await expect(runConsentFlow({ sb: fakeSb(), env: { ...HOST_ENV, GITHUB_ACTIONS: 'true' }, client: fakeClient(calls) })).rejects.toMatchObject({ code: 'HOST_VENUE_REQUIRED' });
    await expect(runConsentFlow({ sb: fakeSb(), env: { MICHAEL_ENCRYPTION_KEY: KEY } })).rejects.toMatchObject({ code: 'GOOGLE_CLIENT_MISSING' });
    expect(calls).toEqual([]);
  });
  it('binds 127.0.0.1 before opening the browser; wrong state is 400 and never exchanged; PKCE verifier reaches getToken', async () => {
    const calls = []; const opens = [];
    const enc = new HostKeyEncryption(HOST_ENV);
    const http = fakeHttp({
      drive(handler, events) {
        const state = calls.find((c) => c[0] === 'generateAuthUrl')[1].state;
        const bad = res(); handler({ url: '/oauth2callback?code=evil&state=wrong' }, bad); events.push(['bad', bad.statuses[0]]);
        const nothing = res(); handler({ url: `/oauth2callback?state=${state}` }, nothing); events.push(['empty', nothing.statuses[0]]);
        const good = res(); handler({ url: `/oauth2callback?code=good-code&state=${state}` }, good); events.push(['good', good.statuses[0]]);
      },
    });
    const sb = fakeSb();
    const out = await runConsentFlow({ sb, enc, env: HOST_ENV, client: fakeClient(calls), openBrowser: (u) => { opens.push(u); http.events.push(['open']); }, createServer: http.createServer, log: () => {} });
    expect(http.events.slice(0, 3)).toEqual([['listen', 3456, REDIRECT_HOST], ['listening'], ['open']]);
    expect(http.events).toContainEqual(['bad', 400]); expect(http.events).toContainEqual(['empty', 400]); expect(http.events).toContainEqual(['good', 200]);
    const url = calls.find((c) => c[0] === 'generateAuthUrl')[1];
    expect(url).toMatchObject({ access_type: 'offline', prompt: 'consent', scope: SCOPES, code_challenge: 'challenge-1', code_challenge_method: 'S256' });
    expect(url.state).toMatch(/^[0-9a-f]{32}$/);
    expect(opens[0]).toContain('code_challenge_method=S256');
    const getTokens = calls.filter((c) => c[0] === 'getToken');
    expect(getTokens).toEqual([['getToken', { code: 'good-code', codeVerifier: 'verifier-1' }]]);
    expect(sb.writes[0].op).toBe('upsert'); expect(out.identifier).toBe(CREDENTIAL_IDENTIFIER);
  });
  it('EADDRINUSE is REDIRECT_PORT_IN_USE and the browser never opens', async () => {
    const calls = []; let opened = 0;
    const http = fakeHttp({ addrInUse: true, drive() {} });
    await expect(runConsentFlow({ sb: fakeSb(), env: HOST_ENV, client: fakeClient(calls), openBrowser: () => { opened++; }, createServer: http.createServer, log: () => {} })).rejects.toMatchObject({ code: 'REDIRECT_PORT_IN_USE' });
    expect(opened).toBe(0);
  });
});
