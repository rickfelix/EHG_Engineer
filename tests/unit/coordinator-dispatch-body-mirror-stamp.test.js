/**
 * QF-20260724-635 — insertCoordinationRow (the choke point) sets ONLY payload.body,
 * never the top-level body column, when a caller passes body only inside payload.
 * Readers of session_coordination.body (e.g. Adam's inbox) get NULL on those sends,
 * rendering every coordinator->Adam message body-empty even though the subject arrives.
 * Fix: mirror payload.body into the top-level body column, fill-if-absent only.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

// Same minimal stub as coordinator-dispatch-correlation-id-stamp.test.js.
function stubSupabase() {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'claude_sessions') {
            return Promise.resolve({ data: chain._eq === LIVE_TARGET ? { session_id: LIVE_TARGET, status: 'active' } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(r) { chain._inserted = r; return chain; },
        then(res, rej) { return Promise.resolve({ data: chain._inserted || null, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

describe('insertCoordinationRow: top-level body mirror (QF-20260724-635)', () => {
  it('mirrors payload.body into the top-level body column when top-level body is absent', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_update', body: 'coordinator says hello' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('coordinator says hello');
    expect(res.data.payload.body).toBe('coordinator says hello');
  });

  it('never overwrites a caller-supplied top-level body', async () => {
    const sb = stubSupabase();
    const row = {
      message_type: 'INFO',
      target_session: LIVE_TARGET,
      body: 'caller-supplied top-level body',
      payload: { kind: 'coordinator_update', body: 'different payload body' },
    };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('caller-supplied top-level body');
    expect(res.data.payload.body).toBe('different payload body');
  });

  it('does not invent a top-level body when neither top-level nor payload.body is set', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_update' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBeUndefined();
  });

  it('leaves a payload-less row untouched (no payload object invented)', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'plain body, no payload' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('plain body, no payload');
    expect(res.data.payload).toBeUndefined();
  });
});
