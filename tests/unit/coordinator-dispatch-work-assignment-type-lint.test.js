/**
 * QF-20260703-885 — insertCoordinationRow (the choke point) must refuse a dispatch typed
 * message_type=INFO with payload.kind='work_assignment'. The claim path (worker-checkin.cjs)
 * surfaces pending assignments ONLY on top-level message_type==='WORK_ASSIGNMENT', so an
 * INFO-typed assignment is invisible to workers — every coordinator dispatch on 2026-07-03
 * morning was mistyped this way, leaving addressed work invisible to its target worker.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

const LIVE_TARGET = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const silentLog = { warn() {}, error() {}, log() {} };

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

describe('insertCoordinationRow: work_assignment writer-side type lint (QF-20260703-885)', () => {
  it('refuses an INFO-typed row carrying payload.kind=work_assignment', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'work_assignment', body: 'do the thing' } };
    await expect(insertCoordinationRow(sb, row, { logger: silentLog })).rejects.toMatchObject({
      code: 'DISPATCH_WORK_ASSIGNMENT_TYPE_MISMATCH',
    });
  });

  it('allows a correctly-typed WORK_ASSIGNMENT row carrying payload.kind=work_assignment', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: LIVE_TARGET, payload: { kind: 'work_assignment', body: 'do the thing' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('work_assignment');
  });

  it('does not touch rows with an unrelated payload.kind', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, payload: { kind: 'coordinator_reply', body: 'hi' } };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload.kind).toBe('coordinator_reply');
  });

  it('does not touch payload-less rows', async () => {
    const sb = stubSupabase();
    const row = { message_type: 'INFO', target_session: LIVE_TARGET, body: 'no payload here' };
    const res = await insertCoordinationRow(sb, row, { logger: silentLog });
    expect(res.data.payload).toBeUndefined();
  });
});
