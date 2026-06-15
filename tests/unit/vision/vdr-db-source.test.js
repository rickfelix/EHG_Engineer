// SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-4) — DB vision-source path for the VDR gauge.
// Hermetic: no live DB. Proves computeBuildGauge can source the active-vision V1 criteria from the
// re-anchorable ladder pointer (vision_ladder_rungs/vision_ladder_criteria) instead of EHG-VISION.md,
// that the probe/denominator math is UNCHANGED, and that the gauge stays HONEST/fail-soft on any
// DB read failure (could-not-measure != 0%, never a false 0%).
import { describe, it, expect } from 'vitest';
import {
  computeBuildGauge,
  dbVisionSource,
  VDR_REGISTRY,
} from '../../../lib/vision/vdr-registry.js';

const V1_LABELS = VDR_REGISTRY.map((e) => e.capability);

// A supabase stub that serves BOTH the ladder tables (FR-4 denominator source) and the probe tables.
// ladderCriteria: rows for the active rung; pass null to simulate "no criteria". rungMissing/rungErr/
// critErr simulate the fail-soft branches. countByTable/krRows drive the typed probes.
function stubLadderSupabase({
  ladderCriteria = V1_LABELS.map((capability, i) => ({ capability, today: `today ${i}`, required: `req ${i}`, ordinal: i + 1 })),
  rungMissing = false,
  rungErr = null,
  critErr = null,
  countByTable = {},
  krRows = {},
} = {}) {
  return {
    from(table) {
      const ctx = { table, filters: {} };
      const chain = {
        select() { return chain; },
        eq(k, v) { ctx.filters[k] = v; return chain; },
        order() { return chain; },
        maybeSingle() {
          if (table === 'vision_ladder_rungs') {
            if (rungErr) return Promise.resolve({ data: null, error: { message: rungErr } });
            if (rungMissing) return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: { id: 'rung-v1', rung_key: 'V1', vision_key: 'VISION-EHG-L1-001' }, error: null });
          }
          // probe kr_status maybeSingle
          return Promise.resolve({ data: krRows[ctx.filters.code] || null, error: null });
        },
        then(res, rej) {
          if (table === 'vision_ladder_criteria') {
            if (critErr) return Promise.resolve({ data: null, error: { message: critErr } }).then(res, rej);
            return Promise.resolve({ data: ladderCriteria, error: null }).then(res, rej);
          }
          // probe db_count head/count queries
          return Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('dbVisionSource (FR-4) — reads active rung criteria from the ladder pointer', () => {
  it('yields { capability, today, required } rows for the active rung', async () => {
    const rows = await dbVisionSource({ supabase: stubLadderSupabase() });
    expect(rows).toHaveLength(V1_LABELS.length);
    expect(rows[0]).toMatchObject({ capability: V1_LABELS[0], today: 'today 0', required: 'req 0' });
    expect(rows.map((r) => r.capability)).toEqual(V1_LABELS); // labels match VDR_REGISTRY exactly (coherence)
  });
  it('throws (→ fail-soft upstream) when there is no active rung', async () => {
    await expect(dbVisionSource({ supabase: stubLadderSupabase({ rungMissing: true }) })).rejects.toThrow(/no active vision rung/);
  });
  it('throws when the active rung has no criteria', async () => {
    await expect(dbVisionSource({ supabase: stubLadderSupabase({ ladderCriteria: [] }) })).rejects.toThrow(/no criteria/);
  });
  it('throws when there is no supabase client', async () => {
    await expect(dbVisionSource({})).rejects.toThrow(/no supabase/);
  });
});

describe('computeBuildGauge visionSource=true (FR-4) — DB denominator, unchanged probe math', () => {
  it('computes the gauge from the DB source with the SAME 4-state/unknowns-excluded math', async () => {
    // Same probe inputs as the markdown-source test: 6 DB-backed probeable, 5 code_grep unknown.
    const io = {
      supabase: stubLadderSupabase({
        countByTable: { agent_messages: 2, pattern_occurrences: 0, key_results: 1 },
        krRows: {
          'KR-2026-07-04': { status: 'achieved', current_value: 1, target_value: 1 },
          'KR-2026-07-05': { status: 'pending', current_value: 0, target_value: 1 },
          'KR-2026-07-02': { status: 'pending', current_value: 45, target_value: 90 },
        },
      }),
    };
    const g = await computeBuildGauge({ io, visionSource: true });
    expect(g.available).toBe(true);
    expect(g.coherence.ok).toBe(true); // DB labels match VDR_REGISTRY → no drift
    expect(g.total_capabilities).toBe(VDR_REGISTRY.length);
    // 9 unknown = 5 original code_grep + 4 SD-LEO-INFRA-V1-AUTOMATION-PROBES-001 automation/intelligence
    // code_grep probes (ordinals 17-20), all 'unknown' here (no grep seam in this stub) — excluded.
    expect(g.unknown_count).toBe(9);
    expect(g.denominator).toBe(6);
    expect(g.overall_pct).toBe(33); // identical to the markdown-source path
    expect(g.measured_at_note).toMatch(/DB vision source/);
  });

  it('HONEST: a DB read error → available:false, overall_pct=null (NOT a false 0%)', async () => {
    const g = await computeBuildGauge({ io: { supabase: stubLadderSupabase({ rungErr: 'connection reset' }) }, visionSource: true });
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
    expect(g.measured_at_note).toMatch(/withheld|unavailable/i);
    expect(g.measured_at_note).not.toMatch(/\b0%\b/); // never asserts a 0% when it could not measure
  });

  it('HONEST: no active rung → available:false, never 0%', async () => {
    const g = await computeBuildGauge({ io: { supabase: stubLadderSupabase({ rungMissing: true }) }, visionSource: true });
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
  });

  it('accepts a custom async visionSource fn (injection seam)', async () => {
    const customSource = async () => V1_LABELS.map((capability) => ({ capability, today: 't', required: 'r' }));
    const g = await computeBuildGauge({ io: {}, visionSource: customSource });
    // io has no supabase/grep ⇒ every probe unknown ⇒ HONEST unavailable, but the DENOMINATOR was sourced.
    expect(g.total_capabilities).toBe(V1_LABELS.length);
    expect(g.available).toBe(false); // all-unknown, not a false 0%
    expect(g.overall_pct).toBeNull();
  });
});

describe('computeBuildGauge — markdown path preserved as fallback (FR-4 regression guard)', () => {
  it('still fails soft on a missing markdown file when no visionSource is given', async () => {
    const g = await computeBuildGauge({ io: {}, visionPath: '/no/such/EHG-VISION.md' });
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
    expect(g.measured_at_note).toMatch(/unavailable/i);
  });
});
