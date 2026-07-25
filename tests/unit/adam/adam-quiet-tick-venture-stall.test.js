/**
 * QF-20260710-056: adam-quiet-tick was blind to a venture stuck mid-traversal —
 * only the Adam-PM-board (task_ledger) watch existed. checkVentureTraversalStalls()
 * closes that gap by checking ventures.orchestrator_state/workflow_status directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { checkVentureTraversalStalls, readVenturePark } from '../../../scripts/adam-quiet-tick.mjs';

function readBuilder(data) {
  const b = {
    select: () => b, eq: () => b, or: () => b, lt: () => b, gte: () => b, limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return b;
}

/** Filter-applying ventures builder — proves the query itself excludes non-active/non-blocked rows,
 *  not just that the caller happens to pre-filter its fixture (QF-20260710-056 noise-scope fix). */
function ventureBuilder(rows) {
  const filters = [];
  const b = {
    select: () => b,
    eq: (col, val) => { filters.push((r) => r[col] === val); return b; },
    lt: (col, val) => { filters.push((r) => r[col] < val); return b; },
    is: (col, val) => { filters.push((r) => r[col] == val); return b; }, // val is always null here (IS NULL)
    order: () => b, // FR-6 batch 9: fetchAllPaginated's stable-order tiebreaker
    // FR-6 batch 9: fetchAllPaginated calls .range() (not a bare await) to page — resolve the
    // same filtered { data, error } the prior direct-await produced, single (short) page.
    range: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
    then: (resolve, reject) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
  };
  return b;
}

function makeSupabase({ ventures = [], staleStageExecutions = new Set() } = {}) {
  return {
    from(table) {
      if (table === 'ventures') return ventureBuilder(ventures);
      if (table === 'stage_executions') {
        // Return a fresh row only for venture IDs NOT in staleStageExecutions —
        // i.e. actively-executing ventures have a recent stage_executions row.
        let lastVentureId = null;
        const b = {
          select: () => b,
          eq: (col, val) => { if (col === 'venture_id') lastVentureId = val; return b; },
          gte: () => b,
          limit: () => b,
          then: (resolve, reject) => {
            const data = staleStageExecutions.has(lastVentureId) ? [] : [{ id: 'se-1' }];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return b;
      }
      return readBuilder([]);
    },
  };
}

describe('checkVentureTraversalStalls', () => {
  it('flags a status=active/orchestrator_state=blocked venture with no fresh stage_executions row, first-seen (not escalated)', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v1', name: 'North Star', status: 'active', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: false, deleted_at: null }],
      staleStageExecutions: new Set(['v1']),
    });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(1);
    expect(result.alerted[0]).toMatchObject({ id: 'v1', escalated: false });
    expect(result.snapshot.v1).toBeTruthy();
  });

  it('escalates a venture already present in the prior snapshot', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v1', name: 'North Star', status: 'active', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: false, deleted_at: null }],
      staleStageExecutions: new Set(['v1']),
    });
    const result = await checkVentureTraversalStalls(sb, { v1: Date.now() - 60_000 });
    expect(result.alerted[0].escalated).toBe(true);
  });

  it('does NOT flag a venture with a fresh stage_executions row (actively executing, not stalled)', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v2', name: 'Active Venture', status: 'active', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: false, deleted_at: null }],
      staleStageExecutions: new Set(), // v2 has a fresh row
    });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(0);
  });

  it('does NOT flag a status=cancelled venture even if orchestrator_state is stuck at blocked (dead/archived venture noise — QF-20260710-056 live-verified regression)', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v3', name: '__e2e_dead_fixture__', status: 'cancelled', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: false, deleted_at: null }],
      staleStageExecutions: new Set(['v3']),
    });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(0);
  });

  // QF-20260719-490: 5 of 7 live QUIET_TICK_VENTURE_STALL_ALERT lines were TEST-HARNESS-S20/__e2e__
  // fixture ventures with is_demo=true, burying the 2 real blocked ventures (Alt-Text, ApexNiche).
  it('does NOT flag an is_demo=true venture even if status/orchestrator_state/updated_at otherwise match (e2e fixture noise)', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v4', name: 'TEST-HARNESS-S20-SD-A-e2e-idempotent-1783815086786', status: 'active', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: true, deleted_at: null }],
      staleStageExecutions: new Set(['v4']),
    });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(0);
  });

  it('does NOT flag a soft-deleted (deleted_at set) venture', async () => {
    const sb = makeSupabase({
      ventures: [{ id: 'v5', name: 'Deleted Venture', status: 'active', orchestrator_state: 'blocked', updated_at: '2020-01-01', is_demo: false, deleted_at: '2026-01-01T00:00:00Z' }],
      staleStageExecutions: new Set(['v5']),
    });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(0);
  });

  // --- QF-20260725-638: deliberate-not-work exclusion ---
  const parked = (over = {}) => ({
    id: 'vp', name: 'Image Alt Text Generator', status: 'active', orchestrator_state: 'blocked',
    updated_at: '2020-01-01', is_demo: false, deleted_at: null,
    metadata: {
      gating_decision: {
        decision: 'PARKED - deliberately deferred behind first-revenue work',
        by: 'adam (chairman-delegated venture ops)',
        at: '2026-07-25T16:15:51.055Z',
        unpark_trigger: 'first-revenue venture ships',
      },
    },
    ...over,
  });

  it('QF-638: does NOT flag a venture carrying a recorded gating decision (deliberate park, not a stall)', async () => {
    const sb = makeSupabase({ ventures: [parked()], staleStageExecutions: new Set(['vp']) });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await checkVentureTraversalStalls(sb, {});
    log.mockRestore();
    expect(result.alerted).toHaveLength(0);
    expect(result.realBuildStalled).toHaveLength(0);
  });

  it('QF-638: suppression is PERMANENT, not a one-tick false-clear — an ancient updated_at still does not alarm', async () => {
    // The pre-fix remedy only worked because writing metadata bumped updated_at inside the
    // 15-min window; once the row aged out it alarmed again. Here updated_at is years old
    // (well outside the window), so a still-silent alarm proves the exclusion is state-based.
    const sb = makeSupabase({ ventures: [parked({ updated_at: '2019-01-01' })], staleStageExecutions: new Set(['vp']) });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await checkVentureTraversalStalls(sb, { vp: Date.now() - 3_600_000 });
    log.mockRestore();
    expect(result.alerted).toHaveLength(0);
    expect(result.snapshot.vp).toBeUndefined(); // cleared, so an unpark restarts the two-strike clock
  });

  it('QF-638: suppression is AUDITABLE — logs who parked it, why, and the unpark trigger', async () => {
    const sb = makeSupabase({ ventures: [parked()], staleStageExecutions: new Set(['vp']) });
    const lines = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => lines.push(a.join(' ')));
    await checkVentureTraversalStalls(sb, {});
    log.mockRestore();
    const line = lines.find((l) => l.includes('QUIET_TICK_VENTURE_PARK_SUPPRESSED'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/by="adam \(chairman-delegated venture ops\)"/);
    expect(line).toMatch(/unpark="first-revenue venture ships"/);
    expect(line).toMatch(/at=2026-07-25T16:15:51\.055Z/);
  });

  it('QF-638: an UNPARKED venture (no gating decision) still alarms — exclusion is not blanket', async () => {
    const v = parked(); delete v.metadata;
    const sb = makeSupabase({ ventures: [v], staleStageExecutions: new Set(['vp']) });
    const result = await checkVentureTraversalStalls(sb, {});
    expect(result.alerted).toHaveLength(1);
  });

  it('QF-638: readVenturePark defaults missing audit fields rather than throwing or reporting them as real', () => {
    expect(readVenturePark({})).toBeNull();
    expect(readVenturePark({ metadata: {} })).toBeNull();
    const p = readVenturePark({ metadata: { gating_decision: { decision: 'PARKED' } } });
    expect(p).toMatchObject({ decision: 'PARKED', by: '(unknown)', unpark: '(no unpark trigger recorded)' });
  });

  it('is fail-soft: a throwing/malformed client returns empty alerts and the prior snapshot, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const prior = { v9: 123 };
    await expect(checkVentureTraversalStalls(sb, prior)).resolves.toMatchObject({ alerted: [], snapshot: prior });
  });
});
