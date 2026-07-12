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
  // SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001: the mock builder tracks every
  // .eq() call so tests can assert the query is scoped by BOTH pr_number and
  // branch, not pr_number alone (the pre-fix vulnerability).
  function makeFindingSupabase(row) {
    const eqCalls = [];
    const supabase = {
      from: (table) => {
        expect(table).toBe('ship_review_findings');
        const builder = {
          select: () => builder,
          eq: (col, val) => { eqCalls.push([col, val]); return builder; },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        };
        return builder;
      },
    };
    return { supabase, eqCalls };
  }

  it('returns the most recent verdict when branch matches', async () => {
    const { supabase, eqCalls } = makeFindingSupabase({ verdict: 'pass' });
    expect(await defaultFetchReviewFinding(42, supabase, { branch: 'feat/foo' })).toEqual({ verdict: 'pass' });
    expect(eqCalls).toEqual([['pr_number', 42], ['branch', 'feat/foo']]);
  });

  it('returns null when no row found', async () => {
    const { supabase } = makeFindingSupabase(null);
    expect(await defaultFetchReviewFinding(42, supabase, { branch: 'feat/foo' })).toBeNull();
  });

  it('returns null on query error', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) }) }) };
    expect(await defaultFetchReviewFinding(42, supabase, { branch: 'feat/foo' })).toBeNull();
  });

  // SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (SECURITY): the core fail-closed
  // invariant — branch absent/undefined must NEVER fall back to the old
  // pr_number-only match, regardless of what the DB would have returned.
  it('FAIL-CLOSED: returns null when branch is omitted, even if a row would match on pr_number alone', async () => {
    const { supabase } = makeFindingSupabase({ verdict: 'pass' });
    expect(await defaultFetchReviewFinding(42, supabase)).toBeNull();
    expect(await defaultFetchReviewFinding(42, supabase, {})).toBeNull();
    expect(await defaultFetchReviewFinding(42, supabase, { branch: null })).toBeNull();
  });

  // SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001: the live witness case from Adam's
  // adjudication — two different repos both had a pr_number=9 (and #2, #5)
  // passing row. Confirms branch scoping prevents the cross-repo match.
  it('cross-repo collision: a differently-branched row at the same pr_number never matches', async () => {
    // Simulate: apexniche-ai PR#9 on branch feat/apex-D1 queries for its own
    // finding, but the DB's most-recent row for pr_number=9 is MARKETLENS's
    // (branch feat/ml-I1). A real Supabase .eq('branch', ...) filter would
    // exclude it; assert our mock reflects that filtering intent.
    const eqCalls = [];
    const supabase = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: (col, val) => {
            eqCalls.push([col, val]);
            // Simulate a real branch-scoped query: only the matching row is returned.
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => {
            const branchFilter = eqCalls.find(([c]) => c === 'branch')?.[1];
            const row = branchFilter === 'feat/apex-D1' ? { verdict: 'fail' } : null; // apex's OWN row never passed
            return Promise.resolve({ data: row, error: null });
          },
        };
        return builder;
      },
    };
    const result = await defaultFetchReviewFinding(9, supabase, { branch: 'feat/apex-D1' });
    expect(result).toEqual({ verdict: 'fail' }); // apex's own (failing) row, NEVER marketlens's passing row
    expect(eqCalls).toContainEqual(['branch', 'feat/apex-D1']);
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

// SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (SECURITY, TS-1): reproduces the
// LIVE cross-repo collision from Adam's adjudication (coordinator corr
// cf4f94a9) end-to-end through createVentureTrustGate's OWN default
// fetchReviewFinding (defaultFetchReviewFinding) — not an injected stub —
// against a single shared Supabase mock holding rows from BOTH trust_tier=
// 'trusted' venture repos (apexniche-ai, marketlens), matching production
// where both live under the same consolidated Supabase project.
describe('live cross-repo collision — apexniche-ai vs marketlens (TS-1)', () => {
  /** One shared "DB" backing both applications and ship_review_findings. */
  function makeSharedVentureDb({ applications, findings }) {
    return {
      from: (table) => {
        if (table === 'applications') {
          return { select: () => ({ not: () => Promise.resolve({ data: applications, error: null }) }) };
        }
        if (table === 'ship_review_findings') {
          const builder = {
            select: () => builder,
            eq: (col, val) => { builder._filters = { ...(builder._filters || {}), [col]: val }; return builder; },
            order: () => builder,
            limit: () => builder,
            maybeSingle: () => {
              const f = builder._filters || {};
              // Most-recent-first among rows matching ALL applied .eq() filters.
              const matches = findings
                .filter((r) => Object.entries(f).every(([k, v]) => r[k] === v))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
              return Promise.resolve({ data: matches[0] ?? null, error: null });
            },
          };
          return builder;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  // The exact live shape: two trusted repos, colliding pr_number=9 (also
  // reproduced at #2/#5 per RISK's live finding — #9 suffices to prove the
  // fix; the query logic is identical for any colliding number).
  const APPLICATIONS = [
    { trust_tier: 'trusted', github_repo: 'rickfelix/apexniche-ai' },
    { trust_tier: 'trusted', github_repo: 'rickfelix/marketlens' },
  ];
  const FINDINGS = [
    { pr_number: 9, branch: 'feat/ml-I1', sd_key: 'SD-MARKETLENS-LEO-ORCH-SPRINT-2026-001-I1', verdict: 'pass', created_at: '2026-07-03T00:00:00Z' },
    { pr_number: 9, branch: 'feat/apex-D1', sd_key: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-D1', verdict: 'block', created_at: '2026-07-11T00:00:00Z' },
  ];

  it('BEFORE the fix would have been exploitable: apexniche-ai PR#9 (own review=block) never inherits marketlens PR#9 (verdict=pass)', async () => {
    const supabase = makeSharedVentureDb({ applications: APPLICATIONS, findings: FINDINGS });
    const gate = createVentureTrustGate({ supabase, fetchStatusCheckRollup: async () => GREEN_ROLLUP, lookupWorkKeyReal: async () => true });
    const result = await gate('rickfelix', 'apexniche-ai', 9, {
      workKey: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-D1', tier: 'standard', branch: 'feat/apex-D1',
    });
    // apex's OWN row is verdict='block' -- a correctly-scoped lookup must
    // return false, not fall through to marketlens's unrelated passing row.
    expect(result).toBe(false);
  });

  it('marketlens PR#9 (own review=pass) correctly witness-passes on its own row', async () => {
    const supabase = makeSharedVentureDb({ applications: APPLICATIONS, findings: FINDINGS });
    const gate = createVentureTrustGate({ supabase, fetchStatusCheckRollup: async () => GREEN_ROLLUP, lookupWorkKeyReal: async () => true });
    const result = await gate('rickfelix', 'marketlens', 9, {
      workKey: 'SD-MARKETLENS-LEO-ORCH-SPRINT-2026-001-I1', tier: 'standard', branch: 'feat/ml-I1',
    });
    expect(result).toBe(true);
  });

  it('FAIL-CLOSED: omitting branch on a trusted-tier venture repo never witness-passes, even though a same-numbered pass row exists in the shared DB', async () => {
    const supabase = makeSharedVentureDb({ applications: APPLICATIONS, findings: FINDINGS });
    const gate = createVentureTrustGate({ supabase, fetchStatusCheckRollup: async () => GREEN_ROLLUP, lookupWorkKeyReal: async () => true });
    const result = await gate('rickfelix', 'apexniche-ai', 9, {
      workKey: 'SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-D1', tier: 'standard',
      // branch omitted entirely -- this is the pre-fix vulnerable call shape.
    });
    expect(result).toBe(false);
  });
});
