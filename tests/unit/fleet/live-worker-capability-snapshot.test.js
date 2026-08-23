/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-1 support): liveWorkerCapabilitySnapshot is the
 * fetchLiveFleetRows-sharing extraction that gives lib/fleet/dispatch-suggestions.cjs's advisory
 * suggestion engine the per-worker live ranks isTieringActive's boolean does not expose.
 *
 * STATIC RANK SPACE, NOT LIVE-DYNAMIC (caught live while an earlier iteration of this SD also
 * wired a defer mechanism into merged-pool-self-claim.cjs — since removed, see
 * dispatch-suggestions.cjs header): the rank must be rankForModelEffort()'s FIXED 4-rung static
 * rank, the same space item.metadata.min_tier_rank is calibrated in (lib/fleet/sd-tier-rank.mjs
 * computeMinTierRank). A live-relative dense rank (1..K over whoever happens to be live right
 * now) silently disagrees with that static floor the moment fleet composition changes — pinned
 * here directly against the primitive.
 */
import { describe, it, expect } from 'vitest';
import { liveWorkerCapabilitySnapshot, rankForModelEffort } from '../../../lib/fleet/tier-ladder.cjs';

const NOW = new Date('2026-08-22T12:00:00.000Z').getTime();
const FRESH = new Date(NOW - 60_000).toISOString(); // 1 min ago — well inside the 15-min window

// The 4 named STATIC LADDER rungs (lib/fleet/tier-ladder.cjs LADDER), so ranks are unambiguous.
const RUNG1 = ['sonnet', 'low'];   // static rank 1
const RUNG3 = ['opus', 'medium'];  // static rank 3
const RUNG4 = ['opus', 'high'];    // static rank 4

// Minimal but genuine-worker.mjs-satisfying claude_sessions row: live status, everClaimed via
// sd_key, not coordinator/adam/non_fleet.
const liveRow = (session_id, [model, effort], over = {}) => ({
  session_id, status: 'active', heartbeat_at: FRESH, sd_key: `SD-${session_id}`,
  metadata: { model, effort }, ...over,
});

function makeSb(rows) {
  return {
    from: (table) => {
      if (table !== 'claude_sessions') return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'not found' } }) }) }) };
      return {
        select: () => ({
          in: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      };
    },
  };
}

describe('liveWorkerCapabilitySnapshot', () => {
  it('sanity: the named rungs resolve to their expected static ranks (ground truth for this file)', () => {
    expect(rankForModelEffort(...RUNG1)).toBe(1);
    expect(rankForModelEffort(...RUNG3)).toBe(3);
    expect(rankForModelEffort(...RUNG4)).toBe(4);
  });

  it('fails open to an empty snapshot on any query fault', async () => {
    const brokenSb = { from() { throw new Error('synthetic fault'); } };
    const snap = await liveWorkerCapabilitySnapshot(brokenSb);
    expect(snap).toEqual({ workers: [], ranks: [] });
  });

  it('fails open to an empty snapshot when the query itself errors', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          in: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({ data: null, error: { message: 'boom' } }),
              }),
            }),
          }),
        }),
      }),
    };
    const snap = await liveWorkerCapabilitySnapshot(sb);
    expect(snap).toEqual({ workers: [], ranks: [] });
  });

  it('every worker is ranked with the STATIC rankForModelEffort value, independent of fleet composition', async () => {
    // A 2-live-worker snapshot and a 5-live-worker snapshot must rank the SAME (model,effort) at
    // RUNG3 identically — a dynamic dense rank would NOT (it would shift with fleet composition).
    const small = makeSb([liveRow('mid', RUNG3), liveRow('other', RUNG1)]);
    const large = makeSb([
      liveRow('mid', RUNG3), liveRow('a', RUNG1), liveRow('b', RUNG1), liveRow('c', RUNG4), liveRow('d', RUNG4),
    ]);
    const snapSmall = await liveWorkerCapabilitySnapshot(small, { nowMs: NOW });
    const snapLarge = await liveWorkerCapabilitySnapshot(large, { nowMs: NOW });
    const midInSmall = snapSmall.workers.find((w) => w.session_id === 'mid');
    const midInLarge = snapLarge.workers.find((w) => w.session_id === 'mid');
    expect(midInSmall.rank).toBe(3);
    expect(midInLarge.rank).toBe(3);
  });

  it('workers/ranks cover every live worker, with model/effort passed through', async () => {
    const rows = [liveRow('a', RUNG1), liveRow('b', RUNG4)];
    const sb = makeSb(rows);
    const snap = await liveWorkerCapabilitySnapshot(sb, { nowMs: NOW });
    expect(snap.workers).toHaveLength(2);
    expect(snap.ranks.sort((x, y) => x - y)).toEqual([1, 4]);
    expect(snap.workers.find((w) => w.session_id === 'a').model).toBe('sonnet');
  });
});
