/**
 * SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001 (FR-4) — orphaned-provisioning reaper.
 *
 * Pure unit coverage of the reaper logic against a mock supabase: it deletes a cancelled/killed
 * venture's venture_provisioning_state row, terminalizes the venture's non-terminal orchestrator SD
 * tree via the cancellation_reason COLUMN, honors dryRun (report-only), and is idempotent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reapOrphanedProvisioning } from '../../../lib/eva/bridge/reap-orphaned-provisioning.js';

// Chainable mock: SELECTs resolve from `cfg`; DELETE/UPDATE are recorded in `mutations`.
function makeSb(cfg) {
  const mutations = [];
  const sb = {
    mutations,
    from(table) {
      const ctx = { table, op: 'select', filters: {}, notIn: null, inVals: null, payload: null };
      const builder = {
        select() { ctx.op = 'select'; return builder; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; return builder; },
        delete() { ctx.op = 'delete'; return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        in(col, vals) { ctx.inVals = { col, vals }; return builder; },
        not(col, _op, vals) { ctx.notIn = { col, vals }; return builder; },
        order() { return builder; },
        range() { return builder; }, // fetchAllPaginated (FR-6) paginates the ventures read

        then(resolve) {
          if (ctx.op === 'select') return resolve({ data: cfg.resolve(ctx), error: null });
          mutations.push({ table: ctx.table, op: ctx.op, filters: ctx.filters, payload: ctx.payload });
          return resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return sb;
}

const silent = () => {};

const DEAD_VENTURE = { id: 'v-dead-1', name: 'MarketLens', status: 'cancelled' };
const LIVE_VENTURE = { id: 'v-live-1', name: 'Acme', status: 'active' };

function baseCfg({ provisioningRows = [], orphanSds = [] } = {}) {
  return {
    resolve(ctx) {
      if (ctx.table === 'ventures') return [DEAD_VENTURE]; // .in('status', [cancelled,killed])
      if (ctx.table === 'venture_provisioning_state') return provisioningRows;
      if (ctx.table === 'strategic_directives_v2') return orphanSds;
      return [];
    },
  };
}

describe('reapOrphanedProvisioning', () => {
  it('dryRun (default) reports counts WITHOUT mutating', async () => {
    const sb = makeSb(baseCfg({
      provisioningRows: [{ venture_id: 'v-dead-1', venture_name: 'MarketLens' }],
      orphanSds: [{ id: 'sd-1', sd_key: 'SD-X-ORCH', status: 'in_progress' }],
    }));
    const r = await reapOrphanedProvisioning({ supabase: sb, log: silent }); // dryRun defaults true
    expect(r.dryRun).toBe(true);
    expect(r.rowsReaped).toBe(1);
    expect(r.sdsTerminalized).toBe(1);
    expect(r.treesTerminalized).toBe(1);
    expect(sb.mutations).toHaveLength(0); // NOTHING mutated on dry-run
  });

  it('apply: deletes the stale provisioning row + cancels the orphaned tree via cancellation_reason COLUMN', async () => {
    const sb = makeSb(baseCfg({
      provisioningRows: [{ venture_id: 'v-dead-1', venture_name: 'MarketLens' }],
      orphanSds: [
        { id: 'sd-1', sd_key: 'SD-X-ORCH', status: 'in_progress' },
        { id: 'sd-2', sd_key: 'SD-X-CHILD', status: 'draft' },
      ],
    }));
    const r = await reapOrphanedProvisioning({ supabase: sb, dryRun: false, log: silent });
    expect(r.rowsReaped).toBe(1);
    expect(r.sdsTerminalized).toBe(2);
    expect(r.treesTerminalized).toBe(1);

    const del = sb.mutations.find((m) => m.table === 'venture_provisioning_state' && m.op === 'delete');
    expect(del).toBeTruthy();
    expect(del.filters.venture_id).toBe('v-dead-1');

    const cancels = sb.mutations.filter((m) => m.table === 'strategic_directives_v2' && m.op === 'update');
    expect(cancels).toHaveLength(2);
    for (const c of cancels) {
      expect(c.payload.status).toBe('cancelled');
      // cancellation_reason is a COLUMN (not metadata) — harness_backlog 3b5d63a4
      expect(typeof c.payload.cancellation_reason).toBe('string');
      expect(c.payload.cancellation_reason).toMatch(/cancelled\/killed venture/);
      expect(c.payload.metadata).toBeUndefined();
    }
  });

  it('idempotent: no stale rows + no non-terminal SDs -> zero mutations', async () => {
    const sb = makeSb(baseCfg({ provisioningRows: [], orphanSds: [] }));
    const r = await reapOrphanedProvisioning({ supabase: sb, dryRun: false, log: silent });
    expect(r.rowsReaped).toBe(0);
    expect(r.sdsTerminalized).toBe(0);
    expect(sb.mutations).toHaveLength(0);
  });

  it('no cancelled/killed ventures -> early return, nothing read/mutated', async () => {
    const sb = makeSb({ resolve: (ctx) => (ctx.table === 'ventures' ? [] : []) });
    const r = await reapOrphanedProvisioning({ supabase: sb, dryRun: false, log: silent });
    expect(r.ventures).toBe(0);
    expect(r.rowsReaped).toBe(0);
    expect(sb.mutations).toHaveLength(0);
  });

  it('missing supabase -> safe no-op with error', async () => {
    const r = await reapOrphanedProvisioning({ supabase: null, log: silent });
    expect(r.rowsReaped).toBe(0);
    expect(r.errors).toContain('no_supabase');
  });
});
