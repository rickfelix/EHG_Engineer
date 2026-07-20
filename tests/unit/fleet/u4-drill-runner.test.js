/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-E FR-3 -- U4 (agent-browser cookie-non-leak) live-drill runner.
 * Fixture-tested against docs/protocol/u4-cookie-non-leak-spec.md's PASS/FAIL observables (secs 3-4).
 * NOT a live drill: no canary account is provisioned in this environment (see module header).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  checkSupervisorEnvInvariant,
  checkProfileDirNonCollision,
  checkCrossProfileFilesystemReachability,
  checkEventLogPresence,
  runU4Drill,
  printLiveExecutionPrecondition,
} from '../../../lib/fleet/u4-drill-runner.js';

describe('checkSupervisorEnvInvariant', () => {
  it('PASSes when CLAUDE_CONFIG_DIR is unchanged before/after the relaunch call', async () => {
    const before = process.env.CLAUDE_CONFIG_DIR;
    const relaunchFn = vi.fn(async () => ({ ok: true }));
    const result = await checkSupervisorEnvInvariant('Canary-1', 'B', {}, relaunchFn);
    expect(result).toEqual({ name: 'supervisor_env_invariant', pass: true, detail: 'CLAUDE_CONFIG_DIR unchanged before/after', result: { ok: true } });
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(before);
  });

  it('FAILs and captures the throw when relaunchUnderProfile violates the isolation invariant', async () => {
    const relaunchFn = vi.fn(async () => { throw new Error('relaunchUnderProfile: supervisor process.env.CLAUDE_CONFIG_DIR changed -- isolation invariant violated'); });
    const result = await checkSupervisorEnvInvariant('Canary-1', 'B', {}, relaunchFn);
    expect(result.pass).toBe(false);
    expect(result.name).toBe('supervisor_env_invariant');
    expect(result.detail).toMatch(/isolation invariant violated/);
  });
});

describe('checkProfileDirNonCollision', () => {
  it('PASSes on two distinct, non-nested directories', () => {
    const resolveFn = (name) => `C:\\profiles\\${name}`;
    const result = checkProfileDirNonCollision('A', 'B', {}, resolveFn);
    expect(result).toEqual({ name: 'profile_dir_non_collision', pass: true, detail: 'distinct, non-nested dirs: C:\\profiles\\A vs C:\\profiles\\B' });
  });

  it('FAILs when both profiles resolve to the same directory (collision)', () => {
    const resolveFn = () => 'C:\\profiles\\shared';
    const result = checkProfileDirNonCollision('A', 'B', {}, resolveFn);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/collide/);
  });

  it('FAILs when one profile dir is nested inside the other (traversal-style escape)', () => {
    const resolveFn = (name) => (name === 'A' ? 'C:\\profiles\\A' : 'C:\\profiles\\A\\sub');
    const result = checkProfileDirNonCollision('A', 'B', {}, resolveFn);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/collide/);
  });
});

describe('checkCrossProfileFilesystemReachability', () => {
  it('PASSes when no file under profile A is reachable via profile B', () => {
    const fs = {
      listFiles: () => ['cookies.json'],
      realpath: (p) => p, // no symlink resolution -> distinct real paths per dir
    };
    const result = checkCrossProfileFilesystemReachability('C:\\profiles\\A', 'C:\\profiles\\B', fs);
    expect(result.pass).toBe(true);
  });

  it('FAILs when a file under profile A resolves to the SAME real path under profile B (symlink/copy leak)', () => {
    const fs = {
      listFiles: () => ['cookies.json'],
      realpath: () => 'C:\\profiles\\A\\cookies.json', // both paths resolve identically -> leak
    };
    const result = checkCrossProfileFilesystemReachability('C:\\profiles\\A', 'C:\\profiles\\B', fs);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/cookies\.json/);
  });

  it('PASSes (nothing to leak) when profile A dir is unreadable', () => {
    const fs = { listFiles: () => { throw new Error('ENOENT'); }, realpath: () => { throw new Error('n/a'); } };
    const result = checkCrossProfileFilesystemReachability('C:\\profiles\\A', 'C:\\profiles\\B', fs);
    expect(result.pass).toBe(true);
  });
});

describe('checkEventLogPresence', () => {
  it('PASSes when a fleet_verb_relaunch_under_profile event is recorded', async () => {
    const queryEventsFn = vi.fn(async () => [{ event_type: 'fleet_verb_relaunch_under_profile' }]);
    const result = await checkEventLogPresence('s-canary', queryEventsFn);
    expect(result.pass).toBe(true);
  });

  it('FAILs (log-before-action violated) when no such event exists', async () => {
    const queryEventsFn = vi.fn(async () => []);
    const result = await checkEventLogPresence('s-canary', queryEventsFn);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/no fleet_verb_relaunch_under_profile event/);
  });
});

describe('runU4Drill', () => {
  it('PASSes overall when all wired checks pass', async () => {
    const relaunchFn = vi.fn(async () => ({ ok: true }));
    const resolveFn = (name) => `C:\\profiles\\${name}`;
    const fs = { listFiles: () => [], realpath: (p) => p };
    const queryEventsFn = vi.fn(async () => [{ event_type: 'fleet_verb_relaunch_under_profile' }]);
    const { pass, checks } = await runU4Drill({
      target: 'Canary-1', fromProfile: 'A', toProfile: 'B', sessionId: 's-canary',
      relaunchFn, resolveFn, fs, queryEventsFn,
    });
    expect(pass).toBe(true);
    expect(checks).toHaveLength(4);
  });

  it('overall FAILs if any single check fails', async () => {
    const relaunchFn = vi.fn(async () => ({ ok: true }));
    const resolveFn = () => 'C:\\profiles\\shared'; // collision
    const fs = { listFiles: () => [], realpath: (p) => p };
    const queryEventsFn = vi.fn(async () => [{ event_type: 'fleet_verb_relaunch_under_profile' }]);
    const { pass, checks } = await runU4Drill({
      target: 'Canary-1', fromProfile: 'A', toProfile: 'B', sessionId: 's-canary',
      relaunchFn, resolveFn, fs, queryEventsFn,
    });
    expect(pass).toBe(false);
    expect(checks.find((c) => c.name === 'profile_dir_non_collision').pass).toBe(false);
  });
});

describe('printLiveExecutionPrecondition (no-false-live-claim guardrail)', () => {
  it('explicitly states the runner is mechanism-ready, NOT live-executed, and names the owner + precondition', () => {
    const text = printLiveExecutionPrecondition();
    expect(text).toMatch(/MECHANISM-READY, not live-executed/);
    expect(text).toMatch(/Owner: chairman/);
    expect(text).toMatch(/FLEET_ACCOUNT_PROFILES_DIR/);
    expect(text).toMatch(/FLEET_SPAWN_CONTROL_LIVE/);
    expect(text).toMatch(/FLEET_CANARY_KILL_ENABLED/);
    expect(text).not.toMatch(/live drill (passed|complete|proven)/i);
  });
});
