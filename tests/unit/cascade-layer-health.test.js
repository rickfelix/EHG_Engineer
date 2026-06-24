// SD-LEO-INFRA-CASCADE-KR-RECOMPUTE-GOV31-001 — honest per-layer cascade health + KR-GOV-3.1 recompute.
// MANDATORY anti-inflation property: the recomputer writes 6 ONLY when all 6 layers pass all three
// conjuncts (data rows AND CLI exists AND validator reads the layer); any forced failure — in ANY of
// the three dimensions — keeps the derived value < 6. It can only ever under-report, never inflate.
import { describe, it, expect } from 'vitest';
import {
  computeCascadeHealth,
  recomputeKrGov31,
  CASCADE_LAYERS,
  KR_CODE,
  RECOMPUTE_WRITER,
} from '../../lib/governance/cascade-layer-health.js';

const YEAR = 2026;
const ALL_MARKERS = ["layer: 'mission'", "layer: 'constitution'", "layer: 'vision'", "layer: 'strategy'", "layer: 'okr'", 'strategic_directives_v2'].join('\n');
// Every backing table populated → the data-rows conjunct passes for all 6 layers.
const FULL_COUNTS = {
  missions: 1, aegis_constitutions: 1, aegis_rules: 2, eva_vision_documents: 1,
  strategic_themes: 11, objectives: 3, key_results: 5, strategic_directives_v2: 100,
};

// Mock supabase: count queries (head:true) resolve to {count} per table; key_results read returns
// krBefore; key_results update captures the payload. 'ERR' count sentinel → a query error.
function mockSb({ counts = FULL_COUNTS, krBefore = 2, updateError = null, onUpdate } = {}) {
  return {
    from(table) {
      return {
        select(_cols, opts) {
          if (opts && opts.head) {
            const builder = {
              eq() { return builder; },
              then(resolve) {
                const c = counts[table];
                resolve(c === 'ERR' ? { count: 0, error: { message: 'boom' } } : { count: c ?? 0, error: null });
              },
            };
            return builder;
          }
          // key_results current_value read
          return { eq() { return { maybeSingle: () => Promise.resolve({ data: { current_value: krBefore }, error: null }) }; } };
        },
        update(payload) {
          return { eq(col, val) { if (onUpdate) onUpdate({ payload, col, val }); return Promise.resolve({ error: updateError }); } };
        },
      };
    },
  };
}

const fullDeps = (over = {}) => ({
  supabase: mockSb(over.sb || {}),
  fileExists: over.fileExists || (() => true),
  validatorSource: over.validatorSource !== undefined ? over.validatorSource : ALL_MARKERS,
  currentYear: YEAR,
});

describe('computeCascadeHealth — all 6 layers pass', () => {
  it('passingCount = 6 when every layer has data + CLI + validator marker', async () => {
    const { layers, passingCount } = await computeCascadeHealth(fullDeps());
    expect(passingCount).toBe(6);
    expect(layers.every((l) => l.pass)).toBe(true);
    expect(layers.map((l) => l.layer)).toEqual(['mission', 'constitution', 'vision', 'strategy', 'okr', 'sd']);
  });
});

describe('ANTI-INFLATION — a forced failure in ANY conjunct keeps the value < 6', () => {
  it('(data rows) an empty table fails its layer → passingCount = 5', async () => {
    const { layers, passingCount } = await computeCascadeHealth(fullDeps({ sb: { counts: { ...FULL_COUNTS, missions: 0 } } }));
    expect(passingCount).toBe(5);
    expect(layers.find((l) => l.layer === 'mission').dataRows).toBe(false);
    expect(layers.find((l) => l.layer === 'mission').pass).toBe(false);
  });

  it('(data rows) a query ERROR fails its layer (conservative) → < 6', async () => {
    const { passingCount } = await computeCascadeHealth(fullDeps({ sb: { counts: { ...FULL_COUNTS, eva_vision_documents: 'ERR' } } }));
    expect(passingCount).toBe(5);
  });

  it('(data rows) a multi-table layer fails when EITHER table is empty (okr: key_results=0)', async () => {
    const { layers, passingCount } = await computeCascadeHealth(fullDeps({ sb: { counts: { ...FULL_COUNTS, key_results: 0 } } }));
    expect(passingCount).toBe(5);
    expect(layers.find((l) => l.layer === 'okr').pass).toBe(false);
  });

  it('(cli) a missing CLI script fails its layer → < 6', async () => {
    const missionCli = CASCADE_LAYERS.find((l) => l.key === 'mission').cli;
    const { layers, passingCount } = await computeCascadeHealth(fullDeps({ fileExists: (p) => p !== missionCli }));
    expect(passingCount).toBe(5);
    expect(layers.find((l) => l.layer === 'mission').cliResolves).toBe(false);
  });

  it('(validator) an absent validator marker fails its layer → < 6', async () => {
    const noOkr = ALL_MARKERS.replace("layer: 'okr'", '');
    const { layers, passingCount } = await computeCascadeHealth(fullDeps({ validatorSource: noOkr }));
    expect(passingCount).toBe(5);
    expect(layers.find((l) => l.layer === 'okr').validatorReads).toBe(false);
  });

  it('empty validator source fails ALL layers → 0', async () => {
    const { passingCount } = await computeCascadeHealth(fullDeps({ validatorSource: '' }));
    expect(passingCount).toBe(0);
  });
});

describe('recomputeKrGov31 — write semantics', () => {
  it('apply=false (dry-run): NO write, returns the would-be value', async () => {
    let wrote = false;
    const supabase = mockSb({ onUpdate: () => { wrote = true; } });
    const r = await recomputeKrGov31({ supabase, apply: false, now: '2026-06-23T00:00:00Z', validatorSource: ALL_MARKERS, currentYear: YEAR });
    expect(wrote).toBe(false);
    expect(r.wrote).toBe(false);
    expect(r.passingCount).toBe(6);
    expect(r.before).toBe(2);
  });

  it('apply=true: writes current_value=passingCount to KR-GOV-3.1 with last_updated_by set', async () => {
    let captured = null;
    const supabase = mockSb({ onUpdate: (u) => { captured = u; } });
    const r = await recomputeKrGov31({ supabase, apply: true, now: '2026-06-23T00:00:00Z', validatorSource: ALL_MARKERS, currentYear: YEAR });
    expect(r.wrote).toBe(true);
    expect(captured.col).toBe('code');
    expect(captured.val).toBe(KR_CODE);
    expect(captured.payload.current_value).toBe(6);
    expect(captured.payload.status).toBe('achieved');
    expect(captured.payload.last_updated_by).toBe(RECOMPUTE_WRITER);
  });

  it('apply=true with a failing layer: writes < 6 and status at_risk (anti-inflation end-to-end)', async () => {
    let captured = null;
    const supabase = mockSb({ counts: { ...FULL_COUNTS, missions: 0 }, onUpdate: (u) => { captured = u; } });
    const r = await recomputeKrGov31({ supabase, apply: true, now: '2026-06-23T00:00:00Z', validatorSource: ALL_MARKERS, currentYear: YEAR });
    expect(r.passingCount).toBe(5);
    expect(captured.payload.current_value).toBe(5);
    expect(captured.payload.status).toBe('at_risk');
  });
});
