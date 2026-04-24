/**
 * QF-20260423-909: Guard stale-session-sweep against pending_approval reset.
 *
 * Mirrors the decision logic inside scripts/stale-session-sweep.cjs section 3d
 * (QA — detect SDs stuck in pending_approval with no claiming session) to
 * validate that an SD with an accepted PLAN-TO-LEAD handoff is never reset
 * to draft/LEAD/0%, while an SD without such a handoff still gets reset.
 *
 * The test pattern follows tests/unit/fleet-liveness-sweep-gate.test.js —
 * replicate the gate rules here rather than stubbing supabase in production.
 */

import { describe, it, expect } from 'vitest';

function decideReset(sd, { acceptedPlanToLeadSet = new Set() } = {}) {
  if (acceptedPlanToLeadSet.has(sd.sd_key) || acceptedPlanToLeadSet.has(sd.id)) {
    return { action: 'SKIP', reason: 'PLAN_TO_LEAD_ACCEPTED' };
  }
  if (sd.progress_percentage >= 100 && sd.completion_date) {
    return { action: 'COMPLETE', reason: 'STUCK_100_WITH_COMPLETION_DATE' };
  }
  return { action: 'RESET', reason: 'PENDING_APPROVAL_NO_HANDOFF' };
}

describe('stale-session-sweep — pending_approval guard (QF-20260423-909)', () => {
  it('SKIP: accepted PLAN-TO-LEAD handoff keyed by sd_key', () => {
    const sd = { id: 'uuid-1', sd_key: 'SD-FOO-001', progress_percentage: 50, completion_date: null };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set(['SD-FOO-001']) });
    expect(d.action).toBe('SKIP');
    expect(d.reason).toBe('PLAN_TO_LEAD_ACCEPTED');
  });

  it('SKIP: accepted PLAN-TO-LEAD handoff keyed by UUID (sd_phase_handoffs.sd_id can hold either)', () => {
    const sd = { id: 'eca90cd8-f81c-40f6-b479-25bed230007b', sd_key: 'SD-BAR-002', progress_percentage: 50, completion_date: null };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set(['eca90cd8-f81c-40f6-b479-25bed230007b']) });
    expect(d.action).toBe('SKIP');
    expect(d.reason).toBe('PLAN_TO_LEAD_ACCEPTED');
  });

  it('RESET: no handoff signal, progress < 100 ⇒ genuine stuck state', () => {
    const sd = { id: 'uuid-3', sd_key: 'SD-BAZ-003', progress_percentage: 40, completion_date: null };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set() });
    expect(d.action).toBe('RESET');
    expect(d.reason).toBe('PENDING_APPROVAL_NO_HANDOFF');
  });

  it('COMPLETE: progress=100 with completion_date ⇒ existing STUCK_100 fix takes precedence over RESET', () => {
    const sd = { id: 'uuid-4', sd_key: 'SD-DONE-004', progress_percentage: 100, completion_date: '2026-04-24T00:00:00Z' };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set() });
    expect(d.action).toBe('COMPLETE');
    expect(d.reason).toBe('STUCK_100_WITH_COMPLETION_DATE');
  });

  it('SKIP precedes COMPLETE — handoff-accepted signal wins even at 100% (defensive: never reset, never double-transition)', () => {
    const sd = { id: 'uuid-5', sd_key: 'SD-EDGE-005', progress_percentage: 100, completion_date: '2026-04-24T00:00:00Z' };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set(['SD-EDGE-005']) });
    expect(d.action).toBe('SKIP');
    expect(d.reason).toBe('PLAN_TO_LEAD_ACCEPTED');
  });

  it('RESET: unrelated SD key in the set does not match (no false positive)', () => {
    const sd = { id: 'uuid-6', sd_key: 'SD-OTHER-006', progress_percentage: 50, completion_date: null };
    const d = decideReset(sd, { acceptedPlanToLeadSet: new Set(['SD-FOO-001', 'SD-BAR-002']) });
    expect(d.action).toBe('RESET');
  });
});
