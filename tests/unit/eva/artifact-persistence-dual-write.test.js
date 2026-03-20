/**
 * Unit tests for writeArtifact() dual-write behavior.
 * Ensures both content (TEXT) and artifact_data (JSONB) are always populated.
 *
 * SD-EVA-INFRA-PERSIST-SVC-BYPASS-FIX-001
 *
 * @module tests/unit/eva/artifact-persistence-dual-write.test
 */

import { describe, it, expect, vi } from 'vitest';
import { writeArtifact, writeArtifactBatch } from '../../../lib/eva/artifact-persistence-service.js';

/**
 * Create a mock Supabase client that captures inserted rows.
 */
function createMockSupabase() {
  const insertedRows = [];
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  });

  const fromMock = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockImplementation((row) => {
      insertedRows.push(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: `art-${insertedRows.length}` },
            error: null,
          }),
        }),
      };
    }),
    update: updateMock,
  }));

  return { from: fromMock, _insertedRows: insertedRows };
}

describe('writeArtifact() dual-write', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 1,
    artifactType: 'stage_analysis',
    title: 'Test Artifact',
    skipDedup: true,
  };

  it('should populate both content and artifact_data when artifactData provided', async () => {
    const supabase = createMockSupabase();
    const payload = { result: 'analysis data', score: 85 };

    await writeArtifact(supabase, { ...baseOpts, artifactData: payload });

    const row = supabase._insertedRows[0];
    expect(row.artifact_data).toEqual(payload);
    expect(row.content).toBe(JSON.stringify(payload));
    expect(row.content).not.toBeNull();
  });

  it('should populate both content and artifact_data when content provided', async () => {
    const supabase = createMockSupabase();
    const text = '{"parsed": true}';

    await writeArtifact(supabase, { ...baseOpts, content: text });

    const row = supabase._insertedRows[0];
    expect(row.content).toBe(text);
    expect(row.artifact_data).toEqual({ parsed: true });
  });

  it('should NOT produce content=NULL when artifactData is a valid object', async () => {
    const supabase = createMockSupabase();
    const payload = { key1: 'value1', nested: { data: [1, 2, 3] } };

    await writeArtifact(supabase, { ...baseOpts, artifactData: payload });

    const row = supabase._insertedRows[0];
    expect(row.content).not.toBeNull();
    expect(typeof row.content).toBe('string');
    expect(row.content.length).toBeGreaterThan(0);
  });

  it('should handle empty object payload without producing NULL content', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts, artifactData: {} });

    const row = supabase._insertedRows[0];
    expect(row.content).not.toBeNull();
    expect(row.artifact_data).toEqual({});
  });

  it('should handle string payload as artifactData', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts, artifactData: 'plain text result' });

    const row = supabase._insertedRows[0];
    expect(row.content).not.toBeNull();
    expect(row.artifact_data).toBe('plain text result');
  });

  it('should allow both to be null when neither provided', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts });

    const row = supabase._insertedRows[0];
    expect(row.artifact_data).toBeNull();
    expect(row.content).toBeNull();
  });

  it('should handle complex nested payload with 12+ keys', async () => {
    const supabase = createMockSupabase();
    const payload = {
      key1: 'v1', key2: 'v2', key3: 'v3', key4: 'v4',
      key5: 'v5', key6: 'v6', key7: 'v7', key8: 'v8',
      key9: 'v9', key10: 'v10', key11: 'v11', key12: 'v12',
    };

    await writeArtifact(supabase, { ...baseOpts, artifactData: payload });

    const row = supabase._insertedRows[0];
    expect(row.content).not.toBeNull();
    expect(row.artifact_data).toEqual(payload);
    expect(JSON.parse(row.content)).toEqual(payload);
  });
});

describe('writeArtifactBatch() dual-write', () => {
  it('should produce non-NULL content for all artifacts in batch', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: { stage: 1, data: 'test' } },
      { artifactType: 'summary', payload: { summary: 'brief' } },
      { artifactType: 'metrics', payload: { score: 85, confidence: 0.9 } },
    ];

    await writeArtifactBatch(supabase, 'venture-123', 5, artifacts);

    for (const row of supabase._insertedRows) {
      expect(row.content).not.toBeNull();
      expect(row.artifact_data).not.toBeNull();
    }
  });

  it('should use source from artifact when provided', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'analysis', payload: { data: true }, source: 'stage-01' },
    ];

    await writeArtifactBatch(supabase, 'venture-123', 1, artifacts);

    const row = supabase._insertedRows[0];
    expect(row.source).toBe('stage-01');
    expect(row.content).not.toBeNull();
  });
});
