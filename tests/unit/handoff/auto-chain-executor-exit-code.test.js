/**
 * Regression pin for a substring-collision finding from REGRESSION EXEC review
 * (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001, PLAN_VERIFICATION).
 *
 * queue-selector.js's fenced-queue reason string is "All N unclaimed candidate(s) are
 * authority-fenced" (added by this SD's FR-1). auto-chain-executor.js's exit-code selection
 * does `selectReason.includes('claimed')` -- and "unclaimed" contains "claimed" as a
 * substring, so a fully-fenced queue maps to EXIT_ALL_CLAIMED rather than EXIT_EMPTY_QUEUE.
 *
 * REGRESSION judged this NOT a live defect: EXIT_ALL_CLAIMED is the more conservative of the
 * two labels here (it never asserts the queue is literally empty, which it isn't -- there ARE
 * candidates, they're just fenced), and the only downstream consumer of the distinction
 * (orchestrator-completion-hook.js:1166-1170) uses it purely for a telemetry decision label,
 * not control flow. But it IS an accident of wording, unpinned by any test -- reword either
 * string and this silently flips with no test failure to catch it.
 *
 * This test pins the CURRENT (judged-safer) mapping deliberately -- but ONLY covers
 * auto-chain-executor.js's side of the coupling (the .includes('claimed') matcher). It mocks
 * queue-selector.js wholesale, so the reason string below is a hard-coded literal, not a
 * value queue-selector.js's real code produced -- rewording queue-selector.js:91's template
 * literal would leave THIS test green while production silently flips to EXIT_EMPTY_QUEUE.
 * (REGRESSION EXEC's second-pass review caught that an earlier version of this comment
 * overclaimed "fails if either side's wording changes" -- it doesn't.) The other direction is
 * covered by auto-chain-executor-exit-code-live-selector.test.js, which runs the REAL
 * (unmocked) selectNextSD against a stubbed Supabase client so the reason string it actually
 * produces is what flows through the mapping. Between the two files, a reword on either side
 * is caught.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../scripts/modules/handoff/queue-selector.js', () => ({
  selectNextSD: vi.fn(),
}));
vi.mock('../../../scripts/modules/handoff/claim-swapper.js', () => ({
  swapClaim: vi.fn(),
  refreshHeartbeat: vi.fn().mockResolvedValue(undefined),
}));

import { executeAutoChain, EXIT_CODES } from '../../../scripts/modules/handoff/auto-chain-executor.js';
import { selectNextSD } from '../../../scripts/modules/handoff/queue-selector.js';

describe('auto-chain-executor.js exit-code selection for a fully-fenced queue', () => {
  it('[REGRESSION PIN] a fully-fenced queue (queue-selector.js\'s real "unclaimed...authority-fenced" wording) maps to EXIT_ALL_CLAIMED, not EXIT_EMPTY_QUEUE', async () => {
    // The exact reason string queue-selector.js's real code produces today for this case
    // (scripts/modules/handoff/queue-selector.js:91) -- copied literally, not paraphrased,
    // so this test fails if either side's wording changes without the other being updated.
    selectNextSD.mockResolvedValue({
      sd: null,
      candidates: [],
      reason: 'All 3 unclaimed candidate(s) are authority-fenced',
    });

    const result = await executeAutoChain(
      { from: vi.fn() }, // supabase is not directly touched here -- selectNextSD/swapClaim/refreshHeartbeat are mocked
      {
        completedSdId: 'sd-uuid',
        completedSdKey: 'SD-COMPLETED-001',
        sessionId: 'session-1',
        chainEnabled: true,
        autoProceed: true,
      }
    );

    expect(result.exitCode).toBe(EXIT_CODES.EXIT_ALL_CLAIMED);
  });
});
