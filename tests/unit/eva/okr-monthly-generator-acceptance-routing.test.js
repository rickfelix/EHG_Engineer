/**
 * Unit tests for the acceptance-state routing in lib/eva/jobs/okr-monthly-generator.js
 * SD-LEO-INFRA-REVIVE-EVA-ACCEPTANCE-STATE-001
 *
 * Drives runOkrMonthlyGeneration with a fake supabase (one low-score vision
 * dimension → 1 objective + 1 KR) and asserts the OKR_REQUIRE_ACCEPTANCE
 * routing: pending (is_active:false + log pending_chairman_acceptance) when on,
 * prior behavior (is_active:true + completed) when off, and the widened
 * existing-generation skip-check.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runOkrMonthlyGeneration } from '../../../lib/eva/jobs/okr-monthly-generator.js';

const silent = { log() {}, warn() {} };

// Comprehensive chainable fake supabase. `cfg[table]` may set:
//   selectRows | selectFn(filters)  → rows for select chains
//   returnRow                       → row returned by .insert/.upsert + .select().single()
// Writes are recorded on `calls` { inserts, upserts, updates }.
function makeFake(cfg) {
  const calls = { inserts: [], upserts: [], updates: [] };
  function builder(table) {
    const st = { table, op: 'select', payload: null, filters: {} };
    const api = {
      select() { st.selectAfter = true; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      upsert(p, opts) { st.op = 'upsert'; st.payload = p; st.opts = opts; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      eq(c, v) { st.filters[c] = { op: 'eq', val: v }; return api; },
      in(c, v) { st.filters[c] = { op: 'in', vals: v }; return api; },
      gte(c, v) { st.filters[c] = { op: 'gte', val: v }; return api; },
      order() { return api; },
      limit() { return api; },
      single() { return resolve(true); },
      maybeSingle() { return resolve(true); },
      then(onF, onR) { return resolve(false).then(onF, onR); },
    };
    function resolve(single) {
      const t = cfg[table] || {};
      if (st.op === 'insert' || st.op === 'upsert') {
        (st.op === 'insert' ? calls.inserts : calls.upserts).push({ table, payload: st.payload, filters: st.filters });
        return Promise.resolve({ data: single ? (t.returnRow ?? null) : (t.returnRow ? [t.returnRow] : []), error: t.error || null });
      }
      if (st.op === 'update') {
        calls.updates.push({ table, payload: st.payload, filters: st.filters });
        return Promise.resolve({ data: single ? null : [], error: t.error || null });
      }
      const rows = typeof t.selectFn === 'function' ? t.selectFn(st.filters) : (t.selectRows || []);
      return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: t.error || null });
    }
    return api;
  }
  return { client: { from: (table) => builder(table) }, calls };
}

// Base config: no existing generation, one active vision, one low-score dimension
// (score 50 < 70 → 1 top-down candidate), empty bottom-up sources.
function baseCfg(existingGeneration = []) {
  return {
    okr_generation_log: { selectRows: existingGeneration, returnRow: { id: 'gen-1' } },
    strategic_vision: { selectRows: [{ id: 'v1', code: 'VISION', title: 'Test Vision' }] },
    eva_vision_scores: { selectRows: [{ dimension_scores: { V01: { name: 'Quality', score: 50 } } }] },
    eva_vision_gaps: { selectRows: [] },
    retrospectives: { selectRows: [] },
    issue_patterns: { selectRows: [] },
    objectives: { returnRow: { id: 'obj-1' } },
    key_results: { returnRow: { id: 'kr-1' } },
  };
}

const ORIG = process.env.OKR_REQUIRE_ACCEPTANCE;
beforeEach(() => { delete process.env.OKR_REQUIRE_ACCEPTANCE; });
afterEach(() => { if (ORIG === undefined) delete process.env.OKR_REQUIRE_ACCEPTANCE; else process.env.OKR_REQUIRE_ACCEPTANCE = ORIG; });

describe('okr-monthly-generator acceptance routing', () => {
  it('default (flag unset) routes to pending: is_active:false + log pending_chairman_acceptance', async () => {
    const { client, calls } = makeFake(baseCfg());
    const res = await runOkrMonthlyGeneration({ supabase: client, logger: silent });
    expect(res.skipped).toBeUndefined();
    const obj = calls.upserts.find((u) => u.table === 'objectives');
    const kr = calls.upserts.find((u) => u.table === 'key_results');
    expect(obj.payload.is_active).toBe(false);
    expect(kr.payload.is_active).toBe(false);
    const logUpd = calls.updates.find((u) => u.table === 'okr_generation_log');
    expect(logUpd.payload.status).toBe('pending_chairman_acceptance');
  });

  it('OKR_REQUIRE_ACCEPTANCE=false preserves prior behavior: is_active:true + completed', async () => {
    process.env.OKR_REQUIRE_ACCEPTANCE = 'false';
    const { client, calls } = makeFake(baseCfg());
    await runOkrMonthlyGeneration({ supabase: client, logger: silent });
    expect(calls.upserts.find((u) => u.table === 'objectives').payload.is_active).toBe(true);
    expect(calls.upserts.find((u) => u.table === 'key_results').payload.is_active).toBe(true);
    expect(calls.updates.find((u) => u.table === 'okr_generation_log').payload.status).toBe('completed');
  });

  it('widened skip-check: a pending_chairman_acceptance row for the period is treated as already-generated', async () => {
    // The select returns an existing row regardless of the status filter → generator must skip.
    const { client, calls } = makeFake(baseCfg([{ id: 'existing-pending' }]));
    const res = await runOkrMonthlyGeneration({ supabase: client, logger: silent });
    expect(res.skipped).toBe(true);
    expect(res.generationId).toBe('existing-pending');
    expect(calls.upserts.length).toBe(0); // no generation happened
  });
});
