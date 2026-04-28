/**
 * tests/integration/ship-review-findings-proof-gate.test.js
 *
 * Regression test for SD-LEO-INFRA-PHANTOM-COMPLETION-PROOF-001.
 *
 * Asserts the new SHIP_REVIEW_FINDINGS_PROOF gate:
 *   1. Fails closed for code-shipping SDs without ship_review_findings rows
 *   2. Passes for SDs with verdict='pass' findings
 *   3. Skips non-code SDs (no_pr_required + non-code sd_type)
 *   4. Fails on query errors (fail-closed for safety)
 */

import { describe, it, expect } from 'vitest';
import {
  runShipReviewFindingsProofGate,
  requiresShipReviewProof,
  SHIP_REVIEW_FINDINGS_PROOF_GATE,
} from '../../scripts/modules/handoff/gates/ship-review-findings-proof.js';

function fakeSupabase(rows, error = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error }),
      }),
    }),
  };
}

describe('SHIP_REVIEW_FINDINGS_PROOF gate', () => {
  it('fails closed when no ship_review_findings row exists for code SD', async () => {
    const sd = { sd_key: 'SD-TEST-001', sd_type: 'bugfix', metadata: { work_type: 'code' } };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase([]),
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/no ship_review_findings row/);
  });

  it('passes when verdict=pass row exists', async () => {
    const sd = { sd_key: 'SD-TEST-002', sd_type: 'feature', metadata: { work_type: 'code' } };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase([{ id: 'r1', pr_number: 100, verdict: 'pass' }]),
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.evidence).toHaveLength(1);
  });

  it('fails when row exists but verdict=block', async () => {
    const sd = { sd_key: 'SD-TEST-003', sd_type: 'bugfix', metadata: { work_type: 'code' } };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase([{ id: 'r1', pr_number: 100, verdict: 'block' }]),
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/none have verdict='pass'/);
  });

  it('skips when no_pr_required=true', async () => {
    const sd = {
      sd_key: 'SD-TEST-004',
      sd_type: 'documentation',
      metadata: { no_pr_required: true },
    };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase([]),
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.reason).toMatch(/not applicable/);
  });

  it('skips for non-code sd_type without work_type override', async () => {
    const sd = { sd_key: 'SD-TEST-005', sd_type: 'documentation', metadata: {} };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase([]),
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('fails closed on Supabase query error', async () => {
    const sd = { sd_key: 'SD-TEST-006', sd_type: 'bugfix', metadata: { work_type: 'code' } };
    const result = await runShipReviewFindingsProofGate({
      sd,
      supabase: fakeSupabase(null, { message: 'Connection timeout' }),
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/query failed.*fail-closed/);
  });

  it('exports a gate descriptor with required metadata', () => {
    expect(SHIP_REVIEW_FINDINGS_PROOF_GATE.name).toBe('SHIP_REVIEW_FINDINGS_PROOF');
    expect(SHIP_REVIEW_FINDINGS_PROOF_GATE.required).toBe(true);
    expect(SHIP_REVIEW_FINDINGS_PROOF_GATE.bypass_allowed).toBe('dual-key-only');
  });

  it('requiresShipReviewProof: code work_type', () => {
    expect(requiresShipReviewProof({ sd_type: 'documentation', metadata: { work_type: 'code' } })).toBe(true);
  });

  it('requiresShipReviewProof: feature/bugfix/infrastructure types', () => {
    expect(requiresShipReviewProof({ sd_type: 'feature', metadata: {} })).toBe(true);
    expect(requiresShipReviewProof({ sd_type: 'bugfix', metadata: {} })).toBe(true);
    expect(requiresShipReviewProof({ sd_type: 'infrastructure', metadata: {} })).toBe(true);
  });

  it('requiresShipReviewProof: explicit no_pr_required override', () => {
    expect(requiresShipReviewProof({ sd_type: 'feature', metadata: { no_pr_required: true } })).toBe(false);
  });
});
