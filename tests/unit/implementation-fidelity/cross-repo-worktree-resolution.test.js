/**
 * SD-FDBK-ENH-GATE2-IMPLEMENTATION-FIDELITY-002 — GATE2_IMPLEMENTATION_FIDELITY
 * cross-repo worktree resolution.
 *
 * detectImplementationRepos() runs a worktree-agnostic `git --all` commit scan (worktrees
 * share the repo .git object DB), so it collects repo ROOTS. The downstream section
 * validators then run non-`--all` FILESYSTEM scans (migration dirs, test dirs, readFile)
 * that read the on-disk checkout. For an EHG-targeted SD whose code is in an ehg worktree
 * on a non-default branch, scanning the root (parked on another branch) misses the files
 * → false-RED ~68 → forced --bypass-validation.
 *
 * The fix redirects each resolved repo to its SD worktree via resolveWorktreeCwd
 * (mirroring SD-LEO-INFRA-BRANCH-AWARE-PLAN-001's GATE5/GATE6 fix), passing the SD-KEY
 * (not a UUID), with null-fallback (byte-identical) and normalize+dedup.
 *
 * CASE-A EHG worktree redirect (the fix) | CASE-B EHG_Engineer self-target byte-identical
 * CASE-C SD-KEY (not UUID) passed to resolver | CASE-D dedup | CASE-E EHG_Engineer-in-worktree
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted, mutable fixture the vi.mock factories read.
const h = vi.hoisted(() => ({
  worktreeReturn: null, // value (or fn(appPath,opts)) resolveWorktreeCwd returns
  resolveCalls: [],     // recorded { appPath, opts }
  foundSet: new Set(),  // repos whose `git --all --grep` "finds" a commit
}));

// Hermetic search terms: the SD-KEY is the first SD- term (drives worktree resolution).
vi.mock('../../../scripts/modules/implementation-fidelity/utils/git-helpers.js', () => ({
  getSDSearchTerms: async () => ['SD-TEST-EHG-001', 'feature work'],
  gitLogForSD: async () => '',
}));

// Controllable worktree resolver — records every call so we can assert the SD-KEY is passed.
vi.mock('../../../lib/resolve-worktree-cwd.js', () => ({
  resolveWorktreeCwd: (appPath, opts) => {
    h.resolveCalls.push({ appPath, opts });
    return typeof h.worktreeReturn === 'function' ? h.worktreeReturn(appPath, opts) : h.worktreeReturn;
  },
  listActiveWorktrees: () => [],
}));

// `git --all --grep` stub: report a commit for repos in h.foundSet.
vi.mock('child_process', () => ({
  exec: (cmd, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    const m = /-C "([^"]+)"/.exec(cmd);
    const repo = m ? m[1] : '';
    const norm = repo.replace(/\\/g, '/');
    const found = [...h.foundSet].some((r) => r.replace(/\\/g, '/') === norm);
    cb(null, { stdout: found ? 'abc1234\n' : '', stderr: '' });
  },
}));

// Force the registry-miss fallback so candidateRepos === [EHG_ROOT, EHG_ENGINEER_ROOT].
vi.mock('fs/promises', () => ({
  readFile: async () => { throw new Error('no registry (test fixture)'); },
}));

const { detectImplementationRepos, clearImplementationReposCache, EHG_ROOT, EHG_ENGINEER_ROOT } = await import(
  '../../../scripts/modules/implementation-fidelity/utils/repo-detection.js'
);

// Minimal chainable supabase stub: target_application query resolves to null
// (→ registry path → readFile throws → [EHG_ROOT, EHG_ENGINEER_ROOT] fallback).
function makeSupabase() {
  const chain = {
    from: () => chain,
    select: () => chain,
    or: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
  };
  return chain;
}

describe('GATE2 cross-repo worktree resolution (SD-FDBK-ENH-GATE2-IMPLEMENTATION-FIDELITY-002)', () => {
  beforeEach(() => {
    clearImplementationReposCache(); // QF-20260602-767: reset the per-sd_id memo so cases reusing an sd_id see fresh detection
    h.worktreeReturn = null;
    h.resolveCalls = [];
    h.foundSet = new Set();
  });

  it('CASE-A: redirects a found repo to its SD worktree', async () => {
    h.foundSet = new Set([EHG_ROOT]);
    h.worktreeReturn = '/wt/ehg-SD-TEST-EHG-001';

    // sd_id is a UUID — the worktree resolution must still use the SD-KEY from search terms.
    const result = await detectImplementationRepos('11111111-2222-3333-4444-555555555555', makeSupabase());

    expect(result).toEqual(['/wt/ehg-SD-TEST-EHG-001']);
    const callForEhg = h.resolveCalls.find((c) => c.appPath === EHG_ROOT);
    expect(callForEhg).toBeTruthy();
    expect(callForEhg.opts.sdId).toBe('SD-TEST-EHG-001');
  });

  it('CASE-B: byte-identical when no worktree matches (resolver returns null)', async () => {
    h.foundSet = new Set([EHG_ROOT]);
    h.worktreeReturn = null; // no worktree → fall back to the repo root unchanged

    const result = await detectImplementationRepos('SD-TEST-EHG-001', makeSupabase());

    expect(result).toEqual([EHG_ROOT]);
  });

  it('CASE-C: passes the SD-KEY (not the UUID) to resolveWorktreeCwd', async () => {
    h.foundSet = new Set([EHG_ROOT]);
    h.worktreeReturn = '/wt/ehg';

    await detectImplementationRepos('11111111-2222-3333-4444-555555555555', makeSupabase());

    expect(h.resolveCalls.length).toBeGreaterThan(0);
    for (const c of h.resolveCalls) {
      expect(c.opts.sdId).toBe('SD-TEST-EHG-001'); // SD-KEY form, matches extractSdId
      expect(c.opts.sdId).not.toMatch(/^[0-9a-f]{8}-/i); // never a UUID
    }
  });

  it('CASE-D: de-duplicates when multiple repos resolve to the same worktree', async () => {
    h.foundSet = new Set([EHG_ROOT, EHG_ENGINEER_ROOT]);
    h.worktreeReturn = () => '/wt/shared'; // both repos collapse to one path

    const result = await detectImplementationRepos('SD-TEST-EHG-001', makeSupabase());

    expect(result).toEqual(['/wt/shared']); // single, de-duplicated entry
  });

  it('CASE-E: redirects an EHG_Engineer-resident SD to its EHG_Engineer worktree', async () => {
    h.foundSet = new Set([EHG_ENGINEER_ROOT]);
    h.worktreeReturn = (appPath) => (appPath === EHG_ENGINEER_ROOT ? '/wt/engineer-SD-TEST-EHG-001' : null);

    const result = await detectImplementationRepos('SD-TEST-EHG-001', makeSupabase());

    expect(result).toEqual(['/wt/engineer-SD-TEST-EHG-001']);
  });
});
