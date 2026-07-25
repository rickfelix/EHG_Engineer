/**
 * SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 — FR-1 + TS-1/TS-2/TS-3.
 *
 * THE ACCEPTANCE BAR THIS FILE EXISTS TO MAKE FALSIFIABLE, verbatim from the SD:
 * "NO CODE PATH THAT EXECUTES SHOULD DEPEND ON A HUMAN OR A LOOP REMEMBERING TO
 * PULL. A gauge that detects staleness plus a loop that remediates it is still a
 * system whose answer to is-the-spawn-path-current is probably-if-someone-ticked-
 * recently. That is a habit with monitoring, not an invariant."
 *
 * So "we pulled and it was fresh" must not be able to pass. TS-1 below builds a
 * REAL git repository, rewinds it, and asserts a POSITIVE discriminator — either an
 * identifiable NOT-CURRENT verdict, or an observed `pull --ff-only` that actually
 * converges behind to 0. A bare not.toThrow() would be a test failure.
 *
 * WHY A SYNTHETIC REPO RATHER THAN THIS ONE (measured at PLAN):
 *   - .github/workflows/unit-tier.yml checks out at fetch-depth 1, so HEAD~3 does
 *     not exist in CI and origin/main is not guaranteed to resolve. Rewinding the
 *     real repo cannot run there.
 *   - `git worktree add` against the real repo costs ~11.9s, mutates .git/worktrees
 *     right next to the chairman's protected .worktrees/cp3-drill-run, AND lands
 *     off-main, so the guard would refuse before the self-heal path is ever reached.
 *   - A disposable clone of the real repo costs ~17.8s and dies on CI's depth-1 parent.
 * The synthetic repo is ~1.5s, offline-safe, shallow-CI-safe, and touches nothing
 * outside its own temp directory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { assessTreeCurrency, DEFAULT_BASE_REF } = require('../../../lib/fleet/tree-currency.cjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let tmp; let upstream; let downstream;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-currency-'));
  upstream = path.join(tmp, 'upstream');
  downstream = path.join(tmp, 'downstream');

  fs.mkdirSync(upstream, { recursive: true });
  git(['init', '--quiet', '-b', 'main'], upstream);
  git(['config', 'user.email', 'test@example.invalid'], upstream);
  git(['config', 'user.name', 'Tree Currency Test'], upstream);
  for (let i = 1; i <= 5; i += 1) {
    fs.writeFileSync(path.join(upstream, `f${i}.txt`), `commit ${i}\n`);
    git(['add', '.'], upstream);
    git(['commit', '--quiet', '-m', `commit ${i}`], upstream);
  }

  git(['clone', '--quiet', upstream, downstream], tmp);
  git(['config', 'user.email', 'test@example.invalid'], downstream);
  git(['config', 'user.name', 'Tree Currency Test'], downstream);
});

afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('TS-1: the adversarial staleness test (real git, hermetic repo)', () => {
  it('a tree level with its remote is CURRENT', () => {
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/main' });
    expect(r.current).toBe(true);
    expect(r.behind).toBe(0);
    expect(r.branch).toBe('main');
    expect(r.dirty).toBe(false);
  });

  it('a REWOUND tree is NOT-CURRENT and reports how far behind it is', () => {
    git(['reset', '--hard', '--quiet', 'HEAD~3'], downstream);
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/main' });
    // The positive discriminator: not merely "did not throw" — an explicit verdict
    // with a behind-count that matches the rewind.
    expect(r.current).toBe(false);
    expect(r.reason).toBe('behind');
    expect(r.behind).toBe(3);
    expect(r.branch).toBe('main');
    expect(r.dirty).toBe(false);
  });

  it('SELF-HEAL: a ff-only pull actually converges behind to 0, proven by re-assessing', () => {
    // This is the half a seam-injected test can never prove — that the git command
    // we emit is correct and that it genuinely fixes the tree.
    git(['pull', '--ff-only', '--quiet', 'origin', 'main'], downstream);
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/main' });
    expect(r.current).toBe(true);
    expect(r.behind).toBe(0);
  });

  it('a DIRTY tree is reported dirty, so the caller can refuse rather than mutate it', () => {
    fs.writeFileSync(path.join(downstream, 'f1.txt'), 'locally modified\n');
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/main' });
    expect(r.dirty).toBe(true);
    git(['checkout', '--quiet', '--', 'f1.txt'], downstream);
  });

  it('a DETACHED HEAD is NOT-CURRENT — fail closed, with real git', () => {
    git(['checkout', '--quiet', 'HEAD~1'], downstream);
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/main' });
    expect(r.current).toBe(false);
    git(['checkout', '--quiet', 'main'], downstream);
  });

  it('a MISSING remote ref is NOT-CURRENT — fail closed, with real git', () => {
    const r = assessTreeCurrency({ dir: downstream, baseRef: 'origin/does-not-exist' });
    expect(r.current).toBe(false);
  });

  it('a directory that is not a git repository at all is NOT-CURRENT', () => {
    const notARepo = path.join(tmp, 'not-a-repo');
    fs.mkdirSync(notARepo, { recursive: true });
    const r = assessTreeCurrency({ dir: notARepo, baseRef: 'origin/main' });
    expect(r.current).toBe(false);
  });
});

// TS-2 / TS-3 — the decision table. Real git cannot cheaply reach a timeout or an
// exotic failure mode, so those branches are covered through the injected runner.
// These are REQUIRED IN ADDITION TO TS-1, never instead of it: on their own they
// prove the decision logic but say nothing about whether the emitted git commands
// are correct, which is exactly the gap that lets a fix ship inert.
describe('TS-2: FAIL-CLOSED on every abnormal path (injected runner)', () => {
  const ok = (out) => () => out;

  it('a throwing runner yields NOT-CURRENT, never CURRENT', () => {
    const r = assessTreeCurrency({
      dir: '/anywhere',
      runner: () => { throw new Error('git exploded'); },
    });
    expect(r.current).toBe(false);
    expect(r.reason).toBe('git_error');
  });

  it('a TIMEOUT yields NOT-CURRENT', () => {
    const r = assessTreeCurrency({
      dir: '/anywhere',
      runner: () => { const e = new Error('timed out'); e.killed = true; e.signal = 'SIGTERM'; throw e; },
    });
    expect(r.current).toBe(false);
  });

  it('an unparseable behind-count yields NOT-CURRENT rather than a silent 0', () => {
    const r = assessTreeCurrency({
      dir: '/anywhere',
      runner: (args) => {
        if (args[0] === 'fetch') return '';
        if (args.includes('--abbrev-ref')) return 'main\n';
        if (args[0] === 'status') return '';
        return 'not-a-number\n';
      },
    });
    expect(r.current).toBe(false);
  });

  it('this is the DELIBERATE INVERSE of lib/governance/checkout-freshness.js', () => {
    // That module returns FRESH on any git error (its :112-117 fail-open branch) and
    // has five advisory startup-badge consumers, so it is left untouched rather than
    // inverted in place. A fail-open gauge is the habit-with-monitoring this SD rejects.
    const freshness = require('../../../lib/governance/checkout-freshness.js');
    expect(freshness).toBeDefined();
    const r = assessTreeCurrency({ dir: '/anywhere', runner: () => { throw new Error('boom'); } });
    expect(r.current).toBe(false);
  });
});

describe('TS-3: the decision table (injected runner)', () => {
  const runnerFor = ({ branch = 'main', behind = '0', dirty = '' }) => (args) => {
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return `${branch}\n`;
    if (args[0] === 'status') return dirty;
    if (args[0] === 'rev-list') return `${behind}\n`;
    return '';
  };

  it('current + clean + main => CURRENT', () => {
    const r = assessTreeCurrency({ dir: '/x', runner: runnerFor({}) });
    expect(r.current).toBe(true);
  });

  it('behind + clean + main => NOT-CURRENT, and SELF-HEALABLE', () => {
    const r = assessTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '4' }) });
    expect(r.current).toBe(false);
    expect(r.behind).toBe(4);
    expect(r.selfHealable).toBe(true);
  });

  it('behind + DIRTY => NOT-CURRENT and NOT self-healable (never mutate a dirty tree)', () => {
    const r = assessTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '4', dirty: ' M a.txt\n' }) });
    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false);
  });

  it('behind + OFF-MAIN => NOT-CURRENT and NOT self-healable', () => {
    const r = assessTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '4', branch: 'feat/x' }) });
    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false);
  });

  it('DETACHED HEAD => NOT-CURRENT and NOT self-healable', () => {
    const r = assessTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '4', branch: 'HEAD' }) });
    expect(r.current).toBe(false);
    expect(r.selfHealable).toBe(false);
  });

  it('exposes a default base ref so callers do not each hardcode one', () => {
    expect(DEFAULT_BASE_REF).toBe('origin/main');
  });
});
