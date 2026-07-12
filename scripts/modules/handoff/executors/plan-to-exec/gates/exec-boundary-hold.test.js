/**
 * Unit tests for EXEC_BOUNDARY_HOLD gate.
 * Part of SD-LEO-INFRA-PHASE-SCOPED-FENCE-001
 */

import { describe, it, expect } from 'vitest';
import { createExecBoundaryHoldGate } from './exec-boundary-hold.js';

describe('EXEC_BOUNDARY_HOLD gate', () => {
  it('has correct gate shape, required, and is exempt from the wait ceiling', () => {
    const gate = createExecBoundaryHoldGate();
    expect(gate.name).toBe('EXEC_BOUNDARY_HOLD');
    expect(gate.required).toBe(true);
    expect(gate.exemptFromWaitCeiling).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('passes when exec_boundary_hold is not set', async () => {
    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd: { metadata: {} } });
    expect(result.passed).toBe(true);
  });

  it('passes when exec_boundary_hold is false', async () => {
    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd: { metadata: { exec_boundary_hold: false } } });
    expect(result.passed).toBe(true);
  });

  it('TS-1: returns a named WAIT (not FAIL) when exec_boundary_hold=true, citing the reason', async () => {
    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({
      sd: { metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'parked behind SPINE child B' } },
    });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('parked behind SPINE child B');
    expect(result.issues).toEqual([]); // WAITs never carry issues (would read as a failure)
  });

  it('TS-2: passes again once the flag is cleared (no other change)', async () => {
    const gate = createExecBoundaryHoldGate();
    const held = await gate.validator({ sd: { metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'x' } } });
    expect(held.wait).toBe(true);

    const cleared = await gate.validator({
      sd: { metadata: { exec_boundary_hold: false, exec_boundary_hold_cleared_at: '2026-07-12T01:00:00Z', exec_boundary_hold_cleared_by: 'coordinator' } },
    });
    expect(cleared.passed).toBe(true);
  });

  it('defaults reason to "no reason recorded" when exec_boundary_hold_reason is absent', async () => {
    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd: { metadata: { exec_boundary_hold: true } } });
    expect(result.wait_reason).toContain('no reason recorded');
  });

  it('TS-6: an SD with no exec_boundary_hold flag at all (e.g. already past this handoff) is unaffected', async () => {
    // This gate only ever runs DURING the PLAN-TO-EXEC handoff itself -- there is no
    // code path that re-evaluates it against an SD already past EXEC, so "flag set on
    // an in-flight EXEC SD" cannot retroactively block anything by construction. This
    // test pins the base case: an ordinary SD row (no exec_boundary_hold key at all,
    // e.g. current_phase=EXEC) always passes.
    const gate = createExecBoundaryHoldGate();
    const result = await gate.validator({ sd: { current_phase: 'EXEC', metadata: {} } });
    expect(result.passed).toBe(true);
  });
});
