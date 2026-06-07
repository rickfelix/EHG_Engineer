/**
 * Unit tests (no DB) for the auto-execution engine control loop.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001C.
 */
import { describe, it, expect } from 'vitest';
import {
  runAutoExec,
  makeSyntheticAction,
  rehearseRollback,
  completeSyntheticPolicy,
} from '../lib/auto-exec-engine.js';

const POLICY = completeSyntheticPolicy();

// An audit recorder stub.
function recorder() {
  const rows = [];
  const audit = async (r) => { rows.push(r); };
  audit.rows = rows;
  return audit;
}

describe('FM-A default-OFF golden path', () => {
  it('flag OFF is a pure no-op: no audit, no mutation', async () => {
    const action = makeSyntheticAction({});
    const audit = recorder();
    const r = await runAutoExec(action, { flagEnabled: false, audit, policy: POLICY });
    expect(r).toEqual({ status: 'skipped', reason: 'flag_off' });
    expect(audit.rows).toHaveLength(0);       // zero side effects
    expect(action.read()).toBe('A');          // unchanged
  });
  it('flag OFF resolves a function-form flag too', async () => {
    const r = await runAutoExec(makeSyntheticAction({}), { flagEnabled: async () => false });
    expect(r.status).toBe('skipped');
  });
});

describe('happy path', () => {
  it('flag ON + eligible + healthy canary → commit, with write-before-act audit', async () => {
    const action = makeSyntheticAction({});
    const audit = recorder();
    const r = await runAutoExec(action, { flagEnabled: true, audit, policy: POLICY, forbiddenClasses: [] });
    expect(r.status).toBe('committed');
    expect(action.read()).toBe('B');
    expect(audit.rows[0]).toMatchObject({ phase: 'start', outcome: 'started' }); // write-before-act first
    expect(audit.rows.at(-1)).toMatchObject({ phase: 'commit', outcome: 'committed' });
  });
});

describe('FM-B rollback from every intermediate state', () => {
  for (const failAt of ['apply', 'observe', 'revalidate', 'commit']) {
    it(`rolls back and restores pre-action state when failing at ${failAt}`, async () => {
      const r = await rehearseRollback(failAt);
      expect(r.restored).toBe(true);
      expect(['rolled_back']).toContain(r.status);
    });
  }
  it('surfaces rollback_failed (never silently swallowed) when rollback itself throws', async () => {
    const action = makeSyntheticAction({ failAt: 'observe' });
    action.rollback = () => { throw new Error('disk gone'); };
    const r = await runAutoExec(action, { flagEnabled: true, policy: POLICY });
    expect(r.status).toBe('rollback_failed');
    expect(r.killSwitchRecommended).toBe(true);
  });
});

describe('FM-E TOCTOU re-validate before commit', () => {
  it('aborts + rolls back when the world changes between observe and commit', async () => {
    const action = makeSyntheticAction({});
    action.markExternalChange(); // concurrent change invalidates validate()
    const r = await runAutoExec(action, { flagEnabled: true, policy: POLICY });
    expect(r).toMatchObject({ status: 'rolled_back', reason: 'toctou_revalidate_failed' });
    expect(action.read()).toBe('A');
  });
});

describe('kill-switch', () => {
  it('aborts at entry with no act when kill-switch active', async () => {
    const action = makeSyntheticAction({});
    const audit = recorder();
    const r = await runAutoExec(action, { flagEnabled: true, killSwitchActive: true, audit, policy: POLICY });
    expect(r).toEqual({ status: 'aborted', reason: 'kill_switch' });
    expect(action.read()).toBe('A');
    expect(audit.rows).toHaveLength(0);
  });
  it('fail-safe: kill-switch read error is treated as active (stop)', async () => {
    const r = await runAutoExec(makeSyntheticAction({}), { flagEnabled: true, killSwitchActive: async () => { throw new Error('db down'); }, policy: POLICY });
    expect(r.status).toBe('aborted');
  });
  it('rolls back when the kill-switch flips active before commit', async () => {
    let calls = 0;
    const killSwitchActive = async () => { calls += 1; return calls >= 2; }; // off at entry, on before commit
    const action = makeSyntheticAction({});
    const r = await runAutoExec(action, { flagEnabled: true, killSwitchActive, policy: POLICY });
    expect(r).toMatchObject({ status: 'rolled_back', reason: 'kill_switch_pre_commit' });
    expect(action.read()).toBe('A');
  });
});

describe('001B eligibility gate', () => {
  it('rejects + audits a forbidden-class action without acting', async () => {
    const action = makeSyntheticAction({ action_class: 'hard_delete' });
    const audit = recorder();
    const r = await runAutoExec(action, { flagEnabled: true, audit, policy: POLICY, forbiddenClasses: ['hard_delete'] });
    expect(r).toMatchObject({ status: 'rejected', gate: 'reversibility' });
    expect(action.read()).toBe('A');
    expect(audit.rows).toEqual([expect.objectContaining({ phase: 'eligibility', outcome: 'rejected' })]);
  });
  it('rejects when the policy is incomplete (fail-closed)', async () => {
    const partial = { ...POLICY }; delete partial.rollback;
    const r = await runAutoExec(makeSyntheticAction({}), { flagEnabled: true, policy: partial });
    expect(r).toMatchObject({ status: 'rejected', gate: 'policy' });
  });
  it('rejects when targeting a guardrail path', async () => {
    const action = makeSyntheticAction({ target: '.claude/settings.json' });
    const r = await runAutoExec(action, { flagEnabled: true, policy: POLICY });
    expect(r).toMatchObject({ status: 'rejected', gate: 'path-overlap' });
  });
});

describe('fail-closed audit', () => {
  it('aborts WITHOUT acting when the write-before-act audit throws', async () => {
    const action = makeSyntheticAction({});
    const audit = async () => { throw new Error('audit table unreachable'); };
    const r = await runAutoExec(action, { flagEnabled: true, audit, policy: POLICY });
    expect(r).toMatchObject({ status: 'aborted', reason: 'audit_write_failed' });
    expect(action.read()).toBe('A'); // never applied
  });
});
