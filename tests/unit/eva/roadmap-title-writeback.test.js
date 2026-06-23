// SD-LEO-INFRA-ROADMAP-TITLE-WRITEBACK-BACKFILL-001 — FR-1 persistScores title write-back +
// FR-2 backfill dry-run. The write-back persists a NON-FALLBACK source title to the title column
// (never '(untitled)' / missing), so a promoted SD carries a human/source title.
import { describe, it, expect } from 'vitest';
import { persistScores } from '../../../scripts/eva-intake-refine.js';
import { runBackfill } from '../../../scripts/one-off/backfill-roadmap-promote-titles.js';

function mockPersistSb() {
  const updates = [];
  return {
    updates,
    from() {
      return { update(payload) { return { eq(_c, id) { updates.push({ id, payload }); return Promise.resolve({ error: null }); } }; } };
    },
  };
}

const waves = [{
  id: 'w1',
  items: [
    { id: 'i1', title: 'Real Source Title', metadata: { x: 1 } },
    { id: 'i2', title: '(untitled)', metadata: {} },
    { id: 'i3', metadata: {} }, // no title
  ],
}];
const scoringResults = [{
  wave_id: 'w1',
  method: 'claude_inline',
  item_scores: [
    { item_index: 1, composite: 80, recommendation: 'promote', persona_scores: [] },
    { item_index: 2, composite: 40, recommendation: 'defer', persona_scores: [] },
    { item_index: 3, composite: 60, recommendation: 'promote', persona_scores: [] },
  ],
}];

describe('persistScores — FR-1 title write-back', () => {
  it('includes title ONLY for a non-fallback source title; always writes metadata', async () => {
    const sb = mockPersistSb();
    const n = await persistScores(waves, scoringResults, { supabase: sb });
    expect(n).toBe(3);
    const byId = Object.fromEntries(sb.updates.map(u => [u.id, u.payload]));
    expect(byId.i1.title).toBe('Real Source Title');         // real title → written
    expect(byId.i1.metadata.refine_recommendation).toBe('promote');
    expect('title' in byId.i2).toBe(false);                  // '(untitled)' → NOT written
    expect('title' in byId.i3).toBe(false);                  // missing title → NOT written
    expect(byId.i2.metadata).toBeDefined();                  // metadata still persisted
    expect(byId.i3.metadata).toBeDefined();
  });
  it('preserves existing metadata keys when merging', async () => {
    const sb = mockPersistSb();
    await persistScores(waves, scoringResults, { supabase: sb });
    const byId = Object.fromEntries(sb.updates.map(u => [u.id, u.payload]));
    expect(byId.i1.metadata.x).toBe(1); // existing key preserved
  });
  it('handles empty/missing inputs without throwing', async () => {
    const sb = mockPersistSb();
    expect(await persistScores(undefined, undefined, { supabase: sb })).toBe(0);
  });
});

describe('runBackfill — FR-2 dry-run (no writes)', () => {
  function mockBackfillSb({ candidates, floorTitles }) {
    return {
      writes: 0,
      from(table) {
        if (table === 'roadmap_wave_items') {
          // select(...).is().is().is().eq() → resolves to the candidate rows
          const chain = { select() { return chain; }, is() { return chain; }, eq() { return chain; }, then(res) { return Promise.resolve({ data: candidates, error: null }).then(res); } };
          return chain;
        }
        // intake table: select('title').eq('id', id).maybeSingle()
        return { select() { return { eq(_c, id) { return { maybeSingle() { return Promise.resolve({ data: floorTitles[id] ? { title: floorTitles[id] } : null, error: null }); } }; } }; } };
      },
    };
  }
  it('counts titleable items via the floor title but writes nothing in dry-run', async () => {
    const candidates = [
      { id: 'a', source_type: 'todoist', source_id: 't1', item_disposition: null, metadata: {} },
      { id: 'b', source_type: 'youtube', source_id: 'y1', item_disposition: null, metadata: {} },
      { id: 'c', source_type: 'todoist', source_id: 'tX', item_disposition: null, metadata: {} }, // no floor title
      { id: 'd', source_type: 'todoist', source_id: 't2', item_disposition: 'dropped', metadata: {} }, // filtered out
    ];
    const floorTitles = { t1: 'Todoist Task A', y1: 'YouTube Idea B' };
    const sb = mockBackfillSb({ candidates, floorTitles });
    const r = await runBackfill({ supabase: sb, apply: false, log: () => {} });
    expect(r.applied).toBe(false);
    expect(r.selected).toBe(3);  // 'd' (dropped) excluded
    expect(r.titled).toBe(2);    // a + b have floor titles
    expect(r.skipped).toBe(1);   // c has no resolvable source title
  });
});
