// SD-ARCH-HOTSPOT-CHECKIN-001: contract tests for the resolveCheckin step pipeline.
// Pins (i) the registry order, (ii) the step shape, (iii) runSteps short-circuit +
// applies() skip semantics, (iv) throw propagation (the runner must never swallow).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runSteps } = require('../../lib/checkin/pipeline.cjs');
const CHECKIN_STEPS = require('../../lib/checkin/steps/index.cjs');

describe('checkin step registry (lib/checkin/steps/index.cjs)', () => {
  it('exports the documented steps in the documented order', () => {
    expect(CHECKIN_STEPS.map((s) => s.name)).toEqual([
      'model-effort-merge',
      'quarantine-self-clear',
      'callsign-rehydrate',
      'roll-call',
      'resume',
      'build-forbidden-guard',
      'directed-assignment',
      'recover-stranded-final',
      'adopt-orphan',
      'drain-reservations',
      'self-claim-gates',
      'critical-qf-jump',
      'merged-pool-self-claim',
      'self-claim-qf',
      'idle',
    ]);
    expect(CHECKIN_STEPS.length).toBeGreaterThanOrEqual(6);
  });

  it('every step has a name and a run function', () => {
    for (const step of CHECKIN_STEPS) {
      expect(typeof step.name).toBe('string');
      expect(step.name.length).toBeGreaterThan(0);
      expect(typeof step.run).toBe('function');
    }
  });
});

describe('runSteps (lib/checkin/pipeline.cjs)', () => {
  it('short-circuits on a truthy return and skips steps whose applies() is false', async () => {
    const ran = [];
    const steps = [
      { name: 'a', run: async (ctx) => { ran.push('a'); ctx.touched = true; } },           // falsy -> continue
      { name: 'skipped', applies: () => false, run: async () => { ran.push('skipped'); } }, // applies false -> skipped
      { name: 'b', run: async () => { ran.push('b'); return { action: 'done' }; } },        // truthy -> short-circuit
      { name: 'never', run: async () => { ran.push('never'); } },                            // must not run
    ];
    const ctx = {};
    const result = await runSteps(steps, ctx);
    expect(result).toEqual({ action: 'done' });
    expect(ran).toEqual(['a', 'b']);
    expect(ctx.touched).toBe(true); // ctx mutations by earlier steps are visible downstream
  });

  it('returns undefined when no step short-circuits', async () => {
    const result = await runSteps([{ name: 'a', run: async () => {} }], {});
    expect(result).toBeUndefined();
  });

  it('propagates a step throw (no swallowing)', async () => {
    const boom = new Error('step exploded');
    const steps = [
      { name: 'a', run: async () => {} },
      { name: 'thrower', run: async () => { throw boom; } },
      { name: 'never', run: async () => { throw new Error('must not reach'); } },
    ];
    await expect(runSteps(steps, {})).rejects.toThrow('step exploded');
  });
});
