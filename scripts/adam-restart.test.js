import { describe, it, expect } from 'vitest';
const { runAdamRestart } = require('./adam-restart.cjs');

function passingDeps(overrides = {}) {
  return {
    checkFreshness: async () => ({ verdict: 'FRESH' }),
    regenerateContract: async () => ({ ok: true, file: 'CLAUDE_ADAM.md' }),
    register: async () => ({ ok: true, action: 'registered', retired: [], drained: 0 }),
    canary: async () => ({ ok: true, coordinator_id: 'coord-1' }),
    ...overrides,
  };
}

describe('runAdamRestart existing behavior (unchanged without deps.relaunch)', () => {
  it('passes end-to-end exactly as before when deps.relaunch is absent', async () => {
    const r = await runAdamRestart(passingDeps());
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('PASS');
    expect(r.steps.find((s) => s.step === 'relaunch')).toBeUndefined();
  });
});

describe('runAdamRestart RELAUNCH extension point (FR-4, optional/advisory)', () => {
  it('records a relaunch step when deps.relaunch is provided, and still completes PASS', async () => {
    let relaunchCalled = false;
    const deps = passingDeps({
      relaunch: async () => {
        relaunchCalled = true;
        return { worktreePath: '/tmp/fake-worktree', branch: 'adhoc/singleton-adam-x', freshness: { verdict: 'FRESH' } };
      },
    });
    const r = await runAdamRestart(deps);
    expect(relaunchCalled).toBe(true);
    expect(r.ok).toBe(true);
    const step = r.steps.find((s) => s.step === 'relaunch');
    expect(step).toBeDefined();
    expect(step.ok).toBe(true);
    expect(step.detail.worktreePath).toBe('/tmp/fake-worktree');
    // register/canary still ran, unmodified
    expect(r.steps.find((s) => s.step === 'register').ok).toBe(true);
    expect(r.steps.find((s) => s.step === 'canary').ok).toBe(true);
  });

  it('a failing relaunch is fail-soft (advisory) — does not block regenerate/register/canary', async () => {
    const deps = passingDeps({ relaunch: async () => { throw new Error('worktree quota exceeded'); } });
    const r = await runAdamRestart(deps);
    expect(r.ok).toBe(true);
    const step = r.steps.find((s) => s.step === 'relaunch');
    expect(step.ok).toBe(false);
    expect(step.detail.warn).toMatch(/fail-soft/);
    expect(r.steps.find((s) => s.step === 'register').ok).toBe(true);
  });
});
