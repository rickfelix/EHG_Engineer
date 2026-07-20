/**
 * SD-LEO-INFRA-SOURCING-ENGINE-DEFERRED-WATCHER-001 (child 8/10) — FR-5 unit tests.
 *
 * Pure re-eval (FR-1/FR-3) + the default-off, dormant-safe cron (FR-2):
 *   - a blocked-on candidate whose blocking SD is now completed re-emits to belt-ready;
 *   - one whose blocker is still open stays blocked;
 *   - re-route reuses the shipped router, so another gate (e.g. chairman authority) is respected;
 *   - the cron is a no-op when the flag is off, and dormant-safe when the lane column is unapplied;
 *   - re-runs are idempotent (a re-laned row is no longer selected).
 */
import { describe, it, expect } from 'vitest';
import {
  reEvaluateBlockedCandidate,
  isWatcherFlagEnabled,
  isBlockedLane,
  extractBlocker,
} from '../../../lib/sourcing-engine/deferred-watcher.js';
import { runDeferredWatcherSweep } from '../../../scripts/sourcing-engine-deferred-watcher-sweep.mjs';

/** Minimal chainable + thenable Supabase mock for the sweep. */
function makeSupabaseMock({ laneColumnExists, completedSds = [], blockedRows = [] }) {
  const updates = [];
  const from = (table) => {
    const state = { table, selectCols: null, _update: null, _like: null };
    const b = {
      select(cols) { state.selectCols = cols; return b; },
      eq() { return b; },
      like(col, pat) { state._like = [col, pat]; return b; },
      limit() { return b; },
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: the sweep now paginates via
      // fetchAllPaginated, which appends .order()/.range() to the builder before awaiting it.
      order() { return b; },
      range() { return b; },
      update(patch) { state._update = patch; return b; },
      then(resolve, reject) { return Promise.resolve(resolveResult(state)).then(resolve, reject); },
    };
    return b;
  };
  // Schema-aware: conversion_ledger has NO `rung` column (it has `target_rung`). Selecting a
  // non-existent column 42703-throws live — so the mock rejects it, ensuring a column-name bug
  // cannot pass green (regression guard for the adversarial-review HIGH finding).
  const CL_MISSING_COLS = ['rung'];
  const resolveResult = (state) => {
    if (state._update) { updates.push({ table: state.table, patch: state._update }); return { data: null, error: null }; }
    if (state.table === 'conversion_ledger' && state.selectCols === 'lane') {
      return laneColumnExists
        ? { data: [], error: null }
        : { data: null, error: { code: '42703', message: 'column conversion_ledger.lane does not exist' } };
    }
    if (state.table === 'conversion_ledger' && typeof state.selectCols === 'string') {
      const requested = state.selectCols.split(',').map((c) => c.trim());
      const bad = requested.find((c) => CL_MISSING_COLS.includes(c));
      if (bad) return { data: null, error: { code: '42703', message: `column conversion_ledger.${bad} does not exist` } };
    }
    if (state.table === 'strategic_directives_v2') return { data: completedSds, error: null };
    if (state.table === 'conversion_ledger') return { data: blockedRows, error: null };
    return { data: [], error: null };
  };
  return { from, _updates: updates };
}

describe('FR-1 helpers: blocked-lane detection', () => {
  it('isBlockedLane / extractBlocker recognize the parametric blocked lane', () => {
    expect(isBlockedLane('blocked-on-SD-FOO-001')).toBe(true);
    expect(isBlockedLane('belt-ready')).toBe(false);
    expect(isBlockedLane('blocked-on-')).toBe(false); // empty suffix is not valid
    expect(extractBlocker('blocked-on-SD-FOO-001')).toBe('SD-FOO-001');
    expect(extractBlocker('belt-ready')).toBeNull();
  });
});

describe('FR-1/FR-3: reEvaluateBlockedCandidate', () => {
  it('re-lanes to belt-ready when the blocking SD has completed', () => {
    const d = reEvaluateBlockedCandidate(
      { id: 'L1', lane: 'blocked-on-SD-LEO-INFRA-CHAIRMAN-QUEUE-004', classified: { title: 'Outcome decomposer wiring' } },
      { completedSdKeys: new Set(['SD-LEO-INFRA-CHAIRMAN-QUEUE-004']) },
    );
    expect(d.action).toBe('re-lane');
    expect(d.from).toBe('blocked-on-SD-LEO-INFRA-CHAIRMAN-QUEUE-004');
    expect(d.to).toBe('belt-ready');
    expect(d.routed_lane).toBe('belt-ready');
  });

  it('stays blocked when the blocking SD is still open', () => {
    const d = reEvaluateBlockedCandidate(
      { id: 'L2', lane: 'blocked-on-SD-LEO-INFRA-CHAIRMAN-QUEUE-004' },
      { completedSdKeys: new Set() }, // blocker not completed
    );
    expect(d.action).toBe('stay');
    expect(d.reason).toBe('blocker-open');
  });

  it('skips a row that is not on a blocked-on lane (idempotent re-run)', () => {
    expect(reEvaluateBlockedCandidate({ id: 'L3', lane: 'belt-ready' }, {}).action).toBe('skip');
    expect(reEvaluateBlockedCandidate({ id: 'L4', lane: 'dedup' }, {}).action).toBe('skip');
  });

  it('clears a non-SD blocker via the recorded cleared-descriptor set', () => {
    const d = reEvaluateBlockedCandidate(
      { id: 'L5', lane: 'blocked-on-payment-rail-live' },
      { completedSdKeys: new Set(), clearedBlockerDescriptors: new Set(['payment-rail-live']) },
    );
    expect(d.action).toBe('re-lane');
    expect(d.to).toBe('belt-ready');
  });

  it('does NOT clear a non-SD blocker that is not recorded as cleared', () => {
    const d = reEvaluateBlockedCandidate(
      { id: 'L6', lane: 'blocked-on-payment-rail-live' },
      { completedSdKeys: new Set(['SD-X-001']) },
    );
    expect(d.action).toBe('stay');
  });

  it('reuses the shipped router: a cleared blocker still routes chairman-gated when authority applies', () => {
    const d = reEvaluateBlockedCandidate(
      { id: 'L7', lane: 'blocked-on-SD-DEP-001', classified: { title: 'RLS policy work', authority: 'rls' } },
      { completedSdKeys: new Set(['SD-DEP-001']) },
    );
    // Blocker cleared, but the router's chairman-gated gate still fires → not blindly belt-ready.
    expect(d.action).toBe('re-lane');
    expect(d.to).toBe('chairman-gated');
    expect(d.routed_lane).toBe('chairman-gated');
  });
});

describe('FR-2: default-off + dormant-safe cron', () => {
  it('is a no-op when the flag is off (touches no DB)', async () => {
    const sb = makeSupabaseMock({ laneColumnExists: true });
    const res = await runDeferredWatcherSweep({ supabase: sb, env: {} });
    expect(res.suppressed).toBe(true);
    expect(res.scanned).toBe(0);
    expect(sb._updates.length).toBe(0);
  });

  it('isWatcherFlagEnabled honors on/1/true and defaults OFF', () => {
    expect(isWatcherFlagEnabled({})).toBe(false);
    expect(isWatcherFlagEnabled({ SOURCING_DEFERRED_WATCHER_V1: 'on' })).toBe(true);
    expect(isWatcherFlagEnabled({ SOURCING_DEFERRED_WATCHER_V1: 'true' })).toBe(true);
    expect(isWatcherFlagEnabled({ SOURCING_DEFERRED_WATCHER_V1: 'off' })).toBe(false);
  });

  it('no-ops (zero writes) when the lane column is dormant, even with the flag on', async () => {
    const sb = makeSupabaseMock({ laneColumnExists: false });
    const res = await runDeferredWatcherSweep({ supabase: sb, env: { SOURCING_DEFERRED_WATCHER_V1: 'on' } });
    expect(res.lane_column_missing).toBe(true);
    expect(res.dry_run).toBe(true);
    expect(sb._updates.length).toBe(0);
  });

  it('re-lanes a cleared-blocker row and persists belt-ready when live (idempotent on re-run)', async () => {
    const sb = makeSupabaseMock({
      laneColumnExists: true,
      completedSds: [{ sd_key: 'SD-DONE-001', status: 'completed' }],
      blockedRows: [
        { id: 'R1', source_id: 's1', title: 'cleared item', disposition: null, rung: null, lane: 'blocked-on-SD-DONE-001' },
        { id: 'R2', source_id: 's2', title: 'still blocked item', disposition: null, rung: null, lane: 'blocked-on-SD-OPEN-999' },
      ],
    });
    const res = await runDeferredWatcherSweep({ supabase: sb, env: { SOURCING_DEFERRED_WATCHER_V1: 'on' } });
    expect(res.scanned).toBe(2);
    expect(res.re_laned).toBe(1);
    expect(res.stayed).toBe(1);
    expect(sb._updates).toEqual([{ table: 'conversion_ledger', patch: { lane: 'belt-ready' } }]);
  });

  it('dry-run computes the re-lane but writes nothing', async () => {
    const sb = makeSupabaseMock({
      laneColumnExists: true,
      completedSds: [{ sd_key: 'SD-DONE-001', status: 'completed' }],
      blockedRows: [{ id: 'R1', source_id: 's1', title: 'cleared item', disposition: null, rung: null, lane: 'blocked-on-SD-DONE-001' }],
    });
    const res = await runDeferredWatcherSweep({ supabase: sb, env: { SOURCING_DEFERRED_WATCHER_V1: 'on' }, dryRun: true });
    expect(res.re_laned).toBe(1);
    expect(sb._updates.length).toBe(0);
  });
});
