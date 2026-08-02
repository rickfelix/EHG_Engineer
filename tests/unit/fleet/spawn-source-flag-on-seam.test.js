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
function recordingCurrencyRunner({ branch, behind }) {
  const seen = [];
  const runner = (args, o) => {
    seen.push({ args, cwd: o && o.cwd });
    if (args[0] === 'fetch') return '';
    if (args.includes('--abbrev-ref')) return `${branch}\n`;
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-list') return `${behind}\n`;
    return '';
  };
  return { runner, seen };
}

function spawnOpts({ branch, behind, exists = true }) {
  const rec = recordingCurrencyRunner({ branch, behind });
  const gitCalls = [];
  return {
    rec,
    gitCalls,
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
      spawnSourceRunner: (args) => { gitCalls.push(args.join(' ')); return ''; },
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

  it('REFRESHES the existing tree before the guard reads it, in that order', async () => {
    const { gitCalls, rec, opts } = spawnOpts({ branch: SPAWN_SOURCE_BRANCH, behind: 0 });
    await spawn({ role: 'worker', callsign: 'Alpha-5' }, opts);

    // The refresh must happen through the spawn-source runner...
    expect(gitCalls.some((c) => c.includes('merge --ff-only'))).toBe(true);
    expect(gitCalls.some((c) => c.includes('worktree add'))).toBe(false); // it already exists
    // ...and the guard must have run after it, or the guard would judge a pre-refresh tree.
    expect(rec.seen.length).toBeGreaterThan(0);
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

  it('with the flag OFF the spawn-source runner is never touched — the default stays byte-identical', async () => {
    const { gitCalls, rec, opts } = spawnOpts({ branch: 'main', behind: 0 });
    await spawn({ role: 'worker', callsign: 'Alpha-5' }, { ...opts, currencyEnv: {} });

    expect(gitCalls).toEqual([]);
    // And the guard went back to judging the spawning tree, not the spawn source.
    for (const call of rec.seen) expect(call.cwd).not.toBe(SPAWN_SOURCE_DIR);
  });
});
