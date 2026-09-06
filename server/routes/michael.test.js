// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C FR-6 / TS-9 — the route never leaks and the mount is guarded.
// The mount-table assertion reads server/index.js source: no repo test exercises mount middleware (Explore gap 4).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createMichaelRouter, statusPayload, RECONSENT_COMMAND } from './michael.js';
import { SCOPES } from '../../lib/integrations/google/chairman-oauth.js';

const ROW = { identifier: 'google_chairman_oauth', scopes: SCOPES, expires_at: '2026-09-07T12:00:00Z', last_refreshed_at: '2026-09-06T00:00:00Z', last_error: null, key_fingerprint: 'fp', encrypted_blob: 'MUST-NOT-LEAK', encryption_metadata: { appId: 'x' } };
const NOW = Date.parse('2026-09-06T12:00:00Z');
const sbWith = (row, missing = false) => ({ from: () => ({ select() { return this; }, eq() { return this; }, limit() { return this; }, then(res) { return Promise.resolve(missing ? { data: null, error: { code: 'PGRST205', message: 'missing' } } : { data: row ? [row] : [], error: null }).then(res); } }) });

function invoke(router, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods.get);
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return layer.route.stack[0].handle({}, res).then(() => res);
}

describe('GET /oauth/status', () => {
  it('returns non-secret fields only, with hours_to_expiry (number|null) and health', async () => {
    const res = await invoke(createMichaelRouter({ getSupabase: () => sbWith(ROW), now: () => NOW }), '/oauth/status');
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['expires_at', 'health', 'hours_to_expiry', 'identifier', 'key_fingerprint', 'last_error', 'last_refreshed_at', 'reconsent', 'scopes']);
    expect(res.body).toMatchObject({ health: 'expiring', hours_to_expiry: 24, reconsent: RECONSENT_COMMAND });
    expect(JSON.stringify(res.body)).not.toMatch(/MUST-NOT-LEAK|encrypted_blob|encryption_metadata/);
    expect(statusPayload({ expires_at: null, last_error: 'invalid_grant' }, NOW)).toMatchObject({ hours_to_expiry: null, health: 'invalid_grant' });
  });
  it('404 NO_CREDENTIAL and 503 TABLES_ABSENT in the { error, message, code } shape (D-3)', async () => {
    const r404 = await invoke(createMichaelRouter({ getSupabase: () => sbWith(null) }), '/oauth/status');
    expect(r404.statusCode).toBe(404); expect(r404.body).toMatchObject({ error: 'Not Found', code: 'NO_CREDENTIAL' }); expect(r404.body.message).toContain(RECONSENT_COMMAND);
    const r503 = await invoke(createMichaelRouter({ getSupabase: () => sbWith(null, true) }), '/oauth/status');
    expect(r503.statusCode).toBe(503); expect(r503.body).toMatchObject({ error: 'Service Unavailable', code: 'TABLES_ABSENT' });
    const r500 = await invoke(createMichaelRouter({ getSupabase: () => { throw new Error('no env'); } }), '/oauth/status');
    expect(r500.statusCode).toBe(500); expect(r500.body.code).toBe('STATUS_FAILED');
  });
});

describe('mount table (server/index.js)', () => {
  it('/api/michael is mounted exactly once, with requireAuth and requireAdminRole on the same line', () => {
    const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const lines = src.split('\n').filter((l) => l.includes("'/api/michael'"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/app\.use\('\/api\/michael',\s*requireAuth,\s*requireAdminRole,\s*michaelRoutes\)/);
    expect(src).toMatch(/import michaelRoutes from '\.\/routes\/michael\.js'/);
    expect(src.indexOf("'/api/michael'")).toBeLessThan(src.indexOf("app.use('/api', optionalAuth")); // before the optionalAuth catch-all
  });
});
