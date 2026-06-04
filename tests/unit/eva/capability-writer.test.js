/**
 * Unit tests for the live sd_capabilities writer (MAPPER).
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 — FR-2 (B1/TR-1, TS-4b/c).
 *
 * Pure mapping is tested directly; the UPSERT is tested with a supabase double that
 * captures the call shape. TS-4a (idempotency against the REAL UNIQUE constraint)
 * is covered by the FR-7 integration smoke (BEGIN..ROLLBACK prod dry-run).
 */
import { describe, it, expect } from 'vitest';
import {
  mapToCapabilityRow, planLeafCapabilityRows, writeLeafCapabilities,
  namespacedCapabilityKey, VALID_CAPABILITY_ACTIONS, CAPABILITY_CONFLICT_TARGET,
} from '../../../lib/eva/bridge/capability-writer.js';

const CTX = { sdId: 'SD-DD-SPRINT-002-C1', sdUuid: 'leaf-uuid-1', ventureId: 'v1' };
const SECTIONS = [
  { dimension: 'data-schema', code: 'DATABASE', section: 'CREATE TABLE distill_runs (...)' },
  { dimension: 'technical-architecture', code: 'API', section: 'REST endpoints for SCAN/WALK/DIST.' },
];

describe('mapToCapabilityRow (B1/TR-1)', () => {
  const rec = { capability_id: 'cap-database-data-schema', capability_type: 'database_schema', category: 'application', name: 'DATABASE: data-schema', description: 'DDL' };

  it('maps to live columns: capability_key, action, dual sd_id+sd_uuid', () => {
    const row = mapToCapabilityRow(rec, { ...CTX, action: 'registered' });
    expect(row.sd_id).toBe('SD-DD-SPRINT-002-C1');
    expect(row.sd_uuid).toBe('leaf-uuid-1');
    expect(row.capability_key).toBe('v1:cap-database-data-schema'); // venture-namespaced
    expect(row.action).toBe('registered');
    expect(row.capability_type).toBe('database_schema');
    expect('capability_id' in row).toBe(false); // no nonexistent column
    expect('reuse_count' in row).toBe(false);    // R5: no reuse/centrality writes
  });

  it('TS-4c: rejects an action outside the CHECK set', () => {
    expect(() => mapToCapabilityRow(rec, { ...CTX, action: 'create' })).toThrow(/action must be one of/);
    expect(VALID_CAPABILITY_ACTIONS).toEqual(['registered', 'updated']);
  });

  it('requires both sd_id and sd_uuid (NOT NULL)', () => {
    expect(() => mapToCapabilityRow(rec, { sdUuid: 'x', action: 'registered' })).toThrow(/sdId and sdUuid/);
    expect(() => mapToCapabilityRow(rec, { sdId: 'x', action: 'registered' })).toThrow(/sdId and sdUuid/);
  });

  it('namespacedCapabilityKey falls back to the bare id when no ventureId', () => {
    expect(namespacedCapabilityKey('cap-x', null)).toBe('cap-x');
    expect(namespacedCapabilityKey('cap-x', 'v9')).toBe('v9:cap-x');
  });
});

describe('planLeafCapabilityRows', () => {
  it('maps each section; new => registered, reused => updated', () => {
    const existing = [{ capability_id: 'cap-api-technical-architecture' }]; // API already exists
    const rows = planLeafCapabilityRows(SECTIONS, existing, CTX);
    const byKey = Object.fromEntries(rows.map((r) => [r.capability_key, r.action]));
    expect(byKey['v1:cap-database-data-schema']).toBe('registered');
    expect(byKey['v1:cap-api-technical-architecture']).toBe('updated');
  });

  it('TS-4b: the same dimension under a DIFFERENT venture yields a DISTINCT key (no cross-venture collision)', () => {
    const a = planLeafCapabilityRows([SECTIONS[0]], [], { sdId: 'SD-A', sdUuid: 'ua', ventureId: 'vA' });
    const b = planLeafCapabilityRows([SECTIONS[0]], [], { sdId: 'SD-B', sdUuid: 'ub', ventureId: 'vB' });
    expect(a[0].capability_key).toBe('vA:cap-database-data-schema');
    expect(b[0].capability_key).toBe('vB:cap-database-data-schema');
    expect(a[0].capability_key).not.toBe(b[0].capability_key);
  });

  it('dedups repeated (capability_key, action) within one leaf so the UPSERT never self-conflicts', () => {
    const dup = [SECTIONS[0], { ...SECTIONS[0] }]; // same dimension twice
    const rows = planLeafCapabilityRows(dup, [], CTX);
    expect(rows.length).toBe(1);
  });
});

describe('writeLeafCapabilities (UPSERT)', () => {
  it('upserts on the real conflict target and reports the written count', async () => {
    const captured = {};
    const supabase = {
      from(table) { captured.table = table; return this; },
      upsert(rows, opts) { captured.rows = rows; captured.opts = opts; return Promise.resolve({ error: null }); },
    };
    const res = await writeLeafCapabilities(supabase, SECTIONS, [], CTX);
    expect(captured.table).toBe('sd_capabilities');
    expect(captured.opts.onConflict).toBe(CAPABILITY_CONFLICT_TARGET);
    expect(CAPABILITY_CONFLICT_TARGET).toBe('sd_uuid,capability_key,action');
    expect(res.written).toBe(2);
  });

  it('no sections => no write', async () => {
    let called = false;
    const supabase = { from() { called = true; return this; }, upsert() { called = true; return Promise.resolve({ error: null }); } };
    const res = await writeLeafCapabilities(supabase, [], [], CTX);
    expect(res.written).toBe(0);
    expect(called).toBe(false);
  });

  it('surfaces an upsert error (fail-closed, not silent)', async () => {
    const supabase = { from() { return this; }, upsert() { return Promise.resolve({ error: { message: 'check violation' } }); } };
    await expect(writeLeafCapabilities(supabase, SECTIONS, [], CTX)).rejects.toThrow(/upsert failed: check violation/);
  });
});
