/**
 * QF-20260704-717 (2nd occurrence): leo-create-sd.js stamps unclaimable-by-construction
 * metadata.min_tier_rank=4 as a silent default for signal-less (--from-plan) SDs, stranding
 * them ~30min until a human manually re-stamps. computeMinTierRank()'s fail-safe-up philosophy
 * is correct for its OTHER callers, so the fix is a separate creation-time helper,
 * stampPayloadForCreation(), not a change to computeMinTierRank() itself.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { computeMinTierRank, stampPayloadForCreation, checkExplicitTierRankStamp, FLEET_CLAIMABLE_BASELINE_RANK } from '../../../lib/fleet/sd-tier-rank.mjs';

describe('FLEET_CLAIMABLE_BASELINE_RANK', () => {
  it('is derived from the ladder (opus/low = rank 2), not a hand-rolled literal', () => {
    expect(FLEET_CLAIMABLE_BASELINE_RANK).toBe(2);
  });
});

describe('stampPayloadForCreation — no explicit override', () => {
  it('acceptance (1): a signal-less --from-plan-shaped SD stamps the claimable baseline, not the ladder top', () => {
    const fromPlanSd = { sd_key: 'SD-X-001', metadata: { source: 'plan', plan_content: '# Some Plan\n...' } };
    expect(computeMinTierRank(fromPlanSd)).toBeGreaterThan(FLEET_CLAIMABLE_BASELINE_RANK); // old behavior: fail-safe-up (4)
    expect(stampPayloadForCreation(fromPlanSd)).toEqual({ min_tier_rank: FLEET_CLAIMABLE_BASELINE_RANK });
  });

  it('a real risk-keyword signal is respected untouched (not silently downgraded to baseline)', () => {
    const riskySd = { sd_key: 'SD-RISK-001', title: 'Add payments authentication', metadata: {} };
    const computed = computeMinTierRank(riskySd);
    expect(stampPayloadForCreation(riskySd)).toEqual({ min_tier_rank: computed });
    expect(computed).toBeGreaterThan(FLEET_CLAIMABLE_BASELINE_RANK);
  });

  it('a real sd_type=feature signal is respected untouched', () => {
    const featureSd = { sd_key: 'SD-FEAT-001', sd_type: 'feature', metadata: {} };
    expect(stampPayloadForCreation(featureSd)).toEqual({ min_tier_rank: computeMinTierRank(featureSd) });
  });

  it('a real LOC signal is respected untouched', () => {
    const locSd = { sd_key: 'SD-LOC-001', metadata: { estimated_loc: 200 } };
    expect(stampPayloadForCreation(locSd)).toEqual({ min_tier_rank: computeMinTierRank(locSd) });
  });
});

describe('stampPayloadForCreation — explicit override', () => {
  it('acceptance (2): explicit rank + reason stamps that rank with the reason recorded', () => {
    const sd = { sd_key: 'SD-EXPLICIT-001', metadata: {} };
    expect(stampPayloadForCreation(sd, { explicitRank: 4, explicitReason: 'known architectural complexity, per Adam triage' }))
      .toEqual({ min_tier_rank: 4, min_tier_rank_reason: 'known architectural complexity, per Adam triage' });
  });

  it('acceptance (3): explicit rank WITHOUT a reason throws loudly', () => {
    const sd = { sd_key: 'SD-NOREASON-001', metadata: {} };
    expect(() => stampPayloadForCreation(sd, { explicitRank: 4 })).toThrow(/requires a recorded reason/);
  });

  it('explicit rank with an empty/whitespace-only reason also throws', () => {
    const sd = { sd_key: 'SD-BLANKREASON-001', metadata: {} };
    expect(() => stampPayloadForCreation(sd, { explicitRank: 4, explicitReason: '   ' })).toThrow(/requires a recorded reason/);
  });

  it('an explicit override wins even when a real signal is also present', () => {
    const sd = { sd_key: 'SD-OVERRIDE-001', sd_type: 'feature', metadata: {} };
    expect(stampPayloadForCreation(sd, { explicitRank: 1, explicitReason: 'trivial despite the type' }))
      .toEqual({ min_tier_rank: 1, min_tier_rank_reason: 'trivial despite the type' });
  });
});

describe('stampPayloadForCreation — hold-state contract sibling stamp (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001, FR-4)', () => {
  it('TS-7 (regression): omitting explicitOwner/explicitReviewAt/explicitReleaseCondition returns the EXACT pre-existing 2-key shape', () => {
    const sd = { sd_key: 'SD-EXPLICIT-001', metadata: {} };
    expect(stampPayloadForCreation(sd, { explicitRank: 4, explicitReason: 'known architectural complexity' }))
      .toEqual({ min_tier_rank: 4, min_tier_rank_reason: 'known architectural complexity' });
  });

  it('adds owner/review_at/release_condition as sibling keys when provided, without touching min_tier_rank\'s shape', () => {
    const sd = { sd_key: 'SD-EXPLICIT-002', metadata: {} };
    const payload = stampPayloadForCreation(sd, {
      explicitRank: 4, explicitReason: 'Fable-exclusive per architecture',
      explicitOwner: 'coordinator', explicitReviewAt: '2026-08-01T00:00:00Z', explicitReleaseCondition: 'architecture review',
      writingSessionId: 'sess-1',
    });
    expect(payload.min_tier_rank).toBe(4);
    expect(typeof payload.min_tier_rank).toBe('number');
    expect(payload.min_tier_rank_owner).toBe('coordinator');
    expect(payload.min_tier_rank_review_at).toBe('2026-08-01T00:00:00Z');
    expect(payload.min_tier_rank_release_condition).toBe('architecture review');
    expect(payload.min_tier_rank_stamped_by_session).toBe('sess-1');
  });

  it('TS-3 (persisted-shape pin): the sibling stamp never changes metadata.min_tier_rank into anything but a bare finite integer', () => {
    const sd = { sd_key: 'SD-EXPLICIT-003', metadata: {} };
    const payload = stampPayloadForCreation(sd, {
      explicitRank: 3, explicitReason: 'r', explicitOwner: 'o', explicitReviewAt: '2026-08-01T00:00:00Z', explicitReleaseCondition: 'c',
    });
    const merged = { ...sd, metadata: { ...sd.metadata, ...payload } };

    // The 3 REAL consumers (per TESTING sub-agent evidence) all do Number(metadata.min_tier_rank)
    // and fail OPEN on non-finite -- pin that they still see a valid number after the stamp lands.
    expect(Number.isFinite(Number(merged.metadata.min_tier_rank))).toBe(true); // claim-eligibility.cjs:300 shape
    expect(Number.isFinite(Number(merged.metadata && merged.metadata.min_tier_rank))).toBe(true); // dispatch.cjs:409 shape
    const raw = merged.metadata ? merged.metadata.min_tier_rank : undefined; // tier-claimable.cjs:41 shape
    expect(Number.isFinite(Number(raw))).toBe(true);
    expect(merged.metadata.min_tier_rank).toBe(3);
  });
});

describe('checkExplicitTierRankStamp', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  it('observe mode (default) never throws and logs a violation on an incomplete stamp', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const inserts = [];
    const fakeSupabase = { from: () => ({ insert: async (row) => { inserts.push(row); return { error: null }; } }) };
    const result = await checkExplicitTierRankStamp(fakeSupabase, { explicitReason: 'r' });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('observe');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].surface).toBe('min_tier_rank');
  });

  it('enforce mode throws on an incomplete stamp', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    await expect(checkExplicitTierRankStamp(null, { explicitReason: 'r' })).rejects.toThrow(/Hold-state contract violation/);
  });

  it('enforce mode passes on a complete stamp', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const result = await checkExplicitTierRankStamp(null, {
      explicitReason: 'r', explicitOwner: 'o', explicitReviewAt: '2026-08-01T00:00:00Z', explicitReleaseCondition: 'c',
    });
    expect(result.ok).toBe(true);
  });
});
