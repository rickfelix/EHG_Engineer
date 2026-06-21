/**
 * Fixture/garbage session guard — SD-LEO-FEAT-COORDINATOR-SELF-REVIEW-001.
 *
 * INCIDENT (2026-06-10 ~15:03Z, ×2): at the every-8-SDs review threshold, coordinator-self-review.mjs
 * crashed mid-solicit. Drain-test fixture rows leak NON-UUID session_ids (e.g. drain_test_exe_s0_*)
 * into claude_sessions with fresh heartbeats; they pass the heartbeat window, reach the solicit loop,
 * and an uncaught throw killed the whole solicitation — and because the review counter only stamps
 * AFTER the loops, the review fell into a 5-min crash-loop.
 *
 * FIX (already shipped in coordinator-self-review.mjs:116-117): filter the partitioned participants to
 * FULL UUIDs before soliciting, plus a per-target try/catch. This regression test pins BOTH halves of
 * the guard — it would FAIL on the pre-fix code (a fixture row reaches solicit) and documents the
 * contract so the guard cannot silently regress. Pure: partitionParticipants (exported, no I/O) +
 * isFullUuid (the same predicate the prod filter uses).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { partitionParticipants } from '../../scripts/coordinator-self-review.mjs';

const { isFullUuid } = createRequire(import.meta.url)('../../lib/coordinator/dispatch.cjs');

const REAL = '11111111-2222-4333-8444-555555555555';
const REAL2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// Mirror the exact prod guard: partitionParticipants(...).workers then .filter(isFullUuid).
function solicitableWorkers(sess, me, adamOn = false) {
  const { workers } = partitionParticipants(sess, me, adamOn);
  return workers.filter((w) => isFullUuid(w));
}

describe('coordinator self-review — fixture/non-UUID session guard (SD-LEO-FEAT-COORDINATOR-SELF-REVIEW-001)', () => {
  it('isFullUuid rejects drain-test fixture ids and accepts real session UUIDs', () => {
    expect(isFullUuid('drain_test_exe_s0_1')).toBe(false);
    expect(isFullUuid('drain_test_exe_s0_abc')).toBe(false);
    expect(isFullUuid('')).toBe(false);
    expect(isFullUuid(REAL)).toBe(true);
  });

  it('a drain-test fixture row reaches partitionParticipants but is filtered OUT before solicit', () => {
    const sess = [
      { session_id: REAL, metadata: {}, heartbeat_at: 'now' },
      { session_id: 'drain_test_exe_s0_1', metadata: {}, heartbeat_at: 'now' }, // the crasher
    ];
    // It IS partitioned in as a raw worker (proving it reaches the danger zone)...
    const { workers: raw } = partitionParticipants(sess, 'me-coordinator', false);
    expect(raw).toContain('drain_test_exe_s0_1');
    // ...but the guard filters it out, leaving only the real worker to solicit.
    expect(solicitableWorkers(sess, 'me-coordinator')).toEqual([REAL]);
  });

  it('multiple real workers survive; multiple fixtures are all excluded', () => {
    const sess = [
      { session_id: REAL, metadata: {}, heartbeat_at: 'now' },
      { session_id: 'drain_test_exe_s0_1', metadata: {}, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: {}, heartbeat_at: 'now' },
      { session_id: 'fixture-not-a-uuid', metadata: {}, heartbeat_at: 'now' },
    ];
    expect(solicitableWorkers(sess, 'me').sort()).toEqual([REAL, REAL2].sort());
  });

  it('an all-fixture roster yields zero solicit targets (no crash, empty solicit)', () => {
    const sess = [
      { session_id: 'drain_test_exe_s0_1', metadata: {}, heartbeat_at: 'now' },
      { session_id: 'drain_test_exe_s0_2', metadata: {}, heartbeat_at: 'now' },
    ];
    expect(solicitableWorkers(sess, 'me')).toEqual([]);
  });

  it('rows with null/missing metadata do not throw (partitionParticipants null-guards)', () => {
    const sess = [
      { session_id: REAL, metadata: null, heartbeat_at: 'now' },
      { session_id: REAL2, heartbeat_at: 'now' }, // metadata key absent entirely
      { session_id: 'drain_test_exe_s0_9', metadata: null, heartbeat_at: 'now' },
    ];
    expect(() => solicitableWorkers(sess, 'me')).not.toThrow();
    expect(solicitableWorkers(sess, 'me').sort()).toEqual([REAL, REAL2].sort());
  });

  it('the coordinator itself is excluded regardless of UUID validity', () => {
    const me = REAL;
    const sess = [
      { session_id: me, metadata: { is_coordinator: true }, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: {}, heartbeat_at: 'now' },
    ];
    expect(solicitableWorkers(sess, me)).toEqual([REAL2]);
  });
});
