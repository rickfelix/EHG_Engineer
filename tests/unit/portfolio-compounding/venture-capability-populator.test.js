/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-2) — venture_capabilities population.
 * Proves the machinery via FIXTURES (never fakes live rows) and that it is HONEST about
 * dormancy (0 real ventures -> 0 populated, no fabrication).
 */
import { describe, it, expect } from 'vitest';
import {
  isRealVenture,
  deriveVentureCapabilities,
  populateVentureCapabilities,
} from '../../../lib/governance/venture-capability-populator.js';

describe('isRealVenture — conservative, default-exclude', () => {
  it('excludes cancelled / demo / scaffolding / test ventures', () => {
    expect(isRealVenture({ id: '1', name: 'Real Co', status: 'active' })).toBe(true);
    expect(isRealVenture({ id: '2', name: 'X', status: 'cancelled' })).toBe(false);
    expect(isRealVenture({ id: '3', name: 'X', status: 'active', is_demo: true })).toBe(false);
    expect(isRealVenture({ id: '4', name: 'DataDistill', status: 'active', is_scaffolding: true })).toBe(false);
    expect(isRealVenture({ id: '5', name: 'Test Venture for Marketing', status: 'active' })).toBe(false);
    expect(isRealVenture({ id: '6', name: 'State-Test-123', status: 'active' })).toBe(false);
    expect(isRealVenture(null)).toBe(false);
  });
});

describe('deriveVentureCapabilities — pure', () => {
  const ventures = [
    { id: 'v-real', name: 'Real Co', status: 'active' },
    { id: 'v-cancel', name: 'Dead Co', status: 'cancelled' },
  ];
  it('derives rows only from real ventures, shaped for the live columns', () => {
    const sds = [
      { venture_id: 'v-real', delivers_capabilities: ['auth', { name: 'billing', capability_type: 'core', maturity_level: 'mature' }] },
      { venture_id: 'v-cancel', delivers_capabilities: ['ignored'] },
    ];
    const { rows, skipped } = deriveVentureCapabilities(ventures, sds);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'auth', origin_venture_id: 'v-real', capability_type: 'delivered', maturity_level: 'emerging' });
    expect(rows[1]).toMatchObject({ name: 'billing', origin_venture_id: 'v-real', capability_type: 'core', maturity_level: 'mature' });
    expect(skipped).toBe(1); // the cancelled venture's SD
  });

  it('dedups (venture,capability) and ignores empty capability names', () => {
    const sds = [
      { venture_id: 'v-real', delivers_capabilities: ['auth', 'auth', '', null, { name: '' }] },
    ];
    const { rows } = deriveVentureCapabilities(ventures, sds);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('auth');
  });

  it('returns 0 rows when there are no real ventures (honest dormancy)', () => {
    const { rows } = deriveVentureCapabilities([{ id: 'x', status: 'cancelled' }], [{ venture_id: 'x', delivers_capabilities: ['a'] }]);
    expect(rows).toHaveLength(0);
  });
});

describe('populateVentureCapabilities — honest dormancy via IO wrapper', () => {
  it('reports populated:0 dormant:true when no real ventures exist, and NEVER upserts', async () => {
    let upsertCalled = false;
    const supabase = {
      from: (t) => ({
        select: async () => ({ data: [{ id: 'a', name: 'X', status: 'cancelled' }, { id: 'b', name: 'DataDistill', status: 'active', is_scaffolding: true }], error: null }),
        upsert: async () => { upsertCalled = true; return { error: null }; },
      }),
    };
    const r = await populateVentureCapabilities(supabase);
    expect(r).toMatchObject({ success: true, populated: 0, realVentures: 0, dormant: true });
    expect(upsertCalled).toBe(false);
  });

  it('fails soft on a read error (never throws)', async () => {
    const supabase = { from: () => ({ select: async () => ({ data: null, error: { message: 'db down' } }) }) };
    const r = await populateVentureCapabilities(supabase);
    expect(r.success).toBe(false);
    expect(r.error).toBe('db down');
  });
});
