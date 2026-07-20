/**
 * SD-LEO-INFRA-VENTURE-REPO-TRUST-001 — born-trusted trust-tier elevation.
 * Pure unit tests against injected fake Supabase clients — no live DB, no gh.
 *
 * TS-1  resolveTrustElevation fail-closed truth table (incl. vision-only)
 * TS-2  elevateVentureRepoTrust performs the conditional UPDATE only on external rows
 * TS-3  negative pin: external-shaped row never elevates AND VB-2 still blocks it
 * TS-5  planBackfillForRow: write vs skip (already-provenance / not-ratified)
 */
import { describe, it, expect } from 'vitest';
import { resolveTrustElevation, elevateVentureRepoTrust } from '../../../../lib/eva/bridge/trust-elevation.js';
import { planBackfillForRow } from '../../../../scripts/backfill-trust-tier-elevation.mjs';
import { fetchTrustTier, createVentureTrustGate } from '../../../../lib/ship/venture-trust-gate.mjs';

// A minimal thenable query-builder fake. Each table maps to a handler returning {data,error}.
// Supports the two shapes the code uses:
//   .from(t).select(cols).eq().eq().limit()             (ratification reads)
//   .from(t).select(cols).eq('status','active')         (applications lookup)
//   .from(t).update(patch).eq().eq()                    (elevation write)
function makeSupabase(handlers) {
  return {
    from(table) {
      const h = handlers[table] || {};
      const build = (op, payload) => {
        const state = { table, op, payload, filters: {} };
        const chain = {
          select(cols) { state.cols = cols; return chain; },
          eq(col, val) { state.filters[col] = val; return chain; },
          limit(n) { state.limit = n; return Promise.resolve(h[op] ? h[op](state) : { data: [], error: null }); },
          maybeSingle() { return Promise.resolve(h[op] ? h[op](state) : { data: null, error: null }); },
          then(resolve, reject) {
            return Promise.resolve(h[op] ? h[op](state) : { data: [], error: null }).then(resolve, reject);
          },
        };
        return chain;
      };
      return {
        select: (cols) => build('select', null).select(cols),
        update: (patch) => build('update', patch),
      };
    },
  };
}

const RATIFIED = {
  eva_architecture_plans: { select: (s) => (s.filters.venture_id === 'v-arch' ? { data: [{ id: 'a1' }], error: null } : { data: [], error: null }) },
  eva_vision_documents: { select: (s) => (s.filters.venture_id === 'v-vision' ? { data: [{ id: 'vd1' }], error: null } : { data: [], error: null }) },
};

describe('TS-1 resolveTrustElevation — fail-closed predicate', () => {
  it('elevate=false when the repo was NOT fleet-minted (load-bearing mint gate)', async () => {
    const r = await resolveTrustElevation({ ventureId: 'v-arch', repoWasMinted: false, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(false);
    expect(r.reason).toBe('not_fleet_minted');
  });

  it('elevate=false when venture_id is unresolved', async () => {
    const r = await resolveTrustElevation({ ventureId: null, repoWasMinted: true, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(false);
    expect(r.reason).toBe('venture_id_unresolved');
  });

  it('elevate=false when there is no chairman_approved arch plan OR vision', async () => {
    const r = await resolveTrustElevation({ ventureId: 'v-none', repoWasMinted: true, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(false);
    expect(r.reason).toBe('no_chairman_approval');
  });

  it('elevate=true on a genuine mint with a chairman_approved ARCH plan', async () => {
    const r = await resolveTrustElevation({ ventureId: 'v-arch', repoWasMinted: true, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(true);
    expect(r.provenance.approved_via).toBe('architecture plan');
    expect(r.provenance.to).toBe('trusted');
  });

  it('elevate=true on a genuine mint with VISION-ONLY approval (MarketLens case)', async () => {
    const r = await resolveTrustElevation({ ventureId: 'v-vision', repoWasMinted: true, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(true);
    expect(r.provenance.approved_via).toBe('vision document');
  });

  it('fail-closed on a query error (treated as not approved)', async () => {
    const throwing = {
      eva_architecture_plans: { select: () => ({ data: null, error: { message: 'boom' } }) },
      eva_vision_documents: { select: () => ({ data: null, error: { message: 'boom' } }) },
    };
    const r = await resolveTrustElevation({ ventureId: 'v-arch', repoWasMinted: true, supabase: makeSupabase(throwing) });
    expect(r.elevate).toBe(false);
    expect(r.reason).toBe('no_chairman_approval');
  });
});

describe('TS-2 elevateVentureRepoTrust — conditional UPDATE', () => {
  it('elevates an external applications row and writes canonical provenance', async () => {
    let updatePatch = null;
    let updateFilters = null;
    const supabase = makeSupabase({
      ...RATIFIED,
      applications: {
        select: () => ({ data: [{ id: 'app1', name: 'ApexNiche AI', trust_tier: 'external', metadata: { existing: true } }], error: null }),
        update: (s) => { updatePatch = s.payload; updateFilters = s.filters; return { data: null, error: null }; },
      },
    });
    const res = await elevateVentureRepoTrust({ ventureId: 'v-arch', ventureName: 'ApexNiche AI', repoWasMinted: true, supabase, stampedAt: '2026-07-12T00:00:00Z' });
    expect(res.elevated).toBe(true);
    expect(updatePatch.trust_tier).toBe('trusted');
    expect(updatePatch.metadata.existing).toBe(true); // merged, not overwritten
    expect(updatePatch.metadata.trust_tier_elevation.at).toBe('2026-07-12T00:00:00Z');
    expect(updateFilters.trust_tier).toBe('external'); // concurrency-safe idempotency guard
  });

  it('no-ops (no UPDATE) when the row is already trusted', async () => {
    let updateCalled = false;
    const supabase = makeSupabase({
      ...RATIFIED,
      applications: {
        select: () => ({ data: [{ id: 'app1', name: 'ApexNiche AI', trust_tier: 'trusted', metadata: {} }], error: null }),
        update: () => { updateCalled = true; return { data: null, error: null }; },
      },
    });
    const res = await elevateVentureRepoTrust({ ventureId: 'v-arch', ventureName: 'ApexNiche AI', repoWasMinted: true, supabase });
    expect(res.elevated).toBe(false);
    expect(res.reason).toBe('already_trusted');
    expect(updateCalled).toBe(false);
  });

  it('does not elevate an unratified venture even with an app row present', async () => {
    let updateCalled = false;
    const supabase = makeSupabase({
      ...RATIFIED,
      applications: {
        select: () => ({ data: [{ id: 'app1', name: 'Imported Co', trust_tier: 'external', metadata: {} }], error: null }),
        update: () => { updateCalled = true; return { data: null, error: null }; },
      },
    });
    const res = await elevateVentureRepoTrust({ ventureId: 'v-none', ventureName: 'Imported Co', repoWasMinted: true, supabase });
    expect(res.elevated).toBe(false);
    expect(res.reason).toBe('no_chairman_approval');
    expect(updateCalled).toBe(false);
  });
});

describe('TS-4 retry-safety — a partial-mint retry converges to trusted, never double-elevates', () => {
  it('first call (mint) elevates external->trusted; a second call (retry) is a harmless no-op', async () => {
    // Stateful fake: the row starts external and flips to trusted once the guarded UPDATE fires,
    // exactly as the live row would across an executeStepWithRetry re-entry.
    const row = { id: 'app1', name: 'ApexNiche AI', trust_tier: 'external', metadata: {} };
    let updateCount = 0;
    const supabase = makeSupabase({
      ...RATIFIED,
      applications: {
        select: () => ({ data: [{ ...row }], error: null }),
        update: (s) => {
          // honor the .eq('trust_tier','external') guard — a trusted row is not re-updated
          if (s.filters.trust_tier === 'external' && row.trust_tier === 'external') {
            row.trust_tier = 'trusted';
            row.metadata = s.payload.metadata;
            updateCount++;
          }
          return { data: null, error: null };
        },
      },
    });

    const first = await elevateVentureRepoTrust({ ventureId: 'v-arch', ventureName: 'ApexNiche AI', repoWasMinted: true, supabase });
    expect(first.elevated).toBe(true);
    expect(row.trust_tier).toBe('trusted');

    const second = await elevateVentureRepoTrust({ ventureId: 'v-arch', ventureName: 'ApexNiche AI', repoWasMinted: true, supabase });
    expect(second.elevated).toBe(false);
    expect(second.reason).toBe('already_trusted');
    expect(updateCount).toBe(1); // never double-applied
  });
});

describe('TS-3 negative pin — external-shaped row never elevates AND VB-2 blocks it', () => {
  it('an imported repo (repoWasMinted=false) is never elevated', async () => {
    const r = await resolveTrustElevation({ ventureId: 'v-arch', repoWasMinted: false, supabase: makeSupabase(RATIFIED) });
    expect(r.elevate).toBe(false);
  });

  it('VB-2 (createVentureTrustGate) refuses a repo whose applications.trust_tier is external', async () => {
    // fetchTrustTier reads applications via .select().not() — mirror the gate's own test shape.
    const externalAppsSupabase = {
      from: (t) => {
        if (t !== 'applications') throw new Error(`unexpected table ${t}`);
        return {
          select: () => ({
            not: () => {
              // fetchTrustTier paginates via fetchAllPaginated (SD-LEO-INFRA-COUNT-TRUNCATION-
              // DISCIPLINE-001 FR-6 batch 8) — chainable .order() + a single short .range() page.
              const chain = {
                order: () => chain,
                range: () => Promise.resolve({ data: [{ trust_tier: 'external', github_repo: 'rickfelix/importedco' }], error: null }),
              };
              return chain;
            },
          }),
        };
      },
    };
    const tier = await fetchTrustTier('rickfelix', 'importedco', externalAppsSupabase);
    expect(tier).toBe('external');

    const isTrusted = createVentureTrustGate({ supabase: externalAppsSupabase, fetchStatusCheckRollup: async () => [] });
    const verdict = await isTrusted({ repoOwner: 'rickfelix', repoName: 'importedco', prNumber: 1, workKey: null });
    expect(verdict).toBe(false); // external tier -> gate returns false BEFORE any witness need
  });
});

describe('TS-5 planBackfillForRow — enumerated normalization', () => {
  const stamp = '2026-07-12T00:00:00Z';
  it('skips a row that already has trust_tier_elevation (idempotent)', () => {
    const plan = planBackfillForRow({ id: 'x', name: 'ApexNiche AI', metadata: { trust_tier_elevation: { at: 'prev' } } }, { elevate: true }, stamp);
    expect(plan.action).toBe('skip');
    expect(plan.reason).toBe('already_has_provenance');
  });

  it('writes canonical provenance for a trusted-but-unattributed ratified row (MarketLens)', () => {
    const decision = { elevate: true, provenance: { to: 'trusted', from: 'external', basis: 'b', approved_via: 'vision document', decided_by: 'venture_provisioner_born_trusted_policy' } };
    const plan = planBackfillForRow({ id: 'm', name: 'MarketLens', metadata: {} }, decision, stamp);
    expect(plan.action).toBe('write');
    expect(plan.nextMetadata.trust_tier_elevation.at).toBe(stamp);
    expect(plan.nextMetadata.trust_tier_elevation.backfilled).toBe(true);
  });

  it('skips (never fabricates) when the venture is not ratified', () => {
    const plan = planBackfillForRow({ id: 'z', name: 'Imported', metadata: {} }, { elevate: false, reason: 'no_chairman_approval' }, stamp);
    expect(plan.action).toBe('skip');
    expect(plan.reason).toContain('not_ratified');
  });
});
