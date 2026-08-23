/**
 * SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 (T-minus P1 — Evidence Layer).
 *
 * recordGateAttempt() dual-writes to the NEW eva_stage_gate_attempts evidence layer
 * (open_eva_gate_attempt/finalize_eva_gate_attempt RPCs, not yet chairman-applied — see
 * database/chairman-gated/20260823_eva_stage_gate_attempts.sql). These tests mock supabase.rpc
 * to verify the JS wrapper's own logic in isolation: correct RPC call shape, fail-loud behavior
 * on any failure mode (TESTING F6 — a silently-dropped attempt write is the exact defect this
 * evidence layer exists to prevent), and that reasoning/metadata are kept distinct fields, never
 * one clobbering the other (TESTING F4).
 */
import { describe, it, expect, vi } from 'vitest';
import { recordGateAttempt } from '../../../lib/eva/artifact-persistence-service.js';

function mockSupabase({ openResult, finalizeResult }) {
  const rpc = vi.fn((fnName) => {
    if (fnName === 'open_eva_gate_attempt') return Promise.resolve(openResult);
    if (fnName === 'finalize_eva_gate_attempt') return Promise.resolve(finalizeResult);
    throw new Error(`unexpected rpc call: ${fnName}`);
  });
  return { rpc };
}

const OPEN_OK = { data: [{ attempt_id: 'attempt-1', attempt_number: 1 }], error: null };
const FINALIZE_OK = { data: true, error: null };

describe('recordGateAttempt', () => {
  it('opens then finalizes an attempt and returns the attempt_id', async () => {
    const supabase = mockSupabase({ openResult: OPEN_OK, finalizeResult: FINALIZE_OK });

    const attemptId = await recordGateAttempt(supabase, {
      ventureId: 'v1',
      stageNumber: 5,
      gateType: 'entry',
      passed: true,
      reasoning: 'looks good',
      metadata: { correlationId: 'c1' },
      criteria: { score: 90 },
      evaluatedBy: 'eva-orchestrator',
    });

    expect(attemptId).toBe('attempt-1');
    expect(supabase.rpc).toHaveBeenCalledWith('open_eva_gate_attempt', {
      p_venture_id: 'v1',
      p_stage_number: 5,
      p_gate_type: 'entry',
      p_evaluator: 'eva-orchestrator',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('finalize_eva_gate_attempt', {
      p_attempt_id: 'attempt-1',
      p_resolved_outcome: 'machine_pass',
      p_passed: true,
      p_reasoning: 'looks good',
      p_metadata: { correlationId: 'c1' },
      p_gate_criteria: { score: 90 },
    });
  });

  it('defaults resolved_outcome to machine_fail when passed is false', async () => {
    const supabase = mockSupabase({ openResult: OPEN_OK, finalizeResult: FINALIZE_OK });

    await recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'exit', passed: false });

    expect(supabase.rpc).toHaveBeenCalledWith('finalize_eva_gate_attempt', expect.objectContaining({
      p_resolved_outcome: 'machine_fail',
      p_passed: false,
    }));
  });

  it('maps code-level gate types the same way as recordGateResult (stage_gate -> exit, reality_gate -> entry)', async () => {
    const supabase = mockSupabase({ openResult: OPEN_OK, finalizeResult: FINALIZE_OK });

    await recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'reality_gate', passed: true });
    expect(supabase.rpc).toHaveBeenCalledWith('open_eva_gate_attempt', expect.objectContaining({ p_gate_type: 'entry' }));

    await recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'taste_gate_s17', passed: true });
    expect(supabase.rpc).toHaveBeenCalledWith('open_eva_gate_attempt', expect.objectContaining({ p_gate_type: 'exit' }));
  });

  it('keeps reasoning and metadata as distinct fields, never one clobbering the other (TESTING F4)', async () => {
    const supabase = mockSupabase({ openResult: OPEN_OK, finalizeResult: FINALIZE_OK });

    await recordGateAttempt(supabase, {
      ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true,
      reasoning: 'human-readable summary',
      metadata: { correlationId: 'c1', nested: { a: 1 } },
    });

    const finalizeCall = supabase.rpc.mock.calls.find(([fn]) => fn === 'finalize_eva_gate_attempt');
    expect(finalizeCall[1].p_reasoning).toBe('human-readable summary');
    expect(finalizeCall[1].p_metadata).toEqual({ correlationId: 'c1', nested: { a: 1 } });
  });

  it('a string metadata value (a pre-stringified caller mistake) is dropped, not silently passed through as text', async () => {
    const supabase = mockSupabase({ openResult: OPEN_OK, finalizeResult: FINALIZE_OK });

    await recordGateAttempt(supabase, {
      ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true,
      metadata: JSON.stringify({ correlationId: 'c1' }),
    });

    const finalizeCall = supabase.rpc.mock.calls.find(([fn]) => fn === 'finalize_eva_gate_attempt');
    expect(finalizeCall[1].p_metadata).toBeNull();
  });

  it('fails loud when open_eva_gate_attempt errors (TESTING F6)', async () => {
    const supabase = mockSupabase({
      openResult: { data: null, error: { message: 'db unavailable' } },
      finalizeResult: FINALIZE_OK,
    });

    await expect(
      recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true })
    ).rejects.toThrow(/open failed/);
  });

  it('fails loud when finalize_eva_gate_attempt errors (TESTING F6)', async () => {
    const supabase = mockSupabase({
      openResult: OPEN_OK,
      finalizeResult: { data: null, error: { message: 'constraint violation' } },
    });

    await expect(
      recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true })
    ).rejects.toThrow(/finalize failed/);
  });

  it('fails loud when finalize returns false (row already finalized / missing) instead of silently succeeding', async () => {
    const supabase = mockSupabase({
      openResult: OPEN_OK,
      finalizeResult: { data: false, error: null },
    });

    await expect(
      recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true })
    ).rejects.toThrow(/did not update attempt/);
  });

  it('names the pending-migration cause distinctly on a PGRST202 (function not found) error (VALIDATION VAL-B2)', async () => {
    const supabase = mockSupabase({
      openResult: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.open_eva_gate_attempt' } },
      finalizeResult: FINALIZE_OK,
    });

    await expect(
      recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true })
    ).rejects.toThrow(/migration not yet applied/);
  });

  it('does not relabel a genuine (non-PGRST202) error as a pending-migration issue', async () => {
    const supabase = mockSupabase({
      openResult: OPEN_OK,
      finalizeResult: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    });

    await expect(
      recordGateAttempt(supabase, { ventureId: 'v1', stageNumber: 5, gateType: 'entry', passed: true })
    ).rejects.toThrow(/duplicate key value/);
  });
});
