/**
 * Unit tests for scripts/fleet/worktree-reaper-tick.cjs
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Validates cadence-gated invocation, feature-flag bypass, atomic state
 * persistence, and the safety contract (never throws).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tickModPath = path.resolve(__dirname, '../../../scripts/fleet/worktree-reaper-tick.cjs');

// Each test gets a fresh require so state file writes stay isolated.
function loadTickModule() {
  delete require.cache[tickModPath];
  return require(tickModPath);
}

describe('worktree-reaper-tick', () => {
  let tmpRoot;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-tick-'));
    // Ensure a .claude dir exists so state file write path works.
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    delete process.env.WORKTREE_REAPER_ENABLED;
    delete process.env.WORKTREE_REAPER_EXECUTE;
  });

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    process.env = { ...origEnv };
  });

  it('returns disabled when WORKTREE_REAPER_ENABLED=false', () => {
    process.env.WORKTREE_REAPER_ENABLED = 'false';
    const { tick } = loadTickModule();
    const res = tick({ repoRoot: tmpRoot, cadence: 3, logger: () => {} });
    expect(res.enabled).toBe(false);
    expect(res.invoked).toBe(false);
    expect(res.result).toBe('disabled');
  });

  it('skips invocation when not due (counter % cadence !== 0)', () => {
    const { tick } = loadTickModule();
    const res = tick({ repoRoot: tmpRoot, cadence: 12, logger: () => {} });
    expect(res.invoked).toBe(false);
    expect(res.counter).toBe(1);
    expect(res.result).toBe('skipped_not_due');
  });

  it('persists counter increments across calls', () => {
    const mod = loadTickModule();
    mod.tick({ repoRoot: tmpRoot, cadence: 12, logger: () => {} });
    mod.tick({ repoRoot: tmpRoot, cadence: 12, logger: () => {} });
    const final = mod.tick({ repoRoot: tmpRoot, cadence: 12, logger: () => {} });
    expect(final.counter).toBe(3);

    const state = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.claude', 'worktree-reaper-state.json'), 'utf8'),
    );
    expect(state.sweep_counter).toBe(3);
  });

  it('invokes the reaper script when counter hits cadence (but records script_missing if absent)', () => {
    // No scripts/worktree-reaper.mjs in tmpRoot ⇒ expect script_missing
    const mod = loadTickModule();
    // Force invocation without incrementing cadence a dozen times.
    const res = mod.tick({ repoRoot: tmpRoot, cadence: 3, logger: () => {}, force: true });
    expect(res.invoked).toBe(false);
    expect(res.result).toBe('script_missing');
    // State is updated with last_result.
    const state = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, '.claude', 'worktree-reaper-state.json'), 'utf8'),
    );
    expect(state.last_result).toBe('script_missing');
    expect(state.last_run_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('resolves execute mode from WORKTREE_REAPER_EXECUTE env', () => {
    const { resolveExecuteMode } = loadTickModule();
    process.env.WORKTREE_REAPER_EXECUTE = '';
    expect(resolveExecuteMode()).toEqual({ execute: false, stage2: false });
    process.env.WORKTREE_REAPER_EXECUTE = 'stage1';
    expect(resolveExecuteMode()).toEqual({ execute: true, stage2: false });
    process.env.WORKTREE_REAPER_EXECUTE = 'stage2';
    expect(resolveExecuteMode()).toEqual({ execute: true, stage2: true });
    process.env.WORKTREE_REAPER_EXECUTE = 'all';
    expect(resolveExecuteMode()).toEqual({ execute: true, stage2: true });
  });

  it('readState returns defaults when state file absent', () => {
    const { readState } = loadTickModule();
    const s = readState(path.join(tmpRoot, 'nonexistent.json'));
    expect(s.sweep_counter).toBe(0);
    expect(s.last_run_at).toBe(null);
  });

  it('readState tolerates malformed JSON', () => {
    const fp = path.join(tmpRoot, '.claude', 'worktree-reaper-state.json');
    fs.writeFileSync(fp, 'not json');
    const { readState } = loadTickModule();
    const s = readState(fp);
    expect(s.sweep_counter).toBe(0);
  });

  it('does not throw when state dir is read-only (safety contract)', () => {
    // Simulate a broken state file path by pointing at a directory
    // Tick must still return a result object without throwing.
    const { tick } = loadTickModule();
    const brokenRepo = path.join(tmpRoot, 'does-not-exist');
    expect(() => tick({ repoRoot: brokenRepo, cadence: 12, logger: () => {} })).not.toThrow();
  });
});

/**
 * SD-FDBK-INFRA-WORKTREE-REAPER-RELIABILITY-001 — out-of-band reaper launch.
 *
 * The reaper now runs DETACHED so a slow reap can never block/abort the sweep.
 * These tests exercise the real (un-mocked) spawn path against a tiny fake
 * reaper script that exits immediately.
 */
describe('worktree-reaper-tick — out-of-band launch (SD-FDBK-INFRA-WORKTREE-REAPER-RELIABILITY-001)', () => {
  let tmpRoot;
  const origEnv = { ...process.env };

  function writeFakeReaper(root) {
    const dir = path.join(root, 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    // Exits 0 immediately; the tick must not wait for it.
    fs.writeFileSync(path.join(dir, 'worktree-reaper.mjs'), 'process.exit(0);\n');
  }
  function readStateFile(root) {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'worktree-reaper-state.json'), 'utf8'));
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-oob-'));
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    delete process.env.WORKTREE_REAPER_ENABLED;
    delete process.env.WORKTREE_REAPER_EXECUTE;
  });
  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    process.env = { ...origEnv };
  });

  it('AC-1: launches the reaper detached and returns result=spawned with a pid (does not block)', () => {
    writeFakeReaper(tmpRoot);
    const { tick } = loadTickModule();
    const res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {} });
    expect(res.result).toBe('spawned');
    expect(typeof res.pid).toBe('number');
    const state = readStateFile(tmpRoot);
    expect(state.last_result).toBe('spawned');
    expect(state.last_pid).toBe(res.pid);
    expect(typeof state.last_spawn_at).toBe('string');
    // Output log file should have been created/appended.
    expect(fs.existsSync(path.join(tmpRoot, '.claude', 'worktree-reaper-last.log'))).toBe(true);
    try { process.kill(res.pid, 0); /* may already be gone */ } catch { /* fine */ }
  });

  it('AC-2: single-flight — skips launch when the prior reaper pid is still alive', () => {
    writeFakeReaper(tmpRoot);
    // Pre-seed state with a guaranteed-alive pid (this test process).
    fs.writeFileSync(
      path.join(tmpRoot, '.claude', 'worktree-reaper-state.json'),
      JSON.stringify({ schema_version: 1, sweep_counter: 11, last_run_at: null, last_result: 'spawned', last_pid: process.pid, last_spawn_at: new Date().toISOString() }),
    );
    const { tick } = loadTickModule();
    const res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {} });
    expect(res.result).toBe('skipped_in_flight');
    expect(res.invoked).toBe(false);
  });

  it('AC-3: returns a spawn_error result (never throws) when the log path cannot be created', () => {
    writeFakeReaper(tmpRoot);
    // Replace the .claude directory with a FILE so mkdir/openSync for the log fail.
    fs.rmSync(path.join(tmpRoot, '.claude'), { recursive: true, force: true });
    fs.writeFileSync(path.join(tmpRoot, '.claude'), 'not a directory');
    const { tick } = loadTickModule();
    let res;
    expect(() => { res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {} }); }).not.toThrow();
    expect(res.result.startsWith('spawn_error')).toBe(true);
  });

  it('isPidAlive: true for this process, false for a dead/invalid pid', () => {
    const { isPidAlive } = loadTickModule();
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2 ** 30)).toBe(false); // almost certainly not a live pid
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(null)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
  });
});
