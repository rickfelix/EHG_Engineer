/**
 * SD-FDBK-INFRA-FLOW-IMPEDIMENT-COORDINATOR-001
 * Unit tests for the `sd-baseline add-item` helpers + orchestration.
 *
 * Network-free: imports ONLY lib/sd-baseline/build-item.js (no side effects) and
 * drives addItemCore with a hand-rolled fake Supabase client. Never imports
 * scripts/sd-baseline.js (which auto-runs the CLI on import).
 */
import { describe, it, expect } from 'vitest';
import {
  deriveTrack,
  trackName,
  computeNextRank,
  buildBaselineItemRow,
  isTerminalStatus,
  addItemCore,
  TRACK_WHITELIST,
} from '../../lib/sd-baseline/build-item.js';

// ── Fake Supabase client tuned to addItemCore's exact call sequence ──────────
// plan: { baseline, sd, sdError, existingItem, ranksSeq[], insertSeq[], actuals }
function makeFakeClient(plan = {}) {
  const calls = { itemInserts: [], actualsInserts: 0, rankReads: 0 };
  let insertIdx = 0;
  let rankIdx = 0;

  function builder(table) {
    const state = { table, op: 'select', cols: '', filters: {}, row: null };
    const api = {
      select(cols) { state.op = 'select'; state.cols = cols || ''; return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      insert(row) { state.op = 'insert'; state.row = row; return api; },
      maybeSingle() { return Promise.resolve(resolveSingle()); },
      single() { return Promise.resolve(resolveSingle()); },
      then(onF, onR) { return Promise.resolve(resolveTerminal()).then(onF, onR); },
    };

    function resolveSingle() {
      if (state.table === 'sd_execution_baselines') return { data: plan.baseline ?? null, error: null };
      if (state.table === 'strategic_directives_v2') return { data: plan.sd ?? null, error: plan.sdError ?? null };
      if (state.table === 'sd_baseline_items') {
        // select('id') with sd_id filter == idempotency pre-check
        return { data: plan.existingItem ?? null, error: null };
      }
      return { data: null, error: null };
    }
    function resolveTerminal() {
      if (state.op === 'insert' && state.table === 'sd_baseline_items') {
        calls.itemInserts.push(state.row);
        const res = plan.insertSeq?.[insertIdx++] ?? { error: null };
        return res;
      }
      if (state.op === 'insert' && state.table === 'sd_execution_actuals') {
        calls.actualsInserts++;
        return plan.actuals ?? { error: null };
      }
      if (state.op === 'select' && state.table === 'sd_baseline_items') {
        // rank list read
        calls.rankReads++;
        const rows = plan.ranksSeq?.[rankIdx++] ?? [];
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    }
    return api;
  }

  return { from: (t) => builder(t), __calls: calls };
}

const SD = {
  id: 'uuid-1111',
  sd_key: 'SD-TEST-ADD-001',
  title: 'Test SD',
  status: 'draft',
  priority: 'medium',
  dependencies: [],
  metadata: { execution_track: 'Infrastructure' },
};
const BASELINE = { id: 'baseline-1', baseline_name: 'Active BL' };
const calcHealth1 = async () => 1.0;
const silent = () => {};

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('buildBaselineItemRow (pure)', () => {
  it('TS-1: sd_id is sd_key, never the UUID id', () => {
    const row = buildBaselineItemRow({ sd: SD, baselineId: 'b1', sequenceRank: 5, healthScore: 1.0 });
    expect(row.sd_id).toBe('SD-TEST-ADD-001');
    expect(row.sd_id).not.toBe(SD.id);
  });

  it('TS-4: is_ready boundary at healthScore >= 1.0', () => {
    expect(buildBaselineItemRow({ sd: SD, baselineId: 'b', sequenceRank: 1, healthScore: 0.99 }).is_ready).toBe(false);
    expect(buildBaselineItemRow({ sd: SD, baselineId: 'b', sequenceRank: 1, healthScore: 1.0 }).is_ready).toBe(true);
    expect(buildBaselineItemRow({ sd: SD, baselineId: 'b', sequenceRank: 1, healthScore: 1.01 }).is_ready).toBe(true);
  });

  it('TS-4: notes carries the incremental audit marker', () => {
    const row = buildBaselineItemRow({ sd: SD, baselineId: 'b', sequenceRank: 1, healthScore: 1.0 });
    expect(row.notes).toContain('Coordinator-added (incremental, no rebaseline)');
    expect(row.notes).toContain(SD.title);
  });

  it('throws when sd.sd_key is missing (load-bearing JOIN key)', () => {
    expect(() => buildBaselineItemRow({ sd: { id: 'x' }, baselineId: 'b', sequenceRank: 1, healthScore: 1 }))
      .toThrow(/sd_key is required/);
  });

  it('dependencies_snapshot passes through (null when absent)', () => {
    expect(buildBaselineItemRow({ sd: { sd_key: 'X', dependencies: [{ sd_key: 'SD-DEP' }] }, baselineId: 'b', sequenceRank: 1, healthScore: 1 }).dependencies_snapshot)
      .toEqual([{ sd_key: 'SD-DEP' }]);
    expect(buildBaselineItemRow({ sd: { sd_key: 'X' }, baselineId: 'b', sequenceRank: 1, healthScore: 1 }).dependencies_snapshot).toBeNull();
  });
});

describe('deriveTrack (pure)', () => {
  it('TS-2: maps metadata.execution_track to track codes (unknown -> null)', () => {
    expect(deriveTrack('Infrastructure')).toBe('A');
    expect(deriveTrack('Safety')).toBe('A');
    expect(deriveTrack('Feature')).toBe('B');
    expect(deriveTrack('Quality')).toBe('C');
    expect(deriveTrack('STANDALONE')).toBe('STANDALONE');
    expect(deriveTrack('SomethingElse')).toBeNull();
    expect(deriveTrack(undefined)).toBeNull();
  });

  it('TS-2: an explicit --track flag overrides metadata and is upper-cased', () => {
    expect(deriveTrack('Infrastructure', 'c')).toBe('C');
    expect(deriveTrack('Quality', 'STANDALONE')).toBe('STANDALONE');
  });

  it('TS-2: track output is ALWAYS null or in the CHECK whitelist (avoids 23514)', () => {
    for (const m of ['Infrastructure', 'Safety', 'Feature', 'Quality', 'STANDALONE', 'weird', undefined, null]) {
      const t = deriveTrack(m);
      expect(t === null || TRACK_WHITELIST.includes(t)).toBe(true);
    }
  });

  it('TS-2: an invalid --track flag throws (user error, not a silent 23514)', () => {
    expect(() => deriveTrack('Feature', 'Z')).toThrow(/Invalid --track/);
  });

  it('trackName maps codes to human labels', () => {
    expect(trackName('A')).toBe('Infrastructure/Safety');
    expect(trackName(null)).toBe('Unassigned');
  });
});

describe('computeNextRank (pure)', () => {
  it('TS-3: MAX+1 when no requested rank', () => {
    expect(computeNextRank([3, 7, 12])).toBe(13);
  });
  it('TS-3: 1 when the baseline is empty', () => {
    expect(computeNextRank([])).toBe(1);
    expect(computeNextRank(undefined)).toBe(1);
  });
  it('TS-3: an explicit requested rank wins', () => {
    expect(computeNextRank([3, 7], 5)).toBe(5);
  });
  it('TS-3: an invalid requested rank throws', () => {
    expect(() => computeNextRank([1], 0)).toThrow(/Invalid --rank/);
    expect(() => computeNextRank([1], 'abc')).toThrow(/Invalid --rank/);
  });
});

describe('isTerminalStatus (pure)', () => {
  it('flags completed/cancelled/deferred only', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('deferred')).toBe(true);
    expect(isTerminalStatus('draft')).toBe(false);
    expect(isTerminalStatus('active')).toBe(false);
  });
});

// ── addItemCore orchestration (DI fake client) ───────────────────────────────
describe('addItemCore (DI)', () => {
  it('errors with usage when sdKey is missing', async () => {
    const c = makeFakeClient({});
    const r = await addItemCore({ supabase: c, sdKey: '', calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('error');
    expect(c.__calls.itemInserts).toHaveLength(0);
  });

  it('TS-5: no active baseline -> guidance, no insert', async () => {
    const c = makeFakeClient({ baseline: null });
    const r = await addItemCore({ supabase: c, sdKey: 'SD-X', calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('guidance');
    expect(c.__calls.itemInserts).toHaveLength(0);
  });

  it('SD not found -> error, no insert', async () => {
    const c = makeFakeClient({ baseline: BASELINE, sd: null });
    const r = await addItemCore({ supabase: c, sdKey: 'SD-MISSING', calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('error');
    expect(c.__calls.itemInserts).toHaveLength(0);
  });

  it('TS-6: terminal-status SD is refused, no insert', async () => {
    const c = makeFakeClient({ baseline: BASELINE, sd: { ...SD, status: 'completed' } });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('error');
    expect(c.__calls.itemInserts).toHaveLength(0);
  });

  it('TS-7: idempotent pre-check (already in baseline) -> noop, no insert', async () => {
    const c = makeFakeClient({ baseline: BASELINE, sd: SD, existingItem: { id: 'item-1' } });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('noop');
    expect(c.__calls.itemInserts).toHaveLength(0);
  });

  it('TS-9: happy path -> added; one item insert with sd_id=sd_key; actuals inserted', async () => {
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[{ sequence_rank: 3 }, { sequence_rank: 7 }]],
      insertSeq: [{ error: null }],
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('added');
    expect(c.__calls.itemInserts).toHaveLength(1);
    expect(c.__calls.itemInserts[0].sd_id).toBe(SD.sd_key);
    expect(c.__calls.itemInserts[0].sequence_rank).toBe(8); // MAX(3,7)+1
    expect(c.__calls.actualsInserts).toBe(1);
  });

  it('TS-9: --rank override is honored on the first attempt', async () => {
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[{ sequence_rank: 3 }]],
      insertSeq: [{ error: null }],
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, opts: { rank: '99' }, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('added');
    expect(c.__calls.itemInserts[0].sequence_rank).toBe(99);
  });

  it('TS-7b: 23505 on sd_id during insert -> idempotent noop', async () => {
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[{ sequence_rank: 1 }]],
      insertSeq: [{ error: { code: '23505', message: 'duplicate key value violates unique constraint "sd_baseline_items_baseline_id_sd_id_key"', details: 'Key (baseline_id, sd_id)=(...) already exists.' } }],
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('noop');
    expect(c.__calls.itemInserts).toHaveLength(1);
  });

  it('TS-8: 23505 on sequence_rank -> retry once with re-read MAX+1, then success', async () => {
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[{ sequence_rank: 5 }], [{ sequence_rank: 5 }, { sequence_rank: 6 }]], // 2nd read sees a new rank
      insertSeq: [
        { error: { code: '23505', message: 'duplicate key value violates unique constraint "sd_baseline_items_baseline_id_sequence_rank_key"', details: 'Key (baseline_id, sequence_rank)=(...) already exists.' } },
        { error: null },
      ],
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('added');
    expect(c.__calls.itemInserts).toHaveLength(2);
    expect(c.__calls.rankReads).toBe(2); // re-read before retry
    expect(c.__calls.itemInserts[0].sequence_rank).toBe(6); // MAX(5)+1
    expect(c.__calls.itemInserts[1].sequence_rank).toBe(7); // MAX(5,6)+1 after re-read
  });

  it('TS-8b: 23505 on sequence_rank twice -> error (collision after bounded retry)', async () => {
    const seqErr = { error: { code: '23505', message: 'unique constraint "sd_baseline_items_baseline_id_sequence_rank_key"', details: 'Key (baseline_id, sequence_rank)=(...) already exists.' } };
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[{ sequence_rank: 1 }], [{ sequence_rank: 1 }]],
      insertSeq: [seqErr, seqErr],
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('error');
    expect(c.__calls.itemInserts).toHaveLength(2);
  });

  it('actuals insert error is swallowed -> still added', async () => {
    const c = makeFakeClient({
      baseline: BASELINE, sd: SD, existingItem: null,
      ranksSeq: [[]],
      insertSeq: [{ error: null }],
      actuals: { error: { code: 'XX', message: 'actuals boom' } },
    });
    const r = await addItemCore({ supabase: c, sdKey: SD.sd_key, calcHealth: calcHealth1, log: silent });
    expect(r.action).toBe('added');
    expect(c.__calls.itemInserts[0].sequence_rank).toBe(1); // empty baseline -> rank 1
  });
});
