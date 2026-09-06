// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C FR-4 / TS-7 — the one-command runbook refuses before the browser.
import { describe, it, expect } from 'vitest';
import { runGoogleConsent, statusOf, renderStatus } from './google-consent.mjs';
import { SCOPES } from '../../lib/integrations/google/chairman-oauth.js';

const KEY = 'cd'.repeat(32);
const HOST_ENV = { MICHAEL_ENCRYPTION_KEY: KEY, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csec' };
const ROW = { identifier: 'google_chairman_oauth', scopes: SCOPES, expires_at: '2026-09-07T12:00:00Z', last_refreshed_at: '2026-09-06T00:00:00Z', last_error: null, key_fingerprint: 'stored-fp', encrypted_blob: 'MUST-NOT-LEAK', encryption_metadata: { appId: 'x' } };
const sbWith = (row, missing = false) => ({ from: () => ({ select() { return this; }, eq() { return this; }, limit() { return this; }, then(res) { return Promise.resolve(missing ? { data: null, error: { code: 'PGRST205', message: 'missing' } } : { data: row ? [row] : [], error: null }).then(res); } }) });

describe('refusal order: venue, key, client, table — all before consent', () => {
  it('GHA venue and missing/empty key refuse with codes and exit-2 envelopes', async () => {
    let consents = 0; const consent = async () => { consents++; return {}; };
    expect(await runGoogleConsent({ env: { ...HOST_ENV, GITHUB_ACTIONS: 'true' }, consent })).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    expect(await runGoogleConsent({ env: { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }, consent })).toMatchObject({ ok: false, refusal: 'MICHAEL_ENCRYPTION_KEY_MISSING' });
    expect(await runGoogleConsent({ env: { MICHAEL_ENCRYPTION_KEY: '' }, argv: ['--status', '--json'], consent })).toMatchObject({ ok: false, refusal: 'MICHAEL_ENCRYPTION_KEY_MISSING' });
    const r = await runGoogleConsent({ env: { MICHAEL_ENCRYPTION_KEY: 'zz'.repeat(32) }, consent });
    expect(r).toMatchObject({ ok: false, refusal: 'MICHAEL_ENCRYPTION_KEY_INVALID' });
    expect(consents).toBe(0);
    expect((await runGoogleConsent({ env: {}, consent })).message).toMatch(/randomBytes\(32\)/); // provisioning step in the refusal
  });
  it('a coded consent failure (e.g. TABLES_ABSENT from the flow) becomes a refusal', async () => {
    const consent = async () => { const e = new Error('table absent'); e.code = 'TABLES_ABSENT'; throw e; };
    expect(await runGoogleConsent({ env: HOST_ENV, consent })).toMatchObject({ ok: false, refusal: 'TABLES_ABSENT' });
  });
  it('success passes the injected sb/env to the flow and returns consented:true', async () => {
    const seen = [];
    const out = await runGoogleConsent({ sb: 'SB', env: HOST_ENV, consent: async (o) => { seen.push(o); return { identifier: 'google_chairman_oauth', key_fingerprint: 'fp' }; } });
    expect(out).toEqual({ ok: true, consented: true, identifier: 'google_chairman_oauth', key_fingerprint: 'fp' });
    expect(seen[0].sb).toBe('SB');
  });
});

describe('--status: non-secret rendering (D-2)', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  it('status object and rendering carry no blob or metadata, and flag a key mismatch', async () => {
    const r = await runGoogleConsent({ sb: sbWith(ROW), env: HOST_ENV, argv: ['--status'], now });
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toContain('MUST-NOT-LEAK'); expect(json).not.toContain('encrypted_blob'); expect(json).not.toContain('encryption_metadata');
    expect(r.status).toMatchObject({ present: true, health: 'expiring', hours_to_expiry: 24, key_matches: false, key_fingerprint: 'stored-fp' });
    const text = renderStatus(r.status);
    expect(text).toMatch(/health:\s+expiring/); expect(text).toContain('MISMATCH'); expect(text).not.toContain('MUST-NOT-LEAK');
    expect(text.split('\n')).toHaveLength(7);
  });
  it('absent row and unapplied table', async () => {
    const r = await runGoogleConsent({ sb: sbWith(null), env: HOST_ENV, argv: ['--status'], now });
    expect(r.status).toMatchObject({ present: false, health: 'absent', hours_to_expiry: null, key_matches: false });
    expect(statusOf(null, 'hostfp', now).host_key_fingerprint).toBe('hostfp');
    expect(await runGoogleConsent({ sb: sbWith(null, true), env: HOST_ENV, argv: ['--status'] })).toMatchObject({ ok: false, refusal: 'TABLES_ABSENT' });
  });
});
