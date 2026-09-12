// SD-LEO-INFRA-WIRE-MODEL-POLICY-001 FR-1 — SessionStart model-policy mismatch signal.
//
// Deliberately a *.test.js file, not *.test.cjs: prospective/PLAN-TO-EXEC testing-agent evidence
// measured that vitest's CI config (both hooks-harness-tests.yml and unit-tier.yml) only collects
// *.test.js — three pre-existing *.test.cjs suites in this directory are dark (never collected).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signalModelPolicyMismatch } from '../../../scripts/hooks/capture-session-id.cjs';

describe('signalModelPolicyMismatch (SD-LEO-INFRA-WIRE-MODEL-POLICY-001 FR-1)', () => {
  let originalKillSwitch;
  let originalDryRun;

  beforeEach(() => {
    originalKillSwitch = process.env.LEO_MODEL_POLICY_SIGNAL;
    originalDryRun = process.env.LEO_HOOK_DRY_RUN;
    delete process.env.LEO_MODEL_POLICY_SIGNAL;
    delete process.env.LEO_HOOK_DRY_RUN;
  });

  afterEach(() => {
    if (originalKillSwitch === undefined) delete process.env.LEO_MODEL_POLICY_SIGNAL;
    else process.env.LEO_MODEL_POLICY_SIGNAL = originalKillSwitch;
    if (originalDryRun === undefined) delete process.env.LEO_HOOK_DRY_RUN;
    else process.env.LEO_HOOK_DRY_RUN = originalDryRun;
  });

  // TS-1 / TS-1b: hadPriorRow=false covers every "cannot classify" state identically.
  it('never signals when hadPriorRow is false (no prior row / GET failure / malformed metadata)', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: false, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  // TS-2: the measured false positive on the live coordinator seat must be fixed.
  it('does NOT signal a coordinator-shaped session (is_coordinator:true, no role string) observed on its correct Fable policy model', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: { is_coordinator: true }, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it('a coordinator-shaped session observed on a worker model DOES signal (it is genuinely off-policy)', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: { is_coordinator: true }, hadPriorRow: true, model: 'claude-sonnet-5', emit });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].metadata).toMatchObject({ verdict: 'role', expected_model: 'claude-fable-5-1', observed_model: 'claude-sonnet-5' });
  });

  // TS-3: worker classification and dedup delegation.
  it('signals a worker session (no role/is_coordinator/non_fleet) observed running a Fable-family model', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0][0];
    expect(call.metadata).toMatchObject({ verdict: 'worker', expected_model: 'claude-opus-5', observed_model: 'claude-fable-5-1' });
    expect(call.dedup_key).toMatch(/^model-policy-mismatch:worker:\d{4}-\d{2}-\d{2}$/);
  });

  it('a worker session observed running its own policy model (opus) never signals', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'claude-opus-5', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it('a role session (explicit role string) observed running its policy model (Fable) never signals', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: { role: 'solomon' }, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it('an unknown/malformed role string is classified unknown and never signals', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: { role: '   ' }, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it('an absent/unrecognized observed model never signals (cannot compare)', async () => {
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: undefined, emit });
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'some-unreleased-model-xyz', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  // TS-4: fail-open on a throwing emit -- verified at the caller (main()) level too, but this
  // proves the function itself does not swallow/mutate the error in a way that would surprise
  // the try/catch wrapping it at the call site.
  it('propagates an emit failure to its caller rather than swallowing it silently', async () => {
    const emit = vi.fn().mockRejectedValue(new Error('feedback insert failed'));
    await expect(
      signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'claude-fable-5-1', emit }),
    ).rejects.toThrow('feedback insert failed');
  });

  // TS-5: kill switch.
  it('LEO_MODEL_POLICY_SIGNAL=0 suppresses the check entirely, before any classification', async () => {
    process.env.LEO_MODEL_POLICY_SIGNAL = '0';
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  // TS-5b: this function's OWN dry-run guard, independent of any early-return elsewhere in the hook.
  it('LEO_HOOK_DRY_RUN=1 suppresses the check entirely, even with a genuine off-policy worker', async () => {
    process.env.LEO_HOOK_DRY_RUN = '1';
    const emit = vi.fn();
    await signalModelPolicyMismatch({ existingMetadata: {}, hadPriorRow: true, model: 'claude-fable-5-1', emit });
    expect(emit).not.toHaveBeenCalled();
  });

  it('never calls lib/fleet/model-policy.cjs\'s checkModelMismatch or seatClassFor (the banned collapse-to-worker path)', async () => {
    // Structural guard: read the source and assert those two names never appear in this function's
    // body, so a future edit cannot silently reintroduce the false-positive class this SD fixes.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../scripts/hooks/capture-session-id.cjs', import.meta.url), 'utf8');
    const fnStart = src.indexOf('async function signalModelPolicyMismatch');
    const fnBody = src.slice(fnStart, src.indexOf('\nfunction main()'));
    expect(fnBody).not.toMatch(/checkModelMismatch/);
    expect(fnBody).not.toMatch(/seatClassFor/);
  });
});
