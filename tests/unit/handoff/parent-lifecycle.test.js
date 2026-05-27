/**
 * Tests for SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-2/FR-3/FR-4/FR-5.
 *
 * Validates: EXEC-TO-PLAN parent gate set, SCOPE_COMPLETION parent soft-pass,
 * PLAN-TO-LEAD wait verdict, and ValidationOrchestrator wait propagation.
 */

import { describe, it, expect } from 'vitest';
import { getParentOrchestratorExecToPlanGates } from '../../../scripts/modules/handoff/executors/exec-to-plan/parent-orchestrator.js';

function makeFakeSupabase(rows = [], error = null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async limit() {
                  return { data: rows, error };
                },
                // For .eq().single() chains used by some callers
                async single() {
                  return { data: rows[0] || null, error };
                },
                // For chain that returns plain array (no .limit)
                then(resolve) {
                  resolve({ data: rows, error });
                  return Promise.resolve({ data: rows, error });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-2: EXEC-TO-PLAN parent gates', () => {
  it('TS-5: returns PARENT_DELEGATED_COMPLETION as the only gate', () => {
    const supabase = makeFakeSupabase([{ id: 'c1', sd_key: 'SD-CHILD-A', status: 'in_progress', current_phase: 'EXEC' }]);
    const sd = { id: 'sd-parent', metadata: { is_parent: true } };
    const gates = getParentOrchestratorExecToPlanGates(supabase, sd);
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe('PARENT_DELEGATED_COMPLETION');
    expect(gates[0].required).toBe(true);
  });

  it('PARENT_DELEGATED_COMPLETION passes when parent has children', async () => {
    const children = [
      { id: 'c1', sd_key: 'SD-CHILD-A', status: 'in_progress', current_phase: 'EXEC' },
      { id: 'c2', sd_key: 'SD-CHILD-B', status: 'completed', current_phase: 'COMPLETED' },
    ];
    const supabase = makeFakeSupabase(children);
    const sd = { id: 'sd-parent', metadata: { is_parent: true } };
    const gates = getParentOrchestratorExecToPlanGates(supabase, sd);
    const result = await gates[0].validator();
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.childrenCount).toBe(2);
    expect(result.details.delegated_to_children).toBe(true);
  });

  it('PARENT_DELEGATED_COMPLETION fails when parent has no children', async () => {
    const supabase = makeFakeSupabase([]);
    const sd = { id: 'sd-parent', metadata: { is_parent: true } };
    const gates = getParentOrchestratorExecToPlanGates(supabase, sd);
    const result = await gates[0].validator();
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('Parent orchestrator has no child SDs — decomposition required before EXEC-TO-PLAN');
  });
});

describe('SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-4: PLAN-TO-LEAD wait verdict', () => {
  it('TS-9: returns wait=true for parent with 0/N children complete', async () => {
    const supabase = makeFakeSupabase([
      { id: 'c1', sd_key: 'SD-CHILD-A', status: 'in_progress' },
      { id: 'c2', sd_key: 'SD-CHILD-B', status: 'in_progress' },
    ]);
    const { createPrerequisiteCheckGate } = await import('../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js');
    const gate = createPrerequisiteCheckGate(supabase);
    const ctx = { sd: { id: 'sd-parent' }, sdId: 'sd-parent' };
    const result = await gate.validator(ctx);
    expect(result.passed).toBe(false);
    expect(result.wait).toBe(true);
    expect(result.wait_reason).toContain('2 child SD');
    expect(result.issues).toEqual([]);
  });

  it('TS-10: returns wait=false/passed=true for parent with N/N children complete', async () => {
    const supabase = makeFakeSupabase([
      { id: 'c1', sd_key: 'SD-CHILD-A', status: 'completed' },
      { id: 'c2', sd_key: 'SD-CHILD-B', status: 'completed' },
    ]);
    const { createPrerequisiteCheckGate } = await import('../../../scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js');
    const gate = createPrerequisiteCheckGate(supabase);
    const ctx = { sd: { id: 'sd-parent' }, sdId: 'sd-parent' };
    const result = await gate.validator(ctx);
    expect(result.passed).toBe(true);
    expect(result.wait).toBeUndefined();
    expect(result.details?.is_parent_sd).toBe(true);
  });
});

describe('SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001 FR-5: ValidationOrchestrator wait propagation', () => {
  it('TS-12: results.waitVerdict=true when any required gate returns wait=true', async () => {
    const { ValidationOrchestrator } = await import('../../../scripts/modules/handoff/validation/ValidationOrchestrator.js');
    const orchestrator = new ValidationOrchestrator({ supabase: makeFakeSupabase([]) });

    const waitingGate = {
      name: 'PREREQUISITE_HANDOFF_CHECK',
      required: true,
      validator: async () => ({
        passed: false,
        score: 0,
        maxScore: 100,
        wait: true,
        wait_reason: 'Parent waiting on 2 children',
        issues: [],
        warnings: ['WAIT: parent blocked'],
      }),
    };

    const results = await orchestrator.validateGates([waitingGate], {});
    expect(results.passed).toBe(false);
    expect(results.waitVerdict).toBe(true);
    expect(results.waitingGates).toContain('PREREQUISITE_HANDOFF_CHECK');
    expect(results.waitReasons.length).toBe(1);
    expect(results.waitReasons[0]).toContain('Parent waiting on 2 children');
    // failedGate is reserved for true failures — wait should not set it
    expect(results.failedGate).toBe(null);
    // issues should be empty (wait is not a failure)
    expect(results.issues).toEqual([]);
  });

  it('TS-13: classic failure (passed=false, no wait) sets failedGate and issues (no regression)', async () => {
    const { ValidationOrchestrator } = await import('../../../scripts/modules/handoff/validation/ValidationOrchestrator.js');
    const orchestrator = new ValidationOrchestrator({ supabase: makeFakeSupabase([]) });

    const failingGate = {
      name: 'SOME_GATE',
      required: true,
      validator: async () => ({
        passed: false,
        score: 30,
        maxScore: 100,
        issues: ['Score below threshold'],
        warnings: [],
      }),
    };

    const results = await orchestrator.validateGates([failingGate], {});
    expect(results.passed).toBe(false);
    expect(results.waitVerdict).toBe(false);
    expect(results.failedGate).toBe('SOME_GATE');
    expect(results.issues).toContain('Score below threshold');
  });
});
