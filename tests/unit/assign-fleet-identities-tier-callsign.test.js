// QF-20260627-108: the chairman effort-encoded callsign scheme must be derived from
// metadata.tier_rank (source-of-truth) instead of flat first-available NATO order, or the
// 5-min assign-fleet-identities cron re-clobbers the effort names every pass. tier4=Alpha/
// Bravo/Charlie, tier3=Delta/Echo/Foxtrot, tier2=Golf, tier1=Hotel. The picker is shared with
// worker-checkin.cjs so both writers honor the scheme identically.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  TIER_CALLSIGNS,
  tierRankOf,
  pickCallsignForTier,
  callsignInTierBand,
} = require('../../scripts/assign-fleet-identities.cjs');

describe('QF-20260627-108: tier-encoded callsign assignment', () => {
  it('maps each tier to its effort-encoded band', () => {
    expect(TIER_CALLSIGNS[4]).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(TIER_CALLSIGNS[3]).toEqual(['Delta', 'Echo', 'Foxtrot']);
    expect(TIER_CALLSIGNS[2]).toEqual(['Golf']);
    expect(TIER_CALLSIGNS[1]).toEqual(['Hotel']);
  });

  it('tierRankOf reads metadata.tier_rank and defaults unstamped workers to tier 4', () => {
    expect(tierRankOf({ metadata: { tier_rank: 2 } })).toBe(2);
    expect(tierRankOf({ metadata: { tier_rank: 1 } })).toBe(1);
    expect(tierRankOf({ metadata: {} })).toBe(4);     // unstamped -> top band
    expect(tierRankOf({ metadata: { tier_rank: 9 } })).toBe(4); // invalid -> top band
    expect(tierRankOf(null)).toBe(4);
  });

  it('pickCallsignForTier picks from the tier band, not flat NATO order', () => {
    expect(pickCallsignForTier(2, new Set())).toBe('Golf');       // low effort -> Golf
    expect(pickCallsignForTier(1, new Set())).toBe('Hotel');
    expect(pickCallsignForTier(4, new Set())).toBe('Alpha');
    expect(pickCallsignForTier(4, new Set(['Alpha']))).toBe('Bravo');
    expect(pickCallsignForTier(4, new Set(['Alpha', 'Bravo']))).toBe('Charlie');
  });

  it('wraps with a numeric suffix only when the band is exhausted', () => {
    const used = new Set(['Golf']);
    expect(pickCallsignForTier(2, used)).toBe('Golf-' + (used.size + 1)); // tier-2 band has one slot
  });

  it('callsignInTierBand detects a wrong-band callsign so the cron self-heals it', () => {
    // The exact bug: a tier-2 worker still holding a tier-4 "Bravo" must be re-derived.
    expect(callsignInTierBand('Bravo', 2)).toBe(false);
    expect(callsignInTierBand('Golf', 2)).toBe(true);
    expect(callsignInTierBand('Alpha', 4)).toBe(true);
    expect(callsignInTierBand('Golf-2', 2)).toBe(true); // suffix-wrapped still in band
    expect(callsignInTierBand(null, 2)).toBe(false);
  });
});
