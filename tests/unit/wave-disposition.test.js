/**
 * Unit tests for the wave-disposition contract
 * SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001
 *
 * Covers TS-1 (ratification without disposition rejected), TS-3 unit half
 * (orchestrator creation gate semantics via validateWaveDisposition), TS-6
 * control (exempt decision types unchanged), plus the idempotent apply path
 * and freshness stamping.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateWaveDisposition,
  applyWaveDisposition,
  deterministicSourceId,
} from '../../lib/roadmap/wave-disposition.js';
import { recordDisposition } from '../../lib/decision-binding/disposition.js';

const WAVE_ID = '512c7478-c5df-4a5c-be00-49aa4d101e5c';

describe('validateWaveDisposition (TS-1 / TS-3 gate semantics)', () => {
  it('rejects a missing disposition with usage guidance', () => {
    expect(() => validateWaveDisposition(null)).toThrow(/wave_disposition required/);
    expect(() => validateWaveDisposition(undefined)).toThrow(/wave_disposition required/);
  });

  it('rejects both waveId and noWave supplied', () => {
    expect(() => validateWaveDisposition({ waveId: WAVE_ID, noWave: 'x' })).toThrow(/not both/);
  });

  it('rejects an empty no_wave reason (explicit-never-default)', () => {
    expect(() => validateWaveDisposition({ noWave: '   ' })).toThrow(/non-empty reason/);
    expect(() => validateWaveDisposition({})).toThrow(/non-empty reason/);
  });

  it('accepts a wave choice and returns the verdict', () => {
    expect(validateWaveDisposition({ waveId: WAVE_ID })).toEqual({ kind: 'wave', waveId: WAVE_ID });
  });

  it('accepts an explicit no_wave verdict with reason', () => {
    expect(validateWaveDisposition({ noWave: 'operational-only, no gate impact' }))
      .toEqual({ kind: 'no_wave', reason: 'operational-only, no gate impact' });
  });
});

describe('deterministicSourceId', () => {
  it('is stable and uuid-shaped (idempotency via UNIQUE constraint)', () => {
    const a = deterministicSourceId('SD-X-001');
    expect(a).toBe(deterministicSourceId('SD-X-001'));
    expect(a).not.toBe(deterministicSourceId('SD-X-002'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

/** Minimal supabase mock: routes .from(table) chains onto canned handlers. */
function mockSupabase(handlers) {
  return {
    from: (table) => handlers[table](),
  };
}

describe('applyWaveDisposition', () => {
  it('no_wave stamps all active roadmaps and inserts no item', async () => {
    const stamped = [];
    const supabase = mockSupabase({
      strategic_roadmaps: () => ({
        select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'r1' }, { id: 'r2' }], error: null }) }),
        update: (patch) => ({ in: (_c, ids) => { stamped.push(...ids); return Promise.resolve({ error: null }); } }),
      }),
    });
    const res = await applyWaveDisposition(supabase, {
      waveDisposition: { noWave: 'reason' },
      sourceKey: 'k1',
      title: 't',
      dispositionSource: 'test',
    });
    expect(res.itemId).toBeNull();
    expect(res.verdict.kind).toBe('no_wave');
    expect(stamped).toEqual(['r1', 'r2']);
  });

  it('wave choice inserts the item and stamps the parent roadmap', async () => {
    const inserted = [];
    const stamped = [];
    const supabase = mockSupabase({
      roadmap_wave_items: () => ({
        insert: (row) => { inserted.push(row); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'item-1' }, error: null }) }) }; },
      }),
      roadmap_waves: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { roadmap_id: 'r1' }, error: null }) }) }),
      }),
      strategic_roadmaps: () => ({
        update: () => ({ in: (_c, ids) => { stamped.push(...ids); return Promise.resolve({ error: null }); } }),
      }),
    });
    const res = await applyWaveDisposition(supabase, {
      waveDisposition: { waveId: WAVE_ID },
      sourceKey: 'SD-ORCH-001',
      title: 'Orch parent',
      dispositionSource: 'orchestrator_sd_creation',
    });
    expect(res.itemId).toBe('item-1');
    expect(inserted[0]).toMatchObject({
      wave_id: WAVE_ID,
      source_type: 'adam_direct',
      item_disposition: 'pending',
    });
    expect(inserted[0].source_id).toBe(deterministicSourceId('SD-ORCH-001'));
    expect(stamped).toEqual(['r1']);
  });

  it('duplicate insert (23505) resolves to the existing item — idempotent', async () => {
    const supabase = mockSupabase({
      roadmap_wave_items: () => ({
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }),
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'existing-1' }, error: null }) }) }) }) }),
      }),
      roadmap_waves: () => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { roadmap_id: 'r1' }, error: null }) }) }),
      }),
      strategic_roadmaps: () => ({
        update: () => ({ in: () => Promise.resolve({ error: null }) }),
      }),
    });
    const res = await applyWaveDisposition(supabase, {
      waveDisposition: { waveId: WAVE_ID },
      sourceKey: 'SD-ORCH-001',
      title: 'Orch parent',
      dispositionSource: 'orchestrator_sd_creation',
    });
    expect(res.itemId).toBe('existing-1');
  });
});

describe('recordDisposition plan_ratification gate (TS-1 / TS-6)', () => {
  it('TS-1: plan_ratification without waveDisposition throws BEFORE any write', async () => {
    const from = vi.fn();
    await expect(recordDisposition({ from }, {
      decisionType: 'plan_ratification',
      subject: { workstream: 'spine-core' },
      decisionKey: 'spine-core',
    })).rejects.toThrow(/wave_disposition required/);
    expect(from).not.toHaveBeenCalled(); // negative path leaves no partial state
  });

  it('TS-6 control: artifact ratification (fixture class) records without a wave disposition', async () => {
    // Existing-row dedup path exercises the full pre-insert flow without a DB.
    const existingRow = { id: 'e1', payload: { question_key: 'dq_x', status: 'dispositioned' } };
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: existingRow, error: null }) }) }),
        }),
      }),
    };
    const { row, created } = await recordDisposition(supabase, {
      decisionType: 'ratification',
      subject: { fixture_set_id: 'fs1', fixture_id: 'f1' },
      decisionKey: 'fixture f1',
    });
    expect(created).toBe(false);
    expect(row).toBe(existingRow);
  });
});
