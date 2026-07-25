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

/** Minimal builder covering exactly the chain the gauge uses, including .range() pagination. */
function fakeClient(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
          }),
        }),
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

  it('paginates past the PostgREST cap instead of under-reporting depth', async () => {
    // 1200 eligible rows: a single capped page would have reported 1000.
    const rows = Array.from({ length: 1200 }, (_, i) => free(i));
    const result = await countDispatchableBacklog(fakeClient(rows));
    expect(result.dispatchable).toBe(1200);
  });
});
