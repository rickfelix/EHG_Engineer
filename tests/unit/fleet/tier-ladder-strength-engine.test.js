/**
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-1..FR-4) — tier-ladder.cjs strength
 * engine: model×effort capabilityScore, dense-rank live-fleet derivation, conservative-UP
 * normalization, and backward compatibility with the argument-free consumer contract
 * (lib/fleet/sd-tier-rank.mjs, lib/fleet/tier-claimable.cjs, lib/coordinator/dispatch.cjs).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MODEL_STRENGTH,
  capabilityScore,
  rankForModelEffort,
  normalizeModel,
  normalizeEffort,
  deriveLiveLadder,
  deriveWorkerTierRank,
  resolveWorkerTierRank,
  ladderTopRank,
  clamp,
  LADDER,
  __resetLadderCacheForTests,
} from '../../../lib/fleet/tier-ladder.cjs';

beforeEach(() => {
  __resetLadderCacheForTests();
});

describe('FR-1: normalizeModel / normalizeEffort — conservative-UP on unknown', () => {
  it('normalizeEffort maps the legacy "max" spelling to the canonical "xhigh"', () => {
    expect(normalizeEffort('max')).toBe('xhigh');
  });

  it('TS-3: an unrecognized model maps to the strongest known model, not the weakest', () => {
    expect(normalizeModel('some-unknown-future-model')).toBe('fable');
    expect(MODEL_STRENGTH[normalizeModel('some-unknown-future-model')]).toBe(MODEL_STRENGTH.fable);
  });

  it('an unrecognized effort maps to the strongest known effort, not the weakest', () => {
    expect(normalizeEffort('ultracode')).toBe('xhigh');
    expect(normalizeEffort(undefined)).toBe('xhigh');
  });

  it('recognized values pass through unchanged (case-insensitive)', () => {
    expect(normalizeModel('OPUS')).toBe('opus');
    expect(normalizeEffort('Medium')).toBe('medium');
  });
});

describe('FR-1: capabilityScore — model-dominant ordering', () => {
  it('any opus score outranks any sonnet score regardless of effort', () => {
    const weakestOpus = capabilityScore('opus', 'low');
    const strongestSonnet = capabilityScore('sonnet', 'xhigh');
    expect(weakestOpus).toBeGreaterThan(strongestSonnet);
  });

  it('rankForModelEffort is a numeric reverse lookup consistent with capabilityScore ordering', () => {
    const opusXhigh = rankForModelEffort('opus', 'xhigh');
    const sonnetLow = rankForModelEffort('sonnet', 'low');
    expect(typeof opusXhigh).toBe('number');
    expect(opusXhigh).toBeGreaterThan(sonnetLow);
    // legacy 'max' resolves through normalizeEffort before scoring
    expect(rankForModelEffort('sonnet', 'max')).toBe(rankForModelEffort('sonnet', 'xhigh'));
  });
});

describe('FR-2: deriveLiveLadder — dense rank among DISTINCT live scores', () => {
  it('TS-1: a fleet with 2 distinct scores dense-ranks to K=2, model-dominant order preserved', () => {
    const live = deriveLiveLadder([
      { model: 'sonnet', effort: 'xhigh' },
      { model: 'opus', effort: 'low' },
    ]);
    expect(live.topRank).toBe(2);
    const sonnetRank = live.rankByScore.get(capabilityScore('sonnet', 'xhigh'));
    const opusRank = live.rankByScore.get(capabilityScore('opus', 'low'));
    expect(opusRank).toBeGreaterThan(sonnetRank);
  });

  it('TS-2: a homogeneous fleet collapses to K=1 (legitimate no-op)', () => {
    const live = deriveLiveLadder([
      { model: 'opus', effort: 'high' },
      { model: 'opus', effort: 'high' },
      { model: 'opus', effort: 'high' },
    ]);
    expect(live.topRank).toBe(1);
    expect(ladderTopRank()).toBe(1); // cache refreshed
  });

  it('refreshes the cached lastKnownTopRank as a side effect, readable via argument-free ladderTopRank()', () => {
    expect(ladderTopRank()).toBe(LADDER.length); // default before any live fleet
    deriveLiveLadder([
      { model: 'haiku', effort: 'low' },
      { model: 'sonnet', effort: 'medium' },
      { model: 'opus', effort: 'xhigh' },
    ]);
    expect(ladderTopRank()).toBe(3);
    expect(clamp(99)).toBe(3); // clamp() picks up the refreshed cache
  });

  it('an empty live fleet leaves the cache untouched (degrades safely to the prior/default K)', () => {
    const before = ladderTopRank();
    const live = deriveLiveLadder([]);
    expect(live.topRank).toBe(before);
    expect(ladderTopRank()).toBe(before);
  });
});

describe('FR-3/FR-4: deriveWorkerTierRank — live-fleet-aware, falls back to single-arg behavior', () => {
  it('resolves via the live dense rank when a live fleet + session model/effort are present', () => {
    const liveFleet = [
      { model: 'sonnet', effort: 'xhigh' },
      { model: 'opus', effort: 'low' },
    ];
    const session = { metadata: { model: 'opus', effort: 'low' } };
    expect(deriveWorkerTierRank(session, liveFleet)).toBe(2); // opus/low is the stronger of the 2 distinct scores
  });

  it('falls back to resolveWorkerTierRank when no live fleet is supplied', () => {
    const session = { metadata: { tier_rank: 2 } };
    expect(deriveWorkerTierRank(session)).toBe(resolveWorkerTierRank(session));
    expect(deriveWorkerTierRank(session)).toBe(2);
  });

  it('falls back to resolveWorkerTierRank when the session has no model/effort even with a live fleet', () => {
    const session = { metadata: { tier_rank: 3 } };
    const liveFleet = [{ model: 'opus', effort: 'xhigh' }];
    expect(deriveWorkerTierRank(session, liveFleet)).toBe(3);
  });
});

describe('TS-7: backward compatibility — argument-free consumer contract unchanged', () => {
  it('ladderTopRank() and clamp() remain callable with zero arguments', () => {
    expect(ladderTopRank()).toBe(4);
    expect(clamp(2)).toBe(2);
    expect(clamp(99)).toBe(4);
  });

  it('resolveWorkerTierRank(session) remains single-arg and unchanged', () => {
    expect(resolveWorkerTierRank({ metadata: { tier_rank: 1 } })).toBe(1);
    expect(resolveWorkerTierRank({})).toBe(4);
  });

  it('module.exports still exposes clamp and ladderTopRank (sd-tier-rank.mjs ESM-default-imports + destructures these)', async () => {
    // Mirrors sd-tier-rank.mjs's own import shape: `import ladder from '.../tier-ladder.cjs'`
    // then destructuring named exports off the CJS module.exports default.
    const ladderDefault = (await import('../../../lib/fleet/tier-ladder.cjs')).default;
    expect(typeof ladderDefault.clamp).toBe('function');
    expect(typeof ladderDefault.ladderTopRank).toBe('function');
  });
});
