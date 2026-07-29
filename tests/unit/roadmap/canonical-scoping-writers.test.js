/**
 * SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 — coverage for FR-4b and FR-8.
 *
 * *** WHY THIS FILE EXISTS: THE EXEC ADVERSARIAL REVIEW MUTATION-TESTED MY WORK AND SIX
 * MUTATIONS SURVIVED. *** Three of the seven shipped FRs could be deleted outright without a
 * single test failing — FR-4b (the .in() scope AND the fail-closed branch), FR-5, and FR-8 (the
 * .eq(roadmap_id) AND the scopeNote gate). That is precisely the cannot-fail-test defect this SD
 * spent its whole life hunting in other people's code, sitting in mine.
 *
 * Each test below is written against a specific surviving mutation, named in its comment, so the
 * mutation now has something to kill.
 *
 * FR-5 is NOT covered here and I am not pretending otherwise: its guard is inline in
 * roadmap-generate.js main(), which self-invokes at module load, so it cannot be imported without
 * executing. It is verified only by live CLI runs. Extracting it to a pure predicate is the
 * honest fix and is recorded as a follow-up rather than quietly skipped.
 */
import { describe, it, expect } from 'vitest';
import { resolveCanonicalWaveIds } from '../../../lib/roadmap/canonical-roadmap.js';
import { runRollup } from '../../../lib/vision/rung-progress-rollup.mjs';

/** Applies the operators it receives — a recording-only double would make all of this vacuous. */
function db({ roadmaps = [{ id: 'rm-canon', status: 'active' }], waves = [], items = [] } = {}) {
  const src = { strategic_roadmaps: roadmaps, roadmap_waves: waves, roadmap_wave_items: items };
  return {
    from(table) {
      let rows = [...(src[table] || [])];
      const b = {
        select: () => b,
        eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return b; },
        in: (k, vs) => { rows = rows.filter((r) => vs.includes(r[k])); return b; },
        update: () => ({ eq: async () => ({ error: null }) }),
        then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return b;
    },
  };
}

const CANON_WAVES = [
  { id: 'w1', roadmap_id: 'rm-canon', time_horizon: 'now', okr_objective_ids: [], metadata: {}, progress_pct: null },
  { id: 'w2', roadmap_id: 'rm-canon', time_horizon: 'next', okr_objective_ids: [], metadata: {}, progress_pct: null },
];
const ORPHAN_WAVES = [
  { id: 'o1', roadmap_id: 'rm-archived', time_horizon: 'now', okr_objective_ids: [], metadata: {}, progress_pct: null },
];

describe('FR-4b: resolveCanonicalWaveIds', () => {
  it('returns the canonical roadmap wave ids only', async () => {
    // Kills the mutation that drops .eq('roadmap_id', ...) from the wave query.
    const ids = await resolveCanonicalWaveIds(db({
      roadmaps: [{ id: 'rm-canon', status: 'active' }, { id: 'rm-archived', status: 'archived' }],
      waves: [...CANON_WAVES, ...ORPHAN_WAVES],
    }));
    expect(ids.sort()).toEqual(['w1', 'w2']);
    expect(ids).not.toContain('o1');
  });

  it('returns NULL, not [], when no roadmap is active', async () => {
    // The distinction the 12-line comment calls load-bearing, now asserted directly rather than
    // inferred from one downstream assertion. `[]` fed to .in('wave_id', []) matches nothing and
    // reads as "no items" — indistinguishable from a genuinely empty roadmap.
    const ids = await resolveCanonicalWaveIds(db({ roadmaps: [], waves: CANON_WAVES }));
    expect(ids).toBeNull();
    expect(ids).not.toEqual([]);
  });

  it('propagates the ambiguity throw rather than picking one', async () => {
    await expect(resolveCanonicalWaveIds(db({
      roadmaps: [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }],
    }))).rejects.toThrow(/ambiguous|expected exactly 1/i);
  });

  it('returns an empty array for an active roadmap that genuinely has no waves', async () => {
    // Distinct from the null case above — this roadmap resolved fine, it just has nothing yet.
    const ids = await resolveCanonicalWaveIds(db({ waves: ORPHAN_WAVES }));
    expect(ids).toEqual([]);
  });
});

describe('FR-8: rung rollup is roadmap-scoped and FAILS CLOSED', () => {
  const opts = { computeGaugeFn: async () => ({ build_pct: 50 }), apply: false, log: () => {} };

  it('rolls up only canonical waves', async () => {
    // Kills the mutation that drops .eq('roadmap_id', roadmapScope.id) from the wave select.
    const r = await runRollup({
      supabase: db({
        roadmaps: [{ id: 'rm-canon', status: 'active' }, { id: 'rm-archived', status: 'archived' }],
        waves: [...CANON_WAVES, ...ORPHAN_WAVES],
      }),
      ...opts,
    });
    expect(r.ok).toBe(true);
    expect(r.roadmapScope).toBe('rm-canon');
    expect(r.rows.map((x) => x.wave_id).sort()).toEqual(['w1', 'w2']);
    expect(r.rows.map((x) => x.wave_id)).not.toContain('o1');
  });

  it('with NO active roadmap: zero rows, zero writes, and says why', async () => {
    // Kills the mutation that drops the scopeNote gate. For a WRITER, an unresolvable scope must
    // produce no writes — writing to an unknown scope is strictly worse than not writing.
    const r = await runRollup({ supabase: db({ roadmaps: [], waves: CANON_WAVES }), ...opts, apply: true });
    expect(r.rows).toEqual([]);
    expect(r.written).toBe(0);
    expect(r.roadmapScope).toBeNull();
    expect(r.scopeNote).toBe('no-active-roadmap');
  });

  it('with an AMBIGUOUS roadmap: zero rows, zero writes, and names the ambiguity', async () => {
    const r = await runRollup({
      supabase: db({ roadmaps: [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }], waves: CANON_WAVES }),
      ...opts,
      apply: true,
    });
    expect(r.rows).toEqual([]);
    expect(r.written).toBe(0);
    expect(r.scopeNote).toMatch(/ambiguous/i);
  });

  it('scopeNote is null on the happy path — absence of a note must mean "scoped", not "unchecked"', async () => {
    const r = await runRollup({ supabase: db({ waves: CANON_WAVES }), ...opts });
    expect(r.scopeNote).toBeNull();
    expect(r.roadmapScope).toBe('rm-canon');
  });
});
