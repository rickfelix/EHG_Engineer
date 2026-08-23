/**
 * SD-LEO-INFRA-S5-DEVILS-ADVOCATE-NOT-PRODUCED-001 — kill gates deterministically produce + persist
 * their adversarial review, and fail loud if they cannot.
 *
 * RCA: the EVA orchestrator (§5b) gated devil's-advocate PRODUCTION on autonomyPreCheck — the
 * GATE_BEHAVIOR_MATRIX sets devils_advocate='auto_approve' (L2) / 'skip' (L3/L4) and BOTH branches
 * produced NO artifact, so a non-reserved kill gate (13/23) at high autonomy emitted nothing. The fix
 * makes the production decision a pure rule (mustProduceDevilsAdvocate) that is unconditional for kill
 * gates, plus a fail-loud predicate (isKillGateFailLoud). These tests lock both, sourced from the same
 * KILL_GATES set the orchestrator uses (via isDevilsAdvocateGate), so they stay in sync if it changes.
 */
import { describe, it, expect } from 'vitest';
import {
  isDevilsAdvocateGate,
  mustProduceDevilsAdvocate,
  isKillGateFailLoud,
  _internal,
} from '../../../lib/eva/devils-advocate.js';

// SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-1): SSOT-derived (async, requires supabase) — top-level
// await preserves this file's "stays in sync with the live set" property.
function mockSupabase() {
  const rows = Array.from({ length: 26 }, (_, i) => {
    const stage_number = i + 1;
    const gate_type = [3, 5, 13, 23].includes(stage_number) ? 'kill'
      : [10, 16, 17, 18, 19, 24, 25].includes(stage_number) ? 'promotion'
      : 'none';
    return { stage_number, gate_type, work_type: 'decision_gate', review_mode: 'auto', is_high_consequence: false };
  });
  return {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
    }),
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
  };
}

const supabase = mockSupabase();
const KILL_GATES = await _internal.getKillGates(supabase);
const PROMOTION_GATES = await _internal.getPromotionGates(supabase);
// The full autonomy action space; the two that previously caused a silent skip are skip + auto_approve.
const AUTONOMY_ACTIONS = ['skip', 'auto_approve', 'manual'];

describe('kill gates produce the adversarial review under EVERY autonomy action', () => {
  for (const stage of KILL_GATES) {
    it(`stage ${stage} is a kill gate and produces its review under skip/auto_approve/manual`, async () => {
      const { isGate, gateType } = await isDevilsAdvocateGate(supabase, stage);
      expect(isGate).toBe(true);
      expect(gateType).toBe('kill');
      for (const action of AUTONOMY_ACTIONS) {
        // The exact regression: skip/auto_approve must NOT bypass production for a kill gate.
        expect(mustProduceDevilsAdvocate(gateType, action), `kill stage ${stage} under ${action}`).toBe(true);
      }
    });
  }

  it('covers all four canonical kill gates [3,5,13,23]', () => {
    expect([...KILL_GATES].sort((a, b) => a - b)).toEqual([3, 5, 13, 23]);
  });
});

describe('kill-gate fail-loud: a produce/persist failure must never be swallowed', () => {
  it('isKillGateFailLoud is true for kill gates, false for promotion gates', () => {
    expect(isKillGateFailLoud('kill')).toBe(true);
    expect(isKillGateFailLoud('promotion')).toBe(false);
    expect(isKillGateFailLoud(null)).toBe(false);
  });

  it('every KILL_GATES stage classifies as fail-loud (kill)', async () => {
    for (const stage of KILL_GATES) {
      const { gateType } = await isDevilsAdvocateGate(supabase, stage);
      expect(isKillGateFailLoud(gateType)).toBe(true);
    }
  });
});

describe('promotion gates retain autonomy-aware bypass (no regression)', () => {
  for (const stage of PROMOTION_GATES) {
    it(`promotion stage ${stage} bypasses on skip/auto_approve, produces on manual`, async () => {
      const { gateType } = await isDevilsAdvocateGate(supabase, stage);
      expect(gateType).toBe('promotion');
      expect(mustProduceDevilsAdvocate(gateType, 'skip')).toBe(false);
      expect(mustProduceDevilsAdvocate(gateType, 'auto_approve')).toBe(false);
      expect(mustProduceDevilsAdvocate(gateType, 'manual')).toBe(true); // manual still produces
      expect(isKillGateFailLoud(gateType)).toBe(false); // and stays non-fatal
    });
  }

  it('a non-gate stage never produces and is never fail-loud', async () => {
    const { isGate, gateType } = await isDevilsAdvocateGate(supabase, 7); // not a DA gate
    expect(isGate).toBe(false);
    expect(mustProduceDevilsAdvocate(gateType, 'manual')).toBe(false);
    expect(isKillGateFailLoud(gateType)).toBe(false);
  });
});
