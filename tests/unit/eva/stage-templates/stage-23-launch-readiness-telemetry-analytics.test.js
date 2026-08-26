/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C (FR-4)
 *
 * Unit coverage for the 'analytics' checklist case wired into
 * analyzeStage23LaunchReadiness: the entry's detail text must be data-driven
 * (via verifyCapabilityWired -> fn_venture_usage_window_summary), while the
 * category stays ADVISORY/non-blocking (verdict logic unaffected).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeStage23LaunchReadiness,
  checkTelemetryAnalyticsWired,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

const upstreamHappyPath = {
  stage20Data: { verdict: 'PASS' },
  stage21Data: { total_assets: 5 },
  stage22Data: { active_channels: 3 },
};
const allUpstreamArtifacts = ['code_quality_report', 'visual_device_screenshots', 'distribution_channel_config'];
const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ presentTypes = [], legalDocsPresent = true, rpcResult } = {}) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: [{ event_count: 0, active_users: 0 }], error: null }),
    from(table) {
      if (table === 'venture_artifacts') {
        return { select() { return { eq() { return this; }, in() {
          return Promise.resolve({ data: presentTypes.map(t => ({ lifecycle_stage: 23, artifact_type: t, is_current: true })), error: null });
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
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C FR-4: analytics checklist case', () => {
  it("analytics entry's detail differs between a venture with real usage events and one without", async () => {
    const supabaseWithEvents = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      rpcResult: { data: [{ event_count: 5, active_users: 3 }], error: null },
    });
    const supabaseWithoutEvents = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      rpcResult: { data: [{ event_count: 0, active_users: 0 }], error: null },
    });

    const withEvents = await analyzeStage23LaunchReadiness({
      ...upstreamHappyPath, ventureId: 'venture-with-events', supabase: supabaseWithEvents, logger: silentLogger,
    });
    const withoutEvents = await analyzeStage23LaunchReadiness({
      ...upstreamHappyPath, ventureId: 'venture-without-events', supabase: supabaseWithoutEvents, logger: silentLogger,
    });

    const analyticsWith = withEvents.checklist.find(c => c.category === 'analytics');
    const analyticsWithout = withoutEvents.checklist.find(c => c.category === 'analytics');

    expect(analyticsWith.detail).not.toBe(analyticsWithout.detail);
    expect(analyticsWith.detail).toMatch(/wired/i);
    expect(analyticsWithout.detail).toMatch(/not yet wired/i);
  });

  it('verdict is unaffected by real vs. absent usage-event data (analytics stays advisory/PASS-eligible)', async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      legalDocsPresent: true,
      rpcResult: { data: [{ event_count: 0, active_users: 0 }], error: null },
    });
    const result = await analyzeStage23LaunchReadiness({
      ...upstreamHappyPath, ventureId: 'venture-verdict-check', supabase, logger: silentLogger,
    });
    const analytics = result.checklist.find(c => c.category === 'analytics');
    expect(analytics.mode).toBe('ADVISORY');
    expect(result.verdict).toBe('READY');
  });

  it('degrades to the generic advisory message (never throws) when the RPC call errors', async () => {
    const supabase = buildMockSupabase({
      presentTypes: allUpstreamArtifacts,
      rpcResult: { data: null, error: { message: 'timeout' } },
    });
    const result = await analyzeStage23LaunchReadiness({
      ...upstreamHappyPath, ventureId: 'venture-rpc-error', supabase, logger: silentLogger,
    });
    const analytics = result.checklist.find(c => c.category === 'analytics');
    expect(analytics.status).toBe('advisory');
    expect(analytics.detail).toMatch(/not yet wired/i);
  });

  it('checkTelemetryAnalyticsWired returns null (falls back to generic message) when supabase/ventureId are missing', async () => {
    expect(await checkTelemetryAnalyticsWired({ supabase: null, ventureId: 'x', logger: silentLogger })).toBeNull();
    expect(await checkTelemetryAnalyticsWired({ supabase: {}, ventureId: null, logger: silentLogger })).toBeNull();
  });
});
