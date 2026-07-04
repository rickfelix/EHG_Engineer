/**
 * SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2, FR-2): resolveLearningItems() is
 * migrated onto the canonical closeIssuePatterns() gate. Verifies only patterns actually
 * returned in closeIssuePatterns()'s `resolved` array are pruned from MEMORY.md / trigger
 * a PATTERN_RESOLVED vision event — a deferred pattern (enforcement ON, missing a
 * prevention artifact) must NOT be pruned or published.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const closeIssuePatternsMock = vi.fn();
const publishVisionEventMock = vi.fn();

vi.mock('../../../lib/governance/pattern-closure.js', () => ({
  closeIssuePatterns: (...args) => closeIssuePatternsMock(...args),
}));
vi.mock('../../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: (...args) => publishVisionEventMock(...args),
  VISION_EVENTS: { PATTERN_RESOLVED: 'PATTERN_RESOLVED' },
}));
vi.mock('../../../scripts/modules/handoff/orchestrator-completion-hook.js', () => ({
  executeOrchestratorCompletionHook: vi.fn(),
}));

const { resolveLearningItems } = await import(
  '../../../scripts/modules/handoff/executors/lead-final-approval/helpers.js'
);

/** Generic chainable supabase stub: any table not asserted on resolves to empty. */
function makeSupabase() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    insert: async () => ({ error: null }),
    then(resolve) {
      resolve({ data: [], error: null });
    },
  };
  return { from: () => chain };
}

describe('resolveLearningItems — routed through closeIssuePatterns() (FR-2)', () => {
  beforeEach(() => {
    closeIssuePatternsMock.mockClear();
    publishVisionEventMock.mockClear();
  });

  it('is a no-op for an SD not created via /learn', async () => {
    const sd = { sd_key: 'SD-X', metadata: { source: 'leo-create-sd' } };
    await resolveLearningItems(sd, makeSupabase());
    expect(closeIssuePatternsMock).not.toHaveBeenCalled();
  });

  it('prunes and publishes only the patterns closeIssuePatterns() actually resolved (deferred ones are skipped)', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({
      resolved: ['PAT-A'],
      deferred: [{ pattern_id: 'PAT-B', reason: 'missing prevention_checklist' }],
    });
    const sd = { sd_key: 'SD-LEARN-001', metadata: { source: 'learn_command' } };

    await resolveLearningItems(sd, makeSupabase());

    expect(closeIssuePatternsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sdId: 'SD-LEARN-001' })
    );
    expect(publishVisionEventMock).toHaveBeenCalledTimes(1);
    const publishedArgs = publishVisionEventMock.mock.calls[0][1];
    expect(publishedArgs.resolvedPatternIds).toEqual(['PAT-A']);
    expect(publishedArgs.resolvedCount).toBe(1);
  });

  it('publishes nothing when closeIssuePatterns() resolves zero patterns', async () => {
    closeIssuePatternsMock.mockResolvedValueOnce({ resolved: [], deferred: [{ pattern_id: 'PAT-B', reason: 'x' }] });
    const sd = { sd_key: 'SD-LEARN-002', metadata: { source: 'learn_command' } };

    await resolveLearningItems(sd, makeSupabase());

    expect(publishVisionEventMock).not.toHaveBeenCalled();
  });
});
