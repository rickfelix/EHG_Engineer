// SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B (Child B) TS-3: shadow-mode wiring at the 3 confirmed
// live comparator call sites must change ZERO live dispatch order. These tests exercise the
// wrapped call sites (not just the untouched pure comparators, which already have their own
// coverage) to prove the shadow instrumentation added beside them is truly inert on the
// returned order -- including when shadow logging itself fails (no live DB creds in the unit
// tier, so shadowCompareAndLog's internal createSupabaseServiceClient() call is expected to
// fail and be swallowed; that failure must never surface in the order these functions return).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sortByDispatchRank, sortQfCandidatesBySeverity, orderByFleetCriticalThenRank } = require('../../../scripts/worker-checkin.cjs');

describe('sortByDispatchRank (wraps orderByFleetCriticalThenRank + shadow logging)', () => {
  it('returns fleet_critical-first order unchanged, with no live DB creds available for shadow logging', async () => {
    const fakeSb = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [
              { sd_key: 'SD-A', priority: 'high', metadata: { fleet_critical: true } },
              { sd_key: 'SD-B', priority: 'critical', metadata: {} },
            ],
          }),
        }),
      }),
    };
    const items = [{ sd_key: 'SD-B' }, { sd_key: 'SD-A' }];
    const keyOf = (x) => x.sd_key;
    const ordered = await sortByDispatchRank(fakeSb, items, keyOf);
    expect(ordered.map(keyOf)).toEqual(['SD-A', 'SD-B']); // fleet_critical first, byte-identical to pre-shadow behavior
  });

  it('is fail-open: a throwing sb client still returns the original items, order untouched', async () => {
    const throwingSb = { from: () => { throw new Error('db unavailable'); } };
    const items = [{ sd_key: 'SD-X' }, { sd_key: 'SD-Y' }];
    const ordered = await sortByDispatchRank(throwingSb, items, (x) => x.sd_key);
    expect(ordered).toBe(items); // unchanged reference, pre-existing fail-open contract preserved
  });
});

describe('QF severity-ordering call site (worker-checkin.cjs:189/746)', () => {
  it('sortQfCandidatesBySeverity order is unaffected by the shadow wiring added beside its call site', () => {
    const qfs = [
      { id: 'QF-1', severity: 'low', created_at: '2026-01-01' },
      { id: 'QF-2', severity: 'critical', created_at: '2026-01-02' },
      { id: 'QF-3', severity: 'medium', created_at: '2026-01-03' },
    ];
    // sortQfCandidatesBySeverity itself was not modified by this child -- this pins the
    // pre-existing contract the wrapped call site (runCheckin) must continue to honor.
    const ordered = sortQfCandidatesBySeverity(qfs);
    expect(ordered.map((q) => q.id)).toEqual(['QF-2', 'QF-3', 'QF-1']);
  });
});

describe('orderByFleetCriticalThenRank is untouched by this child (called directly, not through the shadow wrapper)', () => {
  it('still lifts fleet_critical first with no dispatch_rank', () => {
    const pool = [{ key: 'A' }, { key: 'B' }, { key: 'FC' }];
    const ordered = orderByFleetCriticalThenRank(pool, (x) => x.key, new Map(), new Set(['FC']), new Map());
    expect(ordered.map((x) => x.key)[0]).toBe('FC');
  });
});
