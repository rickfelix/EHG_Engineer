/**
 * SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001 (FR-5) — direct coverage for
 * checkAndCompleteParentSD, previously entirely untested (adversarial finding:
 * zero test files reference this function name repo-wide).
 */
import { describe, it, expect, vi } from 'vitest';

const validateMock = vi.fn();
const completeMock = vi.fn();
const GuardianCtor = vi.fn(function (id) {
  this.id = id;
  this.validate = validateMock;
  this.complete = completeMock;
});

vi.mock('../../../scripts/modules/handoff/orchestrator-completion-guardian.js', () => ({
  OrchestratorCompletionGuardian: GuardianCtor,
}));
vi.mock('../../../scripts/modules/handoff/orchestrator-completion-hook.js', () => ({
  executeOrchestratorCompletionHook: vi.fn(() => Promise.resolve({ chainContinue: false })),
}));
vi.mock('../../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: vi.fn(),
  VISION_EVENTS: {},
}));
vi.mock('../../../lib/governance/pattern-closure.js', () => ({
  closeIssuePatterns: vi.fn(),
}));

const { checkAndCompleteParentSD } = await import(
  '../../../scripts/modules/handoff/executors/lead-final-approval/helpers.js'
);

function makeSupabase({ parentSD, siblings }) {
  return {
    from: () => ({
      select: () => ({
        eq: (col) => {
          if (col === 'id') {
            return { single: () => Promise.resolve({ data: parentSD, error: null }) };
          }
          // col === 'parent_sd_id'
          return Promise.resolve({ data: siblings, error: null });
        },
      }),
    }),
  };
}

describe('checkAndCompleteParentSD — completed+cancelled sibling mix', () => {
  it('proceeds to the Guardian path when siblings are a completed+cancelled mix (never blocks on a cancelled sibling)', async () => {
    // SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001: guardian.complete() no longer
    // completes — it stages the parent at pending_approval and surfaces the
    // LEAD-FINAL-APPROVAL command; helpers must report that contract faithfully.
    validateMock.mockResolvedValue({ canComplete: true });
    completeMock.mockResolvedValue({
      success: true,
      routedToLeadFinal: true,
      leadFinalCommand: 'node scripts/handoff.js execute LEAD-FINAL-APPROVAL parent-1'
    });
    const parentSD = { id: 'parent-1', title: 'Parent', status: 'in_progress', sd_type: 'orchestrator' };
    const siblings = [
      { id: 'c1', status: 'completed' },
      { id: 'c2', status: 'cancelled' },
      { id: 'c3', status: 'completed' },
    ];
    const sd = { parent_sd_id: 'parent-1', claiming_session_id: 'sess-1' };

    const result = await checkAndCompleteParentSD(sd, makeSupabase({ parentSD, siblings }));

    expect(GuardianCtor).toHaveBeenCalledWith('parent-1');
    // Parent is staged, NOT completed — completion happens via its own LFA run.
    expect(result.orchestratorCompleted).toBe(false);
    expect(result.parentRoutedToLeadFinal).toBe(true);
    expect(result.leadFinalCommand).toContain('LEAD-FINAL-APPROVAL parent-1');
  });

  it('does NOT proceed when a sibling is still genuinely in-progress (not terminal)', async () => {
    GuardianCtor.mockClear();
    const parentSD = { id: 'parent-2', title: 'Parent 2', status: 'in_progress', sd_type: 'orchestrator' };
    const siblings = [
      { id: 'c1', status: 'completed' },
      { id: 'c2', status: 'in_progress' },
    ];
    const sd = { parent_sd_id: 'parent-2', claiming_session_id: 'sess-1' };

    const result = await checkAndCompleteParentSD(sd, makeSupabase({ parentSD, siblings }));

    expect(GuardianCtor).not.toHaveBeenCalled();
    expect(result.orchestratorCompleted).toBe(false);
  });
});
