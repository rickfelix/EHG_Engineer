/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1 — spawn-source worktree creation and reuse.
 *
 * Written with an injected exists-probe and git runner, matching the fleet suite's established
 * pattern (runnerFor in tree-currency.test.js, opts.currencyRunner in spawn-control), so the
 * decision logic is assertable without touching a real repo.
 *
 * The reuse case matters more than the create case: the fleet spawns constantly, so a
 * create-every-time implementation would work exactly once and then fail on every subsequent
 * spawn — a defect that would only surface under load.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  ensureSpawnSourceWorktree,
  buildSpawnSourceWorktreeArgs,
  buildSpawnSourceUpdateArgs,
  resolveSpawnSourceDir,
  SPAWN_SOURCE_BRANCH,
} from '../../../lib/fleet/spawn-control.js';

describe('FR-1: buildSpawnSourceWorktreeArgs', () => {
  it('builds an argv array, never a shell string', () => {
    const args = buildSpawnSourceWorktreeArgs('/repo/.spawn-source', 'origin/main');
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(['worktree', 'add', '-B', 'spawn-source', '/repo/.spawn-source', 'origin/main']);
  });

  it('must NOT use --detach — the assertion this file shipped with, rewritten because it was wrong', () => {
    // Previously pinned as "uses --detach: the spawn source is a read-only snapshot, never a
    // branch". The rationale was half right: a branch checkout collides only with a SHARED name.
    // The conclusion was fatal — assessTreeCurrency rejects any detached tree as detached_head, so
    // the spawn source was refused no matter how pristine it was. Rewritten deliberately (FR-5),
    // not deleted, so the reversal is visible to whoever reads this next.
    expect(buildSpawnSourceWorktreeArgs('/d', 'origin/main')).not.toContain('--detach');
  });

  it('puts the tree on a DEDICATED branch, so it collides with neither main nor any SD worktree', () => {
    const args = buildSpawnSourceWorktreeArgs('/d', 'origin/main');
    expect(args).toContain('-B');
    expect(args).toContain(SPAWN_SOURCE_BRANCH);
    expect(SPAWN_SOURCE_BRANCH).not.toBe('main'); // main is already checked out in the shared root
  });
});

describe('FR-2: buildSpawnSourceUpdateArgs', () => {
  it('fetches then fast-forwards, both scoped to the tree with -C', () => {
    const [fetchArgs, mergeArgs] = buildSpawnSourceUpdateArgs('/repo/.spawn-source', 'origin/main');
    expect(fetchArgs).toEqual(['-C', '/repo/.spawn-source', 'fetch', '--quiet', '--', 'origin', 'main']);
    expect(mergeArgs).toEqual(['-C', '/repo/.spawn-source', 'merge', '--ff-only', '--quiet', 'origin/main']);
  });

  it('introduces NO reset, clean or stash — FR-2 forbids them outright', () => {
    // Assert on TOKENS, not on a joined string. The first version of this test joined the argv and
    // used toContain, which failed on '-f' because it is a substring of '--ff-only' — a forbidden
    // -f would have been indistinguishable from the fast-forward flag we require. A substring
    // check over a flattened command line cannot tell an argument from part of one.
    const tokens = buildSpawnSourceUpdateArgs('/d', 'origin/main').flat();
    for (const forbidden of ['reset', 'clean', 'stash', '--force', '-f', '--hard']) {
      expect(tokens, `forbidden token present: ${forbidden}`).not.toContain(forbidden);
    }
    expect(tokens).toContain('--ff-only'); // and the one we DO require survived the check above
  });

  it('uses -- before the refspec so a hostile base ref cannot be read as an option', () => {
    // Same class as the SEC-1 note in tree-currency.cjs: a value leading with a dash is parsed by
    // git as an OPTION, and --upload-pack=<program> is a command-execution primitive.
    const [fetchArgs] = buildSpawnSourceUpdateArgs('/d', 'origin/main');
    expect(fetchArgs).toContain('--');
    expect(fetchArgs.indexOf('--')).toBeLessThan(fetchArgs.indexOf('origin'));
  });
});

/**
 * EXEC SECURITY S2: the reuse path now IDENTITY-PROBES the directory (`rev-parse --git-common-dir`
 * on both the candidate and the repo root) before running git in it, because existence was never
 * identity. A fixture whose runner answers nothing reads as "unverifiable => refuse", so these
 * mocks answer the probe as a GENUINE linked worktree — same common dir as the repo root.
 * The REFUSAL cases are not smuggled in here; they live in tests/unit/fleet/source-tree-identity.test.js.
 */
const isIdentityProbe = (args) => args.includes('rev-parse')
  && (args.includes('--git-common-dir') || args.includes('--show-toplevel'));
const gitMock = (impl) => vi.fn((args) => {
  // --show-toplevel is the S2-R position check: real git returns an absolute path, and for a
  // genuine linked worktree that path IS the directory itself.
  if (args.includes('--show-toplevel')) return path.resolve(args[1]) + '\n';
  if (args.includes('--absolute-git-dir')) return `/repo/.git/worktrees/${path.basename(args[1])}\n`;
  if (isIdentityProbe(args)) return '/repo/.git\n';
  // S2-R4 ancestry probe, answered as "at or behind" — the honest shape for a tree that tracks its
  // base. Deliberately NOT routed through `impl`: a fixture that throws here would be asserting
  // "ancestry unverifiable", a different condition from "the refresh failed". The AHEAD case is
  // exercised against real git in source-tree-identity-realgit.test.js.
  if (args.includes('merge-base')) return '';
  // CI-1 content probe, answered as CLEAN. Also deliberately not routed through `impl`: a fixture
  // that threw here would assert "content unverifiable", which is a different condition from
  // "the refresh failed". The dirty/gitignored-plant cases are driven against real git in
  // source-tree-identity-realgit.test.js, because a mock cannot model gitignore semantics.
  if (args.includes('status')) return '';
  return impl ? impl(args) : undefined;
});
// common-dir on the candidate, common-dir on the repo root, --show-toplevel on the candidate, and
// --absolute-git-dir on the candidate (check 3, which is the only one that rejects a forged linkage).
const IDENTITY_PROBES = 4; // reuse path only
const ANCESTRY_PROBES = 1; // merge-base --is-ancestor HEAD <baseRef>, after the refresh
const CONTENT_PROBES = 1;  // status --porcelain --untracked-files=all --ignored=matching (CI-1)

describe('FR-1: ensureSpawnSourceWorktree', () => {
  const deps = (existsResult) => ({
    repoRoot: '/repo',
    exists: vi.fn(() => existsResult),
    runner: gitMock(),
    env: {},
  });

  it('creates the tree once when it is absent', () => {
    const d = deps(false);
    const out = ensureSpawnSourceWorktree(d);
    expect(out.created).toBe(true);
    expect(out.dir).toBe(resolveSpawnSourceDir('/repo', {}));
    expect(d.runner).toHaveBeenCalledTimes(1);
    expect(d.runner).toHaveBeenCalledWith(expect.arrayContaining(['worktree', 'add', '-B']));
  });

  it('REUSES an existing tree without RE-CREATING it — the load-bearing case', () => {
    // Rewritten (FR-5). This previously asserted reuse issued NO git command at all. That was half
    // the shipped bug: a tree created once and never advanced is current only until the next
    // merge, and nothing else will ever advance it — tree-currency self-heals only a clean tree on
    // 'main', and the spawn source is deliberately neither. The load-bearing property was never
    // "silent"; it was "does not re-create". That is what is pinned now.
    const d = deps(true);
    const out = ensureSpawnSourceWorktree(d);
    expect(out.created).toBe(false);
    const verbs = d.runner.mock.calls.map((c) => c[0].join(' '));
    expect(verbs.some((v) => v.includes('worktree add'))).toBe(false);
    expect(verbs.some((v) => v.includes('merge --ff-only'))).toBe(true);
  });

  it('REFRESHES on reuse, so the tree is current at every spawn and not merely at creation', () => {
    const d = deps(true);
    const out = ensureSpawnSourceWorktree(d);
    expect(out.refreshed).toBe(true);
    // identity probes, then fetch + ff-only merge, then the S2-R4 ancestry probe.
    expect(d.runner).toHaveBeenCalledTimes(2 + IDENTITY_PROBES + ANCESTRY_PROBES + CONTENT_PROBES);
  });

  it('a FAILED refresh does not throw — the currency check is the authority, not this', () => {
    // Throwing here would turn a transient network blip into a fleet-wide spawn outage. The tree
    // simply stays behind and enforceTreeCurrency refuses it with the real reason.
    // The identity probe SUCCEEDS and the refresh fails — that is the real shape of a network blip.
    // (A runner that threw on the probe too would be refused as unverifiable, testing nothing here.)
    const d = { ...deps(true), runner: gitMock(() => { throw new Error('network unreachable'); }) };
    const out = ensureSpawnSourceWorktree(d);
    expect(out.refreshed).toBe(false);
    expect(out.dir).toBe(resolveSpawnSourceDir('/repo', {}));
  });

  it('is idempotent across repeated calls once the tree exists — never a second creation', () => {
    const d = deps(true);
    for (let i = 0; i < 5; i++) expect(ensureSpawnSourceWorktree(d).created).toBe(false);
    const verbs = d.runner.mock.calls.map((c) => c[0].join(' '));
    expect(verbs.some((v) => v.includes('worktree add'))).toBe(false);
  });

  it('honours an explicit baseRef', () => {
    const d = deps(false);
    ensureSpawnSourceWorktree({ ...d, baseRef: 'origin/release' });
    expect(d.runner).toHaveBeenCalledWith(expect.arrayContaining(['origin/release']));
  });

  it('REFUSES BEFORE CREATING when the location would be exempt from the currency check', () => {
    // The guard must run before any side effect — creating first and validating after would
    // leave a silently-unguarded tree on disk.
    const d = deps(false);
    expect(() => ensureSpawnSourceWorktree({ ...d, env: { FLEET_SPAWN_SOURCE_DIR: '/repo/.worktrees/src' } }))
      .toThrow(/may not sit under \.worktrees\//);
    expect(d.runner).not.toHaveBeenCalled();
    expect(d.exists).not.toHaveBeenCalled();
  });
});
