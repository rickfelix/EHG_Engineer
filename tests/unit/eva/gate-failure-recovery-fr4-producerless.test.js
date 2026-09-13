/**
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 FR-4.
 *
 * A separate file (not tests/unit/eva/gate-failure-recovery.test.js) because that file is
 * currently quarantined (tests/quarantine-manifest.json, unrelated pre-existing
 * assertion-drift failure) and excluded from the `unit` vitest project's include set --
 * additions there would never actually run. This file covers only routeGateOutcome's
 * FR-4 producer-less-artifact carve-out.
 */
import { describe, it, expect, vi } from 'vitest';
import { routeGateOutcome } from '../../../lib/eva/gate-failure-recovery.js';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() };

function mockSupabase(overrides = {}) {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table];
      return { insert: insertFn };
    }),
    _insertFn: insertFn,
  };
}

function feedbackMock() {
  const insertedRows = [];
  const table = {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
    insert: (row) => {
      insertedRows.push(row);
      return { select: () => ({ single: async () => ({ data: { id: 'fb-1' }, error: null }) }) };
    },
  };
  return { table, insertedRows };
}

describe('routeGateOutcome FR-4: producer-less artifact carve-out', () => {
  it('routes a pure producer-less-artifact gap (launch_usage_signal) to harness_backlog', async () => {
    const { table: feedbackTable, insertedRows } = feedbackMock();
    const supabase = mockSupabase({ feedback: feedbackTable });

    const result = await routeGateOutcome(
      'v1',
      'critical',
      { reasons: [{ code: 'ARTIFACT_MISSING', artifact_type: 'launch_usage_signal', message: 'missing' }], fromStage: 24, toStage: 25 },
      { supabase, logger: silentLogger }
    );

    expect(result.routed).toBe(true);
    expect(result.path).toBe('harness_backlog');
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].category).toBe('harness_backlog');
    expect(insertedRows[0].title).toMatch(/launch_usage_signal/);
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it('still escalates normally (chairman_decisions) for a REAL failure mixed with a producer-less one', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({ chairman_decisions: { insert: insertFn } });

    const result = await routeGateOutcome(
      'v1',
      'critical',
      {
        reasons: [
          { code: 'ARTIFACT_MISSING', artifact_type: 'launch_usage_signal' },
          { code: 'ARTIFACT_MISSING', artifact_type: 'legal_document' },
        ],
        fromStage: 24,
        toStage: 25,
      },
      { supabase, logger: silentLogger }
    );

    expect(result.routed).toBe(true);
    expect(result.path).toBe('dfe');
    expect(insertFn).toHaveBeenCalled();
  });

  it('still escalates normally (chairman_decisions) for a producer-backed artifact type', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({ chairman_decisions: { insert: insertFn } });

    const result = await routeGateOutcome(
      'v1',
      'critical',
      { reasons: [{ code: 'ARTIFACT_MISSING', artifact_type: 'legal_document' }], fromStage: 24, toStage: 25 },
      { supabase, logger: silentLogger }
    );

    expect(result.routed).toBe(true);
    expect(result.path).toBe('dfe');
    expect(insertFn).toHaveBeenCalled();
  });

  it('still escalates normally (chairman_decisions) for a non-ARTIFACT_MISSING critical reason', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = mockSupabase({ chairman_decisions: { insert: insertFn } });

    const result = await routeGateOutcome(
      'v1',
      'critical',
      { reasons: [{ code: 'DB_ERROR' }], fromStage: 24, toStage: 25 },
      { supabase, logger: silentLogger }
    );

    expect(result.routed).toBe(true);
    expect(result.path).toBe('dfe');
    expect(insertFn).toHaveBeenCalled();
  });
});
