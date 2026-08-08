/**
 * Unit tests for scripts/fleet/worktree-reaper-tick.cjs
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Validates cadence-gated invocation, feature-flag bypass, atomic state
 * persistence, and the safety contract (never throws).
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
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

/**
 * RECURRENCE GUARD: no test in this file may create a source tree in the REAL repository.
 *
 * MEASURED IN CI, and it cost three unrelated static guards. The one tick() call here without an
 * injected repoRoot resolved to CANONICAL_REPO_ROOT — the actual checkout — and the production git
 * runner then created <repo>/.reaper-source for real. That is a SECOND FULL COPY of the repository
 * INSIDE the repository, so every guard that walks the filesystem rather than git found a duplicate
 * of every file: cleanup-pending-pairing reported five "new writer sites", drain-set-registry-readers
 * reported nine files with hand-rolled kind lists, and role-drain-sets-staged reported an
 * apply-migration reference. All of them were .reaper-source/ copies of files already pinned.
 *
 * The failure is loud but the CAUSE is not: nothing in those three guards mentions this SD, and the
 * natural reading is "someone added writer sites". This asserts the cause directly so the next
 * person sees it in one line instead of three false leads.
 */
afterAll(() => {
  const repoRoot = path.resolve(tickModPath, '..', '..', '..');
  for (const dirname of ['.reaper-source', '.spawn-source']) {
    expect(
      fs.existsSync(path.join(repoRoot, dirname)),
      `${dirname} was created in the REAL repo by this test file. A test must not mutate the `
      + 'repository it runs in: a source tree is a full second copy, and every repo-walking static '
      + 'guard then double-counts every file. Inject sourceExists/sourceRunner.',
    ).toBe(false);
  }
});

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
      // NO SOURCE TREE, and this is load-bearing for two separate reasons.
      //
      // (1) CORRECTNESS OF THIS ASSERTION. FR-1 deliberately points the currency check at the
      // dedicated SOURCE tree when one is available, so with a tree present seen[0] would be
      // <repoRoot>/.reaper-source rather than repoRoot — which is what broke this test in CI.
      // This case is about repoRoot RESOLUTION (module location, not ambient cwd); source-tree
      // SELECTION is reaper-source-tree.test.js's job. Forcing the fallback keeps each test
      // measuring one thing.
      //
      // (2) IT WAS CREATING A REAL WORKTREE IN THE REAL REPO. This is the only tick() call in
      // the file with no repoRoot, so repoRoot resolved to CANONICAL_REPO_ROOT — the actual
      // checkout — and the production runner then ran `git worktree add` against it. In CI that
      // materialised a SECOND FULL COPY of the repo at .reaper-source, and every repo-WALKING
      // static guard then found a duplicate of every file: cleanup-pending-pairing,
      // drain-set-registry-readers and role-drain-sets-staged all failed with paths under
      // .reaper-source/. Three unrelated guards, one cause. A test may not mutate the repo it
      // runs in.
      sourceExists: () => false,
      sourceRunner: () => { throw new Error('no source tree in this test'); },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeTruthy();
    // C2: asserting "not tmpRoot" was VACUOUS — under vitest process.cwd() IS the repo
    // root, so that assertion passed identically with the fix AND with the process.cwd()
    // defect it was meant to catch. Assert the POSITIVE identity instead: the fallback
    // must resolve from the MODULE's location, which is what makes it independent of
    // wherever the caller happens to be standing.
    expect(path.resolve(seen[0])).toBe(path.resolve(tickModPath, '..', '..', '..'));
  });
});

/**
 * QF-20260726-794 — A REFUSING TICK MUST STILL REPORT THE BACKLOG.
 *
 * Two correct rules collided: the reaper must not mutate a shared root, and QFs are worked
 * ON main so the root is dirty ~continuously. The reaper refuses on ANY behind>0, and the
 * root goes behind within minutes of a peer merge — so it refused essentially every tick.
 * Nothing alerted, because each refusal is individually correct and well-logged. The cost
 * was visible only in the ACCUMULATED count, and the pool watchdog that reports that count
 * sat DOWNSTREAM of the refusal's early return, so a refusing tick never reached it.
 *
 * The refusal itself is unchanged and load-bearing — these tests assert it still holds.
 */
describe('QF-20260726-794: a refusal surfaces the accumulating backlog', () => {
  const origEnv = { ...process.env };
  let tmpRoot;

  const staleRunner = (args) => {
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return 'main\n';
    if (args[0] === 'status') return 'M some-file\n'; // dirty: exactly the QF scenario
    if (args[0] === 'rev-list') return '7\n';
    if (args[0] === 'pull') throw new Error('pull must never be attempted by the reaper');
    return '';
  };

  function writeSentinelReaper(root) {
    const dir = path.join(root, 'scripts');
    fs.mkdirSync(dir, { recursive: true });
    const sentinel = JSON.stringify(path.join(root, 'REAPER_RAN.sentinel'));
    fs.writeFileSync(
      path.join(dir, 'worktree-reaper.mjs'),
      `import fs from 'node:fs'; fs.writeFileSync(${sentinel}, 'ran'); process.exit(0);\n`,
    );
  }

  const readStateFile = () => JSON.parse(
    fs.readFileSync(path.join(tmpRoot, '.claude', 'worktree-reaper-state.json'), 'utf8'),
  );

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-backlog-'));
    fs.mkdirSync(path.join(tmpRoot, '.claude'), { recursive: true });
    process.env.WORKTREE_REAPER_ENABLED = 'true';
    writeSentinelReaper(tmpRoot);
  });
  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    process.env = { ...origEnv };
  });

  const runRefusal = (logs) => loadTickModule().tick({
    repoRoot: tmpRoot, cadence: 3, force: true,
    logger: (m) => logs.push(m), currencyRunner: staleRunner, currencyEnv: {},
  });

  it('emits a BACKLOG line on a refusal — the refusal is no longer silent about its cost', () => {
    const logs = [];
    const res = runRefusal(logs);
    expect(res.result).toBe('refused_stale_tree');
    const backlog = logs.find((m) => m.includes('WORKTREE REAPER BACKLOG'));
    expect(backlog).toBeDefined();
    expect(backlog).toContain('UNREAPED for 1 consecutive tick(s)');
  });

  it('STILL REFUSES — surfacing must not have relaxed the protection', async () => {
    const logs = [];
    const res = runRefusal(logs);
    expect(res.invoked).toBe(false);
    // The load-bearing assertion: reporting is non-destructive, reaping never happened.
    await new Promise((r) => setTimeout(r, 60));
    expect(fs.existsSync(path.join(tmpRoot, 'REAPER_RAN.sentinel'))).toBe(false);
  });

  it('ACCUMULATES the streak across ticks — this is what makes it a backlog, not a blip', () => {
    const logs = [];
    expect(runRefusal(logs).consecutiveRefusals).toBe(1);
    expect(runRefusal(logs).consecutiveRefusals).toBe(2);
    expect(runRefusal(logs).consecutiveRefusals).toBe(3);
    // Durability through the state file is the real assertion: readState whitelists fields,
    // so a key it does not carry is silently dropped on every read and could never add up.
    expect(readStateFile().consecutive_refusals).toBe(3);
  });

  it('RESETS the streak once the tree is current again', () => {
    const logs = [];
    runRefusal(logs);
    runRefusal(logs);
    expect(readStateFile().consecutive_refusals).toBe(2);
    loadTickModule().tick({
      repoRoot: tmpRoot, cadence: 3, force: true,
      logger: () => {}, currencyRunner: CURRENT_RUNNER, currencyEnv: {},
    });
    expect(readStateFile().consecutive_refusals).toBe(0);
  });

  it('a FAILED worktree count reports "unknown", never a healthy-looking 0/28 (0%)', () => {
    // tmpRoot is not a git repo, so countActiveWorktrees returns null. Rendering that as
    // "0/28 (0%)" would read as a comfortably empty pool — a not-measured state displayed
    // identically to a measured one, which is the exact class of defect this QF came from.
    const logs = [];
    runRefusal(logs);
    const backlog = logs.find((m) => m.includes('WORKTREE REAPER BACKLOG'));
    expect(backlog).toContain('unknown (git failed)');
    expect(backlog).not.toContain('(0%)');
  });
});
