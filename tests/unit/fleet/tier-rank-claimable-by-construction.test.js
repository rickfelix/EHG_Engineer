/**
 * QF-20260704-717 (2nd occurrence): leo-create-sd.js stamps unclaimable-by-construction
 * metadata.min_tier_rank=4 as a silent default for signal-less (--from-plan) SDs, stranding
 * them ~30min until a human manually re-stamps. computeMinTierRank()'s fail-safe-up philosophy
 * is correct for its OTHER callers, so the fix is a separate creation-time helper,
 * stampPayloadForCreation(), not a change to computeMinTierRank() itself.
 */
import { describe, it, expect } from 'vitest';
import { computeMinTierRank, stampPayloadForCreation, FLEET_CLAIMABLE_BASELINE_RANK } from '../../../lib/fleet/sd-tier-rank.mjs';

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
