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

// SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 FR-4: checkThesisKillGate now checks kill-fire-
// readiness (canonical stage + no open blocking finding) before a FIRED verdict can proceed.
// Stub getStageGovernance so every pre-existing test's stage_by (12, or the caller's override)
// resolves to a real stage by default — these tests are exercising decision-minting logic, not
// FR-4's own readiness predicate (that has its own dedicated describe block below).
vi.mock('../../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ getStage: (n) => ({ stage_number: n }) }),
}));

function buildSupabaseMock({ killCriteria = null, ventureReadError = null, decisionStatus = 'pending', insertedEvents = [], openFeedbackFindings = [] } = {}) {
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
      if (table === 'feedback') {
        // FR-4's openBlockingFindings lookup + recordFactoryDefect's dedup lookup/insert.
        // Fully chainable stub: every filter method (select/eq/in/limit) returns an object
        // that is BOTH further-chainable AND thenable, resolving to the fixture data — avoids
        // hand-matching each call site's exact method-chain shape.
        // Three distinct terminal shapes, disambiguated by WHICH method ends the chain:
        //   awaited directly / no terminal call -> array-shaped (FR-4's openBlockingFindings)
        //   .maybeSingle() -> no existing dedup row (recordFactoryDefect proceeds to insert)
        //   .single()      -> the inserted row (recordFactoryDefect's insert().select().single())
        const chain = () => ({
          select: () => chain(),
          eq: () => chain(),
          in: () => chain(),
          limit: () => chain(),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: { id: 'feedback-1' }, error: null }),
          then: (onFulfilled, onRejected) => Promise.resolve({ data: openFeedbackFindings, error: null }).then(onFulfilled, onRejected),
        });
        return {
          select: vi.fn(() => chain()),
          insert: vi.fn(() => chain()),
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
    // SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 FR-3: renamed from THESIS_KILL_HOLD to the
    // more precise THESIS_KILL_CANNOT_EVALUATE (a HOLD verdict IS a cannot_evaluate outcome).
    expect(insertedEvents.some((e) => e.event_type === 'THESIS_KILL_CANNOT_EVALUATE')).toBe(true);
  });

  it('SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 FR-3: a throwing resolver is isolated to its OWN criterion (HOLD/resolver_error), never propagates as an uncaught rejection, and never silently discards sibling criteria', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const insertedEvents = [];
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], insertedEvents });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => { throw new Error('simulated resolver failure'); },
    });

    // Amended per PRD FR-3 (was: fired.length===0 && held.length===0, i.e. the whole
    // evaluation silently vanished). The corrected contract: never blocks (still allowed),
    // but the failing criterion IS observable as a HOLD with a resolver_error cause — not a
    // total blackout.
    expect(result.allowed).toBe(true);
    expect(result.fired).toHaveLength(0);
    expect(result.held).toHaveLength(1);
    expect(result.held[0].errorClass).toBe('resolver_error');
    expect(result.held[0].errorMessage).toContain('simulated resolver failure');
    expect(insertedEvents.some((e) => e.event_type === 'THESIS_KILL_CANNOT_EVALUATE' && e.details?.errorClass === 'resolver_error')).toBe(true);
  });

  it('FR-3: a throwing resolver on ONE criterion does not discard a sibling criterion that resolves normally', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-x', isNew: true, skipped: false });

    const supabase = buildSupabaseMock({
      killCriteria: [dueCriterion({ id: 'kill-throws', metric: 'metric_throws' }), dueCriterion({ id: 'kill-fires', metric: 'metric_fires' })],
      decisionStatus: 'pending',
    });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: (metric) => { if (metric === 'metric_throws') throw new Error('boom'); return 8; },
    });

    expect(result.held).toHaveLength(1);
    expect(result.held[0].criterionId).toBe('kill-throws');
    expect(result.fired).toHaveLength(1);
    expect(result.fired[0].criterionId).toBe('kill-fires');
    // The still-firing sibling still blocks in binding mode — a throwing resolver on ONE
    // criterion must never be a kill-bypass for the others.
    expect(result.allowed).toBe(false);
    expect(result.blocked_by).toHaveLength(1);
  });
});

describe('checkThesisKillGate — FR-4 kill-fire-readiness precondition', () => {
  it('a FIRED verdict with an open blocking finding (INSTRUMENT_LIE) is downgraded to cannot_evaluate, never reaches would_kill_by/blocked_by', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    const insertedEvents = [];
    const supabase = buildSupabaseMock({
      killCriteria: [dueCriterion()],
      insertedEvents,
      openFeedbackFindings: [{ id: 'f1', metadata: { gap_class: 'INSTRUMENT_LIE' } }],
    });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
    expect(result.would_kill_by).toHaveLength(0);
    expect(result.blocked_by).toHaveLength(0);
    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
    expect(insertedEvents.some((e) => e.event_type === 'THESIS_KILL_CANNOT_EVALUATE' && String(e.details?.errorMessage).startsWith('kill_validity_precondition_failed:'))).toBe(true);
  });

  it('a FIRED verdict referencing a non-canonical stage_by is downgraded (invalid_stage), never blocks', async () => {
    const { getStageGovernance } = await import('../../../../lib/eva/stage-governance.js');
    getStageGovernance.mockResolvedValueOnce({ getStage: () => null }); // no stage recognizes this criterion's stage_by
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()] });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.allowed).toBe(true);
    expect(result.blocked_by).toHaveLength(0);
    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
  });

  it('a FIRED verdict with a valid criterion, a real stage, and no blocking finding proceeds normally (readiness check is not a silent extra block)', async () => {
    const { checkThesisKillGate } = await importGateWithFlag('binding');
    const { createOrReusePendingDecision } = await import('../../../../lib/eva/chairman-decision-watcher.js');
    createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: false, skipped: false });
    const supabase = buildSupabaseMock({ killCriteria: [dueCriterion()], decisionStatus: 'pending' });

    const result = await checkThesisKillGate({
      supabase, ventureId: VENTURE_ID, fromStage: 11, toStage: 12,
      resolveObservedValue: () => 8,
    });

    expect(result.blocked_by).toHaveLength(1);
    expect(createOrReusePendingDecision).toHaveBeenCalled();
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
