/**
 * Unit Tests: getAgentEconomyContext E0 labeling
 * SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001 (M3, Delta-ledger 41a2e6da)
 *
 * The static "$4.8B / 34% CAGR" agent-economy figures have no source or as-of-date.
 * M3 rides along as an E0 (ungrounded) labeling item — the data isn't removed, only
 * labeled, so downstream evidence-grading and the LLM prompt itself can treat it as
 * directional context rather than fact.
 */

import { describe, test, expect } from 'vitest';
import { getAgentEconomyContext } from '../../../../lib/eva/stage-zero/strategic-context-loader.js';

describe('getAgentEconomyContext (M3)', () => {
  test('labels the static agent-economy figures as evidence_grade E0', () => {
    const ctx = getAgentEconomyContext();
    expect(ctx.evidence_grade).toBe('E0');
    // Data itself is preserved, not deleted — M3 rides along as a labeling item only.
    expect(ctx.market_size_2026).toMatch(/\$4\.8B/);
    expect(ctx.cagr).toMatch(/34%/);
  });
});
