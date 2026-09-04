import { describe, it, expect } from 'vitest';
import { backfill } from '../../scripts/defect-class-backfill-20260901.js';

const FAKE_TAXONOMY = {
  classes: [
    { key: 'class_a', family: 'family_a', predicate: 'predicate a', type_specimen: 'spec a' },
    { key: 'class_b', family: 'family_b', predicate: 'predicate b', type_specimen: 'spec b' },
  ],
  first_population: {
    mapped: {
      class_a: ['QF-100'],
      class_b: ['20dc072b'],
    },
    mints_2026_09_01: ['QF-200', 'SD-FDBK-INFRA-EXAMPLE-001'],
  },
};

function makeMockSupabase() {
  const state = { classes: new Map(), specimens: new Map() };
  return {
    state,
    from(table) {
      if (table === 'feedback') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { metadata: { taxonomy: FAKE_TAXONOMY } }, error: null }),
            }),
          }),
        };
      }
      if (table === 'defect_classes') {
        return {
          upsert: (row) => {
            state.classes.set(row.class_key, row);
            return { select: () => ({ single: async () => ({ data: { class_key: row.class_key, verified_fix_date: null, fixing_sd_or_qf: null }, error: null }) }) };
          },
        };
      }
      if (table === 'defect_class_specimens') {
        return {
          upsert: (row) => {
            state.specimens.set(`${row.source_type}:${row.source_id}`, row);
            return { select: () => ({ single: async () => ({ data: { id: `${row.source_type}:${row.source_id}`, class_key: row.class_key, source_type: row.source_type, source_id: row.source_id }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('defect-class-backfill-20260901', () => {
  it('creates all classes from the live taxonomy', async () => {
    const supabase = makeMockSupabase();
    const results = await backfill({ supabase });
    expect(results.classesCreated.sort()).toEqual(['class_a', 'class_b']);
  });

  it('links mapped specimens to their classes', async () => {
    const supabase = makeMockSupabase();
    await backfill({ supabase });
    expect(supabase.state.specimens.get('quick_fix:QF-100')).toMatchObject({ class_key: 'class_a', source_type: 'quick_fix', source_id: 'QF-100' });
    expect(supabase.state.specimens.get('feedback:20dc072b')).toMatchObject({ class_key: 'class_b', source_type: 'feedback', source_id: '20dc072b' });
  });

  it('files same-day mints as UNCLASSIFIED (class_key null), never dropped', async () => {
    const supabase = makeMockSupabase();
    await backfill({ supabase });
    expect(supabase.state.specimens.get('quick_fix:QF-200')).toMatchObject({ class_key: null, source_id: 'QF-200' });
    expect(supabase.state.specimens.get('sd:SD-FDBK-INFRA-EXAMPLE-001')).toMatchObject({ class_key: null, source_id: 'SD-FDBK-INFRA-EXAMPLE-001' });
  });

  it('throws if the taxonomy feedback row has no metadata.taxonomy', async () => {
    const supabase = {
      from(table) {
        if (table === 'feedback') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { metadata: {} }, error: null }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    await expect(backfill({ supabase })).rejects.toThrow(/no metadata.taxonomy/);
  });
});
