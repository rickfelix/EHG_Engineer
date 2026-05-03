/**
 * SD-LEO-FIX-S14-WORKER-OMITS-001 FR-004 — persistArtifact typed-array
 * detection branch.
 *
 * Verifies that stage-execution-engine.js:persistArtifact correctly handles:
 *   - Typed-array path: artifactData.artifacts = [N entries] → writeArtifactBatch
 *   - Legacy path: artifactData lacks .artifacts → writeArtifact (single)
 *   - Empty-array edge: artifactData.artifacts = [] → legacy fall-through
 *
 * Pre-fix: persistArtifact always called writeArtifact with hardcoded
 * artifactType=stage_${stageNumber}_analysis, dropping output.artifacts on
 * the floor. PrivacyPatrol AI's S14 missing 4 of 5 blueprint sub-artifacts
 * was the empirical signal.
 *
 * @module tests/unit/eva/stage-execution-engine-persist-artifact.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock artifact-persistence-service so we can spy on both writeArtifact (legacy)
// and writeArtifactBatch (typed). vi.spyOn on a real export is preferred per
// reference_vi_mock_masks_broken_import.md, but vi.mock on the whole module is
// acceptable here because both names are real exports (verified — see
// lib/eva/artifact-persistence-service.js:248 and :275).
vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn(),
  writeArtifactBatch: vi.fn(),
}));

import { persistArtifact } from '../../../lib/eva/stage-execution-engine.js';
import {
  writeArtifact,
  writeArtifactBatch,
} from '../../../lib/eva/artifact-persistence-service.js';

function createMockSupabase() {
  const insertedEvents = [];
  const chain = {
    insert: vi.fn(async (row) => {
      insertedEvents.push(row);
      return { error: null };
    }),
  };
  return {
    from: vi.fn(() => chain),
    _insertedEvents: insertedEvents,
  };
}

describe('FR-001/FR-004: persistArtifact typed-array detection branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('typed-array path: 5 entries → writeArtifactBatch called once with 5; writeArtifact NOT called', async () => {
    writeArtifactBatch.mockResolvedValue([
      'id-blueprint',
      'id-data-model',
      'id-erd',
      'id-api',
      'id-schema',
    ]);

    const supabase = createMockSupabase();
    const s14Output = {
      // S14 returns { ...legacyPayload, artifactType, artifacts: [5] }
      artifactType: 'blueprint_technical_architecture',
      layers: [],
      artifacts: [
        { artifactType: 'blueprint_technical_architecture', payload: { layers: [] }, source: 'analysis-step:stage-14' },
        { artifactType: 'blueprint_data_model', payload: { entities: [] }, source: 'analysis-step:stage-14-projection' },
        { artifactType: 'blueprint_erd_diagram', payload: { mermaid: '' }, source: 'analysis-step:stage-14-projection' },
        { artifactType: 'blueprint_api_contract', payload: { endpoints: [] }, source: 'analysis-step:stage-14-projection' },
        { artifactType: 'blueprint_schema_spec', payload: { tables: [] }, source: 'analysis-step:stage-14-projection' },
      ],
    };

    const id = await persistArtifact(supabase, 'venture-uuid', 14, s14Output, {
      visionKey: 'vk-1',
      planKey: 'pk-1',
    });

    expect(writeArtifactBatch).toHaveBeenCalledTimes(1);
    expect(writeArtifact).not.toHaveBeenCalled();

    const [, ventureArg, stageArg, batchEntries, idempotencyKey, opts] =
      writeArtifactBatch.mock.calls[0];
    expect(ventureArg).toBe('venture-uuid');
    expect(stageArg).toBe(14);
    expect(batchEntries).toHaveLength(5);
    expect(batchEntries.map((e) => e.artifactType)).toEqual([
      'blueprint_technical_architecture',
      'blueprint_data_model',
      'blueprint_erd_diagram',
      'blueprint_api_contract',
      'blueprint_schema_spec',
    ]);
    expect(idempotencyKey).toBeNull();
    expect(opts).toEqual({ visionKey: 'vk-1', planKey: 'pk-1' });

    // Returns first ID for caller backward-compat
    expect(id).toBe('id-blueprint');

    // Batch event emitted (one row, not five)
    const batchEvents = supabase._insertedEvents.filter(
      (e) => e.event_type === 'stage_analysis_completed_batch'
    );
    expect(batchEvents).toHaveLength(1);
    expect(batchEvents[0].event_data.artifact_count).toBe(5);
    expect(batchEvents[0].event_data.artifact_ids).toHaveLength(5);
    expect(batchEvents[0].event_data.sd_origin).toBe('SD-LEO-FIX-S14-WORKER-OMITS-001');
  });

  it('legacy path: artifactData lacks .artifacts → writeArtifact (single) called', async () => {
    writeArtifact.mockResolvedValue('legacy-artifact-id');

    const supabase = createMockSupabase();
    const stageOutput = { someField: 'value', otherField: 42 }; // no .artifacts

    const id = await persistArtifact(supabase, 'venture-uuid', 7, stageOutput, {});

    expect(writeArtifact).toHaveBeenCalledTimes(1);
    expect(writeArtifactBatch).not.toHaveBeenCalled();

    const [, opts] = writeArtifact.mock.calls[0];
    expect(opts.lifecycleStage).toBe(7);
    expect(opts.artifactType).toBe('stage_7_analysis');
    expect(opts.title).toBe('Stage 7 Analysis');

    expect(id).toBe('legacy-artifact-id');

    // Legacy single event emitted
    const legacyEvents = supabase._insertedEvents.filter(
      (e) => e.event_type === 'stage_analysis_completed'
    );
    expect(legacyEvents).toHaveLength(1);
  });

  it('empty-array edge: artifactData.artifacts = [] → legacy fall-through', async () => {
    writeArtifact.mockResolvedValue('legacy-from-empty');

    const supabase = createMockSupabase();
    const emptyArrOutput = { artifacts: [], summary: 'nothing produced' };

    const id = await persistArtifact(supabase, 'venture-uuid', 8, emptyArrOutput, {});

    // Empty array does NOT trigger batch path — falls through to legacy
    expect(writeArtifactBatch).not.toHaveBeenCalled();
    expect(writeArtifact).toHaveBeenCalledTimes(1);
    expect(id).toBe('legacy-from-empty');
  });

  it('non-array .artifacts (e.g., string) → legacy fall-through', async () => {
    writeArtifact.mockResolvedValue('legacy-from-non-array');

    const supabase = createMockSupabase();
    const malformedOutput = { artifacts: 'not an array', stage: 9 };

    const id = await persistArtifact(supabase, 'venture-uuid', 9, malformedOutput, {});

    expect(writeArtifactBatch).not.toHaveBeenCalled();
    expect(writeArtifact).toHaveBeenCalledTimes(1);
    expect(id).toBe('legacy-from-non-array');
  });

  it('return shape consistency: both paths return a string ID', async () => {
    writeArtifactBatch.mockResolvedValue(['batch-id-1', 'batch-id-2']);
    writeArtifact.mockResolvedValue('legacy-id');

    const supabase = createMockSupabase();

    const typedId = await persistArtifact(
      supabase,
      'venture-uuid',
      14,
      { artifacts: [{ artifactType: 't1', payload: {} }, { artifactType: 't2', payload: {} }] },
      {}
    );
    expect(typedId).toBe('batch-id-1');
    expect(typeof typedId).toBe('string');

    vi.clearAllMocks();
    writeArtifact.mockResolvedValue('legacy-id-2');
    const legacyId = await persistArtifact(supabase, 'venture-uuid', 5, { foo: 'bar' }, {});
    expect(legacyId).toBe('legacy-id-2');
    expect(typeof legacyId).toBe('string');
  });

  it('FR-002: typed-array path event uses event_type=stage_analysis_completed_batch', async () => {
    writeArtifactBatch.mockResolvedValue(['id1', 'id2']);

    const supabase = createMockSupabase();
    await persistArtifact(
      supabase,
      'v1',
      14,
      { artifacts: [{ artifactType: 'a', payload: {} }, { artifactType: 'b', payload: {} }] },
      {}
    );

    const events = supabase._insertedEvents;
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('stage_analysis_completed_batch');
    expect(events[0].event_data.artifact_count).toBe(2);
    expect(events[0].event_data.artifact_types).toEqual(['a', 'b']);
  });

  it('FR-002: legacy path event uses event_type=stage_analysis_completed (unchanged)', async () => {
    writeArtifact.mockResolvedValue('legacy-id');

    const supabase = createMockSupabase();
    await persistArtifact(supabase, 'v1', 5, { x: 1 }, {});

    const events = supabase._insertedEvents;
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('stage_analysis_completed');
    expect(events[0].event_data.stage_number).toBe(5);
    expect(events[0].event_data.artifact_type).toBe('stage_5_analysis');
  });
});
