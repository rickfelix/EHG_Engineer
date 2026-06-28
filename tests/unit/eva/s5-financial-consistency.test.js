/**
 * S5 financial single-source-of-truth helpers — unit tests
 * SD-LEO-INFRA-S5-FINANCIAL-SINGLE-SOURCE-001 (FR-1/FR-3)
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the deterministic recompute so evaluateS5Consistency is testable without real S5 inputs.
vi.mock('../../../lib/eva/kill-gate-recompute.js', () => ({
  recomputeKillGateVerdict: vi.fn(),
}));

import { recomputeKillGateVerdict } from '../../../lib/eva/kill-gate-recompute.js';
import {
  verdictDiffers,
  evaluateS5Consistency,
  persistRecomputedVerdict,
  VERDICT_FIELDS,
  S5_ARTIFACT_TYPE,
} from '../../../lib/eva/s5-financial-consistency.js';

const VERDICT = { decision: 'conditional_pass', reasons: [{ message: 'demand unvalidated' }], blockProgression: false, remediationRoute: 'review' };

describe('FR-1 verdictDiffers — compares only the verdict fields', () => {
  it('false when the persisted payload already matches the verdict', () => {
    const payload = { ...VERDICT, capitalRequired: 100000, roi3y: 0.3 }; // inputs/outputs present, verdict matches
    expect(verdictDiffers(payload, VERDICT)).toBe(false);
  });
  it('true when the persisted decision differs', () => {
    expect(verdictDiffers({ ...VERDICT, decision: 'pass' }, VERDICT)).toBe(true);
  });
  it('true when a verdict array field (reasons) differs structurally', () => {
    expect(verdictDiffers({ ...VERDICT, reasons: [{ message: 'different' }] }, VERDICT)).toBe(true);
  });
  it('ignores non-verdict (input/model) fields entirely', () => {
    expect(verdictDiffers({ ...VERDICT, capitalRequired: 999, roi3y: 9.9 }, VERDICT)).toBe(false);
  });
});

describe('FR-3 evaluateS5Consistency — persisted vs recompute', () => {
  it('consistent when the persisted artifact verdict matches the recompute', () => {
    recomputeKillGateVerdict.mockReturnValue(VERDICT);
    const artifacts = [{ artifactType: S5_ARTIFACT_TYPE, payload: { ...VERDICT, roi3y: 0.3 } }];
    const c = evaluateS5Consistency(artifacts);
    expect(c.applicable).toBe(true);
    expect(c.consistent).toBe(true);
  });
  it('flags divergence (the venture-1 case: persisted pass vs recomputed conditional_pass)', () => {
    recomputeKillGateVerdict.mockReturnValue(VERDICT);
    const artifacts = [{ artifactType: S5_ARTIFACT_TYPE, payload: { ...VERDICT, decision: 'pass' } }];
    const c = evaluateS5Consistency(artifacts);
    expect(c.consistent).toBe(false);
    expect(c.persistedDecision).toBe('pass');
    expect(c.recomputedDecision).toBe('conditional_pass');
  });
  it('not applicable when there is no recompute or no payload', () => {
    recomputeKillGateVerdict.mockReturnValue(null);
    expect(evaluateS5Consistency([]).applicable).toBe(false);
  });
});

describe('FR-1 persistRecomputedVerdict — lockstep targeted update', () => {
  function mockSupabase() {
    const calls = [];
    const chain = {
      update: vi.fn((payload) => { calls.push(payload); return chain; }),
      eq: vi.fn(() => chain),
      then: (resolve) => resolve({ error: null }),
    };
    return { client: { from: vi.fn(() => chain) }, calls, chain };
  }

  it('updates the artifact (merging only verdict fields) when the verdict differs', async () => {
    const { client, calls, chain } = mockSupabase();
    const payload = { ...VERDICT, decision: 'pass', capitalRequired: 100000, roi3y: 0.3 };
    const res = await persistRecomputedVerdict(client, { ventureId: 'v-1', stage: 5, payload, verdict: VERDICT, logger: { log: () => {}, warn: () => {} } });
    expect(res.updated).toBe(true);
    expect(client.from).toHaveBeenCalledWith('venture_artifacts');
    const merged = calls[0].artifact_data;
    expect(merged.decision).toBe('conditional_pass'); // verdict applied
    expect(merged.capitalRequired).toBe(100000);      // input preserved
    expect(merged.roi3y).toBe(0.3);                    // model output preserved
    // scoped to the current S5 truth_financial_model row
    expect(chain.eq).toHaveBeenCalledWith('artifact_type', S5_ARTIFACT_TYPE);
    expect(chain.eq).toHaveBeenCalledWith('is_current', true);
  });

  it('no-ops when the persisted verdict already matches (idempotent)', async () => {
    const { client } = mockSupabase();
    const res = await persistRecomputedVerdict(client, { ventureId: 'v-1', stage: 5, payload: { ...VERDICT }, verdict: VERDICT, logger: { log: () => {}, warn: () => {} } });
    expect(res.updated).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('VERDICT_FIELDS is exactly the four derived verdict fields (never inputs)', () => {
    expect([...VERDICT_FIELDS].sort()).toEqual(['blockProgression', 'decision', 'reasons', 'remediationRoute']);
  });
});
