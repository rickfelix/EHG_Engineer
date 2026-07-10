/**
 * Unit Tests: Stage-0 Decision Activation Consumer
 * SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001
 *
 * Acceptance canary 2 ("Real approval activates") + rejection-parks + the
 * no-machine-approver filters (advisory rows never activate).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/eva/stage-zero/venture-nursery.js', () => ({
  parkVenture: vi.fn().mockResolvedValue({ id: 'nursery-1' }),
}));

import { processStageZeroDecisions, briefFromVenture } from '../../../../lib/eva/stage-zero/decision-activation.js';
import { parkVenture } from '../../../../lib/eva/stage-zero/venture-nursery.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Fake supabase for the consumer's three query shapes:
 *  - chairman_decisions: select().eq().eq().in() -> { data: decisions } (filters recorded)
 *  - ventures select:    select().in().eq()      -> { data: ventures }
 *  - ventures update:    update(payload).eq().eq() -> { error } (payloads recorded)
 */
function makeSupabase({ decisions = [], ventures = [], updateError = null } = {}) {
  const recorded = { decisionFilters: [], ventureUpdates: [] };

  function decisionsChain() {
    const filters = [];
    recorded.decisionFilters.push(filters);
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters.push(['eq', col, val]); return chain; },
      in: (col, vals) => {
        filters.push(['in', col, vals]);
        return Promise.resolve({ data: decisions, error: null });
      },
    };
    return chain;
  }

  function venturesChain() {
    const chain = {
      select: () => chain,
      in: () => chain,
      eq: () => Promise.resolve({ data: ventures, error: null }),
      // consumer shape: update(payload).eq('id', ..).eq('status', 'paused') then awaited
      update: (payload) => {
        recorded.ventureUpdates.push(payload);
        return { eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }) };
      },
    };
    return chain;
  }

  return {
    from: vi.fn((table) => (table === 'chairman_decisions' ? decisionsChain() : venturesChain())),
    _recorded: recorded,
  };
}

const pausedAwaitingVenture = {
  id: 'v-1',
  name: 'TestVenture',
  status: 'paused',
  problem_statement: 'Test problem',
  solution: 'Test solution',
  target_market: 'SMBs',
  origin_type: 'discovery',
  raw_chairman_intent: 'Test problem',
  metadata: { stage_zero: { awaiting_chairman_decision: true, synthesis_archetype: 'saas' } },
};

describe('processStageZeroDecisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries ONLY stage-0 stage_gate decisions — advisory rows are excluded at the filter', async () => {
    const supabase = makeSupabase({ decisions: [], ventures: [] });
    await processStageZeroDecisions({ supabase, logger: silentLogger });
    const filters = supabase._recorded.decisionFilters[0];
    expect(filters).toContainEqual(['eq', 'lifecycle_stage', 0]);
    expect(filters).toContainEqual(['eq', 'decision_type', 'stage_gate']);
    expect(filters).toContainEqual(['in', 'status', ['approved', 'rejected']]);
  });

  // Acceptance canary 2: real approval activates.
  it('activates a paused-awaiting venture on an approved decision, with decision-id provenance', async () => {
    const supabase = makeSupabase({
      decisions: [{ id: 'd-1', venture_id: 'v-1', status: 'approved', rationale: 'looks good' }],
      ventures: [pausedAwaitingVenture],
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.activated).toBe(1);
    expect(summary.parked).toBe(0);
    const update = supabase._recorded.ventureUpdates[0];
    expect(update.status).toBe('active');
    expect(update.metadata.stage_zero.awaiting_chairman_decision).toBe(false);
    expect(update.metadata.stage_zero.activation.decision_id).toBe('d-1');
    expect(update.metadata.stage_zero.activation.activated_by).toBe('chairman-approval');
  });

  it('rejection parks the brief (nursery) THEN cancels the venture', async () => {
    const supabase = makeSupabase({
      decisions: [{ id: 'd-2', venture_id: 'v-1', status: 'rejected', rationale: 'not now' }],
      ventures: [pausedAwaitingVenture],
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.parked).toBe(1);
    expect(parkVenture).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TestVenture', maturity: 'seed' }),
      expect.objectContaining({ reason: expect.stringContaining('not now') }),
      expect.objectContaining({ supabase }),
    );
    const update = supabase._recorded.ventureUpdates[0];
    expect(update.status).toBe('cancelled');
    expect(update.metadata.stage_zero.cancellation.decision_id).toBe('d-2');
  });

  it('park failure leaves the venture PAUSED (retryable) — never cancels without a nursery row', async () => {
    parkVenture.mockRejectedValueOnce(new Error('nursery schema drift'));
    const supabase = makeSupabase({
      decisions: [{ id: 'd-3', venture_id: 'v-1', status: 'rejected', rationale: null }],
      ventures: [pausedAwaitingVenture],
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.parked).toBe(0);
    expect(summary.errors).toBe(1);
    expect(supabase._recorded.ventureUpdates).toHaveLength(0); // no cancel write
  });

  it('is idempotent: a venture no longer paused-awaiting is a no-op', async () => {
    const activatedVenture = {
      ...pausedAwaitingVenture,
      metadata: { stage_zero: { awaiting_chairman_decision: false } },
    };
    const supabase = makeSupabase({
      decisions: [{ id: 'd-1', venture_id: 'v-1', status: 'approved', rationale: null }],
      ventures: [activatedVenture],
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.processed).toBe(0);
    expect(supabase._recorded.ventureUpdates).toHaveLength(0);
  });

  it('returns early with zero work when no resolved decisions exist', async () => {
    const supabase = makeSupabase({ decisions: [], ventures: [] });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary).toEqual({ processed: 0, activated: 0, parked: 0, errors: 0 });
  });
});

describe('briefFromVenture', () => {
  it('rebuilds a park-able brief from venture columns + stage_zero metadata', () => {
    const brief = briefFromVenture(pausedAwaitingVenture);
    expect(brief.name).toBe('TestVenture');
    expect(brief.problem_statement).toBe('Test problem');
    expect(brief.archetype).toBe('saas');
    expect(brief.maturity).toBe('seed');
  });
});
