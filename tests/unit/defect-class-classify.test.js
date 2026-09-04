import { describe, it, expect, vi } from 'vitest';
import { classify, classifyUnclassified } from '../../scripts/defect-class-classify.js';

function makeMockSupabase({ classUpsertResult, specimenUpsertResult } = {}) {
  const calls = { classUpsert: null, specimenUpsert: null };
  return {
    calls,
    from(table) {
      if (table === 'defect_classes') {
        return {
          upsert(row, opts) {
            calls.classUpsert = { row, opts };
            return {
              select: () => ({
                single: async () => ({ data: classUpsertResult ?? { class_key: row.class_key, verified_fix_date: row.verified_fix_date ?? null, fixing_sd_or_qf: row.fixing_sd_or_qf ?? null }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'defect_class_specimens') {
        return {
          upsert(row, opts) {
            calls.specimenUpsert = { row, opts };
            return {
              select: () => ({
                single: async () => ({ data: specimenUpsertResult ?? { id: 'specimen-1', class_key: row.class_key, source_type: row.source_type, source_id: row.source_id }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('defect-class-classify', () => {
  it('creates a class row without a specimen', async () => {
    const supabase = makeMockSupabase();
    const result = await classify({
      classKey: 'self_certified_evidence',
      familyDescription: 'blind guards: ...',
      classifiedBy: 'test',
      supabase,
    });
    expect(supabase.calls.classUpsert.row.class_key).toBe('self_certified_evidence');
    expect(supabase.calls.classUpsert.row.verified_fix_date).toBeUndefined();
    expect(supabase.calls.specimenUpsert).toBeNull();
    expect(result.class.class_key).toBe('self_certified_evidence');
    expect(result.specimen).toBeNull();
  });

  it('links a specimen to a class in the same call', async () => {
    const supabase = makeMockSupabase();
    const result = await classify({
      classKey: 'presence_read_as_value',
      familyDescription: 'instruments that lie',
      classifiedBy: 'test',
      specimen: { sourceType: 'quick_fix', sourceId: 'QF-296', witnessedAt: '2026-09-01T23:59:59Z' },
      supabase,
    });
    expect(supabase.calls.specimenUpsert.row).toMatchObject({
      class_key: 'presence_read_as_value',
      source_type: 'quick_fix',
      source_id: 'QF-296',
    });
    expect(result.specimen.source_id).toBe('QF-296');
  });

  it('rejects setting verified_fix_date without fixing_sd_or_qf (no side-effect fix marking)', async () => {
    const supabase = makeMockSupabase();
    await expect(
      classify({
        classKey: 'x',
        familyDescription: 'y',
        classifiedBy: 'test',
        verifiedFixDate: '2026-09-05T00:00:00Z',
        supabase,
      })
    ).rejects.toThrow(/fixingSdOrQf/);
    expect(supabase.calls.classUpsert).toBeNull();
  });

  it('sets verified_fix_date and fixing_sd_or_qf together when both are provided', async () => {
    const supabase = makeMockSupabase();
    await classify({
      classKey: 'x',
      familyDescription: 'y',
      classifiedBy: 'test',
      verifiedFixDate: '2026-09-05T00:00:00Z',
      fixingSdOrQf: 'QF-999',
      supabase,
    });
    expect(supabase.calls.classUpsert.row.verified_fix_date).toBe('2026-09-05T00:00:00Z');
    expect(supabase.calls.classUpsert.row.fixing_sd_or_qf).toBe('QF-999');
  });

  it('requires classKey and classifiedBy', async () => {
    await expect(classify({ classifiedBy: 'test' })).rejects.toThrow(/classKey/);
    await expect(classify({ classKey: 'x' })).rejects.toThrow(/classifiedBy/);
  });

  it('classifyUnclassified inserts a specimen with class_key null', async () => {
    const supabase = makeMockSupabase({ specimenUpsertResult: { id: 's', class_key: null, source_type: 'quick_fix', source_id: 'QF-874' } });
    const row = await classifyUnclassified({
      sourceType: 'quick_fix',
      sourceId: 'QF-874',
      witnessedAt: '2026-09-01T23:59:59Z',
      classifiedBy: 'test',
      supabase,
    });
    expect(supabase.calls.specimenUpsert.row.class_key).toBeNull();
    expect(row.class_key).toBeNull();
  });

  it('classifyUnclassified requires all fields', async () => {
    await expect(classifyUnclassified({ sourceType: 'quick_fix', sourceId: 'QF-1', witnessedAt: 'x' })).rejects.toThrow(/classifiedBy/);
    await expect(classifyUnclassified({ classifiedBy: 'test' })).rejects.toThrow(/sourceType/);
  });
});
