/**
 * Unit tests for lib/eva/lifecycle/thesis-kill-gate.
 *
 * SD-LEO-INFRA-KILL-GATE-TIER-001
 *
 * Covers:
 *   - observe mode (default): FIRED logs + mints a decision but never blocks
 *   - binding mode: FIRED without an approved decision blocks; approved decision unblocks
 *   - off mode: short-circuits, no evaluation, no system_events writes
 *   - no-criteria control: byte-identical allow, zero system_events writes
 *   - mode-flag independence: the thesis-kill flag is read at module load, independent of
 *     LEO_S19_EXIT_GATE_ENFORCER (that flag is never referenced here)
 *   - HOLD verdicts are logged but never block, even in binding mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const VENTURE_ID = '11111111-2222-3333-4444-555555555555';

vi.mock('../../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
}));

function buildSupabaseMock({ killCriteria = null, ventureReadError = null, decisionStatus = 'pending', insertedEvents = [] } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue(
                ventureReadError
                  ? { data: null, error: ventureReadError }
                  : { data: { metadata: { kill_criteria: killCriteria } }, error: null }
              ),
            })),
          })),
        };
      }
      if (table === 'system_events') {
        return {
          insert: vi.fn((row) => {
            insertedEvents.push(row);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      if (table === 'chairman_decisions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { status: decisionStatus }, error: null }),
            })),
          })),
        };
      }
      return { select: vi.fn() };
    }),
  };
}

async function importGateWithFlag(value) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.LEO_THESIS_KILL_GATE;
  } else {
    process.env.LEO_THESIS_KILL_GATE = value;
  }
  return import('../../../../lib/eva/lifecycle/thesis-kill-gate.js');
}

const dueCriterion = (overrides = {}) => ({
  id: 'kill-demand-signals',
  metric: 'demand_test_qualified_signups',
  comparator: 'lt',
  threshold: 10,
  stage_by: 12,
  description: 'test',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getThesisKillFlag', () => {
  it('defaults to observe mode when unset', async () => {
    const { getThesisKillFlag } = await importGateWithFlag(undefined);
    expect(getThesisKillFlag().mode).toBe('observe');
  });

  it('recognizes off and binding modes', async () => {
    let mod = await importGateWithFlag('off');
    expect(mod.getThesisKillFlag().mode).toBe('off');
    mod = await importGateWithFlag('binding');
    expect(mod.getThesisKillFlag().mode).toBe('binding');
  });
});

describe('checkThesisKillGate — observe mode (default)', () => {
  it('a FIRED criterion is logged and surfaced via would_kill_by, but advancement is NOT blocked and no chairman decision is minted', async () => {
    const { checkThesisKillGate } = await importGateWithFlag(undefined);
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: true, skipped: false });

    const insertedEvents = [];
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], insertedEvents });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
    expect(result.would_kill_by).toHaveLength(1);
    expect(result.fired).toHaveLength(1);
    expect(insertedEvents.some((e) => e.event_type === 'THESIS_KILL_FIRED')).toBe(true);
    // Mirrors exit-gate-enforcer's own observe/binding precedent: an observe-only would-kill
    // has nothing to approve/override, so no actionable chairman_decisions card is minted —
    // only binding mode (where a real block exists) creates one.
    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
  });
});

describe('checkThesisKillGate — binding mode', () => {
  it('a FIRED criterion without an approved decision BLOCKS advancement', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: false, skipped: false });

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'pending' });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toHaveLength(1);
    expect(createOrReusePendingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        ventureId: VENTURE_ID,
        // Adversarial review (2026-07-11): decisionType is scoped PER-CRITERION
        // (thesis_kill_tier_b:<criterionId>), not the bare constant — otherwise two
        // criteria firing at the same stage would collapse into one merged decision row.
        decisionType: 'thesis_kill_tier_b:kill-demand-signals',
        forceDecisionCreation: true,
        briefData: expect.objectContaining({ decision: 'kill', criterion_id: 'kill-demand-signals' }),
      })
    );
  });

  it('two distinct criteria fired at the same stage mint TWO separate decisions (never share/merge one row)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-x', isNew: true, skipped: false });

    const supabase = buildSupabaseMock({
      killCriteria: [dueCriterion({ id: 'kill-a', metric: 'metric_a' }), dueCriterion({ id: 'kill-b', metric: 'metric_b' })],
      decisionStatus: 'pending',
    });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.blocked_by).toHaveLength(2);
    expect(createOrReusePendingDecision).toHaveBeenCalledTimes(2);
    const decisionTypes = createOrReusePendingDecision.mock.calls.map((c) => c[0].decisionType);
    expect(new Set(decisionTypes).size).toBe(2); // distinct, never collapsed into one row
    expect(decisionTypes).toEqual(expect.arrayContaining(['thesis_kill_tier_b:kill-a', 'thesis_kill_tier_b:kill-b']));
  });

  it('a decision mint/status-read failure fails CLOSED (stays blocked, unlike the fail-open venture-read/evaluator paths)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockRejectedValue(new Error('simulated DB failure'));

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'pending' });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toHaveLength(1);
  });

  it('a FIRED criterion WITH an approved decision (governed override) does NOT block', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: false, skipped: false });

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'approved' });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
    expect(result.blocked_by).toHaveLength(0);
  });

  it('TS-10: sequential re-evaluation of the same still-pending fired criterion produces a stable block each time (no flood, no accidental clear)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    // isNew:false on the second+ call models createOrReusePendingDecision's own reuse-by-
    // (venture,stage,decision_type) contract — repeated firings reuse the SAME pending row
    // rather than minting a new one each time.
    createOrReusePendingDecision
      .mockResolvedValueOnce({ id: 'dec-1', isNew: true, skipped: false })
      .mockResolvedValueOnce({ id: 'dec-1', isNew: false, skipped: false })
      .mockResolvedValueOnce({ id: 'dec-1', isNew: false, skipped: false });

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'pending' });
    const args = { supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12, resolveObservedValue: () => 8 };

    const first = await checkThesisKillGate(args);
    const second = await checkThesisKillGate(args);
    const third = await checkThesisKillGate(args);

    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);
    expect(third.allowed).toBe(false);
    expect(createOrReusePendingDecision).toHaveBeenCalledTimes(3);
    // Every call reuses the same decision_type/criterion — proving repeated advancement
    // attempts against an un-overridden fired criterion stay blocked, not flap or clear.
    for (const call of createOrReusePendingDecision.mock.calls) {
      expect(call[0]).toMatchObject({ decisionType: 'thesis_kill_tier_b:kill-demand-signals', briefData: expect.objectContaining({ criterion_id: 'kill-demand-signals' }) });
    }
  });

  it('a fixture-venture skip (skipped:true) is treated as auto-clear, never strands the venture', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()] });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
  });

  it('a HOLD verdict is logged but never blocks, even in binding mode', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const insertedEvents = [];
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], insertedEvents });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => undefined, // no gauge -> HOLD
    });

    expect(result.allowed).toBe(true);
    expect(result.held).toHaveLength(1);
    expect(insertedEvents.some((e) => e.event_type === 'THESIS_KILL_HOLD')).toBe(true);
  });

  it('a throwing resolver fails OPEN (never propagates as an uncaught rejection that would block advancement)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()] });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => { throw new Error('simulated resolver failure'); },
    });

    expect(result.allowed).toBe(true);
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(0);
  });
});

describe('checkThesisKillGate — off mode', () => {
  it('skips evaluation entirely, allowed=true, no system_events writes', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('off');
    const insertedEvents = [];
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], insertedEvents });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
    expect(result.flag_enforced).toBe(false);
    expect(insertedEvents).toHaveLength(0);
  });
});

describe('checkThesisKillGate — no-criteria control (FR-6 regression)', () => {
  it('null kill_criteria: allowed=true, zero system_events writes', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const insertedEvents = [];
    const supabase = buildSupabaseMock({ killCriteria: null, insertedEvents });

    const result = await checkThesisKillGate({ supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12 });

    expect(result.allowed).toBe(true);
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(0);
    expect(insertedEvents).toHaveLength(0);
  });

  it('a venture read failure fails OPEN (never blocks on a transient lookup error)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const supabase = buildSupabaseMock({ ventureReadError: { message: 'transient db error' } });

    const result = await checkThesisKillGate({ supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12 });

    expect(result.allowed).toBe(true);
  });
});

describe('mode-flag independence from LEO_S19_EXIT_GATE_ENFORCER', () => {
  it('LEO_S19_EXIT_GATE_ENFORCER=off does not affect thesis-kill evaluation (this module never reads that env var)', async () => {
    process.env.LEO_S19_EXIT_GATE_ENFORCER = 'off';
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: false, skipped: false });

    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'pending' });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    // Thesis-kill still evaluated and blocked on its OWN flag/decision state, proving the two
    // enforcement mechanisms are decoupled.
    expect(result.allowed).toBe(false);
    delete process.env.LEO_S19_EXIT_GATE_ENFORCER;
  });
});
