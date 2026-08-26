import { describe, it, expect } from 'vitest';
import { checkQuiescence, RENUMBER_RANGE } from '../../lib/eva/uat-stage-migration/quiescence-check.mjs';

// TS-2: pure-logic unit test -- a stubbed venture_stage_transitions row with no completed_at
// simulates a venture mid-transition through the renumber range; no DB connection involved.
describe('checkQuiescence', () => {
  it('is quiescent when there are no transition rows', () => {
    const result = checkQuiescence([]);
    expect(result.quiescent).toBe(true);
    expect(result.inFlightCount).toBe(0);
  });

  it('is quiescent when all transitions through the range are completed', () => {
    const rows = [{ from_stage: 22, to_stage: 23, completed_at: '2026-08-20T00:00:00Z' }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(true);
  });

  it('blocks apply when a venture is mid-transition through stage 23 (from_stage)', () => {
    const rows = [{ from_stage: 23, to_stage: 24, completed_at: null }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(false);
    expect(result.inFlightCount).toBe(1);
    expect(result.inFlight[0].from_stage).toBe(23);
  });

  it('blocks apply when a venture is mid-transition into stage 24 (to_stage) from outside the range', () => {
    const rows = [{ from_stage: 22, to_stage: 24, completed_at: null }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(false);
  });

  it('ignores in-flight transitions entirely outside the renumber range', () => {
    const rows = [{ from_stage: 10, to_stage: 11, completed_at: null }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(true);
  });

  it('respects a custom range', () => {
    const rows = [{ from_stage: 5, to_stage: 6, completed_at: null }];
    const result = checkQuiescence(rows, { min: 5, max: 6 });
    expect(result.quiescent).toBe(false);
  });

  it('exposes the default RENUMBER_RANGE as 23-26', () => {
    expect(RENUMBER_RANGE).toEqual({ min: 23, max: 26 });
  });
});
