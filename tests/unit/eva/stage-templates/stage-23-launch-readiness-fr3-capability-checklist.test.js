/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3.
 *
 * verifyCapabilityWired's per-capability result as 7 distinct REQUIRED checklist
 * rows, gated behind LEO_S24_CAPABILITY_CHECKLIST_REQUIRED (default OFF -- see the
 * flag's own comment in stage-23-launch-readiness.js: unflagged, every in-flight
 * venture's checklist/verdict regressed READY->HOLD, measured against the existing
 * stage-23-growth-categories.test.js fixtures during EXEC).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeStage23LaunchReadiness,
  CAPABILITY_CATEGORIES,
  CAPABILITY_CHECKLIST_FLAG_KEY,
} from '../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

const passingArtifactData = {
  code_quality_report: { verdict: 'PASS' },
  visual_device_screenshots: { total_screenshots: 5 },
  distribution_channel_config: { deployed: true, status: 'deployed' },
};
const allUpstreamArtifacts = ['code_quality_report', 'visual_device_screenshots', 'distribution_channel_config'];

function makeQuery(result) {
  const q = {};
  for (const m of ['select', 'eq', 'in', 'not', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve) => resolve(result);
  return q;
}

function buildMockSupabase({
  flagEnabled = false, wiredCapabilityIds = [], overrideRows = [], rpcEventCount = 0,
} = {}) {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: [{ event_count: rpcEventCount }], error: null })),
    from: vi.fn((table) => {
      if (table === 'leo_feature_flags') {
        const q = {};
        let requestedKey = null;
        for (const m of ['select', 'in', 'not', 'update', 'insert', 'order', 'limit', 'maybeSingle', 'single']) {
          q[m] = vi.fn(() => q);
        }
        q.eq = vi.fn((col, value) => { if (col === 'flag_key') requestedKey = value; return q; });
        q.then = (resolve) => resolve({ data: { is_enabled: requestedKey === CAPABILITY_CHECKLIST_FLAG_KEY ? flagEnabled : false }, error: null });
        return q;
      }
      if (table === 'venture_artifacts') {
        return makeQuery({
          data: allUpstreamArtifacts.map((t) => ({ lifecycle_stage: 23, artifact_type: t, is_current: true, artifact_data: passingArtifactData[t] })),
          error: null,
        });
      }
      if (table === 'venture_legal_overrides') {
        return makeQuery({
          data: [
            { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'terms_of_service' } },
            { generated_at: '2026-07-13T00:00:00Z', legal_templates: { template_type: 'privacy_policy' } },
          ],
          error: null,
        });
      }
      if (table === 'feedback') {
        // 'feedback-widget' is the only WIRED_CAPABILITY_FEEDBACK_TYPES-backed capability
        // this fixture ever declares wired, and only when the caller asked for it.
        const q = makeQuery({ data: wiredCapabilityIds.includes('feedback-widget') ? [{ id: 'fb-1' }] : [], error: null });
        return q;
      }
      if (table === 'venture_capability_overrides') {
        return makeQuery({ data: overrideRows, error: null });
      }
      if (table === 'eva_orchestration_events') {
        return { insert: () => Promise.resolve({ data: null, error: null }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe('FR-3 capability checklist -- flag OFF (default)', () => {
  it('does not add any capability: category to the checklist', async () => {
    const supabase = buildMockSupabase({ flagEnabled: false });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const capabilityEntries = result.checklist.filter((c) => c.category.startsWith('capability:'));
    expect(capabilityEntries).toHaveLength(0);
  });

  it('is byte-identical to the pre-FR-3 baseline verdict (READY) for an otherwise-passing venture', async () => {
    const supabase = buildMockSupabase({ flagEnabled: false });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    expect(result.verdict).toBe('READY');
  });
});

describe('FR-3 capability checklist -- flag ON', () => {
  it('adds all 7 capability: rows, each REQUIRED', async () => {
    const supabase = buildMockSupabase({ flagEnabled: true });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const capabilityEntries = result.checklist.filter((c) => c.category.startsWith('capability:'));
    expect(capabilityEntries).toHaveLength(7);
    expect(capabilityEntries.every((c) => c.mode === 'REQUIRED')).toBe(true);
    expect(capabilityEntries.map((c) => c.category).sort()).toEqual(CAPABILITY_CATEGORIES.slice().sort());
  });

  it('AltifyAI-shaped: only error-capture-middleware wired, verdict HOLD, no override on a signal-backed capability', async () => {
    const supabase = buildMockSupabase({ flagEnabled: true, wiredCapabilityIds: [] });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'AltifyAI', supabase, logger: silentLogger });
    const feedbackWidget = result.checklist.find((c) => c.category === 'capability:feedback-widget');
    expect(feedbackWidget.status).toBe('fail');
    expect(result.verdict).toBe('HOLD');
  });

  it('a signal-backed capability (feedback-widget) reads pass only via a genuine wired:true, never via override', async () => {
    const supabase = buildMockSupabase({
      flagEnabled: true,
      overrideRows: [{ capability_id: 'feedback-widget', override_reason: 'trying to game the gate' }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const feedbackWidget = result.checklist.find((c) => c.category === 'capability:feedback-widget');
    expect(feedbackWidget.status).toBe('fail');
    expect(feedbackWidget.detail).toMatch(/no override permitted/);
  });

  it('feedback-widget reads pass when genuinely wired', async () => {
    const supabase = buildMockSupabase({ flagEnabled: true, wiredCapabilityIds: ['feedback-widget'] });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const feedbackWidget = result.checklist.find((c) => c.category === 'capability:feedback-widget');
    expect(feedbackWidget.status).toBe('pass');
  });

  it('a no-signal capability (cost-instrumentation) reads pass via a recorded override', async () => {
    const supabase = buildMockSupabase({
      flagEnabled: true,
      overrideRows: [{ capability_id: 'cost-instrumentation', override_reason: 'no cost data available pre-revenue' }],
    });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const costInstr = result.checklist.find((c) => c.category === 'capability:cost-instrumentation');
    expect(costInstr.status).toBe('pass');
    expect(costInstr.detail).toContain('no cost data available pre-revenue');
  });

  it('a no-signal capability with no override reads fail (never silently advisory)', async () => {
    const supabase = buildMockSupabase({ flagEnabled: true, overrideRows: [] });
    const result = await analyzeStage23LaunchReadiness({ ventureId: 'v1', ventureName: 'Test', supabase, logger: silentLogger });
    const costInstr = result.checklist.find((c) => c.category === 'capability:cost-instrumentation');
    expect(costInstr.status).toBe('fail');
    expect(costInstr.detail).toMatch(/no override recorded/);
  });
});
