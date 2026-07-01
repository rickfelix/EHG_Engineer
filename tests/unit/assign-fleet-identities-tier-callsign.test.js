// QF-20260627-108: the chairman effort-encoded callsign scheme must be derived from
// metadata.tier_rank (source-of-truth) instead of flat first-available NATO order, or the
// 5-min assign-fleet-identities cron re-clobbers the effort names every pass. tier4=Alpha/
// Bravo/Charlie, tier3=Delta/Echo/Foxtrot, tier2=Golf, tier1=Hotel. The picker is shared with
// worker-checkin.cjs so both writers honor the scheme identically.
//
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-C: the static TIER_CALLSIGNS map was replaced with
// buildTierCallsignBands(topRank), derived dynamically from lib/fleet/tier-ladder.cjs's
// ladderTopRank() so the band count is never assumed to be 4. At the default K=4 it must
// reproduce the legacy split byte-for-byte (assertions below); at other K it must still
// produce exactly K non-empty bands.

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildTierCallsignBands,
  tierRankOf,
  pickCallsignForTier,
  callsignInTierBand,
  nextAvailable,
  extendCallsign,
  NATO,
} = require('../../scripts/assign-fleet-identities.cjs');

describe('QF-20260627-108: tier-encoded callsign assignment', () => {
  it('buildTierCallsignBands(4) reproduces the legacy effort-encoded band map', () => {
    const bands = buildTierCallsignBands(4);
    expect(bands[4]).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(bands[3]).toEqual(['Delta', 'Echo', 'Foxtrot']);
    expect(bands[2]).toEqual(['Golf']);
    expect(bands[1]).toEqual(['Hotel']);
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

  it('wraps to the first FREE numeric suffix only when the band is exhausted (SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 FR-3)', () => {
    // tier-2 band has one slot (Golf); exhaustion extends deterministically to the first free base-N (N>=2).
    expect(pickCallsignForTier(2, new Set(['Golf']))).toBe('Golf-2');
    // Collision honesty: never re-issue an already-used suffix — skip Golf-2, return Golf-3.
    expect(pickCallsignForTier(2, new Set(['Golf', 'Golf-2']))).toBe('Golf-3');
    // A vacated mid-index (Golf-2 free but Golf-3 used) is filled first, NOT re-colliding Golf-3.
    expect(pickCallsignForTier(2, new Set(['Golf', 'Golf-3']))).toBe('Golf-2');
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

describe('SD-LEO-INFRA-CHECKIN-NAME-ON-ARRIVAL-001 FR-3: deterministic pool exhaustion', () => {
  it('extendCallsign returns the first FREE base-N (>=2) and never an already-used suffix', () => {
    expect(extendCallsign('Alpha', new Set(['Alpha']), 't')).toBe('Alpha-2');
    expect(extendCallsign('Alpha', new Set(['Alpha', 'Alpha-2', 'Alpha-3']), 't')).toBe('Alpha-4');
    expect(extendCallsign('Alpha', new Set(['Alpha', 'Alpha-3']), 't')).toBe('Alpha-2'); // fill vacated
  });

  it('logs a deterministic "pool exhausted" line on extension (never silent)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    extendCallsign('Golf', new Set(['Golf']), 'tier-2');
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/pool exhausted.*Golf-2/));
    spy.mockRestore();
  });

  it('nextAvailable shares the identical first-free format so both writers reconcile in lockstep', () => {
    // NATO pool fully used -> extend deterministically, matching pickCallsignForTier's format.
    const used = new Set(NATO);
    expect(nextAvailable(NATO, used)).toBe('Alpha-2');
    // And it skips an already-used extended suffix rather than colliding.
    expect(nextAvailable(NATO, new Set([...NATO, 'Alpha-2']))).toBe('Alpha-3');
  });
});

describe('SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-C: dynamic band count (K != 4)', () => {
  it('a K=2 fleet produces exactly 2 callsign bands, not 4', () => {
    const bands = buildTierCallsignBands(2);
    expect(Object.keys(bands).sort((a, b) => a - b)).toEqual(['1', '2']);
    expect(bands[1]).toEqual(['Hotel']);
    expect(bands[2]).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf']);
  });

  it('a K=1 fleet produces exactly 1 band covering the whole pool', () => {
    const bands = buildTierCallsignBands(1);
    expect(Object.keys(bands)).toEqual(['1']);
    expect(bands[1]).toEqual(NATO);
  });

  it('every band is non-empty even when K exceeds the NATO pool size (safety floor)', () => {
    const bands = buildTierCallsignBands(10);
    for (let rank = 1; rank <= 10; rank += 1) {
      expect(bands[rank]).toBeDefined();
      expect(bands[rank].length).toBeGreaterThan(0);
    }
  });

  it('bands partition the pool with no overlap at K=3', () => {
    const bands = buildTierCallsignBands(3);
    expect(Object.keys(bands).sort((a, b) => a - b)).toEqual(['1', '2', '3']);
    const flat = [...bands[1], ...bands[2], ...bands[3]];
    expect(new Set(flat).size).toBe(flat.length); // no duplicates across bands
  });
});
