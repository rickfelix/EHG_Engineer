/**
 * QF-20260710-056: adam-quiet-tick was blind to a venture stuck mid-traversal —
 * only the Adam-PM-board (task_ledger) watch existed. checkVentureTraversalStalls()
 * closes that gap by checking ventures.orchestrator_state/workflow_status directly.
 */
import { describe, it, expect } from 'vitest';
import { checkVentureTraversalStalls } from '../../../scripts/adam-quiet-tick.mjs';

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

  it('is fail-soft: a throwing/malformed client returns empty alerts and the prior snapshot, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const prior = { v9: 123 };
    await expect(checkVentureTraversalStalls(sb, prior)).resolves.toMatchObject({ alerted: [], snapshot: prior });
  });
});
