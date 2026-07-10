/**
 * Unit Tests: createOrReusePendingDecision forceDecisionCreation option
 * SD-LEO-INFRA-STAGE0-CHAIRMAN-DECISION-AUTHORITY-001 (TS-5, TS-7)
 *
 * Stage 0 is deliberately absent from stage_config, so stage_creates_decision(0) returns
 * creates_decision=false and the helper self-skips. The Stage-0 chairman gate passes
 * forceDecisionCreation:true to skip ONLY that predicate; the fixture-venture guard still wins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/forward-gate.js', () => ({
  recordForwardGateScore: vi.fn().mockResolvedValue(undefined),
}));

import { createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Fake supabase covering the helper's paths:
 *  ventures (fixture check): select().eq().maybeSingle()
 *  rpc('stage_creates_decision'): recorded, returns creates_decision=false for stage 0
 *  chairman_decisions existing-pending lookup: select().eq()x4.single() -> none
 *  venture_stage_work (health resolution): select().eq().eq().maybeSingle() -> none
 *  chairman_decisions insert: insert().select().single() -> created row
 */
function makeSupabase({ venture = { is_demo: false, name: 'RealVenture' } } = {}) {
  const inserted = [];
  const rpc = vi.fn().mockResolvedValue({ data: [{ creates_decision: false, gate_type: null, review_mode: null }], error: null });

  function chainFor(table) {
    if (table === 'ventures') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: venture, error: null }) }) }) };
    }
    if (table === 'venture_stage_work') {
      const c = { select: () => c, eq: () => c, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
      return c;
    }
    // chairman_decisions
    return {
      select: () => {
        const c = { eq: () => c, single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }) };
        return c;
      },
      insert: (payload) => {
        inserted.push(payload);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'd-new' }, error: null }) }) };
      },
    };
  }

  return { from: vi.fn(chainFor), rpc, _inserted: inserted };
}

describe('createOrReusePendingDecision — forceDecisionCreation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('default (no flag): consults the stage predicate and SKIPS at stage 0', async () => {
    const supabase = makeSupabase();
    const result = await createOrReusePendingDecision({
      ventureId: 'v-1', stageNumber: 0, supabase, logger: silentLogger,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('stage_creates_decision', { p_stage_number: 0 });
    expect(result.skipped).toBe(true);
    expect(supabase._inserted).toHaveLength(0);
  });

  it('forceDecisionCreation:true mints a real PENDING row at stage 0 without consulting the predicate', async () => {
    const supabase = makeSupabase();
    const result = await createOrReusePendingDecision({
      ventureId: 'v-1',
      stageNumber: 0,
      decisionType: 'stage_gate',
      summary: 'Stage 0: venture awaiting chairman approval',
      briefData: { provenance: { minted_by: 'stage0-machine' } },
      forceDecisionCreation: true,
      supabase,
      logger: silentLogger,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'd-new', isNew: true });
    // TS-7 provenance pin: the mint is PENDING — the machine can never write approved here.
    const row = supabase._inserted[0];
    expect(row.status).toBe('pending');
    expect(row.decision).toBe('pending');
    expect(row.decision_type).toBe('stage_gate');
    expect(row.lifecycle_stage).toBe(0);
    expect(row.brief_data.provenance.minted_by).toBe('stage0-machine');
  });

  it('fixture-venture guard WINS over forceDecisionCreation — test/demo ventures never mint', async () => {
    const supabase = makeSupabase({ venture: { is_demo: true, name: 'parity-test-thing' } });
    const result = await createOrReusePendingDecision({
      ventureId: 'v-fixture', stageNumber: 0, forceDecisionCreation: true, supabase, logger: silentLogger,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('fixture_venture');
    expect(supabase._inserted).toHaveLength(0);
  });
});
