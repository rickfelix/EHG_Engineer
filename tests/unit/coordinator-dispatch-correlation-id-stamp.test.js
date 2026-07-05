/**
 * QF-20260705-514 — insertCoordinationRow (the choke point) must stamp
 * payload.correlation_id on every row it inserts when absent, so INFO/coordinator_update/
 * coordinator_fence/coordinator_feedback_disposition sends are threadable (not just
 * WORK_ASSIGNMENT rows, which conventionally already carry one from the sender).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Minimal stub: mirrors coordinator-dispatch-protocol-version-stamp.test.js's fixture.
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

describe('insertCoordinationRow: correlation_id stamping (QF-20260705-514)', () => {
  it('stamps a fresh correlation_id onto a row whose payload lacks one', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_update', body: 'update' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.correlation_id).toMatch(UUID_RE);
    // Original fields preserved.
    expect(res.data.payload.kind).toBe('coordinator_update');
    expect(res.data.payload.body).toBe('update');
  });

  it('never overwrites a caller-supplied correlation_id', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { kind: 'work_assignment', correlation_id: 'caller-supplied-id' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.correlation_id).toBe('caller-supplied-id');
  });

  it('does not invent a payload object on a payload-less row', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'no payload here' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload).toBeUndefined();
  });

  it('stamps a different correlation_id per call (never reuses a prior stamp)', async () => {
    const sb1 = stubSupabase();
    const row1 = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_fence' } };
    const res1 = await insertCoordinationRow(sb1, row1, { logger: silentLog });

    const sb2 = stubSupabase();
    const row2 = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_fence' } };
    const res2 = await insertCoordinationRow(sb2, row2, { logger: silentLog });

    expect(res1.data.payload.correlation_id).not.toBe(res2.data.payload.correlation_id);
  });
});
