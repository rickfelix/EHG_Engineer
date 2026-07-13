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
});
