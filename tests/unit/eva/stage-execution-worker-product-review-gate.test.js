/**
 * SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-1a) — worker-level test driving the REAL
 * _advanceStage() product-review choke-point at the Stage 23 -> 24 boundary. Mirrors the
 * stage-execution-worker-s19-harden.test.js pattern (drives the real method against a fake
 * chainable supabase, rather than re-implementing _advanceStage's logic inline).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-1', name: 'Real Venture', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false, isHighConsequence: () => false }),
}));
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({ requestProductReview: vi.fn().mockResolvedValue({ id: 'decision-x', isNew: true }) }));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { requestProductReview } from '../../../lib/eva/chairman-product-review.js';
import { isFixtureVenture, fetchVentureForFixtureCheck } from '../../../lib/eva/chairman-decision-watcher.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Thenable chainable supabase fake — same shape as stage-execution-worker-s19-harden.test.js,
 * with a chairman_decisions branch added for the product-review lookup, and a leo_feature_flags
 * branch (SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 FR-4) for the fail-open kill-switch read.
 * killSwitchRow: undefined = no row (absent, must resolve to disabled per TS-12); an object =
 * the row content (e.g. { is_enabled: true }).
 */
function makeSupabase({ productReviewDecision = null, killSwitchRow = undefined } = {}) {
  const calls = { venturesUpdate: 0, systemEvents: [] };
  const from = (table) => {
    let terminalData = table === 'chairman_decisions' ? productReviewDecision : null;
    if (table === 'leo_feature_flags') terminalData = killSwitchRow === undefined ? null : killSwitchRow;
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: terminalData, error: null }),
      single: async () => ({ data: terminalData, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async (row) => { if (table === 'system_events') calls.systemEvents.push(row); return { data: null, error: null }; },
      update: () => { if (table === 'ventures') calls.venturesUpdate += 1; return chain; },
      then: (resolve) => resolve({ data: terminalData, error: null }),
    };
    return chain;
  };
  return { from, calls };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._runPostStageHooks = vi.fn().mockResolvedValue(undefined);
  return worker;
}

describe('_advanceStage product-review choke-point (FR-1a) — real method', () => {
  beforeEach(() => vi.clearAllMocks());

  it('REFUSES a Stage 23 -> 24 advance with no approved product_review decision, and asks for one', async () => {
    const supabase = makeSupabase({ productReviewDecision: null });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
    expect(supabase.calls.venturesUpdate).toBe(0);
    // FR-2/FR-4: a block alone would strand the venture forever if nobody asks the chairman.
    expect(requestProductReview).toHaveBeenCalledWith(supabase, 'v-1', worker._logger);
  });

  it('ADVANCES a Stage 23 -> 24 transition once an approved product_review decision exists, without re-asking', async () => {
    const supabase = makeSupabase({ productReviewDecision: { id: 'decision-1' } });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
    expect(requestProductReview).not.toHaveBeenCalled();
  });

  it('still blocks (fail-safe) if requestProductReview itself throws while asking', async () => {
    const supabase = makeSupabase({ productReviewDecision: null });
    const worker = makeWorker(supabase);
    requestProductReview.mockRejectedValueOnce(new Error('escalation transport down'));

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
    expect(supabase.calls.venturesUpdate).toBe(0);
  });

  // SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-4, TS-7): flipped from the pre-fix "fails OPEN"
  // baseline (TS-0c, confirmed green against unmodified code before this fix landed) to fail-
  // CLOSED. An evaluator error must now BLOCK the advance, not silently approve it.
  it('fails CLOSED (blocks) when the choke-point evaluator throws, with no kill-switch flag set', async () => {
    const supabase = makeSupabase(); // killSwitchRow undefined -> absent row -> disabled (TS-12)
    supabase.from = (table) => {
      if (table === 'chairman_decisions') {
        return { select: () => { throw new Error('db down'); } };
      }
      return makeSupabase().from(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
    // block log must distinguish an evaluator-error case from a genuine no-approval
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Product-review choke-point eval error'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('evaluator error'));
  });

  // TS-8: the kill-switch flag, when enabled, restores the pre-fix fail-open escape hatch.
  it('restores fail-OPEN (advances) when the kill-switch flag is enabled, on evaluator error', async () => {
    const supabase = makeSupabase({ killSwitchRow: { is_enabled: true } });
    supabase.from = (table) => {
      if (table === 'chairman_decisions') {
        return { select: () => { throw new Error('db down'); } };
      }
      return makeSupabase({ killSwitchRow: { is_enabled: true } }).from(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result?.blocked).not.toBe(true);
    expect(requestProductReview).not.toHaveBeenCalled();
  });

  // TS-12 (D5 safety invariant): a DEDICATED assertion that an ABSENT kill-switch row resolves to
  // disabled (fail-closed stays active) -- not inferred from TS-7 passing, which would pass
  // identically with the kill-switch seeded ON and force-disabled elsewhere in the fixture.
  it('treats an ABSENT kill-switch flag row as disabled -- fail-closed is the active default', async () => {
    const supabase = makeSupabase({ killSwitchRow: undefined });
    supabase.from = (table) => {
      if (table === 'chairman_decisions') {
        return { select: () => { throw new Error('db down'); } };
      }
      return makeSupabase({ killSwitchRow: undefined }).from(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
  });

  // TS-12 (explicit is_enabled=false row -- the merge-time state per FR-4 AC#4): same outcome as
  // the absent-row case, asserted separately so a future flip of the column default cannot mask it.
  it('treats an explicit is_enabled=false kill-switch row as disabled -- fail-closed is the active default', async () => {
    const supabase = makeSupabase({ killSwitchRow: { is_enabled: false } });
    supabase.from = (table) => {
      if (table === 'chairman_decisions') {
        return { select: () => { throw new Error('db down'); } };
      }
      return makeSupabase({ killSwitchRow: { is_enabled: false } }).from(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 23, 24, {});

    expect(result).toEqual({ advanced: false, blocked: true, reason: 'product_review_choke_point' });
  });

  // QF-20260703-236-class: a fixture/demo venture can never earn a real product_review decision
  // (requestProductReview's own isFixtureVenture skip guarantees one is never minted) -- without
  // this bypass it would block here FOREVER, unlike every other fixture-aware gate in this file.
  it('BYPASSES the gate entirely for a fixture venture (never blocks, never asks)', async () => {
    fetchVentureForFixtureCheck.mockResolvedValueOnce({ id: 'v-fixture', is_demo: true });
    isFixtureVenture.mockReturnValueOnce(true);
    const supabase = makeSupabase({ productReviewDecision: null }); // no approved decision exists
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-fixture', 23, 24, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
    expect(requestProductReview).not.toHaveBeenCalled();
  });

  it('does not evaluate the product-review gate (or ask) for any other from/to stage pair', async () => {
    const chairmanDecisionsSpy = vi.fn();
    const supabase = makeSupabase({ productReviewDecision: null });
    const realFrom = supabase.from;
    supabase.from = (table) => {
      if (table === 'chairman_decisions') chairmanDecisionsSpy();
      return realFrom(table);
    };
    const worker = makeWorker(supabase);

    await worker._advanceStage('v-1', 22, 23, {});
    await worker._advanceStage('v-1', 23, 24.5, {}); // wrong toStage — must not match
    await worker._advanceStage('v-1', 24, 25, {});

    expect(chairmanDecisionsSpy).not.toHaveBeenCalled();
    expect(requestProductReview).not.toHaveBeenCalled();
  });
});
