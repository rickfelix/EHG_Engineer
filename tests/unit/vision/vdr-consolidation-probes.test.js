// SD-LEO-INFRA-V1-CONSOLIDATION-PROBES-001 (FR-5) — adversarial band-movement + coherence tests for the
// 3 consolidation-cluster probes (Backlog distilled, Presentation-surface consolidation, Competitive
// vigilance) and the new count_ratio runner. Hermetic: injected supabase seam, no live DB, no grep.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertRegistryCoherence, computeBuildGauge, VDR_REGISTRY } from '../../../lib/vision/vdr-registry.js';
import { runProbe, countRatioProbe, PROBE_RUNNERS } from '../../../lib/vision/vdr-probes.js';

const BACKLOG = 'Backlog distilled and dispositioned';
const SURFACE = 'Application presentation-surface consolidation';
const VIGILANCE = 'Competitive vigilance process established';
const CONSOLIDATION_LABELS = [BACKLOG, SURFACE, VIGILANCE];

const entryFor = (cap) => VDR_REGISTRY.find((e) => e.capability === cap);

// db_count stub (same shape as vdr-caplayer-probes.test.js): any count/head query on `table` resolves to count.
function stubSupabase({ countByTable = {} } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        not() { return chain; },
        then(res, rej) { return Promise.resolve({ count: countByTable[table] ?? 0, error: null }).then(res, rej); },
      };
      return chain;
    },
  };
}

// count_ratio stub: returns `numer` once any filter (.eq/.in/.not) is applied, else `denom`.
// count_ratio queries the denominator (no filter) first, then the numerator (filtered).
function stubRatio({ denom, numer, error = null }) {
  return {
    from() {
      let filtered = false;
      const chain = {
        select() { return chain; },
        eq() { filtered = true; return chain; },
        in() { filtered = true; return chain; },
        not() { filtered = true; return chain; },
        then(res, rej) { return Promise.resolve({ count: filtered ? numer : denom, error }).then(res, rej); },
      };
      return chain;
    },
  };
}

function visionFixture(labels = VDR_REGISTRY.map((e) => e.capability)) {
  const rows = labels.map((l) => `| **${l}** | today cell | required cell |`).join('\n');
  return ['## CAPABILITY GAP — at-a-glance table', '', '| Vision capability | TODAY | REQUIRED |', '|---|---|---|', rows, '', '## NEXT', 'excluded'].join('\n');
}

describe('FR-2: count_ratio is a registered runner with honest bands + fail-open', () => {
  it('is registered in PROBE_RUNNERS', () => {
    expect(PROBE_RUNNERS.count_ratio).toBe(countRatioProbe);
  });
  it('bands: ratio>=builtAt→built, 0<ratio<builtAt→partial, 0→unbuilt, denom==0→unbuilt', async () => {
    const def = { type: 'count_ratio', table: 't', numerFilter: { s: 'x' }, builtAt: 0.7 };
    const run = (denom, numer) => runProbe(def, { supabase: stubRatio({ denom, numer }) });
    expect((await run(145, 0)).status).toBe('unbuilt');     // 0%
    expect((await run(145, 13)).status).toBe('partial');    // 9% (the live backlog reality)
    expect((await run(100, 69)).status).toBe('partial');    // 69% < 70%
    expect((await run(100, 70)).status).toBe('built');      // 70% == builtAt
    expect((await run(100, 100)).status).toBe('built');     // 100%
    expect((await run(0, 0)).status).toBe('unbuilt');       // denom==0 → unbuilt, never divide-by-zero
  });
  it('fail-open: no supabase → unknown; count error → unknown (never fabricated)', async () => {
    expect((await countRatioProbe({ table: 't' }, {})).status).toBe('unknown');
    expect((await countRatioProbe({ table: 't' }, { supabase: stubRatio({ denom: 10, numer: 5, error: { message: 'boom' } }) })).status).toBe('unknown');
  });
  it('numerFilter as an array drives an .in() numerator (dispositioned+integrated in one count)', async () => {
    const def = { type: 'count_ratio', table: 'sd_backlog_map', numerFilter: { completion_status: ['COMPLETED', 'INTEGRATED'] }, builtAt: 0.7 };
    const r = await runProbe(def, { supabase: stubRatio({ denom: 145, numer: 13 }) });
    expect(r.status).toBe('partial');
    expect(r.value).toBeCloseTo(13 / 145, 5);
  });
});

describe('FR-3: the 3 consolidation entries are registered with the honest shape', () => {
  it('Backlog → count_ratio on sd_backlog_map (numerator completion_status=COMPLETED), layer process', () => {
    const e = entryFor(BACKLOG);
    expect(e).toBeTruthy();
    expect(e.layer).toBe('process');
    expect(e.probe).toMatchObject({ type: 'count_ratio', table: 'sd_backlog_map', numerFilter: { completion_status: 'COMPLETED' } });
    expect(e.probe.builtAt).toBeGreaterThan(0.5); // not gamed to today's 9%
  });
  it('Surface → count_ratio on ehg_page_routes (mapped feature_area / total), layer application, builtAt 1.0', () => {
    const e = entryFor(SURFACE);
    expect(e.layer).toBe('application');
    // count_ratio (orphan-free organization), NOT a backwards gte presence-count.
    expect(e.probe).toMatchObject({ type: 'count_ratio', table: 'ehg_page_routes', numerFilter: { feature_area_id: { not: null } }, builtAt: 1.0 });
  });
  it('Vigilance → db_count on competitive_baselines (OBSERVED only) min 1, layer process', () => {
    const e = entryFor(VIGILANCE);
    expect(e.layer).toBe('process');
    // OBSERVED filter excludes STATUS_QUO/ASSUMPTION seed rows (anti-lie-high).
    expect(e.probe).toMatchObject({ type: 'db_count', table: 'competitive_baselines', filter: { epistemic_tag: 'OBSERVED' }, min: 1, builtWhen: 'gte' });
  });
});

describe('FR-3 adversarial: each band MOVES with the signal (not green-by-construction)', () => {
  it('Backlog count_ratio: 0→unbuilt, 13/145→partial, 102/145→built', async () => {
    const probe = entryFor(BACKLOG).probe; // builtAt 0.7
    const run = (denom, numer) => runProbe(probe, { supabase: stubRatio({ denom, numer }) });
    expect((await run(145, 0)).status).toBe('unbuilt');
    expect((await run(145, 13)).status).toBe('partial');   // the live ~9%
    expect((await run(145, 102)).status).toBe('built');    // ~70%
  });
  it('Surface count_ratio (mapped/total): orphans→partial, all-mapped(8/8 live)→built', async () => {
    const probe = entryFor(SURFACE).probe; // builtAt 1.0
    const run = (denom, numer) => runProbe(probe, { supabase: stubRatio({ denom, numer }) });
    expect((await run(8, 0)).status).toBe('unbuilt');  // 0 mapped
    expect((await run(8, 7)).status).toBe('partial');  // 1 orphan route → not fully consolidated
    expect((await run(8, 8)).status).toBe('built');    // all mapped (the live state)
  });
  it('Vigilance db_count(OBSERVED): 0→unbuilt (live: only ASSUMPTION seeds), 1→built', async () => {
    const probe = entryFor(VIGILANCE).probe;
    const run = (n) => runProbe(probe, { supabase: stubSupabase({ countByTable: { competitive_baselines: n } }) });
    expect((await run(0)).status).toBe('unbuilt'); // 0 OBSERVED → process not established (honest live read)
    expect((await run(1)).status).toBe('built');   // >=1 real observed baseline → established
  });
});

describe('FR-5 coherence: criteria↔probe lockstep withholds the WHOLE gauge on drift', () => {
  it('matched → coherence ok, gauge available, the 3 components probed', async () => {
    const io = { supabase: stubSupabase({ countByTable: { sd_backlog_map: 145, ehg_page_routes: 8, competitive_baselines: 4 } }) };
    const g = await computeBuildGauge({ io, visionMarkdown: visionFixture() });
    expect(g.coherence.ok).toBe(true);
    expect(g.available).toBe(true);
    for (const cap of CONSOLIDATION_LABELS) {
      const c = g.components.find((x) => x.capability === cap);
      expect(c, `component ${cap}`).toBeTruthy();
      expect(['built', 'partial', 'unbuilt']).toContain(c.status); // probed (not unmapped/unknown)
    }
  });
  it('probe-without-criterion (criteria migration not yet applied) → staleProbes → gauge withholds', async () => {
    const labelsMinusBacklog = VDR_REGISTRY.map((e) => e.capability).filter((c) => c !== BACKLOG);
    const g = await computeBuildGauge({ io: { supabase: stubSupabase({}) }, visionMarkdown: visionFixture(labelsMinusBacklog) });
    expect(g.coherence.ok).toBe(false);
    expect(g.coherence.staleProbes).toContain(BACKLOG);
    expect(g.available).toBe(false);
  });
  it('assertRegistryCoherence: all 3 consolidation labels are matched by the registry', () => {
    const r = assertRegistryCoherence(VDR_REGISTRY.map((e) => ({ capability: e.capability })));
    expect(r.ok).toBe(true);
    expect(r.missingProbes).toEqual([]);
    expect(r.staleProbes).toEqual([]);
  });
});

// Source-of-truth byte-identity (the HIGH-risk axis): the migration's criteria labels and the
// VDR_REGISTRY probe labels must be byte-identical, or the live gauge withholds forever.
describe('FR-1/FR-3 byte-identity: migration criteria labels == VDR_REGISTRY labels', () => {
  const migrationSql = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database/migrations/20260615_vision_ladder_consolidation_criteria.sql'),
    'utf8',
  );
  it('each canonical label appears verbatim in the migration AND has a VDR_REGISTRY probe', () => {
    const registered = new Set(VDR_REGISTRY.map((e) => e.capability));
    for (const label of CONSOLIDATION_LABELS) {
      expect(migrationSql.includes(label), `migration contains "${label}"`).toBe(true);
      expect(registered.has(label), `registry has "${label}"`).toBe(true);
    }
  });
  it('the migration writes the 2 operating invariants and is chairman-gated (no @approved-by)', () => {
    expect(migrationSql).toContain('operating_invariants');
    expect(migrationSql).toContain('Compute is not a constraint');
    expect(migrationSql).toContain('Governance-only app / no data-entry GUI');
    expect(migrationSql).not.toMatch(/@approved-by\s*[=:]/); // chairman-gated: no actual attestation value (the header may mention the term)
    expect(migrationSql).toContain('ON CONFLICT (rung_id, capability) DO NOTHING'); // idempotent
  });
});
