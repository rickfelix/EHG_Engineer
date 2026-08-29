import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  familyKey,
  runCensus,
  STANDALONE_NON_BUILDABLE_IDS,
} from '../../scripts/roadmap-corpus-hygiene-census.mjs';
import { cureRow } from '../../scripts/roadmap-corpus-hygiene-cure.mjs';

function makeRow(overrides = {}) {
  return {
    id: 'id-1',
    source_type: 'todoist',
    title: 'Some Title',
    promoted_to_sd_key: null,
    item_disposition: 'pending',
    lane: null,
    remainder_state: 'promotable_now',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeTitle('  Hello, World!!  ')).toBe('hello world');
  });
  it('handles null/undefined', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
  });
});

describe('familyKey', () => {
  it('combines source_type and normalized title', () => {
    expect(familyKey({ source_type: 'youtube', title: 'AI News!' })).toBe('youtube::ai news');
  });
});

function makeSupabaseStub(rows) {
  return {
    from(table) {
      expect(table).toBe('roadmap_wave_items');
      const builder = {
        select() {
          return builder;
        },
        range() {
          return builder;
        },
        eq() {
          return builder;
        },
        is() {
          return builder;
        },
        then(resolve) {
          return resolve({ data: rows.slice(), error: null });
        },
      };
      return builder;
    },
  };
}

describe('runCensus classification', () => {
  it('classifies a row as family-cure when a void sibling with the same normalized title+source_type exists', async () => {
    const target = makeRow({ id: 'a', title: 'Duplicate Item' });
    const voidTwin = makeRow({ id: 'b', title: 'Duplicate Item', remainder_state: 'void', item_disposition: 'dropped' });
    // Only one .range() page is issued per query in this test (small dataset); the stub
    // returns the same full row set for both the target-filtered query and the all-rows query
    // since our fake .eq()/.is() are no-ops that don't actually filter -- to keep the test
    // faithful to the real filter contract we return exactly the population under test.
    const rows = [target, voidTwin];
    const supabase = makeSupabaseStub(rows);
    // Because our stub's eq()/is() don't filter, "target" (would-be promotable_now+unpromoted
    // query) receives the SAME two rows as the "all rows" query. runCensus queries target twice
    // conceptually (once filtered, once unfiltered for family lookups) -- for classification
    // correctness what matters is the family lookup sees both rows.
    const report = await runCensus(supabase);
    expect(report.total).toBe(2);
    const familyCureIds = report.family_cure.map((r) => r.id);
    expect(familyCureIds).toContain('a');
    const cured = report.family_cure.find((r) => r.id === 'a');
    expect(cured.canonical_member_id).toBe('b');
  });

  it('classifies a row as standalone-unclassified when no sibling exists and its id is not in the manual review list', async () => {
    const target = makeRow({ id: 'zzz-not-reviewed', title: 'Totally Unique Title Xyzzy' });
    const supabase = makeSupabaseStub([target]);
    const report = await runCensus(supabase);
    expect(report.standalone_unclassified_count).toBe(1);
    expect(report.standalone_unclassified[0].id).toBe('zzz-not-reviewed');
  });

  it('classifies a row as standalone-curable when it is in the manually-reviewed non-buildable list', async () => {
    const reviewedId = [...STANDALONE_NON_BUILDABLE_IDS][0];
    const target = makeRow({ id: reviewedId, title: 'Whatever unique title' });
    const supabase = makeSupabaseStub([target]);
    const report = await runCensus(supabase);
    expect(report.standalone_curable_count).toBe(1);
    expect(report.standalone_curable[0].id).toBe(reviewedId);
  });

  it('does NOT treat a promoted sibling differently from a void sibling for family-cure detection', async () => {
    const target = makeRow({ id: 'a', title: 'Promoted Family' });
    const promotedTwin = makeRow({ id: 'b', title: 'Promoted Family', promoted_to_sd_key: 'SD-SOME-001', remainder_state: 'satisfied_elsewhere' });
    const supabase = makeSupabaseStub([target, promotedTwin]);
    const report = await runCensus(supabase);
    const familyCureIds = report.family_cure.map((r) => r.id);
    expect(familyCureIds).toContain('a');
  });

  it('skips a row with metadata.distill_dispositioned_at set instead of cure-classifying it, even when it would otherwise match family-cure or standalone-curable', async () => {
    const reviewedId = [...STANDALONE_NON_BUILDABLE_IDS][0];
    const externallyHandled = makeRow({
      id: reviewedId,
      title: 'Race-window row',
      metadata: { distill_dispositioned_at: '2026-08-29T11:23:28.532Z', distill_dispositioned_by: 'adam-f27a883d' },
    });
    const supabase = makeSupabaseStub([externallyHandled]);
    const report = await runCensus(supabase);
    expect(report.externally_dispositioned_count).toBe(1);
    expect(report.externally_dispositioned[0].id).toBe(reviewedId);
    expect(report.standalone_curable_count).toBe(0);
    expect(report.family_cure_count).toBe(0);
  });
});

describe('cureRow', () => {
  it('sets item_disposition=dropped and never writes remainder_state directly', async () => {
    let updatePayload = null;
    const supabase = {
      from(table) {
        expect(table).toBe('roadmap_wave_items');
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single() {
            return Promise.resolve({ data: { metadata: { existing: 'kept' } }, error: null });
          },
          update(payload) {
            updatePayload = payload;
            return this;
          },
        };
      },
    };
    await cureRow(supabase, { id: 'row-1', canonical_member_id: 'row-2' }, 'family-cure');
    expect(updatePayload.item_disposition).toBe('dropped');
    expect(updatePayload).not.toHaveProperty('remainder_state');
    expect(updatePayload.metadata.existing).toBe('kept');
    expect(updatePayload.metadata.corpus_hygiene.sd_key).toBe('SD-LEO-INFRA-ROADMAP-CORPUS-HYGIENE-001');
    expect(updatePayload.metadata.corpus_hygiene.classification).toBe('family-cure');
    expect(updatePayload.metadata.corpus_hygiene.canonical_member_id).toBe('row-2');
  });

  it('records canonical_member_id=null for standalone cures', async () => {
    let updatePayload = null;
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          single() { return Promise.resolve({ data: { metadata: {} }, error: null }); },
          update(payload) { updatePayload = payload; return this; },
        };
      },
    };
    await cureRow(supabase, { id: 'row-3' }, 'standalone-non-buildable');
    expect(updatePayload.metadata.corpus_hygiene.canonical_member_id).toBeNull();
  });
});
