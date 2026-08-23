/**
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 — venture ops-actuals sweep (TS-1/TS-5).
 *
 * Pins: --dry-run performs zero writes, all three jobs run per venture with a live
 * deployment, per-job error isolation (one job's failure doesn't block the others),
 * and the NC-7 zero-rows escalation log when a non-empty venture set writes nothing.
 *
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-4: a 4th job (crack-gate sweep) was added.
 * It always runs alongside jobs 1-3 when !dryRun, so every non-dry-run test below now
 * injects no-op evaluateCrackGateStatus/recordCrackGateObservation deps to stay scoped to
 * jobs 1-3's own behavior -- job 4's own behavior is covered by the dedicated describe
 * block at the bottom of this file, with its own supabase-shaped assertions.
 */
import { describe, it, expect, vi } from 'vitest';
import { main, parseArgs, SD_KEY, ACTIVATION_TRIGGER } from '../../../scripts/cron/venture-ops-actuals-sweep.mjs';

const VENTURES = [
  { id: 'v1', deployment_url: 'https://marketlens.example' },
  { id: 'v2', deployment_url: 'https://crongenius.example' },
];

/** Minimal fake supabase covering the sweep's own reads (ventures, periodic_process_registry). */
function makeSupabase({ ventures = VENTURES } = {}) {
  return {
    from(table) {
      if (table === 'ventures') {
        return {
          select() { return this; },
          not() { return this; },
          neq() { return this; },
          // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: production now
          // paginates via fetchAllPaginated, which appends .order()/.range() after the
          // filter chain — extend the mock with a chainable .order() and a .range() that
          // resolves the (short, loop-ending) page.
          order() { return this; },
          range: async () => ({ data: ventures, error: null }),
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
      }
      if (table === 'periodic_process_registry') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { process_key: 'existing' }, error: null }),
          upsert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

/** No-op crack-gate deps so jobs-1-3-focused tests stay scoped to their own behavior. */
function noopCrackGateDeps() {
  return {
    evaluateCrackGateStatus: vi.fn().mockResolvedValue({ overall: 'MEETS_CRITERION', missing: [] }),
    recordCrackGateObservation: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * No-op PBN auto-score dep (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1, Job 5) so tests focused on
 * other jobs stay scoped to their own behavior -- job 5 always runs alongside jobs 1-4 when
 * !dryRun, and the shared makeSupabase() fake does not define .rpc()/.eq()/.maybeSingle() on
 * 'ventures' (job 5's real retroactivelyScoreVenture would throw against it otherwise).
 */
function noopPbnDeps() {
  return { retroactivelyScoreVenture: vi.fn().mockResolvedValue({ skipped: true, reason: 'test-noop' }) };
}

describe('parseArgs', () => {
  it('parses --once and --dry-run', () => {
    expect(parseArgs(['node', 's', '--once', '--dry-run'])).toEqual({ once: true, dryRun: true, help: false });
  });
});

describe('venture-ops-actuals-sweep main()', () => {
  it('static wiring: SD_KEY and ACTIVATION_TRIGGER are exported for the workflow-wiring pin', () => {
    expect(SD_KEY).toBe('SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001');
    expect(ACTIVATION_TRIGGER).toBe('.github/workflows/venture-ops-actuals-cron.yml');
  });

  it('--dry-run performs zero collector/probe/stamp calls', async () => {
    const collectProductHealth = vi.fn();
    const collectRevenueMetrics = vi.fn();
    const runVentureUptimeProbe = vi.fn();
    const stampLastFired = vi.fn();

    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.action).toBe('dry_run');
    expect(collectProductHealth).not.toHaveBeenCalled();
    expect(collectRevenueMetrics).not.toHaveBeenCalled();
    expect(runVentureUptimeProbe).not.toHaveBeenCalled();
    expect(stampLastFired).not.toHaveBeenCalled();
  });

  it('runs all three jobs once per live-deployment venture and stamps liveness for each', async () => {
    const collectProductHealth = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      ...noopCrackGateDeps(),
      ...noopPbnDeps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(collectProductHealth).toHaveBeenCalledTimes(2);
    expect(collectRevenueMetrics).toHaveBeenCalledTimes(2);
    expect(runVentureUptimeProbe).toHaveBeenCalledTimes(1);
    // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): a whole-tick stamp
    // ('cron_script:venture-ops-actuals-sweep.mjs') was added before the per-job stamps, distinct
    // from the seven per-job ARMED-machinery keys asserted below (jobs 1-4, SD-MAN-INFRA-
    // VENTURE-CRACK-GATE-001 FR-1's Job 5, and SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-2/FR-4's
    // Jobs 6-7, venture-zombie-report + venture-divergence-report).
    expect(stampLastFired).toHaveBeenCalledTimes(8);
    expect(stampLastFired.mock.calls.some(([, key]) => key === 'cron_script:venture-ops-actuals-sweep.mjs')).toBe(true);
    expect(result.summary.jobs['ops-product-health-collector'].written).toBe(2);
    expect(result.summary.jobs['ops-revenue-metrics-collector'].written).toBe(2);
    expect(result.exitCode).toBe(0);
  });

  it('isolates a single failing venture: one collector error does not stop the others', async () => {
    const collectProductHealth = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ venture_id: 'v2' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      ...noopCrackGateDeps(),
      ...noopPbnDeps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['ops-product-health-collector'].written).toBe(1);
    expect(result.summary.jobs['ops-product-health-collector'].errors).toHaveLength(1);
    expect(result.exitCode).toBe(1); // errors present -> non-zero exit for cron visibility
    // the other jobs still ran fully despite job 1's per-venture error
    expect(collectRevenueMetrics).toHaveBeenCalledTimes(2);
    expect(runVentureUptimeProbe).toHaveBeenCalledTimes(1);
  });

  it('logs an NC-7 escalation when a non-empty venture set writes zero rows', async () => {
    const errorLog = vi.fn();
    const collectProductHealth = vi.fn().mockResolvedValue(null); // simulates storeProductHealth's null-on-error return
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      ...noopCrackGateDeps(),
      ...noopPbnDeps(),
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('NC-7 ESCALATION'));
  });

  it('logs an NC-7 escalation for the uptime-probe job too when it checks 0 deployments (adversarial-review fix: parity with jobs 1/2)', async () => {
    const errorLog = vi.fn();
    const collectProductHealth = vi.fn().mockResolvedValue({ venture_id: 'x' });
    const collectRevenueMetrics = vi.fn().mockResolvedValue({ venture_id: 'x' });
    // Simulates ensureDeploymentRows failing to seed every venture (e.g. RLS/permissions
    // drift) — pre-fix, this returned checked=0/errors=[] and passed silently.
    const runVentureUptimeProbe = vi.fn().mockResolvedValue({ ventures_seedable: 2, checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: ['v1: seed insert failed', 'v2: seed insert failed'] });
    const stampLastFired = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      collectProductHealth, collectRevenueMetrics, runVentureUptimeProbe, stampLastFired,
      ...noopCrackGateDeps(),
      ...noopPbnDeps(),
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/NC-7 ESCALATION.*venture-uptime-probe/));
    expect(result.exitCode).toBe(1); // the folded seed errors also flip anyErrors
  });
});

describe('venture-ops-actuals-sweep Job 4: crack-gate sweep (SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-4, TS-5)', () => {
  function baseDeps() {
    return {
      collectProductHealth: vi.fn().mockResolvedValue({ venture_id: 'x' }),
      collectRevenueMetrics: vi.fn().mockResolvedValue({ venture_id: 'x' }),
      runVentureUptimeProbe: vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] }),
      stampLastFired: vi.fn().mockResolvedValue(undefined),
      ...noopPbnDeps(),
      logger: { log() {}, warn() {}, error() {} },
    };
  }

  it('TS-5: activation invariant — evaluator is called once per venture with the EXACT id set fetchLiveDeploymentVentures() returns (set identity, not call count)', async () => {
    const seenIds = [];
    const evaluateCrackGateStatus = vi.fn(async (_supabase, ventureId) => {
      seenIds.push(ventureId);
      return { overall: 'MEETS_CRITERION', missing: [] };
    });
    const recordCrackGateObservation = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      evaluateCrackGateStatus,
      recordCrackGateObservation,
    });

    // Set-identity assertion: exactly {v1, v2}, no more, no fewer, no duplicates — a
    // hardcoded-list implementation would also satisfy a count-only check, so this asserts
    // the actual ids rather than just evaluateCrackGateStatus.mock.calls.length.
    expect(new Set(seenIds)).toEqual(new Set(['v1', 'v2']));
    expect(evaluateCrackGateStatus).toHaveBeenCalledTimes(2);
    expect(result.summary.jobs['venture-crack-gate-sweep'].checked).toBe(2);
  });

  it('records an observation for every venture, and counts would_block for NOT_MET verdicts', async () => {
    const evaluateCrackGateStatus = vi.fn()
      .mockResolvedValueOnce({ overall: 'NOT_MET', missing: [{ check: 'pbn' }] })
      .mockResolvedValueOnce({ overall: 'MEETS_CRITERION', missing: [] });
    const recordCrackGateObservation = vi.fn().mockResolvedValue(undefined);

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      evaluateCrackGateStatus,
      recordCrackGateObservation,
    });

    expect(recordCrackGateObservation).toHaveBeenCalledTimes(2);
    expect(result.summary.jobs['venture-crack-gate-sweep'].would_block).toBe(1);
    // F3 fix (post-merge TESTING finding): the sweep must identify itself as 'sweep', not fall
    // through to recordCrackGateObservation's default parameter — this call site always passes
    // the literal explicitly, so a future edit that dropped the 4th argument (silently reverting
    // to the shared default) would previously have gone undetected here.
    expect(recordCrackGateObservation).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'sweep');
  });

  it('a per-venture evaluator error is isolated (does not stop the other jobs or other ventures) and surfaces in summary.jobs errors', async () => {
    const evaluateCrackGateStatus = vi.fn()
      .mockRejectedValueOnce(new Error('rpc timeout'))
      .mockResolvedValueOnce({ overall: 'MEETS_CRITERION', missing: [] });
    const recordCrackGateObservation = vi.fn().mockResolvedValue(undefined);
    const deps = baseDeps();

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...deps,
      evaluateCrackGateStatus,
      recordCrackGateObservation,
    });

    expect(result.summary.jobs['venture-crack-gate-sweep'].checked).toBe(1);
    expect(result.summary.jobs['venture-crack-gate-sweep'].errors).toHaveLength(1);
    // jobs 1-3 still completed fully despite job 4's per-venture error
    expect(deps.collectProductHealth).toHaveBeenCalledTimes(2);
    expect(deps.runVentureUptimeProbe).toHaveBeenCalledTimes(1);
  });

  it('logs an NC-7 escalation when a non-empty venture set has job 4 check 0 ventures', async () => {
    const errorLog = vi.fn();
    const evaluateCrackGateStatus = vi.fn().mockRejectedValue(new Error('down'));
    const recordCrackGateObservation = vi.fn().mockResolvedValue(undefined);

    await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      logger: { log() {}, warn() {}, error: errorLog },
      evaluateCrackGateStatus,
      recordCrackGateObservation,
    });

    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/NC-7 ESCALATION.*venture-crack-gate-sweep/));
  });

  it('SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-9: a source-unavailable finding emits venture-user feedback with ingestSecret:null (no venture has one provisioned) and never touches checked/wouldBlock', async () => {
    const evaluateCrackGateStatus = vi.fn().mockResolvedValue({
      overall: 'NOT_MET',
      missing: [{ check: 'stage17_judgment' }],
      stage17_judgment: { verdict: 'ATTESTATION_SOURCE_UNAVAILABLE', reason: 'attestations_table_not_yet_applied' },
    });
    const recordCrackGateObservation = vi.fn().mockResolvedValue(undefined);
    const emitVentureUserFeedback = vi.fn().mockResolvedValue({ submitted: false, reason: 'no_ingest_secret_provisioned (blocked on QF-20260817-982)' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      evaluateCrackGateStatus,
      recordCrackGateObservation,
      emitVentureUserFeedback,
    });

    expect(emitVentureUserFeedback).toHaveBeenCalledTimes(2); // once per venture (v1, v2)
    expect(emitVentureUserFeedback).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ventureId: expect.any(String), ingestSecret: null, feedbackType: 'user_other',
    }));
    expect(result.summary.jobs['venture-crack-gate-sweep'].feedback_emitted).toBe(0); // never provisioned -> never submitted
    expect(result.summary.jobs['venture-crack-gate-sweep'].checked).toBe(2);
  });
});

describe('venture-ops-actuals-sweep Job 5: PBN auto-score sweep (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-1)', () => {
  function baseDeps() {
    return {
      collectProductHealth: vi.fn().mockResolvedValue({ venture_id: 'x' }),
      collectRevenueMetrics: vi.fn().mockResolvedValue({ venture_id: 'x' }),
      runVentureUptimeProbe: vi.fn().mockResolvedValue({ checked: 2, reachable: 2, unreachable: 0, newly_surfaced: 0, errors: [] }),
      stampLastFired: vi.fn().mockResolvedValue(undefined),
      ...noopCrackGateDeps(),
      logger: { log() {}, warn() {}, error() {} },
    };
  }

  it('scores every venture with no existing verdict, calling retroactivelyScoreVenture once per venture id (set identity)', async () => {
    const seenIds = [];
    const retroactivelyScoreVenture = vi.fn(async (_supabase, ventureId) => {
      seenIds.push(ventureId);
      return { skipped: false, ventureId, verdict: 'PASS' };
    });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
    });

    expect(new Set(seenIds)).toEqual(new Set(['v1', 'v2']));
    expect(retroactivelyScoreVenture).toHaveBeenCalledTimes(2);
    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      expect.objectContaining({ attempted: 2, scored: 2, already_scored: 0, function_missing: 0, errors: [] }),
    );
  });

  it('counts an already-scored venture as already_scored, not scored (retroactivelyScoreVenture is itself idempotent-safe)', async () => {
    const retroactivelyScoreVenture = vi.fn()
      .mockResolvedValueOnce({ skipped: true, reason: 'pbn_verdict_already_present' })
      .mockResolvedValueOnce({ skipped: false, verdict: 'REJECT' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
    });

    expect(result.summary.jobs['venture-pbn-auto-score-sweep'].scored).toBe(1);
    expect(result.summary.jobs['venture-pbn-auto-score-sweep'].already_scored).toBe(1);
  });

  it('SECURITY F3: a missing RPC (migration not yet applied) stops the loop after the FIRST confirmation -- a schema-level fact, not per-venture, so the remaining ventures are never attempted (and never burn an LLM call)', async () => {
    const errorLog = vi.fn();
    const retroactivelyScoreVenture = vi.fn().mockRejectedValue(
      new Error('retroactive pbn_verdict write failed: Could not find the function public.set_venture_pbn_verdict_stage_zero(p_pbn_verdict, p_venture_id) in the schema cache'),
    );

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(retroactivelyScoreVenture).toHaveBeenCalledTimes(1); // NOT 2 -- stops after the first confirmation
    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      // SECURITY re-review finding N1: `checked` (actual attempts) and `attempted` (full portfolio
      // size) are pinned separately -- an observability regression that reported checked as if the
      // whole portfolio ran would satisfy every other assertion here while silently lying about
      // what the early-exit actually did.
      expect.objectContaining({ attempted: 2, checked: 1, scored: 0, already_scored: 0, scoring_errors: 0, function_missing: 1, errors: [] }),
    );
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/set_venture_pbn_verdict_stage_zero RPC not found/));
    expect(result.exitCode).toBe(0); // function_missing is a known, expected-for-now state -- not a failure
  });

  it('SECURITY F2: a scoring_error skip is counted separately from already_scored (never conflated -- one means "nothing to do", the other means "the write was withheld to avoid a fabricated verdict")', async () => {
    const retroactivelyScoreVenture = vi.fn()
      .mockResolvedValueOnce({ skipped: true, reason: 'scoring_error', ventureId: 'v1', detail: 'LLM timeout' })
      .mockResolvedValueOnce({ skipped: true, reason: 'pbn_verdict_already_present' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
    });

    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      expect.objectContaining({ scored: 0, already_scored: 1, scoring_errors: 1, function_missing: 0 }),
    );
  });

  it('independent sweep finding: EVERY attempted venture failing with scoring_error (e.g. missing LLM credential) flips exitCode instead of silently exiting green', async () => {
    const errorLog = vi.fn();
    const retroactivelyScoreVenture = vi.fn().mockResolvedValue({ skipped: true, reason: 'scoring_error', detail: 'no LLM credential configured' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      expect.objectContaining({ scored: 0, already_scored: 0, scoring_errors: 2, function_missing: 0 }),
    );
    expect(result.summary.jobs['venture-pbn-auto-score-sweep'].errors).toHaveLength(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/SYSTEMIC ESCALATION.*ALL 2 attempted venture\(s\) failed with scoring_error/));
    expect(result.exitCode).toBe(1); // not 0 -- a 100%-failure cycle must be loud, not silently green
  });

  it('a MIX of scored + scoring_error ventures does NOT trigger the systemic escalation (isolated per-venture noise stays retryable, not job-failing)', async () => {
    const errorLog = vi.fn();
    const retroactivelyScoreVenture = vi.fn()
      .mockResolvedValueOnce({ skipped: false, verdict: 'PASS' })
      .mockResolvedValueOnce({ skipped: true, reason: 'scoring_error', detail: 'transient timeout' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
      logger: { log() {}, warn() {}, error: errorLog },
    });

    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      expect.objectContaining({ scored: 1, scoring_errors: 1 }),
    );
    expect(errorLog).not.toHaveBeenCalledWith(expect.stringMatching(/SYSTEMIC ESCALATION/));
    expect(result.exitCode).toBe(0);
  });

  it('a genuine per-venture scoring error (not a missing-function shape) is isolated and surfaces in summary.jobs errors, flipping exitCode', async () => {
    const retroactivelyScoreVenture = vi.fn()
      .mockRejectedValueOnce(new Error('ventures fetch failed: connection refused'))
      .mockResolvedValueOnce({ skipped: false, verdict: 'PASS' });
    const deps = baseDeps();

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase(),
      ...deps,
      retroactivelyScoreVenture,
    });

    expect(result.summary.jobs['venture-pbn-auto-score-sweep'].scored).toBe(1);
    expect(result.summary.jobs['venture-pbn-auto-score-sweep'].errors).toHaveLength(1);
    expect(result.exitCode).toBe(1);
    // jobs 1-4 still completed fully despite job 5's per-venture error
    expect(deps.collectProductHealth).toHaveBeenCalledTimes(2);
    expect(deps.runVentureUptimeProbe).toHaveBeenCalledTimes(1);
  });

  it('adversarial review finding (/ship Deep-tier gate): caps LLM-scoring calls per cycle so an unbounded backlog cannot exceed the driving workflow timeout', async () => {
    const bigPortfolio = Array.from({ length: 25 }, (_, i) => ({ id: `v${String(i).padStart(3, '0')}` }));
    const retroactivelyScoreVenture = vi.fn().mockResolvedValue({ skipped: false, verdict: 'PASS' });

    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabase({ ventures: bigPortfolio }),
      ...baseDeps(),
      retroactivelyScoreVenture,
    });

    expect(retroactivelyScoreVenture).toHaveBeenCalledTimes(20); // MAX_SCORED_PER_CYCLE, not 25
    expect(result.summary.jobs['venture-pbn-auto-score-sweep']).toEqual(
      expect.objectContaining({ attempted: 25, checked: 20, scored: 20, cap_reached: true }),
    );
  });

  it('--dry-run performs zero retroactivelyScoreVenture calls', async () => {
    const retroactivelyScoreVenture = vi.fn();

    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase: makeSupabase(),
      ...baseDeps(),
      retroactivelyScoreVenture,
    });

    expect(retroactivelyScoreVenture).not.toHaveBeenCalled();
    expect(result.action).toBe('dry_run');
  });
});

/**
 * Purpose-built fake, deliberately NOT the shared makeSupabase() above (TESTING F7: the rigid
 * shared fake only speaks `ventures`/`periodic_process_registry`, doesn't filter, and doesn't
 * differentiate the SAME table queried two different ways in one job -- job 6 below queries
 * `ventures` once via the standard select/not/neq/order/range chain (jobs 1-3's shape) and
 * again via select/in/range (the tolerant teardown_disposition read)). `deploymentsByVentureId`
 * stands in for `venture_deployments.metadata.probe` that job 3 already wrote this cycle.
 */
function makeSupabaseForJobs6And7({ ventures, deploymentsByVentureId = {}, teardownDispositionByVentureId = null }) {
  return {
    from(table) {
      if (table === 'ventures') {
        // Fresh per-.from() state: the teardown_disposition-missing-column simulation must apply
        // ONLY to job 6's own select/in/range chain -- NOT to fetchLiveDeploymentVentures' or
        // fetchAllVentureIds' select/not-or-order/range chains, which never call .in().
        let usedIn = false;
        return {
          select() { return this; },
          not() { return this; },
          neq() { return this; },
          in() { usedIn = true; return this; },
          order() { return this; },
          range: async () => {
            if (usedIn && teardownDispositionByVentureId === 'MISSING_COLUMN') {
              return { data: null, error: { message: 'column ventures.teardown_disposition does not exist' } };
            }
            return { data: ventures, error: null };
          },
          then: (resolve) => resolve({ data: ventures, error: null }),
        };
      }
      if (table === 'venture_deployments') {
        let filters = {};
        return {
          select() { return this; },
          eq(col, val) { filters[col] = val; return this; },
          maybeSingle: async () => {
            const probe = deploymentsByVentureId[filters.venture_id];
            return { data: probe ? { metadata: { probe } } : null, error: null };
          },
        };
      }
      if (table === 'periodic_process_registry') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { process_key: 'existing' }, error: null }),
          upsert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

/** Job 6/7 tests don't care about jobs 1-5's own behavior -- silence them uniformly. */
function noopJobs1Through5Deps() {
  return {
    collectProductHealth: vi.fn().mockResolvedValue({ venture_id: 'x' }),
    collectRevenueMetrics: vi.fn().mockResolvedValue({ venture_id: 'x' }),
    runVentureUptimeProbe: vi.fn().mockResolvedValue({ checked: 0, reachable: 0, unreachable: 0, newly_surfaced: 0, errors: [] }),
    ...noopCrackGateDeps(),
    ...noopPbnDeps(),
    stampLastFired: vi.fn().mockResolvedValue(undefined),
  };
}

describe('venture-ops-actuals-sweep Job 6: zombie report (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-2)', () => {
  it('reports a terminal-status, is_demo=false venture with a reachable probe as a zombie, with days_since_kill computed from killed_at', async () => {
    const ventures = [
      { id: 'zombie-1', name: 'MarketLens', status: 'cancelled', deployment_url: 'https://ml.example', killed_at: '2026-07-08T12:45:28.941Z', is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({
        ventures,
        deploymentsByVentureId: { 'zombie-1': { reachable: true, status_code: 200 } },
        teardownDispositionByVentureId: {},
      }),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    const zombies = result.summary.jobs['venture-zombie-report'].zombies;
    expect(zombies).toHaveLength(1);
    expect(zombies[0]).toMatchObject({ id: 'zombie-1', name: 'MarketLens', deployment_url: 'https://ml.example' });
    expect(zombies[0].days_since_kill).toBeGreaterThan(0);
  });

  it('does NOT report a terminal-status venture whose probe is unreachable', async () => {
    const ventures = [
      { id: 'v1', name: 'Dead', status: 'cancelled', deployment_url: 'https://dead.example', killed_at: '2026-07-08T00:00:00Z', is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures, deploymentsByVentureId: { v1: { reachable: false } }, teardownDispositionByVentureId: {} }),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-zombie-report'].zombies).toHaveLength(0);
  });

  it('does NOT report an is_demo=true venture even if terminal and reachable (demo-filtered)', async () => {
    const ventures = [
      { id: 'v1', name: 'DemoFixture', status: 'cancelled', deployment_url: 'https://demo.example', killed_at: null, is_demo: true },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures, deploymentsByVentureId: { v1: { reachable: true } }, teardownDispositionByVentureId: {} }),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-zombie-report'].zombies).toHaveLength(0);
    expect(result.summary.jobs['venture-zombie-report'].checked).toBe(0);
  });

  it('does NOT report a non-terminal (active) venture even if its deployment is reachable', async () => {
    const ventures = [
      { id: 'v1', name: 'Alive', status: 'active', deployment_url: 'https://alive.example', killed_at: null, is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures, deploymentsByVentureId: { v1: { reachable: true } }, teardownDispositionByVentureId: {} }),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-zombie-report'].zombies).toHaveLength(0);
  });

  it('tolerates the teardown_disposition column not existing yet (migration not yet applied): zombie still reported with teardown_disposition=null and a warning logged, no throw', async () => {
    const warnLog = vi.fn();
    const ventures = [
      { id: 'v1', name: 'MarketLens', status: 'cancelled', deployment_url: 'https://ml.example', killed_at: '2026-07-08T00:00:00Z', is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({
        ventures,
        deploymentsByVentureId: { v1: { reachable: true } },
        teardownDispositionByVentureId: 'MISSING_COLUMN',
      }),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn: warnLog, error() {} },
    });

    const zombies = result.summary.jobs['venture-zombie-report'].zombies;
    expect(zombies).toHaveLength(1);
    expect(zombies[0].teardown_disposition).toBeNull();
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('teardown_disposition column not found'));
  });
});

describe('venture-ops-actuals-sweep Job 7: duplicate-name + registry divergence report (SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-4)', () => {
  const FIXTURE_REGISTRY = [
    { id: 'APP002', name: 'test-leo-project', venture_id: 'noise-1' },
    { id: 'APP007', name: 'e2e-verdict-engine-178', venture_id: 'noise-2' },
    { id: 'APP001', name: 'ehg' }, // platform's own repo entry, not a venture
  ];

  it('surfaces a duplicate-name pair when >=2 is_demo=false ventures share a name and are both terminal', async () => {
    const ventures = [
      { id: 'a', name: 'MarketLens', status: 'cancelled', is_demo: false },
      { id: 'b', name: 'MarketLens', status: 'cancelled', is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue(FIXTURE_REGISTRY),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    const report = result.summary.jobs['venture-divergence-report'];
    expect(report.duplicate_names).toHaveLength(1);
    expect(report.duplicate_names[0].name).toBe('MarketLens');
    expect(new Set(report.duplicate_names[0].ventures.map((v) => v.id))).toEqual(new Set(['a', 'b']));
  });

  it('does NOT surface a duplicate-name pair when only one of the two rows is terminal', async () => {
    const ventures = [
      { id: 'a', name: 'MarketLens', status: 'cancelled', is_demo: false },
      { id: 'b', name: 'MarketLens', status: 'active', is_demo: false },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue([]),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-divergence-report'].duplicate_names).toHaveLength(0);
  });

  it('does NOT surface a duplicate-name pair when one of the two is is_demo=true (demo-filtered)', async () => {
    const ventures = [
      { id: 'a', name: 'MarketLens', status: 'cancelled', is_demo: false },
      { id: 'b', name: 'MarketLens', status: 'cancelled', is_demo: true },
    ];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue([]),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-divergence-report'].duplicate_names).toHaveLength(0);
  });

  it('surfaces dead-but-registered: a real (non-fixture) registry entry whose venture_id points at a terminal-status venture', async () => {
    const ventures = [{ id: 'ecbba50e', name: 'MarketLens', status: 'cancelled', is_demo: false }];
    const registry = [...FIXTURE_REGISTRY, { id: 'APP006', name: 'MarketLens', venture_id: 'ecbba50e' }];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue(registry),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    const report = result.summary.jobs['venture-divergence-report'];
    expect(report.dead_but_registered).toHaveLength(1);
    expect(report.dead_but_registered[0]).toMatchObject({ app_id: 'APP006', venture_id: 'ecbba50e' });
  });

  it('surfaces live-but-unregistered (status-based) for an active, is_demo=false venture with no matching registry venture_id -- catches a deployment_url=NULL specimen a URL-join could never find', async () => {
    const ventures = [{ id: 'apex', name: 'ApexNiche AI', status: 'active', is_demo: false, deployment_url: null }];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue(FIXTURE_REGISTRY),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    const report = result.summary.jobs['venture-divergence-report'];
    expect(report.live_unregistered_by_status).toHaveLength(1);
    expect(report.live_unregistered_by_status[0].id).toBe('apex');
  });

  it('surfaces live-but-unregistered (deployment_url-based) as a SEPARATE report key for an active, deployed, is_demo=false venture with no matching registry entry', async () => {
    const ventures = [{ id: 'altify', name: 'AltifyAI', status: 'active', is_demo: false, deployment_url: 'https://altifyai.example' }];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue(FIXTURE_REGISTRY),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    const report = result.summary.jobs['venture-divergence-report'];
    expect(report.live_unregistered_by_deployment_url).toHaveLength(1);
    expect(report.live_unregistered_by_deployment_url[0]).toMatchObject({ id: 'altify', deployment_url: 'https://altifyai.example' });
    // it also (harmlessly) appears in the broader status-based check -- both keys, not a substitute
    expect(report.live_unregistered_by_status.map((v) => v.id)).toContain('altify');
  });

  it('registry noise filter (TESTING F6): a test-/e2e-named or the platform "ehg" registry entry never counts as a real registration', async () => {
    // Same venture_id as one of the fixture (noise) registry rows -- if the filter were absent,
    // this venture would wrongly be excluded from live_unregistered_by_status.
    const ventures = [{ id: 'noise-1', name: 'ShouldStillSurface', status: 'active', is_demo: false }];
    const result = await main(['node', 's', '--once'], {
      supabase: makeSupabaseForJobs6And7({ ventures }),
      loadRegistryApplications: vi.fn().mockReturnValue(FIXTURE_REGISTRY),
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(result.summary.jobs['venture-divergence-report'].live_unregistered_by_status.map((v) => v.id)).toContain('noise-1');
  });

  it('--dry-run performs zero divergence computation (empty report, no registry load)', async () => {
    const loadRegistryApplications = vi.fn();
    const result = await main(['node', 's', '--once', '--dry-run'], {
      supabase: makeSupabaseForJobs6And7({ ventures: [] }),
      loadRegistryApplications,
      ...noopJobs1Through5Deps(),
      logger: { log() {}, warn() {}, error() {} },
    });

    expect(loadRegistryApplications).not.toHaveBeenCalled();
    expect(result.summary.jobs['venture-divergence-report']).toEqual({
      duplicate_names: [], dead_but_registered: [], live_unregistered_by_status: [], live_unregistered_by_deployment_url: [],
    });
  });
});
