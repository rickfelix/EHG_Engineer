// QF-20260704-440: resolveSDContext hardcoded gitRepoPath resolution to {EHG, EHG_Engineer}
// only; any venture target_application (e.g. MarketLens) fell through to process.cwd().
// Fix: resolve any non-platform target_application via resolveRepoPathDbFirst
// (applications.local_path, DB-first / registry.json fallback), returning null
// (fail-loud) rather than defaulting to cwd when unresolvable.

import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveSDContext, EHG_ROOT, EHG_ENGINEER_ROOT } from '../../../scripts/modules/traceability-validation/utils.js';
import { createSupabaseChainMock } from '../../helpers/supabase-chain-mock.js';

// SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001-C: the old hand-rolled mock only chained
// .select().eq().is() -- resolveRepoPathDbFirst (via resolveRepoPathDbFirstDetailed)
// now does a bare .select(...) that resolves directly, so .select() returning a plain
// { eq } object (not a Promise) made `await` resolve to that object itself, `data`
// came back undefined, and the DB-hit test below silently fell through to the REAL
// (unmocked) registry.json on disk instead of the test's own dbPath fixture -- caught
// by CI (Linux runner), not locally, because both the mocked D: path and the real
// registry's local C: path get mangled identically by POSIX path.resolve() on a
// drive-letter string, so only the exact mangled value differed. Fixed by using the
// shared, chain-safe createSupabaseChainMock() instead, matching
// tests/unit/repo-paths-db-first.test.js and tests/unit/venture-aware-completion-gates.test.js.
function mockAppsSupabase(rows) {
  const chain = createSupabaseChainMock({ result: { data: rows, error: null } });
  return { from: chain.from };
}

describe('QF-20260704-440: resolveSDContext venture repo resolution', () => {
  it('resolves target_application=EHG to EHG_ROOT without a DB call', async () => {
    const supabase = mockAppsSupabase([]);
    const prefetchedSd = { id: 'u1', sd_key: 'SD-1', target_application: 'EHG' };
    const { gitRepoPath } = await resolveSDContext('SD-1', supabase, prefetchedSd);
    expect(gitRepoPath).toBe(EHG_ROOT);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('resolves target_application=EHG_Engineer to EHG_ENGINEER_ROOT without a DB call', async () => {
    const supabase = mockAppsSupabase([]);
    const prefetchedSd = { id: 'u2', sd_key: 'SD-2', target_application: 'EHG_Engineer' };
    const { gitRepoPath } = await resolveSDContext('SD-2', supabase, prefetchedSd);
    expect(gitRepoPath).toBe(EHG_ENGINEER_ROOT);
  });

  it('resolves a venture target_application via applications.local_path (DB-first)', async () => {
    const dbPath = 'D:/ventures/marketlens';
    const supabase = mockAppsSupabase([{ name: 'MarketLens', local_path: dbPath, status: 'active' }]);
    const prefetchedSd = { id: 'u3', sd_key: 'SD-MARKETLENS-1', target_application: 'MarketLens' };
    const { gitRepoPath } = await resolveSDContext('SD-MARKETLENS-1', supabase, prefetchedSd);
    expect(gitRepoPath).toBe(path.resolve(dbPath));
  });

  it('returns gitRepoPath=null (fail-loud) for an unresolvable venture, never cwd', async () => {
    const supabase = mockAppsSupabase([]);
    const prefetchedSd = { id: 'u4', sd_key: 'SD-UNKNOWN-1', target_application: 'definitely-not-a-real-venture-xyz-440' };
    const { gitRepoPath } = await resolveSDContext('SD-UNKNOWN-1', supabase, prefetchedSd);
    expect(gitRepoPath).toBeNull();
    expect(gitRepoPath).not.toBe(process.cwd());
  });
});
