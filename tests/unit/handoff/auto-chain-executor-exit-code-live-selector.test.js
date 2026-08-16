/**
 * Closes a real gap REGRESSION EXEC found in
 * auto-chain-executor-exit-code.test.js (SD-LEO-INFRA-LEAD-FINAL-CASCADE-ISOLATION-001,
 * PLAN_VERIFICATION second pass).
 *
 * That test's `vi.mock('.../queue-selector.js', () => ({ selectNextSD: vi.fn() }))` replaces
 * the WHOLE module -- queue-selector.js's real body, including its actual reason-string
 * template literal at line 91, never executes. The test's own comment claimed "fails if
 * either side's wording changes" -- true only for auto-chain-executor.js's side
 * (`.includes('claimed')`); a reword of queue-selector.js's template literal leaves that
 * test's hard-coded mockResolvedValue copy unchanged, so it stays green while production
 * silently flips to EXIT_EMPTY_QUEUE.
 *
 * This file does NOT mock queue-selector.js at all -- selectNextSD runs for real, against a
 * stubbed Supabase client whose candidates are all fenced, and the REASON STRING IT ACTUALLY
 * PRODUCES is what flows into executeAutoChain's exit-code mapping. Reword either file and
 * this test catches it, closing both directions of the coupling the other test's comment
 * overclaimed.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../scripts/modules/handoff/claim-swapper.js', () => ({
  swapClaim: vi.fn(),
  refreshHeartbeat: vi.fn().mockResolvedValue(undefined),
}));

import { executeAutoChain, EXIT_CODES } from '../../../scripts/modules/handoff/auto-chain-executor.js';

// Same chainable-mock technique as queue-selector.test.js -- every query builder method the
// real selectNextSD could call resolves correctly, so no chained method can be silently
// missing and fail the query open.
function makeChainableQuery(terminalValue) {
  const methods = ['select', 'in', 'is', 'neq', 'not', 'order', 'range', 'eq', 'limit'];
  const chain = {};
  for (const m of methods) chain[m] = vi.fn(() => chain);
  chain.then = (resolve) => resolve(terminalValue);
  return chain;
}

function mockSupabaseAllFenced() {
  const fenced = { id: 'fenced-uuid', sd_key: 'SD-FENCED-001', title: 'Fenced', status: 'draft', priority: 'high', parent_sd_id: null, metadata: { requires_human_action: true } };
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') return makeChainableQuery({ data: [fenced], error: null });
      if (table === 'claude_sessions') return makeChainableQuery({ data: [], error: null });
      throw new Error(`unexpected table in test: ${table}`);
    }),
  };
}

describe('auto-chain-executor.js + REAL queue-selector.js: exit-code mapping for a fully-fenced queue', () => {
  it('[REGRESSION PIN, unmocked queue-selector] a fully-fenced candidate set (via the real selectNextSD, not a hard-coded reason string) still maps to EXIT_ALL_CLAIMED', async () => {
    const result = await executeAutoChain(mockSupabaseAllFenced(), {
      completedSdId: 'sd-uuid',
      completedSdKey: 'SD-COMPLETED-001',
      sessionId: 'session-1',
      chainEnabled: true,
      autoProceed: true,
    });

    expect(result.exitCode).toBe(EXIT_CODES.EXIT_ALL_CLAIMED);
  });
});
