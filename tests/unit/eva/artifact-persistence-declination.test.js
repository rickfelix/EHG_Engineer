/**
 * Unit tests for the {applies:false, satisfied:true, reason} declination shape
 * NOT being mislabeled as a validated artifact by writeArtifact()/writeArtifactBatch().
 *
 * SD-FDBK-ENH-APPLIES-FALSE-DECLINATION-001
 *
 * @module tests/unit/eva/artifact-persistence-declination.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  writeArtifact,
  writeArtifactBatch,
  isDeclinationPayload,
} from '../../../lib/eva/artifact-persistence-service.js';

const DECLINATION = { applies: false, satisfied: true, reason: 'gate not applicable at this stage' };

/**
 * Mock Supabase client supporting BOTH write paths under test:
 *   - fresh INSERT (dedup finds nothing)
 *   - dedup-UPDATE (dedup finds an existing current row)
 * `existingId` controls which path fires.
 */
function createMockSupabase({ existingId = null } = {}) {
  const insertedRows = [];
  const updatedRows = [];

  function buildSelectChain() {
    const chain = {};
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
      data: existingId ? { id: existingId } : null,
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
          single: vi.fn().mockResolvedValue({ data: { id: `art-${insertedRows.length}` }, error: null }),
        }),
      };
    }),
    update: vi.fn().mockImplementation((row) => {
      updatedRows.push(row);
      // Chainable .eq() (batch's pre-loop is_current=false update calls .eq() 4x, the
      // per-row dedup-UPDATE calls it once) that also resolves when awaited directly.
      const chain = {
        eq: vi.fn(() => chain),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    }),
  }));

  return { from: fromMock, _insertedRows: insertedRows, _updatedRows: updatedRows };
}

describe('isDeclinationPayload()', () => {
  it('recognizes the {applies:false, satisfied:true} shape', () => {
    expect(isDeclinationPayload(DECLINATION)).toBe(true);
  });

  it('rejects a genuine validated artifact payload', () => {
    expect(isDeclinationPayload({ result: 'analysis', score: 85 })).toBe(false);
  });

  it('rejects null/array/non-object payloads', () => {
    expect(isDeclinationPayload(null)).toBe(false);
    expect(isDeclinationPayload([1, 2, 3])).toBe(false);
    expect(isDeclinationPayload('plain text')).toBe(false);
  });

  it('rejects applies:false without satisfied:true (a real failure, not a declination)', () => {
    expect(isDeclinationPayload({ applies: false, satisfied: false, reason: 'x' })).toBe(false);
  });
});

describe('writeArtifact() — declination payload (fresh INSERT path)', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 23,
    artifactType: 'launch_uat_report',
    title: 'UAT Declination',
    skipDedup: true,
  };

  it('overrides quality_score=0 and validation_status=rejected for a declination artifactData payload', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts, artifactData: DECLINATION });

    const row = supabase._insertedRows[0];
    expect(row.quality_score).toBe(0);
    expect(row.validation_status).toBe('rejected');
  });

  it('overrides quality_score=0 and validation_status=rejected for a declination JSON content string', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts, content: JSON.stringify(DECLINATION) });

    const row = supabase._insertedRows[0];
    expect(row.quality_score).toBe(0);
    expect(row.validation_status).toBe('rejected');
  });

  it('leaves a genuine validated artifact at the caller-supplied (or default) quality/status', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, { ...baseOpts, artifactData: { result: 'real analysis', score: 92 } });

    const row = supabase._insertedRows[0];
    expect(row.quality_score).toBe(70);
    expect(row.validation_status).toBe('validated');
  });

  it('does not let an explicit caller-supplied qualityScore/validationStatus silently survive a declination payload', async () => {
    const supabase = createMockSupabase();

    await writeArtifact(supabase, {
      ...baseOpts,
      artifactData: DECLINATION,
      qualityScore: 99,
      validationStatus: 'validated',
    });

    const row = supabase._insertedRows[0];
    expect(row.quality_score).toBe(0);
    expect(row.validation_status).toBe('rejected');
  });
});

describe('writeArtifact() — declination payload (dedup-UPDATE path)', () => {
  const baseOpts = {
    ventureId: 'venture-test-123',
    lifecycleStage: 23,
    artifactType: 'launch_uat_report',
    title: 'UAT Declination',
    // skipDedup NOT set — exercises the dedup-UPDATE branch (~line 137), the path the
    // TESTING sub-agent flagged as uncovered if only the fresh-INSERT `row` object were fixed.
  };

  it('overrides quality_score=0 and validation_status=rejected on the dedup-UPDATE branch', async () => {
    const supabase = createMockSupabase({ existingId: 'existing-art-1' });

    const returnedId = await writeArtifact(supabase, { ...baseOpts, artifactData: DECLINATION });

    expect(returnedId).toBe('existing-art-1');
    const update = supabase._updatedRows[0];
    expect(update.quality_score).toBe(0);
    expect(update.validation_status).toBe('rejected');
  });

  it('leaves a genuine validated artifact unaffected on the dedup-UPDATE branch', async () => {
    const supabase = createMockSupabase({ existingId: 'existing-art-2' });

    await writeArtifact(supabase, { ...baseOpts, artifactData: { result: 'real analysis' } });

    const update = supabase._updatedRows[0];
    expect(update.quality_score).toBe(70);
    expect(update.validation_status).toBe('validated');
  });
});

describe('writeArtifactBatch() — delegates declination handling to writeArtifact() per item', () => {
  it('overrides quality_score=0/validation_status=rejected for a declination item in a batch, leaving siblings untouched', async () => {
    const supabase = createMockSupabase();
    const artifacts = [
      { artifactType: 'launch_uat_report', payload: DECLINATION },
      { artifactType: 'launch_readiness_summary', payload: { result: 'ready', score: 88 } },
    ];

    await writeArtifactBatch(supabase, 'venture-123', 23, artifacts);

    const [declinationRow, realRow] = supabase._insertedRows;
    expect(declinationRow.quality_score).toBe(0);
    expect(declinationRow.validation_status).toBe('rejected');
    expect(realRow.quality_score).toBe(70);
    expect(realRow.validation_status).toBe('validated');
  });
});
