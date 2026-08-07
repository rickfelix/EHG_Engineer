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

  // SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-3: dispositionCoverage is now scoped to
  // the canonical roadmap, so this mock models strategic_roadmaps/roadmap_waves and APPLIES the
  // operators it receives.
  //
  // The previous mock was table-blind — it returned {count: neq ? 33 : 741} for EVERY query
  // regardless of table or filter — so a correctly-scoped implementation reproduced 33/741
  // exactly. It could not distinguish a scoped read from an unscoped one, which is precisely
  // the defect under test. Counts here are derived from rows, so the numbers mean something.
  function coverageDb({ items, waves, roadmaps } = {}) {
    const src = {
      strategic_roadmaps: roadmaps ?? [{ id: 'rm-canon', status: 'active' }],
      roadmap_waves: waves ?? [{ id: 'w-canon', roadmap_id: 'rm-canon' }],
      roadmap_wave_items: items ?? [],
    };
    return {
      from(table) {
        let rows = [...(src[table] || [])];
        let counting = false;
        const c = {
          select(_col, opts) { counting = Boolean(opts?.count); return c; },
          eq(k, v) { rows = rows.filter((r) => r[k] === v); return c; },
          in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return c; },
          neq(k, v) { rows = rows.filter((r) => r[k] !== v); return c; },
          then(resolve) { resolve(counting ? { count: rows.length, error: null } : { data: rows, error: null }); },
        };
        return c;
      },
    };
  }

  const mkItems = (waveId, total, nonPending) =>
    Array.from({ length: total }, (_, i) => ({
      id: `${waveId}-${i}`, wave_id: waveId, item_disposition: i < nonPending ? 'promoted' : 'pending',
    }));

  it('FR-1: dispositionCoverage = (item_disposition <> pending) / total, scoped to the canonical roadmap', async () => {
    const cov = await dispositionCoverage(coverageDb({ items: mkItems('w-canon', 741, 33) }));
    expect(cov.denominator).toBe(741);
    expect(cov.numerator).toBe(33);
    expect(cov.value).toBeCloseTo(33 / 741, 5);
    expect(cov.status).toBe('ok');
  });

  it('FR-1: items under an ARCHIVED roadmap are excluded from BOTH numerator and denominator', async () => {
    // The regression this SD exists to prevent. Measured live 2026-07-29 before the fix:
    // 95/1864 = 5.1% unscoped versus 20/261 = 7.7% scoped. Note the orphans here are NOT all
    // pending — 60 of them are dispositioned — because the real archived corpus is not either,
    // so a denominator-only fix must fail this too.
    const cov = await dispositionCoverage(coverageDb({
      roadmaps: [{ id: 'rm-canon', status: 'active' }, { id: 'rm-old', status: 'archived' }],
      waves: [{ id: 'w-canon', roadmap_id: 'rm-canon' }, { id: 'w-orphan', roadmap_id: 'rm-old' }],
      items: [...mkItems('w-canon', 741, 33), ...mkItems('w-orphan', 1100, 60)],
    }));
    expect(cov.denominator).toBe(741);
    expect(cov.numerator).toBe(33);
  });

  it('FR-1: dispositionCoverage returns status=unknown on empty corpus', async () => {
    const cov = await dispositionCoverage(coverageDb({ items: [] }));
    expect(cov.status).toBe('unknown');
    expect(cov.value).toBe(null);
  });

  it('FR-1: no active roadmap and ambiguity are distinct from an empty corpus', async () => {
    const none = await dispositionCoverage(coverageDb({ roadmaps: [] }));
    expect(none.status).toBe('unknown');
    expect(none.detail).toMatch(/no active roadmap/);

    const ambiguous = await dispositionCoverage(coverageDb({
      roadmaps: [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }],
    }));
    expect(ambiguous.status).toBe('unknown');
    expect(ambiguous.detail).toMatch(/ambiguous/i);
    expect(ambiguous.detail).not.toMatch(/empty corpus/);
  });
});
