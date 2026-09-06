/**
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-D FR-4 — lib/priority/alignment.js.
 * Fixture pattern reused from tests/unit/wave-linkage-coverage.test.js's local mockSupabase
 * (that helper is file-local, not exported, so it is replicated here rather than imported).
 */
import { describe, it, expect } from 'vitest';
import { readWaveLinkAlignment, computeAlignmentCoverage, UNSCORED } from '../../../lib/priority/alignment.js';
import { computeWaveLinkageCoverage } from '../../../lib/roadmap/wave-linkage-coverage.js';

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

const sd = (over) => ({
  id: over.id, sd_key: over.key, sd_type: over.type ?? 'infrastructure', status: 'draft',
  parent_sd_id: over.parent ?? null, metadata: over.meta ?? {},
});

describe('TS-7 — readWaveLinkAlignment reads UNSCORED, never a fabricated score', () => {
  it('an SD with no promoted_to_sd_key, no wave_disposition and an unlinked/absent parent returns UNSCORED', () => {
    const noLinkSd = { sd_key: 'SD-C', parent_sd_id: null, metadata: {} };
    const result = readWaveLinkAlignment(noLinkSd, { promotedKeys: new Set(), byId: new Map() });
    expect(result.alignment).toBe(UNSCORED);
    expect(result.via).toBeNull();
    expect(result.source).toBeNull();
    expect(typeof result.alignment).toBe('string');
    expect(result.alignment).not.toBe(0);
  });

  it('an unlinked parent does not falsely link the child', () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT', metadata: {} };
    const child = { sd_key: 'SD-CHILD', parent_sd_id: 'p1', metadata: {} };
    const byId = new Map([['p1', parent]]);
    const result = readWaveLinkAlignment(child, { promotedKeys: new Set(), byId });
    expect(result.alignment).toBe(UNSCORED);
  });
});

describe('TS-8 — alignment via orchestrator parent', () => {
  it('a leaf whose parent is directly promoted resolves to linked via parent', () => {
    const parent = { id: 'p1', sd_key: 'SD-PARENT', metadata: {} };
    const child = { sd_key: 'SD-CHILD', parent_sd_id: 'p1', metadata: {} };
    const byId = new Map([['p1', parent]]);
    const result = readWaveLinkAlignment(child, { promotedKeys: new Set(['SD-PARENT']), byId });
    expect(result).toEqual({ alignment: 1, via: 'parent', source: 'promoted_to_sd_key' });
  });

  it('direct promoted_to_sd_key linkage wins without needing a parent lookup', () => {
    const result = readWaveLinkAlignment({ sd_key: 'SD-A', metadata: {} }, { promotedKeys: new Set(['SD-A']) });
    expect(result).toEqual({ alignment: 1, via: 'direct', source: 'promoted_to_sd_key' });
  });

  it('metadata.wave_disposition alone links directly, named as its own source', () => {
    const result = readWaveLinkAlignment(
      { sd_key: 'SD-B', metadata: { wave_disposition: { kind: 'wave' } } },
      { promotedKeys: new Set() },
    );
    expect(result).toEqual({ alignment: 1, via: 'direct', source: 'wave_disposition' });
  });
});

describe('TS-9 — coverage wrapper agrees with the existing gauge and adds the strict figure', () => {
  it('coverage matches computeWaveLinkageCoverage; strict_promoted_only.linked is one less when only wave_disposition-linked', async () => {
    const fixture = {
      sds: [
        sd({ id: '1', key: 'SD-A' }),                                              // linked: direct promotion
        sd({ id: '2', key: 'SD-B', meta: { wave_disposition: { kind: 'wave' } } }), // linked: wave_disposition ONLY
        sd({ id: '3', key: 'SD-C' }),                                              // unlinked
      ],
      items: [{ promoted_to_sd_key: 'SD-A' }],
    };
    const broad = await computeWaveLinkageCoverage(mockSupabase(fixture));
    const result = await computeAlignmentCoverage(mockSupabase(fixture));

    expect(result.status).toBe('measured');
    expect(result.coverage).toBe(broad.coverage);
    expect(result.linked).toBe(broad.linked);
    expect(result.strict_promoted_only.linked).toBe(broad.linked - 1);
    expect(result.strict_promoted_only.total).toBe(broad.total);
    expect(result.strict_promoted_only.coverage).toBeLessThanOrEqual(result.coverage);
  });

  it('zero claimable leaves reports unmeasurable_until_linkage without throwing', async () => {
    const result = await computeAlignmentCoverage(mockSupabase({ sds: [] }));
    expect(result.status).toBe('unmeasurable_until_linkage');
    expect(result.coverage).toBeNull();
  });
});

describe('TS-10 — coverage wrapper names the no-roadmap state instead of throwing', () => {
  it('resolves (never rejects) to status no_canonical_roadmap when no active roadmap exists', async () => {
    const supabase = mockSupabase({ roadmaps: [], waves: [], sds: [sd({ id: '1', key: 'SD-A' })], items: [] });
    await expect(computeAlignmentCoverage(supabase)).resolves.toEqual(
      expect.objectContaining({ status: 'no_canonical_roadmap', coverage: null }),
    );
  });
});
