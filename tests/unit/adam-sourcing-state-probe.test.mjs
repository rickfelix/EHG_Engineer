// Tests for the SOURCING SSOT STATE probe in scripts/adam-startup-check.mjs
// SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001 (FR-2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCING_FLAGS,
  isSourcingFlagOn,
  readSourcingFlags,
  summarizeUnpromotedByWave,
  summarizeBacklogDisposition,
  renderSourcingStateLines,
  fetchSourcingState,
  renderSourcingState,
} from '../../scripts/adam-startup-check.mjs';

test('SOURCING_FLAGS lists the six engine activation flags in escalation order', () => {
  assert.deepEqual(SOURCING_FLAGS, [
    'SOURCING_ENGINE_V1',
    'SOURCING_ROADMAP_ENGINE_V1',
    'SOURCING_GAUGE_GAP_MINER_V1',
    'SOURCING_DEFERRED_WATCHER_V1',
    'SOURCING_PROACTIVE_POPULATOR_V1',
    'LEO_ROADMAP_AUTOSOURCE',
  ]);
});

test('isSourcingFlagOn: on|1|true => true; everything else (incl. undefined) => false', () => {
  for (const v of ['on', 'ON', '1', 'true', 'TRUE']) assert.equal(isSourcingFlagOn({ F: v }, 'F'), true, v);
  for (const v of ['off', '0', 'false', '', 'yes', undefined]) assert.equal(isSourcingFlagOn({ F: v }, 'F'), false, String(v));
  assert.equal(isSourcingFlagOn({}, 'MISSING'), false);
});

test('readSourcingFlags reports per-flag state from env', () => {
  const flags = readSourcingFlags({ SOURCING_ENGINE_V1: 'on', SOURCING_GAUGE_GAP_MINER_V1: '1' });
  assert.equal(flags.length, 6);
  assert.equal(flags.find((f) => f.flag === 'SOURCING_ENGINE_V1').on, true);
  assert.equal(flags.find((f) => f.flag === 'SOURCING_GAUGE_GAP_MINER_V1').on, true);
  assert.equal(flags.find((f) => f.flag === 'LEO_ROADMAP_AUTOSOURCE').on, false);
});

test('summarizeUnpromotedByWave counts only null promoted_to_sd_key, grouped + ordered by wave rank', () => {
  const items = [
    { wave_id: 'w2', promoted_to_sd_key: null },
    { wave_id: 'w1', promoted_to_sd_key: null },
    { wave_id: 'w1', promoted_to_sd_key: null },
    { wave_id: 'w1', promoted_to_sd_key: 'SD-X' }, // promoted — excluded
  ];
  const waves = [
    { id: 'w1', title: 'Wave One', sequence_rank: 0 },
    { id: 'w2', title: 'Wave Two', sequence_rank: 1 },
  ];
  const r = summarizeUnpromotedByWave(items, waves);
  assert.equal(r.totalUnpromoted, 3);
  assert.deepEqual(r.byWave.map((w) => [w.rank, w.count, w.title]), [[0, 2, 'Wave One'], [1, 1, 'Wave Two']]);
});

test('summarizeUnpromotedByWave: unknown wave id degrades to a labelled bucket, not a crash', () => {
  const r = summarizeUnpromotedByWave([{ wave_id: 'ghost', promoted_to_sd_key: null }], []);
  assert.equal(r.totalUnpromoted, 1);
  assert.equal(r.byWave[0].title, '(unknown wave)');
});

test('summarizeBacklogDisposition computes pct and is divide-by-zero safe', () => {
  assert.deepEqual(summarizeBacklogDisposition(159, 13), { total: 159, dispositioned: 13, pct: 8 });
  assert.deepEqual(summarizeBacklogDisposition(0, 0), { total: 0, dispositioned: 0, pct: 0 });
});

test('renderSourcingStateLines warns ALL OFF when no flag is on, and lists the SSOT layers', () => {
  const out = renderSourcingStateLines({
    flags: readSourcingFlags({}),
    wave: { totalUnpromoted: 5, byWave: [{ rank: 0, count: 5, title: 'Wave One' }] },
    backlog: { total: 10, dispositioned: 2, pct: 20 },
  });
  assert.match(out, /ALL OFF/);
  assert.match(out, /unpromoted: 5/);
  assert.match(out, /disposition: 2\/10 \(20%\)/);
  assert.match(out, /LAST-RESORT/);
});

test('renderSourcingStateLines does NOT warn ALL OFF when a flag is on', () => {
  const out = renderSourcingStateLines({ flags: readSourcingFlags({ SOURCING_ENGINE_V1: 'on' }), wave: null, backlog: null });
  assert.doesNotMatch(out, /ALL OFF/);
  assert.match(out, /🟢 on\s+SOURCING_ENGINE_V1/);
  assert.match(out, /unavailable — DB read skipped/); // wave + backlog null → fail-open lines
});

// Injected-supabase fetch: proves the DB read shape without a live DB (FR-2 hermetic).
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: fetchSourcingState now reads
// v_plan_of_record_remainder (approved-wave-only, stamped remainder_state) instead of raw
// roadmap_wave_items/roadmap_waves — stub the view's row shape directly.
function stubSupabase({ remainderRows = [], total = 0, dispositioned = 0 } = {}) {
  return {
    from(table) {
      const chain = {
        _table: table,
        select(_cols, opts) { this._head = !!(opts && opts.head); return this; },
        is() { return this; },
        not() { this._dispositioned = true; return this; },
        then(res, rej) {
          if (this._table === 'v_plan_of_record_remainder') return Promise.resolve({ data: remainderRows, error: null }).then(res, rej);
          if (this._table === 'sd_backlog_map') return Promise.resolve({ count: this._dispositioned ? dispositioned : total, error: null }).then(res, rej);
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

test('fetchSourcingState wires the injected client into the pure summaries', async () => {
  const supabase = stubSupabase({
    remainderRows: [
      { wave_id: 'w1', title: 'Wave One', wave_sequence_rank: 0, remainder_state: 'promotable_now' },
      { wave_id: 'w1', title: 'Wave One', wave_sequence_rank: 0, remainder_state: 'gated_on_chairman' },
      { wave_id: 'w1', title: 'Wave One', wave_sequence_rank: 0, remainder_state: 'void' }, // excluded from "unpromoted"
    ],
    total: 100, dispositioned: 25,
  });
  const { wave, backlog } = await fetchSourcingState({ supabase, env: {} });
  assert.equal(wave.totalUnpromoted, 2);
  assert.deepEqual(backlog, { total: 100, dispositioned: 25, pct: 25 });
});

test('fetchSourcingState fail-open: no creds + no client => nulls (never throws)', async () => {
  const { wave, backlog } = await fetchSourcingState({ supabase: null, env: {} });
  assert.equal(wave, null);
  assert.equal(backlog, null);
});

test('renderSourcingState is fail-open and always returns a string section', async () => {
  const out = await renderSourcingState({ supabase: null, env: {} });
  assert.equal(typeof out, 'string');
  assert.match(out, /SOURCING SSOT STATE/);
});
