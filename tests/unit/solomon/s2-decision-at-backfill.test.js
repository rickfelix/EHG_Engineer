// QF-20260822-805: S2 decision_at backfill.
import { describe, it, expect } from 'vitest';
import { buildDecisionAtBackfill, S2_DECISION_AT_TARGETS } from '../../../lib/solomon/s2-decision-at-backfill.js';

describe('S2_DECISION_AT_TARGETS', () => {
  it('names exactly the 2 rows Solomon\'s ruling scoped, with Adam\'s provenance timestamps', () => {
    expect(S2_DECISION_AT_TARGETS).toHaveLength(2);
    const byId = Object.fromEntries(S2_DECISION_AT_TARGETS.map((t) => [t.id, t]));
    expect(byId['922f8dfb-a548-49b4-869e-0f8c7b73fd73'].decisionAt).toBe('2026-08-21T13:04:00.000Z');
    expect(byId['922f8dfb-a548-49b4-869e-0f8c7b73fd73'].toleranceMinutes).toBe(2);
    expect(byId['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3'].decisionAt).toBe('2026-08-21T13:43:00.000Z');
    expect(byId['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3'].toleranceMinutes).toBe(3);
  });
});

describe('buildDecisionAtBackfill', () => {
  it('stages both rows when decision_at is NULL on the live rows', () => {
    const liveRows = [
      { id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', decision_at: null },
      { id: '0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', decision_at: null },
    ];
    const result = buildDecisionAtBackfill(liveRows);
    expect(result.applied).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.applied.map((a) => a.id).sort()).toEqual(
      ['0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3', '922f8dfb-a548-49b4-869e-0f8c7b73fd73'].sort()
    );
  });

  it('refuses to overwrite a row whose decision_at is already non-NULL', () => {
    const liveRows = [
      { id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', decision_at: '2026-08-20T00:00:00.000Z' },
    ];
    const result = buildDecisionAtBackfill(liveRows);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('already set');
  });

  it('skips rows not in the named target set', () => {
    const liveRows = [{ id: 'unrelated-row-id', decision_at: null }];
    const result = buildDecisionAtBackfill(liveRows);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain('Not one of the 2 named S2 target rows');
  });

  it('never mentions or touches decision_by in the applied patch shape', () => {
    const liveRows = [{ id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73', decision_at: null }];
    const result = buildDecisionAtBackfill(liveRows);
    expect(result.applied[0]).not.toHaveProperty('decision_by');
    expect(result.applied[0]).not.toHaveProperty('decisionBy');
  });
});
