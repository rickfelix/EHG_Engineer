/**
 * QF-20260830-144 — SIGNAL_RESOLVED notification rows (stale-session-sweep.cjs) were written
 * with no payload.kind at all: worker-ack-directive.cjs refuses non-directive kinds and
 * worker-ack-advisory.cjs refused undefined as not an ADVISORY_KIND, so the rows were
 * unackable by construction and re-presented on every /checkin forever. Fix: the two
 * SIGNAL_RESOLVED writers now stamp payload.kind='signal_resolved', added to ADVISORY_KINDS.
 * Two-sided: a signal_resolved row now acks cleanly, and existing advisory kinds are
 * byte-unchanged.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ackAdvisory } = require('../../scripts/worker-ack-directive.cjs');

const ROW_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const WORKER_SESSION = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';

function stubSupabase(row) {
  const updates = [];
  return {
    _updates: updates,
    from(table) {
      expect(table).toBe('session_coordination');
      const chain = {
        select() { return chain; },
        eq(_col, val) { chain._eq = val; return chain; },
        single() {
          return Promise.resolve(chain._eq === ROW_ID ? { data: row, error: null } : { data: null, error: { message: 'not found' } });
        },
        update(patch) {
          updates.push(patch);
          return chain;
        },
        then(res, rej) {
          return Promise.resolve({ error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('ackAdvisory — signal_resolved lane (QF-20260830-144)', () => {
  it('acknowledges a signal_resolved row cleanly (the fix)', async () => {
    const row = { id: ROW_ID, payload: { kind: 'signal_resolved', signal_resolved: true }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    const result = await ackAdvisory(sb, ROW_ID, { sessionId: WORKER_SESSION });
    expect(result.alreadyAcked).toBe(false);
    expect(result.kind).toBe('signal_resolved');
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].acknowledged_at).toBeTruthy();
  });

  it('still acknowledges existing advisory kinds unchanged (coordinator_reply)', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_reply' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    const result = await ackAdvisory(sb, ROW_ID, { sessionId: WORKER_SESSION });
    expect(result.alreadyAcked).toBe(false);
    expect(result.kind).toBe('coordinator_reply');
  });

  it('still acknowledges existing advisory kinds unchanged (completion_nudge)', async () => {
    const row = { id: ROW_ID, payload: { kind: 'completion_nudge' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    const result = await ackAdvisory(sb, ROW_ID, { sessionId: WORKER_SESSION });
    expect(result.alreadyAcked).toBe(false);
    expect(result.kind).toBe('completion_nudge');
  });

  it('still refuses a row with no kind at all (the pre-fix shape, for any writer that forgets to stamp one)', async () => {
    const row = { id: ROW_ID, payload: { signal_resolved: true }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    await expect(ackAdvisory(sb, ROW_ID, { sessionId: WORKER_SESSION })).rejects.toMatchObject({ code: 'NOT_AN_ADVISORY' });
    expect(sb._updates).toHaveLength(0);
  });

  it('still refuses a directive kind (the lane separation is unaffected)', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_directive' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    await expect(ackAdvisory(sb, ROW_ID, { sessionId: WORKER_SESSION })).rejects.toMatchObject({ code: 'NOT_AN_ADVISORY' });
  });
});
