/**
 * SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 (FR-3, COND-1, COND-2)
 *
 * Tests the ACTIVATION wiring added by this SD: the stage-18 TEMPLATE.onBeforeAnalysis
 * hook that threads the surface-tagged Stage 15 wireframe_screens artifact into
 * analyzeStage18MarketingCopy as `stage15WireframeData`. Child E shipped the consumer
 * (analyzeStage18MarketingCopy injection) + its own tests; this file covers the
 * producer-side seam that makes the feature live at runtime, plus a strict
 * flag-off byte-identical parity assertion.
 *
 * All deterministic/offline — no LLM, no network, no real DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock LLM + parse-json (mirror stage-18-surface-aware.test.js) ────
const mockComplete = vi.fn();
vi.mock('../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({ complete: mockComplete })),
}));
vi.mock('../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((response) => (response && typeof response === 'object' && response._parsed ? response._parsed : response)),
  extractUsage: vi.fn(() => ({ input_tokens: 10, output_tokens: 20 })),
}));

import TEMPLATE from '../../lib/eva/stage-templates/stage-18.js';
import { analyzeStage18MarketingCopy, resolveMarketingWireframe } from '../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js';
import { classifySurface } from '../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };

const SURFACE_TAGGED_SCREENS = [
  { screen_id: 's1', screen_name: 'Landing Page', surface: 'marketing', key_components: ['Hero', 'CTA'], ascii_layout: ['+--+', '|  |', '+--+'] },
  { screen_id: 's2', screen_name: 'Sign Up', surface: 'auth' },
  { screen_id: 's3', screen_name: 'Dashboard', surface: 'app' },
];

/**
 * Minimal chainable fake Supabase that resolves the venture_artifacts query
 * the onBeforeAnalysis hook builds: .from().select().eq().eq().eq().order().limit().maybeSingle()
 */
function makeFakeSupabase(maybeSingleResult, { throwOnMaybeSingle = false } = {}) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      if (throwOnMaybeSingle) throw new Error('simulated DB error');
      return maybeSingleResult;
    },
  };
  return { from: vi.fn(() => builder), _builder: builder };
}

// ════════════════════════════════════════════════════════════════════
// onBeforeAnalysis hook — the FR-3 activation seam
// ════════════════════════════════════════════════════════════════════
describe('stage-18 TEMPLATE.onBeforeAnalysis (FR-3 activation wiring)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is defined as a function on the stage-18 template', () => {
    expect(typeof TEMPLATE.onBeforeAnalysis).toBe('function');
  });

  it('returns {} (no injection) when the flag is OFF — never touches the DB', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
    const supabase = makeFakeSupabase({ data: { artifact_data: { screens: SURFACE_TAGGED_SCREENS } } });
    const ctx = await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123');
    expect(ctx).toEqual({});
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns { stage15WireframeData: { screens } } when flag ON and the artifact exists', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    const supabase = makeFakeSupabase({ data: { artifact_data: { screens: SURFACE_TAGGED_SCREENS } } });
    const ctx = await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123');
    expect(ctx).toHaveProperty('stage15WireframeData');
    expect(ctx.stage15WireframeData.screens).toHaveLength(3);
    expect(ctx.stage15WireframeData.screens[0].surface).toBe('marketing');
    expect(supabase.from).toHaveBeenCalledWith('venture_artifacts');
  });

  it('returns {} (graceful) when flag ON but no wireframe_screens artifact exists', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    const supabase = makeFakeSupabase({ data: null });
    expect(await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123')).toEqual({});
  });

  it('returns {} (graceful) when flag ON but the artifact has an empty screens array', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    const supabase = makeFakeSupabase({ data: { artifact_data: { screens: [] } } });
    expect(await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123')).toEqual({});
  });

  it('returns {} (non-fatal) when the DB query throws', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    const supabase = makeFakeSupabase(null, { throwOnMaybeSingle: true });
    expect(await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123')).toEqual({});
  });

  it('returns {} when supabase or ventureId is missing (flag ON)', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    expect(await TEMPLATE.onBeforeAnalysis(null, 'venture-123')).toEqual({});
    const supabase = makeFakeSupabase({ data: { artifact_data: { screens: SURFACE_TAGGED_SCREENS } } });
    expect(await TEMPLATE.onBeforeAnalysis(supabase, null)).toEqual({});
  });

  it('end-to-end: hook output fed to analyzeStage18MarketingCopy injects the marketing wireframe (flag ON)', async () => {
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'true');
    mockComplete.mockReset();
    mockComplete.mockResolvedValue({ _parsed: { tagline: { text: 'x', persona_target: 'p' } } });
    const supabase = makeFakeSupabase({ data: { artifact_data: { screens: SURFACE_TAGGED_SCREENS } } });
    const hookCtx = await TEMPLATE.onBeforeAnalysis(supabase, 'venture-123');
    const result = await analyzeStage18MarketingCopy({ ventureName: 'V', logger: silentLogger, ...hookCtx });
    expect(result.metadata.marketing_wireframe_injected).toBe(true);
    const [, userPrompt] = mockComplete.mock.calls[0];
    expect(userPrompt).toContain('Stage 15 Marketing Wireframe');
  });
});

// ════════════════════════════════════════════════════════════════════
// COND-2 — strict flag-off byte-identical parity
// ════════════════════════════════════════════════════════════════════
describe('flag-off byte-identical parity (COND-2)', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue({ _parsed: { tagline: { text: 'x', persona_target: 'p' } } });
    vi.stubEnv('EVA_SURFACE_AWARE_ENABLED', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('produces an IDENTICAL prompt with vs without stage15WireframeData when the flag is off', async () => {
    await analyzeStage18MarketingCopy({ ventureName: 'V', logger: silentLogger, stage15WireframeData: { screens: SURFACE_TAGGED_SCREENS } });
    const withData = mockComplete.mock.calls[0][1];

    mockComplete.mockClear();
    await analyzeStage18MarketingCopy({ ventureName: 'V', logger: silentLogger });
    const withoutData = mockComplete.mock.calls[0][1];

    expect(withData).toBe(withoutData); // byte-identical baseline prompt
  });
});

// ════════════════════════════════════════════════════════════════════
// classifySurface — stored screen_name shape (FR-fix for untagged ventures)
// ════════════════════════════════════════════════════════════════════
describe('classifySurface — canonical stored screen_name shape', () => {
  it('classifies from screen_name when name is absent (venture_artifacts shape)', () => {
    expect(classifySurface({ screen_name: 'Landing Page' }).surface).toBe('marketing');
    expect(classifySurface({ screen_name: 'Signup/Registration' }).surface).toBe('auth');
    expect(classifySurface({ screen_name: 'Dashboard' }).surface).toBe('app');
  });

  it('still prefers name over screen_name when both are present', () => {
    expect(classifySurface({ name: 'Pricing', screen_name: 'Dashboard' }).surface).toBe('marketing');
  });

  it('falls back to title when name and screen_name are absent', () => {
    expect(classifySurface({ title: 'Home Page' }).surface).toBe('marketing');
  });

  it('resolveMarketingWireframe resolves the marketing screen from untagged screen_name screens (Cron Canary shape)', () => {
    // Mirrors the live Cron Canary venture_artifacts wireframe_screens artifact:
    // untagged (no surface field), screen_name-shaped screens.
    const screens = [
      { screen_id: 's1', screen_name: 'Landing Page' },
      { screen_id: 's2', screen_name: 'Signup/Registration' },
      { screen_id: 's3', screen_name: 'Dashboard' },
      { screen_id: 's4', screen_name: 'Monitors' },
    ];
    const mw = resolveMarketingWireframe({ screens });
    expect(mw).not.toBeNull();
    expect(mw.screen_name).toBe('Landing Page');
  });

  it('resolveMarketingWireframe returns null when no screen_name resolves to marketing', () => {
    const screens = [
      { screen_id: 's1', screen_name: 'Dashboard' },
      { screen_id: 's2', screen_name: 'Settings' },
      { screen_id: 's3', screen_name: 'Monitors' },
    ];
    expect(resolveMarketingWireframe({ screens })).toBeNull();
  });
});
