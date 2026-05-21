/**
 * Regression test for QF-20260521-815 (closes feedback 0187ad17).
 *
 * auto-resolve-recovered.js can never clear a ci_failure row for a workflow that fails 100% of
 * the time (shouldAutoResolve requires K consecutive successes). The PR-merged-moot path resolves
 * a row whose branch PR is MERGED/CLOSED regardless of workflow health. Pure logic, no DB/gh.
 */

import { describe, it, expect } from 'vitest';
import { isPrMoot, fetchBranchPr } from '../../scripts/modules/inbox/auto-resolve-recovered.js';

describe('isPrMoot — branch PR resolution state', () => {
  it('MERGED PR is moot', () => {
    expect(isPrMoot([{ number: 1, state: 'MERGED' }])).toEqual({ moot: true, number: 1, state: 'MERGED' });
  });
  it('CLOSED PR is moot', () => {
    expect(isPrMoot([{ number: 2, state: 'CLOSED' }])).toEqual({ moot: true, number: 2, state: 'CLOSED' });
  });
  it('OPEN PR is NOT moot', () => {
    expect(isPrMoot([{ number: 3, state: 'OPEN' }]).moot).toBe(false);
  });
  it('lowercase state is normalized', () => {
    expect(isPrMoot([{ number: 4, state: 'merged' }]).moot).toBe(true);
  });
  it('no PR / empty / non-array → not moot', () => {
    expect(isPrMoot([]).moot).toBe(false);
    expect(isPrMoot(null).moot).toBe(false);
    expect(isPrMoot(undefined).moot).toBe(false);
  });
});

describe('fetchBranchPr — gh query (injectable exec)', () => {
  it('parses gh JSON and targets the right repo + branch', () => {
    const calls = [];
    const fakeExec = (cmd) => { calls.push(cmd); return '[{"number":7,"state":"MERGED","mergedAt":"2026-05-21T00:00:00Z"}]'; };
    const result = fetchBranchPr('rickfelix/EHG_Engineer', 'qf/QF-20260521-815', fakeExec);
    expect(result).toEqual([{ number: 7, state: 'MERGED', mergedAt: '2026-05-21T00:00:00Z' }]);
    expect(calls[0]).toContain('--repo rickfelix/EHG_Engineer');
    expect(calls[0]).toContain('--head "qf/QF-20260521-815"');
    expect(calls[0]).toContain('--state all');
  });
  it('returns null when gh errors (no PR / gh unavailable)', () => {
    const throwingExec = () => { throw new Error('gh: no PRs'); };
    expect(fetchBranchPr('r', 'b', throwingExec)).toBeNull();
  });

  it('end-to-end: a merged PR for the branch is detected as moot', () => {
    const fakeExec = () => '[{"number":3829,"state":"MERGED"}]';
    expect(isPrMoot(fetchBranchPr('rickfelix/EHG_Engineer', 'qf/x', fakeExec) || []).moot).toBe(true);
  });
});
