/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-2 support): liveWorkerCapabilitySnapshot is the
 * fetchLiveFleetRows-sharing extraction that gives merged-pool-self-claim + dispatch-suggestions
 * the per-worker live ranks isTieringActive's boolean does not expose.
 *
 * ONE LADDER, NOT TWO: selfRank and ranks (peers) MUST come from the SAME dense-rank computation
 * over the full live fleet (self included), not self ranked separately from peers — otherwise a
 * caller comparing selfRank against ranks compares two incommensurate scales. This was caught
 * live while writing the FR-2 wiring-pin test (tests/unit/checkin/pickup-fit-wiring.test.js) and
 * is pinned here directly against the primitive.
 */
import { describe, it, expect } from 'vitest';
import { liveWorkerCapabilitySnapshot } from '../../../lib/fleet/tier-ladder.cjs';

const NOW = new Date('2026-08-22T12:00:00.000Z').getTime();
const FRESH = new Date(NOW - 60_000).toISOString(); // 1 min ago — well inside the 15-min window

// Minimal but genuine-worker.mjs-satisfying claude_sessions row: live status, everClaimed via
// sd_key, not coordinator/adam/non_fleet.
const liveRow = (session_id, model, effort, over = {}) => ({
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
  it('fails open to an empty snapshot (including selfRank:null) on any query fault', async () => {
    const brokenSb = { from() { throw new Error('synthetic fault'); } };
    const snap = await liveWorkerCapabilitySnapshot(brokenSb);
    expect(snap).toEqual({ workers: [], ranks: [], selfRank: null });
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
    expect(snap).toEqual({ workers: [], ranks: [], selfRank: null });
  });

  it('selfRank and peer ranks come from ONE ladder computed over the full live fleet', async () => {
    // 3 live workers: haiku (weakest), sonnet (mid), opus (strongest) — 3 distinct scores -> dense
    // ranks 1, 2, 3 respectively when all three are ranked TOGETHER.
    const rows = [
      liveRow('weak', 'haiku', 'low'),
      liveRow('mid', 'sonnet', 'medium'),
      liveRow('strong', 'opus', 'high'),
    ];
    const sb = makeSb(rows);
    const snap = await liveWorkerCapabilitySnapshot(sb, { excludeSessionId: 'mid', nowMs: NOW });
    // 'mid' (sonnet) ranks 2 of 3 in the FULL ladder — not 1-of-2 as it would if ranked only
    // among the OTHER two peers after exclusion (the bug this test exists to catch).
    expect(snap.selfRank).toBe(2);
    expect(snap.workers.map((w) => w.session_id).sort()).toEqual(['strong', 'weak']);
    expect(snap.ranks.sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('without excludeSessionId, selfRank is null and workers/ranks cover everyone', async () => {
    const rows = [liveRow('a', 'haiku', 'low'), liveRow('b', 'opus', 'high')];
    const sb = makeSb(rows);
    const snap = await liveWorkerCapabilitySnapshot(sb, { nowMs: NOW });
    expect(snap.selfRank).toBeNull();
    expect(snap.workers).toHaveLength(2);
  });

  it('selfRank is null when the excluded session is not among the live rows (fail-open, not a crash)', async () => {
    const rows = [liveRow('a', 'haiku', 'low')];
    const sb = makeSb(rows);
    const snap = await liveWorkerCapabilitySnapshot(sb, { excludeSessionId: 'nonexistent', nowMs: NOW });
    expect(snap.selfRank).toBeNull();
    expect(snap.workers).toHaveLength(1);
  });
});
