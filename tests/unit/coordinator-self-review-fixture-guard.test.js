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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { partitionParticipants, isSolicitationDue, buildSolicitationHistory } from '../../scripts/coordinator-self-review.mjs';

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

// QF-20260729-675: partitionParticipants re-derived worker-ness as role!=='adam', so ANY
// non-Adam non-fleet role (e.g. Solomon) was misclassified as a worker and solicited with
// a worker-framed prompt. Fixed by reusing the canonical isBuildForbiddenSession predicate.
// WARNING (per the QF's own falsification-test note): a fixture asserting only that
// role='adam' is excluded PASSES ON THE BROKEN CODE -- it must use a non-Adam non-fleet
// role or it does not reproduce the original defect's blind spot.
describe('coordinator self-review — non-fleet role exclusion from workers (QF-20260729-675)', () => {
  it('a role=solomon, non_fleet=true session is NOT classified as a worker (adamReviewOn)', () => {
    const sess = [
      { session_id: REAL, metadata: { role: 'solomon', non_fleet: true }, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: {}, heartbeat_at: 'now' },
    ];
    const { workers, adamParticipants } = partitionParticipants(sess, 'me-coordinator', true);
    expect(workers).not.toContain(REAL);
    expect(adamParticipants).not.toContain(REAL); // Solomon is not Adam either -- neither bucket
    expect(workers).toEqual([REAL2]);
  });

  it('role=adam is still excluded from workers and still lands in adamParticipants (no regression)', () => {
    const sess = [
      { session_id: REAL, metadata: { role: 'adam', non_fleet: true }, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: {}, heartbeat_at: 'now' },
    ];
    const { workers, adamParticipants } = partitionParticipants(sess, 'me-coordinator', true);
    expect(workers).toEqual([REAL2]);
    expect(adamParticipants).toEqual([REAL]);
  });

  it('a bare non_fleet=true session with no role is also excluded from workers (fail-closed, matches isBuildForbiddenSession)', () => {
    const sess = [
      { session_id: REAL, metadata: { non_fleet: true }, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: {}, heartbeat_at: 'now' },
    ];
    const { workers } = partitionParticipants(sess, 'me-coordinator', true);
    expect(workers).toEqual([REAL2]);
  });

  it('a genuine fleet worker (no role, non_fleet unset) is unaffected', () => {
    const sess = [
      { session_id: REAL, metadata: {}, heartbeat_at: 'now' },
      { session_id: REAL2, metadata: { role: 'solomon', non_fleet: true }, heartbeat_at: 'now' },
    ];
    const { workers } = partitionParticipants(sess, 'me-coordinator', true);
    expect(workers).toEqual([REAL]);
  });
});

// QF-20260821-607: the coordinator's every-N-SD review re-solicited a worker who had already
// answered within the last ~13-14min (observed live) because the solicit loop had no memory of
// prior requests/answers -- every DUE cycle solicited every worker unconditionally. Fixed with a
// pure per-target decision (isSolicitationDue) fed by a pure history-builder (buildSolicitationHistory).
describe('coordinator self-review — solicitation dedup/cooldown (QF-20260821-607)', () => {
  const NOW = Date.parse('2026-08-21T12:00:00Z');
  const COOLDOWN_MS = 6 * 3600 * 1000; // matches the 6h default

  describe('isSolicitationDue', () => {
    it('is due when no request was ever sent and no answer ever received', () => {
      expect(isSolicitationDue({}, { now: NOW, cooldownMs: COOLDOWN_MS })).toEqual({ due: true, reason: 'due' });
    });

    it('is NOT due when a request was sent with no reply since (unanswered, still pending)', () => {
      const verdict = isSolicitationDue(
        { lastRequestSentAt: '2026-08-21T11:00:00Z', lastAnswerAt: null },
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(verdict).toEqual({ due: false, reason: 'unanswered_request_pending' });
    });

    it('is NOT due when the last answer predates the last request (stale answer to an older ask)', () => {
      const verdict = isSolicitationDue(
        { lastRequestSentAt: '2026-08-21T11:00:00Z', lastAnswerAt: '2026-08-20T09:00:00Z' },
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(verdict).toEqual({ due: false, reason: 'unanswered_request_pending' });
    });

    it('is NOT due when the reply landed 14min ago, inside the cooldown (reproduces the live incident)', () => {
      const verdict = isSolicitationDue(
        { lastRequestSentAt: '2026-08-21T11:00:00Z', lastAnswerAt: '2026-08-21T11:46:00Z' },
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(verdict).toEqual({ due: false, reason: 'cooldown_since_last_answer' });
    });

    it('IS due once the last answer is older than the cooldown', () => {
      const verdict = isSolicitationDue(
        { lastRequestSentAt: '2026-08-21T02:00:00Z', lastAnswerAt: '2026-08-21T02:30:00Z' }, // 9.5h ago
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(verdict).toEqual({ due: true, reason: 'due' });
    });

    it('applies the cooldown even to an unsolicited answer (no matching lastRequestSentAt)', () => {
      const dueTooSoon = isSolicitationDue(
        { lastRequestSentAt: null, lastAnswerAt: '2026-08-21T11:00:00Z' }, // 1h ago
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(dueTooSoon.due).toBe(false);
      const dueLater = isSolicitationDue(
        { lastRequestSentAt: null, lastAnswerAt: '2026-08-21T02:00:00Z' }, // 10h ago
        { now: NOW, cooldownMs: COOLDOWN_MS }
      );
      expect(dueLater.due).toBe(true);
    });
  });

  describe('buildSolicitationHistory', () => {
    it('keeps only the MOST RECENT row per target/sender when rows arrive out of order', () => {
      const sentRows = [
        { target_session: REAL, created_at: '2026-08-21T09:00:00Z' },
        { target_session: REAL, created_at: '2026-08-21T11:00:00Z' }, // newer, listed second
        { target_session: REAL2, created_at: '2026-08-21T10:00:00Z' },
      ];
      const answerRows = [
        { sender_session: REAL, created_at: '2026-08-21T11:30:00Z' },
        { sender_session: REAL, created_at: '2026-08-21T08:00:00Z' }, // older, listed second
      ];
      const { lastSentByTarget, lastAnswerBySender } = buildSolicitationHistory(sentRows, answerRows);
      expect(lastSentByTarget.get(REAL)).toBe('2026-08-21T11:00:00Z');
      expect(lastSentByTarget.get(REAL2)).toBe('2026-08-21T10:00:00Z');
      expect(lastAnswerBySender.get(REAL)).toBe('2026-08-21T11:30:00Z');
    });

    it('ignores rows missing the key field or created_at, and never throws on empty/undefined input', () => {
      const sentRows = [
        { created_at: '2026-08-21T09:00:00Z' }, // no target_session
        { target_session: REAL }, // no created_at
        { target_session: REAL2, created_at: '2026-08-21T09:00:00Z' },
      ];
      const { lastSentByTarget } = buildSolicitationHistory(sentRows, undefined);
      expect(lastSentByTarget.has(REAL)).toBe(false);
      expect(lastSentByTarget.get(REAL2)).toBe('2026-08-21T09:00:00Z');
      expect(() => buildSolicitationHistory(undefined, undefined)).not.toThrow();
      expect(buildSolicitationHistory(undefined, undefined).lastSentByTarget.size).toBe(0);
    });
  });

  it('end-to-end: a worker solicited 14min ago is filtered OUT of the due set; an untouched worker stays IN', () => {
    const sentRows = [{ target_session: REAL, created_at: '2026-08-21T11:00:00Z' }];
    const answerRows = [{ sender_session: REAL, created_at: '2026-08-21T11:46:00Z', payload: { body: 'COORDINATOR-FEEDBACK: all good' } }];
    const { lastSentByTarget, lastAnswerBySender } = buildSolicitationHistory(sentRows, answerRows);
    const dueWorkers = [REAL, REAL2].filter((w) =>
      isSolicitationDue({ lastRequestSentAt: lastSentByTarget.get(w), lastAnswerAt: lastAnswerBySender.get(w) }, { now: NOW, cooldownMs: COOLDOWN_MS }).due
    );
    expect(dueWorkers).toEqual([REAL2]);
  });
});

// QF-20260821-607 (adversarial review round 2): the sentRows/replyRows queries feeding
// buildSolicitationHistory() above are NOT dependency-injected (selfReviewMain() runs against
// a module-level `db` singleton), so their DB-query wiring can't be exercised via a mock the
// way relay-drop-gauge.cjs's exported loaders can. Pinned via source-text assertion instead --
// the SAME established pattern already used by loadOutboundCandidates' wiring test in
// tests/unit/coordinator/relay-drop-gauge-worker-signal-reply.test.js.
describe('coordinator self-review — sentRows/replyRows query wiring (QF-20260821-607 round 2)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.resolve(__dirname, '../../scripts/coordinator-self-review.mjs'), 'utf8');
  const region = src.slice(src.indexOf('const solicitSince'), src.indexOf('const replyBody'));

  it('region was actually found (guards the slice itself from silently matching nothing)', () => {
    expect(region.length).toBeGreaterThan(0);
  });

  it('both sentRows and replyRows are explicitly ordered by created_at desc -- a bare .limit() has no "most recent N" guarantee', () => {
    const orderCount = (region.match(/\.order\(\s*['"]created_at['"]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/g) || []).length;
    expect(orderCount).toBe(2);
  });

  it('replyRows is narrowed to payload->>signal_type=feedback (the only shape a genuine "/signal feedback" reply ever takes)', () => {
    expect(region).toMatch(/payload->>signal_type/);
  });
});
