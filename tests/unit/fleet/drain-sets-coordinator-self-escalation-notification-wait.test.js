/**
 * QF-20260906-154: two kinds addressed to role=coordinator (self_escalation from
 * lib/fleet/self-wake-escalation.cjs, target_session='broadcast-coordinator'; and
 * notification_permission_wait from lib/hooks/notification-permission-wait-core.cjs) were in
 * no coordinator drain set -- invisible to the coordinator's inbox readers until
 * orphan-reroute-sweep rescued them (measured: rerouted 2x each in 14 days). Same defect
 * shape as the reaper-alert/sweep-finding gaps this drain set already carries fixes for.
 *
 * Per the coordinator's own framing when dispatching this QF: the useful check is not just
 * "are these two names present" but "does every kind a known emitter addresses to role=
 * coordinator appear in DRAIN_SETS.coordinator" -- so a future new coordinator-addressed
 * emitter that forgets registration is caught here too, not just these two specific kinds.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DRAIN_SETS } = require('../../../lib/fleet/worker-status.cjs');

describe('DRAIN_SETS.coordinator includes self_escalation and notification_permission_wait', () => {
  it('contains self_escalation (lib/fleet/self-wake-escalation.cjs, target_session=broadcast-coordinator)', () => {
    expect(DRAIN_SETS.coordinator).toContain('self_escalation');
  });

  it('contains notification_permission_wait (lib/hooks/notification-permission-wait-core.cjs)', () => {
    expect(DRAIN_SETS.coordinator).toContain('notification_permission_wait');
  });

  // Grounds the test against the real emitter's exact literal, not a guess at the spelling --
  // a future rename of either kind string breaks THIS assertion, not just silently drifts.
  it('the emitted kind literals match what the real emitter modules actually stamp', () => {
    const selfWake = require('../../../lib/fleet/self-wake-escalation.cjs');
    const row = selfWake.buildSelfEscalationRow({
      sessionId: 'test-session-id',
      overdueMinutes: 5,
      toolSilentMinutes: 3,
      expectedWakeAt: '2026-01-01T00:00:00.000Z',
    });
    expect(row.payload.kind).toBe('self_escalation');
    expect(row.target_session).toBe('broadcast-coordinator');
    expect(DRAIN_SETS.coordinator).toContain(row.payload.kind);
  });

  // Generalizes past the two named kinds: every kind a known coordinator-addressed emitter
  // stamps must be in the drain set, so a future addition here is caught the same way.
  it('every kind stamped by a known coordinator-addressed emitter is in DRAIN_SETS.coordinator', () => {
    const knownCoordinatorAddressedKinds = ['self_escalation', 'notification_permission_wait'];
    for (const kind of knownCoordinatorAddressedKinds) {
      expect(DRAIN_SETS.coordinator, `expected ${kind} to be in DRAIN_SETS.coordinator`).toContain(kind);
    }
  });
});
