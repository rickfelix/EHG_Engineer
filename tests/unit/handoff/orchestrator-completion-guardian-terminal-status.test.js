/**
 * SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001 (FR-4, FR-5) — direct coverage for
 * OrchestratorCompletionGuardian.validateChildren() and the honest-provenance
 * helper, previously untested (adversarial finding: zero runtime coverage;
 * only a static-pin regex test and an import-absence assertion existed).
 */
import { describe, it, expect, vi } from 'vitest';

function makeMockSupabase(children) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: children, error: null }),
      }),
    }),
  };
}

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => makeMockSupabase([
    { id: 'c1', title: 'Child A', status: 'completed', progress: 100 },
    { id: 'c2', title: 'Child B', status: 'cancelled', progress: 0 },
    { id: 'c3', title: 'Child C', status: 'completed', progress: 100 },
  ])),
}));

vi.mock('../../../lib/orchestrator/child-terminal-status.js', () => ({
  isTerminalChildStatus: (s) => s === 'completed' || s === 'cancelled',
}));

vi.mock('../../../scripts/modules/handoff/executors/exec-to-plan/gates/cross-child-integration-gate.js', () => ({
  extractContracts: vi.fn(),
  detectMismatches: vi.fn(),
}));

const { OrchestratorCompletionGuardian } = await import(
  '../../../scripts/modules/handoff/orchestrator-completion-guardian.js'
);

describe('OrchestratorCompletionGuardian.validateChildren — completed+cancelled mix', () => {
  it('treats a cancelled child as terminal: CHILDREN check passes, none reported incomplete', async () => {
    const guardian = new OrchestratorCompletionGuardian('parent-1');
    guardian.parentData = { id: 'parent-1', metadata: {} };
    await guardian.validateChildren();

    const childrenCheck = guardian.validationResults.find((r) => r.check === 'CHILDREN');
    expect(childrenCheck.passed).toBe(true);
    expect(childrenCheck.message).toMatch(/3/);
  });

  it('_childCompletionSummary reports the mix honestly, not a blanket "all completed"', async () => {
    const guardian = new OrchestratorCompletionGuardian('parent-1');
    guardian.parentData = { id: 'parent-1', metadata: {} };
    await guardian.validateChildren();

    const summary = guardian._childCompletionSummary();
    expect(summary.total).toBe(3);
    expect(summary.completedCount).toBe(2);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.allGenuinelyCompleted).toBe(false);
    expect(summary.phrase).toBe('2/3 child SDs completed successfully, 1 cancelled');
  });

  it('_childCompletionSummary reports a genuine all-completed set as before (no behavior change)', async () => {
    const guardian = new OrchestratorCompletionGuardian('parent-1');
    guardian.childData = [
      { id: 'c1', status: 'completed' },
      { id: 'c2', status: 'completed' },
    ];
    const summary = guardian._childCompletionSummary();
    expect(summary.allGenuinelyCompleted).toBe(true);
    expect(summary.phrase).toBe('all 2 child SDs completed successfully');
  });
});
