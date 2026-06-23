// SD-LEO-INFRA-FLEET-CRITICAL-CLAIM-PATH-001 — fleet_critical must propagate to the WORKER
// self-claim ordering. #5063 ranked fleet_critical SDs correctly coordinator-side (the WRITER), but
// the worker merge-pool ordering (sortByDispatchRank → orderByFleetCriticalThenRank) only honored
// metadata.dispatch_rank (and only while fresh, <1h TTL). A fleet_critical SD whose dispatch_rank was
// stale/absent stayed buried under lower-ranked REFILLs across idle-worker cycles (witnessed:
// EXTERNAL-REVIVAL rank-1 fleet_critical draft skipped for REFILLs by win-11808/win-13452).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { orderByFleetCriticalThenRank } = require('../../scripts/worker-checkin.cjs');

const key = (x) => x.key;
const keys = (arr) => arr.map((x) => x.key);
const items = (...ks) => ks.map((k) => ({ key: k }));

describe('orderByFleetCriticalThenRank (SD-LEO-INFRA-FLEET-CRITICAL-CLAIM-PATH-001)', () => {
  it('lifts a fleet_critical SD to the FRONT even with NO dispatch_rank (stale-proof)', () => {
    const pool = items('SD-REFILL-A', 'SD-REFILL-B', 'SD-FLEET-CRIT');
    const ordered = orderByFleetCriticalThenRank(pool, key, new Map(), new Set(['SD-FLEET-CRIT']));
    expect(keys(ordered)[0]).toBe('SD-FLEET-CRIT');
  });

  it('keeps fleet_critical first even when a REFILL has a fresher (lower) dispatch_rank', () => {
    const pool = items('SD-REFILL-A', 'SD-FLEET-CRIT');
    const rankMap = new Map([['SD-REFILL-A', 0], ['SD-FLEET-CRIT', 5]]); // REFILL outranks on dispatch_rank
    const ordered = orderByFleetCriticalThenRank(pool, key, rankMap, new Set(['SD-FLEET-CRIT']));
    expect(keys(ordered)[0]).toBe('SD-FLEET-CRIT'); // fleet_critical is stale-proof top priority
  });

  it('orders MULTIPLE fleet_critical SDs among themselves by dispatch_rank', () => {
    const pool = items('SD-FC-HI', 'SD-REFILL', 'SD-FC-LO');
    const rankMap = new Map([['SD-FC-HI', 9], ['SD-FC-LO', 1]]);
    const ordered = orderByFleetCriticalThenRank(pool, key, rankMap, new Set(['SD-FC-HI', 'SD-FC-LO']));
    expect(keys(ordered).slice(0, 2)).toEqual(['SD-FC-LO', 'SD-FC-HI']); // both first; lower rank wins
    expect(keys(ordered)[2]).toBe('SD-REFILL');
  });

  it('falls back to pure dispatch_rank ordering when nothing is fleet_critical', () => {
    const pool = items('SD-A', 'SD-B', 'SD-C');
    const rankMap = new Map([['SD-C', 0], ['SD-A', 1], ['SD-B', 2]]);
    const ordered = orderByFleetCriticalThenRank(pool, key, rankMap, new Set());
    expect(keys(ordered)).toEqual(['SD-C', 'SD-A', 'SD-B']);
  });

  it('is a no-op (preserves input order) when there is no signal at all', () => {
    const pool = items('SD-A', 'SD-B', 'SD-C');
    const ordered = orderByFleetCriticalThenRank(pool, key, new Map(), new Set());
    expect(keys(ordered)).toEqual(['SD-A', 'SD-B', 'SD-C']); // baselined-first precedence preserved
  });

  it('is stable for fleet_critical ties without a rank (input order preserved)', () => {
    const pool = items('SD-FC-1', 'SD-REFILL', 'SD-FC-2');
    const ordered = orderByFleetCriticalThenRank(pool, key, new Map(), new Set(['SD-FC-1', 'SD-FC-2']));
    expect(keys(ordered)).toEqual(['SD-FC-1', 'SD-FC-2', 'SD-REFILL']); // both first, original order; REFILL last
  });

  it('is total / fail-safe on odd args (non-Map rankMap, non-Set set)', () => {
    const pool = items('SD-A', 'SD-B');
    expect(keys(orderByFleetCriticalThenRank(pool, key, null, null))).toEqual(['SD-A', 'SD-B']);
    expect(keys(orderByFleetCriticalThenRank(pool, key, undefined, ['SD-B']))).toEqual(['SD-A', 'SD-B']); // array (not Set) ignored
  });
});
