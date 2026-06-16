// SD-LEO-INFRA-V1-CAPLAYER-PROBES-001 (FR-3) — adversarial band-movement + coherence tests for the
// two capability-layer probes (Capability Registry, Expertise on-demand). Hermetic: injected
// supabase seam, no live DB, no grep seam (db_count probes only).
import { describe, it, expect } from 'vitest';
import {
  assertRegistryCoherence,
  computeBuildGauge,
  VDR_REGISTRY,
} from '../../../lib/vision/vdr-registry.js';
import { runProbe } from '../../../lib/vision/vdr-probes.js';
import { buildCriteriaRows, _internals as wireInternals, V1_RUNG_ID } from '../../../scripts/okr/wire-v1-caplayer-criteria.mjs';

const CAP_REGISTRY = 'Capability Registry';
const EXPERTISE = 'Expertise on-demand';

// Chainable supabase stub (same shape as vdr-registry.test.js): count/head queries resolve to { count }.
function stubSupabase({ countByTable = {} } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res, rej) { return Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

// Build a CAPABILITY GAP markdown table from labels so coherence passes/fails by construction.
function visionFixture(labels = VDR_REGISTRY.map((e) => e.capability)) {
  const rows = labels.map((l) => `| **${l}** | today cell | required cell |`).join('\n');
  return ['## CAPABILITY GAP — at-a-glance table', '', '| Vision capability | TODAY | REQUIRED |', '|---|---|---|', rows, '', '## NEXT', 'excluded'].join('\n');
}

const entryFor = (cap) => VDR_REGISTRY.find((e) => e.capability === cap);

describe('FR-2: the 2 capability-layer entries are registered with the honest shape', () => {
  it('Capability Registry → db_count on sd_capabilities, layer infrastructure, min 50 (>1, below live 214)', () => {
    const e = entryFor(CAP_REGISTRY);
    expect(e).toBeTruthy();
    expect(e.layer).toBe('infrastructure');
    expect(e.probe).toMatchObject({ type: 'db_count', table: 'sd_capabilities', min: 50, builtWhen: 'gte' });
    expect(e.probe.min).toBeGreaterThan(1); // anti-seed-inflation (FR-4 honesty)
  });
  it('Expertise on-demand → db_count on specialist_registry, layer infrastructure, min 10 (>1, below live 30)', () => {
    const e = entryFor(EXPERTISE);
    expect(e).toBeTruthy();
    expect(e.layer).toBe('infrastructure');
    expect(e.probe).toMatchObject({ type: 'db_count', table: 'specialist_registry', min: 10, builtWhen: 'gte' });
    expect(e.probe.min).toBeGreaterThan(1);
  });
});

describe('FR-3 adversarial: the band MOVES with the count (unbuilt → partial → built)', () => {
  it('Capability Registry: 0 → unbuilt, 1..49 → partial, >=50 → built', async () => {
    const probe = entryFor(CAP_REGISTRY).probe;
    const run = (n) => runProbe(probe, { supabase: stubSupabase({ countByTable: { sd_capabilities: n } }) });
    expect((await run(0)).status).toBe('unbuilt');
    expect((await run(1)).status).toBe('partial');   // a single seed row must NOT credit built (doctrine)
    expect((await run(49)).status).toBe('partial');
    expect((await run(50)).status).toBe('built');
    expect((await run(214)).status).toBe('built');    // the live count
  });
  it('Expertise on-demand: 0 → unbuilt, 1..9 → partial, >=10 → built', async () => {
    const probe = entryFor(EXPERTISE).probe;
    const run = (n) => runProbe(probe, { supabase: stubSupabase({ countByTable: { specialist_registry: n } }) });
    expect((await run(0)).status).toBe('unbuilt');
    expect((await run(1)).status).toBe('partial');
    expect((await run(9)).status).toBe('partial');
    expect((await run(10)).status).toBe('built');
    expect((await run(30)).status).toBe('built');     // the live count
  });
});

describe('FR-3 coherence: criteria↔probe lockstep withholds the WHOLE gauge on drift (both directions)', () => {
  it('matched (both labels present in vision + registry) → coherence ok:true, gauge available', async () => {
    const io = { supabase: stubSupabase({ countByTable: { sd_capabilities: 214, specialist_registry: 30 } }) };
    const g = await computeBuildGauge({ io, visionMarkdown: visionFixture() });
    expect(g.coherence.ok).toBe(true);
    expect(g.available).toBe(true);
    // both new capability-layer components are PROBED (not unmapped/unknown) and built at live counts
    const cr = g.components.find((c) => c.capability === CAP_REGISTRY);
    const ex = g.components.find((c) => c.capability === EXPERTISE);
    expect(cr).toMatchObject({ layer: 'infrastructure', status: 'built' });
    expect(ex).toMatchObject({ layer: 'infrastructure', status: 'built' });
  });

  it('criterion-without-probe → missingProbes → gauge withholds (available:false)', async () => {
    // a vision criterion exists with no matching registry probe (simulate the new label added to
    // criteria but NOT to the registry — the mid-rollout hazard this SD guards against).
    const md = visionFixture([...VDR_REGISTRY.map((e) => e.capability), 'Phantom Capability With No Probe']);
    const g = await computeBuildGauge({ io: { supabase: stubSupabase({}) }, visionMarkdown: md });
    expect(g.coherence.ok).toBe(false);
    expect(g.coherence.missingProbes).toContain('Phantom Capability With No Probe');
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
  });

  it('probe-without-criterion → staleProbes → gauge withholds (available:false)', async () => {
    // the registry has the 2 new probes but the vision criteria omit one of them (simulate the new
    // probe shipped in code but the criteria INSERT not yet applied — the other rollout direction).
    const labelsMinusExpertise = VDR_REGISTRY.map((e) => e.capability).filter((c) => c !== EXPERTISE);
    const g = await computeBuildGauge({ io: { supabase: stubSupabase({}) }, visionMarkdown: visionFixture(labelsMinusExpertise) });
    expect(g.coherence.ok).toBe(false);
    expect(g.coherence.staleProbes).toContain(EXPERTISE);
    expect(g.available).toBe(false);
    expect(g.overall_pct).toBeNull();
  });

  it('assertRegistryCoherence directly: both new labels are matched by the registry', () => {
    const r = assertRegistryCoherence(VDR_REGISTRY.map((e) => ({ capability: e.capability })));
    expect(r.ok).toBe(true);
    expect(r.missingProbes).toEqual([]);
    expect(r.staleProbes).toEqual([]);
  });
});

// Guard the HIGH-risk byte-identity axis at the SOURCE (review finding): the wire-script criteria
// labels and the VDR_REGISTRY probe labels must be byte-identical, or the live gauge withholds
// forever. The other coherence tests use a fixture derived FROM the registry, so they cannot catch
// a drift between the wire script's CRITERIA literals and the registry literals — this one does.
describe('FR-1/FR-2 source-of-truth: wire-script criteria labels == VDR_REGISTRY labels (byte-identical)', () => {
  it('the 2 wire-script CRITERIA capabilities are exactly the 2 capability-layer labels', () => {
    const caps = wireInternals.CRITERIA.map((c) => c.capability);
    expect(caps).toEqual([CAP_REGISTRY, EXPERTISE]);
  });
  it('every wire-script criterion capability has a byte-identical VDR_REGISTRY probe (no drift → no forever-withhold)', () => {
    const registered = new Set(VDR_REGISTRY.map((e) => e.capability));
    for (const c of wireInternals.CRITERIA) expect(registered.has(c.capability)).toBe(true);
    // and the registry's 2 new infra db_count entries are exactly the wire-script set
    const newInfra = VDR_REGISTRY.filter((e) => e.probe.type === 'db_count' && ['sd_capabilities', 'specialist_registry'].includes(e.probe.table)).map((e) => e.capability);
    expect(new Set(newInfra)).toEqual(new Set(wireInternals.CRITERIA.map((c) => c.capability)));
  });
  it('buildCriteriaRows defaults to the documented V1 rung but accepts a live-resolved id (dynamic-rung fix)', () => {
    expect(buildCriteriaRows().every((r) => r.rung_id === V1_RUNG_ID)).toBe(true);
    const custom = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(buildCriteriaRows(custom).every((r) => r.rung_id === custom)).toBe(true);
    expect(buildCriteriaRows().map((r) => r.ordinal)).toEqual([21, 22]);
  });
});
