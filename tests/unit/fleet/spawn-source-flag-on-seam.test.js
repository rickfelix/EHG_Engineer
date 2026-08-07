/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-2 — the test whose ABSENCE let the bug ship.
 *
 * Everything else about this rollout was tested. Five mutants proved the flag gate DEFAULTS OFF
 * correctly. Unit suites proved every pure function computes correctly. The suite was green at 2555
 * tests. And the ON path would still have refused every spawn in the fleet, because the tree was
 * created `--detach` and assessTreeCurrency rejects any detached worktree as `detached_head`
 * regardless of how pristine it is.
 *
 * The reason nothing caught it: with the flag defaulting OFF, EVERY test — and CI, and each mutant
 * run — took the OFF path. The ON path shipped unexecuted. A default-OFF flag makes a change safe
 * to LAND; it does not make it tested, and the two feel identical from inside a green suite.
 *
 * So this file does the one thing that was missing: it forces FLEET_SPAWN_SOURCE_TREE ON, drives
 * the real spawn() path, and asserts the DOWNSTREAM VERDICT — not that a branch was taken, but what
 * the guard concluded about the tree we actually point it at.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn, SPAWN_SOURCE_BRANCH, resolveSpawnSourceDir } from '../../../lib/fleet/spawn-control.js';

vi.mock('node:child_process', async (orig) => {
  const actual = await orig();
  return { ...actual, spawn: vi.fn(() => ({ pid: 4242, unref: vi.fn() })) };
});

const REPO_ROOT = 'C:/repo';
const SPAWN_SOURCE_DIR = resolveSpawnSourceDir(REPO_ROOT, {});

function enumExec(handle = 131074) {
  let call = 0;
  return vi.fn(async () => ({ stdout: (call += 1) === 1 ? '' : `${handle}|5555|WindowsTerminal|Claude Code` }));
}

function fakeSupabase() {
  const store = new Map();
  return {
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select: () => ({
            in: async () => ({ data: [] }),
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'session_coordination') {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    _store: store,
  };
}

/**
 * Records which directory the currency guard was pointed at. This is the whole point: the bug was
 * never in whether the flag branch executed — it was in what the guard SAID about the destination.
 */
function recordingCurrencyRunner({ branch, behind }, sequence = []) {
  const seen = [];
  const runner = (args, o) => {
    seen.push({ args, cwd: o && o.cwd });
    sequence.push('guard:' + args[0]);
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return `${branch}\n`;
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') return `${behind}\n`;
    return '';
  };
  return { runner, seen };
}

function spawnOpts({ branch, behind, exists = true }) {
  // ONE shared ordered log across BOTH runners. Two separate per-runner logs can only tell you
  // that each thing happened, never which came first — see the ordering test below.
  const sequence = [];
  const rec = recordingCurrencyRunner({ branch, behind }, sequence);
  const gitCalls = [];
  return {
    rec,
    gitCalls,
    sequence,
    opts: {
      live: true,
      spawnFn: vi.fn(() => ({ pid: 1, unref: vi.fn() })),
      execFn: enumExec(),
      sleepFn: vi.fn(),
      supabaseClient: fakeSupabase(),
      currencyEnv: { FLEET_SPAWN_SOURCE_TREE: 'true' },
      currencyRunner: rec.runner,
      repoRoot: REPO_ROOT,
      spawnSourceExists: () => exists,
      spawnSourceRunner: (args) => {
        gitCalls.push(args.join(' '));
        sequence.push(args.includes('--ff-only') ? 'refresh' : 'spawnsource:' + args.join(' ').slice(0, 24));
        return '';
      },
    },
  };
}

describe('FR-2 seam: FLEET_SPAWN_SOURCE_TREE forced ON', () => {
  beforeEach(() => vi.clearAllMocks());

  it('points the currency guard at the SPAWN-SOURCE tree, not at the spawning tree', async () => {
    const { rec, opts } = spawnOpts({ branch: SPAWN_SOURCE_BRANCH, behind: 0 });
    await spawn({ role: 'worker', callsign: 'Alpha-5' }, opts);

    expect(rec.seen.length).toBeGreaterThan(0);
    for (const call of rec.seen) expect(call.cwd).toBe(SPAWN_SOURCE_DIR);
  });

  it('SPAWNS SUCCESSFULLY with the flag ON — the assertion that would have failed before the fix', async () => {
    // Before the siting fix this threw TreeStaleError(detached_head): the tree reported branch
    // 'HEAD', which assessTreeCurrency refuses no matter how clean or current it is.
    const { opts } = spawnOpts({ branch: SPAWN_SOURCE_BRANCH, behind: 0 });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, opts);
    expect(result.live).toBe(true);
  });

  it('a DETACHED spawn-source tree still refuses — the exact defect, pinned at the seam', async () => {
    // Drives the guard with what a --detach tree reports. If anyone reintroduces detached creation
    // this is the failure they will see, stated in terms of the spawn outcome rather than an argv.
    const { opts } = spawnOpts({ branch: 'HEAD', behind: 0 });
    await expect(spawn({ role: 'worker', callsign: 'Alpha-5' }, opts)).rejects.toThrow(/TREE_NOT_CURRENT|detached|not current/i);
  });

  it('REFRESHES the existing tree BEFORE the guard reads it — asserted as an ORDER, not a pair of facts', async () => {
    // REWRITTEN after independent review (coordinator testing-agent, evidence row 6ecbbd8c). The
    // previous version was named "...in that order" and did not assert order at all: it checked
    // that a ff-only merge was issued AND that the guard had run at least once. Swapping the
    // refresh and the guard would have kept it green — a test asserting something weaker than its
    // own name, which is precisely this SD's defect class showing up in my own suite.
    //
    // Order is load-bearing: a guard that reads the tree BEFORE the refresh judges a pre-refresh
    // tree, so a stale spawn source would be reported current-or-not on the wrong snapshot.
    const { sequence, gitCalls, opts } = spawnOpts({ branch: SPAWN_SOURCE_BRANCH, behind: 0 });
    await spawn({ role: 'worker', callsign: 'Alpha-5' }, opts);

    const refreshAt = sequence.indexOf('refresh');
    const firstGuardAt = sequence.findIndex((s) => s.startsWith('guard:'));

    expect(refreshAt, 'no ff-only refresh was issued at all').toBeGreaterThanOrEqual(0);
    expect(firstGuardAt, 'the currency guard never ran').toBeGreaterThanOrEqual(0);
    expect(refreshAt, `refresh must precede the guard; sequence was ${JSON.stringify(sequence)}`)
      .toBeLessThan(firstGuardAt);

    expect(gitCalls.some((c) => c.includes('worktree add'))).toBe(false); // it already exists
  });

  it('CREATES the tree on a branch when absent, and the created tree passes the guard', async () => {
    const { gitCalls, opts } = spawnOpts({ branch: SPAWN_SOURCE_BRANCH, behind: 0, exists: false });
    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, opts);

    const add = gitCalls.find((c) => c.includes('worktree add'));
    expect(add).toBeDefined();
    expect(add).toContain('-B');
    expect(add).not.toContain('--detach'); // the whole bug, in one assertion
    expect(result.live).toBe(true);
  });

  it('a THROWING worktree-add falls back to the spawning tree instead of taking the fleet down', async () => {
    // C3 from independent review (evidence row 6ecbbd8c). ensureSpawnSourceWorktree already
    // fail-softs a failed REFRESH, but a throwing creation propagated out of spawn() — so under
    // flag-ON one bad `git worktree add` was a hard fleet-wide spawn outage while the equivalent
    // refresh failure was tolerated. Asymmetric, unintended, and previously untested.
    const { rec, opts } = spawnOpts({ branch: 'main', behind: 0, exists: false });
    const boom = { ...opts, spawnSourceRunner: () => { throw new Error('fatal: could not create work tree'); } };

    const result = await spawn({ role: 'worker', callsign: 'Alpha-5' }, boom);

    expect(result.live).toBe(true); // spawned anyway
    // and the guard fell back to judging the SPAWNING tree, not a spawn source that does not exist
    for (const call of rec.seen) expect(call.cwd).not.toBe(SPAWN_SOURCE_DIR);
  });

  it('...but a MIS-SITED tree stays FATAL — failing soft there would leave the spawn silently unguarded', async () => {
    // The one exception to the fallback. A tree under .worktrees/ is EXEMPT from the currency
    // check, so tolerating it would hand back exactly the false assurance the guard exists to
    // prevent. This is the two-sided half of the test above: a fallback that swallowed EVERYTHING
    // would pass the previous test while destroying the invariant.
    const { opts } = spawnOpts({ branch: 'main', behind: 0, exists: false });
    const misSited = { ...opts, currencyEnv: { FLEET_SPAWN_SOURCE_TREE: 'true', FLEET_SPAWN_SOURCE_DIR: '/repo/.worktrees/src' } };

    await expect(spawn({ role: 'worker', callsign: 'Alpha-5' }, misSited))
      .rejects.toThrow(/may not sit under \.worktrees\//);
  });

  it('with the flag OFF the spawn-source runner is never touched — the default stays byte-identical', async () => {
    const { gitCalls, rec, opts } = spawnOpts({ branch: 'main', behind: 0 });
    await spawn({ role: 'worker', callsign: 'Alpha-5' }, { ...opts, currencyEnv: {} });

    expect(gitCalls).toEqual([]);
    // And the guard went back to judging the spawning tree, not the spawn source.
    for (const call of rec.seen) expect(call.cwd).not.toBe(SPAWN_SOURCE_DIR);
  });
});
