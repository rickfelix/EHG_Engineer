/**
 * SD-LEO-INFRA-TIER-FLOOR-PROVENANCE-001 (FR-5) — mint-time advisory-by-default policy,
 * end-to-end from stampPayloadForCreation() through tierRankVerdict()/classifyDispatchIneligibility().
 *
 * FINDING (transitive coverage, not a gap): stampPayloadForCreation() ALREADY satisfies FR-5's
 * mint-time policy with ZERO code changes, because FR-2/FR-3 made the READ side (tierRankVerdict)
 * provenance-aware, and the WRITE side already had the right shape:
 *   - the no-explicit-override path (risk-floor / real-signal / no-signal-baseline) NEVER sets
 *     min_tier_rank_reason -- every non-explicit mint is provenance-free BY CONSTRUCTION, so it now
 *     reads as advisory (ruling 1B) automatically, with no write-side change required.
 *   - the explicit-override path THROWS without a reason (line ~156-159) -- every explicit floor
 *     is provenance-bearing BY CONSTRUCTION, so it stays binding, which is the correct intent (an
 *     author who deliberately floors an SD is expected to justify it).
 * This suite pins that end-to-end claim so a future edit to either side (adding a reason to the
 * default path, or relaxing the explicit-override throw) is caught even though neither module
 * calls the other directly.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { stampPayloadForCreation } = require('../../../lib/fleet/sd-tier-rank.mjs');
const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');
const { ladderTopRank } = require('../../../lib/fleet/tier-ladder.cjs');

function sdWith(metadata) {
  return { sd_key: 'SD-MINT-TEST', sd_type: 'infrastructure', status: 'draft', metadata };
}

describe('FR-5: a risk-floor mint is provenance-free by construction -> advisory at read time', () => {
  it('stampPayload carries no min_tier_rank_reason', () => {
    const payload = stampPayloadForCreation({ sd_type: 'infrastructure', description: 'alter table ventures' });
    expect(payload.min_tier_rank_reason).toBeUndefined();
  });

  it('a below-rung worker is NOT blocked by the resulting stamp (advisory default)', () => {
    const payload = stampPayloadForCreation({ sd_type: 'infrastructure', description: 'alter table ventures' });
    expect(payload.min_tier_rank).toBe(ladderTopRank()); // risk-floor -> top rung
    const sd = sdWith(payload);
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true })).toBeNull();
  });
});

describe('FR-5: a no-signal mint is provenance-free by construction -> advisory at read time', () => {
  it('stampPayload carries no min_tier_rank_reason and the fleet-claimable baseline rank', () => {
    const payload = stampPayloadForCreation({ sd_type: 'infrastructure' });
    expect(payload.min_tier_rank_reason).toBeUndefined();
    expect(Number.isFinite(payload.min_tier_rank)).toBe(true);
  });
});

describe('FR-5: an explicit-override mint REQUIRES a reason and stays binding at read time', () => {
  it('throws without opts.explicitReason', () => {
    expect(() => stampPayloadForCreation({}, { explicitRank: 4 })).toThrow(/requires a recorded reason/);
  });

  it('with a reason, the resulting stamp is provenance-bearing and BLOCKS a below-rung worker', () => {
    const payload = stampPayloadForCreation({}, { explicitRank: 4, explicitReason: 'reserved for the fable rollout' });
    expect(payload.min_tier_rank).toBe(4);
    expect(payload.min_tier_rank_reason).toBe('reserved for the fable rollout');
    const sd = sdWith(payload);
    expect(classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true })).toBe('above_worker_tier');
  });
});
