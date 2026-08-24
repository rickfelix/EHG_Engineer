/**
 * SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-2) -- unit coverage for
 * lib/periodic-liveness/gha-run-resolver.mjs's pure mapping functions (TS-1/TS-2/TS-3), plus
 * fetchScheduledRuns with an injected fetchImpl so no live GitHub API call is made.
 */
import { describe, it, expect } from 'vitest';
import {
  fetchScheduledRuns,
  latestRunPerWorkflow,
  classifyGhaCronRows,
  observedGapStats,
} from '../../../lib/periodic-liveness/gha-run-resolver.mjs';

function run(overrides = {}) {
  return {
    path: '.github/workflows/foo.yml',
    created_at: '2026-07-10T00:00:00Z',
    run_started_at: '2026-07-10T00:00:05Z',
    conclusion: 'success',
    ...overrides,
  };
}

describe('latestRunPerWorkflow', () => {
  it('keeps only the most recent run per workflow filename', () => {
    const runs = [
      run({ path: '.github/workflows/foo.yml', created_at: '2026-07-01T00:00:00Z' }),
      run({ path: '.github/workflows/foo.yml', created_at: '2026-07-10T00:00:00Z' }),
      run({ path: '.github/workflows/bar.yml', created_at: '2026-07-05T00:00:00Z' }),
    ];
    const latest = latestRunPerWorkflow(runs);
    expect(latest.size).toBe(2);
    expect(latest.get('foo.yml').created_at).toBe('2026-07-10T00:00:00Z');
    expect(latest.get('bar.yml').created_at).toBe('2026-07-05T00:00:00Z');
  });

  it('skips runs with no resolvable path', () => {
    const latest = latestRunPerWorkflow([{ created_at: '2026-07-01T00:00:00Z' }]);
    expect(latest.size).toBe(0);
  });

  it('QF-20260823-374: an in-flight run (conclusion=null) never shadows the last COMPLETED run, even when it is more recent', () => {
    // Reproduces the watcher-observes-its-own-in-flight-invocation race: the workflow's own
    // currently-running invocation is present in the very API response its own resolver call
    // fetches (it started most recently, and has not finished yet), which previously permanently
    // prevented its registry row from ever being stamped.
    const runs = [
      run({ path: '.github/workflows/periodic-liveness-watcher-cron.yml', created_at: '2026-08-23T19:09:00Z', conclusion: 'success' }),
      run({ path: '.github/workflows/periodic-liveness-watcher-cron.yml', created_at: '2026-08-23T23:09:00Z', conclusion: null }),
    ];
    const latest = latestRunPerWorkflow(runs);
    expect(latest.get('periodic-liveness-watcher-cron.yml').created_at).toBe('2026-08-23T19:09:00Z');
  });

  it('QF-20260823-374: an in-flight run for a workflow with NO prior completed run resolves to no entry (no_data upstream, never a false OVERDUE)', () => {
    const runs = [run({ path: '.github/workflows/brand-new.yml', conclusion: null })];
    const latest = latestRunPerWorkflow(runs);
    expect(latest.has('brand-new.yml')).toBe(false);
  });
});

describe('classifyGhaCronRows', () => {
  it('TS-1: a successful latest run stamps with its run_started_at', () => {
    const latestByFile = latestRunPerWorkflow([run({ path: '.github/workflows/foo.yml', conclusion: 'success' })]);
    const [decision] = classifyGhaCronRows(latestByFile, ['gha_cron:foo.yml']);
    expect(decision).toEqual({ processKey: 'gha_cron:foo.yml', decision: 'stamp', ranAtIso: '2026-07-10T00:00:05Z' });
  });

  it('TS-2: a failed latest run classifies OVERDUE, not UNVERIFIED', () => {
    const latestByFile = latestRunPerWorkflow([run({ path: '.github/workflows/foo.yml', conclusion: 'failure' })]);
    const [decision] = classifyGhaCronRows(latestByFile, ['gha_cron:foo.yml']);
    expect(decision.decision).toBe('overdue');
  });

  it('a cancelled/timed_out latest run also classifies OVERDUE (any non-success conclusion)', () => {
    const latestByFile = latestRunPerWorkflow([run({ path: '.github/workflows/foo.yml', conclusion: 'cancelled' })]);
    const [decision] = classifyGhaCronRows(latestByFile, ['gha_cron:foo.yml']);
    expect(decision.decision).toBe('overdue');
  });

  it('no matching run for a process_key -> no_data (degrades to UNVERIFIED upstream, never a false alarm)', () => {
    const latestByFile = latestRunPerWorkflow([run({ path: '.github/workflows/other.yml' })]);
    const [decision] = classifyGhaCronRows(latestByFile, ['gha_cron:foo.yml']);
    expect(decision).toEqual({ processKey: 'gha_cron:foo.yml', decision: 'no_data' });
  });

  it('QF-20260823-374: a workflow watching its own in-flight run still classifies STAMP from its last completed success', () => {
    const latestByFile = latestRunPerWorkflow([
      run({ path: '.github/workflows/periodic-liveness-watcher-cron.yml', created_at: '2026-08-23T19:09:00Z', run_started_at: '2026-08-23T19:09:05Z', conclusion: 'success' }),
      run({ path: '.github/workflows/periodic-liveness-watcher-cron.yml', created_at: '2026-08-23T23:09:00Z', conclusion: null }),
    ]);
    const [decision] = classifyGhaCronRows(latestByFile, ['gha_cron:periodic-liveness-watcher-cron.yml']);
    expect(decision).toEqual({ processKey: 'gha_cron:periodic-liveness-watcher-cron.yml', decision: 'stamp', ranAtIso: '2026-08-23T19:09:05Z' });
  });
});

describe('fetchScheduledRuns', () => {
  it('TS-3: propagates a fetch/API error so the caller can degrade gracefully', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(fetchScheduledRuns('owner/repo', 'tok', { fetchImpl })).rejects.toThrow(/GitHub API error: 500/);
  });

  it('paginates until a short page is returned', async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      const batch = call === 1
        ? Array.from({ length: 2 }, (_, i) => run({ path: `.github/workflows/w${i}.yml` }))
        : [];
      return { ok: true, json: async () => ({ workflow_runs: batch }) };
    };
    const runs = await fetchScheduledRuns('owner/repo', 'tok', { perPage: 2, fetchImpl });
    expect(runs).toHaveLength(2);
    expect(call).toBe(2); // page 1 (full, perPage=2) then page 2 (empty, stops pagination)
  });

  it('QF-20260824-373: default maxPages is 10 (not the old 5) -- pages until a short/empty page even past 500 runs', async () => {
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      // 100/page (the real default perPage) for 7 pages, then a short page on page 8 -- exceeds
      // the old maxPages=5 ceiling, proving the deeper default is actually wired through.
      const batch = call <= 7
        ? Array.from({ length: 100 }, (_, i) => run({ path: `.github/workflows/w${call}-${i}.yml` }))
        : [];
      return { ok: true, json: async () => ({ workflow_runs: batch }) };
    };
    const runs = await fetchScheduledRuns('owner/repo', 'tok', { fetchImpl });
    expect(runs).toHaveLength(700);
    expect(call).toBe(8);
  });
});

describe('observedGapStats', () => {
  it('QF-20260824-373: computes the largest gap between consecutive SUCCESSFUL runs per workflow file', () => {
    const runs = [
      run({ path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T05:37:00Z', run_started_at: '2026-08-24T05:37:00Z' }),
      run({ path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T06:22:00Z', run_started_at: '2026-08-24T06:22:00Z' }),
      run({ path: '.github/workflows/sms-relay-drain-cron.yml', created_at: '2026-08-24T07:35:00Z', run_started_at: '2026-08-24T07:35:00Z' }),
    ];
    const stats = observedGapStats(runs);
    const entry = stats.get('sms-relay-drain-cron.yml');
    expect(entry.sampleCount).toBe(3);
    expect(entry.maxGapMs).toBe(73 * 60 * 1000); // 06:22 -> 07:35
  });

  it('ignores non-successful runs -- a failed/cancelled run is not cadence evidence', () => {
    const runs = [
      run({ path: '.github/workflows/foo.yml', created_at: '2026-08-24T00:00:00Z', run_started_at: '2026-08-24T00:00:00Z', conclusion: 'success' }),
      run({ path: '.github/workflows/foo.yml', created_at: '2026-08-24T00:05:00Z', run_started_at: '2026-08-24T00:05:00Z', conclusion: 'failure' }),
      run({ path: '.github/workflows/foo.yml', created_at: '2026-08-24T01:00:00Z', run_started_at: '2026-08-24T01:00:00Z', conclusion: 'success' }),
    ];
    const stats = observedGapStats(runs);
    // The failure run is excluded, so the only measured gap is 00:00 -> 01:00 (1h), not 5min.
    expect(stats.get('foo.yml').maxGapMs).toBe(60 * 60 * 1000);
    expect(stats.get('foo.yml').sampleCount).toBe(2);
  });

  it('a single-sample workflow (no consecutive pair) reports maxGapMs=0, not a false floor', () => {
    const runs = [run({ path: '.github/workflows/lonely.yml', created_at: '2026-08-24T00:00:00Z', run_started_at: '2026-08-24T00:00:00Z' })];
    const stats = observedGapStats(runs);
    expect(stats.get('lonely.yml')).toEqual({ maxGapMs: 0, sampleCount: 1 });
  });

  it('skips runs with no resolvable path, same as latestRunPerWorkflow', () => {
    const stats = observedGapStats([{ created_at: '2026-08-24T00:00:00Z', conclusion: 'success' }]);
    expect(stats.size).toBe(0);
  });
});
