/**
 * Unit Tests: Stage-0 Decision Activation Consumer
 * SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001
 *
 * Acceptance canary 2 ("Real approval activates") + rejection-parks + the
 * no-machine-approver filters (advisory rows never activate) + adversarial-review
 * round-1 regressions (venture-anchored scan, park dedupe, fresh re-read).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/eva/stage-zero/venture-nursery.js', () => ({
  parkVenture: vi.fn().mockResolvedValue({ id: 'nursery-1' }),
}));

import { processStageZeroDecisions, briefFromVenture } from '../../../../lib/eva/stage-zero/decision-activation.js';
import { parkVenture } from '../../../../lib/eva/stage-zero/venture-nursery.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Fake supabase for the consumer's query shapes:
 *  - ventures scan (list):   select('*').eq(status).eq(jsonpath).limit()      -> pausedVentures
 *  - ventures fresh read:    select('*').eq(id).eq(status).maybeSingle()      -> freshVenture
 *  - chairman_decisions:     select().in().eq().eq().in().order().limit()     -> decisions (filters recorded)
 *  - venture_nursery dedupe: select('id').eq(name).is().limit().maybeSingle() -> existingPark
 *  - ventures update:        update(payload).eq().eq()                        -> { error } (payloads recorded)
 */
function makeSupabase({
  pausedVentures = [],
  decisions = [],
  freshVenture = undefined, // undefined => default to first paused venture; null => gone
  existingPark = null,
  updateError = null,
} = {}) {
  const recorded = { decisionFilters: [], ventureUpdates: [], nurseryLookups: 0 };

  function decisionsChain() {
    const filters = [];
    recorded.decisionFilters.push(filters);
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters.push(['eq', col, val]); return chain; },
      in: (col, vals) => { filters.push(['in', col, vals]); return chain; },
      order: () => chain,
      limit: () => Promise.resolve({ data: decisions, error: null }),
    };
    return chain;
  }

  function venturesChain() {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => Promise.resolve({ data: pausedVentures, error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: freshVenture === undefined ? (pausedVentures[0] || null) : freshVenture,
          error: null,
        }),
      update: (payload) => {
        recorded.ventureUpdates.push(payload);
        return { eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }) };
      },
    };
    return chain;
  }

  function nurseryChain() {
    recorded.nurseryLookups += 1;
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: existingPark, error: null }),
    };
    return chain;
  }

  return {
    from: vi.fn((table) => {
      if (table === 'chairman_decisions') return decisionsChain();
      if (table === 'venture_nursery') return nurseryChain();
      return venturesChain();
    }),
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

  it('queries ONLY stage-0 stage_gate decisions for the awaiting ventures — advisory rows excluded at the filter', async () => {
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [],
    });
    await processStageZeroDecisions({ supabase, logger: silentLogger });
    const filters = supabase._recorded.decisionFilters[0];
    expect(filters).toContainEqual(['in', 'venture_id', ['v-1']]); // venture-anchored, not history-anchored
    expect(filters).toContainEqual(['eq', 'lifecycle_stage', 0]);
    expect(filters).toContainEqual(['eq', 'decision_type', 'stage_gate']);
    expect(filters).toContainEqual(['in', 'status', ['approved', 'rejected']]);
  });

  it('does not scan decisions at all when no venture is paused-awaiting (bounded pass)', async () => {
    const supabase = makeSupabase({ pausedVentures: [], decisions: [] });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary).toEqual({ processed: 0, activated: 0, parked: 0, errors: 0 });
    expect(supabase._recorded.decisionFilters).toHaveLength(0);
  });

  // Acceptance canary 2: real approval activates.
  it('activates a paused-awaiting venture on an approved decision, with decision-id provenance', async () => {
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-1', venture_id: 'v-1', status: 'approved', rationale: 'looks good' }],
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
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-2', venture_id: 'v-1', status: 'rejected', rationale: 'not now' }],
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

  // Adversarial-review round 1: a prior tick's successful park whose cancel failed must be
  // REUSED — never a duplicate nursery insert.
  it('re-processed rejection reuses the existing un-promoted nursery row (park dedupe)', async () => {
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-2', venture_id: 'v-1', status: 'rejected', rationale: 'not now' }],
      existingPark: { id: 'nursery-existing' },
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(parkVenture).not.toHaveBeenCalled();
    expect(summary.parked).toBe(1); // still cancels the venture
    expect(supabase._recorded.ventureUpdates[0].status).toBe('cancelled');
  });

  it('park failure leaves the venture PAUSED (retryable) — never cancels without a nursery row', async () => {
    parkVenture.mockRejectedValueOnce(new Error('nursery schema drift'));
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-3', venture_id: 'v-1', status: 'rejected', rationale: null }],
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.parked).toBe(0);
    expect(summary.errors).toBe(1);
    expect(supabase._recorded.ventureUpdates).toHaveLength(0); // no cancel write
  });

  // Adversarial-review round 1: the fresh re-read makes a concurrent transition a no-op.
  it('is idempotent: a venture that transitioned between scan and apply is a no-op', async () => {
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-1', venture_id: 'v-1', status: 'approved', rationale: null }],
      freshVenture: null, // gone by the time we re-read — another instance applied it
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.processed).toBe(0);
    expect(supabase._recorded.ventureUpdates).toHaveLength(0);
  });

  it('is idempotent: awaiting flag already cleared on the fresh read is a no-op', async () => {
    const supabase = makeSupabase({
      pausedVentures: [pausedAwaitingVenture],
      decisions: [{ id: 'd-1', venture_id: 'v-1', status: 'approved', rationale: null }],
      freshVenture: {
        ...pausedAwaitingVenture,
        metadata: { stage_zero: { awaiting_chairman_decision: false } },
      },
    });
    const summary = await processStageZeroDecisions({ supabase, logger: silentLogger });
    expect(summary.processed).toBe(0);
    expect(supabase._recorded.ventureUpdates).toHaveLength(0);
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
