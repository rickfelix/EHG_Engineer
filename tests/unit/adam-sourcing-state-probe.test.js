// Tests for the SOURCING SSOT STATE probe in scripts/adam-startup-check.mjs
//
// SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 (FR-5): RENAMED FROM .test.mjs, WHERE IT NEVER RAN.
// The vitest unit include does not match .test.mjs, so every assertion below was dead: this file
// asserted a six-flag contract that nothing enforced, for the exact function this SD modifies.
// A test that cannot run is the same defect class as a flag nothing reads — which is what the SD
// is about, so leaving it in place while fixing decorative flags would have been incoherent.
// Converted from node:test to vitest (assert stays; the runner is what changed).
// SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001 (FR-2)
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  SOURCING_FLAGS,
  RETIRED_SOURCING_FLAGS,
  isSourcingFlagOn,
  readSourcingFlags,
  summarizeUnpromotedByWave,
  summarizeBacklogDisposition,
  renderSourcingStateLines,
  fetchSourcingState,
  renderSourcingState,
} from '../../scripts/adam-startup-check.mjs';

test('SOURCING_FLAGS lists ONLY the flags something actually reads (FR-5)', () => {
  // Was a six-flag contract. Four of them had zero executable readers anywhere in the repo and
  // were retired; the two left are read at gauge-gap-miner.js:296 and deferred-watcher.js:30.
  assert.deepEqual(SOURCING_FLAGS, [
    'SOURCING_GAUGE_GAP_MINER_V1',
    'SOURCING_DEFERRED_WATCHER_V1',
  ]);
});

test('FR-5 TS-9 ENV-VAR-ALONE CONTROL — setting the retired flags changes NOTHING', () => {
  // The criterion this SD refused to ship: "all six read ON in the probe", satisfiable by
  // exporting four env vars while changing zero behaviour. This test makes that unsatisfiable —
  // if anyone re-adds a decorative flag to the display list, the badge diff below goes non-empty
  // and this fails.
  const env = Object.fromEntries(RETIRED_SOURCING_FLAGS.map((f) => [f, 'on']));
  const withRetiredFlagsOn = renderSourcingStateLines({ flags: readSourcingFlags(env) });
  const withNothingSet = renderSourcingStateLines({ flags: readSourcingFlags({}) });
  assert.equal(withRetiredFlagsOn, withNothingSet);
  for (const f of RETIRED_SOURCING_FLAGS) assert.doesNotMatch(withRetiredFlagsOn, new RegExp(f));
});

test('FR-5: the retired flags are recorded, not silently dropped', () => {
  assert.equal(RETIRED_SOURCING_FLAGS.length, 4);
  for (const f of RETIRED_SOURCING_FLAGS) assert.equal(SOURCING_FLAGS.includes(f), false);
});

test('isSourcingFlagOn: on|1|true => true; everything else (incl. undefined) => false', () => {
  for (const v of ['on', 'ON', '1', 'true', 'TRUE']) assert.equal(isSourcingFlagOn({ F: v }, 'F'), true, v);
  for (const v of ['off', '0', 'false', '', 'yes', undefined]) assert.equal(isSourcingFlagOn({ F: v }, 'F'), false, String(v));
  assert.equal(isSourcingFlagOn({}, 'MISSING'), false);
});

test('readSourcingFlags reports per-flag state from env', () => {
  // A RETIRED flag set to 'on' is not reported at all — it has no entry to report.
  const flags = readSourcingFlags({ SOURCING_ENGINE_V1: 'on', SOURCING_GAUGE_GAP_MINER_V1: '1' });
  assert.equal(flags.length, 2);
  assert.equal(flags.find((f) => f.flag === 'SOURCING_GAUGE_GAP_MINER_V1').on, true);
  assert.equal(flags.find((f) => f.flag === 'SOURCING_DEFERRED_WATCHER_V1').on, false);
  assert.equal(flags.find((f) => f.flag === 'SOURCING_ENGINE_V1'), undefined);
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
  const out = renderSourcingStateLines({ flags: readSourcingFlags({ SOURCING_GAUGE_GAP_MINER_V1: 'on' }), wave: null, backlog: null });
  assert.doesNotMatch(out, /ALL OFF/);
  assert.match(out, /🟢 on\s+SOURCING_GAUGE_GAP_MINER_V1/);
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
        // The stub PREDATES the fetchAllPaginated repoint and lacked .range(), so the paginated
        // read threw and wave came back null — undetected, because this file never ran.
        range(from) { this._offset = from; return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        then(res, rej) {
          if (this._table === 'v_plan_of_record_remainder') return Promise.resolve({ data: this._offset ? [] : remainderRows, error: null }).then(res, rej);
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

// ── SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001, TESTING review 57879900 (C2/C4) ──────────────
// Nothing exercised fetchSourcingState -> renderSourcingState, so wiring mutants survived: nulling
// the demand read, nulling the arms read, and deleting the no-creds synthetic payload. These cover
// the composition, and C2 — an unreadable arm table rendering as a confident "off".

/** A client whose every query REJECTS — the DB-fault case. */
const throwingClient = () => ({ from() { throw new Error('relation unavailable'); } });

test('C2: an UNREADABLE arm table must not render as "off" on the line labelled OPERATIVE', async () => {
  const out = await renderSourcingState({ supabase: throwingClient(), env: {} });
  // The bug this replaces: readSourcingEngineFlagsFromDb never throws — it swallows the error and
  // falls back to the ENV reader, which with {} reports every arm disabled. Same fault, two
  // verdicts, and the confident one was the lie.
  assert.match(out, /UNREADABLE/);
  assert.doesNotMatch(out, /⚪ off {2}auto-refill/);
});

test('C4: a DB fault yields UNMEASURABLE per engine — never a silent NEVER RAN', async () => {
  const out = await renderSourcingState({ supabase: throwingClient(), env: {} });
  // "I could not read the log" and "the engine has never run" are different facts. Collapsing them
  // re-creates the ambiguity the whole SD removes.
  assert.match(out, /UNMEASURABLE/);
  assert.doesNotMatch(out, /NEVER RAN/);
});

test('C4: no credentials renders UNMEASURABLE, not NEVER RAN (the synthetic payload is load-bearing)', async () => {
  const { demand } = await fetchSourcingState({ supabase: null, env: {} });
  assert.equal(Array.isArray(demand), true);
  assert.equal(demand.length > 0, true);
  for (const d of demand) assert.equal(d.decision.decision, 'unmeasurable');
  const out = await renderSourcingState({ supabase: null, env: {} });
  assert.doesNotMatch(out, /NEVER RAN/);
});

test('C4: the demand section is rendered by the composed path, not only by the pure renderer', async () => {
  // Kills "drop demand from the renderSourcingStateLines call" and "replace the read with null".
  const out = await renderSourcingState({ supabase: null, env: {} });
  assert.match(out, /\[demand-gate\]/);
  for (const engine of ['refill-auto-promote', 'fr-c-generator']) assert.match(out, new RegExp(engine));
});
