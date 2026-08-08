/**
 * R5-4 (EXEC SECURITY) — THE SCRUB WAS PINNED AS A FUNCTION, NEVER AS A WIRE.
 *
 * MEASURED, and this is the whole reason this file exists: the env scrub could be UNWIRED at BOTH
 * production call sites — worktree-reaper-tick.cjs's gitRunner and spawn-control.js's gitRunner —
 * with all 4227 tests GREEN. The only test that could have noticed asserted scrubGitEnv as a PURE
 * FUNCTION in isolation. Two green endpoints do not prove they are connected.
 *
 * That is this SD's FOUNDING DEFECT one layer up: a value correctly computed and never consumed.
 * The original bug was consecutive_refusals being published and discarded at the call site; this is
 * scrubGitEnv being computed and not applied at the call site. Same shape, same blindness.
 *
 * THE FIX IS STRUCTURAL, NOT JUST A TEST: both call sites now build their runner through ONE
 * factory (makeScrubbedGitRunner), so the wire is a single object that can be tested by EFFECT
 * rather than by grepping two sites for a spelling.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  makeScrubbedGitRunner, scrubGitEnv,
} = require_('../../../lib/fleet/source-tree-refresh.cjs');

const REPO = process.cwd();

/** The injection under test: core.hooksPath is a directory git EXECUTES hooks from. */
const poisoned = () => ({
  ...process.env,
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: 'C:/evil-hooks-DOES-NOT-EXIST',
});

describe('R5-4: the scrub is asserted by EFFECT, so unwiring it is detectable', () => {
  it('POSITIVE CONTROL — an UNSCRUBBED runner really is poisoned', () => {
    // Load-bearing, and the reason this test can detect anything at all: if the injection did not
    // work in the first place, every assertion below would pass against a no-op. This is the
    // "two-sided or it admits a field that lies" rule applied to the attack itself.
    const raw = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd: REPO, encoding: 'utf8', env: poisoned(),
    });
    expect((raw.stdout || '').trim()).toBe('C:/evil-hooks-DOES-NOT-EXIST');
  });

  it('the SCRUBBED runner does not carry the injection through to git', () => {
    // The effect, not the function. This is what kills "the key list was gutted" AND
    // "the scrub was never applied" — a pure-function test can only see the first.
    const run = makeScrubbedGitRunner(REPO, { env: poisoned() });
    let got;
    try { got = run(['config', '--get', 'core.hooksPath']).trim(); } catch { got = ''; }
    expect(got).not.toBe('C:/evil-hooks-DOES-NOT-EXIST');
  });

  it('the factory still WORKS — it is a real runner, not a refusal', () => {
    // Anti-vacuity: a factory that always threw would satisfy the assertion above.
    const run = makeScrubbedGitRunner(REPO, {});
    expect(run(['rev-parse', '--is-inside-work-tree']).trim()).toBe('true');
  });

  it('a poisoned env cannot redirect WHICH repository the runner resolves', () => {
    // The other half of the scrub's job (S2-R3): GIT_DIR/GIT_WORK_TREE redirection.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrub-wire-'));
    try {
      spawnSync('git', ['-C', tmp, 'init', '-q'], { encoding: 'utf8' });
      const decoy = { ...process.env, GIT_DIR: path.join(tmp, '.git'), GIT_WORK_TREE: tmp };

      // Unscrubbed, the decoy wins...
      const rawTop = spawnSync('git', ['rev-parse', '--path-format=absolute', '--show-toplevel'], {
        cwd: REPO, encoding: 'utf8', env: decoy,
      });
      expect(fs.realpathSync((rawTop.stdout || '').trim())).toBe(fs.realpathSync(tmp));

      // ...scrubbed, the real repo wins.
      const run = makeScrubbedGitRunner(REPO, { env: decoy });
      const top = run(['rev-parse', '--path-format=absolute', '--show-toplevel']).trim();
      expect(fs.realpathSync(top)).not.toBe(fs.realpathSync(tmp));
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('the scrub does NOT disable system/global config — that broke authenticated fetch', () => {
    // REVERSAL OF MY OWN CHANGE, pinned so nobody re-adds it. I briefly set GIT_CONFIG_NOSYSTEM=1
    // and pointed GIT_CONFIG_GLOBAL at a nonexistent file to neutralise core.hooksPath in
    // system/global config. MEASURED: that kills credential resolution on this fleet — origin is
    // https://github.com, credential.helper=manager lives in the SYSTEM config and the
    // github-specific helpers in the GLOBAL config. A source tree that cannot fetch cannot
    // fast-forward, goes stale, and the reaper then REFUSES: exactly the starvation this SD exists
    // to fix. The real-git fixture could not see it because its remote is a local bare repo with
    // no auth.
    const out = scrubGitEnv({ PATH: 'keep' });
    expect(out.GIT_CONFIG_NOSYSTEM).toBeUndefined();
    expect(out.GIT_CONFIG_GLOBAL).toBeUndefined();
    expect(out.PATH).toBe('keep');
  });

  it('EFFECT: a real credential helper still resolves through the scrub', () => {
    // The behavioural half of the above — asserts the CONSEQUENCE (fetch can authenticate), not
    // just the absence of two keys. Skipped where the machine has no helper configured, so it
    // never fails for an unrelated reason.
    const raw = spawnSync('git', ['config', '--get', 'credential.helper'], {
      cwd: REPO, encoding: 'utf8', env: process.env,
    });
    const hasHelper = Boolean((raw.stdout || '').trim());
    if (!hasHelper) return; // nothing to protect on this machine
    const scrubbedRun = spawnSync('git', ['config', '--get', 'credential.helper'], {
      cwd: REPO, encoding: 'utf8', env: scrubGitEnv(process.env),
    });
    expect((scrubbedRun.stdout || '').trim(), 'the scrub must not break credential resolution')
      .toBeTruthy();
  });

  it('tree-currency defaultRunner is scrubbed too — SCRUB-2, the second door', () => {
    // STRUCTURAL, labelled. assessTreeCurrency runs `git status --porcelain` and `git fetch`
    // through this runner, and worktree-reaper-tick only injects a runner in TESTS — so this is
    // the production path. Measured by the reviewer: with GIT_CONFIG_COUNT/core.fsmonitor set the
    // injected command RAN and the function still returned "current". Driving it behaviourally
    // here would mean a real fetch, so the wire is asserted structurally.
    // Sliced to the FUNCTION BODY rather than matched with a character-bounded regex. My first
    // version used {0,600} and failed because the explanatory comment inside pushed the distance
    // past the bound — a test failing for a reason unrelated to its property, which is how a
    // brittle assertion gets "fixed" by deleting it.
    const src = fs.readFileSync(path.join(REPO, 'lib', 'fleet', 'tree-currency.cjs'), 'utf8');
    const start = src.indexOf('function defaultRunner');
    expect(start, 'defaultRunner must exist').toBeGreaterThan(-1);
    const next = src.indexOf('\nfunction ', start + 1);
    const body = src.slice(start, next > -1 ? next : src.length);
    expect(body).toContain('scrubGitEnv(process.env)');
  });
});

describe('R5-4: BOTH production call sites go through the factory', () => {
  // STRUCTURAL, and labelled as such. The effect tests above prove the factory is sound; they
  // cannot prove a call site still USES it, and neither production runner can be driven here
  // without launching real workers or a real reaper (TR-4). This is the cheapest honest check
  // that the wire is still attached, and it fails on exactly the one-line unwiring measured above.
  const readSrc = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

  it('worktree-reaper-tick.cjs builds its git runner via makeScrubbedGitRunner', () => {
    const src = readSrc('scripts/fleet/worktree-reaper-tick.cjs');
    expect(src).toMatch(/const gitRunner = runner \|\| makeScrubbedGitRunner\(/);
    // And does not hand-roll an unscrubbed spawnSync for git alongside it.
    expect(src).not.toMatch(/spawnSync\('git',[^)]*\)\s*;\s*\n\s*if \(r\.status/);
  });

  it('spawn-control.js scrubs its git runner env, with the caller spread FIRST', () => {
    const src = readSrc('lib/fleet/spawn-control.js');
    expect(src).toContain('env: scrubGitEnv_(');
    // R5-5: `...o` must come BEFORE env:, or a caller passing env silently un-scrubs it.
    //
    // ANCHORED ON THE STATEMENT, NOT ON PROSE. My first version searched for
    // `execFileSync('git', args, {` and matched a DOC COMMENT 270 lines earlier that shows the
    // caller contract — the slice then contained neither field and the test failed for a reason
    // that had nothing to do with the property. That is the same defect this SD already committed
    // once (a source assertion matching a comment instead of the code); the `|| ((args, o) =>`
    // prefix appears only in the runner itself.
    const runnerIdx = src.indexOf('|| ((args, o) => execFileSync(');
    expect(runnerIdx, 'the runner statement must be found, not a doc comment').toBeGreaterThan(-1);
    const slice = src.slice(runnerIdx, runnerIdx + 400);
    expect(slice).toContain('...o,');
    expect(slice).toContain('env: scrubGitEnv_(');
    expect(slice.indexOf('...o,')).toBeLessThan(slice.indexOf('env: scrubGitEnv_('));
  });
});
