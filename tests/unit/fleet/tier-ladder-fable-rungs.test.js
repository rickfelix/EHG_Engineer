/**
 * QF-20260705-394: the static ladder topped at opus/high=4 with no fable rungs, and
 * rankForModelEffort returned a raw model×effort lattice value (fable/xhigh = 16) that
 * every caller clamped against the process-cached live top rank. A live-shrunk cache
 * (K=3 fleet) collapsed the fleet's STRONGEST worker (FABLE-MAX, live specimen
 * 4901448b) to tier_rank=3 — below statically-stamped min_tier_rank=4 SDs — so
 * coordinator rank-4 stamps were clobbered on every self-report checkin and dispatch
 * of SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 was refused (DISPATCH_ABOVE_WORKER_TIER)
 * against the strongest worker.
 *
 * Fix under test: rankForModelEffort returns the STATIC-ladder dense rank
 * (ladder-bounded by construction, process-independent) — every fable pair scores
 * above ALL static rungs and maps to the TOP rung (ties opus/high at 4; the static K
 * deliberately stays 4 so K-anchored consumers like sd-tier-rank's Opus-med floor and
 * callsign tier bands are untouched). worker-checkin stamps it UNCLAMPED so any
 * re-derivation self-heals instead of clobbering.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  LADDER,
  MODEL_STRENGTH,
  rankForModelEffort,
  ladderTopRank,
  deriveLiveLadder,
  stampRankForWorker,
  __resetLadderCacheForTests,
} = require('../../../lib/fleet/tier-ladder.cjs');
const { mergeCheckinModelEffort } = require('../../../scripts/worker-checkin.cjs');

beforeEach(() => __resetLadderCacheForTests());
afterEach(() => __resetLadderCacheForTests());

describe('static LADDER — fable rungs above opus (QF-20260705-394)', () => {
  it('the QF acceptance criterion: rankForModelEffort(fable, xhigh) === ladderTopRank()', () => {
    expect(rankForModelEffort('fable', 'xhigh')).toBe(ladderTopRank());
  });

  it('every fable pair maps to the TOP static rung (K stays 4 — no consumer semantic shift)', () => {
    expect(LADDER.length).toBe(4); // Opus-med floor / callsign bands / midRank all anchor here
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      expect(rankForModelEffort('fable', effort)).toBe(LADDER.length);
    }
    expect(MODEL_STRENGTH.fable).toBeGreaterThan(MODEL_STRENGTH.opus); // dominance lives in score space
  });

  it('DB compatibility: ranks 1-4 keep their pre-fix meaning (opus/high === 4)', () => {
    expect(rankForModelEffort('sonnet', 'max')).toBe(1);
    expect(rankForModelEffort('opus', 'low')).toBe(2);
    expect(rankForModelEffort('opus', 'medium')).toBe(3);
    expect(rankForModelEffort('opus', 'high')).toBe(4);
  });

  it('no fable pair ever ranks BELOW any opus pair (the clobber precondition is impossible)', () => {
    for (const fableEffort of ['low', 'medium', 'high', 'xhigh']) {
      for (const opusEffort of ['low', 'medium', 'high', 'xhigh']) {
        expect(rankForModelEffort('fable', fableEffort))
          .toBeGreaterThanOrEqual(rankForModelEffort('opus', opusEffort));
      }
    }
  });

  it('below-ladder pairs floor at rank 1 instead of clamping UP to the top rung (old absurdity)', () => {
    expect(rankForModelEffort('haiku', 'low')).toBe(1);
    expect(rankForModelEffort('sonnet', 'low')).toBe(1);
    expect(rankForModelEffort('sonnet', 'low')).toBeLessThan(rankForModelEffort('opus', 'low'));
  });

  it('returned rank is always ladder-bounded: within [1, LADDER.length] for every lattice pair', () => {
    for (const model of ['haiku', 'sonnet', 'opus', 'fable']) {
      for (const effort of ['low', 'medium', 'high', 'xhigh']) {
        const rank = rankForModelEffort(model, effort);
        expect(rank).toBeGreaterThanOrEqual(1);
        expect(rank).toBeLessThanOrEqual(LADDER.length);
      }
    }
  });
});

describe('deriveLiveLadder — fable sessions participate and dense-rank at the live top', () => {
  it('a mixed fleet dense-ranks fable/xhigh at the live top rank', () => {
    const { entries, topRank } = deriveLiveLadder([
      { model: 'sonnet', effort: 'high' },
      { model: 'opus', effort: 'high' },
      { model: 'fable', effort: 'xhigh' },
    ]);
    const fable = entries.find((e) => e.model === 'fable');
    expect(topRank).toBe(3);
    expect(fable.rank).toBe(3);
  });
});

describe('the clobber regression — self-report re-derivation self-heals under a live-shrunk cache', () => {
  it('fable/xhigh stamps the static top rank even after deriveLiveLadder shrank the cached K to 3', () => {
    // Reproduce the specimen: a 3-distinct-score live fleet shrinks the module cache to K=3.
    deriveLiveLadder([
      { model: 'sonnet', effort: 'high' },
      { model: 'opus', effort: 'high' },
      { model: 'fable', effort: 'xhigh' },
    ]);
    expect(ladderTopRank()).toBe(3); // the shrunk cache the old clamp() collapsed against
    const result = mergeCheckinModelEffort({}, { model: 'fable', effort: 'xhigh' });
    expect(result.changed).toBe(true);
    // Old behavior: clamp(16 -> liveK 3) = 3, below min_tier_rank=4 SDs. Fixed: static top.
    expect(result.metadata.tier_rank).toBe(LADDER.length);
    expect(result.metadata.tier_rank).toBeGreaterThanOrEqual(4);
  });

  it('a coordinator rank-4 stamp is not degraded by an opus/high self-report (idempotent value)', () => {
    const result = mergeCheckinModelEffort({ tier_rank: 4 }, { model: 'opus', effort: 'high' });
    expect(result.metadata.tier_rank).toBe(4);
  });
});

describe('stampRankForWorker — the identity-assigner cron writer (the recurring 4->3 clobberer)', () => {
  const K3_FLEET = [
    { model: 'sonnet', effort: 'high' },
    { model: 'opus', effort: 'high' },
    { model: 'fable', effort: 'xhigh' },
  ];

  it('floors fable/xhigh at the static top even when the live fleet compresses to K=3', () => {
    const worker = { metadata: { model: 'fable', effort: 'xhigh' } };
    expect(stampRankForWorker(worker, K3_FLEET)).toBe(4); // live dense rank is 3; static floor wins
  });

  it('floors opus/high at its static rung 4 in a compressed fleet (same defect class)', () => {
    const worker = { metadata: { model: 'opus', effort: 'high' } };
    expect(stampRankForWorker(worker, [{ model: 'sonnet', effort: 'high' }, { model: 'opus', effort: 'high' }])).toBe(4);
  });

  it('does not floor weak configs UP: sonnet/high stays at its live/static rank 1', () => {
    const worker = { metadata: { model: 'sonnet', effort: 'high' } };
    expect(stampRankForWorker(worker, K3_FLEET)).toBe(1);
  });

  it('unknown model/effort keeps the deriveWorkerTierRank fallback (existing stamp honored)', () => {
    const worker = { metadata: { tier_rank: 2 } };
    expect(stampRankForWorker(worker, K3_FLEET)).toBe(2);
  });
});
