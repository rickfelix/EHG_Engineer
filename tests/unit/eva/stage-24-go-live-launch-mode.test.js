// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2/FR-3): launch_mode-aware branch of stage-24-go-live.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeStage24GoLive } from '../../../lib/eva/stage-templates/analysis-steps/stage-24-go-live.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function buildSupabase({ ventureRow, appRow, telemetryRow, tokenBudgetRow, chairmanDecisionRow, previewRow, guardrailUpsertError } = {}) {
  return {
    from: (table) => {
      if (table === 'ventures') {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: ventureRow || null, error: null }) };
        return { select: () => chain };
      }
      if (table === 'applications') {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: appRow || null, error: null }) };
        return { select: () => chain };
      }
      if (table === 'venture_telemetry') {
        // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-5): only reached when appRow.id is set.
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: telemetryRow || null, error: null }) };
        return { select: () => chain };
      }
      if (table === 'venture_artifacts') {
        // SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-3): the sim-label enforcement
        // reads prior launch evidence; these -001 scenarios have none (empty).
        const chain = { eq: () => chain, in: async () => ({ data: [], error: null }) };
        return { select: () => chain };
      }
      // SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001 FR-1/FR-3: the live-mode-verified
      // branch now also reads/writes these tables. Safe defaults (no row found) so
      // the pre-existing -001/-002 test cases above are unaffected; guardrailUpsertError
      // and the *Row params let the new FR-1/FR-3 test cases below exercise the wiring.
      if (table === 'venture_token_budgets') {
        const chain = { eq: () => chain, maybeSingle: async () => ({ data: tokenBudgetRow || null, error: null }) };
        return { select: () => chain };
      }
      if (table === 'chairman_decisions') {
        const chain = { eq: () => chain, is: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: chairmanDecisionRow || null, error: null }) };
        return { select: () => chain };
      }
      if (table === 'venture_guardrail_state') {
        return { upsert: async () => ({ error: guardrailUpsertError || null }) };
      }
      if (table === 'venture_preview_instances') {
        const chain = { eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: previewRow || null, error: null }) };
        return { select: () => chain };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('analyzeStage24GoLive launch_mode branch (SD-LEO-INFRA-LAUNCH-MODE-POLICY-001)', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('no launchedAt: behaves exactly as before (no artifacts, no launch_mode read)', async () => {
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
    });
    expect(result.launch_status).toBe('ready_to_launch');
    expect(result.artifacts).toBeUndefined();
  });

  it('simulated mode (default, no supabase/ventureId): launches + stamps labeled_simulation:true', async () => {
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(result.launch_status).toBe('launched');
    expect(result.launched_at).toBe('2026-07-03T00:00:00.000Z');
    expect(result.artifacts[0].payload.labeled_simulation).toBe(true);
    expect(result.artifacts[0].payload.composable_evidence).toBeUndefined();
  });

  it('simulated mode (explicit venture row): launches + stamps labeled_simulation:true', async () => {
    const supabase = buildSupabase({ ventureRow: { launch_mode: 'simulated' } });
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    expect(result.launch_status).toBe('launched');
    expect(result.artifacts[0].payload.labeled_simulation).toBe(true);
  });

  it('live mode, appRow has no id (no venture_telemetry lookup possible): HOLDs on missing telemetry/gauge data', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      ventureRow: { launch_mode: 'live' },
      appRow: { deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' } },
    });
    // No appRow.id -> collectExternalObservations cannot look up venture_telemetry ->
    // telemetryRowCount/gaugeWriterAlive stay null -> fails closed, even with endpoint+billing OK.
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    expect(result.launch_status).toBe('hold_external_observation_unverified');
    expect(result.launched_at).toBeNull();
    const evidence = result.artifacts[0].payload.composable_evidence;
    expect(evidence.launch_mode).toBe('live');
    expect(evidence.external_observation.verified).toBe(false);
    expect(evidence.external_observation.checks.find((c) => c.name === 'telemetry_rows_arrive').reason).toBe('NO_DATA_SOURCE');
  });

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-5): before this SD, telemetryRowCount was
  // hardcoded null FOREVER, so verifyExternalObservation().verified was structurally unsatisfiable —
  // live-mode launches could never succeed via this path regardless of real venture state. This test
  // proves the fix: a venture with real, fresh venture_telemetry data now genuinely launches.
  it('live mode, real fresh venture_telemetry + endpoint/billing OK: launches (FR-5 fix — previously permanently unreachable)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      ventureRow: { launch_mode: 'live' },
      appRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: null },
      telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
    });
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    expect(result.launch_status).toBe('launched');
    expect(result.launched_at).toBe('2026-07-03T00:00:00.000Z');
    const evidence = result.artifacts[0].payload.composable_evidence;
    expect(evidence.external_observation.verified).toBe(true);
  });

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A (FR-5): a venture with historical data whose
  // gauge is now STALE (pull is older than its declared cadence) must still HOLD — a launch cannot
  // proceed on a gauge writer that once worked but is no longer verifiably alive.
  it('live mode, stale gauge (writer existed but exceeded cadence): HOLDs, never launched', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      ventureRow: { launch_mode: 'live' },
      appRow: { id: 'app-2', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: 1 },
      telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
    });
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    expect(result.launch_status).toBe('hold_external_observation_unverified');
    expect(result.launched_at).toBeNull();
    const evidence = result.artifacts[0].payload.composable_evidence;
    expect(evidence.external_observation.checks.find((c) => c.name === 'gauge_writer_alive').verified).toBe(false);
  });

  it('live mode, no external evidence at all: HOLD with per-check reasons surfaced, never launched', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('unreachable'));
    const supabase = buildSupabase({ ventureRow: { launch_mode: 'live' }, appRow: null });
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    expect(result.launch_status).toBe('hold_external_observation_unverified');
    expect(result.launched_at).toBeNull();
    const checks = result.artifacts[0].payload.composable_evidence.external_observation.checks;
    expect(checks.every((c) => !c.verified)).toBe(true);
  });

  // FR-3: pin the composable_evidence contract shape so a future SD formalizing
  // G3/spend-guardrail can rely on it without this SD's artifact silently changing shape.
  it('FR-3 contract: live-mode artifact always exposes composable_evidence{launch_mode, external_observation, verdict}', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({ ventureRow: { launch_mode: 'live' }, appRow: { deployment_url: 'https://example.com', metadata: {} } });
    const result = await analyzeStage24GoLive({
      stage23Data: { verdict: 'PASS' },
      stage22Data: { channels: [] },
      ventureName: 'TestVenture',
      logger: silentLogger,
      launchedAt: '2026-07-03T00:00:00.000Z',
      supabase,
      ventureId: 'venture-1',
    });
    const evidence = result.artifacts[0].payload.composable_evidence;
    expect(Object.keys(evidence).sort()).toEqual(['external_observation', 'launch_mode', 'verdict']);
    expect(evidence.verdict).toBe('PASS');
    expect(typeof evidence.external_observation.verified).toBe('boolean');
    expect(Array.isArray(evidence.external_observation.checks)).toBe(true);
  });

  // SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001 FR-1/FR-3: promote()/publish() and
  // evaluateGuardrails()/persistGuardrailDecisions() had ZERO production callers.
  // These pin that the ONLY branch reaching a real external-verification launch
  // (never the simulated branch) wires both, and that a simulated go-live never
  // invokes either (avoiding the "simulated-mode leakage" risk flagged at LEAD).
  describe('SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001 FR-1/FR-3 wiring', () => {
    function liveVerifiedParams(supabase) {
      return {
        stage23Data: { verdict: 'PASS' },
        stage22Data: { channels: [] },
        ventureName: 'TestVenture',
        logger: silentLogger,
        launchedAt: '2026-07-03T00:00:00.000Z',
        supabase,
        ventureId: 'venture-1',
      };
    }

    it('simulated-mode launch NEVER invokes the guardrails/deploy wiring (no result.guardrails_persisted/promote_status)', async () => {
      const supabase = buildSupabase({ ventureRow: { launch_mode: 'simulated' } });
      const result = await analyzeStage24GoLive(liveVerifiedParams(supabase));
      expect(result.launch_status).toBe('launched');
      expect(result.artifacts[0].payload.labeled_simulation).toBe(true);
      expect(result.guardrails_persisted).toBeUndefined();
      expect(result.promote_status).toBeUndefined();
    });

    it('live-verified launch persists real guardrail decisions (fail-closed on unmeasured inputs, never a fabricated pass)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });
      const supabase = buildSupabase({
        ventureRow: { launch_mode: 'live' },
        appRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: null },
        telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
        tokenBudgetRow: { budget_allocated: 250000, budget_remaining: 200000 },
        chairmanDecisionRow: { decision: 'proceed' },
      });
      const result = await analyzeStage24GoLive(liveVerifiedParams(supabase));
      expect(result.launch_status).toBe('launched');
      expect(result.guardrails_persisted).toBe(true);
      expect(result.guardrails_persist_error).toBeUndefined();
    });

    it('live-verified launch: a persist error is surfaced, never silently swallowed (fail-soft on the go-live result, loud on the field)', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });
      const supabase = buildSupabase({
        ventureRow: { launch_mode: 'live' },
        appRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: null },
        telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
        guardrailUpsertError: { message: 'venture_guardrail_state unavailable' },
      });
      const result = await analyzeStage24GoLive(liveVerifiedParams(supabase));
      expect(result.launch_status).toBe('launched'); // the launch decision itself is not blocked by a wiring failure
      expect(result.guardrails_persisted).toBe(false);
      expect(result.guardrails_persist_error).toBe('venture_guardrail_state unavailable');
    });

    it('live-verified launch with no venture_preview_instances row: skips promote() (never fabricates a sha), reports skipped_no_verified_sha', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });
      const supabase = buildSupabase({
        ventureRow: { launch_mode: 'live' },
        appRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: null },
        telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
      });
      const result = await analyzeStage24GoLive(liveVerifiedParams(supabase));
      expect(result.launch_status).toBe('launched');
      expect(result.promote_status).toBe('skipped_no_verified_sha');
    });

    it('live-verified launch with a verified preview sha: calls promote() in PLAN mode only (never execute:true) -- writes a planned venture_deployments row, no real deploy', async () => {
      global.fetch = vi.fn().mockResolvedValue({ status: 200 });
      let insertedRow = null;
      const supabase = buildSupabase({
        ventureRow: {
          launch_mode: 'live',
          stack_descriptor: { db_provider: 'neon', deployment_target: 'cloud-run', connection: { provider: 'neon', secret_ref: 'ref-1' } },
        },
        appRow: { id: 'app-1', deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' }, metrics_cadence_hours: null },
        telemetryRow: { kpis: { signups: 3 }, pulled_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), ingest_status: 'ok' },
        previewRow: { sha: 'abc1234' },
      });
      // promote() also queries 'ventures' (already handled) and inserts into 'venture_deployments' --
      // wrap the base mock's `from` to add that table without duplicating the whole helper.
      const baseFrom = supabase.from.bind(supabase);
      supabase.from = (table) => {
        if (table === 'venture_deployments') {
          return {
            insert: (row) => {
              insertedRow = row;
              return { select: () => ({ maybeSingle: async () => ({ data: { id: 'dep-1' }, error: null }) }) };
            },
          };
        }
        return baseFrom(table);
      };
      const result = await analyzeStage24GoLive(liveVerifiedParams(supabase));
      expect(result.launch_status).toBe('launched');
      expect(result.promote_status).toBe('planned'); // plan-mode: no deps.execute passed -- this SD never bypasses the 001-A chairman gate
      expect(insertedRow).toMatchObject({ venture_id: 'venture-1', sha: 'abc1234', status: 'planned' });
    });
  });
});
