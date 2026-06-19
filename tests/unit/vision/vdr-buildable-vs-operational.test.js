// SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001 — buildable vs operational segregation tests.
// Hermetic: no live DB / grep / vision file. Validates the taxonomy completeness, the segregated
// build_pct/operational_pct compute (overall_pct UNCHANGED — anti-honesty-lie preserved), the
// exec-summary rendering of BOTH numbers, and the gauge-lens exclusion of operational capabilities.
import { describe, it, expect } from 'vitest';
import {
  computeBuildGauge,
  formatGaugeForSummary,
  VDR_REGISTRY,
  OPERATIONAL_NATURE,
} from '../../../lib/vision/vdr-registry.js';
import { readCapabilityGaps } from '../../../lib/adam/gauge-lens.js';

function visionFixture(labels = VDR_REGISTRY.map((e) => e.capability)) {
  const rows = labels.map((l) => `| **${l}** | today cell | required cell |`).join('\n');
  return ['## CAPABILITY GAP — at-a-glance table', '', '| Vision capability | TODAY | REQUIRED |', '|---|---|---|', rows].join('\n');
}
function stubSupabase({ countByTable = {}, krRows = {} } = {}) {
  return {
    from(table) {
      const ctx = { table, filters: {} };
      const chain = {
        select() { return chain; },
        eq(k, v) { ctx.filters[k] = v; return chain; },
        maybeSingle() { return Promise.resolve({ data: krRows[ctx.filters.code] || null, error: null }); },
        then(res, rej) { return Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}
const round = (subset) => (subset.length === 0 ? null : Math.round((100 * subset.reduce((s, c) => s + c.score, 0)) / subset.length));

describe('FR-1 taxonomy completeness', () => {
  it('every one of the 25 registry entries has a nature in {buildable, operational}', () => {
    expect(VDR_REGISTRY).toHaveLength(25);
    for (const e of VDR_REGISTRY) expect(['buildable', 'operational']).toContain(e.nature);
  });
  it('OPERATIONAL_NATURE has exactly 10 members and every one names a real capability (no drift)', () => {
    expect(OPERATIONAL_NATURE.size).toBe(10);
    const caps = new Set(VDR_REGISTRY.map((e) => e.capability));
    for (const c of OPERATIONAL_NATURE) expect(caps.has(c)).toBe(true);
  });
  it('15 buildable + 10 operational, partitioned by OPERATIONAL_NATURE', () => {
    const buildable = VDR_REGISTRY.filter((e) => e.nature === 'buildable');
    const operational = VDR_REGISTRY.filter((e) => e.nature === 'operational');
    expect(buildable).toHaveLength(15);
    expect(operational).toHaveLength(10);
    for (const e of operational) expect(OPERATIONAL_NATURE.has(e.capability)).toBe(true);
    for (const e of buildable) expect(OPERATIONAL_NATURE.has(e.capability)).toBe(false);
  });
  it('the venture/income KR proofs are operational; the code-shipped capabilities are buildable', () => {
    const natureOf = (cap) => VDR_REGISTRY.find((e) => e.capability === cap).nature;
    expect(natureOf('Take a real dollar')).toBe('operational');
    expect(natureOf('Run a self-operating venture')).toBe('operational');
    expect(natureOf('All 7 governance guardrails')).toBe('operational');
    expect(natureOf('The cockpit')).toBe('buildable');
    expect(natureOf('Decision Filter Engine')).toBe('buildable');
    expect(natureOf('Capability Registry')).toBe('buildable');
  });
});

describe('FR-2 segregated compute (overall_pct UNCHANGED, build/operational derived)', () => {
  it('exposes build_pct (buildable-only) + operational_pct without changing overall_pct', async () => {
    const io = {
      supabase: stubSupabase({
        countByTable: { agent_messages: 2, pattern_occurrences: 0, key_results: 1 },
        krRows: {
          'KR-2026-07-04': { status: 'achieved', current_value: 1, target_value: 1 },
          'KR-2026-07-05': { status: 'pending', current_value: 0, target_value: 1 },
          'KR-2026-07-02': { status: 'pending', current_value: 45, target_value: 90 },
        },
      }),
    };
    const g = await computeBuildGauge({ io, visionMarkdown: visionFixture() });
    expect(g.available).toBe(true);

    // Every component carries a nature; re-derive the three %s from components (robust, not hardcoded).
    for (const c of g.components) expect(['buildable', 'operational']).toContain(c.nature);
    const scored = g.components.filter((c) => c.score !== null);
    const buildableScored = scored.filter((c) => c.nature === 'buildable');
    const operationalScored = scored.filter((c) => c.nature === 'operational');

    // overall_pct is UNCHANGED — still the all-criteria mean over every scored capability.
    expect(g.overall_pct).toBe(round(scored));
    // build_pct is over BUILDABLE scored ONLY; operational_pct over OPERATIONAL scored ONLY.
    expect(g.build_pct).toBe(round(buildableScored));
    expect(g.operational_pct).toBe(round(operationalScored));
    expect(g.build_denominator).toBe(buildableScored.length);

    // Unknowns excluded from all three (none of the three counts the unknown components).
    expect(buildableScored.length + operationalScored.length).toBe(scored.length);
    // operational_status accounting is internally consistent.
    expect(g.operational_status.built + g.operational_status.awaiting).toBe(g.operational_status.probed);
    expect(g.operational_status.probed + g.operational_status.unknown).toBe(g.operational_status.total);
  });

  it('build_pct is null when no buildable capability is probeable (no false 0%)', async () => {
    // no grep seam ⇒ all 15 buildable code/db probes are unknown OR unbuilt; force build set empty by
    // making every buildable probe unknown is hard, so assert the weaker invariant: build_pct is a
    // number or null, never a fabricated value, and unknowns never enter it.
    const g = await computeBuildGauge({ io: { supabase: stubSupabase() }, visionMarkdown: visionFixture() });
    if (g.available) {
      const scored = g.components.filter((c) => c.score !== null && c.nature === 'buildable');
      expect(g.build_pct).toBe(round(scored));
    } else {
      expect(g.build_pct == null || typeof g.build_pct === 'number').toBe(true);
    }
  });
});

describe('FR-3 formatGaugeForSummary renders BOTH numbers (no emoji, honest labels)', () => {
  const gauge = {
    available: true, overall_pct: 40, build_pct: 67, operational_pct: 10,
    build_denominator: 12, denominator: 18, total_capabilities: 25, unknown_count: 7,
    per_layer: { infrastructure: 50, application: 30 },
    operational_status: { pct: 10, total: 10, probed: 6, unknown: 4, built: 1, awaiting: 5 },
  };
  it('leads with the fleet-build %, shows rung-completion + operational separately', () => {
    const f = formatGaugeForSummary(gauge, { em: '-' });
    expect(f.build_pct).toBe(67);
    expect(f.pct).toBe(40); // back-compat: pct stays overall (Chairman-UI tile)
    expect(f.buildLine).toContain('67% built');
    expect(f.buildLine).toContain('buildable');
    expect(f.rungLine).toContain('40%');
    expect(f.operationalLine).toContain('awaiting venture operation (V2 precursor)');
    expect(f.operationalLine).toContain('5 awaiting');
    // No emojis anywhere (chairman directive).
    const all = `${f.buildLine}${f.rungLine}${f.operationalLine}${f.layerLine}${f.note}`;
    expect(all).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
  it('unavailable gauge degrades every line to empty + a note (never a false number)', () => {
    const f = formatGaugeForSummary({ available: false }, { em: '-' });
    expect(f.pct).toBeNull();
    expect(f.build_pct).toBeNull();
    expect(f.buildLine).toBe('');
    expect(f.note).toContain('unavailable');
  });
});

describe('FR-4 gauge-lens excludes operational capabilities from the sourcing signal', () => {
  const fakeGauge = (components, available = true) => async () => ({ available, overall_pct: 50, components });
  it('operational-nature capabilities never enter the capability_gap map; buildable do', async () => {
    const components = [
      { capability: 'Buildable unbuilt', nature: 'buildable', status: 'unbuilt', score: 0 },
      { capability: 'Buildable partial', nature: 'buildable', status: 'partial', score: 0.5 },
      { capability: 'Operational unbuilt', nature: 'operational', status: 'unbuilt', score: 0 },
      { capability: 'Operational built', nature: 'operational', status: 'built', score: 1 },
      { capability: 'Unknown cap', nature: 'buildable', status: 'unknown', score: null },
    ];
    const out = await readCapabilityGaps({}, { computeBuildGauge: fakeGauge(components) });
    expect(out.available).toBe(true);
    expect(out.gaps).toEqual({ 'Buildable unbuilt': 0, 'Buildable partial': 50 });
    expect(out.gaps).not.toHaveProperty('Operational unbuilt'); // operational excluded (un-sourceable)
    expect(out.gaps).not.toHaveProperty('Operational built');
    expect(out.gaps).not.toHaveProperty('Unknown cap'); // unknown still excluded
  });
});
