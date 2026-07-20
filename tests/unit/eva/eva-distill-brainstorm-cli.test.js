/**
 * Unit tests for the distiller CLI run() — dry-run no-write guarantee + apply mapping.
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-C (FR-2/FR-3/FR-4).
 */
import { describe, it, expect } from 'vitest';
import { run, loadTopWaveItems } from '../../../scripts/eva-distill-brainstorm.js';

const WAVE_ROWS = [
  { id: 'w-low', source_type: 'todoist', source_id: 's-low', title: null, metadata: { refine_composite_score: 40 }, item_disposition: 'pending' },
  { id: 'w-high', source_type: 'todoist', source_id: 's-high', title: null, metadata: { refine_composite_score: 90 }, item_disposition: 'pending' },
  { id: 'w-mid', source_type: 'youtube', source_id: 's-mid', title: null, metadata: { refine_composite_score: 70 }, item_disposition: 'pending' },
];

const INTAKE = {
  's-high': { title: 'High idea', description: 'do high', target_application: 'ehg_engineer', target_aspects: [], chairman_intent: 'idea' },
  's-mid': { title: 'Mid idea', description: 'do mid', target_application: 'ehg_app', target_aspects: [], chairman_intent: 'value' },
  's-low': { title: 'Low idea', description: 'do low', target_application: '', target_aspects: [], chairman_intent: 'question' },
};

function makeFakeSupabase() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      if (table === 'roadmap_wave_items') {
        // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: loadTopWaveItems now routes
        // through fetchAllPaginated, whose terminal call is .range() (not the implicit await
        // formerly used via .not()) — chain order()/range() to resolve the same fixture rows.
        return {
          select() {
            const chain = {
              not() { return chain; },
              order() { return chain; },
              range: () => Promise.resolve({ data: WAVE_ROWS, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === 'eva_todoist_intake' || table === 'eva_youtube_intake') {
        return {
          select() {
            return {
              eq(_col, id) {
                return { async maybeSingle() { return { data: INTAKE[id] || null, error: null }; } };
              },
            };
          },
        };
      }
      if (table === 'eva_consultant_recommendations') {
        return {
          insert(row) {
            inserts.push(row);
            return { select() { return { async single() { return { data: { id: 'rec-x', ...row }, error: null }; } }; } };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// Force the keyword path deterministically (no live LLM): inline-only stub client.
const STUB = { isInlineOnly: true, async complete() { return ''; } };

describe('loadTopWaveItems', () => {
  it('orders by refine_composite_score DESC and applies topN', async () => {
    const sb = makeFakeSupabase();
    const top2 = await loadTopWaveItems(sb, 2);
    expect(top2.map((r) => r.id)).toEqual(['w-high', 'w-mid']);
  });
});

describe('run (dry-run default)', () => {
  it('performs ZERO DB writes in dry-run', async () => {
    const sb = makeFakeSupabase();
    const results = await run({ supabase: sb, apply: false, client: STUB });
    expect(sb.inserts.length).toBe(0);
    expect(results.length).toBe(3);
    expect(results.every((r) => r.enqueued === false)).toBe(true);
    expect(results[0].id !== undefined || results[0].wave_item_id !== undefined).toBe(true);
  });
});

describe('run (--apply)', () => {
  it('enqueues each distilled candidate via the writer with correct mapping', async () => {
    const sb = makeFakeSupabase();
    const results = await run({ supabase: sb, apply: true, client: STUB });
    expect(sb.inserts.length).toBe(3);
    expect(results.every((r) => r.enqueued === true)).toBe(true);
    // mapping: writer row carries source_wave_item_id + distilled_sd_payload
    const highInsert = sb.inserts.find((i) => i.source_wave_item_id === 'w-high');
    expect(highInsert).toBeTruthy();
    expect(highInsert.distilled_sd_payload).toBeTruthy();
    expect(highInsert.status).toBe('pending');
  });
});
