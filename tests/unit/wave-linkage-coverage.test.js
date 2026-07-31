/**
 * Unit tests for wave-linkage coverage (QF-20260711-045 — fold-seam PRD rider).
 * Criterion: >=80% of claimable leaf SDs wave-linked, else NAMED starvation.
 */

import { describe, it, expect } from 'vitest';
import { computeWaveLinkageCoverage, COVERAGE_THRESHOLD } from '../../lib/roadmap/wave-linkage-coverage.js';

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: computeWaveLinkageCoverage
// now paginates via fetchAllPaginated, so .not(...) must return a chainable builder
// (.order() returns itself, .range() resolves the single page) rather than a bare Promise.
// SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-4/TR-6: this double now APPLIES the
// operators it receives instead of ignoring them. The previous version returned a fixed row set
// from `.not()` regardless of arguments, so the roadmap scoping added by FR-4 would have been
// invisible to it — a green suite proving nothing about the thing under test.
//
// Items default into the canonical wave, so the pre-existing tests keep their original meaning;
// a test that wants an orphan item passes an explicit wave_id.
function mockSupabase({ sds, items, roadmaps, waves } = {}) {
  const R = roadmaps ?? [{ id: 'rm-canon', status: 'active' }];
  const W = waves ?? [{ id: 'w-canon', roadmap_id: 'rm-canon' }];
  const I = (items ?? []).map((i) => ({ wave_id: 'w-canon', ...i }));
  const src = { strategic_directives_v2: sds ?? [], roadmap_wave_items: I, strategic_roadmaps: R, roadmap_waves: W };

  return {
    from(table) {
      let rows = [...(src[table] || [])];
      const b = {
        select: () => b,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return b; },
        in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return b; },
        not: (c, _op, _v) => { rows = rows.filter((r) => r[c] != null); return b; },
        order: () => b,
        range: async () => ({ data: rows, error: null }),
        then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return b;
    },
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

/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-4.
 *
 * Measured live 2026-07-29 before the fix: 114 roadmap_wave_items belonging to ARCHIVED
 * roadmaps carried promoted_to_sd_key, and 99 SD keys were counted as linked while appearing
 * in NO canonical wave item at all — 28.7% of the promoted universe.
 *
 * Those 114 links all belong to ed12bf74, a March 2026 roadmap that is NOT one of the
 * duplicates this SD cleans up. So deleting this SD's duplicate rows would not have corrected
 * this reader by a single link. That is the whole argument for fixing the predicate.
 */
describe('FR-4: linkage is scoped to the canonical roadmap', () => {
  const twoRoadmaps = {
    roadmaps: [{ id: 'rm-canon', status: 'active' }, { id: 'rm-old', status: 'archived' }],
    waves: [{ id: 'w-canon', roadmap_id: 'rm-canon' }, { id: 'w-orphan', roadmap_id: 'rm-old' }],
  };

  it('does NOT count an SD linked only from an archived roadmap', async () => {
    const supabase = mockSupabase({
      ...twoRoadmaps,
      sds: [sd({ id: '1', key: 'SD-A' }), sd({ id: '2', key: 'SD-ORPHANLINK' })],
      items: [
        { promoted_to_sd_key: 'SD-A', wave_id: 'w-canon' },
        { promoted_to_sd_key: 'SD-ORPHANLINK', wave_id: 'w-orphan' }, // archived roadmap
      ],
    });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.unlinkedKeys).toContain('SD-ORPHANLINK');
    expect(r.coverage).toBe(0.5);
  });

  it('NEGATIVE CONTROL: unscoped, both would count as linked', async () => {
    // Same fixture with the orphan item moved into the canonical wave. If this did NOT differ
    // from the case above, the fixture could not distinguish scoped from unscoped behaviour.
    const supabase = mockSupabase({
      ...twoRoadmaps,
      sds: [sd({ id: '1', key: 'SD-A' }), sd({ id: '2', key: 'SD-ORPHANLINK' })],
      items: [
        { promoted_to_sd_key: 'SD-A', wave_id: 'w-canon' },
        { promoted_to_sd_key: 'SD-ORPHANLINK', wave_id: 'w-canon' },
      ],
    });
    const r = await computeWaveLinkageCoverage(supabase);
    expect(r.coverage).toBe(1);
  });

  it('refuses rather than computing over an unscoped corpus when no roadmap is active', async () => {
    // Fail-closed: a coverage number computed over every roadmap is worse than no number,
    // because it looks exactly like a valid one.
    const supabase = mockSupabase({ roadmaps: [], waves: [], sds: [sd({ id: '1', key: 'SD-A' })], items: [] });
    await expect(computeWaveLinkageCoverage(supabase)).rejects.toThrow(/no active roadmap/);
  });
});
