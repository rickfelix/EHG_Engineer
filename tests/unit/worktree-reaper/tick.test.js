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
