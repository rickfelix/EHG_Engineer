/**
 * QF-20260724-556 — worker-side ack path for coordinator_directive rows. Without this,
 * a directive addressed to a worker resurfaces on EVERY /checkin forever (DIRECTIVE_KINDS
 * deliberately blocks auto-ack in surfaceCoordinatorMessages). This is the sanctioned
 * worker-side ack: stamps acknowledged_at + payload.actioned_at/actioned_by on the row.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ackDirective } = require('../../scripts/worker-ack-directive.cjs');

const ROW_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const WORKER_SESSION = '0f8d45d8-9531-4ab8-a1b9-6961c405e1ec';
const OTHER_SESSION = '11111111-2222-3333-4444-555555555555';

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

describe('ackDirective (QF-20260724-556)', () => {
  it('acknowledges a genuine coordinator_directive row not yet acked', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_directive', subject: 'do a thing' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    const result = await ackDirective(sb, ROW_ID, { sessionId: WORKER_SESSION });
    expect(result.alreadyAcked).toBe(false);
    expect(result.kind).toBe('coordinator_directive');
    expect(sb._updates).toHaveLength(1);
    expect(sb._updates[0].acknowledged_at).toBeTruthy();
    expect(sb._updates[0].payload.actioned_at).toBeTruthy();
    expect(sb._updates[0].payload.actioned_by).toBe(WORKER_SESSION);
  });

  it('is idempotent — a second ack on an already-acked row is a no-op', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_directive' }, target_session: WORKER_SESSION, acknowledged_at: '2026-01-01T00:00:00Z' };
    const sb = stubSupabase(row);
    const result = await ackDirective(sb, ROW_ID, { sessionId: WORKER_SESSION });
    expect(result.alreadyAcked).toBe(true);
    expect(sb._updates).toHaveLength(0);
  });

  it('refuses to ack a non-directive kind (never lets this path auto-ack an advisory row)', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_reply' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    await expect(ackDirective(sb, ROW_ID, { sessionId: WORKER_SESSION })).rejects.toMatchObject({ code: 'NOT_A_DIRECTIVE' });
    expect(sb._updates).toHaveLength(0);
  });

  it('refuses to ack a directive addressed to a different session', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_directive' }, target_session: OTHER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    await expect(ackDirective(sb, ROW_ID, { sessionId: WORKER_SESSION })).rejects.toMatchObject({ code: 'WRONG_SESSION' });
    expect(sb._updates).toHaveLength(0);
  });

  it('throws NOT_FOUND for an unknown row id', async () => {
    const sb = stubSupabase(null);
    await expect(ackDirective(sb, 'does-not-exist', { sessionId: WORKER_SESSION })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('preserves a caller-supplied note on the actioned payload', async () => {
    const row = { id: ROW_ID, payload: { kind: 'coordinator_directive' }, target_session: WORKER_SESSION, acknowledged_at: null };
    const sb = stubSupabase(row);
    await ackDirective(sb, ROW_ID, { sessionId: WORKER_SESSION, note: 'landed the fix in PR #6428' });
    expect(sb._updates[0].payload.actioned_note).toBe('landed the fix in PR #6428');
  });
});
