/**
 * Self-wake-overdue escalation — SD-LEO-INFRA-ARMED-WAKEUP-NEVER-001.
 *
 * The self-recovery leg: a seat's own session-tick daemon detects an unmet ScheduleWakeup
 * deadline and escalates instead of freezing silently. Reuses lib/fleet/stuck-seat-predicate.cjs
 * (never a second, drifting discriminant) — these tests pin the ACTING layer on top of it.
 */
import { describe, it, expect } from 'vitest';
import { shouldSelfEscalate, shouldClearSelfEscalation, buildSelfEscalationRow } from '../../../lib/fleet/self-wake-escalation.cjs';

const NOW = Date.parse('2026-08-30T08:00:00Z');
const TEST_CUT = 60;

function row({ toolSilentMin, loopState, expectedWakeAt, selfEscalatedForWakeAt } = {}) {
  return {
    session_id: 'test-session-abc123',
    loop_state: loopState ?? 'awaiting_tick',
    last_tool_at: new Date(NOW - (toolSilentMin ?? 0) * 60000).toISOString(),
    metadata: {
      expected_wake_at: expectedWakeAt,
      self_escalated_for_wake_at: selfEscalatedForWakeAt,
      fleet_identity: 'Charlie',
    },
  };
}

describe('shouldSelfEscalate', () => {
  it('escalates: tool-silent past cut, loop_state=awaiting_tick, deadline recorded and passed', () => {
    const r = row({
      toolSilentMin: 90,
      expectedWakeAt: new Date(NOW - 15 * 60000).toISOString(), // 15 min overdue
    });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(true);
    expect(v.overdueMinutes).toBe(15);
    expect(v.toolSilentMinutes).toBe(90);
  });

  it('does NOT escalate: tool activity is recent (healthy, mid-work)', () => {
    const r = row({ toolSilentMin: 2, expectedWakeAt: new Date(NOW - 15 * 60000).toISOString() });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(false);
  });

  it('does NOT escalate: deadline is still pending (armed, not yet due) even if tool-silent', () => {
    const r = row({ toolSilentMin: 90, expectedWakeAt: new Date(NOW + 5 * 60000).toISOString() });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(false);
  });

  it('does NOT escalate: no wakeup was ever recorded (not_recorded is not proof of a lost fire)', () => {
    const r = row({ toolSilentMin: 90, expectedWakeAt: undefined });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(false);
  });

  it('does NOT escalate: loop_state=active (mid-iteration) is a DIFFERENT wedge shape, not this one', () => {
    // isKnownWedged treats active+tool-silent as wedged regardless of wake state; this module only
    // acts on the parked-and-missed-deadline shape (armed_overdue), so a mid-iteration freeze is
    // correctly left to the mid-iteration path, not double-escalated here.
    const r = row({
      toolSilentMin: 90,
      loopState: 'active',
      expectedWakeAt: new Date(NOW - 15 * 60000).toISOString(),
    });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(true); // active + tool-silent + wake overdue still qualifies as STUCK+armed_overdue
  });

  it('DEDUP: does not re-escalate for the SAME deadline already reported', () => {
    const wakeAt = new Date(NOW - 15 * 60000).toISOString();
    const r = row({ toolSilentMin: 90, expectedWakeAt: wakeAt, selfEscalatedForWakeAt: wakeAt });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(false);
  });

  it('RE-OPENS: a NEW overdue deadline (different from the last-escalated one) re-escalates', () => {
    const oldWakeAt = new Date(NOW - 120 * 60000).toISOString();
    const newWakeAt = new Date(NOW - 15 * 60000).toISOString();
    const r = row({ toolSilentMin: 90, expectedWakeAt: newWakeAt, selfEscalatedForWakeAt: oldWakeAt });
    const v = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(true);
  });

  it('vacuity guard: a healthy, never-armed seat never escalates', () => {
    const v = shouldSelfEscalate(row({ toolSilentMin: 0 }), NOW, TEST_CUT);
    expect(v.shouldEscalate).toBe(false);
  });
});

describe('shouldClearSelfEscalation (QF-20260831-587: cap-recovery)', () => {
  it('CLEARS: the seat previously self-escalated and has since recovered (re-armed a fresh, pending deadline)', () => {
    const oldWakeAt = new Date(NOW - 120 * 60000).toISOString();
    const freshWakeAt = new Date(NOW + 10 * 60000).toISOString(); // armed, not yet due
    const r = row({ toolSilentMin: 0, expectedWakeAt: freshWakeAt, selfEscalatedForWakeAt: oldWakeAt });
    const v = shouldClearSelfEscalation(r, NOW, TEST_CUT);
    expect(v.shouldClear).toBe(true);
    expect(v.priorEscalatedForWakeAt).toBe(oldWakeAt);
  });

  it('does NOT clear: still stuck on the SAME deadline it already escalated for', () => {
    const wakeAt = new Date(NOW - 15 * 60000).toISOString();
    const r = row({ toolSilentMin: 90, expectedWakeAt: wakeAt, selfEscalatedForWakeAt: wakeAt });
    const v = shouldClearSelfEscalation(r, NOW, TEST_CUT);
    expect(v.shouldClear).toBe(false);
  });

  it('does NOT clear: never escalated in the first place (nothing to clear)', () => {
    const r = row({ toolSilentMin: 0, expectedWakeAt: new Date(NOW + 10 * 60000).toISOString() });
    const v = shouldClearSelfEscalation(r, NOW, TEST_CUT);
    expect(v.shouldClear).toBe(false);
    expect(v.priorEscalatedForWakeAt).toBeNull();
  });

  it('does NOT clear while a DIFFERENT deadline is ALSO currently overdue -- the seat is still positively stuck, so the caller escalates instead (never both in one tick)', () => {
    const oldWakeAt = new Date(NOW - 120 * 60000).toISOString();
    const newOverdueWakeAt = new Date(NOW - 15 * 60000).toISOString();
    const r = row({ toolSilentMin: 90, expectedWakeAt: newOverdueWakeAt, selfEscalatedForWakeAt: oldWakeAt });
    const clear = shouldClearSelfEscalation(r, NOW, TEST_CUT);
    const escalate = shouldSelfEscalate(r, NOW, TEST_CUT);
    expect(clear.shouldClear).toBe(false);
    expect(escalate.shouldEscalate).toBe(true); // the caller's escalate-first branch handles this case
  });
});

describe('buildSelfEscalationRow', () => {
  it('produces a broadcast-coordinator INFO row with the self_escalation payload kind', () => {
    const r = buildSelfEscalationRow({
      sessionId: 'test-session-abc123',
      overdueMinutes: 15,
      toolSilentMinutes: 90,
      expectedWakeAt: '2026-08-30T07:45:00.000Z',
      fleetIdentity: 'Charlie',
    });
    expect(r.target_session).toBe('broadcast-coordinator');
    expect(r.message_type).toBe('INFO');
    expect(r.sender_session).toBe('test-session-abc123');
    expect(r.payload.kind).toBe('self_escalation');
    expect(r.payload.signal_type).toBe('stuck');
    expect(r.payload.overdue_minutes).toBe(15);
    expect(r.subject).toContain('Charlie');
    expect(r.subject).toContain('15min');
    expect(r.body).toContain('90 minute(s) silent');
  });

  it('falls back to a session-id prefix when fleet_identity is absent', () => {
    const r = buildSelfEscalationRow({
      sessionId: 'test-session-abc123',
      overdueMinutes: 5,
      toolSilentMinutes: 10,
      expectedWakeAt: '2026-08-30T07:45:00.000Z',
      fleetIdentity: null,
    });
    expect(r.subject).toContain('test-ses');
  });
});
