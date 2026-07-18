/**
 * Unit tests for the switchon_action branch of the EXEC_BOUNDARY_HOLD gate.
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-D FR-1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const authorizeSwitchOn = vi.fn();
const runSwitchOnPrechecks = vi.fn();
const notifySwitchOnDecisionPacket = vi.fn();

vi.mock('../../../../../../lib/switch-automation/switchon-precheck-gate.js', () => ({
  authorizeSwitchOn: (...args) => authorizeSwitchOn(...args),
}));
vi.mock('../../../../../../lib/switch-automation/switchon-prechecks.js', () => ({
  runSwitchOnPrechecks: (...args) => runSwitchOnPrechecks(...args),
}));
vi.mock('../../../../../../lib/switch-automation/switchon-decision-packet.js', () => ({
  notifySwitchOnDecisionPacket: (...args) => notifySwitchOnDecisionPacket(...args),
}));

const { createExecBoundaryHoldGate } = await import('./exec-boundary-hold.js');

function makeSd(overrides = {}) {
  return {
    sd_key: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A',
    metadata: {
      exec_boundary_hold: true,
      exec_boundary_hold_reason: 'chairman-gated',
      switchon_action: 'live-venture-deploy',
      ...overrides,
    },
  };
}

function makeSupabase(updateImpl = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })) {
  return { from: vi.fn().mockReturnValue({ update: updateImpl }) };
}

beforeEach(() => {
  authorizeSwitchOn.mockReset();
  runSwitchOnPrechecks.mockReset();
  notifySwitchOnDecisionPacket.mockReset().mockResolvedValue({ recorded: true, id: 'dec-1' });
});

describe('EXEC_BOUNDARY_HOLD gate — switchon_action branch', () => {
  it('gate config (required, exemptFromWaitCeiling) is unchanged whether or not switchon_action is present', () => {
    const withAction = createExecBoundaryHoldGate(makeSupabase());
    const withoutAction = createExecBoundaryHoldGate();
    for (const gate of [withAction, withoutAction]) {
      expect(gate.name).toBe('EXEC_BOUNDARY_HOLD');
      expect(gate.required).toBe(true);
      expect(gate.exemptFromWaitCeiling).toBe(true);
    }
  });

  it('TS-2: never-auto action never auto-clears, WAITs, and dispatches the decision packet exactly once', async () => {
    authorizeSwitchOn.mockReturnValue({ authorized: false, neverAuto: true, reason: 'never-auto:live-venture-deploy' });
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({ sd: makeSd() });

    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(runSwitchOnPrechecks).not.toHaveBeenCalled();
    expect(notifySwitchOnDecisionPacket).toHaveBeenCalledTimes(1);
    expect(notifySwitchOnDecisionPacket).toHaveBeenCalledWith(supabase, expect.objectContaining({
      sdKey: 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A',
      action: 'live-venture-deploy',
    }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('TS-3: reversible + in-role + prechecks allPassed=true auto-clears with the full pass shape', async () => {
    authorizeSwitchOn.mockReturnValue({ authorized: true, neverAuto: false, reasons: [] });
    runSwitchOnPrechecks.mockResolvedValue({ allPassed: true, results: {}, blockingIds: [] });
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) });
    const supabase = makeSupabase(updateSpy);
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({
      sd: makeSd({ switchon_action: 'some-reversible-class', switchon_reversible: true, switchon_in_role: true }),
    });

    expect(result).toEqual({ passed: true, score: 100, max_score: 100, issues: [], warnings: [] });
    expect(notifySwitchOnDecisionPacket).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updatePayload = updateSpy.mock.calls[0][0];
    expect(updatePayload.metadata.exec_boundary_hold).toBe(false);
    expect(updatePayload.metadata.exec_boundary_hold_cleared_by).toBe('switchon-gate-auto');
  });

  it('authorized:true but prechecks allPassed=false does NOT auto-clear (predicate is the .allPassed field)', async () => {
    authorizeSwitchOn.mockReturnValue({ authorized: true, neverAuto: false, reasons: [] });
    runSwitchOnPrechecks.mockResolvedValue({ allPassed: false, results: {}, blockingIds: ['revert-path'] });
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({ sd: makeSd({ switchon_reversible: true, switchon_in_role: true }) });

    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(notifySwitchOnDecisionPacket).toHaveBeenCalledTimes(1);
  });

  it('TS-7: authorizeSwitchOn throw fails closed (WAIT + packet, never authorized)', async () => {
    authorizeSwitchOn.mockImplementation(() => { throw new Error('boom'); });
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({ sd: makeSd() });

    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(runSwitchOnPrechecks).not.toHaveBeenCalled();
    expect(notifySwitchOnDecisionPacket).toHaveBeenCalledTimes(1);
  });

  it('TS-7b: runSwitchOnPrechecks rejection fails closed (WAIT + packet, never authorized)', async () => {
    authorizeSwitchOn.mockReturnValue({ authorized: true, neverAuto: false, reasons: [] });
    runSwitchOnPrechecks.mockRejectedValue(new Error('precheck db error'));
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({ sd: makeSd({ switchon_reversible: true, switchon_in_role: true }) });

    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(notifySwitchOnDecisionPacket).toHaveBeenCalledTimes(1);
  });

  it('TS-8: notifySwitchOnDecisionPacket rejection never crashes the gate — still WAITs, no throw', async () => {
    authorizeSwitchOn.mockReturnValue({ authorized: false, neverAuto: true, reason: 'never-auto' });
    notifySwitchOnDecisionPacket.mockRejectedValue(new Error('insert failed'));
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);

    const result = await gate.validator({ sd: makeSd() });
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
  });

  it('absent switchon_action falls back to the pure manual-park path (no evaluator calls at all)', async () => {
    const supabase = makeSupabase();
    const gate = createExecBoundaryHoldGate(supabase);
    const result = await gate.validator({
      sd: { sd_key: 'SD-X', metadata: { exec_boundary_hold: true, exec_boundary_hold_reason: 'manual' } },
    });

    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('manual');
    expect(authorizeSwitchOn).not.toHaveBeenCalled();
    expect(notifySwitchOnDecisionPacket).not.toHaveBeenCalled();
  });
});
