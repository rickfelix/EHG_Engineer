/**
 * SD-LEO-INFRA-SOURCING-ENGINE-GAUGE-GAP-MINER-001 (child 10/10) — FR-1..FR-6 unit tests.
 *
 * The miner turns the read-only VDR gauge into a forward router: unbuilt/partial active-rung caps
 * become STAGED roadmap candidates, routed via the SHIPPED router + dedup helper.
 *   FR-1: select gaps (unbuilt/partial), exclude unknown + built.
 *   FR-2: buildable -> belt-ready staged; operational -> chairman-gated (off the belt-lead).
 *   FR-3: REUSE stampCandidate — a covered+realized cap dedups (no re-mint); a covered-but-open cap re-emits.
 *   FR-4: staged-only — no promoted_to_sd_key, no SD minted.
 *   FR-5: cron flag default-off.
 *   + dormant-safe (lane column absent / source_type 23514 -> dry-run) + idempotency.
 */
import { describe, it, expect } from 'vitest';
import {
  selectGaugeGaps,
  gapToCandidate,
  gaugeGapSourceId,
  buildStagedRoadmapItem,
  translateGapToBuildable,
  mineGaugeGaps,
  isGaugeGapMinerFlagEnabled,
  VDR_GAUGE_SOURCE_TYPE,
} from '../../../lib/sourcing-engine/gauge-gap-miner.js';
import { stampCandidate } from '../../../lib/sourcing-engine/dedup-autostamp.js';
import { validate as uuidValidate } from 'uuid';

/**
 * Schema-aware AND TYPE-aware Supabase mock — models the REAL roadmap_wave_items columns (source_type,
 * source_id, title, promoted_to_sd_key, metadata, lane) AND enforces that source_id is a valid UUID
 * (the live column is UUID-typed; a non-UUID 22P02-throws — the activation-lethal bug class the
 * adversarial review caught, mirroring the target_rung-vs-rung lesson). Tracks inserts so STAGED-only +
 * dormant-safe can be asserted.
 */
function makeSupabaseMock({ laneColumnExists = true, sds = [], waveResolvable = true, existingStaged = [], insertError = null } = {}) {
  const inserts = [];
  const from = (table) => {
    const state = { table, selectCols: null, filters: {} };
    const b = {
      select(cols) { state.selectCols = cols; return b; },
      eq(col, val) { state.filters[col] = val; return b; },
      in() { return b; },
      like() { return b; },
      limit() { return b; },
      order() { return b; },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: range() added so
      // fetchAllPaginated-converted call sites (the SD dedup-load below) can chain on
      // this thenable mock like any other filter method.
      range() { return b; },
      insert(payload) {
        if (insertError) return Promise.resolve({ data: null, error: insertError });
        // TYPE-aware: the live source_id column is UUID — reject a non-UUID exactly as Postgres would.
        if (table === 'roadmap_wave_items' && payload && payload.source_id != null && !uuidValidate(payload.source_id)) {
          return Promise.resolve({ data: null, error: { code: '22P02', message: `invalid input syntax for type uuid: "${payload.source_id}"` } });
        }
        inserts.push(payload);
        return Promise.resolve({ data: [payload], error: null });
      },
      then(resolve, reject) { return Promise.resolve(resolveResult(state)).then(resolve, reject); },
    };
    return b;
  };
  const resolveResult = (state) => {
    if (state.table === 'strategic_directives_v2') return { data: sds, error: null };
    if (state.table === 'strategic_roadmaps') return { data: waveResolvable ? [{ id: 'roadmap-1' }] : [], error: null };
    if (state.table === 'roadmap_waves') return { data: waveResolvable ? [{ id: 'wave-1', sequence_rank: 5 }] : [], error: null };
    if (state.table === 'roadmap_wave_items' && state.selectCols === 'lane') {
      return laneColumnExists
        ? { data: [], error: null }
        : { data: null, error: { code: '42703', message: 'column roadmap_wave_items.lane does not exist' } };
    }
    if (state.table === 'roadmap_wave_items' && state.selectCols === 'source_id') {
      return { data: existingStaged.map((s) => ({ source_id: s })), error: null };
    }
    return { data: [], error: null };
  };
  return { from, _inserts: inserts };
}

const fakeGauge = (components) => async () => ({ available: true, components });

// A gauge with one buildable unbuilt cap, one operational unbuilt cap, one unknown, one built.
const MIXED_COMPONENTS = [
  { capability: 'Build a thing', nature: 'buildable', status: 'unbuilt', score: 0 },
  { capability: 'Take a real dollar', nature: 'operational', status: 'unbuilt', score: 0 },
  { capability: 'Mystery cap', nature: 'buildable', status: 'unknown', score: null },
  { capability: 'Already built cap', nature: 'buildable', status: 'built', score: 1 },
];

describe('FR-1: selectGaugeGaps', () => {
  it('selects unbuilt/partial caps; excludes unknown and built', () => {
    const gaps = selectGaugeGaps({ available: true, components: MIXED_COMPONENTS });
    const caps = gaps.map((g) => g.capability);
    expect(caps).toContain('Build a thing');
    expect(caps).toContain('Take a real dollar');
    expect(caps).not.toContain('Mystery cap'); // unknown excluded (not measurable)
    expect(caps).not.toContain('Already built cap'); // built excluded (no gap)
  });
  it('includes a partial cap', () => {
    const gaps = selectGaugeGaps({ available: true, components: [{ capability: 'Half done', nature: 'buildable', status: 'partial', score: 0.5 }] });
    expect(gaps.map((g) => g.capability)).toEqual(['Half done']);
  });
  it('returns [] for an unavailable gauge (fail-soft, never a fabricated gap)', () => {
    expect(selectGaugeGaps({ available: false, components: MIXED_COMPONENTS })).toEqual([]);
    expect(selectGaugeGaps(null)).toEqual([]);
  });
});

describe('FR-2: gapToCandidate routing', () => {
  it('a buildable gap carries no authority (belt-ready residual)', () => {
    const c = gapToCandidate({ capability: 'Build a thing', nature: 'buildable' }, { activeRungKey: 'V1' });
    expect(c.authority).toBeNull();
    // source_id must be a valid UUID (the live column is UUID-typed), deterministic per capability.
    expect(uuidValidate(c.source_id)).toBe(true);
    expect(c.source_id).toBe(gaugeGapSourceId('Build a thing'));
    expect(c.rung).toBe('V1');
    expect(c.disposition).toBe('BUILD');
  });
  it('an operational gap routes off the belt-lead via authority=operational (chairman-gated)', () => {
    const c = gapToCandidate({ capability: 'Take a real dollar', nature: 'operational' });
    expect(c.authority).toBe('operational');
    // The SHIPPED router maps authority=operational -> chairman-gated.
    expect(stampCandidate(c, {}).lane).toBe('chairman-gated');
  });
});

describe('SD-LEO-INFRA-TRANSLATEGAPTOBUILDABLE-GAUGE-GAP-001 FR-1: translateGapToBuildable', () => {
  it('emits a concrete buildable title (not the raw capability label) + scope + translated:true', () => {
    const t = translateGapToBuildable({ capability: 'Backlog distilled and dispositioned', required: 'feedback backlog has 0 untriaged > 7d', status: 'partial' });
    expect(t.translated).toBe(true);
    expect(t.title).not.toBe('Backlog distilled and dispositioned'); // not the bare label
    expect(t.title).toContain('Backlog distilled and dispositioned'); // but references it
    expect(t.title.length).toBeLessThan(120); // never a truncation shell
    expect(t.scope).toContain('feedback backlog has 0 untriaged > 7d'); // required acceptance carried
    expect(t.scope).toContain('partial'); // gauge status carried
  });
  it('is total on odd/missing input and still carries an acceptance fallback', () => {
    const t = translateGapToBuildable(null);
    expect(t.translated).toBe(true);
    expect(typeof t.title).toBe('string');
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.scope).toMatch(/Acceptance/);
  });
});

describe('SD-LEO-INFRA-TRANSLATEGAPTOBUILDABLE-GAUGE-GAP-001 FR-2: miner stamps the translation', () => {
  it('buildStagedRoadmapItem carries the translated title + metadata.translated + metadata.description, raw capability traceable', () => {
    const payload = buildStagedRoadmapItem(
      { capability: 'Backlog distilled and dispositioned', nature: 'buildable', status: 'partial', required: 'acceptance criterion text' },
      { lane: 'belt-ready', dedup_match_sd_key: null, re_emit: false },
      { waveId: 'wave-1', lanePresent: true, activeRungKey: 'V1' },
    );
    expect(payload.title).not.toBe('Backlog distilled and dispositioned'); // translated, not raw
    expect(payload.metadata.translated).toBe(true);
    expect(typeof payload.metadata.description).toBe('string');
    expect(payload.metadata.description.length).toBeGreaterThan(40);
    expect(payload.metadata.capability).toBe('Backlog distilled and dispositioned'); // raw still traceable
    expect(payload.metadata.source_label).toBe('vdr:Backlog distilled and dispositioned');
  });
  it('gapToCandidate KEEPS the raw capability title (the dedup match key — translation is staged-row-only)', () => {
    const c = gapToCandidate({ capability: 'Build a thing', nature: 'buildable' });
    expect(c.title).toBe('Build a thing'); // raw, so the SHIPPED dedup matcher still matches shipped capability SDs
  });
});

describe('FR-4: buildStagedRoadmapItem (staged-only)', () => {
  it('never sets promoted_to_sd_key and marks the row staged', () => {
    const payload = buildStagedRoadmapItem(
      { capability: 'Build a thing', nature: 'buildable', status: 'unbuilt' },
      { lane: 'belt-ready', dedup_match_sd_key: null, re_emit: false },
      { waveId: 'wave-1', lanePresent: true, activeRungKey: 'V1' },
    );
    expect(payload.promoted_to_sd_key).toBeNull();
    expect(payload.metadata.sourcing_stage).toBe('staged');
    expect(payload.source_type).toBe(VDR_GAUGE_SOURCE_TYPE);
    expect(payload.lane).toBe('belt-ready');
  });
  it('omits lane when the lane column is dormant', () => {
    const payload = buildStagedRoadmapItem(
      { capability: 'Build a thing' },
      { lane: 'belt-ready', dedup_match_sd_key: null, re_emit: false },
      { waveId: 'wave-1', lanePresent: false },
    );
    expect(payload).not.toHaveProperty('lane');
  });
});

describe('FR-1/2/4: mineGaugeGaps runner (live-ish, dry-run)', () => {
  it('stages a buildable gap belt-ready, routes an operational gap chairman-gated, excludes unknown/built', async () => {
    const supabase = makeSupabaseMock({ sds: [] });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(MIXED_COMPONENTS) } });
    expect(res.gaps).toBe(2); // only the two non-unknown, non-built caps
    expect(res.staged).toBe(2);
    expect(res.chairman_routed).toBe(1); // the operational cap
    expect(res.dry_run).toBe(false);
    // Two staged rows; none promoted (FR-4).
    expect(supabase._inserts).toHaveLength(2);
    for (const row of supabase._inserts) {
      expect(row.promoted_to_sd_key).toBeNull();
      expect(row.metadata.sourcing_stage).toBe('staged');
      // Activation-safe: source_id is a valid UUID (the mock 22P02-rejects a non-UUID), and the
      // human-readable key is preserved in metadata.source_label.
      expect(uuidValidate(row.source_id)).toBe(true);
      expect(row.metadata.source_label).toBe(`vdr:${row.metadata.capability}`);
    }
    const lanes = supabase._inserts.map((r) => r.lane).sort();
    expect(lanes).toEqual(['belt-ready', 'chairman-gated']);
  });
});

describe('FR-3: reuse shipped dedup + re-emit', () => {
  const COVERED_REALIZED_SD = {
    sd_key: 'SD-COVERED-REALIZED-001', title: 'Covered cap', status: 'completed',
    metadata: { delivers_capabilities: ['A built capability'] },
  };
  const COVERED_OPEN_SD = {
    sd_key: 'SD-COVERED-OPEN-001', title: 'Open infra cap', status: 'completed',
    metadata: { delivers_capabilities: [] },
  };

  it('a covered+realized cap dedups with NO re-mint (terminal duplicate)', async () => {
    const components = [
      { capability: 'Covered cap', nature: 'buildable', status: 'partial', score: 0.5 }, // the gap
      { capability: 'A built capability', nature: 'buildable', status: 'built', score: 1 }, // realizes the SD
    ];
    const supabase = makeSupabaseMock({ sds: [COVERED_REALIZED_SD] });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(components) } });
    expect(res.deduped).toBe(1);
    expect(res.staged).toBe(0);
    expect(supabase._inserts).toHaveLength(0); // not re-minted
  });

  it('a covered-but-outcome-open cap re-emits as a staged outcome-gated candidate', async () => {
    const components = [
      { capability: 'Open infra cap', nature: 'buildable', status: 'unbuilt', score: 0 }, // gap matches a completed SD, but no built capability realizes it
    ];
    const supabase = makeSupabaseMock({ sds: [COVERED_OPEN_SD] });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(components) } });
    expect(res.re_emit).toBe(1);
    expect(res.staged).toBe(1);
    expect(supabase._inserts).toHaveLength(1);
    expect(supabase._inserts[0].lane).toBe('outcome-gated');
    expect(supabase._inserts[0].metadata.dedup_match_sd_key).toBe('SD-COVERED-OPEN-001');
    expect(supabase._inserts[0].metadata.re_emit).toBe(true);
  });

  it("the runner's dedup verdict is the SHIPPED stampCandidate's verdict (no new matcher)", () => {
    const candidate = gapToCandidate({ capability: 'Covered cap', nature: 'buildable' });
    const stamp = stampCandidate(candidate, {
      existing: [{ sd_key: 'SD-COVERED-REALIZED-001', title: 'Covered cap' }],
      shippedInfraKeys: ['SD-COVERED-REALIZED-001'],
      outcomeRealizedKeys: ['SD-COVERED-REALIZED-001'],
    });
    expect(stamp.lane).toBe('dedup');
    expect(stamp.re_emit).toBe(false);
  });
});

describe('dormant-safe + idempotency', () => {
  it('forces dry-run when the lane column is dormant (no writes)', async () => {
    const supabase = makeSupabaseMock({ laneColumnExists: false });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(MIXED_COMPONENTS) } });
    expect(res.lane_column_missing).toBe(true);
    expect(res.dry_run).toBe(true);
    expect(supabase._inserts).toHaveLength(0);
    expect(res.staged).toBe(2); // computed what it WOULD stage
  });

  it('forces dry-run when source_type CHECK rejects vdr_gauge (23514)', async () => {
    const supabase = makeSupabaseMock({ insertError: { code: '23514', message: 'roadmap_wave_items_source_type_check' } });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(MIXED_COMPONENTS) } });
    expect(res.source_type_unsupported).toBe(true);
    expect(res.dry_run).toBe(true);
    expect(supabase._inserts).toHaveLength(0); // insert attempted, rejected, nothing persisted
  });

  it('forces dry-run when no target wave resolves', async () => {
    const supabase = makeSupabaseMock({ waveResolvable: false });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(MIXED_COMPONENTS) } });
    expect(res.wave_id).toBeNull();
    expect(res.dry_run).toBe(true);
    expect(supabase._inserts).toHaveLength(0);
  });

  it('skips a capability already staged (idempotent re-run, no re-mint)', async () => {
    const supabase = makeSupabaseMock({ existingStaged: [gaugeGapSourceId('Build a thing')] });
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: fakeGauge(MIXED_COMPONENTS) } });
    expect(res.skipped_existing).toBe(1);
    // only the operational cap remains to stage
    expect(supabase._inserts.map((r) => r.source_id)).toEqual([gaugeGapSourceId('Take a real dollar')]);
  });

  it('fail-soft: an unavailable gauge yields no gaps and no writes', async () => {
    const supabase = makeSupabaseMock();
    const res = await mineGaugeGaps({ supabase, apply: true, deps: { computeBuildGauge: async () => ({ available: false, components: [] }) } });
    expect(res.available).toBe(false);
    expect(res.gaps).toBe(0);
    expect(supabase._inserts).toHaveLength(0);
  });
});

describe('FR-5: cron flag default-off', () => {
  it('off by default and for unrecognized values', () => {
    expect(isGaugeGapMinerFlagEnabled({})).toBe(false);
    expect(isGaugeGapMinerFlagEnabled({ SOURCING_GAUGE_GAP_MINER_V1: 'off' })).toBe(false);
    expect(isGaugeGapMinerFlagEnabled({ SOURCING_GAUGE_GAP_MINER_V1: 'maybe' })).toBe(false);
  });
  it('on for on|1|true', () => {
    expect(isGaugeGapMinerFlagEnabled({ SOURCING_GAUGE_GAP_MINER_V1: 'on' })).toBe(true);
    expect(isGaugeGapMinerFlagEnabled({ SOURCING_GAUGE_GAP_MINER_V1: '1' })).toBe(true);
    expect(isGaugeGapMinerFlagEnabled({ SOURCING_GAUGE_GAP_MINER_V1: 'TRUE' })).toBe(true);
  });
});
