// QF-20260911-229: the register-first gap where a roadmap_wave_items row's metadata.source_key
// named an existing SD but promoted_to_sd_key sat NULL indefinitely. These tests cover the exit
// predicate (findOrphanedSdLinkedItems) and the backfill (dry-run + apply, via the canonical
// stamp writers only).
import { describe, it, expect } from 'vitest';
import {
  findOrphanedSdLinkedItems,
  backfillOrphanedSdLinkedItems,
} from '../../../lib/roadmap/orphaned-sd-link-backfill.mjs';

function mockSupabase({ items, sds, onUpdateRoadmapItem, onUpdateCompletion }) {
  return {
    from(table) {
      if (table === 'roadmap_wave_items') {
        return {
          select() {
            return {
              eq() { return this; },
              is() { return this; },
              order() { return this; },
              range: () => Promise.resolve({ data: items, error: null }),
            };
          },
          update(patch) {
            // Two distinct callers share this table: the backfill's own two-way stamp
            // (ends at .eq('id', ...), resolves immediately) and
            // stampRoadmapItemsOnCompletion's completion flip
            // (.eq('promoted_to_sd_key', sdKey).neq().neq().select('id'), chainable past .eq()).
            if ('promoted_to_sd_key' in patch) {
              return { eq: (_c, id) => { onUpdateRoadmapItem?.(id, patch); return Promise.resolve({ error: null }); } };
            }
            return {
              eq() { return this; },
              neq() { return this; },
              select: () => Promise.resolve({ data: onUpdateCompletion?.(patch) ?? [], error: null }),
            };
          },
        };
      }
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ in: () => Promise.resolve({ data: sds, error: null }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const ITEM_COMPLETED = { id: 'i1', item_disposition: 'pending', promoted_to_sd_key: null, source_type: 'adam_direct', metadata: { source_key: 'SD-DONE-001' } };
const ITEM_DEFERRED = { id: 'i2', item_disposition: 'pending', promoted_to_sd_key: null, source_type: 'adam_direct', metadata: { source_key: 'SD-DEFERRED-001' } };
const ITEM_NO_SOURCE_KEY = { id: 'i3', item_disposition: 'pending', promoted_to_sd_key: null, source_type: 'youtube', metadata: {} };

describe('findOrphanedSdLinkedItems', () => {
  it('only matches pending/unlinked items whose source_key resolves to a REAL SD', async () => {
    const supabase = mockSupabase({
      items: [ITEM_COMPLETED, ITEM_DEFERRED, ITEM_NO_SOURCE_KEY],
      sds: [{ sd_key: 'SD-DONE-001', status: 'completed' }, { sd_key: 'SD-DEFERRED-001', status: 'deferred' }],
    });
    const orphans = await findOrphanedSdLinkedItems(supabase);
    expect(orphans.map((o) => o.item.id).sort()).toEqual(['i1', 'i2']);
    expect(orphans.find((o) => o.item.id === 'i1').sd.status).toBe('completed');
    expect(orphans.find((o) => o.item.id === 'i2').sd.status).toBe('deferred');
  });

  it('returns empty when no candidate carries a source_key (the exit predicate passing)', async () => {
    const supabase = mockSupabase({ items: [ITEM_NO_SOURCE_KEY], sds: [] });
    expect(await findOrphanedSdLinkedItems(supabase)).toEqual([]);
  });
});

describe('backfillOrphanedSdLinkedItems', () => {
  it('dry-run counts candidates without writing', async () => {
    let wrote = false;
    const supabase = mockSupabase({
      items: [ITEM_COMPLETED, ITEM_DEFERRED],
      sds: [{ sd_key: 'SD-DONE-001', status: 'completed' }, { sd_key: 'SD-DEFERRED-001', status: 'deferred' }],
      onUpdateRoadmapItem: () => { wrote = true; },
    });
    const result = await backfillOrphanedSdLinkedItems(supabase, { apply: false });
    expect(result).toMatchObject({ candidates: 2, stamped: 2, promoted: 1, dry_run: true, errors: [] });
    expect(wrote).toBe(false);
  });

  it('apply stamps promoted_to_sd_key for every orphan, but advances item_disposition only for the item whose linked SD is ALREADY completed', async () => {
    const stampedItems = [];
    const completionCalls = [];
    const supabase = mockSupabase({
      items: [ITEM_COMPLETED, ITEM_DEFERRED],
      sds: [{ sd_key: 'SD-DONE-001', status: 'completed' }, { sd_key: 'SD-DEFERRED-001', status: 'deferred' }],
      onUpdateRoadmapItem: (id, patch) => stampedItems.push({ id, patch }),
      onUpdateCompletion: (patch) => { completionCalls.push(patch); return [{ id: 'i1' }]; },
    });
    const result = await backfillOrphanedSdLinkedItems(supabase, { apply: true });

    // Both items get promoted_to_sd_key stamped via buildTwoWayStamp's shape.
    expect(stampedItems).toEqual([
      { id: 'i1', patch: { promoted_to_sd_key: 'SD-DONE-001' } },
      { id: 'i2', patch: { promoted_to_sd_key: 'SD-DEFERRED-001' } },
    ]);
    // Only the completed SD's item advances item_disposition (via stampRoadmapItemsOnCompletion) --
    // the deferred one is left alone, not hand-forced to 'promoted'.
    expect(completionCalls).toEqual([{ item_disposition: 'promoted' }]);
    expect(result).toMatchObject({ candidates: 2, stamped: 2, promoted: 1, dry_run: false, errors: [] });
  });

  it('no candidates is a true no-op (0/0/0, no SD lookup, no writes)', async () => {
    const supabase = mockSupabase({ items: [ITEM_NO_SOURCE_KEY], sds: [] });
    const result = await backfillOrphanedSdLinkedItems(supabase, { apply: true });
    expect(result).toEqual({ candidates: 0, stamped: 0, promoted: 0, dry_run: false, errors: [] });
  });
});
