/**
 * SD-LEO-FEAT-PHANTOM-TABLE-READ-001 — the HEAL_BEFORE_COMPLETE gate's global
 * threshold/tolerance override previously read a non-existent `leo_config` table
 * (PGRST205, silently dead). It now reads the real `app_config` table via a
 * shared fail-open helper. These tests lock in: the correct table name, the
 * override-honored path, fall-through when absent/out-of-range, and fail-open on error.
 */

import { describe, it, expect } from 'vitest';
import {
  readAppConfigValue,
  loadHealThreshold,
  loadToleranceBuffer,
} from '../../scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js';

/**
 * Build a mock supabase whose .from(table).select().eq(col,val).single() resolves
 * to `resolver(table, col, val)` => { data, error }. Records every table queried.
 */
function makeSupabase(resolver) {
  const queriedTables = [];
  const client = {
    from(table) {
      queriedTables.push(table);
      let _col, _val;
      const builder = {
        select() { return builder; },
        eq(col, val) { _col = col; _val = val; return builder; },
        single() { return Promise.resolve(resolver(table, _col, _val)); },
      };
      return builder;
    },
  };
  return { client, queriedTables };
}

describe('readAppConfigValue — reads the real app_config table, fail-open', () => {
  it('queries app_config (NEVER leo_config) and returns the value', async () => {
    const { client, queriedTables } = makeSupabase(() => ({ data: { value: '72' }, error: null }));
    const v = await readAppConfigValue(client, 'heal_gate_threshold');
    expect(v).toBe('72');
    expect(queriedTables).toContain('app_config');
    expect(queriedTables).not.toContain('leo_config');
  });

  it('returns null on a supabase error (missing row / missing table)', async () => {
    const { client } = makeSupabase(() => ({ data: null, error: { code: 'PGRST205', message: 'not found' } }));
    expect(await readAppConfigValue(client, 'heal_gate_threshold')).toBeNull();
  });

  it('returns null (no throw) when the read throws', async () => {
    const client = { from() { throw new Error('network down'); } };
    expect(await readAppConfigValue(client, 'heal_gate_threshold')).toBeNull();
  });

  it('returns null when the row has no value', async () => {
    const { client } = makeSupabase(() => ({ data: { value: null }, error: null }));
    expect(await readAppConfigValue(client, 'heal_gate_threshold')).toBeNull();
  });
});

describe('loadHealThreshold — app_config override → sd_type tier → default', () => {
  it('honors a valid app_config override with source app_config', async () => {
    const { client } = makeSupabase((t, c, v) => (v === 'heal_gate_threshold' ? { data: { value: '70' }, error: null } : { data: null, error: null }));
    expect(await loadHealThreshold(client, 'feature')).toEqual({ threshold: 70, source: 'app_config' });
  });

  it('falls through to the sd_type tier when no override exists', async () => {
    const { client, queriedTables } = makeSupabase(() => ({ data: null, error: { code: 'PGRST116' } }));
    const r = await loadHealThreshold(client, 'feature');
    expect(r.source).toBe('sd_type:feature');
    expect(r.threshold).toBeGreaterThan(0);
    // proves the phantom table is gone — only app_config is ever queried
    expect(queriedTables).toEqual(['app_config']);
    expect(queriedTables).not.toContain('leo_config');
  });

  it('rejects an out-of-range override and falls through', async () => {
    const { client } = makeSupabase(() => ({ data: { value: '999' }, error: null }));
    const r = await loadHealThreshold(client, 'feature');
    expect(r.source).toBe('sd_type:feature');
  });

  it('falls back to default when no sdType and no override', async () => {
    const { client } = makeSupabase(() => ({ data: null, error: { code: 'PGRST205' } }));
    const r = await loadHealThreshold(client, undefined);
    expect(r.source).toBe('default');
    expect(r.threshold).toBe(85);
  });

  it('fails open to sd_type/default when the read throws', async () => {
    const client = { from() { throw new Error('db down'); } };
    const r = await loadHealThreshold(client, 'feature');
    expect(r.source).toBe('sd_type:feature');
  });
});

describe('loadToleranceBuffer — app_config override, range-validated, fail-open', () => {
  it('honors a valid in-range override', async () => {
    const { client } = makeSupabase(() => ({ data: { value: '2' }, error: null }));
    expect(await loadToleranceBuffer(client)).toBe(2);
  });

  it('rejects an out-of-range override and returns the default', async () => {
    const { client } = makeSupabase(() => ({ data: { value: '50' }, error: null }));
    expect(await loadToleranceBuffer(client)).toBe(3);
  });

  it('returns the default when absent / on error', async () => {
    const { client } = makeSupabase(() => ({ data: null, error: { code: 'PGRST205' } }));
    expect(await loadToleranceBuffer(client)).toBe(3);
  });
});
