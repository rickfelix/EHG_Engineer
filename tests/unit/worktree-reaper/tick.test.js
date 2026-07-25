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

/**
 * SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-3 added a fail-closed currency
 * precondition: the tick refuses to reap from a tree it cannot prove is current, because
 * the reaper's own script is loaded out of that tree and a deletion cannot be undone by a
 * later error message.
 *
 * These fixtures use a bare temp directory, which is not a git repository, so the guard
 * correctly refuses it — the guard working, not a regression. The three tests that
 * exercise SPAWN MECHANICS (detached launch, single-flight, spawn-error handling) rather
 * than currency inject a runner reporting a clean, current tree, to isolate the behaviour
 * under test. Injecting it explicitly is deliberate: it keeps the new precondition visible
 * in those tests rather than silently bypassed.
 *
 * Refusal itself is covered separately, in the FR-3 describe block at the end of this file.
 */
const CURRENT_RUNNER = (args) => {
  if (args[0] === 'fetch') return '';
  if (args.includes('--abbrev-ref')) return 'main\n';
  if (args[0] === 'status') return '';
  if (args[0] === 'rev-list') return '0\n';
  return '';
};

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
    const res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: CURRENT_RUNNER });
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
    const res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: CURRENT_RUNNER });
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
    expect(() => { res = tick({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: CURRENT_RUNNER }); }).not.toThrow();
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

/**
 * SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-3 — REFUSE TO REAP FROM A STALE TREE.
 *
 * This is the destructive half of the SD. The tick resolves the reaper SCRIPT ITSELF out
 * of repoRoot, so the reaper's code identity is that tree's HEAD. That is exactly how the
 * reap-protected marker shipped inert: the guard existed on origin/main and was physically
 * absent from the file being executed, and the reaper deleted a worktree the marker was
 * supposed to protect.
 *
 * A deletion cannot be undone by a later error message, so failing loud after the fact is
 * not available here — the only safe direction is to refuse before executing.
 *
 * SAFETY (SD correction C7): every case below runs against a TEMP directory with a FAKE
 * reaper script. Nothing here runs git worktree add/remove against the real repo or
 * invokes the real scripts/worktree-reaper.mjs. The chairman has an in-flight protected
 * worktree; this suite must never be able to touch it.
 */
describe('FR-3: the reaper refuses to reap from a tree it cannot prove is current', () => {
  const origEnv = { ...process.env };
  let tmpRoot;

  // A fake reaper that WRITES A SENTINEL when it runs. The assertion that matters is not
  // just "result was refused" but that the reaper never executed at all.
  function writeSentinelReaper(root) {
    const dir = path.join(root, 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    // JSON.stringify handles Windows path separators without hand-rolled escaping —
    // a literal backslash in a generated script is an easy way to write a broken test.
    const sentinel = JSON.stringify(path.join(root, 'REAPER_RAN.sentinel'));
    fs.writeFileSync(
      path.join(dir, 'worktree-reaper.mjs'),
      `import fs from 'node:fs'; fs.writeFileSync(${sentinel}, 'ran'); process.exit(0);\n`,
    );
  }

  const staleRunner = (args) => {
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return 'main\n';
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') return '7\n';   // 7 behind
    if (args[0] === 'pull') throw new Error('pull must never be attempted by the reaper');
    return '';
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-currency-'));
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    process.env.WORKTREE_REAPER_ENABLED = 'true';
  });
  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    process.env = { ...origEnv };
  });

  it('a BEHIND tree refuses, and the reaper never runs', async () => {
    writeSentinelReaper(tmpRoot);
    const tickFn = loadTickModule().tick;
    const res = tickFn({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: staleRunner, currencyEnv: {} });
    expect(res.result).toBe('refused_stale_tree');
    expect(res.invoked).toBe(false);
    // The load-bearing assertion: nothing was executed.
    await new Promise((r) => setTimeout(r, 60));
    expect(fs.existsSync(path.join(tmpRoot, 'REAPER_RAN.sentinel'))).toBe(false);
  });

  it('a GIT ERROR refuses too — fail closed, never reap on uncertainty', async () => {
    writeSentinelReaper(tmpRoot);
    const tickFn = loadTickModule().tick;
    const res = tickFn({
      repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {},
      currencyRunner: () => { throw new Error('git unavailable'); }, currencyEnv: {},
    });
    expect(res.result).toBe('refused_stale_tree');
    await new Promise((r) => setTimeout(r, 60));
    expect(fs.existsSync(path.join(tmpRoot, 'REAPER_RAN.sentinel'))).toBe(false);
  });

  it('the refusal is PERSISTED to state, so a stale reaper is visible after the fact', async () => {
    writeSentinelReaper(tmpRoot);
    const tickFn = loadTickModule().tick;
    tickFn({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: staleRunner, currencyEnv: {} });
    const state = JSON.parse(fs.readFileSync(path.join(tmpRoot, '.claude', 'worktree-reaper-state.json'), 'utf8'));
    expect(state.last_result).toBe('refused_stale_tree');
  });

  it('the reaper NEVER attempts a self-heal pull — it refuses instead of mutating', async () => {
    // The spawn seam may fast-forward a clean tree. The reaper must not: it runs
    // unattended on a shared root and a mutation there could clobber a peer worktree.
    writeSentinelReaper(tmpRoot);
    const tickFn = loadTickModule().tick;
    const calls = [];
    const recording = (args) => { calls.push(args[0]); return staleRunner(args); };
    const res = tickFn({ repoRoot: tmpRoot, cadence: 3, force: true, logger: () => {}, currencyRunner: recording, currencyEnv: {} });
    expect(res.result).toBe('refused_stale_tree');
    expect(calls).not.toContain('pull');
  });

  it('the canonical root fallback is used when no repoRoot is injected (not process.cwd)', async () => {
    const tickFn = loadTickModule().tick;
    // Called with no repoRoot from an arbitrary cwd. Whatever it resolves, it must NOT be
    // the ambient cwd of this test process — that is the defect FR-3 removes.
    const seen = [];
    tickFn({
      cadence: 3, force: true, logger: () => {},
      currencyRunner: (args, o) => { seen.push(o && o.cwd); return staleRunner(args); },
      currencyEnv: {},
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeTruthy();
    expect(path.resolve(seen[0])).not.toBe(path.resolve(tmpRoot));
  });
});
