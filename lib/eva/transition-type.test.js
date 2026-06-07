import { describe, it, expect } from 'vitest';
import { toValidTransitionType, VALID_TRANSITION_TYPES } from './transition-type.js';

/**
 * SD-FDBK-ENH-VENTURE-STAGE-TRANSITIONS-001
 * Regression guard: governance_override advances used to write
 * transition_type='governance_override', violating the
 * venture_stage_transitions_transition_type_check constraint so the audit row was
 * silently dropped. toValidTransitionType maps every internal advancementType to a
 * value the CHECK constraint accepts.
 */
describe('toValidTransitionType (SD-FDBK-ENH-VENTURE-STAGE-TRANSITIONS-001)', () => {
  it('maps governance_override to a valid enum (skip), not the literal value', () => {
    expect(toValidTransitionType('governance_override')).toBe('skip');
  });

  it('keeps normal as normal', () => {
    expect(toValidTransitionType('normal')).toBe('normal');
  });

  it('maps non-enum internal advancement types to normal', () => {
    for (const t of ['auto_approved', 're_entry', 'pre_exec_skip', 'pre_exec_skip_trigger', 's19_bridge_cleared']) {
      expect(toValidTransitionType(t)).toBe('normal');
    }
  });

  it('passes through values that are already valid enum members', () => {
    expect(toValidTransitionType('skip')).toBe('skip');
    expect(toValidTransitionType('rollback')).toBe('rollback');
    expect(toValidTransitionType('pivot')).toBe('pivot');
  });

  it('defaults unknown / nullish input to normal', () => {
    expect(toValidTransitionType('something_new')).toBe('normal');
    expect(toValidTransitionType(undefined)).toBe('normal');
    expect(toValidTransitionType(null)).toBe('normal');
    expect(toValidTransitionType('')).toBe('normal');
  });

  it('always returns a constraint-valid transition_type', () => {
    const inputs = ['governance_override', 'normal', 'auto_approved', 're_entry', 'pre_exec_skip', 'skip', 'rollback', 'pivot', 'xyz', undefined];
    for (const i of inputs) {
      expect(VALID_TRANSITION_TYPES).toContain(toValidTransitionType(i));
    }
  });
});
