/**
 * SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 (FR-4) — freeze-then-ratify packet generator + apply path.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildPacket, generatePacket } from '../../scripts/reconciliation-packet-generator.mjs';
import { classifyOutcome, applyPacket, OUTCOME } from '../../scripts/reconciliation-packet-apply.mjs';

describe('reconciliation-packet-generator', () => {
  it('buildPacket: stamped_at is recorded ONCE for the whole packet, not per-row', () => {
    const packet = buildPacket(
      [
        { id: 'v1', name: 'Venture 1', current_lifecycle_stage: 5 },
        { id: 'v2', name: 'Venture 2', current_lifecycle_stage: 12 },
      ],
      '2026-08-25T12:00:00.000Z',
    );
    expect(packet.stamped_at).toBe('2026-08-25T12:00:00.000Z');
    expect(packet.venture_count).toBe(2);
    expect(packet.ventures).toEqual([
      { id: 'v1', name: 'Venture 1', frozen_stage: 5 },
      { id: 'v2', name: 'Venture 2', frozen_stage: 12 },
    ]);
    // stamped_at does not appear per-row
    for (const v of packet.ventures) expect(v.stamped_at).toBeUndefined();
  });

  it('generatePacket: queries only is_demo=false ventures, bounded by an explicit limit', async () => {
    const limitSpy = vi.fn().mockResolvedValue({
      data: [{ id: 'v1', name: 'Real Venture', current_lifecycle_stage: 3 }],
      error: null,
    });
    const eqSpy = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: limitSpy }) });
    const supabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqSpy }) }),
    };

    const packet = await generatePacket(supabase, { now: '2026-08-25T00:00:00.000Z' });

    expect(supabase.from).toHaveBeenCalledWith('ventures');
    expect(eqSpy).toHaveBeenCalledWith('is_demo', false);
    expect(limitSpy).toHaveBeenCalledWith(999);
    expect(packet.venture_count).toBe(1);
    expect(packet.stamped_at).toBe('2026-08-25T00:00:00.000Z');
  });

  it('generatePacket: throws (does not silently continue) on a read error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) }),
          }),
        }),
      }),
    };
    await expect(generatePacket(supabase)).rejects.toThrow(/boom/);
  });
});

describe('reconciliation-packet-apply — classifyOutcome (pure)', () => {
  it('outcome 2: stage diverged from the frozen packet value', () => {
    const result = classifyOutcome({ frozenStage: 5, liveStage: 6, rpcResult: null });
    expect(result.outcome).toBe(OUTCOME.STAGE_DIVERGED_REQUEUE);
  });

  it('outcome 1: clean apply when stage matches and RPC succeeds', () => {
    const result = classifyOutcome({ frozenStage: 5, liveStage: 5, rpcResult: { success: true } });
    expect(result.outcome).toBe(OUTCOME.CLEAN_APPLY);
  });

  it('outcome 3: content-gate refusal (artifact_precondition_unmet) is DISTINCT from outcome 2', () => {
    const result = classifyOutcome({
      frozenStage: 5,
      liveStage: 5,
      rpcResult: { success: false, error: 'artifact_precondition_unmet' },
    });
    expect(result.outcome).toBe(OUTCOME.CONTENT_GATE_REFUSAL);
    expect(result.outcome).not.toBe(OUTCOME.STAGE_DIVERGED_REQUEUE);
  });

  it('outcome 3: content-gate refusal (gate_not_approved)', () => {
    const result = classifyOutcome({
      frozenStage: 17,
      liveStage: 17,
      rpcResult: { success: false, error: 'gate_not_approved' },
    });
    expect(result.outcome).toBe(OUTCOME.CONTENT_GATE_REFUSAL);
  });

  it('a late-detected stage_mismatch from the RPC itself is still outcome 2, not outcome 3', () => {
    const result = classifyOutcome({
      frozenStage: 5,
      liveStage: 5, // our own pre-check saw a match...
      rpcResult: { success: false, error: 'stage_mismatch' }, // ...but the RPC's FOR UPDATE read raced past it
    });
    expect(result.outcome).toBe(OUTCOME.STAGE_DIVERGED_REQUEUE);
  });
});

describe('reconciliation-packet-apply — applyPacket (mock supabase)', () => {
  it('mutated venture re-queues (outcome 2); unmutated venture applies cleanly (outcome 1)', async () => {
    const packet = {
      stamped_at: '2026-08-25T00:00:00.000Z',
      ventures: [
        { id: 'mutated', name: 'Mutated', frozen_stage: 5 },
        { id: 'clean', name: 'Clean', frozen_stage: 5 },
      ],
    };

    const liveStages = { mutated: 6, clean: 5 }; // mutated venture advanced mid-window

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn((col, id) => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { current_lifecycle_stage: liveStages[id] }, error: null }),
          })),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: { success: true, from_stage: 5, to_stage: 6 }, error: null }),
    };

    const results = await applyPacket(supabase, packet);

    const mutatedResult = results.find((r) => r.ventureId === 'mutated');
    const cleanResult = results.find((r) => r.ventureId === 'clean');
    expect(mutatedResult.outcome).toBe(OUTCOME.STAGE_DIVERGED_REQUEUE);
    expect(cleanResult.outcome).toBe(OUTCOME.CLEAN_APPLY);

    // The RPC must be called only for the venture whose stage still matches -- calling it for a
    // known-diverged venture would risk advancing from the WRONG from_stage.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('advance_venture_stage', expect.objectContaining({ p_venture_id: 'clean', p_from_stage: 5, p_to_stage: 6 }));
  });

  it('a venture whose stage matches but is content-gate-refused surfaces as outcome 3, distinct from outcome 2', async () => {
    const packet = {
      stamped_at: '2026-08-25T00:00:00.000Z',
      ventures: [{ id: 'refused', name: 'Refused', frozen_stage: 10 }],
    };
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { current_lifecycle_stage: 10 }, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: { success: false, error: 'artifact_precondition_unmet' }, error: null }),
    };

    const results = await applyPacket(supabase, packet);
    expect(results[0].outcome).toBe(OUTCOME.CONTENT_GATE_REFUSAL);
  });

  it('calls advance_venture_stage (a registered writer), never a raw ventures.update', async () => {
    const packet = { stamped_at: 't', ventures: [{ id: 'v1', name: 'V1', frozen_stage: 1 }] };
    const updateFn = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { current_lifecycle_stage: 1 }, error: null }) }),
        }),
        update: updateFn,
      }),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    };

    await applyPacket(supabase, packet);
    expect(supabase.rpc).toHaveBeenCalledWith('advance_venture_stage', expect.any(Object));
    expect(updateFn).not.toHaveBeenCalled();
  });
});
