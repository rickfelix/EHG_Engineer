/**
 * Tests for LEARNING_OR_BYPASS_RESOLVED gate (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001).
 *
 * Covers:
 *  - No bypass used → gate auto-passes (score 100)
 *  - Bypass used AND /learn ran → passes (score 100)
 *  - Bypass used AND /learn NOT ran + ENFORCE_LEARNING_GATE=true → blocks (score 0)
 *  - Bypass used AND /learn NOT ran + ENFORCE_LEARNING_GATE=false → warn-only (passes with score 60)
 *  - Missing sd_id → graceful skip
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createLearningOrBypassResolvedGate } from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/learning-or-bypass-resolved-gate.js';

function makeSupabaseStub({ auditEntries = [], learningRun = null, phaseHandoffs = [] } = {}) {
  return {
    from: (table) => {
      if (table === 'validation_audit_log') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({ data: auditEntries, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'learning_runs') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: learningRun, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      // SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-4): findUnresolvedPhaseChainBypasses's exact
      // chain shape -- select().eq().limit(), no .in() in this one.
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: phaseHandoffs, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ in: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
    },
  };
}

describe('LEARNING_OR_BYPASS_RESOLVED gate (SD-LEARN-FIX-ADDRESS-PAT-AGENT-001)', () => {
  const originalFlag = process.env.ENFORCE_LEARNING_GATE;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENFORCE_LEARNING_GATE;
    else process.env.ENFORCE_LEARNING_GATE = originalFlag;
  });

  it('passes with score 100 when no bypass entries exist', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({ auditEntries: [], learningRun: null }));
    const result = await gate.validator({ sd: { id: 'sd-test-1' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.bypass_count).toBe(0);
  });

  it('passes with score 100 when bypass used AND /learn completed', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      auditEntries: [{ correlation_id: 'x', metadata: {}, failure_category: 'bypass', created_at: new Date().toISOString() }],
      learningRun: { id: 'learn-1', status: 'completed', completed_at: new Date().toISOString() },
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-2' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.learning_ran).toBe(true);
  });

  it('BLOCKS (score 0) when bypass used without /learn AND ENFORCE_LEARNING_GATE=true', async () => {
    process.env.ENFORCE_LEARNING_GATE = 'true';
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      auditEntries: [{ correlation_id: 'x', metadata: {}, failure_category: 'bypass', created_at: new Date().toISOString() }],
      learningRun: null,
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-3' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('WARNS (score 60, passed=true) when bypass used without /learn AND ENFORCE_LEARNING_GATE=false', async () => {
    process.env.ENFORCE_LEARNING_GATE = 'false';
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      auditEntries: [{ correlation_id: 'x', metadata: {}, failure_category: 'bypass', created_at: new Date().toISOString() }],
      learningRun: null,
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-4' } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(60);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.issues.length).toBe(0);
  });

  it('skips gracefully when sd_id missing from context', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub());
    const result = await gate.validator({});
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings[0]).toContain('No sd_id');
  });
});

// SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-4/FR-7): a phase-chain bypass with no linked follow-up
// must REFUSE completion unconditionally -- never warn-only, never gated by ENFORCE_LEARNING_GATE
// (a DIFFERENT flag governing a DIFFERENT, pre-existing check).
describe('LEARNING_OR_BYPASS_RESOLVED gate — phase-chain bypass check (SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 FR-4)', () => {
  const originalFlag = process.env.ENFORCE_LEARNING_GATE;
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.ENFORCE_LEARNING_GATE;
    else process.env.ENFORCE_LEARNING_GATE = originalFlag;
  });

  it('BLOCKS unconditionally when a bypassed handoff has no pattern_id or followup_sd_key', async () => {
    // ENFORCE_LEARNING_GATE explicitly OFF -- proves this is a genuinely separate, unconditional
    // check, not merely the existing warn-only path with a different message.
    delete process.env.ENFORCE_LEARNING_GATE;
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      phaseHandoffs: [
        {
          id: 'handoff-1a1b3087',
          handoff_type: 'EXEC-TO-PLAN',
          metadata: { bypass: { reason: 'gate too strict', gates: ['MANDATORY_TESTING_VALIDATION'], pattern_id: null, followup_sd_key: null } },
        },
      ],
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-5' } });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details.reason).toBe('UNRESOLVED_PHASE_CHAIN_BYPASS');
    expect(result.details.unresolved_bypasses).toHaveLength(1);
    expect(result.details.unresolved_bypasses[0].handoff_id).toBe('handoff-1a1b3087');
  });

  it('PASSES (falls through to the existing check) when the bypass has a linked pattern_id', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      phaseHandoffs: [
        { id: 'handoff-2', handoff_type: 'EXEC-TO-PLAN', metadata: { bypass: { reason: 'r', pattern_id: 'PAT-001', followup_sd_key: null } } },
      ],
      auditEntries: [],
      learningRun: null,
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-6' } });
    expect(result.passed).toBe(true);
    expect(result.details.reason).not.toBe('UNRESOLVED_PHASE_CHAIN_BYPASS');
  });

  it('PASSES when the bypass has a linked followup_sd_key', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      phaseHandoffs: [
        { id: 'handoff-3', handoff_type: 'PLAN-TO-EXEC', metadata: { bypass: { reason: 'r', pattern_id: null, followup_sd_key: 'SD-FOLLOWUP-001' } } },
      ],
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-7' } });
    expect(result.passed).toBe(true);
  });

  it('a non-bypassed handoff row (no metadata.bypass) is not counted', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      phaseHandoffs: [
        { id: 'handoff-4', handoff_type: 'LEAD-TO-PLAN', metadata: { quality_score: 94 } },
      ],
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-8' } });
    expect(result.passed).toBe(true);
    expect(result.details.bypass_count).toBe(0);
  });

  it('multiple bypassed handoffs: ANY one unresolved still refuses', async () => {
    const gate = createLearningOrBypassResolvedGate(makeSupabaseStub({
      phaseHandoffs: [
        { id: 'handoff-5', handoff_type: 'PLAN-TO-EXEC', metadata: { bypass: { reason: 'r', pattern_id: 'PAT-002' } } },
        { id: 'handoff-6', handoff_type: 'EXEC-TO-PLAN', metadata: { bypass: { reason: 'r2' } } },
      ],
    }));
    const result = await gate.validator({ sd: { id: 'sd-test-9' } });
    expect(result.passed).toBe(false);
    expect(result.details.unresolved_bypasses).toHaveLength(1);
    expect(result.details.unresolved_bypasses[0].handoff_id).toBe('handoff-6');
    expect(result.details.total_bypasses_in_chain).toBe(2);
  });
});
