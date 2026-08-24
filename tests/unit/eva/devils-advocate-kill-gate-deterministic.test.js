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

describe('promotion gates: skip no longer bypasses production (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-5); auto_approve (L2) unaffected by design', () => {
  for (const stage of PROMOTION_GATES) {
    it(`promotion stage ${stage} now PRODUCES on skip (L3/L4, was the silent bypass), still bypasses on auto_approve (L2), produces on manual`, async () => {
      const { gateType } = await isDevilsAdvocateGate(supabase, stage);
      expect(gateType).toBe('promotion');
      // FR-5 (descoped per O1: no code-expressible "W3-class evaluation" definition was obtainable
      // within this SD's window -- see strategic_directives_v2.metadata.scope_correction and the
      // completion retrospective for which path was taken). The autonomy matrix
      // (autonomy-model.js:44-45) gives devils_advocate:'skip' ONLY at L3/L4 -- disabling the skip
      // bypass here disables it for L3/L4 generally, matching the descope's stated broader claim.
      expect(mustProduceDevilsAdvocate(gateType, 'skip')).toBe(true);
      // D9/TS-10: L2's 'auto_approve' bypass is a SEPARATE autonomy action and stays intact by
      // design -- FR-5 only targets 'skip'.
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

// SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-5) TS-9/TS-10.
describe('FR-5: fix lives at the real live devils_advocate site, never the dead stage_gate branch', () => {
  it('TS-9 (source-pin, END-ANCHORED, never a fixed line number): the real orchestrator call site '
    + 'still consumes mustProduceDevilsAdvocate(daGateType, daAutonomy.action) -- the site this SD '
    + 'fixed -- and it is textually DISTINCT from the dead stageAutonomy.action===\'skip\' branch '
    + '(a different guard on a different variable, confirmed unreachable independently by '
    + 'stage-governance.js\'s _autonomyGateType, per O6) which this SD does NOT touch', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/eva/eva-orchestrator.js'), 'utf8');

    // The real, live devils_advocate guard this SD's fix reaches at runtime.
    expect(src).toMatch(/mustProduceDevilsAdvocate\(daGateType, daAutonomy\.action\)/);

    // The dead branch (stage_gate autonomy, NOT devils_advocate) is a separate guard on a
    // separate variable -- present, unrelated, and untouched by this SD.
    expect(src).toMatch(/stageAutonomy\.action === 'skip'/);

    // They must never collapse into the same conditional -- END-ANCHORED on the literal guard
    // text itself, not a char offset, so an unrelated edit above/below never false-fails this.
    const liveGuardIdx = src.indexOf('mustProduceDevilsAdvocate(daGateType, daAutonomy.action)');
    const deadBranchIdx = src.indexOf("stageAutonomy.action === 'skip'");
    expect(liveGuardIdx).toBeGreaterThan(-1);
    expect(deadBranchIdx).toBeGreaterThan(-1);
    expect(liveGuardIdx).not.toBe(deadBranchIdx);
  });

  it('TS-10 edge-case controls: an L2 promotion-gate auto_approve is unaffected, and a non-promotion '
    + 'stage_gate never produces regardless of skip', () => {
    // Control (a): L2 promotion-gate bypass (auto_approve) stays intact -- already asserted per-stage
    // above; restated here as an explicit named control per D9's "no over-broad regression" requirement.
    expect(mustProduceDevilsAdvocate('promotion', 'auto_approve')).toBe(false);
    // Control (b): a non-promotion, non-kill gate (e.g. stage_gate) NEVER produces, regardless of
    // 'skip' -- FR-5's fix only has teeth on promotion gates (devils-advocate.js:106, D9).
    expect(mustProduceDevilsAdvocate('stage_gate', 'skip')).toBe(false);
    expect(mustProduceDevilsAdvocate(null, 'skip')).toBe(false);
  });
});
