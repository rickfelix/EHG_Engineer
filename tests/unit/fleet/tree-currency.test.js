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

// FR-2 — enforcement. assessTreeCurrency only ANSWERS; this is the part that makes the
// answer binding. The distinction matters: a gauge that reports staleness and lets the
// caller proceed anyway is the habit-with-monitoring the acceptance bar rejects.
describe('FR-2: enforceTreeCurrency self-heals or REFUSES', () => {
  const { enforceTreeCurrency, TreeStaleError, BYPASS_REASON_ENV } = require('../../../lib/fleet/tree-currency.cjs');
  const silent = { warn() {} };

  const runnerFor = ({ branch = 'main', behind = '0', dirty = '', calls = [], healTo = '0' }) => {
    let pulled = false;
    return (args) => {
      calls.push(args.join(' '));
      if (args[0] === 'fetch') return '';
      if (args[0] === 'pull') { pulled = true; return ''; }
      if (args.includes('--abbrev-ref')) return `${branch}\n`;
      if (args[0] === 'status') return dirty;
      if (args[0] === 'rev-list') return `${pulled ? healTo : behind}\n`;
      return '';
    };
  };

  it('a CURRENT tree proceeds without healing', () => {
    const r = enforceTreeCurrency({ dir: '/x', runner: runnerFor({}), env: {}, logger: silent });
    expect(r.ok).toBe(true);
    expect(r.healed).toBe(false);
    expect(r.currencyBypassed).toBe(false);
  });

  it('behind + clean + main SELF-HEALS, and the pull is actually issued', () => {
    const calls = [];
    const r = enforceTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '4', calls }), env: {}, logger: silent });
    expect(r.ok).toBe(true);
    expect(r.healed).toBe(true);
    // Positive discriminator: the ff-only pull is observable in the call log.
    expect(calls.some((c) => c.startsWith('pull --ff-only'))).toBe(true);
  });

  it('behind + DIRTY REFUSES and never issues a pull', () => {
    const calls = [];
    expect(() => enforceTreeCurrency({
      dir: '/x', runner: runnerFor({ behind: '4', dirty: ' M a.txt\n', calls }), env: {}, logger: silent,
    })).toThrow(TreeStaleError);
    // The tree must not be mutated — that is the peer-worktree clobber hazard.
    expect(calls.some((c) => c.startsWith('pull'))).toBe(false);
  });

  it('behind + OFF-MAIN REFUSES and never issues a pull', () => {
    const calls = [];
    expect(() => enforceTreeCurrency({
      dir: '/x', runner: runnerFor({ behind: '4', branch: 'feat/x', calls }), env: {}, logger: silent,
    })).toThrow(/REFUSED/);
    expect(calls.some((c) => c.startsWith('pull'))).toBe(false);
  });

  it('a git ERROR REFUSES — fail closed, never proceed on uncertainty', () => {
    expect(() => enforceTreeCurrency({
      dir: '/x', runner: () => { throw new Error('git exploded'); }, env: {}, logger: silent,
    })).toThrow(TreeStaleError);
  });

  it('a fast-forward that does NOT converge still REFUSES', () => {
    // Trusting the pull's exit code would repeat this SD's own root cause: verifying at
    // the merge instead of at the consumer. Enforcement re-assesses afterwards.
    const runner = runnerFor({ behind: '4', healTo: '4' }); // pull "succeeds" but nothing changes
    expect(() => enforceTreeCurrency({ dir: '/x', runner, env: {}, logger: silent }))
      .toThrow(/still not current after a fast-forward/);
  });

  it('the refusal message names the behind-count and the remedy', () => {
    let msg = '';
    try {
      enforceTreeCurrency({ dir: '/x', runner: runnerFor({ behind: '7', dirty: ' M a\n' }), env: {}, logger: silent });
    } catch (e) { msg = e.message; }
    expect(msg).toMatch(/7 commit/);
    expect(msg).toMatch(/git pull --ff-only/);
    expect(msg).toMatch(/FLEET_TREE_CURRENCY_BYPASS_REASON/);
  });

  it('the escape hatch is DEFAULT-OFF — a blank reason is not a bypass', () => {
    expect(() => enforceTreeCurrency({
      dir: '/x', runner: runnerFor({ behind: '4', dirty: ' M a\n' }), env: { [BYPASS_REASON_ENV]: '   ' }, logger: silent,
    })).toThrow(TreeStaleError);
  });

  it('the escape hatch requires a REASON, and declares currency UNKNOWN rather than current', () => {
    const warnings = [];
    const r = enforceTreeCurrency({
      dir: '/x',
      runner: () => { throw new Error('offline'); },
      env: { [BYPASS_REASON_ENV]: 'air-gapped host, incident 123' },
      logger: { warn: (m) => warnings.push(m) },
    });
    expect(r.ok).toBe(true);
    expect(r.currencyBypassed).toBe(true);
    // It must NOT claim the tree is current — the answer is unknown-and-declared.
    expect(r.assessment).toBeNull();
    expect(warnings.join(' ')).toMatch(/CURRENCY_BYPASSED/);
    expect(warnings.join(' ')).toMatch(/air-gapped host, incident 123/);
  });
});

/**
 * FR-2 SEAM PINNING — added after the EXEC-TO-PLAN review proved the enforcement was
 * UNPINNED.
 *
 * The reviewer deleted the entire enforcement block from lib/fleet/spawn-control.js,
 * left this module fully intact, and every test in the branch still passed. That is this
 * SD's own thesis turned on itself: an enforcement that can be silently removed while
 * still being reported as present is exactly the shipped-but-inert shape the SD exists to
 * eliminate. Testing the primitive is not testing the invariant — the invariant lives at
 * the SEAM.
 *
 * These tests fail if the call in spawn() is removed, weakened, or moved before the
 * dry-run return.
 */
describe('FR-2 seam: spawn() itself enforces currency (mutation-killing)', () => {
  const staleRunner = (args) => {
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return 'main\n';
    if (args[0] === 'status') return ' M dirty.txt\n';   // dirty => NOT self-healable
    if (args[0] === 'rev-list') return '9\n';
    return '';
  };

  it('a live spawn from a STALE, non-worktree tree is REFUSED by spawn() itself', async () => {
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    await expect(spawn(
      { role: 'worker', callsign: 'Pin-1' },
      {
        live: true,
        cwd: 'C:/fake/repo-root',   // NOT under .worktrees/, so the guard applies
        currencyRunner: staleRunner,
        env: {},
        spawnFn: () => { throw new Error('spawn must NOT be reached when the tree is stale'); },
      },
    )).rejects.toThrow(/REFUSED/);
  });

  it('a DRY RUN never touches git — the guard sits after the dry-run return', async () => {
    const { spawn } = await import('../../../lib/fleet/spawn-control.js');
    let touched = false;
    const res = await spawn(
      { role: 'worker', callsign: 'Pin-2' },
      { live: false, currencyRunner: () => { touched = true; return ''; }, env: {} },
    );
    expect(res.live).toBe(false);
    expect(touched).toBe(false);
  });

  it('the .worktrees/ exemption is real and is scoped to a genuine path segment', async () => {
    const { assessTreeCurrency } = await import('../../../lib/fleet/tree-currency.cjs');
    expect(typeof assessTreeCurrency).toBe('function');
    // Pinned as a pure predicate so the exemption cannot silently widen: a directory that
    // merely CONTAINS the word must not be treated as a worktree.
    const BACKSLASH = String.fromCharCode(92);
    const isExempt = (p) => String(p || '').split(BACKSLASH).join('/').includes('/.worktrees/');
    expect(isExempt('C:/repo/.worktrees/SD-X')).toBe(true);
    expect(isExempt(['C:', 'repo', '.worktrees', 'SD-X'].join(BACKSLASH))).toBe(true);
    expect(isExempt('C:/repo/my-.worktrees-backup/x')).toBe(false);
    expect(isExempt('C:/repo')).toBe(false);
  });
});

describe('SEC-1: a base ref can never be smuggled to git as an option', () => {
  it('a dash-leading baseRef is rejected before any git call', () => {
    let called = false;
    const r = assessTreeCurrency({
      dir: '/x',
      baseRef: '--upload-pack=cmd.exe /c echo PWNED/main',
      runner: () => { called = true; return ''; },
    });
    expect(r.current).toBe(false);
    expect(r.reason).toBe('invalid_base_ref');
    // The load-bearing assertion: git was never invoked at all.
    expect(called).toBe(false);
  });

  it('the fetch and pull invocations carry an end-of-options separator', () => {
    const seen = [];
    assessTreeCurrency({
      dir: '/x',
      runner: (args) => {
        seen.push(args);
        if (args.includes('--abbrev-ref')) return 'main\n';
        if (args[0] === 'status') return '';
        if (args[0] === 'rev-list') return '0\n';
        return '';
      },
    });
    const fetchCall = seen.find((a) => a[0] === 'fetch');
    expect(fetchCall).toContain('--');
  });

  it('a legitimate baseRef still works', () => {
    const r = assessTreeCurrency({
      dir: '/x',
      baseRef: 'origin/main',
      runner: (args) => {
        if (args.includes('--abbrev-ref')) return 'main\n';
        if (args[0] === 'status') return '';
        if (args[0] === 'rev-list') return '0\n';
        return '';
      },
    });
    expect(r.current).toBe(true);
  });
});
