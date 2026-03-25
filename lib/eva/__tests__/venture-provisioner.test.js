import { describe, it, expect, vi } from 'vitest';
import { provisionVenture } from '../bridge/venture-provisioner.js';

const noop = () => {};

function makeStep(name, { alreadyDone = false, shouldFail = false, failCount = 0 } = {}) {
  let callCount = 0;
  return {
    name,
    check: vi.fn(async (ctx) => alreadyDone || ctx.stepsCompleted.includes(name)),
    execute: vi.fn(async () => {
      callCount++;
      if (shouldFail) throw new Error(`${name} permanent failure`);
      if (failCount > 0 && callCount <= failCount) throw new Error(`${name} transient failure`);
    }),
  };
}

describe('provisionVenture', () => {
  it('executes all steps on fresh venture', async () => {
    const steps = [makeStep('step_a'), makeStep('step_b'), makeStep('step_c')];
    const result = await provisionVenture('venture-1', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toEqual(['step_a', 'step_b', 'step_c']);
    expect(result.stepsSkipped).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(steps[0].execute).toHaveBeenCalledOnce();
    expect(steps[1].execute).toHaveBeenCalledOnce();
    expect(steps[2].execute).toHaveBeenCalledOnce();
  });

  it('skips already-completed steps (idempotency)', async () => {
    const steps = [
      makeStep('step_a', { alreadyDone: true }),
      makeStep('step_b', { alreadyDone: true }),
      makeStep('step_c'),
    ];
    const result = await provisionVenture('venture-2', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toEqual(['step_c']);
    expect(result.stepsSkipped).toEqual(['step_a', 'step_b']);
    expect(steps[0].execute).not.toHaveBeenCalled();
    expect(steps[1].execute).not.toHaveBeenCalled();
    expect(steps[2].execute).toHaveBeenCalledOnce();
  });

  it('returns no-op when all steps already done', async () => {
    const steps = [
      makeStep('step_a', { alreadyDone: true }),
      makeStep('step_b', { alreadyDone: true }),
    ];
    const result = await provisionVenture('venture-3', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toHaveLength(0);
    expect(result.stepsSkipped).toEqual(['step_a', 'step_b']);
  });

  it('retries transient failures and succeeds', async () => {
    const steps = [makeStep('step_a'), makeStep('step_b', { failCount: 2 })];
    const result = await provisionVenture('venture-4', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toEqual(['step_a', 'step_b']);
    // step_b should have been called 3 times (2 failures + 1 success)
    expect(steps[1].execute).toHaveBeenCalledTimes(3);
  });

  it('fails after exhausting retries', async () => {
    const steps = [makeStep('step_a'), makeStep('step_b', { shouldFail: true })];
    const result = await provisionVenture('venture-5', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(false);
    expect(result.stepsCompleted).toEqual(['step_a']);
    expect(result.error).toContain('step_b');
    expect(result.error).toContain('3 attempts');
  });

  it('stops at first failure without executing later steps', async () => {
    const steps = [
      makeStep('step_a'),
      makeStep('step_b', { shouldFail: true }),
      makeStep('step_c'),
    ];
    const result = await provisionVenture('venture-6', { steps, skipStateTracking: true, logger: noop });

    expect(result.success).toBe(false);
    expect(result.stepsCompleted).toEqual(['step_a']);
    expect(steps[2].execute).not.toHaveBeenCalled();
  });

  it('recovery after partial failure: second run picks up from failed step', async () => {
    // First run: step_a succeeds, step_b fails
    const stepA = makeStep('step_a');
    const stepB_fail = makeStep('step_b', { shouldFail: true });
    const stepC = makeStep('step_c');
    await provisionVenture('venture-7', { steps: [stepA, stepB_fail, stepC], skipStateTracking: true, logger: noop });

    // Second run: step_a already done (simulated), step_b now succeeds
    const stepA2 = makeStep('step_a', { alreadyDone: true });
    const stepB2 = makeStep('step_b'); // Now succeeds
    const stepC2 = makeStep('step_c');
    const result = await provisionVenture('venture-7', { steps: [stepA2, stepB2, stepC2], skipStateTracking: true, logger: noop });

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toEqual(['step_b', 'step_c']);
    expect(result.stepsSkipped).toEqual(['step_a']);
  });

  it('passes ventureId in context', async () => {
    let capturedCtx = null;
    const steps = [{
      name: 'capture',
      check: async () => false,
      execute: async (ctx) => { capturedCtx = ctx; },
    }];
    await provisionVenture('venture-ctx', { steps, skipStateTracking: true, logger: noop });
    expect(capturedCtx.ventureId).toBe('venture-ctx');
  });

  it('exports provisionVenture as a function', () => {
    expect(typeof provisionVenture).toBe('function');
  });
});
