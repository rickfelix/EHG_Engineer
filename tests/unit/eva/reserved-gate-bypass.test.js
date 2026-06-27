/**
 * SD-LEO-INFRA-RESERVED-GATE-BYPASS-001 — regression tests.
 *
 * FR-1 shouldOpenChairmanGate isDecisionGate (decision-creating stage opens the gate)
 * FR-2 canAdvancePastBuildCheckpoint (S19 build-checkpoint hard invariant)
 * FR-3 findGateDecisionViolations (reconciliation guard)
 */
import { describe, it, expect } from 'vitest';
import { shouldOpenChairmanGate, canAdvancePastBuildCheckpoint } from '../../../lib/eva/should-open-chairman-gate.js';
import { findGateDecisionViolations } from '../../../lib/eva/reconcile-gate-decisions.mjs';

describe('FR-1 shouldOpenChairmanGate — decision-creating gate', () => {
  it('opens for a decision-creating stage even when it is not a hard gate', () => {
    // S18-shaped: artifact_only promotion gate -> isHardGate false but isDecisionGate true
    expect(shouldOpenChairmanGate({ isHardGate: false, isDecisionGate: true, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(true);
  });

  it('still does NOT open for a failed stage with no governance override (no content-less gate)', () => {
    expect(shouldOpenChairmanGate({ isHardGate: false, isDecisionGate: true, stageFailed: true, canGovernanceOverrideFailed: false })).toBe(false);
  });

  it('is byte-identical for callers that omit isDecisionGate (backward compatible)', () => {
    // old behavior: opens only for hard gates
    expect(shouldOpenChairmanGate({ isHardGate: true, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(true);
    expect(shouldOpenChairmanGate({ isHardGate: false, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(false);
  });

  it('opens for a hard gate regardless of isDecisionGate', () => {
    expect(shouldOpenChairmanGate({ isHardGate: true, isDecisionGate: false, stageFailed: false, canGovernanceOverrideFailed: false })).toBe(true);
  });
});

describe('FR-2 canAdvancePastBuildCheckpoint — S19 hard invariant', () => {
  it('refuses to advance on the leo_bridge build-readiness gate alone (no chairman approval)', () => {
    expect(canAdvancePastBuildCheckpoint({ buildComplete: true, hasApprovedChairmanDecision: false })).toBe(false);
  });

  it('refuses when chairman approved but build not ready', () => {
    expect(canAdvancePastBuildCheckpoint({ buildComplete: false, hasApprovedChairmanDecision: true })).toBe(false);
  });

  it('advances only when BOTH build-ready AND chairman-approved', () => {
    expect(canAdvancePastBuildCheckpoint({ buildComplete: true, hasApprovedChairmanDecision: true })).toBe(true);
  });
});

describe('FR-3 findGateDecisionViolations — reconciliation guard', () => {
  const GATED = [18, 19];

  it('flags a venture past a gated stage with no chairman_decision', () => {
    const ventures = [{ id: 'v1', current_lifecycle_stage: 20 }]; // passed 18 and 19
    const decisions = [{ venture_id: 'v1', lifecycle_stage: 19 }]; // has 19 but NOT 18
    const violations = findGateDecisionViolations(ventures, decisions, GATED);
    expect(violations).toEqual([{ venture_id: 'v1', stage: 18 }]);
  });

  it('reports zero for a venture with all gate decisions present', () => {
    const ventures = [{ id: 'v1', current_lifecycle_stage: 20 }];
    const decisions = [{ venture_id: 'v1', lifecycle_stage: 18 }, { venture_id: 'v1', lifecycle_stage: 19 }];
    expect(findGateDecisionViolations(ventures, decisions, GATED)).toEqual([]);
  });

  it('does not flag a gated stage the venture is still AT or before (not yet passed)', () => {
    const ventures = [{ id: 'v1', current_lifecycle_stage: 18 }]; // at 18, has not passed it
    expect(findGateDecisionViolations(ventures, [], GATED)).toEqual([]);
  });

  it('handles multiple ventures and multiple gated stages', () => {
    const ventures = [
      { id: 'a', current_lifecycle_stage: 21 }, // passed 18 + 19
      { id: 'b', current_lifecycle_stage: 19 }, // passed 18 only
    ];
    const decisions = [{ venture_id: 'a', lifecycle_stage: 18 }]; // a missing 19; b missing 18
    const violations = findGateDecisionViolations(ventures, decisions, GATED);
    expect(violations).toContainEqual({ venture_id: 'a', stage: 19 });
    expect(violations).toContainEqual({ venture_id: 'b', stage: 18 });
    expect(violations).toHaveLength(2);
  });
});
