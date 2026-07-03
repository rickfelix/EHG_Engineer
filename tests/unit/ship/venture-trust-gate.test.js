/**
 * SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (Ship-witness B)
 * FR-1, FR-4: venture-trust-gate.mjs — applications.trust_tier SSOT hook +
 * pre-merge witness evaluator. Pure unit tests against fake Supabase/runner
 * stubs — no live DB.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeGithubRepo,
  fetchTrustTier,
  defaultLookupWorkKeyReal,
  defaultFetchReviewFinding,
  evaluateVenturePrWitness,
  createVentureTrustGate,
} from '../../../lib/ship/venture-trust-gate.mjs';

const GREEN_ROLLUP = [{ status: 'COMPLETED', conclusion: 'SUCCESS' }];

function makeApplicationsSupabase(rows) {
  return {
    from: (table) => {
      if (table !== 'applications') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          not: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    },
  };
}

function makeThrowingSupabase() {
  return {
    from: () => {
      throw new Error('supabase should not have been called (fast-path expected)');
    },
  };
}

describe('normalizeGithubRepo', () => {
  it('strips .git suffix and lowercases', () => {
    expect(normalizeGithubRepo('rickfelix/MarketLens.GIT')).toBe('rickfelix/marketlens');
  });
  it('handles no .git suffix', () => {
    expect(normalizeGithubRepo('rickfelix/marketlens')).toBe('rickfelix/marketlens');
  });
  it('null in, null out', () => {
    expect(normalizeGithubRepo(null)).toBeNull();
  });
});

describe('fetchTrustTier', () => {
  it('matches a repo whose github_repo is owner/Name.git (case + suffix insensitive)', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'trusted', github_repo: 'rickfelix/MarketLens.git' }]);
    const tier = await fetchTrustTier('rickfelix', 'marketlens', supabase);
    expect(tier).toBe('trusted');
  });

  it('returns null (fail-closed) when no row matches', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'trusted', github_repo: 'rickfelix/other-repo' }]);
    const tier = await fetchTrustTier('rickfelix', 'marketlens', supabase);
    expect(tier).toBeNull();
  });

  it('returns null when supabase/repoOwner/repoName missing', async () => {
    expect(await fetchTrustTier(null, 'marketlens', {})).toBeNull();
    expect(await fetchTrustTier('rickfelix', null, {})).toBeNull();
    expect(await fetchTrustTier('rickfelix', 'marketlens', null)).toBeNull();
  });

  it('returns null on query error', async () => {
    const supabase = { from: () => ({ select: () => ({ not: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) };
    expect(await fetchTrustTier('rickfelix', 'marketlens', supabase)).toBeNull();
  });
});

describe('defaultLookupWorkKeyReal', () => {
  it('routes QF- prefixed keys to quick_fixes', async () => {
    const supabase = {
      from: (table) => {
        expect(table).toBe('quick_fixes');
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'QF-20260703-001' }, error: null }) }) }) };
      },
    };
    expect(await defaultLookupWorkKeyReal('QF-20260703-001', supabase)).toBe(true);
  });

  it('routes non-QF keys to strategic_directives_v2.sd_key', async () => {
    const supabase = {
      from: (table) => {
        expect(table).toBe('strategic_directives_v2');
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { sd_key: 'SD-XXX-001' }, error: null }) }) }) };
      },
    };
    expect(await defaultLookupWorkKeyReal('SD-XXX-001', supabase)).toBe(true);
  });

  it('returns false when no row found', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) };
    expect(await defaultLookupWorkKeyReal('SD-FAKE-001', supabase)).toBe(false);
  });

  it('returns null on query error (not_evaluable, never a false pass)', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    expect(await defaultLookupWorkKeyReal('SD-XXX-001', supabase)).toBeNull();
  });

  it('returns null when workKey/supabase missing', async () => {
    expect(await defaultLookupWorkKeyReal(null, {})).toBeNull();
    expect(await defaultLookupWorkKeyReal('SD-XXX-001', null)).toBeNull();
  });
});

describe('defaultFetchReviewFinding', () => {
  function makeFindingSupabase(row) {
    return {
      from: (table) => {
        expect(table).toBe('ship_review_findings');
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: row, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };
  }

  it('returns the most recent verdict', async () => {
    const supabase = makeFindingSupabase({ verdict: 'pass' });
    expect(await defaultFetchReviewFinding(42, supabase)).toEqual({ verdict: 'pass' });
  });

  it('returns null when no row found', async () => {
    const supabase = makeFindingSupabase(null);
    expect(await defaultFetchReviewFinding(42, supabase)).toBeNull();
  });

  it('returns null on query error', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) }) };
    expect(await defaultFetchReviewFinding(42, supabase)).toBeNull();
  });
});

describe('evaluateVenturePrWitness', () => {
  const base = {
    prNumber: 7,
    workKey: 'SD-XXX-001',
    tier: 'standard',
    statusCheckRollup: GREEN_ROLLUP,
  };

  it('passes when P1 + P2 + P3 all pass', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(ok).toBe(true);
  });

  it('fails when P1 admission fails (workKey not real)', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      lookupWorkKeyReal: async () => false,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(ok).toBe(false);
  });

  it('fails when P2 witness fails (no review finding)', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => null,
    });
    expect(ok).toBe(false);
  });

  it('fails when P3 CI is pending (not_evaluable, not a pass)', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      statusCheckRollup: [{ status: 'IN_PROGRESS' }],
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(ok).toBe(false);
  });

  it('fails when P3 CI has failed', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(ok).toBe(false);
  });

  it('degrades to false (never throws) when the ladder call throws', async () => {
    const ok = await evaluateVenturePrWitness({
      ...base,
      lookupWorkKeyReal: async () => { throw new Error('db down'); },
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    expect(ok).toBe(false);
  });
});

describe('createVentureTrustGate', () => {
  it('platform repo returns true with ZERO supabase calls (fast path)', async () => {
    const gate = createVentureTrustGate({ supabase: makeThrowingSupabase() });
    await expect(gate('rickfelix', 'ehg', 7, {})).resolves.toBe(true);
    await expect(gate('rickfelix', 'ehg_engineer', 7, {})).resolves.toBe(true);
  });

  it('trust_tier=trusted repo with a passing witness returns true', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'trusted', github_repo: 'rickfelix/marketlens' }]);
    const gate = createVentureTrustGate({
      supabase,
      fetchStatusCheckRollup: async () => GREEN_ROLLUP,
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => ({ verdict: 'pass' }),
    });
    const result = await gate('rickfelix', 'marketlens', 99, { workKey: 'SD-XXX-001', tier: 'standard' });
    expect(result).toBe(true);
  });

  it('trust_tier=trusted repo with a failing/absent witness returns false', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'trusted', github_repo: 'rickfelix/marketlens' }]);
    const gate = createVentureTrustGate({
      supabase,
      fetchStatusCheckRollup: async () => GREEN_ROLLUP,
      lookupWorkKeyReal: async () => true,
      fetchReviewFinding: async () => null,
    });
    const result = await gate('rickfelix', 'marketlens', 99, { workKey: 'SD-XXX-001', tier: 'standard' });
    expect(result).toBe(false);
  });

  it('trust_tier=external returns false without needing to evaluate the witness', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'external', github_repo: 'rickfelix/crongenius' }]);
    const gate = createVentureTrustGate({
      supabase,
      fetchStatusCheckRollup: async () => { throw new Error('should not be called'); },
    });
    const result = await gate('rickfelix', 'crongenius', 99, { workKey: 'SD-XXX-001' });
    expect(result).toBe(false);
  });

  it('unresolvable repo (no matching applications row) returns false', async () => {
    const supabase = makeApplicationsSupabase([]);
    const gate = createVentureTrustGate({ supabase });
    const result = await gate('someorg', 'unknown-repo', 99, {});
    expect(result).toBe(false);
  });

  it('returns false when no prNumber supplied for a non-platform repo', async () => {
    const supabase = makeApplicationsSupabase([{ trust_tier: 'trusted', github_repo: 'rickfelix/marketlens' }]);
    const gate = createVentureTrustGate({ supabase });
    const result = await gate('rickfelix', 'marketlens', undefined, {});
    expect(result).toBe(false);
  });
});
