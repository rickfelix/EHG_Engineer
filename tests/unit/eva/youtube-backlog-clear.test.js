/**
 * SD-LEO-INFRA-DISTILL-YT-REVIEW-GAP-AND-BACKLOG-CLEAR-001 — unit tests.
 * FR-2 pure planning (deriveLane / planBacklogClear) + FR-1 review-gap query (getUnreviewedYoutubeItems).
 */
import { describe, it, expect, vi } from 'vitest';
import { deriveLane, planBacklogClear } from '../../../lib/eva/youtube-backlog-clear.js';

describe('deriveLane — auto-route by existing AI chairman_intent (FR-2)', () => {
  it('reference/insight -> reference lane (excluded from wave clustering)', () => {
    expect(deriveLane('reference')).toBe('reference');
    expect(deriveLane('insight')).toBe('reference');
    expect(deriveLane('INSIGHT')).toBe('reference'); // case-insensitive
  });
  it('idea -> wave lane', () => {
    expect(deriveLane('idea')).toBe('wave');
  });
  it('null / non-routable intent -> null (caller skips, never mis-lanes)', () => {
    expect(deriveLane(null)).toBeNull();
    expect(deriveLane(undefined)).toBeNull();
    expect(deriveLane('question')).toBeNull();
    expect(deriveLane('value')).toBeNull();
  });
});

describe('planBacklogClear — split route/skip/move (FR-2/FR-3)', () => {
  const rows = [
    { id: 'r1', chairman_intent: 'reference', processed_at: null, youtube_playlist_item_id: 'pli-1' }, // route+move
    { id: 'r2', chairman_intent: 'idea', processed_at: null, youtube_playlist_item_id: 'pli-2' },      // route+move
    { id: 'r3', chairman_intent: 'insight', processed_at: '2026-06-20T00:00:00Z', youtube_playlist_item_id: 'pli-3' }, // route, already moved
    { id: 'r4', chairman_intent: 'question', processed_at: null, youtube_playlist_item_id: 'pli-4' },  // skip (non-routable)
    { id: 'r5', chairman_intent: null, processed_at: null, youtube_playlist_item_id: 'pli-5' },        // skip (null)
    { id: 'r6', chairman_intent: 'idea', processed_at: null, youtube_playlist_item_id: null },         // route, but not movable (no pli id)
  ];

  it('routes routable intents, skips the rest, and only moves unprocessed rows with a playlist-item id', () => {
    const plan = planBacklogClear(rows);
    expect(plan.total).toBe(6);
    expect(plan.toRoute.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r6']);
    expect(plan.toSkip.map((r) => r.id).sort()).toEqual(['r4', 'r5']);
    // r3 already processed; r6 has no playlist-item id -> only r1, r2 physically move
    expect(plan.toMove.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    expect(plan.byLane).toEqual({ reference: 2, wave: 2 }); // reference(r1)+insight(r3)=2 ; idea(r2,r6)=2
  });

  it('reports skip reasons distinctly (null vs non-routable intent)', () => {
    const plan = planBacklogClear(rows);
    expect(plan.skipReasons['null_intent']).toBe(1);
    expect(plan.skipReasons['non_routable_intent:question']).toBe(1);
  });

  it('handles empty / non-array input', () => {
    expect(planBacklogClear([]).total).toBe(0);
    expect(planBacklogClear(undefined).toRoute).toHaveLength(0);
  });
});

describe('getUnreviewedYoutubeItems — FR-1 review-gap query', () => {
  it('queries eva_youtube_intake (classified+unreviewed) and tags rows with _source', async () => {
    const calls = { table: null, filters: [] };
    const builder = {
      select() { return builder; },
      not(col, op, val) { calls.filters.push(['not', col, op, val]); return builder; },
      is(col, val) { calls.filters.push(['is', col, val]); return builder; },
      // FR-6 batch 9: getUnreviewedYoutubeItems now reads via fetchAllPaginated, which
      // chains .order() (chronological, then unique tiebreaker) before .range().
      order() { return builder; },
      range() { return Promise.resolve({ data: [{ id: 'yt1', title: 'A', youtube_video_id: 'vid' }], error: null }); },
    };
    vi.resetModules();
    vi.doMock('../../../lib/supabase-client.js', () => ({
      createSupabaseServiceClient: () => ({ from: (t) => { calls.table = t; return builder; } }),
    }));
    const mod = await import('../../../scripts/eva/chairman-intake-review.js');
    const rows = await mod.getUnreviewedYoutubeItems();
    expect(calls.table).toBe('eva_youtube_intake');
    expect(calls.filters).toContainEqual(['not', 'classified_at', 'is', null]);
    expect(calls.filters).toContainEqual(['is', 'chairman_reviewed_at', null]);
    expect(rows[0]._source).toBe('eva_youtube_intake');
    vi.doUnmock('../../../lib/supabase-client.js');
  });
});
