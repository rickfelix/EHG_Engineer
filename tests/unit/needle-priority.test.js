import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { needleScore, rungProgressByKey, buildSdRungMap } from '../../lib/vision/needle-priority.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

describe('needleScore (SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C FR-1)', () => {
  const ctx = { activeRungKey: 'V1', rungProgressByKey: { V1: 50, V2: 80 } };

  it('an unresolvable rung is neutral (0)', () => {
    expect(needleScore(null, ctx)).toBe(0);
    expect(needleScore(undefined, ctx)).toBe(0);
    expect(needleScore('', ctx)).toBe(0);
  });

  it('ranks active rung > future rung > unknown', () => {
    expect(needleScore('V1', ctx)).toBeGreaterThan(needleScore('V2', ctx));
    expect(needleScore('V2', ctx)).toBeGreaterThan(needleScore(null, ctx));
  });

  it('active rung base is 2.x, future rung base is 1.x', () => {
    expect(Math.floor(needleScore('V1', ctx))).toBe(2);
    expect(Math.floor(needleScore('V2', ctx))).toBe(1);
  });

  it('the completion bonus orders within a tier (closer-to-done edges up) but never crosses tiers', () => {
    const c = { activeRungKey: null, rungProgressByKey: { V2: 90, V3: 10 } };
    // both future (base 1); V2 (90%) should edge above V3 (10%)
    expect(needleScore('V2', c)).toBeGreaterThan(needleScore('V3', c));
    // ...but the bonus is small enough never to lift a future rung to the active tier
    const activeCtx = { activeRungKey: 'V1', rungProgressByKey: { V1: 0, V2: 100 } };
    expect(needleScore('V1', activeCtx)).toBeGreaterThan(needleScore('V2', activeCtx));
  });

  it('a missing/non-finite rung progress yields no bonus (base only)', () => {
    expect(needleScore('V1', { activeRungKey: 'V1' })).toBe(2);
    expect(needleScore('V1', { activeRungKey: 'V1', rungProgressByKey: { V1: NaN } })).toBe(2);
  });
});

describe('rungProgressByKey', () => {
  it('folds rollup rows to {rung_key: progress_pct}, skipping null pct', () => {
    const rows = [
      { rung_key: 'V1', progress_pct: 57 },
      { rung_key: 'V2', progress_pct: null }, // honest unmeasurable -> skipped
      { rung_key: 'V3', progress_pct: 20 },
    ];
    expect(rungProgressByKey(rows)).toEqual({ V1: 57, V3: 20 });
  });

  it('keeps the highest progress when multiple waves map to the same rung', () => {
    const rows = [
      { rung_key: 'V1', progress_pct: 40 },
      { rung_key: 'V1', progress_pct: 70 },
    ];
    expect(rungProgressByKey(rows)).toEqual({ V1: 70 });
  });

  it('handles empty/garbage input', () => {
    expect(rungProgressByKey([])).toEqual({});
    expect(rungProgressByKey(null)).toEqual({});
    expect(rungProgressByKey([{ rung_key: null, progress_pct: 5 }, {}])).toEqual({});
  });
});

describe('buildSdRungMap (reuses mapWaveToRung)', () => {
  const wavesById = {
    'w1': { id: 'w1', time_horizon: 'now' },               // -> V1
    'w2': { id: 'w2', metadata: { rung_key: 'V2' } },       // explicit -> V2
    'w3': { id: 'w3', time_horizon: 'eventually' },         // -> null (unmappable)
  };

  it('maps promoted SD keys to rung via the wave linkage', () => {
    const items = [
      { promoted_to_sd_key: 'SD-A', wave_id: 'w1' },
      { promoted_to_sd_key: 'SD-B', wave_id: 'w2' },
    ];
    expect(buildSdRungMap(items, wavesById)).toEqual({ 'SD-A': 'V1', 'SD-B': 'V2' });
  });

  it('skips unpromoted, unknown-wave, and unmappable-wave items (honest, no guess)', () => {
    const items = [
      { promoted_to_sd_key: null, wave_id: 'w1' },          // unpromoted
      { promoted_to_sd_key: 'SD-C', wave_id: 'missing' },   // unknown wave
      { promoted_to_sd_key: 'SD-D', wave_id: 'w3' },        // unmappable rung
      { promoted_to_sd_key: 'SD-E', wave_id: 'w1' },        // valid
    ];
    expect(buildSdRungMap(items, wavesById)).toEqual({ 'SD-E': 'V1' });
  });

  it('handles empty input', () => {
    expect(buildSdRungMap(null)).toEqual({});
    expect(buildSdRungMap([], {})).toEqual({});
  });

  it('SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 regression: stays non-empty for promoted items on non-approved-status waves (active/completed), proving the map is not scoped to approved waves only', () => {
    const wavesByIdMixedStatus = {
      w1: { id: 'w1', status: 'active', time_horizon: 'now' },
      w2: { id: 'w2', status: 'completed', metadata: { rung_key: 'V2' } },
    };
    const items = [
      { promoted_to_sd_key: 'SD-A', wave_id: 'w1' },
      { promoted_to_sd_key: 'SD-B', wave_id: 'w2' },
    ];
    expect(buildSdRungMap(items, wavesByIdMixedStatus)).toEqual({ 'SD-A': 'V1', 'SD-B': 'V2' });
  });

  it('SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 regression: coordinator-backlog-rank.mjs still sources its rung-map input from unscoped roadmap_wave_items/roadmap_waves, not the approved-only v_plan_of_record_remainder view (FR-4 -- repointing this file would silently empty the map for non-approved-wave SDs)', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'scripts/coordinator-backlog-rank.mjs'), 'utf8');
    expect(source).toContain("sb.from('roadmap_wave_items').select('promoted_to_sd_key, wave_id').not('promoted_to_sd_key', 'is', null)");
    expect(source).toContain("sb.from('roadmap_waves').select('id, time_horizon, metadata')");
    expect(source).not.toContain('v_plan_of_record_remainder');
  });
});
