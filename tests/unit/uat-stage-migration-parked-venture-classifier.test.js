import { describe, it, expect } from 'vitest';
import { classifyParkedVentures, SHIFTED_STAGE_RANGE } from '../../lib/eva/uat-stage-migration/parked-venture-classifier.mjs';

// TS-6: pure-logic unit test -- a stubbed ventures row with is_demo=false at stage_number 24
// simulates a real venture parked at a shifted stage; no DB connection involved.
describe('classifyParkedVentures', () => {
  it('does not block when every venture at a shifted stage is a demo fixture', () => {
    const rows = [
      { id: 'a', is_demo: true, current_lifecycle_stage: 23 },
      { id: 'b', is_demo: true, current_lifecycle_stage: 24 },
    ];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(false);
    expect(result.realCount).toBe(0);
    expect(result.demoCount).toBe(2);
  });

  it('blocks apply when a REAL venture is found at a shifted stage', () => {
    const rows = [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 24 }];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
    expect(result.real[0].id).toBe('real-1');
  });

  it('allows an explicit override to proceed despite a real venture being present', () => {
    const rows = [{ id: 'real-1', is_demo: false, current_lifecycle_stage: 24 }];
    const result = classifyParkedVentures(rows, SHIFTED_STAGE_RANGE, { override: true });
    expect(result.blocked).toBe(false);
    expect(result.realCount).toBe(1); // still reported, just not blocking
  });

  it('ignores ventures outside the shifted stage range', () => {
    const rows = [{ id: 'x', is_demo: false, current_lifecycle_stage: 10 }];
    const result = classifyParkedVentures(rows);
    expect(result.total).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('treats a missing/undefined is_demo as real (fail closed)', () => {
    const rows = [{ id: 'y', current_lifecycle_stage: 25 }];
    const result = classifyParkedVentures(rows);
    expect(result.blocked).toBe(true);
    expect(result.realCount).toBe(1);
  });

  it('exposes the default SHIFTED_STAGE_RANGE as 23-26', () => {
    expect(SHIFTED_STAGE_RANGE).toEqual({ min: 23, max: 26 });
  });
});
