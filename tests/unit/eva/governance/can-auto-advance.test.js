/**
 * SD-LEO-INFRA-RUN-STAGE-ENGINE-GATE-AUTONOMY-001 — the ONE shared gate-eligibility predicate.
 * Both the worker (_canAutoAdvance) and the engine (executeStage) delegate here, so the engine can
 * no longer auto-approve review + HARD gates via a hardcoded checkAutonomy('stage_gate') call. The
 * predicate wraps the can_auto_advance RPC and DEFAULTS TO BLOCK on any error.
 */
import { describe, it, expect, vi } from 'vitest';
import { canAutoAdvance } from '../../../../lib/eva/governance/can-auto-advance.js';

function sb(rpcResult) {
  return { rpc: vi.fn(async () => rpcResult) };
}
const quietLogger = { log: () => {}, warn: () => {} };

describe('canAutoAdvance — shared predicate over can_auto_advance RPC', () => {
  it('returns true when the RPC verdict is can=true', async () => {
    const supabase = sb({ data: [{ can: true, reason: null, layer: 0 }], error: null });
    expect(await canAutoAdvance({ supabase, stageNumber: 5, logger: quietLogger })).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('can_auto_advance', { p_stage_number: 5 });
  });

  it('returns false (HOLD) when the RPC verdict is can=false (review/hard/kill/promotion)', async () => {
    for (const reason of ['review_default_pause', 'kill_promotion_gate', 'global_off', 'explicit_pause']) {
      const supabase = sb({ data: [{ can: false, reason, layer: 1 }], error: null });
      expect(await canAutoAdvance({ supabase, stageNumber: 10, logger: quietLogger }), reason).toBe(false);
    }
  });

  it('DEFAULT-BLOCK on RPC error', async () => {
    const supabase = sb({ data: null, error: { message: 'boom' } });
    expect(await canAutoAdvance({ supabase, stageNumber: 8, logger: quietLogger })).toBe(false);
  });

  it('DEFAULT-BLOCK on empty rows', async () => {
    const supabase = sb({ data: [], error: null });
    expect(await canAutoAdvance({ supabase, stageNumber: 8, logger: quietLogger })).toBe(false);
  });

  it('DEFAULT-BLOCK when the RPC throws', async () => {
    const supabase = { rpc: vi.fn(async () => { throw new Error('network'); }) };
    expect(await canAutoAdvance({ supabase, stageNumber: 8, logger: quietLogger })).toBe(false);
  });

  it('preserves the [SAE] log contract (REG-7) on both verdicts', async () => {
    const logs = [];
    const logger = { log: (m) => logs.push(m), warn: (m) => logs.push(m) };
    await canAutoAdvance({ supabase: sb({ data: [{ can: true }], error: null }), stageNumber: 3, logger });
    await canAutoAdvance({ supabase: sb({ data: [{ can: false, reason: 'review_default_pause', layer: 4 }], error: null }), stageNumber: 8, logger });
    expect(logs.some((m) => /\[SAE\] canAutoAdvance\(3\): approved/.test(m))).toBe(true);
    expect(logs.some((m) => /\[SAE\] canAutoAdvance\(8\): blocked — review-mode default-pause/.test(m))).toBe(true);
  });
});
