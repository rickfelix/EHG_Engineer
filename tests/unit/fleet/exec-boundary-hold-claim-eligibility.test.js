/**
 * SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 — claim-eligibility negative pin (FR-4/TR-3)
 * and both-fences precedence (TS-7).
 *
 * exec_boundary_hold is claim-ALLOWING by design: it must NEVER appear in
 * INELIGIBILITY_AXES or CLAIM_WRITE_FENCE_AXES. This file pins that exclusion at
 * both surfaces so a future edit cannot silently re-couple it into claim blocking.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyDispatchIneligibility,
  classifyAllDispatchIneligibility,
  CLAIM_WRITE_FENCE_AXES,
  execBoundaryHoldReason,
} from '../../../lib/fleet/claim-eligibility.cjs';

describe('SD-LEO-INFRA-PHASE-SCOPED-FENCE-001: execBoundaryHoldReason (pure reader)', () => {
  it('returns null when the flag is absent or false', () => {
    expect(execBoundaryHoldReason({ metadata: {} })).toBeNull();
    expect(execBoundaryHoldReason({ metadata: { exec_boundary_hold: false } })).toBeNull();
    expect(execBoundaryHoldReason(null)).toBeNull();
    expect(execBoundaryHoldReason(undefined)).toBeNull();
  });

  it('returns the reason + set-at when the flag is true', () => {
    const hold = execBoundaryHoldReason({
      metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'behind child B', exec_boundary_hold_set_at: '2026-07-12T00:00:00Z' },
    });
    expect(hold).toEqual({ reason: 'behind child B', setAt: '2026-07-12T00:00:00Z' });
  });

  it('defaults reason to "no reason recorded" and setAt to null when absent', () => {
    const hold = execBoundaryHoldReason({ metadata: { exec_boundary_hold: true } });
    expect(hold).toEqual({ reason: 'no reason recorded', setAt: null });
  });
});

describe('SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 FR-4/TS-3: claim-eligibility negative pin', () => {
  it('classifyDispatchIneligibility never returns exec_boundary_hold (first-match)', () => {
    const row = { sd_key: 'SD-FIXTURE-001', sd_type: 'infrastructure', metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'x' } };
    expect(classifyDispatchIneligibility(row)).toBeNull();
  });

  it('classifyAllDispatchIneligibility returns [] for an exec_boundary_hold-only SD (all-match)', () => {
    const row = { sd_key: 'SD-FIXTURE-001', sd_type: 'infrastructure', metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'x' } };
    expect(classifyAllDispatchIneligibility(row)).toEqual([]);
  });

  it('CLAIM_WRITE_FENCE_AXES does not contain exec_boundary_hold (static assertion)', () => {
    expect(CLAIM_WRITE_FENCE_AXES.has('exec_boundary_hold')).toBe(false);
    // SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: lead_blocker_active added as a 4th write-fence axis.
    // SD-LEO-INFRA-BELT-CLAIM-ELIGIBILITY-001: chairman_ratification_pending added as a 5th.
    expect([...CLAIM_WRITE_FENCE_AXES]).toEqual(['human_action_required', 'needs_coordinator_review', 'not_before_hold', 'lead_blocker_active', 'chairman_ratification_pending']);
  });

  it('a held SD with no OTHER ineligibility axis is fully claimable (regression baseline)', () => {
    const row = { sd_key: 'SD-FIXTURE-002', sd_type: 'feature', status: 'in_progress', metadata: { exec_boundary_hold: true } };
    expect(classifyDispatchIneligibility(row)).toBeNull();
    expect(classifyAllDispatchIneligibility(row)).toEqual([]);
  });
});

describe('SD-LEO-INFRA-PHASE-SCOPED-FENCE-001 TS-7: both fences set simultaneously (precedence)', () => {
  it('needs_coordinator_review still blocks claiming even when exec_boundary_hold is also set', () => {
    const row = {
      sd_key: 'SD-FIXTURE-003',
      sd_type: 'infrastructure',
      metadata: { needs_coordinator_review: true, exec_boundary_hold: true, exec_boundary_hold_reason: 'x' },
    };
    expect(classifyDispatchIneligibility(row)).toBe('needs_coordinator_review');
    const all = classifyAllDispatchIneligibility(row);
    expect(all).toContain('needs_coordinator_review');
    expect(all).not.toContain('exec_boundary_hold'); // never a real axis, present or not
  });

  it('requires_human_action still blocks claiming even when exec_boundary_hold is also set', () => {
    const row = {
      sd_key: 'SD-FIXTURE-004',
      sd_type: 'infrastructure',
      metadata: { requires_human_action: true, exec_boundary_hold: true },
    };
    expect(classifyDispatchIneligibility(row)).toBe('human_action_required');
  });
});
