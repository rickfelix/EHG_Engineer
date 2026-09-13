/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.3, FR-4)
 *
 * Unit coverage for the 'monitoring' checklist case wired into
 * analyzeStage23LaunchReadiness: the entry's detail text must be data-driven
 * (via checkVentureUptimeWired -> lib/ops/venture-uptime-probe.js's
 * getLatestProbeStatus), while the category stays ADVISORY/non-blocking
 * (verdict logic unaffected). Mirrors
 * stage-23-launch-readiness-telemetry-analytics.test.js's fixture pattern for
 * the sibling 'analytics' case.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeStage23LaunchReadiness,
  checkVentureUptimeWired,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

const passingArtifactData = {
  code_quality_report: { verdict: 'PASS' },
  visual_device_screenshots: { total_screenshots: 5 },
  distribution_channel_config: { deployed: true, status: 'deployed' },
};
const allUpstreamArtifacts = ['code_quality_report', 'visual_device_screenshots', 'distribution_channel_config'];
const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ presentTypes = [], artifactData = {}, legalDocsPresent = true, deploymentRows = [] } = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: [{ event_count: 0 }], error: null }),
    from(table) {
      if (table === 'venture_artifacts') {
        return { select() { return { eq() { return this; }, in() {
          return { limit() {
            return Promise.resolve({
              data: presentTypes.map(t => ({ lifecycle_stage: 23, artifact_type: t, is_current: true, artifact_data: artifactData[t] ?? null })),
              error: null,
            });
          } };
        } }; } };
      }
      if (table === 'venture_legal_overrides') {
        return { select() { return { eq() { return this; }, not() {
          return Promise.resolve({
            data: legalDocsPresent
              ? [{ generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } },
                 { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } }]
              : [],
            error: null,
          });
        } }; } };
      }
      if (table === 'eva_orchestration_events') {
        return { insert() { return Promise.resolve({ data: null, error: null }); } };
      }
      if (table === 'venture_deployments') {
        return { select() { return this; }, eq() { return this; }, limit() { return Promise.resolve({ data: deploymentRows, error: null }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F FR-4: monitoring checklist case', () => {
  it("monitoring entry's detail cites status_code/last_checked_at when a reachable probe row exists", async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      artifactData: passingArtifactData,
      deploymentRows: [{ url: 'https://app.example.com', metadata: { probe: { reachable: true, status_code: 200, last_checked_at: '2026-09-13T10:00:00Z', consecutive_failures: 0, surfaced: false, last_error: null } } }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-reachable', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.status).toBe('advisory');
    expect(monitoring.mode).toBe('ADVISORY');
    expect(monitoring.detail).toMatch(/reachable/i);
    expect(monitoring.detail).toContain('200');
    expect(monitoring.detail).toContain('2026-09-13T10:00:00Z');
  });

  it("monitoring entry's detail reflects an unreachable/surfaced probe row honestly", async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      artifactData: passingArtifactData,
      deploymentRows: [{ url: 'https://app.example.com', metadata: { probe: { reachable: false, status_code: null, last_checked_at: '2026-09-13T09:00:00Z', consecutive_failures: 3, surfaced: true, last_error: 'ECONNREFUSED' } } }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-unreachable', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.status).toBe('advisory');
    expect(monitoring.detail).toMatch(/unreachable/i);
    expect(monitoring.detail).toContain('ECONNREFUSED');
    expect(monitoring.detail).toMatch(/surfaced/i);
  });

  it('falls back to the honest no-data advisory message when the venture has no probe data yet', async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      artifactData: passingArtifactData,
      deploymentRows: [],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-no-probe', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.status).toBe('advisory');
    expect(monitoring.detail).toBe('No automated producer; chairman attestation suffices');
    // Must not fabricate a false-positive reachable claim from absent data.
    expect(monitoring.detail).not.toMatch(/reachable/i);
  });

  it('verdict is unaffected by monitoring probe state (stays advisory/PASS-eligible, never blocks kill gate)', async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      artifactData: passingArtifactData,
      legalDocsPresent: true,
      deploymentRows: [{ url: 'https://app.example.com', metadata: { probe: { reachable: false, status_code: 503, last_checked_at: '2026-09-13T09:00:00Z', consecutive_failures: 5, surfaced: true, last_error: 'service down' } } }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-verdict-check', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.mode).toBe('ADVISORY');
    expect(result.verdict).toBe('READY');
  });

  it('does not regress the analytics category when monitoring is added alongside it', async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      artifactData: passingArtifactData,
      deploymentRows: [{ url: 'https://app.example.com', metadata: { probe: { reachable: true, status_code: 200, last_checked_at: '2026-09-13T10:00:00Z' } } }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-both', supabase, logger: silentLogger });
    const analytics = result.checklist.find(c => c.category === 'analytics');
    expect(analytics.status).toBe('advisory');
    expect(analytics.detail).toMatch(/not yet wired/i);
  });

  it('degrades to the generic advisory message (never throws) when the venture_deployments read errors', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: [{ event_count: 0 }], error: null }),
      from(table) {
        if (table === 'venture_artifacts') {
          return { select() { return { eq() { return this; }, in() {
            return { limit() { return Promise.resolve({ data: allUpstreamArtifacts.map(t => ({ lifecycle_stage: 23, artifact_type: t, is_current: true, artifact_data: passingArtifactData[t] ?? null })), error: null }); } };
          } }; } };
        }
        if (table === 'venture_legal_overrides') {
          return { select() { return { eq() { return this; }, not() { return Promise.resolve({ data: [{ generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } }, { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } }], error: null }); } }; } };
        }
        if (table === 'eva_orchestration_events') return { insert() { return Promise.resolve({ data: null, error: null }); } };
        if (table === 'venture_deployments') return { select() { return this; }, eq() { return this; }, limit() { return Promise.resolve({ data: null, error: { message: 'timeout' } }); } };
        throw new Error(`unexpected table ${table}`);
      },
    };
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-rpc-error', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.status).toBe('advisory');
    expect(monitoring.detail).toBe('No automated producer; chairman attestation suffices');
  });

  it('degrades to the generic advisory message (never throws) when venture_deployments is entirely unmocked (legacy fixture parity)', async () => {
    // Mirrors the OTHER three pre-existing stage-23 unit suites, whose shared buildMockSupabase
    // fixture throws on any unrecognized table -- this proves checkVentureUptimeWired's
    // try/catch degrades gracefully against exactly that shape, not just a controlled error.
    const supabase = buildMockSupabase({ presentTypes: allUpstreamArtifacts, artifactData: passingArtifactData });
    // Force a throwing venture_deployments branch to simulate the legacy no-branch shape.
    const originalFrom = supabase.from;
    supabase.from = (table) => {
      if (table === 'venture_deployments') throw new Error('unexpected table venture_deployments');
      return originalFrom(table);
    };
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'venture-legacy-fixture', supabase, logger: silentLogger });
    const monitoring = result.checklist.find(c => c.category === 'monitoring');
    expect(monitoring.status).toBe('advisory');
    expect(monitoring.detail).toBe('No automated producer; chairman attestation suffices');
  });

  it('checkVentureUptimeWired returns null (falls back to generic message) when supabase/ventureId are missing', async () => {
    expect(await checkVentureUptimeWired({ supabase: null, ventureId: 'x', logger: silentLogger })).toBeNull();
    expect(await checkVentureUptimeWired({ supabase: {}, ventureId: null, logger: silentLogger })).toBeNull();
  });
});
