// Tests for lib/vision/rung-progress-rollup.mjs
// SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-B (FR-1)
//
// SD-LEO-INFRA-ROADMAP-WAVES-PROGRESS-001: THESE 17 TESTS HAD NEVER RUN. The file was named
// `.test.mjs` and used node:test, but the vitest unit project includes `**/*.test.js` plus
// `.test.mjs` ONLY under tests/unit/org/ and tests/unit/venture-email/ — so this path matched
// nothing and the runner silently skipped it. Two of its assertions had ALREADY been broken by
// SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-8, which added canonical-roadmap scoping to
// runRollup without teaching this stub about strategic_roadmaps; res.rows came back empty and
// nobody heard. Switched to the vitest runner (assert still works) and renamed to .test.js so the
// module at the centre of this SD is actually covered.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  RUNG_BY_HORIZON,
  mapWaveToRung,
  krProgressPct,
  aggregateKrProgress,
  computeWaveRollup,
  rollupWaves,
  runRollup,
} from '../../../lib/vision/rung-progress-rollup.mjs';

test('RUNG_BY_HORIZON maps now/next/later → V1/V2/V3 (not eventually)', () => {
  assert.equal(RUNG_BY_HORIZON.now, 'V1');
  assert.equal(RUNG_BY_HORIZON.next, 'V2');
  assert.equal(RUNG_BY_HORIZON.later, 'V3');
  assert.equal(RUNG_BY_HORIZON.eventually, undefined);
});

test('mapWaveToRung: metadata.rung_key wins over time_horizon', () => {
  assert.equal(mapWaveToRung({ metadata: { rung_key: 'V2' }, time_horizon: 'now' }), 'V2');
  assert.equal(mapWaveToRung({ time_horizon: 'next' }), 'V2');
  assert.equal(mapWaveToRung({ time_horizon: null }), null);
  assert.equal(mapWaveToRung({ time_horizon: 'eventually' }), null);
  assert.equal(mapWaveToRung({}), null);
});

test('krProgressPct: increase direction = (cur-base)/(target-base), clamped 0-100', () => {
  assert.equal(krProgressPct({ baseline_value: 0, current_value: 5, target_value: 10, direction: 'increase' }), 50);
  assert.equal(krProgressPct({ baseline_value: 0, current_value: 0, target_value: 1, direction: 'increase' }), 0);
  assert.equal(krProgressPct({ baseline_value: 0, current_value: 20, target_value: 10, direction: 'increase' }), 100); // clamp
});

test('krProgressPct: decrease direction inverts the span', () => {
  assert.equal(krProgressPct({ baseline_value: 100, current_value: 50, target_value: 0, direction: 'decrease' }), 50);
  assert.equal(krProgressPct({ baseline_value: 100, current_value: 100, target_value: 0, direction: 'decrease' }), 0);
});

test('krProgressPct: zero span / non-numeric => null (never fabricates 0)', () => {
  assert.equal(krProgressPct({ baseline_value: 5, current_value: 5, target_value: 5, direction: 'increase' }), null);
  assert.equal(krProgressPct({ baseline_value: null, current_value: 1, target_value: 2 }), null);
  assert.equal(krProgressPct({}), null);
});

test('aggregateKrProgress: mean of measurable KRs; null when none measurable', () => {
  assert.equal(aggregateKrProgress([
    { baseline_value: 0, current_value: 5, target_value: 10, direction: 'increase' }, // 50
    { baseline_value: 0, current_value: 10, target_value: 10, direction: 'increase' }, // 100
  ]), 75);
  assert.equal(aggregateKrProgress([{ baseline_value: 5, current_value: 5, target_value: 5 }]), null);
  assert.equal(aggregateKrProgress([]), null);
});

test('computeWaveRollup: BUILD rung (active) → gauge build pct', () => {
  const r = computeWaveRollup({ id: 'w1', title: 'Foundation', time_horizon: 'now' }, { activeRungKey: 'V1', gaugeBuildPct: 57, krAggByObjective: {} });
  assert.equal(r.type, 'build');
  assert.equal(r.rung_key, 'V1');
  assert.equal(r.progress_pct, 57);
  assert.equal(r.source, 'computeBuildGauge');
});

test('computeWaveRollup: BUILD rung but gauge unavailable → null (honest)', () => {
  const r = computeWaveRollup({ id: 'w1', time_horizon: 'now' }, { activeRungKey: 'V1', gaugeBuildPct: null });
  assert.equal(r.type, 'build');
  assert.equal(r.progress_pct, null);
});

test('computeWaveRollup: OUTCOME rung → KR aggregate of linked objectives', () => {
  const r = computeWaveRollup(
    { id: 'w3', title: 'Revenue', time_horizon: 'next', okr_objective_ids: ['obj-a', 'obj-b'] },
    { activeRungKey: 'V1', krAggByObjective: { 'obj-a': 20, 'obj-b': 40 } },
  );
  assert.equal(r.type, 'outcome');
  assert.equal(r.rung_key, 'V2');
  assert.equal(r.progress_pct, 30);
  assert.equal(r.source, 'key_results');
});

test('computeWaveRollup: OUTCOME rung with no objectives → null + reason', () => {
  const r = computeWaveRollup({ id: 'w5', time_horizon: 'later', okr_objective_ids: [] }, { activeRungKey: 'V1', krAggByObjective: {} });
  assert.equal(r.type, 'outcome');
  assert.equal(r.progress_pct, null);
  assert.match(r.reason, /no okr_objective_ids/);
});

test('computeWaveRollup: OUTCOME rung whose objectives have no measurable KRs → null', () => {
  const r = computeWaveRollup({ id: 'w5', time_horizon: 'next', okr_objective_ids: ['obj-x'] }, { activeRungKey: 'V1', krAggByObjective: { 'obj-x': null } });
  assert.equal(r.progress_pct, null);
  assert.match(r.reason, /no measurable KRs/);
});

test('computeWaveRollup: no rung mapping → skip (null), never fabricated', () => {
  const r = computeWaveRollup({ id: 'w0', title: 'Themed', time_horizon: null }, { activeRungKey: 'V1' });
  assert.equal(r.source, 'skip');
  assert.equal(r.progress_pct, null);
});

test('rollupWaves maps all waves', () => {
  const rows = rollupWaves(
    [{ id: 'a', time_horizon: 'now' }, { id: 'b', time_horizon: null }],
    { activeRungKey: 'V1', gaugeBuildPct: 50, krAggByObjective: {} },
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].progress_pct, 50);
  assert.equal(rows[1].progress_pct, null);
});

// ── runRollup IO with an injected supabase stub ──
// The `roadmaps` default models ONE active canonical roadmap. Without it resolveCanonicalRoadmap
// (added by REGENERATION-DUPLICATES FR-8) resolves nothing, runRollup fails closed to zero waves,
// and every row assertion below fails on an empty array — which is exactly what was happening,
// unobserved, for as long as this file has been unrunnable.
function stubSupabase({ activeRung = { rung_key: 'V1' }, krs = [], waves = [], captureUpdates,
  roadmaps = [{ id: 'rm-1', status: 'active', created_at: '2026-01-01T00:00:00Z' }] } = {}) {
  return {
    from(table) {
      const chain = {
        _table: table, _filters: {},
        select() { return chain; },
        eq(col, val) { chain._filters[col] = val; return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (table === 'vision_ladder_rungs') return Promise.resolve({ data: activeRung, error: null });
          if (table === 'strategic_roadmaps') return Promise.resolve({ data: roadmaps[0] || null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === 'strategic_roadmaps') return Promise.resolve({ data: roadmaps[0] || null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) { chain._payload = payload; return chain; },
        then(res, rej) {
          if (table === 'strategic_roadmaps') return Promise.resolve({ data: roadmaps, error: null }).then(res, rej);
          if (table === 'key_results') return Promise.resolve({ data: krs, error: null }).then(res, rej);
          if (table === 'roadmap_waves') {
            if (chain._payload) { // an update().eq() resolution
              if (captureUpdates) captureUpdates({ id: chain._filters.id, payload: chain._payload });
              return Promise.resolve({ error: null }).then(res, rej);
            }
            return Promise.resolve({ data: waves, error: null }).then(res, rej);
          }
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

test('runRollup dry-run: computes rows, writes nothing', async () => {
  const updates = [];
  const supabase = stubSupabase({
    krs: [{ objective_id: 'obj-a', baseline_value: 0, current_value: 2, target_value: 10, direction: 'increase' }],
    waves: [
      { id: 'w1', title: 'F', time_horizon: 'now' },
      { id: 'w3', title: 'R', time_horizon: 'next', okr_objective_ids: ['obj-a'] },
      { id: 'wx', title: 'T', time_horizon: null },
    ],
    captureUpdates: (u) => updates.push(u),
  });
  const res = await runRollup({ supabase, computeGaugeFn: async () => ({ available: true, build_pct: 57 }), apply: false, log: () => {} });
  assert.equal(res.ok, true);
  assert.equal(res.activeRungKey, 'V1');
  assert.equal(res.gaugeBuildPct, 57);
  assert.equal(res.written, 0);
  assert.equal(updates.length, 0);
  const byId = Object.fromEntries(res.rows.map((r) => [r.wave_id, r]));
  assert.equal(byId.w1.progress_pct, 57);   // build
  assert.equal(byId.w3.progress_pct, 20);   // outcome: 2/10=20%
  assert.equal(byId.wx.progress_pct, null); // skip
});

// SD-LEO-INFRA-ROADMAP-WAVES-PROGRESS-001 (FR-1): INVERTED. This asserted that apply:true wrote
// progress_pct back to two wave rows — w1 taking the build gauge (60) and w3 a KR aggregate (50).
// Both are RUNG-level figures, and roadmap_waves is keyed by wave, so those writes are precisely
// how one measurement came to sit on four rows at once. apply:true is now inert: the values are
// still computed and returned in `rows` for the in-memory consumers, and nothing is persisted.
test('runRollup apply: computes rows but persists NOTHING', async () => {
  const updates = [];
  const supabase = stubSupabase({
    krs: [{ objective_id: 'obj-a', baseline_value: 0, current_value: 5, target_value: 10, direction: 'increase' }],
    waves: [
      { id: 'w1', time_horizon: 'now' },
      { id: 'w3', time_horizon: 'next', okr_objective_ids: ['obj-a'] },
      { id: 'wx', time_horizon: null },
    ],
    captureUpdates: (u) => updates.push(u),
  });
  const res = await runRollup({ supabase, computeGaugeFn: async () => ({ available: true, build_pct: 60 }), apply: true, log: () => {} });
  assert.equal(res.written, 0);
  assert.equal(updates.length, 0, 'apply:true must not write roadmap_waves.progress_pct');
  // The computation itself is unchanged — the values still reach the in-memory consumers.
  const byId = Object.fromEntries(res.rows.map((r) => [r.wave_id, r]));
  assert.equal(byId.w1.progress_pct, 60);
  assert.equal(byId.w3.progress_pct, 50);
  assert.equal(byId.wx.progress_pct, null);
});

test('runRollup fail-soft: gauge throw → build rungs null, no throw', async () => {
  const supabase = stubSupabase({ waves: [{ id: 'w1', time_horizon: 'now' }] });
  const res = await runRollup({ supabase, computeGaugeFn: async () => { throw new Error('gauge boom'); }, apply: false, log: () => {} });
  assert.equal(res.ok, true);
  assert.equal(res.gaugeBuildPct, null);
  assert.equal(res.rows[0].progress_pct, null);
});

test('runRollup: no supabase → ok:false, never throws', async () => {
  const res = await runRollup({ supabase: null });
  assert.equal(res.ok, false);
  assert.match(res.error, /no supabase/);
});
