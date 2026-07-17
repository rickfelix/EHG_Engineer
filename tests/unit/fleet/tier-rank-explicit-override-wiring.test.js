/**
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 — regression coverage for a ship-gate adversarial-review
 * finding: lib/sd-creation/pipeline.js's explicit min_tier_rank override branch called
 * stampPayloadForCreation() (DB-free by design) but never called checkExplicitTierRankStamp(),
 * so enforce mode could never actually reject an incomplete override and observe mode never
 * logged a calibration row for this surface -- both hold-state-contract library functions were
 * fully correct and unit-tested in isolation, but genuinely unreachable in production.
 *
 * lib/sd-creation/pipeline.js's createSD() has too many DB/side-effect dependencies to
 * unit-test directly (see tests/unit/fleet/vision-key-stamp-at-creation.test.js's precedent) --
 * this file mirrors the argv-extraction predicate and exercises the real two-step
 * stamp-then-check orchestration the fixed block now performs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { stampPayloadForCreation, checkExplicitTierRankStamp } from '../../../lib/fleet/sd-tier-rank.mjs';

// Mirrors the argv-extraction added to lib/sd-creation/pipeline.js's min_tier_rank block.
function extractExplicitTierRankArgs(cliArgs) {
  const idx = (name) => cliArgs.indexOf(name);
  const at = (name) => { const i = idx(name); return i !== -1 ? cliArgs[i + 1] : null; };
  return {
    explicitRank: idx('--min-tier-rank') !== -1 ? Number(at('--min-tier-rank')) : null,
    explicitReason: at('--min-tier-rank-reason'),
    explicitOwner: at('--min-tier-rank-owner'),
    explicitReviewAt: at('--min-tier-rank-review-at'),
    explicitReleaseCondition: at('--min-tier-rank-release-condition'),
  };
}

// Mirrors the fixed pipeline.js orchestration: stamp (sync, DB-free) then check (async,
// observe-mode logs / enforce-mode throws) -- the exact sequence the adversarial review
// found missing its second step.
async function runExplicitOverrideBlock(sd, opts, supabase) {
  const payload = stampPayloadForCreation(sd, opts);
  if (opts.explicitRank != null) {
    await checkExplicitTierRankStamp(supabase, opts);
  }
  return payload;
}

describe('explicit min_tier_rank override CLI argv extraction', () => {
  it('extracts all 5 flags when present', () => {
    const args = extractExplicitTierRankArgs([
      '--min-tier-rank', '4', '--min-tier-rank-reason', 'known complexity',
      '--min-tier-rank-owner', 'coordinator', '--min-tier-rank-review-at', '2026-08-01T00:00:00Z',
      '--min-tier-rank-release-condition', 'sibling ships',
    ]);
    expect(args).toEqual({
      explicitRank: 4, explicitReason: 'known complexity', explicitOwner: 'coordinator',
      explicitReviewAt: '2026-08-01T00:00:00Z', explicitReleaseCondition: 'sibling ships',
    });
  });

  it('the 3 sibling flags are independently optional (rank+reason only, the pre-existing shape)', () => {
    const args = extractExplicitTierRankArgs(['--min-tier-rank', '3', '--min-tier-rank-reason', 'r']);
    expect(args.explicitOwner).toBeNull();
    expect(args.explicitReviewAt).toBeNull();
    expect(args.explicitReleaseCondition).toBeNull();
  });

  it('no --min-tier-rank flag at all (the common --from-plan shape) yields explicitRank=null', () => {
    const args = extractExplicitTierRankArgs(['--title', 'Something']);
    expect(args.explicitRank).toBeNull();
  });
});

describe('explicit override wiring — stamp-then-check actually runs the check (the fixed gap)', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  function fakeSupabase(inserted) {
    return { from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) };
  }

  it('observe mode (default): an incomplete override logs a violation row instead of silently vanishing', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const inserted = [];
    const payload = await runExplicitOverrideBlock(
      { title: 'x' },
      { explicitRank: 4, explicitReason: 'known complexity' }, // no owner/review_at/release_condition
      fakeSupabase(inserted)
    );
    expect(payload.min_tier_rank).toBe(4);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].surface).toBe('min_tier_rank');
  });

  it('enforce mode: an incomplete override THROWS before the SD insert that follows in pipeline.js', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    await expect(runExplicitOverrideBlock(
      { title: 'x' },
      { explicitRank: 4, explicitReason: 'known complexity' },
      fakeSupabase([])
    )).rejects.toThrow(/Hold-state contract violation/);
  });

  it('enforce mode: a complete override passes and logs nothing', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const inserted = [];
    const payload = await runExplicitOverrideBlock(
      { title: 'x' },
      {
        explicitRank: 4, explicitReason: 'known complexity', explicitOwner: 'coordinator',
        explicitReviewAt: '2026-08-01T00:00:00Z', explicitReleaseCondition: 'sibling ships',
      },
      fakeSupabase(inserted)
    );
    expect(payload.min_tier_rank).toBe(4);
    expect(payload.min_tier_rank_owner).toBe('coordinator');
    expect(inserted).toHaveLength(0);
  });

  it('no-signal path (explicitRank absent): the check step never runs (matches "if (explicitRank != null)" guard)', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const inserted = [];
    // A supabase client that throws if ever touched -- proves checkExplicitTierRankStamp
    // was never called when there's no explicit override to check.
    const poisoned = { from: () => { throw new Error('should never be called for the no-signal path'); } };
    const payload = await runExplicitOverrideBlock({ title: 'x' }, {}, poisoned);
    expect(payload).not.toHaveProperty('min_tier_rank_owner');
    expect(inserted).toHaveLength(0);
  });
});
