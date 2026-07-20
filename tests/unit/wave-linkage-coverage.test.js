/**
 * Unit tests for wave-linkage coverage (QF-20260711-045 — fold-seam PRD rider).
 * Criterion: >=80% of claimable leaf SDs wave-linked, else NAMED starvation.
 */

import { describe, it, expect } from 'vitest';
import { computeWaveLinkageCoverage, COVERAGE_THRESHOLD } from '../../lib/roadmap/wave-linkage-coverage.js';

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: computeWaveLinkageCoverage
// now paginates via fetchAllPaginated, so .not(...) must return a chainable builder
// (.order() returns itself, .range() resolves the single page) rather than a bare Promise.
function mockSupabase({ sds, items }) {
  function terminal(data) {
    const builder = {
      order: () => builder,
      range: async () => ({ data, error: null }),
    };
    return builder;
  }
  return {
    from: (table) => ({
      strategic_directives_v2: {
        select: () => ({ not: () => terminal(sds) }),
      },
      roadmap_wave_items: {
        select: () => ({ not: () => terminal(items) }),
      },
    })[table],
  };
}

const sd = (over) => ({ id: over.id, sd_key: over.key, sd_type: over.type ?? 'infrastructure', status: 'draft', parent_sd_id: over.parent ?? null, metadata: over.meta ?? {} });

describe('computeWaveLinkageCoverage', () => {
  it('counts direct promoted_to_sd_key linkage and metadata.wave_disposition linkage', async () => {
    const supabase = mockSupabase({
      sds: [
        sd({ id: '1', key: 'SD-A' }),                                        // linked via promotion
        sd({ id: '2', key: 'SD-B', meta: { wave_disposition: { kind: 'wave' } } }), // linked via metadata
        sd({ id: '3', key: 'SD-C' }),                                        // unlinked
      ],
      items: [{ promoted_to_sd_key: 'SD-A' }],
    });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.total).toBe(3);
    expect(r.linked).toBe(2);
    expect(r.coverage).toBeCloseTo(2 / 3);
    expect(r.starved).toBe(true); // 66% < 80%
    expect(r.unlinkedKeys).toEqual(['SD-C']);
  });

  it('a leaf inherits linkage through its dispositioned orchestrator parent', async () => {
    const supabase = mockSupabase({
      sds: [
        sd({ id: 'p', key: 'SD-ORCH', type: 'orchestrator', meta: { wave_disposition: { kind: 'wave' } } }),
        sd({ id: 'c1', key: 'SD-ORCH-A', parent: 'p' }),
      ],
      items: [],
    });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.total).toBe(1); // orchestrator parent is not a leaf
    expect(r.linked).toBe(1);
    expect(r.starved).toBe(false);
  });

  it('zero claimable leaves is vacuous (coverage null), never starvation', async () => {
    const supabase = mockSupabase({ sds: [], items: [] });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.coverage).toBeNull();
    expect(r.starved).toBe(false);
  });

  it('threshold boundary: exactly 80% is NOT starved', async () => {
    const sds = [1, 2, 3, 4].map((i) => sd({ id: String(i), key: `SD-L${i}` }));
    sds.push(sd({ id: '5', key: 'SD-L5' }));
    const items = [1, 2, 3, 4].map((i) => ({ promoted_to_sd_key: `SD-L${i}` }));
    const r = await computeWaveLinkageCoverage(mockSupabase({ sds, items }));
    expect(r.coverage).toBe(COVERAGE_THRESHOLD);
    expect(r.starved).toBe(false);
  });

  it('excludes test-fixture SDs from the denominator (never claimable — must not fabricate starvation)', async () => {
    const supabase = mockSupabase({
      sds: [
        sd({ id: '1', key: 'SD-A' }),                       // real, linked
        sd({ id: '2', key: 'SD-DEMO-XYZ-001' }),            // fixture — excluded
        sd({ id: '3', key: 'SD-TEST-SCOPE-COV-123' }),      // fixture — excluded
        sd({ id: '4', key: 'TEST-BARE-001' }),              // bare fixture prefix — excluded
        sd({ id: '5', key: 'SD-UAT-FIX-TEST-E2E-99-001' }), // UAT e2e fixture — excluded
      ],
      items: [{ promoted_to_sd_key: 'SD-A' }],
    });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.total).toBe(1);
    expect(r.linked).toBe(1);
    expect(r.coverage).toBe(1);
    expect(r.starved).toBe(false);
    expect(r.unlinkedKeys).toEqual([]);
  });
});
