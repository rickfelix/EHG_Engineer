/**
 * Unit tests for the deviation-ledger module (recordDeviation / readDeviations).
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A
 *
 * @module tests/unit/eva/deviation-ledger.test
 */

import { describe, it, expect, vi } from 'vitest';
import { recordDeviation, readDeviations, DEVIATION_WEIGHTS } from '../../../lib/eva/deviation-ledger.js';
import { ARTIFACT_TYPES } from '../../../lib/eva/artifact-types.js';

/** Mock Supabase client that captures inserted rows and serves canned reads. */
function createMockSupabase({ readRows = [] } = {}) {
  const insertedRows = [];

  const insertChain = (row) => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: `deviation-${insertedRows.length}` }, error: null }),
    }),
  });

  const selectChain = () => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: readRows, error: null }),
    };
    return chain;
  };

  const fromMock = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockImplementation((row) => {
      insertedRows.push(row);
      return insertChain(row);
    }),
    select: vi.fn().mockImplementation(() => selectChain()),
  }));

  return { from: fromMock, _insertedRows: insertedRows };
}

describe('DEVIATION_WEIGHTS', () => {
  it('is exactly the chairman-ratified 4-value taxonomy', () => {
    expect(DEVIATION_WEIGHTS).toEqual(['minor', 'moderate', 'critical', 'declared-descope']);
  });
});

describe('recordDeviation()', () => {
  const baseOpts = {
    ventureId: 'venture-test-1',
    artifactRef: 'blueprint_user_story_pack:story-3',
    what: 'Story-3 specified a signup form',
    instead: 'Signup was combined into the login page',
    why: 'UX review found a single combined flow reduced drop-off in usability testing',
    decidedBy: 'chairman',
  };

  it('round-trips a full record with a valid weight', async () => {
    const supabase = createMockSupabase();
    const id = await recordDeviation(supabase, { ...baseOpts, weight: 'critical' });

    expect(id).toBeTruthy();
    const row = supabase._insertedRows[0];
    expect(row.venture_id).toBe(baseOpts.ventureId);
    expect(row.artifact_type).toBe(ARTIFACT_TYPES.BUILD_DEVIATION_RECORD);
    expect(row.lifecycle_stage).toBe(19);
    expect(row.artifact_data).toEqual({
      artifact_ref: baseOpts.artifactRef,
      what: baseOpts.what,
      instead: baseOpts.instead,
      why: baseOpts.why,
      decided_by: baseOpts.decidedBy,
      weight: 'critical',
    });
  });

  it('accepts an explicit lifecycleStage override', async () => {
    const supabase = createMockSupabase();
    await recordDeviation(supabase, { ...baseOpts, weight: 'minor', lifecycleStage: 21 });
    expect(supabase._insertedRows[0].lifecycle_stage).toBe(21);
  });

  it.each(DEVIATION_WEIGHTS)('accepts weight=%s with a non-empty reason', async (weight) => {
    const supabase = createMockSupabase();
    await expect(recordDeviation(supabase, { ...baseOpts, weight })).resolves.toBeTruthy();
  });

  it('rejects declared-descope with an empty reason — no weight is exempt from the reason requirement', async () => {
    const supabase = createMockSupabase();
    await expect(
      recordDeviation(supabase, { ...baseOpts, weight: 'declared-descope', why: '' })
    ).rejects.toThrow(/non-empty reason/);
    expect(supabase._insertedRows).toHaveLength(0);
  });

  it('rejects a whitespace-only reason', async () => {
    const supabase = createMockSupabase();
    await expect(
      recordDeviation(supabase, { ...baseOpts, weight: 'minor', why: '   ' })
    ).rejects.toThrow(/non-empty reason/);
  });

  it('rejects an invalid weight', async () => {
    const supabase = createMockSupabase();
    await expect(
      recordDeviation(supabase, { ...baseOpts, weight: 'severe' })
    ).rejects.toThrow(/weight to be one of/);
    expect(supabase._insertedRows).toHaveLength(0);
  });

  it('requires ventureId and artifactRef', async () => {
    const supabase = createMockSupabase();
    await expect(recordDeviation(supabase, { ...baseOpts, ventureId: undefined, weight: 'minor' })).rejects.toThrow(/ventureId/);
    await expect(recordDeviation(supabase, { ...baseOpts, artifactRef: undefined, weight: 'minor' })).rejects.toThrow(/artifactRef/);
  });

  it('surfaces a supabase insert error', async () => {
    const supabase = createMockSupabase();
    supabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
        }),
      }),
    });
    await expect(recordDeviation(supabase, { ...baseOpts, weight: 'minor' })).rejects.toThrow(/insert failed/);
  });
});

describe('readDeviations()', () => {
  it('returns an empty array (never null) when nothing exists', async () => {
    const supabase = createMockSupabase({ readRows: [] });
    const result = await readDeviations(supabase, { ventureId: 'v1', artifactRef: 'a1' });
    expect(result).toEqual([]);
  });

  it('returns all matching records in creation order with flattened fields', async () => {
    const rows = [
      {
        id: 'dev-1',
        created_at: '2026-07-01T00:00:00Z',
        artifact_data: { artifact_ref: 'a1', what: 'X', instead: 'Y', why: 'reason', decided_by: 'adam', weight: 'moderate' },
      },
    ];
    const supabase = createMockSupabase({ readRows: rows });
    const result = await readDeviations(supabase, { ventureId: 'v1', artifactRef: 'a1' });
    expect(result).toEqual([
      { id: 'dev-1', createdAt: '2026-07-01T00:00:00Z', artifact_ref: 'a1', what: 'X', instead: 'Y', why: 'reason', decided_by: 'adam', weight: 'moderate' },
    ]);
  });

  it('requires ventureId and artifactRef', async () => {
    const supabase = createMockSupabase();
    await expect(readDeviations(supabase, { artifactRef: 'a1' })).rejects.toThrow(/ventureId/);
    await expect(readDeviations(supabase, { ventureId: 'v1' })).rejects.toThrow(/artifactRef/);
  });

  it('surfaces a supabase read error', async () => {
    const supabase = createMockSupabase();
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'read failed' } }),
      }),
    });
    await expect(readDeviations(supabase, { ventureId: 'v1', artifactRef: 'a1' })).rejects.toThrow(/read failed/);
  });
});
