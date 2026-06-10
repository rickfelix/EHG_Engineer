/**
 * Unit tests for lib/eva/jobs/okr-accept-generation.js
 * SD-LEO-INFRA-REVIVE-EVA-ACCEPTANCE-STATE-001
 *
 * Pure DI — a fake supabase captures the writes; no live DB.
 */
import { describe, it, expect } from 'vitest';
import { acceptPendingOkrGeneration, listPendingOkrGenerations } from '../../../lib/eva/jobs/okr-accept-generation.js';

const silent = { log() {}, warn() {} };

/**
 * Minimal chainable fake supabase. `tables` maps table name -> {
 *   rows: [...] (returned by select chains),
 *   onUpdate(payload, filters) -> rows the .select() after update returns
 * }. Captured writes are recorded on `calls`.
 */
function makeFake(config) {
  const calls = { updates: [], selects: [] };
  function builder(table) {
    const state = { table, op: 'select', payload: null, filters: {} };
    const api = {
      select() { state.selectAfter = true; return api; },
      update(payload) { state.op = 'update'; state.payload = payload; return api; },
      eq(col, val) { state.filters[col] = { op: 'eq', val }; return api; },
      in(col, vals) { state.filters[col] = { op: 'in', vals }; return api; },
      order() { return api; },
      limit() { return api; },
      single() { return resolve(true); },
      maybeSingle() { return resolve(true); },
      then(onF, onR) { return resolve(false).then(onF, onR); },
    };
    function resolve(single) {
      const t = config[table] || {};
      if (state.op === 'update') {
        calls.updates.push({ table, payload: state.payload, filters: state.filters });
        const rows = t.onUpdate ? t.onUpdate(state.payload, state.filters) : (t.rows || []);
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: t.error || null });
      }
      calls.selects.push({ table, filters: state.filters });
      const rows = typeof t.select === 'function' ? t.select(state.filters) : (t.rows || []);
      return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: t.error || null });
    }
    return api;
  }
  return { client: { from: (table) => builder(table) }, calls };
}

describe('acceptPendingOkrGeneration', () => {
  it('flips a pending generation: objectives + their key_results live + log completed', async () => {
    const { client, calls } = makeFake({
      okr_generation_log: { rows: [{ id: 'gen-1', status: 'pending_chairman_acceptance', period: '2026-06' }] },
      objectives: { rows: [{ id: 'obj-1' }, { id: 'obj-2' }] },
      key_results: { onUpdate: () => [{ id: 'kr-1' }, { id: 'kr-2' }, { id: 'kr-3' }] },
    });
    const r = await acceptPendingOkrGeneration({ supabase: client, generationId: 'gen-1', logger: silent });
    expect(r.accepted).toBe(true);
    expect(r.objectives).toBe(2);
    expect(r.keyResults).toBe(3);
    // objectives flipped by generation_id; key_results by parent objective ids; log completed by id
    const objUpd = calls.updates.find((u) => u.table === 'objectives');
    expect(objUpd.payload.is_active).toBe(true);
    expect(objUpd.filters.generation_id).toEqual({ op: 'eq', val: 'gen-1' });
    const krUpd = calls.updates.find((u) => u.table === 'key_results');
    expect(krUpd.payload.is_active).toBe(true);
    expect(krUpd.filters.objective_id).toEqual({ op: 'in', vals: ['obj-1', 'obj-2'] });
    const logUpd = calls.updates.find((u) => u.table === 'okr_generation_log');
    expect(logUpd.payload.status).toBe('completed');
    expect(logUpd.filters.id).toEqual({ op: 'eq', val: 'gen-1' });
  });

  it('is idempotent: an already-completed generation is a no-op', async () => {
    const { client, calls } = makeFake({
      okr_generation_log: { rows: [{ id: 'gen-1', status: 'completed', period: '2026-06' }] },
    });
    const r = await acceptPendingOkrGeneration({ supabase: client, generationId: 'gen-1', logger: silent });
    expect(r.accepted).toBe(false);
    expect(r.alreadyAccepted).toBe(true);
    expect(calls.updates.length).toBe(0); // no writes on a no-op
  });

  it('skips the key_results update when a generation has no objectives', async () => {
    const { client, calls } = makeFake({
      okr_generation_log: { rows: [{ id: 'gen-x', status: 'pending_chairman_acceptance', period: '2026-07' }] },
      objectives: { rows: [] },
    });
    const r = await acceptPendingOkrGeneration({ supabase: client, generationId: 'gen-x', logger: silent });
    expect(r.accepted).toBe(true);
    expect(r.keyResults).toBe(0);
    expect(calls.updates.find((u) => u.table === 'key_results')).toBeUndefined();
  });

  it('throws fail-loud when the generation is not found', async () => {
    const { client } = makeFake({ okr_generation_log: { rows: [] } });
    await expect(acceptPendingOkrGeneration({ supabase: client, generationId: 'nope', logger: silent }))
      .rejects.toThrow(/not found/);
  });

  it('requires supabase and generationId', async () => {
    await expect(acceptPendingOkrGeneration({ generationId: 'x' })).rejects.toThrow(/supabase/);
    await expect(acceptPendingOkrGeneration({ supabase: {} })).rejects.toThrow(/generationId/);
  });
});

describe('listPendingOkrGenerations', () => {
  it('returns only pending_chairman_acceptance rows', async () => {
    const { client, calls } = makeFake({
      okr_generation_log: { rows: [{ id: 'g1', period: '2026-06', generation_date: '2026-06-01', total_krs_generated: 5 }] },
    });
    const rows = await listPendingOkrGenerations({ supabase: client });
    expect(rows).toHaveLength(1);
    expect(calls.selects[0].filters.status).toEqual({ op: 'eq', val: 'pending_chairman_acceptance' });
  });
});
