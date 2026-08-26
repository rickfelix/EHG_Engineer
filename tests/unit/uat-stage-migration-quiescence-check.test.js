import { describe, it, expect } from 'vitest';
import { checkQuiescence, RENUMBER_RANGE } from '../../lib/eva/uat-stage-migration/quiescence-check.mjs';

// TS-2: pure-logic unit test -- a stubbed venture_stage_work row with stage_status='in_progress'
// simulates a venture mid-transition through the renumber range; no DB connection involved.
// REVISION: switched from venture_stage_transitions.completed_at (a column that does not exist
// on that table, found by adversarial TESTING review) to venture_stage_work.stage_status.
describe('checkQuiescence', () => {
  it('is quiescent when there are no stage-work rows', () => {
    const result = checkQuiescence([]);
    expect(result.quiescent).toBe(true);
    expect(result.inFlightCount).toBe(0);
  });

  it('is quiescent when the row in range is completed, not in_progress', () => {
    const rows = [{ lifecycle_stage: 23, stage_status: 'completed' }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(true);
  });

  it('blocks apply when a venture is mid-transition (in_progress) through stage 23', () => {
    const rows = [{ lifecycle_stage: 23, stage_status: 'in_progress' }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(false);
    expect(result.inFlightCount).toBe(1);
    expect(result.inFlight[0].lifecycle_stage).toBe(23);
  });

  it('blocks apply when a venture is mid-transition through stage 26 (upper bound)', () => {
    const rows = [{ lifecycle_stage: 26, stage_status: 'in_progress' }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(false);
  });

  it('ignores in-flight rows entirely outside the renumber range', () => {
    const rows = [{ lifecycle_stage: 10, stage_status: 'in_progress' }];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(true);
  });

  it('ignores other non-in_progress statuses (not_started, blocked, skipped)', () => {
    const rows = [
      { lifecycle_stage: 24, stage_status: 'not_started' },
      { lifecycle_stage: 24, stage_status: 'blocked' },
      { lifecycle_stage: 24, stage_status: 'skipped' },
    ];
    const result = checkQuiescence(rows);
    expect(result.quiescent).toBe(true);
  });

  it('respects a custom range', () => {
    const rows = [{ lifecycle_stage: 5, stage_status: 'in_progress' }];
    const result = checkQuiescence(rows, { min: 5, max: 6 });
    expect(result.quiescent).toBe(false);
  });

  it('exposes the default RENUMBER_RANGE as 23-26', () => {
    expect(RENUMBER_RANGE).toEqual({ min: 23, max: 26 });
  });
});
