/**
 * Unit tests for lib/eva/kill-gate-teeth/firing-verification.js.
 *
 * SD-LEO-INFRA-KILL-GATE-TEETH-001 (ALPHA leg)
 *
 * Covers:
 *   - reads discharged predictions ONLY via the discharged-only RPC (never the base table)
 *   - system_events is the pinned primary observation surface (fired / hold / unknown)
 *   - a fired verdict cross-checks chairman_decisions routing
 *   - matched_prediction: true (agrees), false (disagrees), null (no prediction covers it)
 *   - the persisted flag_mode reflects getThesisKillFlag() at call time
 *   - getTeethProofReport aggregates only over the LIVE-derived kill stage set
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/eva/lifecycle/thesis-kill-gate.js', () => ({
  getThesisKillFlag: vi.fn(() => ({ name: 'LEO_THESIS_KILL_GATE', value: 'observe', mode: 'observe' })),
}));

import { getThesisKillFlag } from '../../../../lib/eva/lifecycle/thesis-kill-gate.js';
import {
  verifyFiringForCrossing,
  getTeethProofReport,
  readDischargedPredictions,
} from '../../../../lib/eva/kill-gate-teeth/firing-verification.js';

const VENTURE_ID = 'bbbb1111-2222-3333-4444-555555555555';
const KILL_STAGE = 5;

function buildSupabaseMock({
  killStages = [3, 5, 13, 24],
  predictions = [],
  systemEvents = [],
  decisionRows = [],
  insertedRecords = [],
  insertedRecordId = 'proof-1',
} = {}) {
  return {
    rpc: vi.fn((fnName) => {
      if (fnName === 'kill_gate_teeth_discharged_predictions') {
        return Promise.resolve({ data: predictions, error: null });
      }
      throw new Error(`unexpected rpc: ${fnName}`);
    }),
    from: vi.fn((table) => {
      if (table === 'venture_stages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: killStages.map((n) => ({ stage_number: n })), error: null }),
            })),
          })),
        };
      }
      if (table === 'system_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: systemEvents, error: null }),
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: decisionRows, error: null }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'kill_gate_teeth_proof_records') {
        // fetchAllPaginated calls .range() on whatever query object is returned; a single-page
        // response (rows.length < pageSize) ends the pagination loop after one call.
        const rangeResolved = vi.fn().mockResolvedValue({ data: insertedRecords, error: null });
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                range: rangeResolved,
                eq: vi.fn(() => ({ range: rangeResolved })),
              })),
            })),
          })),
          insert: vi.fn((row) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: insertedRecordId, ...row }, error: null }),
            })),
          })),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('readDischargedPredictions', () => {
  it('reads via the discharged-only RPC, never the base table', async () => {
    const supabase = buildSupabaseMock({
      predictions: [{ id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE }],
    });
    const rows = await readDischargedPredictions(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(rows).toEqual([{ id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE }]);
    expect(supabase.rpc).toHaveBeenCalledWith('kill_gate_teeth_discharged_predictions');
    expect(supabase.from).not.toHaveBeenCalledWith('kill_gate_sealed_predictions');
  });

  it('filters the RPC result to the requested (venture, stage) crossing', async () => {
    const supabase = buildSupabaseMock({
      predictions: [
        { id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE },
        { id: 'p2', expected_verdict: 'fired', venture_id: 'other-venture', expected_stage: KILL_STAGE },
      ],
    });
    const rows = await readDischargedPredictions(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(rows).toEqual([{ id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE }]);
  });
});

describe('verifyFiringForCrossing', () => {
  it('records observed_verdict=fired from system_events and matched_prediction=true when the sealed prediction agrees', async () => {
    const supabase = buildSupabaseMock({
      predictions: [{ id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE }],
      systemEvents: [{ id: 'evt-1', event_type: 'THESIS_KILL_FIRED', payload: { criterionId: 'K1' }, created_at: '2026-08-29T00:00:00Z' }],
      decisionRows: [{ id: 'dec-1', decision_type: 'thesis_kill_tier_b:K1' }],
    });
    const record = await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(record.observed_verdict).toBe('fired');
    expect(record.predicted_verdict).toBe('fired');
    expect(record.matched_prediction).toBe(true);
    expect(record.gate_type).toBe('kill');
    expect(record.observed_source).toBe('system_events');
    expect(record.routed_to_decision).toBe(true);
    expect(record.chairman_decision_id).toBe('dec-1');
    expect(record.flag_mode).toBe('observe');
  });

  it('records matched_prediction=false when the sealed prediction disagrees with the observed verdict', async () => {
    const supabase = buildSupabaseMock({
      predictions: [{ id: 'p1', expected_verdict: 'fired', venture_id: VENTURE_ID, expected_stage: KILL_STAGE }],
      systemEvents: [{ id: 'evt-1', event_type: 'THESIS_KILL_CANNOT_EVALUATE', payload: { criterionId: 'K1' }, created_at: '2026-08-29T00:00:00Z' }],
    });
    const record = await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(record.observed_verdict).toBe('hold');
    expect(record.matched_prediction).toBe(false);
  });

  it('records matched_prediction=null when no sealed prediction covers the crossing', async () => {
    const supabase = buildSupabaseMock({ predictions: [], systemEvents: [] });
    const record = await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(record.observed_verdict).toBe('unknown');
    expect(record.matched_prediction).toBeNull();
    expect(record.sealed_prediction_id).toBeNull();
  });

  it('never cross-checks chairman_decisions when the observed verdict is not fired', async () => {
    const supabase = buildSupabaseMock({ predictions: [], systemEvents: [] });
    await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(supabase.from).not.toHaveBeenCalledWith('chairman_decisions');
  });

  it('marks gate_type=none for a stage outside the live-derived kill set', async () => {
    const supabase = buildSupabaseMock({ killStages: [3, 5, 13, 24], predictions: [], systemEvents: [] });
    const record = await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: 7 });
    expect(record.gate_type).toBe('none');
  });

  it('persists whatever flag mode getThesisKillFlag() reports at call time', async () => {
    getThesisKillFlag.mockReturnValueOnce({ name: 'LEO_THESIS_KILL_GATE', value: 'binding', mode: 'binding' });
    const supabase = buildSupabaseMock({ predictions: [], systemEvents: [] });
    const record = await verifyFiringForCrossing(supabase, { ventureId: VENTURE_ID, stageNumber: KILL_STAGE });
    expect(record.flag_mode).toBe('binding');
  });
});

describe('getTeethProofReport', () => {
  it('aggregates only over the live-derived kill stage set and computes summary counts', async () => {
    const insertedRecords = [
      { id: 'r1', stage_number: 5, matched_prediction: true },
      { id: 'r2', stage_number: 13, matched_prediction: false },
      { id: 'r3', stage_number: 24, matched_prediction: null },
    ];
    const supabase = buildSupabaseMock({ killStages: [3, 5, 13, 24], insertedRecords });
    const report = await getTeethProofReport(supabase, {});
    expect(report.kill_stages).toEqual([3, 5, 13, 24]);
    expect(report.summary).toEqual({ total: 3, matched: 1, mismatched: 1, uncovered: 1 });
  });
});
