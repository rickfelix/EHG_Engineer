/**
 * Unit tests for the FR-4 backfill core (runBackfill), independent of the live DB.
 *
 * SD-FDBK-ENH-APPLIES-FALSE-DECLINATION-001
 *
 * @module tests/unit/backfill-applies-false-declination-001.test
 */

import { describe, it, expect, vi } from 'vitest';
import { runBackfill, SPECIMEN_IDS } from '../../scripts/one-off/backfill-applies-false-declination-001.mjs';

function mockSupabaseFor(rowsById) {
  return {
    from: () => ({
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            const row = rowsById[val];
            return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
          },
        }),
      }),
      update: (patch) => ({
        eq: (col, val) => {
          if (rowsById[val]) Object.assign(rowsById[val], patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
}

describe('runBackfill()', () => {
  it('corrects a declination row from quality_score=70/validated to 0/rejected', async () => {
    const rows = {
      [SPECIMEN_IDS[0]]: { id: SPECIMEN_IDS[0], artifact_data: { applies: false, satisfied: true, reason: 'x' }, quality_score: 70, validation_status: 'validated' },
      [SPECIMEN_IDS[1]]: { id: SPECIMEN_IDS[1], artifact_data: { applies: false, satisfied: true, reason: 'y' }, quality_score: 70, validation_status: 'validated' },
    };
    const supabase = mockSupabaseFor(rows);

    const results = await runBackfill(supabase);

    expect(results.every(r => r.action === 'CORRECTED')).toBe(true);
    expect(rows[SPECIMEN_IDS[0]].quality_score).toBe(0);
    expect(rows[SPECIMEN_IDS[0]].validation_status).toBe('rejected');
  });

  it('is idempotent: a second run skips already-corrected rows', async () => {
    const rows = {
      [SPECIMEN_IDS[0]]: { id: SPECIMEN_IDS[0], artifact_data: { applies: false, satisfied: true }, quality_score: 0, validation_status: 'rejected' },
      [SPECIMEN_IDS[1]]: { id: SPECIMEN_IDS[1], artifact_data: { applies: false, satisfied: true }, quality_score: 0, validation_status: 'rejected' },
    };
    const supabase = mockSupabaseFor(rows);

    const results = await runBackfill(supabase);

    expect(results.every(r => r.action === 'SKIP_ALREADY_CORRECTED')).toBe(true);
  });

  it('skips a row whose payload is not a declination (guards against overreach)', async () => {
    const rows = {
      [SPECIMEN_IDS[0]]: { id: SPECIMEN_IDS[0], artifact_data: { result: 'real analysis' }, quality_score: 70, validation_status: 'validated' },
      [SPECIMEN_IDS[1]]: { id: SPECIMEN_IDS[1], artifact_data: { applies: false, satisfied: true }, quality_score: 70, validation_status: 'validated' },
    };
    const supabase = mockSupabaseFor(rows);

    const results = await runBackfill(supabase);

    expect(results[0].action).toBe('SKIP_NOT_A_DECLINATION');
    expect(rows[SPECIMEN_IDS[0]].quality_score).toBe(70);
    expect(results[1].action).toBe('CORRECTED');
  });

  it('dryRun makes no writes', async () => {
    const rows = {
      [SPECIMEN_IDS[0]]: { id: SPECIMEN_IDS[0], artifact_data: { applies: false, satisfied: true }, quality_score: 70, validation_status: 'validated' },
      [SPECIMEN_IDS[1]]: { id: SPECIMEN_IDS[1], artifact_data: { applies: false, satisfied: true }, quality_score: 70, validation_status: 'validated' },
    };
    const supabase = mockSupabaseFor(rows);

    const results = await runBackfill(supabase, { dryRun: true });

    expect(results.every(r => r.action === 'WOULD_CORRECT')).toBe(true);
    expect(rows[SPECIMEN_IDS[0]].quality_score).toBe(70);
  });

  it('reports SKIP_NOT_FOUND for a missing row without throwing', async () => {
    const supabase = mockSupabaseFor({});

    const results = await runBackfill(supabase);

    expect(results.every(r => r.action === 'SKIP_NOT_FOUND')).toBe(true);
  });
});
