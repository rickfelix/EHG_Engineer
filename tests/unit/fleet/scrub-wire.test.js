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

  it('scrubGitEnv pins system/global config OFF rather than only deleting overrides', () => {
    // R5-1 positive hardening: deleting GIT_CONFIG_* still leaves whatever /etc/gitconfig or
    // ~/.gitconfig says, and core.hooksPath there is the same primitive.
    const out = scrubGitEnv({ PATH: 'keep' });
    expect(out.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(out.GIT_CONFIG_GLOBAL).toBeTruthy();
    expect(fs.existsSync(out.GIT_CONFIG_GLOBAL)).toBe(false); // "no global config"
    expect(out.PATH).toBe('keep');
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
