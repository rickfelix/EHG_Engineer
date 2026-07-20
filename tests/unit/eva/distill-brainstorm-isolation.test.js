/**
 * SD-LEO-INFRA-BRAINSTORM-DISTILLATION-PIPELINE-001-D — observability + bounded scale-up + isolation.
 * FR-1 dispositionCoverage probe, FR-2 <=50 batch clamp, FR-3 dry-run/apply isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the distiller core + queue writer so run() is testable without a live DB / LLM.
vi.mock('../../../lib/integrations/distill-brainstorm.js', () => ({
  distillItem: vi.fn(async () => ({ payload: { title: 'x', sd_type: 'infrastructure', confidence_tier: 'low' }, method: 'keyword' })),
  toQueueCandidate: vi.fn((payload, id, score) => ({ payload, id, score })),
}));
vi.mock('../../../lib/eva/consultant/distillation-queue-writer.js', () => ({
  enqueueDistilledCandidate: vi.fn(async () => ({ ok: true })),
}));

import { run, loadTopWaveItems, clampBatch, MAX_BATCH, dispositionCoverage } from '../../../scripts/eva-distill-brainstorm.js';
import { enqueueDistilledCandidate } from '../../../lib/eva/consultant/distillation-queue-writer.js';

// Mock supabase: loadTopWaveItems (.from().select().not().order().range()) — SD-LEO-INFRA-COUNT-
// TRUNCATION-DISCIPLINE-001 FR-6 batch 9: loadTopWaveItems now routes through fetchAllPaginated,
// whose terminal call is .range() — + enrichWaveItem (.from().select().eq().maybeSingle()).
function mockSupabase(waveItemCount) {
  const items = Array.from({ length: waveItemCount }, (_, i) => ({
    id: `wi-${i}`, wave_id: 'w', source_type: 'todoist', source_id: `s-${i}`,
    title: `item ${i}`, metadata: { refine_composite_score: 1 - i / 1000 }, item_disposition: 'pending',
  }));
  return {
    from(_table) {
      return {
        select() {
          const chain = {
            not() { return chain; },
            order() { return chain; },
            range: async () => ({ data: items, error: null }),
            eq() { return { maybeSingle: async () => ({ data: null }) }; },
          };
          return chain;
        },
      };
    },
  };
}

describe('SD-...-001-D: distiller observability + bounds + isolation', () => {
  beforeEach(() => { enqueueDistilledCandidate.mockClear(); });

  it('FR-2: clampBatch coerces into [1, MAX_BATCH] with NaN -> default 20', () => {
    expect(MAX_BATCH).toBe(50);
    expect(clampBatch(100)).toBe(50);
    expect(clampBatch(50)).toBe(50);
    expect(clampBatch(20)).toBe(20);
    expect(clampBatch(1)).toBe(1);
    expect(clampBatch(0)).toBe(20);   // 0 is falsy -> treated as unset -> default 20
    expect(clampBatch(-5)).toBe(1);   // -5 truthy -> floored to 1
    expect(clampBatch(NaN)).toBe(20);
    expect(clampBatch(undefined)).toBe(20);
    expect(clampBatch('abc')).toBe(20);
  });

  it('FR-2: loadTopWaveItems caps at MAX_BATCH even when topN exceeds it', async () => {
    const sb = mockSupabase(120);
    expect((await loadTopWaveItems(sb, 100)).length).toBe(50);
    expect((await loadTopWaveItems(sb, 10)).length).toBe(10);
  });

  it('FR-3: run({apply:false}) performs ZERO enqueue calls (dry-run never writes)', async () => {
    const sb = mockSupabase(5);
    const results = await run({ supabase: sb, apply: false, topN: 5 });
    expect(results.length).toBe(5);
    expect(results.every(r => r.enqueued === false)).toBe(true);
    expect(enqueueDistilledCandidate).toHaveBeenCalledTimes(0);
  });

  it('FR-3: run({apply:true}) enqueues one candidate per item', async () => {
    const sb = mockSupabase(4);
    const results = await run({ supabase: sb, apply: true, topN: 4 });
    expect(results.every(r => r.enqueued === true)).toBe(true);
    expect(enqueueDistilledCandidate).toHaveBeenCalledTimes(4);
  });

  it('FR-2+FR-3: run({topN:100}) processes at most 50 (clamp via loadTopWaveItems)', async () => {
    const sb = mockSupabase(120);
    const results = await run({ supabase: sb, apply: false, topN: 100 });
    expect(results.length).toBe(50);
  });

  it('FR-1: dispositionCoverage = (item_disposition <> pending) / total', async () => {
    // count probe mock: head/count select; .neq() narrows the numerator
    const sb = {
      from() {
        let neq = false;
        const chain = {
          select() { return chain; },
          neq() { neq = true; return chain; },
          then(resolve) { resolve({ count: neq ? 33 : 741, error: null }); },
        };
        return chain;
      },
    };
    const cov = await dispositionCoverage(sb);
    expect(cov.denominator).toBe(741);
    expect(cov.numerator).toBe(33);
    expect(cov.value).toBeCloseTo(33 / 741, 5);
    expect(cov.status).toBe('ok');
  });

  it('FR-1: dispositionCoverage returns status=unknown on empty corpus', async () => {
    const sb = { from() { const c = { select() { return c; }, neq() { return c; }, then(r) { r({ count: 0, error: null }); } }; return c; } };
    const cov = await dispositionCoverage(sb);
    expect(cov.status).toBe('unknown');
    expect(cov.value).toBe(null);
  });
});
