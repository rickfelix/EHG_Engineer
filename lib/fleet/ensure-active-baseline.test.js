/**
 * Unit tests — SD-FDBK-INFRA-AUTO-MAINTAIN-EXECUTION-001
 * ensureActiveBaseline: auto-create an active execution baseline when none exists so worker
 * self-claim never silently idles. Network-free: a self-contained fake supabase client +
 * dependency injection (the helper takes `sb` as an arg) make every path deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mod from './ensure-active-baseline.cjs';

const { ensureActiveBaseline } = mod;

// Fake supabase modelling exactly the chains the helper uses.
function makeFake(cfg = {}) {
  const calls = { baselineInserts: [], itemInserts: [], deletes: [], actualInserts: [] };
  let baselineInserted = false;
  function terminal(st) {
    if (cfg.throwOnBaselineSelect && st.table === 'sd_execution_baselines' && st.op === 'select') {
      throw new Error('connection lost');
    }
    if (st.table === 'sd_execution_baselines') {
      if (st.op === 'select') {
        return { data: baselineInserted ? (cfg.raceWinner || null) : (cfg.activeBaseline || null), error: null };
      }
      if (st.op === 'insert') {
        calls.baselineInserts.push(st.payload);
        baselineInserted = true;
        if (cfg.baselineInsertError) return { data: null, error: cfg.baselineInsertError };
        return { data: { id: cfg.newBaselineId || 'bl-new' }, error: null };
      }
      if (st.op === 'delete') { calls.deletes.push(true); return { error: cfg.deleteError || null }; }
    }
    if (st.table === 'strategic_directives_v2') return { data: cfg.sds || [], error: null };
    if (st.table === 'sd_baseline_items' && st.op === 'insert') { calls.itemInserts.push(st.payload); return { error: cfg.itemsInsertError || null }; }
    if (st.table === 'sd_execution_actuals' && st.op === 'insert') { calls.actualInserts.push(st.payload); return { error: cfg.actualsInsertError || null }; }
    return { data: null, error: null };
  }
  function builder(table) {
    const st = { table, op: 'select', payload: null };
    const api = {
      select: () => api, eq: () => api, in: () => api, not: () => api, order: () => api, limit: () => api,
      insert: (p) => { st.op = 'insert'; st.payload = p; return api; },
      delete: () => { st.op = 'delete'; return api; },
      maybeSingle: () => { try { return Promise.resolve(terminal(st)); } catch (e) { return Promise.reject(e); } },
      then: (res, rej) => { try { res(terminal(st)); } catch (e) { rej(e); } },
    };
    return api;
  }
  return { sb: { from: builder }, calls };
}

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe('ensureActiveBaseline', () => {
  it('no-op (silent) when an active baseline already exists', async () => {
    const { sb, calls } = makeFake({ activeBaseline: { id: 'bl-existing' } });
    const r = await ensureActiveBaseline(sb);
    expect(r).toEqual({ created: false, baselineId: 'bl-existing', itemCount: 0, reason: 'exists' });
    expect(calls.baselineInserts).toHaveLength(0);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('creates baseline + items (sd_id === sd_key) and logs the notice once', async () => {
    const sds = [
      { id: 'u1', sd_key: 'SD-A-001', sequence_rank: 1, status: 'draft', dependencies: [], metadata: {}, progress_percentage: 0 },
      { id: 'u2', sd_key: 'SD-B-002', sequence_rank: 2, status: 'active', dependencies: ['SD-X'], metadata: { execution_track: 'Feature' }, progress_percentage: 50 },
    ];
    const { sb, calls } = makeFake({ activeBaseline: null, sds, newBaselineId: 'bl-new' });
    const r = await ensureActiveBaseline(sb);
    expect(r).toEqual({ created: true, baselineId: 'bl-new', itemCount: 2, reason: 'created' });
    const items = calls.itemInserts[0];
    expect(items.map((i) => i.sd_id)).toEqual(['SD-A-001', 'SD-B-002']); // JOIN key MUST be sd_key
    expect(items.map((i) => i.sequence_rank)).toEqual([1, 2]);
    expect(items[1].track).toBe('B'); // Feature -> B
    expect(items[0].track).toBeNull(); // unmapped -> null (STANDALONE default downstream)
    expect(calls.actualInserts).toHaveLength(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0][0])).toContain('auto-created');
  });

  it('treats a 23505 create-race as a benign SILENT no-op (race_lost) and recovers the winner id', async () => {
    const { sb, calls } = makeFake({
      activeBaseline: null,
      sds: [{ id: 'u1', sd_key: 'SD-A-001', sequence_rank: 1, status: 'draft', dependencies: [], metadata: {}, progress_percentage: 0 }],
      baselineInsertError: { code: '23505', message: 'duplicate key value violates unique constraint "idx_sd_baselines_single_active"' },
      raceWinner: { id: 'bl-peer-won' },
    });
    const r = await ensureActiveBaseline(sb);
    expect(r).toEqual({ created: false, baselineId: 'bl-peer-won', itemCount: 0, reason: 'race_lost' });
    expect(calls.itemInserts).toHaveLength(0); // items not attempted after the failed baseline insert
    expect(errSpy).not.toHaveBeenCalled(); // we did not create it -> no notice
  });

  it('returns no_sds silently when the candidate query is empty', async () => {
    const { sb, calls } = makeFake({ activeBaseline: null, sds: [] });
    const r = await ensureActiveBaseline(sb);
    expect(r).toEqual({ created: false, baselineId: null, itemCount: 0, reason: 'no_sds' });
    expect(calls.baselineInserts).toHaveLength(0);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('rolls back the orphan baseline when items insert fails (never leaves active-but-empty)', async () => {
    const { sb, calls } = makeFake({
      activeBaseline: null,
      sds: [{ id: 'u1', sd_key: 'SD-A-001', sequence_rank: 1, status: 'draft', dependencies: [], metadata: {}, progress_percentage: 0 }],
      newBaselineId: 'bl-new',
      itemsInsertError: { message: 'constraint violation' },
    });
    const r = await ensureActiveBaseline(sb);
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/^items_failed/);
    expect(calls.deletes).toHaveLength(1); // orphan baseline deleted
    expect(errSpy).not.toHaveBeenCalled(); // no success notice
  });

  it('is fail-open: an unexpected error is swallowed and returned, never thrown', async () => {
    const { sb } = makeFake({ throwOnBaselineSelect: true });
    const r = await ensureActiveBaseline(sb); // must not throw
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/^error:/);
  });

  it('actuals insert failure is non-fatal (baseline still created)', async () => {
    const { sb } = makeFake({
      activeBaseline: null,
      sds: [{ id: 'u1', sd_key: 'SD-A-001', sequence_rank: 1, status: 'draft', dependencies: [], metadata: {}, progress_percentage: 0 }],
      newBaselineId: 'bl-new',
      actualsInsertError: { message: 'actuals boom' },
    });
    const r = await ensureActiveBaseline(sb);
    expect(r).toEqual({ created: true, baselineId: 'bl-new', itemCount: 1, reason: 'created' });
  });
});
