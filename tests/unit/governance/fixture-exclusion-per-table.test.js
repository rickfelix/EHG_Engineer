/**
 * Per-table fixture predicates — SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-A.
 *
 * Every block here is TWO-SIDED, and each negative arm varies a DIFFERENT AXIS than its positive
 * arm. A negative built by mutating its positive (same row, flag flipped) inherits the positive's
 * assumption and passes while the predicate is wrong — so the negatives below use REAL production
 * shapes instead, enumerated live from the tables rather than invented.
 *
 * This file extends the precedent set by fixture-exclusion.test.js, whose QF-031 block is labelled
 * "THE CONTROL" for the same reason: over-exclusion is the fatal direction. A filter that over-eats
 * deletes real signal while reporting success.
 */
import { describe, test, expect } from 'vitest';
import {
  FIXTURE_KEY_RE,
  FIXTURE_CREATED_BY,
  FIXTURE_PROCESS_KEY_PREFIX,
  isFixtureProcessKey,
  hasFixtureMarker,
  isFixtureHealthSnapshot,
  isFixtureCoordinationRow,
  isFixtureQf,
  isFixtureQfByCreatedBy,
  isFixtureVenture,
} from '../../../lib/governance/fixture-exclusion.mjs';

describe('periodic_process_registry — the over-eating control (FR-2)', () => {
  test('POSITIVE: __e2e_ residue is classified as fixture', () => {
    expect(isFixtureProcessKey('__e2e_liveness_probe')).toBe(true);
    expect(isFixtureProcessKey('__e2e_run_1784287684096')).toBe(true);
    expect(FIXTURE_PROCESS_KEY_PREFIX).toBe('__e2e_');
  });

  // THE CONTROL. These five are REAL rows, enumerated live from the table (194 rows, full fetch,
  // not a sample). They are precisely why this predicate may NOT reuse FIXTURE_KEY_RE: that regex
  // carries a bare ^__ branch matching the first two, and any name-keyword approach matches the
  // last three. Reaping or hiding __watcher_self__ or __eva_scheduler_watcher_self__ blinds the
  // liveness instrument the filter exists to protect, and gha_cron:venture-fixture-sweep.yml IS
  // the cleanup cron a sibling child revives. A NAME IS A CLAIM, NOT EVIDENCE.
  test.each([
    ['__watcher_self__', 'liveness watcher own marker — bare dunder'],
    ['__eva_scheduler_watcher_self__', 'scheduler watcher own marker — bare dunder'],
    ['gha_cron:venture-fixture-sweep.yml', 'REAL cron whose name contains "fixture"'],
    ['standard_loop:account-usage-sample', 'REAL loop whose name contains "sample"'],
    ['cron_script:account-usage-sample.mjs', 'REAL script whose name contains "sample"'],
  ])('THE CONTROL: real row %s survives (%s)', (processKey) => {
    expect(isFixtureProcessKey(processKey)).toBe(false);
  });

  // The five above protect only the rows that exist TODAY. This asserts the general SHAPE, so a
  // sixth real dunder or test-sounding row added later is protected without editing a list.
  test('GENERAL SHAPE: bare dunder and test-sounding names are not fixtures by themselves', () => {
    expect(isFixtureProcessKey('__some_future_watcher_self__')).toBe(false);
    expect(isFixtureProcessKey('__eva_new_internal_marker')).toBe(false);
    expect(isFixtureProcessKey('gha_cron:some-test-harness.yml')).toBe(false);
    expect(isFixtureProcessKey('cron_script:fixture-sweep-v2.mjs')).toBe(false);
  });

  // Proof the control is LOAD-BEARING rather than incidentally satisfied: the canonical regex
  // really would have eaten the real rows. If FIXTURE_KEY_RE ever loses its bare ^__ branch this
  // fails, telling the next reader the hazard changed rather than letting the control rot silently.
  test('the hazard is real — FIXTURE_KEY_RE would have matched the real dunder rows', () => {
    expect(FIXTURE_KEY_RE.test('__watcher_self__')).toBe(true);
    expect(FIXTURE_KEY_RE.test('__eva_scheduler_watcher_self__')).toBe(true);
    expect(isFixtureProcessKey('__watcher_self__')).toBe(false);
  });

  test('takes the key only — non-strings fail open to NOT-fixture', () => {
    expect(isFixtureProcessKey(null)).toBe(false);
    expect(isFixtureProcessKey(undefined)).toBe(false);
    expect(isFixtureProcessKey({ process_key: '__e2e_x' })).toBe(false);
  });
});

describe('jsonb-carrier tables — codebase_health_snapshots and session_coordination', () => {
  test('POSITIVE: both accepted marker keys classify as fixture', () => {
    expect(isFixtureHealthSnapshot({ metadata: { synthetic: true } })).toBe(true);
    expect(isFixtureHealthSnapshot({ metadata: { is_fixture: true } })).toBe(true);
    expect(isFixtureCoordinationRow({ payload: { is_fixture: true } })).toBe(true);
    expect(isFixtureCoordinationRow({ payload: { synthetic: true } })).toBe(true);
  });

  // NEGATIVE ARM VARIES A DIFFERENT AXIS: not "the same row with the flag false", but real rows
  // carrying UNRELATED jsonb content, which is what production rows actually look like.
  test('THE CONTROL: real rows with unrelated jsonb content survive', () => {
    expect(isFixtureHealthSnapshot({
      dimension: 'gauge_runner_heartbeat',
      metadata: { source: 'coordinator-hourly-review', run_id: 'abc123' },
    })).toBe(false);
    expect(isFixtureCoordinationRow({
      message_type: 'INFO',
      payload: { kind: 'roll_call', callsign: 'Alpha-2' },
    })).toBe(false);
    // A row with no carrier at all is real, not fixture (fail open).
    expect(isFixtureHealthSnapshot({ dimension: 'trend_eyes_sweep_receipt' })).toBe(false);
    expect(isFixtureCoordinationRow({ message_type: 'INFO' })).toBe(false);
  });

  // dimension is a legitimate grouping key for REAL rows, and a shipped acceptance probe pins one
  // specific value, so keying on it would over-eat. The predicate must ignore it entirely.
  test('dimension is NOT a fixture discriminant', () => {
    expect(isFixtureHealthSnapshot({ dimension: 'trend_eyes_sweep_receipt', metadata: {} })).toBe(false);
    expect(isFixtureHealthSnapshot({ dimension: '__e2e_anything', metadata: {} })).toBe(false);
  });

  test('only strict boolean true qualifies — truthy values must not sweep a real row up', () => {
    expect(hasFixtureMarker({ is_fixture: 'yes' })).toBe(false);
    expect(hasFixtureMarker({ synthetic: 1 })).toBe(false);
    expect(hasFixtureMarker({ is_fixture: false })).toBe(false);
    expect(hasFixtureMarker(null)).toBe(false);
    expect(hasFixtureMarker('is_fixture')).toBe(false);
  });
});

describe('quick_fixes created_by carrier (TR-3)', () => {
  test('POSITIVE: the explicit marker classifies as fixture', () => {
    expect(isFixtureQfByCreatedBy({ id: 'QF-20260807-001', created_by: FIXTURE_CREATED_BY })).toBe(true);
  });

  // THE OPT-IN BOUNDARY. isFixtureQf is consumed by five live surfaces including the dispatch
  // queue, and quick_fixes RLS is permissive to anon (pre-existing). If created_by were folded
  // into isFixtureQf, anyone could hide a REAL quick fix from all five by writing one free-text
  // column, with no id or title change to give it away. This asserts the separation holds.
  test('created_by does NOT leak into isFixtureQf — consumers must opt in explicitly', () => {
    expect(isFixtureQf({ id: 'QF-20260807-001', created_by: FIXTURE_CREATED_BY })).toBe(false);
  });

  // THE VACUITY GUARD. created_by is defaulted and untruthful: 1,355 of 1,376 live rows carry
  // 'UAT_AGENT' (98.47%, EXACT full-population counts obtained by pagination), including rows
  // genuinely filed by workers. Had the marker equalled that default, this predicate would
  // classify nearly the whole table as fixtures AND a naive test would still pass. Asserting the
  // distinctness is what makes the mutation proof meaningful instead of vacuous.
  test('THE CONTROL: the marker is DISTINCT from the untruthful default', () => {
    expect(FIXTURE_CREATED_BY).not.toBe('UAT_AGENT');
    expect(isFixtureQfByCreatedBy({ id: 'QF-20260807-002', created_by: 'UAT_AGENT' })).toBe(false);
    expect(isFixtureQfByCreatedBy({
      id: 'QF-20260728-967',
      created_by: 'UAT_AGENT',
      title: 'Fleet dashboard shows stale liveness',
    })).toBe(false);
  });

  test('existing id/title behavior is unchanged by the created_by addition', () => {
    expect(isFixtureQf({ id: 'QF-TEST-001' })).toBe(true);
    expect(isFixtureQf({ title: 'ZZZ_fixture qf' })).toBe(true);
    expect(isFixtureQf({
      id: 'QF-20260807-985',
      title: 'Trend-Eyes liveness predicate has zero callers',
    })).toBe(false);
  });
});

describe('ventures — phantom is_synthetic branch removed (FR-4)', () => {
  // Pins the REMOVAL. is_synthetic is a phantom column (migration 20260312 never applied; a live
  // select reproduces PostgREST 42703), so the branch could never be true on a real row. If
  // someone reinstates it, this test fails.
  test('is_synthetic:true alone does NOT classify a venture as fixture', () => {
    expect(isFixtureVenture({ name: 'MarketLens', is_demo: false, is_synthetic: true })).toBe(false);
  });

  test('is_demo still classifies, and real ventures still survive', () => {
    expect(isFixtureVenture({ name: 'MarketLens', is_demo: true })).toBe(true);
    expect(isFixtureVenture({ name: 'MarketLens', is_demo: false })).toBe(false);
    expect(isFixtureVenture({ name: '__e2e_venture', is_demo: false })).toBe(true);
  });

  // PLAN ruling: is_scaffolding marks a REAL venture used as a build-out vehicle, a different
  // question from "this row is not real". Treating it as fixture-shaped would over-eat.
  test('is_scaffolding is NOT a fixture marker', () => {
    expect(isFixtureVenture({
      name: 'Scaffold Venture',
      is_demo: false,
      is_scaffolding: true,
    })).toBe(false);
  });
});

// ─── quick_fixes CLAIM PATH — SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001-C FR-1 ─────────────────────
//
// WHY THESE LIVE HERE AND NOT BESIDE THE CODE THEY PIN. Their natural home,
// tests/unit/worker-checkin-critical-qf-priority-jump.test.js, is in the unit project's EXCLUDE
// list — vitest reports "No test files found" for it. Assertions added there could never fail,
// which is strictly worse than no assertion at all because the file reads as coverage. This file
// is confirmed to execute (20 passing before this block), so the pins land where they can run.
//
// WHAT THEY PIN. The priority-jump lane needed no code change: isCriticalQfJumpEligible defers to
// isAutoStartableQF on its first line, and the lane's query already selects the id/title that
// isFixtureQf reads. That was proven once by execution — but "proven by the author" and "guarded
// against regression" are different properties, and only the second survives a later edit that
// stops delegating. The jump lane PRE-EMPTS SD self-claim, so an unfiltered fixture row there
// outranks real work rather than merely sitting beside it.
describe('quick_fixes claim path — fixture rows are never dispatched to a worker', () => {
  const { createRequire } = require('node:module');
  const req = createRequire(import.meta.url);
  const { isAutoStartableQF, isCriticalQfJumpEligible } = req('../../../scripts/worker-checkin.cjs');

  const NOW = Date.now();
  // Aged past the 10-minute jump grace, inside the 3-day staleness bound. Held byte-identical
  // across every case below so the ONLY varying field is the one under test.
  const openQf = (over) => ({
    id: 'QF-20260808-900', status: 'open', severity: 'critical',
    created_at: new Date(NOW - 3600_000).toISOString(),
    pr_url: null, commit_sha: null, routing_tier: null, factory_lane: false,
    owner: null, release_condition: null, not_before: null,
    title: 'Belt depth gauge over-counts', description: 'benign', ...over,
  });

  test('a REAL open critical QF is both self-claimable and jump-eligible (positive control)', () => {
    expect(isAutoStartableQF(openQf(), NOW)).toBe(true);
    expect(isCriticalQfJumpEligible(openQf(), NOW)).toBe(true);
  });

  test('fixture by id is excluded from BOTH the self-claim and the priority-jump lane', () => {
    expect(isAutoStartableQF(openQf({ id: 'QF-TEST-001' }), NOW)).toBe(false);
    expect(isCriticalQfJumpEligible(openQf({ id: 'QF-TEST-001' }), NOW)).toBe(false);
  });

  test('fixture by title is excluded from BOTH lanes', () => {
    expect(isAutoStartableQF(openQf({ title: 'ZZZ_seed critical' }), NOW)).toBe(false);
    expect(isCriticalQfJumpEligible(openQf({ title: 'ZZZ_seed critical' }), NOW)).toBe(false);
  });

  // THE OVER-EATING CONTROL, and the direction that actually costs something: a real CRITICAL QF
  // wrongly excluded is stranded permanently with nothing reporting it. Two live bug reports in
  // two weeks carried titles of exactly this shape (PR #6186), which is why isFixtureQf keeps only
  // unambiguous ZZZ_/dunder prefixes and dropped its TEST-/UAT-/DEMO title branches.
  test('a REAL bug report that merely NAMES fixtures survives BOTH lanes', () => {
    const row = openQf({ title: 'Test-fixture ventures leak into gauges' });
    expect(isAutoStartableQF(row, NOW)).toBe(true);
    expect(isCriticalQfJumpEligible(row, NOW)).toBe(true);
  });
});
