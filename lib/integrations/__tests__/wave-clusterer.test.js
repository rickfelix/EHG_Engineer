import { describe, it, expect } from 'vitest';
import { loadNewIntakeItems } from '../wave-clusterer.js';

/** Chainable fake query builder: .select/.not/.order/.eq are no-ops that return itself;
 * .range(from, to) is the terminal call fetchAllPaginated makes, and returns a promise. */
function makeBuilder(rows) {
  const b = {
    select: () => b,
    not: () => b,
    order: () => b,
    eq: () => b,
    range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  };
  return b;
}

function makeSupabase({ todoist = [], youtube = [], assignedIds = [] }) {
  return {
    from(table) {
      if (table === 'eva_todoist_intake') return makeBuilder(todoist);
      if (table === 'eva_youtube_intake') return makeBuilder(youtube);
      if (table === 'roadmap_wave_items') return makeBuilder(assignedIds.map((id) => ({ source_id: id })));
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function item(id, { day, intent = 'idea' } = {}) {
  return { id, title: id, description: '', target_application: 'EHG', target_aspects: [], chairman_intent: intent, created_at: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z` };
}

describe('loadNewIntakeItems (QF-20260911-117)', () => {
  it('returns unassigned rows past the old 500-combined-row cap', async () => {
    const todoist = Array.from({ length: 369 }, (_, i) => item(`td-${i}`, { day: (i % 28) + 1 }));
    const youtubeAssigned = Array.from({ length: 300 }, (_, i) => item(`yt-${i}`, { day: (i % 28) + 1 }));
    const youtubeNew = Array.from({ length: 10 }, (_, i) => item(`yt-new-${i}`, { day: (i % 28) + 1 }));
    const youtube = [...youtubeAssigned, ...youtubeNew];
    const assignedIds = [...todoist.map((r) => r.id), ...youtubeAssigned.map((r) => r.id)];

    const supabase = makeSupabase({ todoist, youtube, assignedIds });
    const result = await loadNewIntakeItems(supabase, { limit: 500 });

    expect(result.map((r) => r.id).sort()).toEqual(youtubeNew.map((r) => r.id).sort());
  });

  it('excludes chairman_intent=reference and unreviewed (null) rows', async () => {
    const youtube = [
      item('yt-idea', { day: 1, intent: 'idea' }),
      item('yt-ref', { day: 2, intent: 'reference' }),
      item('yt-unreviewed', { day: 3, intent: null }),
    ];
    const supabase = makeSupabase({ youtube });
    const result = await loadNewIntakeItems(supabase, { limit: 500 });
    expect(result.map((r) => r.id)).toEqual(['yt-idea']);
  });

  it('is idempotent across repeated calls on the same fixture', async () => {
    const youtube = [item('yt-a', { day: 1 }), item('yt-b', { day: 2 })];
    const supabase = makeSupabase({ youtube });
    const first = await loadNewIntakeItems(supabase, { limit: 500 });
    const second = await loadNewIntakeItems(supabase, { limit: 500 });
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it('returns newest-first, respecting the caller limit', async () => {
    const youtube = [item('yt-old', { day: 1 }), item('yt-new', { day: 2 })];
    const supabase = makeSupabase({ youtube });
    const result = await loadNewIntakeItems(supabase, { limit: 1 });
    expect(result.map((r) => r.id)).toEqual(['yt-new']);
  });
});
