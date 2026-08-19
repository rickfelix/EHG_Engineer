/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-2 / TS-4: DB-first path resolution.
 *
 * resolveRepoPathDbFirst prefers the authoritative applications.local_path DB column
 * and only falls back to the synchronous registry.json resolver when the DB is
 * unavailable / has no row / the row's local_path is NULL. TS-4: a value present in
 * the DB column is what gets returned — registry.json staleness does not change it.
 *
 * Also asserts: the FR-6 platform invariant (null/EHG_Engineer never consult the DB),
 * normalizeAppName matching across name forms, and that DB errors degrade to the
 * registry fallback rather than returning null (which would mis-route to EHG_Engineer).
 *
 * SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-C: this file was quarantined after
 * .is('deleted_at', null) was added to the real query (the mock below stopped
 * at .select(), had no chain support, and threw — silently swallowed by the
 * source's catch block, reproducing this SD's exact bug inside the test's own
 * broken fixture). Un-quarantined here using the shared, chain-safe
 * createSupabaseChainMock() instead of a hand-rolled mock, and extended with
 * coverage for the tombstone-refusal behavior this SD adds.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveRepoPathDbFirst, resolveRepoPathDbFirstDetailed, resolveRepoPath, ENGINEER_ROOT } from '../../lib/repo-paths.js';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

function mockSupabase(rows, { throwOnQuery = false } = {}) {
  const chain = createSupabaseChainMock({
    result: throwOnQuery ? undefined : { data: rows, error: null },
  });
  const chainSelect = chain.select;
  // SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-C follow-up (adversarial review, pre-merge):
  // pin the exact select() column list here too, not only in
  // venture-aware-completion-gates.test.js — createSupabaseChainMock resolves to
  // `result` regardless of chained args, so THIS file (the one named for the
  // behavior it protects) could not otherwise detect a revert to the old
  // server-side-filtered query shape (.eq('status','active').is('deleted_at',null)).
  chain.select = (columns) => {
    if (columns !== 'name, local_path, status, deleted_at') {
      throw new Error(`mock chain drift: .select(${JSON.stringify(columns)}) does not match the expected .select('name, local_path, status, deleted_at') -- update mockSupabase to match lib/repo-paths.js's real query`);
    }
    // Override select() itself to reject on throwOnQuery — the source's try/catch
    // must degrade to the registry fallback rather than throwing or returning a
    // bare null.
    return throwOnQuery ? Promise.reject(new Error('db down')) : chainSelect(columns);
  };
  return { client: { from: chain.from }, spies: { from: chain.from } };
}

describe('FR-6 platform invariant holds in resolveRepoPathDbFirst', () => {
  for (const targetApp of [null, undefined, 'EHG_Engineer', 'ehg_engineer']) {
    it(`target=${JSON.stringify(targetApp)} → ENGINEER_ROOT without consulting the DB`, async () => {
      const { client, spies } = mockSupabase([{ name: 'EHG_Engineer', local_path: 'D:/wrong', status: 'active' }]);
      const result = await resolveRepoPathDbFirst(targetApp, client);
      expect(result).toBe(ENGINEER_ROOT);
      expect(spies.from).not.toHaveBeenCalled();
    });
  }
});

describe('FR-2 / TS-4: DB column is authoritative over registry.json', () => {
  it('returns the DB local_path (not the registry value) for a matched venture', async () => {
    const dbPath = 'D:/db-authoritative/commitcraft-ai';
    const { client } = mockSupabase([{ name: 'CommitCraft AI', local_path: dbPath, status: 'active' }]);
    // 'commitcraft-ai' normalizes to the same key as the DB row's 'CommitCraft AI'.
    const result = await resolveRepoPathDbFirst('commitcraft-ai', client);
    expect(result).toBe(path.resolve(dbPath));
    // Prove it is the DB value, not the registry value, by construction (sentinel path).
    expect(result).not.toBe(resolveRepoPath('commitcraft-ai'));
  });

  it('matches across name forms via normalizeAppName (CronLinter / cron-linter / cronlinter)', async () => {
    const dbPath = 'D:/db-authoritative/cronlinter';
    for (const form of ['CronLinter', 'cron-linter', 'cronlinter', 'CRON LINTER']) {
      const { client } = mockSupabase([{ name: 'CronLinter', local_path: dbPath, status: 'active' }]);
      expect(await resolveRepoPathDbFirst(form, client)).toBe(path.resolve(dbPath));
    }
  });
});

describe('FR-2: registry fallback (DB miss / NULL / error / no client)', () => {
  it('DB has no matching row → falls back to the sync registry resolver', async () => {
    const { client } = mockSupabase([]);
    const target = 'definitely-not-a-real-venture-xyz';
    expect(await resolveRepoPathDbFirst(target, client)).toBe(resolveRepoPath(target));
  });

  it('matched row with NULL local_path is ignored → registry fallback', async () => {
    const { client } = mockSupabase([{ name: 'CronLinter', local_path: null, status: 'active' }]);
    expect(await resolveRepoPathDbFirst('cronlinter', client)).toBe(resolveRepoPath('cronlinter'));
  });

  it('no supabase client → registry resolver (e.g. ehg resolves from registry.json)', async () => {
    expect(await resolveRepoPathDbFirst('ehg')).toBe(resolveRepoPath('ehg'));
  });

  it('DB query throws → degrades to registry fallback, never throws or returns a bare null mis-route', async () => {
    const { client } = mockSupabase(null, { throwOnQuery: true });
    expect(await resolveRepoPathDbFirst('ehg', client)).toBe(resolveRepoPath('ehg'));
  });
});

describe('FR-2/FR-3: a DB-tombstoned application is refused, never silently re-admitted via registry.json (SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-C)', () => {
  it('status=inactive + deleted_at set → path:null, source:db, reason:tombstoned — the exact live MarketLens shape', async () => {
    const { client, spies } = mockSupabase([
      { name: 'MarketLens', local_path: '/some/stale/registry/mirror/path', status: 'inactive', deleted_at: '2026-07-08T00:00:00Z' },
    ]);
    const result = await resolveRepoPathDbFirstDetailed('MarketLens', client);
    expect(result).toEqual({ path: null, source: 'db', reason: 'tombstoned' });
    // The tombstone branch must short-circuit before ever touching the registry
    // resolver for this app -- there is nothing to spy on resolveRepoPath here,
    // but the returned path proves the stale registry local_path was never used.
    expect(spies.from).toHaveBeenCalled();
  });

  it('status=inactive with deleted_at NULL (the other exclusion axis) is also refused, not just deleted_at', async () => {
    const { client } = mockSupabase([{ name: 'CanvasAI', local_path: '/x', status: 'inactive', deleted_at: null }]);
    const result = await resolveRepoPathDbFirstDetailed('CanvasAI', client);
    expect(result.path).toBeNull();
    expect(result.reason).toBe('tombstoned');
  });

  it('the byte-identical resolveRepoPathDbFirst wrapper also returns null for a tombstoned app', async () => {
    const { client } = mockSupabase([
      { name: 'MarketLens', local_path: '/stale/marketlens', status: 'inactive', deleted_at: '2026-07-08T00:00:00Z' },
    ]);
    expect(await resolveRepoPathDbFirst('MarketLens', client)).toBeNull();
  });

  it('source-pin: an ACTIVE row for the same app name is NOT refused (only tombstoned rows are)', async () => {
    const { client } = mockSupabase([{ name: 'MarketLens', local_path: '/live/marketlens', status: 'active', deleted_at: null }]);
    const result = await resolveRepoPathDbFirstDetailed('MarketLens', client);
    expect(result).toEqual({ path: path.resolve('/live/marketlens'), source: 'db', reason: 'active' });
  });

  it('negative control: an app absent from the DB entirely (never tombstoned) still falls through to registry', async () => {
    const { client } = mockSupabase([]);
    const result = await resolveRepoPathDbFirstDetailed('CronGenius', client);
    expect(result.source).toBe('registry');
    expect(result.reason).toBe('fallback');
  });
});

describe('FR-2/FR-3 follow-up: tombstoned + live rows coexisting under the same name (adversarial-review finding, pre-merge)', () => {
  // 20260530_applications_soft_delete_reconcile.sql FR-2 deliberately swapped FULL
  // unique name indexes for PARTIAL ones (WHERE deleted_at IS NULL) "so a retired
  // name can be reused by a new live application" -- so a tombstoned MarketLens row
  // and a live re-registered MarketLens row coexisting in `applications` is a
  // DESIGNED-FOR state, not an anomaly. The query has no .order(), so a bare
  // .find() over the unmatched result set would nondeterministically return
  // whichever row Postgres returns first -- reproduced empirically pre-fix: row
  // order [tombstone, live] incorrectly refused the live application. The live row
  // must be resolved regardless of which order the DB returns the two rows in.
  const tombstoned = { name: 'MarketLens', local_path: '/stale/old-marketlens', status: 'inactive', deleted_at: '2026-07-01T00:00:00Z' };
  const live = { name: 'MarketLens', local_path: '/live/new-marketlens', status: 'active', deleted_at: null };

  it('tombstone-first order → still resolves the live row, not refused', async () => {
    const { client } = mockSupabase([tombstoned, live]);
    const result = await resolveRepoPathDbFirstDetailed('MarketLens', client);
    expect(result).toEqual({ path: path.resolve('/live/new-marketlens'), source: 'db', reason: 'active' });
  });

  it('live-first order → resolves the live row (order must not matter)', async () => {
    const { client } = mockSupabase([live, tombstoned]);
    const result = await resolveRepoPathDbFirstDetailed('MarketLens', client);
    expect(result).toEqual({ path: path.resolve('/live/new-marketlens'), source: 'db', reason: 'active' });
  });

  it('only a tombstoned row matches (no coexisting live row) → still correctly refused', async () => {
    const { client } = mockSupabase([tombstoned]);
    const result = await resolveRepoPathDbFirstDetailed('MarketLens', client);
    expect(result).toEqual({ path: null, source: 'db', reason: 'tombstoned' });
  });
});

describe('source provenance is accurate on resolveRepoPathDbFirstDetailed', () => {
  it('no supabase client at all → source:registry, reason:no-client', async () => {
    const result = await resolveRepoPathDbFirstDetailed('ehg');
    expect(result.source).toBe('registry');
    expect(result.reason).toBe('no-client');
  });

  it('platform passthrough (EHG_Engineer) → source:db, reason:platform', async () => {
    const result = await resolveRepoPathDbFirstDetailed('EHG_Engineer');
    expect(result).toEqual({ path: ENGINEER_ROOT, source: 'db', reason: 'platform' });
  });
});
