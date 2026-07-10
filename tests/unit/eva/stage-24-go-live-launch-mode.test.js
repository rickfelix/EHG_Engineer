// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2/FR-3): launch_mode-aware branch of stage-24-go-live.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeStage24GoLive } from '../../../lib/eva/stage-templates/analysis-steps/stage-24-go-live.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function buildSupabase({ ventureRow, appRow, telemetryRow } = {}) {
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
});
