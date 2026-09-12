/**
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3 — graduated-autonomy ladder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn().mockResolvedValue({ recorded: true, id: 'decision-1' }),
}));

// SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: checkStageGate()'s armed param defaults to
// isEnabled(), which opens its OWN live Supabase client from process.env (ignoring the
// injected test double) -- unmocked, every test in this file would make a real network
// call. Mocked to false (the safe, shadow-mode default) to keep this suite hermetic.
vi.mock('../../../lib/feature-flags/evaluator.js', () => ({ isEnabled: vi.fn().mockResolvedValue(false) }));

import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';
import { evaluateGraduation, recordPublishOutcome, checkPublishAuthorization } from '../../../lib/marketing/autonomy-gate.js';

/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-5 note for whoever reads this next:
 * evaluateGraduation now ALSO reads venture_demand_verdicts, because a clean streak proves the
 * channel publishes well and proves nothing about whether anyone wants what it publishes.
 * `demandVerdict` DEFAULTS TO null — deliberately matching production's fail-closed behaviour, so
 * a test that wants graduation has to SAY SO rather than inherit it from a convenient default.
 * No assertion in this file was weakened; the one test that asserts graduation now states both
 * of its preconditions explicitly. The refusal side is covered in
 * tests/unit/marketing/autonomy-requires-demand-verdict.test.js.
 */
function makeSupabase({ recentRows = [], selectError = null, updateError = null, upsertError = null, demandVerdict = null }) {
  const verdictChain = {
    select: vi.fn(() => verdictChain),
    eq: vi.fn(() => verdictChain),
    order: vi.fn(() => verdictChain),
    limit: vi.fn(() => verdictChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: demandVerdict, error: null }))
  };

  const ledgerChain = {
    select: vi.fn(() => ledgerChain),
    eq: vi.fn(() => ledgerChain),
    neq: vi.fn(() => ledgerChain),
    order: vi.fn(() => ledgerChain),
    limit: vi.fn(() => Promise.resolve({ data: recentRows, error: selectError })),
    update: vi.fn(() => ledgerChain),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: updateError ? null : { venture_id: 'v-1', channel_type: 'x' },
      error: updateError
    }))
  };

  const autonomyChain = {
    upsert: vi.fn(() => Promise.resolve({ error: upsertError }))
  };

  return {
    from: vi.fn((table) => {
      if (table === 'venture_channel_autonomy') return autonomyChain;
      if (table === 'venture_demand_verdicts') return verdictChain;
      return ledgerChain;
    }),
    _autonomyChain: autonomyChain
  };
}

describe('evaluateGraduation', () => {
  it('graduates to autonomous after N consecutive shipped_clean+accepted outcomes', async () => {
    const rows = Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean' }));
    // FR-5: graduation now requires BOTH a clean streak AND a PASS demand verdict. The streak
    // alone no longer suffices, so this test states its second precondition explicitly rather
    // than relying on a default. Its assertions below are unchanged.
    const supabase = makeSupabase({
      recentRows: rows,
      demandVerdict: { verdict: 'PASS', citation: 'test fixture: demand validated', computed_at: '2026-08-09T00:00:00Z' }
    });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.success).toBe(true);
    expect(result.autonomyState).toBe('autonomous');
    expect(supabase._autonomyChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ venture_id: 'v-1', channel_type: 'x', autonomy_state: 'autonomous' }),
      expect.anything()
    );
  });

  it('stays propose_and_approve when the streak is broken by a reverted outcome', async () => {
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'reverted' }, // breaks the streak walking newest-first
      { decision: 'accepted', outcome: 'shipped_clean' },
      { decision: 'accepted', outcome: 'shipped_clean' }
    ];
    const supabase = makeSupabase({ recentRows: rows });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.success).toBe(true);
    expect(result.autonomyState).toBe('propose_and_approve');
    expect(result.cleanStreak).toBe(2);
  });

  it('demotes immediately (clean_streak reset) when the most recent outcome is caused_rework', async () => {
    const rows = [{ decision: 'accepted', outcome: 'caused_rework' }];
    const supabase = makeSupabase({ recentRows: rows });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.autonomyState).toBe('propose_and_approve');
    expect(result.cleanStreak).toBe(0);
  });

  it('propagates a query error rather than silently graduating', async () => {
    const supabase = makeSupabase({ selectError: { message: 'db down' } });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });

  it('SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4: a mixed fixture (older real shipped_clean rows behind a NEWER mock-discriminated row) does NOT graduate -- the mock row breaks the streak at its position, an all-mock fixture alone would not exercise this', async () => {
    // Ordered newest-first, matching the real .order('created_at', {ascending:false}) query.
    const rows = [
      { decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'mock' }, // newest: mock -> breaks immediately
      { decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'live' },
      { decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'live' },
      { decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'live' },
      { decision: 'accepted', outcome: 'shipped_clean', execution_mode: 'live' },
    ];
    const supabase = makeSupabase({
      recentRows: rows,
      demandVerdict: { verdict: 'PASS', citation: 'test fixture', computed_at: '2026-08-09T00:00:00Z' },
    });

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(result.cleanStreak).toBe(0);
    expect(result.autonomyState).toBe('propose_and_approve');
  });

  it('FR-4: execution_mode not yet in the live schema (undefined_column) falls back gracefully -- pre-existing streak-counting behavior is unaffected', async () => {
    let callCount = 0;
    const rows = Array.from({ length: 5 }, () => ({ decision: 'accepted', outcome: 'shipped_clean' }));
    const verdictChain = {
      select: vi.fn(function () { return this; }),
      eq: vi.fn(function () { return this; }),
      order: vi.fn(function () { return this; }),
      limit: vi.fn(function () { return this; }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: { verdict: 'PASS', citation: 'fixture', computed_at: '2026-08-09T00:00:00Z' }, error: null })),
    };
    const ledgerChain = {
      select: vi.fn(function () { return this; }),
      eq: vi.fn(function () { return this; }),
      neq: vi.fn(function () { return this; }),
      order: vi.fn(function () { return this; }),
      limit: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) return Promise.resolve({ data: null, error: { code: '42703', message: 'column venture_channel_publish_ledger.execution_mode does not exist' } });
        return Promise.resolve({ data: rows, error: null });
      }),
      update: vi.fn(function () { return this; }),
    };
    const autonomyChain = { upsert: vi.fn(() => Promise.resolve({ error: null })) };
    // checkCrackGateObserveOnly() runs unconditionally once streakEarned && demandValidated
    // (both true here) -- it must NOT share ledgerChain's counted .limit(), or its own internal
    // queries would inflate callCount and corrupt this test's assertion about the ledger query
    // specifically. Fails safe (try/catch) on the missing .rpc(), same as production.
    const inertChain = { select: vi.fn(function () { return this; }), eq: vi.fn(function () { return this; }), order: vi.fn(function () { return this; }), limit: vi.fn(function () { return this; }), maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })), insert: vi.fn(() => Promise.resolve({ error: null })) };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_channel_autonomy') return autonomyChain;
        if (table === 'venture_demand_verdicts') return verdictChain;
        if (table === 'venture_channel_publish_ledger') return ledgerChain;
        return inertChain;
      }),
    };

    const result = await evaluateGraduation({ supabase, ventureId: 'v-1', channelType: 'x', requiredStreak: 5 });

    expect(callCount).toBe(2); // first attempt (with execution_mode) fails, falls back to the plain query
    expect(result.success).toBe(true);
    expect(result.autonomyState).toBe('autonomous');
  });
});

describe('recordPublishOutcome', () => {
  it('rejects an invalid outcome value without touching the database', async () => {
    const supabase = makeSupabase({});
    await expect(
      recordPublishOutcome({ supabase, correlationId: 'corr-1', outcome: 'made_up_value' })
    ).rejects.toThrow(/invalid outcome/);
  });

  it('re-evaluates graduation after recording a real outcome', async () => {
    const supabase = makeSupabase({ recentRows: [{ decision: 'accepted', outcome: 'shipped_clean' }] });

    const result = await recordPublishOutcome({ supabase, correlationId: 'corr-1', outcome: 'shipped_clean', outcomeRef: 'https://x.com/i/status/1' });

    expect(result.success).toBe(true);
  });

  it('fails when no ledger entry matches the correlation_id', async () => {
    const supabase = makeSupabase({ updateError: null });
    supabase.from = vi.fn((table) => {
      if (table === 'venture_channel_publish_ledger') {
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
        };
      }
      return { upsert: vi.fn() };
    });

    const result = await recordPublishOutcome({ supabase, correlationId: 'unknown-corr', outcome: 'shipped_clean' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ledger entry found');
  });
});

describe('checkPublishAuthorization — dedup + FR-7 chairman_decisions routing', () => {
  function makeAuthSupabase({ autonomyState = null, autonomyError = null, acceptedRow = null, acceptedError = null, existingPending = null, existingPendingError = null, insertData = { id: 'ledger-new' }, insertError = null,
    // SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001: assertOutreachAuthorized() now also requires
    // current_lifecycle_stage>=24 and status='active' (not just is_demo/launch_mode) --
    // this describe block tests autonomy-tier/ledger/fixture-detection logic downstream
    // of that gate, so the default venture is fully outreach-authorized to reach it.
    ventureRow = { is_demo: false, name: 'Real Venture', launch_mode: 'live', current_lifecycle_stage: 25, status: 'active' },
    // SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001 FR-1: the autonomous branch now evaluates
    // four honesty invariants before authorizing. Defaults are the honest-and-healthy path
    // (content past REVIEW, write budget under cap) so the pre-existing autonomous cases
    // still describe an authorized send rather than silently becoming refusal tests.
    contentRow = { lifecycle_state: 'SCHEDULE' }, contentError = null,
    writeBudget = { is_over_budget: false, writes_used: 1, writes_remaining: 99 }, writeBudgetError = null }) {
    let ledgerMaybeSingleCallCount = 0;
    const autonomyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: autonomyState ? { autonomy_state: autonomyState } : null, error: autonomyError })),
    };
    const ledgerChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: insertError ? null : insertData, error: insertError })),
      maybeSingle: vi.fn(() => {
        ledgerMaybeSingleCallCount += 1;
        // 1st maybeSingle call = "accepted?" check; 2nd = "already pending?" dedup check.
        if (ledgerMaybeSingleCallCount === 1) return Promise.resolve({ data: acceptedRow, error: acceptedError });
        return Promise.resolve({ data: existingPending, error: existingPendingError });
      }),
    };
    // QF-20260710-243: fetchVentureForFixtureCheck reads its own 'ventures' table -- a dedicated
    // chain so it never shares (and corrupts) ledgerChain's call-count-based maybeSingle mock.
    const venturesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: ventureRow, error: null })),
    };
    // FR-1 invariant 3 reads marketing_content on its own chain — sharing ledgerChain would
    // consume one of its call-count-based maybeSingle slots and corrupt the dedup mock.
    const marketingContentChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: contentRow, error: contentError })),
    };
    // SD-LEO-INFRA-STAGE-GATE-PREDICATE-001: checkStageGate() writes an audit_log row on
    // every in-scope evaluation. Own chain, matching the ventures/marketing_content
    // pattern above -- sharing ledgerChain would register as a spurious ledgerChain.insert
    // call and corrupt the dedup/no-duplicate-insert assertions this describe block makes.
    const auditLogChain = { insert: vi.fn(() => Promise.resolve({ error: null })) };
    return {
      from: vi.fn((table) => {
        if (table === 'venture_channel_autonomy') return autonomyChain;
        if (table === 'ventures') return venturesChain;
        if (table === 'marketing_content') return marketingContentChain;
        if (table === 'audit_log') return auditLogChain;
        return ledgerChain;
      }),
      // FR-1 invariant 4 delegates to marketlens-caps.checkWriteBudget, which calls this RPC.
      rpc: vi.fn(() => Promise.resolve({ data: [writeBudget], error: writeBudgetError })),
      ledgerChain,
      marketingContentChain,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('ADVERSARIAL-REVIEW FIX: an autonomous channel still writes a ledger row per publish attempt (so rate-limiting and outcome-based demotion are not silently dead for the unsupervised tier)', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'autonomous', insertData: { id: 'ledger-auto-1' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });

    expect(result.allowed).toBe(true);
    expect(result.correlationId).toBeTruthy();
    expect(supabase.ledgerChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ venture_id: 'v-1', channel_type: 'x', decision: 'accepted', decision_by: 'system:autonomous' })
    );
    // Autonomous approval is system-graduated, not a human review — no chairman_decisions noise.
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('fails closed when an autonomous channel cannot record its own publish attempt', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'autonomous', insertError: { message: 'db unavailable' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });

  // SECURITY finding SEC-H1-R (sub_agent_execution_results 9b8602a9-76bb-4b2c-b36f-01f4625b720c):
  // a process that cached "execution_mode absent" BEFORE the chairman applies the FR-4
  // migration, and is still running AFTER, must self-heal on the very next attempt rather than
  // hard-failing every ledger INSERT for the rest of its lifetime.
  describe('SEC-H1-R: self-heals when execution_mode is confirmed absent, then found NOT NULL-violated', () => {
    beforeEach(async () => {
      const { __resetExecutionModeProbeForTests } = await import('../../../lib/marketing/ledger-execution-mode-probe.js');
      __resetExecutionModeProbeForTests();
    });
    afterEach(async () => {
      const { __resetExecutionModeProbeForTests } = await import('../../../lib/marketing/ledger-execution-mode-probe.js');
      __resetExecutionModeProbeForTests();
    });

    it('invalidates the stale cache and retries once, succeeding on the second attempt', async () => {
      let probeCallCount = 0;
      let insertCallCount = 0;
      const supabase = makeAuthSupabase({ autonomyState: 'autonomous' });
      // Override just the ledger chain's probe (select().limit()) and insert (insert().select().single())
      // behavior: the probe first reports "absent" (cached false), the first insert attempt then
      // hits the 23502 this SD's own FR-4 migration would cause, and the SECOND probe call (after
      // invalidateExecutionModeProbeCache()) reports "present" so the retry succeeds with the stamp.
      supabase.ledgerChain.limit = vi.fn(() => {
        probeCallCount += 1;
        if (probeCallCount === 1) {
          return Promise.resolve({ data: null, error: { code: '42703', message: 'column venture_channel_publish_ledger.execution_mode does not exist' } });
        }
        return Promise.resolve({ data: [], error: null });
      });
      supabase.ledgerChain.single = vi.fn(() => {
        insertCallCount += 1;
        if (insertCallCount === 1) {
          return Promise.resolve({ data: null, error: { code: '23502', message: 'null value in column "execution_mode" of relation "venture_channel_publish_ledger" violates not-null constraint' } });
        }
        return Promise.resolve({ data: { id: 'ledger-self-healed-1' }, error: null });
      });

      const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });

      expect(result.allowed).toBe(true);
      expect(result.ledgerEntryId).toBe('ledger-self-healed-1');
      expect(probeCallCount).toBe(2);
      expect(insertCallCount).toBe(2);
      // First insert omitted the stamp (probe said absent); second carried it (probe re-confirmed present).
      expect(supabase.ledgerChain.insert.mock.calls[0][0]).not.toHaveProperty('execution_mode');
      expect(supabase.ledgerChain.insert.mock.calls[1][0]).toMatchObject({ execution_mode: 'live' });
    });

    it('does NOT retry (and stays fail-closed) when the insert fails for an unrelated reason', async () => {
      let probeCallCount = 0;
      let insertCallCount = 0;
      const supabase = makeAuthSupabase({ autonomyState: 'autonomous' });
      supabase.ledgerChain.limit = vi.fn(() => {
        probeCallCount += 1;
        return Promise.resolve({ data: null, error: { code: '42703', message: 'column venture_channel_publish_ledger.execution_mode does not exist' } });
      });
      supabase.ledgerChain.single = vi.fn(() => {
        insertCallCount += 1;
        return Promise.resolve({ data: null, error: { message: 'db unavailable' } });
      });

      const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('fail-closed');
      // No retry: an unrelated failure must not be masked as a self-heal opportunity.
      expect(probeCallCount).toBe(1);
      expect(insertCallCount).toBe(1);
    });
  });

  it('allows when an accepted ledger entry exists for this exact content', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: { id: 'ledger-1' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(result.allowed).toBe(true);
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('on first proposal, inserts a pending ledger row AND notifies chairman_decisions (FR-7)', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: null });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('AUTONOMY_APPROVAL_REQUIRED');
    expect(supabase.ledgerChain.insert).toHaveBeenCalledWith(expect.objectContaining({ correlation_id: 'corr-1', decision: 'pending' }));
    expect(recordPendingDecision).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ decisionType: 'outbound_publish_approval', ventureId: 'v-1' })
    );
  });

  // SD-FDBK-FIX-ISFIXTUREVENTURE-FALSE-POSITIVES-001 originally guarded: don't let
  // launch_mode='simulated' be treated as a fixture-detection signal for skipping the
  // chairman notification, since every real venture is BORN launch_mode='simulated'.
  // SUPERSEDED (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001): assertOutreachAuthorized() now
  // refuses ANY launch_mode!='live' venture at the very top of checkPublishAuthorization,
  // before autonomy_state/fixture-detection is ever reached -- so this exact regression
  // (launch_mode=simulated silently reaching the notify path) is now structurally
  // impossible via this function, not merely correctly handled once reached.
  it("a launch_mode='simulated' venture (is_demo=false, no fixture-name pattern) is refused by the outreach gate before autonomy_state/fixture-detection ever runs", async () => {
    const supabase = makeAuthSupabase({
      autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: null,
      ventureRow: { is_demo: false, name: 'Test Venture for Owned-Audience Loop', launch_mode: 'simulated', current_lifecycle_stage: 25, status: 'active' },
    });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('mock');
    expect(result.reason).toContain('launch_mode_not_live');
    // Refused before the pending-ledger-insert/chairman-notify path is ever reached.
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('an is_demo=true venture is refused by the outreach gate before autonomy_state/fixture-detection ever runs', async () => {
    const supabase = makeAuthSupabase({
      autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: null,
      ventureRow: { is_demo: true, name: 'Any Name', launch_mode: 'simulated' },
    });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('mock');
    expect(result.reason).toContain('is_demo');
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('on a RETRY of the same unapproved attempt, does not insert a duplicate row or re-notify (dedup)', async () => {
    const supabase = makeAuthSupabase({ autonomyState: 'propose_and_approve', acceptedRow: null, existingPending: { id: 'ledger-already-pending' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1', correlationId: 'corr-1' });

    expect(result.allowed).toBe(false);
    expect(supabase.ledgerChain.insert).not.toHaveBeenCalled();
    expect(recordPendingDecision).not.toHaveBeenCalled();
  });

  it('fails closed when the autonomy-state lookup errors', async () => {
    const supabase = makeAuthSupabase({ autonomyError: { message: 'connection reset' } });
    const result = await checkPublishAuthorization({ supabase, ventureId: 'v-1', channelType: 'x', contentId: 'c-1' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('fail-closed');
  });
});
