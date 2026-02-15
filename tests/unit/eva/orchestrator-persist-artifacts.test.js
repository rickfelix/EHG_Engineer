/**
 * Unit tests for persistArtifacts() from eva-orchestrator.js
 * Part of EVA test gap remediation Phase 1
 *
 * Tests the _internal.persistArtifacts(supabase, ventureId, stageId, artifacts, idempotencyKey)
 * function which inserts artifacts into venture_artifacts table.
 *
 * @module tests/unit/eva/orchestrator-persist-artifacts.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transitive deps with shebangs that vitest can't transform
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { _internal } from '../../../lib/eva/eva-orchestrator.js';

const { persistArtifacts } = _internal;

/**
 * Create a mock Supabase client with chainable .from().insert().select().single()
 * @param {Object} options - { data, error } to return from single()
 * @returns {Object} Mock supabase client with call tracking
 */
function createMockSupabase({ data = { id: 'art-001' }, error = null } = {}) {
  const singleFn = vi.fn().mockResolvedValue({ data, error });
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const insertFn = vi.fn().mockReturnValue({ select: selectFn });
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn, update: vi.fn() });

  return {
    from: fromFn,
    _mocks: { fromFn, insertFn, selectFn, singleFn },
  };
}

/**
 * Create a mock Supabase client that returns different IDs for each insert
 * @param {string[]} ids - Array of IDs to return sequentially
 * @returns {Object} Mock supabase client
 */
function createMultiInsertMockSupabase(ids) {
  let callIndex = 0;
  const insertFn = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: ids[callIndex++] },
        error: null,
      }),
    }),
  }));
  const fromFn = vi.fn().mockReturnValue({ insert: insertFn, update: vi.fn() });

  return {
    from: fromFn,
    _mocks: { fromFn, insertFn },
  };
}

describe('persistArtifacts()', () => {
  const ventureId = 'venture-123';
  const stageId = 'stage-05';

  it('should insert artifacts with is_current: true', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: { result: 'data' } },
    ];

    await persistArtifacts(supabase, ventureId, stageId, artifacts);

    const insertedRow = supabase._mocks.insertFn.mock.calls[0][0];
    expect(insertedRow.is_current).toBe(true);
  });

  it('should return array of IDs from inserted rows', async () => {
    const supabase = createMultiInsertMockSupabase(['art-001', 'art-002', 'art-003']);
    const artifacts = [
      { artifactType: 'analysis', payload: { a: 1 } },
      { artifactType: 'summary', payload: { b: 2 } },
      { artifactType: 'report', payload: { c: 3 } },
    ];

    const ids = await persistArtifacts(supabase, ventureId, stageId, artifacts);

    expect(ids).toEqual(['art-001', 'art-002', 'art-003']);
  });

  it('should handle empty artifact array (returns [])', async () => {
    const supabase = createMockSupabase();

    const ids = await persistArtifacts(supabase, ventureId, stageId, []);

    expect(ids).toEqual([]);
    expect(supabase._mocks.insertFn).not.toHaveBeenCalled();
  });

  it('should set correct venture_id, lifecycle_stage, artifact_type, artifact_data', async () => {
    const supabase = createMockSupabase();
    const payload = { key: 'value', nested: { data: true } };
    const artifacts = [
      { artifactType: 'market-analysis', payload },
    ];

    await persistArtifacts(supabase, ventureId, stageId, artifacts);

    const insertedRow = supabase._mocks.insertFn.mock.calls[0][0];
    expect(insertedRow.venture_id).toBe(ventureId);
    expect(insertedRow.lifecycle_stage).toBe(stageId);
    expect(insertedRow.artifact_type).toBe('market-analysis');
    expect(insertedRow.artifact_data).toEqual(payload);
  });

  it('should pass source field through when provided', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: {}, source: 'custom-source' },
    ];

    await persistArtifacts(supabase, ventureId, stageId, artifacts);

    const insertedRow = supabase._mocks.insertFn.mock.calls[0][0];
    expect(insertedRow.source).toBe('custom-source');
  });

  it('should default source to eva-orchestrator when not provided', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: {} },
    ];

    await persistArtifacts(supabase, ventureId, stageId, artifacts);

    const insertedRow = supabase._mocks.insertFn.mock.calls[0][0];
    expect(insertedRow.source).toBe('eva-orchestrator');
  });

  it('should include idempotency_key in row when provided', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: {} },
    ];
    const idempotencyKey = 'idem-key-abc-123';

    await persistArtifacts(supabase, ventureId, stageId, artifacts, idempotencyKey);

    const insertedRow = supabase._mocks.insertFn.mock.calls[0][0];
    expect(insertedRow.idempotency_key).toBe(idempotencyKey);
  });

  it('should throw on DB error', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'duplicate key violation' },
    });
    const artifacts = [
      { artifactType: 'analysis', payload: {} },
    ];

    await expect(
      persistArtifacts(supabase, ventureId, stageId, artifacts),
    ).rejects.toThrow('Failed to persist artifact: duplicate key violation');
  });

  it('should NOT mark old artifacts is_current=false (versioning gap)', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: { version: 2 } },
    ];

    await persistArtifacts(supabase, ventureId, stageId, artifacts);

    // Verify from() was only called for insert, never for an update to set is_current=false
    const fromCalls = supabase._mocks.fromFn.mock.calls;
    expect(fromCalls).toHaveLength(1);
    expect(fromCalls[0][0]).toBe('venture_artifacts');

    // The return value of from() should only have insert() called, not update()
    const fromReturnValue = supabase._mocks.fromFn.mock.results[0].value;
    expect(fromReturnValue.update).not.toHaveBeenCalled();
  });
});
