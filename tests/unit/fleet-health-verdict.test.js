/**
 * SD-LEO-INFRA-FLEET-HEALTH-VERDICT-001 — the fleet health verdict must not be satisfied by the
 * condition it should report.
 *
 * THE THREE SPECIMENS ARE A CONTROL, NOT A REPETITION. Each is a case where a DIFFERENT signal lied:
 * ab29dc41 the heartbeat, e7c92ad8 the wake state, e3610a71 loop_state (honest, never consulted).
 * Three near-identical cases would let a fix that repairs one arm pass all of them.
 */

import { describe, it, expect } from 'vitest';
import { computeHealthVerdict, HEALTH, EXCLUDED } from '../../lib/fleet/health-verdict.cjs';

const NOW = Date.parse('2026-08-04T12:00:00.000Z');
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();
const OPTS = { cutPointMinutes: 120, now: NOW };

// The three specimens measured live by the coordinator, verbatim.
const AB29 = { session_id: 'ab29dc41', loop_state: 'active' };
const AB29_LIVE = { session_id: 'ab29dc41', last_tool_at: minsAgo(146), heartbeat_at: minsAgo(0.5) };
const E7C9 = { session_id: 'e7c92ad8', loop_state: 'awaiting_tick' };
// e7c92ad8 was originally diagnosed as stalled BECAUSE its wake was 90m past due. Measurement on the
// live fleet later falsified overdue-wake as a stuck signal (expected_wake_at is never cleared on
// wake, so working seats read hundreds of minutes overdue). The specimen is retained with the overdue
// wake intact, but the exclusion basis is its TOOL CLOCK — the signal that survived falsification.
const E7C9_LIVE = { session_id: 'e7c92ad8', last_tool_at: minsAgo(131), heartbeat_at: minsAgo(0.08),
  metadata: { expected_wake_at: minsAgo(90) } };
const E361 = { session_id: 'e3610a71', loop_state: 'exited' };
const E361_LIVE = { session_id: 'e3610a71', last_tool_at: minsAgo(152), heartbeat_at: minsAgo(0.18) };

const run = (sessions, livenessRows, extra) =>
  computeHealthVerdict({ sessions, livenessRows, truncated: false, ...OPTS, ...extra });

describe('TS-1 — the SD claim, made executable', () => {
  it('the exact three-specimen fixture yields DOWN, not HEALTHY', () => {
    // Three is EXACTLY the >=3 threshold, which is why these three seats were by themselves
    // sufficient to print [OK]. This fixture must never produce HEALTHY again.
    const r = run([AB29, E7C9, E361], [AB29_LIVE, E7C9_LIVE, E361_LIVE]);
    expect(r.verdict).toBe(HEALTH.DOWN);
    expect(r.live).toBe(0);
    expect(r.evaluated).toBe(3);
  });
});

describe('TS-2 — each specimen is excluded for its OWN reason', () => {
  const reasonFor = (id, sessions, rows) =>
    run(sessions, rows).excluded.find((e) => e.session_id === id).reason;

  it('ab29dc41: tool-silent 146m behind a 29-second heartbeat', () => {
    expect(reasonFor('ab29dc41', [AB29], [AB29_LIVE])).toBe(EXCLUDED.TOOL_SILENT);
  });

  it('e7c92ad8: tool-silent past the cut behind a 5-second heartbeat', () => {
    expect(reasonFor('e7c92ad8', [E7C9], [E7C9_LIVE])).toBe(EXCLUDED.TOOL_SILENT);
  });

  it('e3610a71: excluded on loop_state alone', () => {
    expect(reasonFor('e3610a71', [E361], [E361_LIVE])).toBe(EXCLUDED.LOOP_EXITED);
  });
});

describe('TS-3 — SEEDED: UNKNOWN must not become the new counts-as-healthy', () => {
  it('a seat with NULL last_tool_at does not count toward HEALTHY', () => {
    // A build that folded UNKNOWN into the healthy count would pass every stalled-seat test above
    // while RAISING the health number. Raising the number is not the goal.
    const blind = { session_id: 'blind-1', loop_state: 'active' };
    const rows = [{ session_id: 'blind-1', last_tool_at: null }];
    const r = run([blind], rows);
    expect(r.live).toBe(0);
    expect(r.verdict).toBe(HEALTH.DOWN);
    expect(r.excluded[0].reason).toBe(EXCLUDED.NO_TOOL_CLOCK);
  });

  it('three blind seats are DOWN, not HEALTHY — the defect shape, re-armed', () => {
    const seats = ['b1', 'b2', 'b3'].map((id) => ({ session_id: id, loop_state: 'active' }));
    const rows = ['b1', 'b2', 'b3'].map((id) => ({ session_id: id, last_tool_at: null }));
    expect(run(seats, rows).verdict).toBe(HEALTH.DOWN);
  });
});

describe('TS-4 — SEEDED: exited stays excluded even when the classifier would say HEALTHY', () => {
  it('a seat that exited seconds after a tool call is still excluded, on loop_state', () => {
    // A build implementing only the classifier wiring would let HEALTHY rescue this seat, silently
    // subsuming a categorical exclusion into an inference.
    const s = { session_id: 'exited-fresh', loop_state: 'exited' };
    const rows = [{ session_id: 'exited-fresh', last_tool_at: minsAgo(1) }];
    const r = run([s], rows);
    expect(r.live).toBe(0);
    expect(r.excluded[0].reason).toBe(EXCLUDED.LOOP_EXITED);
  });
});

describe('TS-5 — POSITIVE CONTROL: the fix must not achieve correctness by reporting DOWN', () => {
  const liveSeat = (id) => ({ session_id: id, loop_state: 'active' });
  const liveRow = (id) => ({ session_id: id, last_tool_at: minsAgo(2),
    metadata: { expected_wake_at: new Date(NOW + 10 * 60000).toISOString() } });

  it('three genuinely live seats still yield HEALTHY', () => {
    // Without this, a verdict hardcoded to DOWN passes TS-1 through TS-4 completely.
    const ids = ['w1', 'w2', 'w3'];
    const r = run(ids.map(liveSeat), ids.map(liveRow));
    expect(r.verdict).toBe(HEALTH.HEALTHY);
    expect(r.live).toBe(3);
    expect(r.excluded).toHaveLength(0);
  });

  it('one live seat is DEGRADED — the middle band still works', () => {
    expect(run([liveSeat('w1')], [liveRow('w1')]).verdict).toBe(HEALTH.DEGRADED);
  });

  it('a live seat is not excluded by a wake that is armed but not yet due', () => {
    expect(run([liveSeat('w1')], [liveRow('w1')]).live).toBe(1);
  });

  it('REGRESSION: an overdue wake is NOT evidence of stalling — 504m overdue, working, counts live', () => {
    // Pins a falsification, so the rule cannot be re-added by someone who finds "past its own declared
    // deadline" as intuitively compelling as I did. expected_wake_at is written when a wakeup is ARMED
    // and never cleared when the seat wakes, so overdue is the steady state of a WORKING seat. These
    // are the live values measured on seat 28303922 on 2026-08-04, and on e3610a71 — the session that
    // wrote this test, 14 minutes "overdue" while running the tool call that measured it.
    const rows = [{ session_id: 'w1', last_tool_at: minsAgo(3),
      metadata: { expected_wake_at: minsAgo(504) } }];
    const r = run([liveSeat('w1')], rows);
    expect(r.live).toBe(1);
    expect(r.excluded).toHaveLength(0);
  });
});

describe('instrument blindness is reported as UNKNOWN, never as DOWN', () => {
  it('a truncated liveness population yields UNKNOWN', () => {
    // DOWN is a measured claim that no seat is working. UNKNOWN is the admission that the gauge could
    // not measure. Collapsing them would page an operator for an instrument outage.
    const r = run([AB29], [AB29_LIVE], { truncated: true });
    expect(r.verdict).toBe(HEALTH.UNKNOWN);
    expect(r.blindReason).toBe('liveness_population_truncated');
  });

  it('a liveness join that matched nothing yields UNKNOWN, not a fleet-wide DOWN', () => {
    const ids = ['w1', 'w2', 'w3'];
    const r = run(ids.map((id) => ({ session_id: id, loop_state: 'active' })), []);
    expect(r.verdict).toBe(HEALTH.UNKNOWN);
    expect(r.blindReason).toBe('liveness_join_matched_nothing');
  });

  it('a PARTIAL join is not blindness — it is per-seat exclusion, and still reports a real verdict', () => {
    // The distinction matters: one unmatched seat among three live ones must not suppress the verdict.
    const ids = ['w1', 'w2', 'w3'];
    const sessions = [...ids.map((id) => ({ session_id: id, loop_state: 'active' })),
      { session_id: 'ghost', loop_state: 'active' }];
    const rows = ids.map((id) => ({ session_id: id, last_tool_at: minsAgo(2) }));
    const r = run(sessions, rows);
    expect(r.verdict).toBe(HEALTH.HEALTHY);
    expect(r.blindReason).toBeNull();
    expect(r.excluded[0].reason).toBe(EXCLUDED.NO_LIVENESS_ROW);
  });

  it('an empty fleet is DOWN, not UNKNOWN — nothing to measure is itself a measurement', () => {
    expect(run([], []).verdict).toBe(HEALTH.DOWN);
  });
});
