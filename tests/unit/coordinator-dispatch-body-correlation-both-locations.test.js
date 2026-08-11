/**
 * QF-20260728-246 — insertCoordinationRow (the choke point) mirrored payload.body into
 * the top-level body column (QF-20260724-635) but never the reverse, and stamped
 * payload.correlation_id but never mirrored it to the top-level correlation_id column.
 * Measured live: 58/90 recent sender_type='coordinator' rows had body ONLY in the
 * top-level column (payload.body-keyed readers saw empty); 5207/5224 rows fleet-wide
 * carried correlation_id ONLY in payload (top-level-keyed readers missed nearly everything).
 * Fix: mirror both fields into both locations, fill-if-absent, never overwriting a
 * caller-supplied value in either location.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same minimal stub as the sibling body-mirror / correlation-id-stamp test files.
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

describe('insertCoordinationRow: reverse body mirror (QF-20260728-246)', () => {
  it('mirrors a top-level-only body into payload.body', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: '[COORD->ADAM] status update', payload: { kind: 'coordinator_update' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('[COORD->ADAM] status update');
    expect(res.data.payload.body).toBe('[COORD->ADAM] status update');
  });

  it('never overwrites a caller-supplied payload.body', async () => {
    const sb = stubSupabase();
    const row = {
      message_type: 'INFO',
      target_session: LIVE_TARGET,
      body: 'top-level text',
      payload: { kind: 'coordinator_update', body: 'different payload text' },
    };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('top-level text');
    expect(res.data.payload.body).toBe('different payload text');
  });
});

describe('insertCoordinationRow: correlation_id column mirror (QF-20260728-246)', () => {
  it('mirrors the freshly-stamped payload.correlation_id onto the top-level column', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_update', body: 'update' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.correlation_id).toMatch(UUID_RE);
    expect(res.data.correlation_id).toBe(res.data.payload.correlation_id);
  });

  it('mirrors a caller-supplied payload.correlation_id onto the top-level column', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { kind: 'work_assignment', correlation_id: 'caller-supplied-id' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.correlation_id).toBe('caller-supplied-id');
  });

  it('never overwrites a caller-supplied top-level correlation_id', async () => {
    const sb = stubSupabase();
    const row = {
      message_type: 'INFO',
      target_session: LIVE_TARGET,
      correlation_id: 'top-level-caller-id',
      payload: { kind: 'coordinator_update', correlation_id: 'payload-caller-id' },
    };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.correlation_id).toBe('top-level-caller-id');
    expect(res.data.payload.correlation_id).toBe('payload-caller-id');
  });

  it('does not invent a top-level correlation_id on a payload-less row', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'no payload here' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.correlation_id).toBeUndefined();
  });
});

describe('insertCoordinationRow: both locations populated for every sender (QF-20260728-246 expected_behavior)', () => {
  it('a typical top-level-only coordinator send ends up with body and correlation_id in both locations', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'plain top-level send', payload: { kind: 'coordinator_update' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('plain top-level send');
    expect(res.data.payload.body).toBe('plain top-level send');
    expect(res.data.correlation_id).toMatch(UUID_RE);
    expect(res.data.payload.correlation_id).toBe(res.data.correlation_id);
  });

  it('a genuinely payload-less row still invents no payload object (existing QF-20260724-635 precedent, unchanged)', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'plain body, no payload' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.body).toBe('plain body, no payload');
    expect(res.data.payload).toBeUndefined();
    expect(res.data.correlation_id).toBeUndefined();
  });
});
