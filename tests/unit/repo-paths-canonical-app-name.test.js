/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-002: resolveCanonicalAppName registry-fallback
 * tombstone leak.
 *
 * resolveCanonicalAppName previously filtered .eq('status','active').is('deleted_at',
 * null) server-side, making a DB-tombstoned application indistinguishable from a
 * never-registered one — both fell through unconditionally to the registry.json file
 * mirror (no deleted_at concept), silently re-admitting a retired application's stale
 * name. Identical defect class to resolveRepoPathDbFirst, fixed the same way here:
 * evaluate status/deleted_at client-side (mirrors tests/unit/repo-paths-db-first.test.js's
 * established mocking convention via the shared, chain-safe createSupabaseChainMock()).
 */
import { describe, it, expect } from 'vitest';
import { resolveCanonicalAppName } from '../../lib/repo-paths.js';
import { createSupabaseChainMock } from '../helpers/supabase-chain-mock.js';

function mockSupabase(rows, { throwOnQuery = false } = {}) {
  const chain = createSupabaseChainMock({
    result: throwOnQuery ? undefined : { data: rows, error: null },
  });
  const chainSelect = chain.select;
  // Pin the exact select() column list, matching repo-paths-db-first.test.js's own
  // drift-detection convention — createSupabaseChainMock resolves to `result`
  // regardless of chained args, so this is the only thing that would catch a revert
  // to the old server-side-filtered query shape (.eq('status','active').is('deleted_at',null)).
  chain.select = (columns) => {
    if (columns !== 'name, status, deleted_at') {
      throw new Error(`mock chain drift: .select(${JSON.stringify(columns)}) does not match the expected .select('name, status, deleted_at') -- update mockSupabase to match lib/repo-paths.js's real query`);
    }
    return throwOnQuery ? Promise.reject(new Error('db down')) : chainSelect(columns);
  };
  return { client: { from: chain.from }, spies: { from: chain.from } };
}

describe('platform passthrough never consults the DB', () => {
  const cases = [
    [null, 'EHG_Engineer'],
    [undefined, 'EHG_Engineer'],
    ['EHG', 'EHG'],
    ['EHG_Engineer', 'EHG_Engineer'],
    ['ehg', 'EHG'],
    ['ehg_engineer', 'EHG_Engineer'],
  ];
  for (const [targetApp, expected] of cases) {
    it(`target=${JSON.stringify(targetApp)} → ${expected}, without querying the DB`, async () => {
      const { client, spies } = mockSupabase([{ name: 'EHG_Engineer', status: 'active', deleted_at: null }]);
      const result = await resolveCanonicalAppName(targetApp, client);
      expect(result).toBe(expected);
      expect(spies.from).not.toHaveBeenCalled();
    });
  }
});

describe('FR-1: tombstoned application is not leaked via registry fallback', () => {
  it('a tombstoned match (deleted_at set) is refused, returns unchanged input, never consults registry.json for that name', async () => {
    const { client, spies } = mockSupabase([{ name: 'MarketLens', status: 'inactive', deleted_at: '2026-07-08T00:00:00Z' }]);
    const result = await resolveCanonicalAppName('marketlens', client);
    expect(result).toBe('marketlens'); // unchanged input, not the DB row's canonical 'MarketLens' casing
    expect(spies.from).toHaveBeenCalled();
  });

  it('status=active with deleted_at set (the other exclusion axis) is also refused', async () => {
    const { client } = mockSupabase([{ name: 'CanvasAI', status: 'active', deleted_at: '2026-07-01T00:00:00Z' }]);
    const result = await resolveCanonicalAppName('CanvasAI', client);
    expect(result).toBe('CanvasAI');
  });
});

describe('FR-1: genuine absence still uses the registry fallback (non-regression)', () => {
  it('DB has no matching row at all → falls back to the sync registry resolver', async () => {
    const { client } = mockSupabase([]);
    const target = 'definitely-not-a-real-venture-xyz';
    expect(await resolveCanonicalAppName(target, client)).toBe(target); // no registry.json entry either → unchanged input
  });
});

describe('FR-1: active application resolves via DB match (happy path non-regression)', () => {
  it('an active, non-deleted row resolves to the DB canonical name', async () => {
    const { client } = mockSupabase([{ name: 'CommitCraft AI', status: 'active', deleted_at: null }]);
    const result = await resolveCanonicalAppName('commitcraft-ai', client);
    expect(result).toBe('CommitCraft AI');
  });
});

describe('same-name tombstone + live coexistence (mirrors resolveRepoPathDbFirstDetailed handling)', () => {
  const tombstoned = { name: 'MarketLens', status: 'inactive', deleted_at: '2026-07-01T00:00:00Z' };
  const live = { name: 'MarketLens', status: 'active', deleted_at: null };

  it('tombstone-first order → still resolves the live row, not refused', async () => {
    const { client } = mockSupabase([tombstoned, live]);
    expect(await resolveCanonicalAppName('MarketLens', client)).toBe('MarketLens');
  });

  it('live-first order → resolves the live row (order must not matter)', async () => {
    const { client } = mockSupabase([live, tombstoned]);
    expect(await resolveCanonicalAppName('MarketLens', client)).toBe('MarketLens');
  });

  it('only a tombstoned row matches (no coexisting live row) → still correctly refused', async () => {
    const { client } = mockSupabase([tombstoned]);
    // Refused: returns the unchanged input (which happens to already equal 'MarketLens' here).
    expect(await resolveCanonicalAppName('MarketLens', client)).toBe('MarketLens');
  });
});

describe('DB error handling (non-regression)', () => {
  it('DB query throws → degrades to registry fallback, never throws', async () => {
    const { client } = mockSupabase(null, { throwOnQuery: true });
    const target = 'some-app-not-in-registry-either';
    await expect(resolveCanonicalAppName(target, client)).resolves.toBe(target);
  });

  it('no supabase client → registry-only resolution, no DB access', async () => {
    const target = 'some-app-not-in-registry-either';
    await expect(resolveCanonicalAppName(target)).resolves.toBe(target);
  });
});
