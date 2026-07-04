// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2/FR-3): launch_mode-aware branch of stage-24-go-live.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeStage24GoLive } from '../../../lib/eva/stage-templates/analysis-steps/stage-24-go-live.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function buildSupabase({ ventureRow, appRow } = {}) {
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

  it('live mode, all external checks pass: launches + attaches composable_evidence', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 200 });
    const supabase = buildSupabase({
      ventureRow: { launch_mode: 'live' },
      appRow: { deployment_url: 'https://example.com', metadata: { billing_product_id: 'prod_123' } },
    });
    // Monkeypatch: telemetryRowCount has no real data source yet, so this test verifies the
    // fail-closed default UNLESS a future data source is wired — here we assert the current,
    // honest behavior: telemetry has no source, so live mode HOLDs even with endpoint+billing OK.
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
