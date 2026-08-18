/**
 * SD-LEO-INFRA-VENTURE-AWARE-COMPLETION-001 — regression pin for the venture-aware
 * completion-gate keystone. Covers the highest-risk surface:
 *   - FR-6 resolveGateRepoContext: platform short-circuit (NO DB call), venture DB-first,
 *     and FR-7 fail-closed (unresolvable venture → resolved:false, repoPath:null).
 *   - FR-3 computeReposForSD: platform single-repo byte-identical + venture single-repo
 *     (never the Tier-3 both-platform-repos scan) with github_repo registry-sourced.
 *
 * Platform-invariant (TR-4) is the load-bearing assertion: EHG / EHG_Engineer / null must
 * be byte-identical to pre-change and must NOT consult the DB.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import {
  resolveGateRepoContext,
  resolveRepoPath,
  resolveGitHubRepo,
  isVentureRepo,
  ENGINEER_ROOT,
} from '../../lib/repo-paths.js';
import { computeReposForSD } from '../../scripts/modules/handoff/executors/lead-final-approval/gates.js';

// Mirror tests/unit/repo-paths-db-first.test.js — from().select().eq().is() returning
// rows (the real chain lib/repo-paths.js:166-169 uses: .eq('status','active').is('deleted_at',null)),
// with a `from` spy to assert the platform path never queries the DB.
//
// SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001: this mock previously stopped at .eq(), which
// returned a Promise directly. The real code calls .is() on that Promise, throwing a
// TypeError that repo-paths.js's own try/catch (a correct fail-soft-to-registry guard)
// silently swallowed -- so the venture-DB-first test below fell through to the registry
// (a miss for "TestVenture") instead of exercising the real DB-hit path it was written to
// pin. Fixed by completing the chain. Each stage rejects if called with unexpected args or
// re-invoked, so a FUTURE chain change breaks loudly here instead of silently degrading.
function mockSupabase(rows, { throwOnQuery = false } = {}) {
  const is = vi.fn((column, value) => {
    if (column !== 'deleted_at' || value !== null) {
      throw new Error(`mock chain drift: .is(${JSON.stringify(column)}, ${JSON.stringify(value)}) does not match the expected .is('deleted_at', null) -- update mockSupabase to match lib/repo-paths.js's real query chain`);
    }
    return throwOnQuery ? Promise.reject(new Error('db down')) : Promise.resolve({ data: rows, error: null });
  });
  const eq = vi.fn((column, value) => {
    if (column !== 'status' || value !== 'active') {
      throw new Error(`mock chain drift: .eq(${JSON.stringify(column)}, ${JSON.stringify(value)}) does not match the expected .eq('status', 'active') -- update mockSupabase to match lib/repo-paths.js's real query chain`);
    }
    return { is };
  });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, spies: { from } };
}

describe('FR-6/TR-4 resolveGateRepoContext: platform short-circuit, NO DB call', () => {
  for (const targetApp of [null, undefined, 'EHG_Engineer', 'ehg_engineer', 'EHG', 'ehg']) {
    it(`target=${JSON.stringify(targetApp)} → isVenture:false, resolved:true, no DB query`, async () => {
      const { client, spies } = mockSupabase([{ name: 'X', local_path: 'D:/wrong', status: 'active' }]);
      const ctx = await resolveGateRepoContext({ target_application: targetApp }, client);
      expect(ctx.isVenture).toBe(false);
      expect(ctx.resolved).toBe(true);
      expect(spies.from).not.toHaveBeenCalled();
      // Byte-identical to the sync resolver (with ENGINEER_ROOT fallback for null).
      expect(ctx.repoPath).toBe(resolveRepoPath(targetApp) || ENGINEER_ROOT);
    });
  }
});

describe('FR-6/TS-2 resolveGateRepoContext: venture resolves DB-first', () => {
  it('venture target → DB local_path, isVenture:true, resolved:true', async () => {
    const dbPath = 'D:/db-authoritative/test-venture';
    const { client, spies } = mockSupabase([{ name: 'TestVenture', local_path: dbPath, status: 'active' }]);
    const ctx = await resolveGateRepoContext({ target_application: 'TestVenture' }, client);
    expect(ctx.isVenture).toBe(true);
    expect(ctx.resolved).toBe(true);
    expect(ctx.repoPath).toBe(path.resolve(dbPath));
    expect(spies.from).toHaveBeenCalled(); // venture path DID consult the DB
  });
});

describe('FR-7/TS-3 resolveGateRepoContext: unresolvable venture fails closed', () => {
  it('venture with no DB row and no registry entry → resolved:false, repoPath:null', async () => {
    const { client } = mockSupabase([]); // DB miss
    const ctx = await resolveGateRepoContext(
      { target_application: 'zzz-nonexistent-venture-xyz' },
      client,
    );
    expect(ctx.isVenture).toBe(true);
    expect(ctx.resolved).toBe(false);
    expect(ctx.repoPath).toBeNull();
    // NEVER silently route to a platform root (that would scan the wrong tree).
    expect(ctx.repoPath).not.toBe(ENGINEER_ROOT);
  });
});

describe('FR-3 computeReposForSD: platform byte-identical + venture single-repo', () => {
  it('EHG_Engineer → single EHG_Engineer repo (unchanged)', () => {
    const repos = computeReposForSD({ sd_key: 'SD-X', target_application: 'EHG_Engineer' });
    expect(repos).toHaveLength(1);
    expect(repos[0].githubRepo).toBe('rickfelix/EHG_Engineer');
  });

  it('EHG → single EHG repo (unchanged)', () => {
    const repos = computeReposForSD({ sd_key: 'SD-X', target_application: 'ehg' });
    expect(repos).toHaveLength(1);
    expect(repos[0].githubRepo).toBe('rickfelix/ehg');
  });

  it('no target_application → Tier-3 both-platform-repos fallback (unchanged)', () => {
    const repos = computeReposForSD({ sd_key: 'SD-X' });
    expect(repos).toHaveLength(2);
  });

  // Venture single-repo: only assert when the registry actually carries the venture
  // (github_repo + local_path). Guarded so the pin is hermetic regardless of registry state.
  const ventureHasRegistry = Boolean(resolveGitHubRepo('CronGenius') && resolveRepoPath('CronGenius'));
  it.runIf(ventureHasRegistry)('venture (CronGenius) → single venture repo, NOT both platform repos', () => {
    expect(isVentureRepo('CronGenius')).toBe(true);
    const repos = computeReposForSD({ sd_key: 'SD-X', target_application: 'CronGenius' });
    expect(repos).toHaveLength(1);
    expect(repos[0].githubRepo).toBe(resolveGitHubRepo('CronGenius'));
    expect(repos[0].githubRepo).toBeTruthy(); // registry-sourced, non-null (DB github_repo is NULL)
    expect(repos.map((r) => r.githubRepo)).not.toContain('rickfelix/EHG_Engineer');
  });
});

// SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 FR-1: metadata.qf_target_application fallback.
describe('FR-1 resolveGateRepoContext: metadata.qf_target_application fallback', () => {
  it('platform-default target_application + venture qf_target_application → resolves via DB, isVenture:true', async () => {
    const dbPath = 'D:/db-authoritative/test-venture';
    const { client, spies } = mockSupabase([{ name: 'TestVenture', local_path: dbPath, status: 'active' }]);
    const ctx = await resolveGateRepoContext(
      { target_application: 'EHG_Engineer', metadata: { qf_target_application: 'TestVenture' } },
      client,
    );
    expect(ctx.isVenture).toBe(true);
    expect(ctx.resolved).toBe(true);
    expect(ctx.repoPath).toBe(path.resolve(dbPath));
    expect(spies.from).toHaveBeenCalled();
  });

  it('platform-default target_application + PLATFORM-value qf_target_application (the real 35/38 shape) → zero DB calls, byte-identical', async () => {
    const { client, spies } = mockSupabase([{ name: 'X', local_path: 'D:/wrong', status: 'active' }]);
    const ctx = await resolveGateRepoContext(
      { target_application: 'EHG_Engineer', metadata: { qf_target_application: 'EHG_Engineer' } },
      client,
    );
    expect(ctx.isVenture).toBe(false);
    expect(ctx.resolved).toBe(true);
    expect(spies.from).not.toHaveBeenCalled();
    expect(ctx.repoPath).toBe(ENGINEER_ROOT);
  });

  it('no qf_target_application field at all → zero DB calls, byte-identical', async () => {
    const { client, spies } = mockSupabase([{ name: 'X', local_path: 'D:/wrong', status: 'active' }]);
    const ctx = await resolveGateRepoContext({ target_application: 'EHG_Engineer', metadata: {} }, client);
    expect(ctx.isVenture).toBe(false);
    expect(ctx.resolved).toBe(true);
    expect(spies.from).not.toHaveBeenCalled();
  });

  it('unresolvable qf_target_application venture → resolved:false (fail-closed), never verified via the fallback', async () => {
    const { client } = mockSupabase([]); // DB miss
    const ctx = await resolveGateRepoContext(
      { target_application: 'EHG_Engineer', metadata: { qf_target_application: 'zzz-nonexistent-venture-xyz' } },
      client,
    );
    expect(ctx.resolved).toBe(false);
    expect(ctx.repoPath).toBeNull();
  });
});

// SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001 FR-2: INCOMPLETE_SD_ROW shape guard.
describe('FR-2 resolveGateRepoContext: INCOMPLETE_SD_ROW shape guard (property presence, not value truthiness)', () => {
  it('sd with neither target_application nor metadata as an own key → INCOMPLETE_SD_ROW', async () => {
    const { client, spies } = mockSupabase([]);
    const ctx = await resolveGateRepoContext({ id: 'x' }, client);
    expect(ctx.resolved).toBe(false);
    expect(ctx.reason).toBe('INCOMPLETE_SD_ROW');
    expect(spies.from).not.toHaveBeenCalled();
  });

  it('sd with target_application:null and metadata:{} (both keys present) → NOT incomplete, byte-identical to a genuine platform SD', async () => {
    const { client, spies } = mockSupabase([]);
    const ctx = await resolveGateRepoContext({ id: 'x', target_application: null, metadata: {} }, client);
    expect(ctx.resolved).toBe(true);
    expect(ctx.reason).toBeUndefined();
    expect(ctx.repoPath).toBe(ENGINEER_ROOT);
    expect(spies.from).not.toHaveBeenCalled();
  });
});
