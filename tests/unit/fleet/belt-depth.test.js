/**
 * QF-20260725-089 — belt-depth gauge must exclude HELD rows before emitting a count.
 *
 * Measured live 2026-07-25: the gauge reported depth 8 while true claimable depth was 0 (7x
 * human_action_required plus an orchestrator parent / deferred / fenced / test-fixture row). That
 * one ungated number fired IDLE_WITH_BACKLOG against the coordinator AND scored Adam D1 5/5 for a
 * full belt — wrong in opposite directions off the same read.
 *
 * Seam-injected fake client only — no live DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { countDispatchableBacklog } = require('../../../lib/fleet/belt-depth.cjs');

/**
 * Minimal builder covering exactly the chain the gauge uses, including .range() pagination.
 * QF-20260725-879: `.or()` added — the dependency gate resolves refs with a single
 * `.select(...).or(sd_key.in.(...),id.in.(...))`. depRows is what that lookup returns; it is
 * only ever reached for rows that actually carry dependency refs.
 */
function fakeClient(rows, depRows = []) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
          }),
        }),
        or: () => Promise.resolve({ data: depRows, error: null }),
      }),
    }),
  };
}

const free = (i) => ({ id: `f${i}`, sd_key: `SD-FREE-${i}`, status: 'draft', metadata: {} });

describe('countDispatchableBacklog', () => {
  it('REGRESSION: a fully human-action-held belt reads 0, not the raw row count', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `${i}`, sd_key: `SD-HELD-${i}`, status: 'draft', metadata: { requires_human_action: true },
    }));
    const result = await countDispatchableBacklog(fakeClient(rows));
    expect(result.dispatchable).toBe(0);
    expect(result.raw).toBe(7); // the number the old gauge emitted as "dispatchable"
    expect(result.ineligible.human_action_required).toBe(7);
  });

  it('excludes orchestrator parents and test fixtures — never worker-claimable by charter', async () => {
    const rows = [
      { id: '1', sd_key: 'SD-PARENT', status: 'draft', sd_type: 'orchestrator', metadata: {} },
      { id: '2', sd_key: 'SD-TEST-FIXTURE-001', status: 'draft', metadata: {} },
      free(3),
    ];
    const result = await countDispatchableBacklog(fakeClient(rows));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible.orchestrator_parent).toBe(1);
  });

  it('counts genuinely claimable rows', async () => {
    const result = await countDispatchableBacklog(fakeClient([free(1), free(2), free(3)]));
    expect(result).toMatchObject({ dispatchable: 3, raw: 3 });
    expect(result.ineligible).toEqual({});
  });

  it('reports an empty belt as 0 without inventing depth', async () => {
    expect(await countDispatchableBacklog(fakeClient([]))).toMatchObject({ dispatchable: 0, raw: 0 });
  });

  it('REGRESSION QF-20260725-879: a dep-blocked draft is NOT counted as dispatchable', async () => {
    // The exact live shape: one unclaimed draft whose dependencies are incomplete. The sync
    // classifier is DB-blind and passes it, so the gauge used to emit dispatchable=1 while the
    // dispatcher and the sweep both said dep_blocked — recomputed=1 vs self_reported=0,
    // integrity_ok=false, falsely indicting the coordinator.
    const rows = [{ id: 'd1', sd_key: 'SD-DEP-BLOCKED', status: 'draft', metadata: {}, dependencies: ['SD-BLOCKER'] }];
    const depRows = [{ id: 'b1', sd_key: 'SD-BLOCKER', status: 'in_progress' }]; // NOT completed
    const result = await countDispatchableBacklog(fakeClient(rows, depRows));
    expect(result.dispatchable).toBe(0);
    expect(result.raw).toBe(1);
    expect(result.ineligible.dep_blocked).toBe(1);
  });

  it('counts a draft whose dependencies are all completed', async () => {
    const rows = [{ id: 'd1', sd_key: 'SD-DEP-OK', status: 'draft', metadata: {}, dependencies: ['SD-BLOCKER'] }];
    const depRows = [{ id: 'b1', sd_key: 'SD-BLOCKER', status: 'completed' }];
    const result = await countDispatchableBacklog(fakeClient(rows, depRows));
    expect(result.dispatchable).toBe(1);
    expect(result.ineligible).toEqual({});
  });

  it('does not query the dep gate at all for dependency-free rows (cost guard)', async () => {
    // Keeps the gauge cheap: the dep lookup must short-circuit before any query when a row
    // carries no refs. A client whose .or() throws proves the path is never taken.
    const exploding = fakeClient([free(1), free(2)]);
    exploding.from = () => ({
      select: () => ({
        eq: () => ({ is: () => ({ range: (f, t) => Promise.resolve({ data: [free(1), free(2)].slice(f, t + 1), error: null }) }) }),
        or: () => { throw new Error('dep query must not run for dependency-free rows'); },
      }),
    });
    await expect(countDispatchableBacklog(exploding)).resolves.toMatchObject({ dispatchable: 2 });
  });

  it('paginates past the PostgREST cap instead of under-reporting depth', async () => {
    // 1200 eligible rows: a single capped page would have reported 1000.
    const rows = Array.from({ length: 1200 }, (_, i) => free(i));
    const result = await countDispatchableBacklog(fakeClient(rows));
    expect(result.dispatchable).toBe(1200);
  });
});
