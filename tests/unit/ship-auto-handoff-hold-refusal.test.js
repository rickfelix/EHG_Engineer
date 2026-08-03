// SD-LEO-INFRA-SHIP-AUTO-HANDOFF-001 — the fence and the merge path now know about each other.
//
// THE WITNESSED NEAR-MISS: TESTING and VALIDATION had both fenced an SD at LEAD_FINAL pending human
// delivery of FR-5. /ship step 6.5 auto-fires post-merge-handoff-orchestrator.js, which runs
// EXEC-TO-PLAN -> PLAN-TO-LEAD -> LEAD-FINAL-APPROVAL and drives the SD to completed. Merging by the
// DEFAULT path would have driven it straight through that fence and NO GATE WOULD HAVE FAILED —
// each handoff is legitimately satisfied on its own terms. The SD would simply have ARRIVED at
// completed with the work undelivered.
//
// WHY THAT IS UNALARMABLE, and why these tests assert what they assert: `completed` is affirmatively
// excluded from every sweep. After the fact, a false completion is invisible — and so is a
// legitimate non-completion. They are the same observation. So a test asserting "the SD did not
// reach completed" passes when the fence works, when the chain crashes, AND when the orchestrator
// never ran. Only a POSITIVE observable — a refusal naming its holder — separates the fixed state
// from those failure modes.
import { describe, it, expect } from 'vitest';
import { classifyState } from '../../scripts/post-merge-handoff-orchestrator.js';

// A phase/status pair that WOULD advance, so every hold test below is proving the hold caused the
// refusal rather than the phase doing it anyway.
const ADVANCING = { status: 'active', current_phase: 'EXEC' };
const HELD = {
  requires_human_action_reason: 'FR-5 must be applied by a human before completion',
  requires_human_action_by: 'VALIDATION',
  requires_human_action_at: '2026-08-01T12:00:00Z',
};

describe('FR-1: a recorded hold refuses the auto-handoff', () => {
  // THE DECIDING SCENARIO — the witnessed shape, on the path a worker takes by default.
  it('refuses an SD that carries a hold, instead of advancing it', () => {
    const d = classifyState({ ...ADVANCING, metadata: HELD });
    expect(d.action).toBe('refuse_held');
    expect(d.action).not.toBe('advance');
  });

  // CONTROL — NOT optional coverage. A refusal that fires unconditionally satisfies every other
  // assertion in this file and blocks every merge in the fleet. A check that cannot tell held from
  // unheld is not a check.
  it('CONTROL: an SD with no hold still advances', () => {
    expect(classifyState({ ...ADVANCING, metadata: {} }).action).toBe('advance');
    expect(classifyState({ ...ADVANCING, metadata: null }).action).toBe('advance');
    expect(classifyState({ ...ADVANCING }).action).toBe('advance');
  });

  // The refusal must beat the advance decision, not follow it: refusing after the chain started
  // would leave the SD advanced partway, which is a worse state than either outcome.
  it('refuses across every phase that would otherwise advance', () => {
    for (const phase of ['EXEC', 'PLAN_PRD', 'PLAN', 'PLAN_VERIFICATION']) {
      expect(classifyState({ status: 'active', current_phase: phase, metadata: HELD }).action).toBe('refuse_held');
      expect(classifyState({ status: 'active', current_phase: phase, metadata: {} }).action).toBe('advance');
    }
  });

  // An already-completed SD has nothing to refuse — the no-op answer stays the more accurate one.
  it('does not relabel an already-completed SD as held', () => {
    expect(classifyState({ status: 'completed', current_phase: 'EXEC', metadata: HELD }).action).toBe('idempotent_skip');
  });
});

describe('FR-2: the refusal names the holding party and the release condition', () => {
  it('carries the hold reason and who set it', () => {
    const d = classifyState({ ...ADVANCING, metadata: HELD });
    expect(d.hold).toBeTruthy();
    expect(d.hold.reason).toBe('FR-5 must be applied by a human before completion');
    expect(d.hold.set_by).toBe('VALIDATION');
    expect(d.hold.source_key).toBe('requires_human_action_reason');
  });

  // A refusal saying only "held" sends the operator back into the code to find out why — the silent
  // no-op in a thinner disguise, and the failure this SD exists to remove.
  it('is not a bare flag — the reason is present and non-empty', () => {
    const d = classifyState({ ...ADVANCING, metadata: HELD });
    expect(typeof d.hold.reason).toBe('string');
    expect(d.hold.reason.length).toBeGreaterThan(0);
  });
});

describe('FR-3: the hold vocabulary is the shared SSOT, not a local copy', () => {
  // resolveHoldProvenance coalesces several ad-hoc hold-reason keys. If this file had re-implemented
  // the vocabulary, only the key it happened to know would refuse — and the drift would be silent,
  // because both halves keep returning plausible answers. Exercising a DIFFERENT key than the one
  // above proves the shared reader is doing the work.
  it('recognises a hold recorded under a different key', () => {
    const d = classifyState({
      ...ADVANCING,
      metadata: { not_worker_claimable_reason: 'chairman ratification pending', deferred_by: 'coordinator' },
    });
    expect(d.action).toBe('refuse_held');
    expect(d.hold.reason).toBe('chairman ratification pending');
    expect(d.hold.source_key).toBe('not_worker_claimable_reason');
  });
});

describe('FR-4/TR-1: pre-existing behaviour is unchanged for metadata-free callers', () => {
  // Pinned so the signature widening is provably inert: a later failure is then attributable to the
  // hold branch rather than to the refactor that preceded it.
  it('keeps every original branch and reason', () => {
    expect(classifyState({ status: 'completed', current_phase: 'EXEC' }))
      .toEqual({ action: 'idempotent_skip', reason: 'already_completed_no_op' });
    expect(classifyState({ status: 'active', current_phase: 'LEAD-FINAL-APPROVAL' }))
      .toEqual({ action: 'idempotent_skip', reason: 'already_completed_no_op' });
    expect(classifyState({ status: 'draft', current_phase: 'LEAD' }))
      .toEqual({ action: 'warn_skip', reason: 'no_exec_work_to_advance' });
    expect(classifyState({ status: 'active', current_phase: 'EXEC' }))
      .toEqual({ action: 'advance', reason: 'ready_for_handoff_chain' });
    expect(classifyState({ status: 'active', current_phase: 'WEIRD' }))
      .toEqual({ action: 'warn_skip', reason: 'unexpected_phase_WEIRD_status_active' });
  });

  // TS-4: the protection must hold on the DEFAULT path. The defect was that safety depended on the
  // operator knowing LEO_AUTOHANDOFF_ENABLED existed — so a refusal that only works when someone
  // sets a flag would demonstrate the opposite of the fix.
  it('refuses without reference to LEO_AUTOHANDOFF_ENABLED', () => {
    const prior = process.env.LEO_AUTOHANDOFF_ENABLED;
    delete process.env.LEO_AUTOHANDOFF_ENABLED;
    try {
      expect(classifyState({ ...ADVANCING, metadata: HELD }).action).toBe('refuse_held');
    } finally {
      if (prior === undefined) delete process.env.LEO_AUTOHANDOFF_ENABLED;
      else process.env.LEO_AUTOHANDOFF_ENABLED = prior;
    }
  });
});
