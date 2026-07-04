/**
 * Tests for the manual-path review-gate mint (daemon-parity).
 * SD-LEO-INFRA-RUN-STAGE-MINT-REVIEW-GATES-001
 *
 * TS-1 review stage + valid + non-dryRun => mint with daemon-shape args
 * TS-2 non-review stage => no mint
 * TS-3 dryRun or invalid validation => no mint
 * TS-4 blocking review stage => no mint (mirrors daemon !isBlocking)
 * TS-5 mint/gov error is non-fatal
 */
import { describe, it, expect, vi } from 'vitest';
import { maybeMintReviewGate } from '../../../lib/eva/review-gate-mint.js';

// A supabase double whose ventures lookup returns a name.
function makeSupabase(ventureName = 'Acme Venture') {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { name: ventureName }, error: null }),
        }),
      }),
    }),
  };
}

const gov = (overrides = {}) => ({
  isReview: (n) => (overrides.reviewStages || [7, 8, 9, 11]).includes(n),
  isBlocking: (n) => (overrides.blockingStages || []).includes(n),
});

const baseParams = {
  supabase: makeSupabase(),
  ventureId: 'venture-1',
  stageNumber: 7,
  validationValid: true,
  dryRun: false,
  logger: { log: () => {}, warn: () => {} },
};

describe('maybeMintReviewGate', () => {
  // ── TS-1 ───────────────────────────────────────────────────────────────────
  it('mints at a review stage with the daemon-shape args', async () => {
    const mint = vi.fn(async () => ({ id: 'dec-1', isNew: true }));
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });

    expect(r.minted).toBe(true);
    expect(r.decisionId).toBe('dec-1');
    expect(r.isNew).toBe(true);
    expect(mint).toHaveBeenCalledTimes(1);
    const args = mint.mock.calls[0][0];
    expect(args).toMatchObject({
      ventureId: 'venture-1',
      stageNumber: 7,
      decisionType: 'review',
      briefData: { stage: 7, ventureName: 'Acme Venture' },
    });
    expect(args.summary).toContain('Stage 7');
    expect(args.supabase).toBeDefined();
  });

  it('reports reuse (isNew=false) without minting a duplicate', async () => {
    const mint = vi.fn(async () => ({ id: 'dec-1', isNew: false }));
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(true);
    expect(r.isNew).toBe(false);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  // ── TS-2 ───────────────────────────────────────────────────────────────────
  it('does NOT mint at a non-review stage', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate({ ...baseParams, stageNumber: 5 }, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('not_review_stage');
    expect(mint).not.toHaveBeenCalled();
  });

  // ── TS-3 ───────────────────────────────────────────────────────────────────
  it('does NOT mint on a dry run', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate({ ...baseParams, dryRun: true }, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('dry_run');
    expect(mint).not.toHaveBeenCalled();
  });

  it('does NOT mint when validation is invalid', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate({ ...baseParams, validationValid: false }, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('invalid_validation');
    expect(mint).not.toHaveBeenCalled();
  });

  // ── TS-4 ───────────────────────────────────────────────────────────────────
  it('does NOT mint at a blocking (hard-gate) review stage (mirrors daemon !isBlocking)', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => gov({ blockingStages: [7] }),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('not_review_stage');
    expect(mint).not.toHaveBeenCalled();
  });

  // ── TS-5 ───────────────────────────────────────────────────────────────────
  it('is non-fatal when governance load throws', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => { throw new Error('gov down'); },
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('governance_unavailable');
    expect(mint).not.toHaveBeenCalled();
  });

  it('is non-fatal when the mint helper throws', async () => {
    const mint = vi.fn(async () => { throw new Error('insert failed'); });
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('mint_error');
    expect(r.error).toContain('insert failed');
  });

  // QF-20260703-236: fixture-venture guard round-2 fix -- a skipped decision must
  // never be reported as minted:true with a null decisionId (false success).
  it('does NOT report minted:true when createOrReusePendingDecision skips a fixture venture', async () => {
    const mint = vi.fn(async () => ({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' }));
    const r = await maybeMintReviewGate(baseParams, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('fixture_venture');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw and skips when supabase is absent', async () => {
    const mint = vi.fn();
    const r = await maybeMintReviewGate({ ...baseParams, supabase: null }, {
      getStageGovernance: async () => gov(),
      createOrReusePendingDecision: mint,
    });
    expect(r.minted).toBe(false);
    expect(r.reason).toBe('no_supabase');
    expect(mint).not.toHaveBeenCalled();
  });
});
