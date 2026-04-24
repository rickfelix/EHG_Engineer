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

function makeSupabaseStub({ auditEntries = [], learningRun = null } = {}) {
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
