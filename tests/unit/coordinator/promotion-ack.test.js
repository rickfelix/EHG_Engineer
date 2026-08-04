// SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 — FR-5 classifier + FR-4/FR-8/FR-9 consumers.
//
// WHY EVERYTHING HERE IS IN-MEMORY. This repo has no designated non-production database: the
// vitest `db` project is gated on a target that does not exist, so every run prints
// "db project DISABLED". A detector that could only be exercised against live data could not be
// honestly tested — proving it would mean writing synthetic rows into the very population being
// measured. Worse, tests/integration/ resolves to ZERO files and reports GREEN BY ABSENCE, so
// putting them there would look like coverage while asserting nothing.
//
// So the defect predicate is a pure total function and the proof is crafted row objects.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);

const {
  PROMOTION_ACK_SOURCE,
  buildPromotionAckPayload,
  isPromotionAcked,
  isRouterSwallowed
} = require_('../../../lib/coordinator/promotion-ack.cjs');
const { detectReplyStarvation } = require_('../../../lib/coordinator/detectors.cjs');

describe('buildPromotionAckPayload — records provenance, never disposition', () => {
  it('preserves the dedup key and adds the marker', () => {
    const out = buildPromotionAckPayload({ signal_type: 'stuck', severity: 'critical' }, 'fb-1');
    expect(out.routed_to_feedback_id).toBe('fb-1');
    expect(out.promotion_ack).toBe(true);
    expect(out.promotion_ack_source).toBe(PROMOTION_ACK_SOURCE);
  });

  it('preserves every pre-existing payload key', () => {
    // The sweep's own comment warns that signal_type / severity / sender_callsign are
    // load-bearing downstream and a blanket write would erase them.
    const out = buildPromotionAckPayload({ signal_type: 'stuck', severity: 'critical', sender_callsign: 'Alpha-5' }, 'fb-1');
    expect(out).toMatchObject({ signal_type: 'stuck', severity: 'critical', sender_callsign: 'Alpha-5' });
  });

  it('does not mutate its input', () => {
    const original = { signal_type: 'stuck' };
    buildPromotionAckPayload(original, 'fb-1');
    expect(original.promotion_ack).toBeUndefined();
  });

  it('is total — a null payload is not a crash', () => {
    expect(buildPromotionAckPayload(null, 'fb-1').promotion_ack).toBe(true);
    expect(buildPromotionAckPayload(undefined, 'fb-1').routed_to_feedback_id).toBe('fb-1');
  });

  it('NEVER writes acknowledged_at — the whole point of the SD', () => {
    // The function returns a payload, so acknowledged_at cannot appear in it. This asserts the
    // contract explicitly so a future edit that starts merging column values here fails loudly.
    expect(Object.keys(buildPromotionAckPayload({}, 'fb-1'))).not.toContain('acknowledged_at');
  });
});

describe('isRouterSwallowed — keyed on router PROVENANCE, not the bare acked-and-unread pair', () => {
  const swallowed = { acknowledged_at: '2026-08-03T12:00:00Z', read_at: null, payload: { promotion_ack: true } };

  it('true for a router-swallowed row', () => {
    expect(isRouterSwallowed(swallowed)).toBe(true);
  });

  it('FALSE for the LEGITIMATE coordinator disposition shape — the named exclusion', () => {
    // scripts/coordinator-ack-signal.cjs stamps acknowledged_at without read_at BY DESIGN. Those
    // rows are acked-and-unread forever and always will be. Keying on the bare pair would report
    // them as offenders, so "drive the count to zero" was never reachable and is not the goal.
    // Measured while building this: 13 rows matched the bare pair; only 9 were router-promoted.
    expect(isRouterSwallowed({ acknowledged_at: '2026-08-03T12:00:00Z', read_at: null, payload: { signal_type: 'stuck' } })).toBe(false);
  });

  it('false for a read-then-acked row (the negative fixture shape, ~426 live rows)', () => {
    expect(isRouterSwallowed({ acknowledged_at: '2026-08-03T12:00:00Z', read_at: '2026-08-03T11:00:00Z', payload: { promotion_ack: true } })).toBe(false);
  });

  it('false for an unacked row, promoted or not', () => {
    expect(isRouterSwallowed({ acknowledged_at: null, read_at: null, payload: { promotion_ack: true } })).toBe(false);
    expect(isRouterSwallowed({ acknowledged_at: null, read_at: null, payload: {} })).toBe(false);
  });

  it('PROOF IT CAN STILL FIRE after the fix', () => {
    // A zero count in production must mean health, not a dead predicate. If some other writer
    // acks a promoted row behind our back — which is exactly what the STUCK-drain would have
    // done — this still reports it.
    expect(isRouterSwallowed({ ...swallowed, payload: { promotion_ack: true, signal_type: 'stuck' } })).toBe(true);
  });

  it('is total — junk shapes return false rather than throwing', () => {
    for (const junk of [null, undefined, {}, { payload: null }, { payload: { promotion_ack: 'yes' } }]) {
      expect(isRouterSwallowed(junk)).toBe(false);
    }
  });

  it('requires strict true, so a truthy-but-wrong marker does not count', () => {
    expect(isPromotionAcked({ payload: { promotion_ack: 1 } })).toBe(false);
    expect(isPromotionAcked({ payload: { promotion_ack: 'true' } })).toBe(false);
  });
});

describe('FR-4 — the starvation gauge stops treating "routed" as "answered"', () => {
  const old = new Date('2026-08-03T00:00:00Z').getTime();
  const now = new Date('2026-08-03T12:00:00Z').getTime();
  // sender_type:'worker' is REQUIRED — detectReplyStarvation skips every other sender at its
  // first line. Omitting it made both cases below vacuous on the first run: the discriminating
  // case "passed" because the row was filtered out before the answered-logic ran, not because
  // the logic said answered. A fixture that misses a guard tests the guard, not the change.
  const base = { id: 's1', created_at: new Date(old).toISOString(), sender_session: 'w1', sender_type: 'worker' };

  it('a promoted-but-unactioned signal IS starving', () => {
    // Before this SD, routed_to_feedback_id alone marked it answered — which is why the one
    // gauge that should have alarmed on all 9 swallowed signals stayed silent.
    const r = detectReplyStarvation({
      signals: [{ ...base, payload: { signal_type: 'stuck', routed_to_feedback_id: 'fb-1', promotion_ack: true } }],
      now
    });
    expect(r.matched).toBe(true);
  });

  it('DISCRIMINATES — a genuinely routed row without the promotion marker is still answered', () => {
    // The half that stops "answered = never" from passing. If this also matched, the gauge would
    // simply alarm on everything and the first assertion would prove nothing.
    const r = detectReplyStarvation({
      signals: [{ ...base, payload: { signal_type: 'stuck', routed_to_feedback_id: 'fb-1' } }],
      now
    });
    expect(r.matched).toBe(false);
  });

  it('a genuinely acknowledged row is still answered', () => {
    const r = detectReplyStarvation({
      signals: [{ ...base, acknowledged_at: new Date(now).toISOString(), payload: { signal_type: 'stuck' } }],
      now
    });
    expect(r.matched).toBe(false);
  });
});
