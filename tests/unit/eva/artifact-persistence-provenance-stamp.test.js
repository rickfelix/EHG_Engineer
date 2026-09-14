/**
 * Unit tests for the metadata.machine_provenance stamp added to writeArtifact()'s three
 * write paths (fresh-INSERT, dedup-UPDATE, unique-violation fallback), and for the two
 * pre-existing metadata-clobber bugs fixed alongside it.
 *
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-1, FR-3)
 *
 * @module tests/unit/eva/artifact-persistence-provenance-stamp.test
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import { writeArtifact, buildMachineProvenance } from '../../../lib/eva/artifact-persistence-service.js';

function sha256(payload) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Mock Supabase client supporting all three write paths:
 *   - fresh INSERT (dedup finds nothing, no unique violation)
 *   - dedup-UPDATE (dedup pre-check finds an existing current row)
 *   - unique-violation fallback (INSERT errors 23505, re-select finds the row, UPDATE)
 */
function createMockSupabase({ existingId = null, existingMetadata = null, insertError = null } = {}) {
  const insertedRows = [];
  const updatedRows = [];

  function buildSelectChain() {
    const chain = {};
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: existingId ? { id: existingId, metadata: existingMetadata } : null,
      error: null,
    });
    return chain;
  }

  const fromMock = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockImplementation(() => buildSelectChain()),
    insert: vi.fn().mockImplementation((row) => {
      insertedRows.push(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            insertError
              ? { data: null, error: insertError }
              : { data: { id: `art-${insertedRows.length}` }, error: null }
          ),
        }),
      };
    }),
    update: vi.fn().mockImplementation((row) => {
      updatedRows.push(row);
      const chain = {
        eq: vi.fn(() => chain),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    }),
  }));

  return { from: fromMock, _insertedRows: insertedRows, _updatedRows: updatedRows };
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value violates unique constraint idx_unique_current_artifact' };

describe('writeArtifact() provenance stamp — fresh-INSERT path', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 1,
    artifactType: 'stage_analysis',
    title: 'Test Artifact',
    skipDedup: true,
  };

  it('stamps metadata.machine_provenance unconditionally, even with no metadata passed', async () => {
    const supabase = createMockSupabase();
    await writeArtifact(supabase, { ...baseOpts, artifactData: { a: 1 } });

    const row = supabase._insertedRows[0];
    expect(row.metadata.machine_provenance).toBeDefined();
    expect(row.metadata.machine_provenance.producer).toBeTruthy();
    expect(row.metadata.machine_provenance.run_id).toBeTruthy();
    expect(row.metadata.machine_provenance.content_hash).toBeTruthy();
    expect(row.metadata.machine_provenance.hash_source).toBe('content');
  });

  it('hashes content when content is provided, recording hash_source=content', async () => {
    const supabase = createMockSupabase();
    const artifactData = { a: 1, b: 2 };
    await writeArtifact(supabase, { ...baseOpts, artifactData });

    const row = supabase._insertedRows[0];
    expect(row.content).not.toBeNull();
    expect(row.metadata.machine_provenance.hash_source).toBe('content');
    expect(row.metadata.machine_provenance.content_hash).toBe(sha256(row.content));
  });

  it('via writeArtifact(), content is always backfilled from artifactData by deriveContent(), so hash_source is content even when the caller passes content:null', async () => {
    const supabase = createMockSupabase();
    await writeArtifact(supabase, {
      ventureId: 'venture-test-123',
      lifecycleStage: 21,
      artifactType: 'visual_device_screenshots',
      title: 'Screenshots',
      skipDedup: true,
      artifactData: { screenshots: ['a.png', 'b.png'] },
      content: null,
    });

    const row = supabase._insertedRows[0];
    // This is the actual mechanism behind G3 being fixable at the root: routing the 3 bypass
    // writers (FR-2) through writeArtifact() means their content column is NEVER null going
    // forward, because deriveContent() backfills it from artifact_data. The null-content rows
    // testing-agent measured live are the PRE-FR-2 raw-insert rows, a legacy-only condition.
    expect(row.content).not.toBeNull();
    expect(row.metadata.machine_provenance.hash_source).toBe('content');
    expect(row.metadata.machine_provenance.content_hash).toBe(sha256(row.content));
  });

  it('buildMachineProvenance() itself resolves content ?? artifactData directly, for a row where content is genuinely NULL (e.g. a legacy row read back for re-verification)', () => {
    const stamp = buildMachineProvenance({
      source: 'stage-21-visual-assets',
      content: null,
      artifactData: { screenshots: ['a.png', 'b.png'] },
    });

    expect(stamp.hash_source).toBe('artifact_data');
    expect(stamp.content_hash).toBe(sha256({ screenshots: ['a.png', 'b.png'] }));
    expect(stamp.content_hash).not.toBe(sha256(null));
  });

  it('preserves caller-supplied metadata keys alongside the stamp', async () => {
    const supabase = createMockSupabase();
    await writeArtifact(supabase, {
      ...baseOpts,
      artifactData: { a: 1 },
      metadata: { screenId: 'screen-42', custom: 'value' },
    });

    const row = supabase._insertedRows[0];
    expect(row.metadata.screenId).toBe('screen-42');
    expect(row.metadata.custom).toBe('value');
    expect(row.metadata.machine_provenance).toBeDefined();
  });

  it('respects an explicit producer/runId when passed, instead of defaulting', async () => {
    const supabase = createMockSupabase();
    await writeArtifact(supabase, {
      ...baseOpts,
      artifactData: { a: 1 },
      producer: 'stage-21-visual-assets',
      runId: 'run-fixed-001',
    });

    const row = supabase._insertedRows[0];
    expect(row.metadata.machine_provenance.producer).toBe('stage-21-visual-assets');
    expect(row.metadata.machine_provenance.run_id).toBe('run-fixed-001');
  });

  it('defaults producer to source when no explicit producer given', async () => {
    const supabase = createMockSupabase();
    await writeArtifact(supabase, { ...baseOpts, artifactData: { a: 1 }, source: 'stage-23-dedicated-venture-uat' });

    const row = supabase._insertedRows[0];
    expect(row.metadata.machine_provenance.producer).toBe('stage-23-dedicated-venture-uat');
  });
});

describe('writeArtifact() provenance stamp — dedup-UPDATE path (FR-1 clobber fix)', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 23,
    artifactType: 'launch_uat_report',
    title: 'UAT Report',
    // skipDedup NOT set — exercises the dedup-UPDATE branch.
  };

  it('stamps the provenance field while preserving pre-existing metadata keys (screenId, version)', async () => {
    const supabase = createMockSupabase({
      existingId: 'existing-art-1',
      existingMetadata: { screenId: 'screen-7', version: 3 },
    });

    const returnedId = await writeArtifact(supabase, { ...baseOpts, artifactData: { result: 'green' } });

    expect(returnedId).toBe('existing-art-1');
    const update = supabase._updatedRows[0];
    expect(update.metadata.screenId).toBe('screen-7');
    expect(update.metadata.version).toBe(3);
    expect(update.metadata.machine_provenance).toBeDefined();
    expect(update.metadata.machine_provenance.content_hash).toBe(sha256(update.content));
  });

  it('does NOT clobber pre-existing metadata when the caller passes no metadata opt (re-run through the dedup path)', async () => {
    const supabase = createMockSupabase({
      existingId: 'existing-art-2',
      existingMetadata: { machine_provenance: { producer: 'old', run_id: 'old-run', content_hash: 'stale-hash', hash_source: 'content' }, screenId: 'screen-9' },
    });

    await writeArtifact(supabase, { ...baseOpts, artifactData: { result: 'updated-content' } });

    const update = supabase._updatedRows[0];
    // screenId (the unique-index discriminator) must survive the re-run
    expect(update.metadata.screenId).toBe('screen-9');
    // the stamp must be REFRESHED, not the stale one carried over
    expect(update.metadata.machine_provenance.content_hash).toBe(sha256(update.content));
    expect(update.metadata.machine_provenance.content_hash).not.toBe('stale-hash');
  });
});

describe('writeArtifact() provenance stamp — unique-violation fallback path (FR-1 pre-existing clobber fix)', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 23,
    artifactType: 'launch_uat_report',
    title: 'UAT Report',
    skipDedup: true, // force straight to INSERT, which then hits the unique violation
  };

  it('preserves pre-existing metadata keys on the fallback UPDATE instead of overwriting wholesale', async () => {
    const supabase = createMockSupabase({
      existingId: 'existing-art-3',
      existingMetadata: { screenId: 'screen-11', editorial_note: 'do not remove' },
      insertError: UNIQUE_VIOLATION,
    });

    const returnedId = await writeArtifact(supabase, { ...baseOpts, artifactData: { result: 'race-condition-write' } });

    expect(returnedId).toBe('existing-art-3');
    const update = supabase._updatedRows[0];
    expect(update.metadata.screenId).toBe('screen-11');
    expect(update.metadata.editorial_note).toBe('do not remove');
    expect(update.metadata.machine_provenance).toBeDefined();
  });
});
