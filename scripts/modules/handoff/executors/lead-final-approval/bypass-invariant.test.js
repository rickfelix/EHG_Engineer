/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D4 AC#2: the no-silent-bypass invariant, CI-asserted.
 */
import { describe, it, expect } from 'vitest';
import { findUnjoinedRequiredGateFailures } from './bypass-invariant.js';

describe('findUnjoinedRequiredGateFailures (FR-D4 no-silent-bypass invariant)', () => {
  it('no violation: a required-gate failure with a joinable bypass_ledger row', () => {
    const rows = [{ id: 'sph-1', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: false }] }];
    const ledger = [{ handoff_id: 'sph-1' }];
    expect(findUnjoinedRequiredGateFailures(rows, ledger)).toEqual([]);
  });

  it('VIOLATION: a required-gate failure with NO joinable bypass_ledger row', () => {
    const rows = [{ id: 'sph-2', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: false }] }];
    const violations = findUnjoinedRequiredGateFailures(rows, []);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({ handoff_id: 'sph-2', failing_gates: ['WIRE_CHECK_GATE'] });
  });

  it('no violation: a NON-required gate failing needs no bypass row', () => {
    const rows = [{ id: 'sph-3', gate_results: [{ name: 'SMOKE_TEST_GATE', required: false, passed: false }] }];
    expect(findUnjoinedRequiredGateFailures(rows, [])).toEqual([]);
  });

  it('no violation: all required gates passed', () => {
    const rows = [{ id: 'sph-4', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: true }] }];
    expect(findUnjoinedRequiredGateFailures(rows, [])).toEqual([]);
  });

  it('matches STRICTLY by handoff_id -- a bypass_ledger row for a DIFFERENT handoff does not satisfy it', () => {
    const rows = [{ id: 'sph-5', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: false }] }];
    const ledger = [{ handoff_id: 'sph-999-some-other-row' }];
    const violations = findUnjoinedRequiredGateFailures(rows, ledger);
    expect(violations).toHaveLength(1);
    expect(violations[0].handoff_id).toBe('sph-5');
  });

  it('a bypass_ledger row with a null handoff_id (the pre-fix, unjoined shape) does NOT satisfy any row', () => {
    const rows = [{ id: 'sph-6', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: false }] }];
    const ledger = [{ handoff_id: null }];
    expect(findUnjoinedRequiredGateFailures(rows, ledger)).toHaveLength(1);
  });

  it('names every distinct failing required gate on a row with multiple failures', () => {
    const rows = [{
      id: 'sph-7',
      gate_results: [
        { name: 'WIRE_CHECK_GATE', required: true, passed: false },
        { name: 'PR_MERGE_VERIFICATION', required: true, passed: false },
        { name: 'SMOKE_TEST_GATE', required: false, passed: false },
      ],
    }];
    const violations = findUnjoinedRequiredGateFailures(rows, []);
    expect(violations[0].failing_gates.sort()).toEqual(['PR_MERGE_VERIFICATION', 'WIRE_CHECK_GATE']);
  });

  it('reproduces the measured 22/22-holds shape across a small mixed sample', () => {
    const rows = [
      { id: 'sph-a', gate_results: [{ name: 'WIRE_CHECK_GATE', required: true, passed: true }] }, // clean pass
      { id: 'sph-b', gate_results: [{ name: 'PR_MERGE_VERIFICATION', required: true, passed: false }] }, // bypassed
      { id: 'sph-c', gate_results: [{ name: 'SMOKE_TEST_GATE', required: false, passed: false }] }, // non-required fail
    ];
    const ledger = [{ handoff_id: 'sph-b' }];
    expect(findUnjoinedRequiredGateFailures(rows, ledger)).toEqual([]);
  });

  it('TESTING finding: a required_effective:false override (deliberate warn-only, e.g. FR_DELIVERY_VERIFICATION off) is NOT a violation even without a bypass row', () => {
    const rows = [{
      id: 'sph-8',
      gate_results: [{ name: 'FR_DELIVERY_VERIFICATION', required: true, required_effective: false, passed: false }],
    }];
    expect(findUnjoinedRequiredGateFailures(rows, [])).toEqual([]);
  });

  it('a gate that IS actually enforced (required_effective:true or absent) and fails still needs a bypass row', () => {
    const rows = [{
      id: 'sph-9',
      gate_results: [{ name: 'FR_DELIVERY_VERIFICATION', required: true, required_effective: true, passed: false }],
    }];
    expect(findUnjoinedRequiredGateFailures(rows, [])).toHaveLength(1);
  });

  it('handles empty/missing gate_results and empty ledger without throwing', () => {
    expect(findUnjoinedRequiredGateFailures([], [])).toEqual([]);
    expect(findUnjoinedRequiredGateFailures([{ id: 'sph-x' }], [])).toEqual([]);
    expect(findUnjoinedRequiredGateFailures(undefined, undefined)).toEqual([]);
  });
});
