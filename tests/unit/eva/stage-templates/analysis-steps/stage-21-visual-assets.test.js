/**
 * Unit tests for Stage 21 Analysis Step — Visual Assets
 * SD: SD-LEO-FEAT-STAGE-VISUAL-ASSETS-001
 *
 * Covers:
 *   FR-1 split + dual-emit (flag OFF emits 3 incl. legacy launch_test_plan,
 *        flag ON emits 2 canonical only)
 *   FR-4 entry-precondition refusal + skip marker artifact (3 skip_reasons via it.each)
 *   Platform coverage validation (validatePlatformCoverage)
 *   Import canary — guards against vi.mock-masks-broken-import per
 *     reference_vi_mock_masks_broken_import memory
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client BEFORE importing the module under test.
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import {
  analyzeStage21VisualAssets,
  validateEntryPreconditions,
  validatePlatformCoverage,
  splitArtifacts,
  DEVICE_FRAMES,
  SOCIAL_SIZES,
  REQUIRED_UPSTREAM,
  FEATURE_FLAG_KEY,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

// Helper — full happy-path LLM response (canonical 2 device + 4 social).
function makeLLMResponse(overrides = {}) {
  const device_screenshots = overrides.device_screenshots || [
    { device: 'iphone_15', scene: 'home', alt_text: 'app on iphone', key_features_visible: ['nav'] },
    { device: 'macbook_pro', scene: 'dashboard', alt_text: 'app on mac', key_features_visible: ['chart'] },
  ];
  const social_graphics = overrides.social_graphics || [
    { platform: 'instagram', format: 'square', width: 1080, height: 1080, headline: 'h', description: 'd', brand_colors_used: true },
    { platform: 'instagram', format: 'portrait', width: 1080, height: 1350, headline: 'h', description: 'd', brand_colors_used: true },
    { platform: 'twitter', format: 'banner', width: 1500, height: 500, headline: 'h', description: 'd', brand_colors_used: true },
    { platform: 'facebook', format: 'cover', width: 820, height: 312, headline: 'h', description: 'd', brand_colors_used: true },
  ];
  const video_storyboard = overrides.video_storyboard || [
    { scene_number: 1, duration_seconds: 5, description: 'hook', shot_type: 'wide' },
  ];
  return JSON.stringify({ device_screenshots, social_graphics, video_storyboard });
}

function setupMockLLM(response) {
  const mockComplete = vi.fn().mockResolvedValue(response);
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

// Factory — fake supabase that records all writes.
function makeFakeSupabase({ flagEnabled = false } = {}) {
  const inserted = [];
  const updated = [];
  const sb = {
    from(table) {
      const ctx = { table, filters: {} };
      const builder = {
        select() { return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        maybeSingle() {
          if (table === 'leo_feature_flags' && ctx.filters.flag_key === FEATURE_FLAG_KEY) {
            return Promise.resolve({ data: { is_enabled: flagEnabled }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload) {
          inserted.push({ table, payload });
          return Promise.resolve({ data: payload, error: null });
        },
      };
      builder.update = (payload) => {
        const rec = { op: 'update', table, payload, filters: {} };
        updated.push(rec);
        const eqChain = {
          eq(col, val) { rec.filters[col] = val; return eqChain; },
          then(resolve) { resolve({ data: null, error: null }); return Promise.resolve({ data: null, error: null }); },
        };
        return eqChain;
      };
      return builder;
    },
  };
  return { sb, inserted, updated };
}

const VALID_UPSTREAM = {
  stage11ColorData: { palette: ['#fff', '#000'] },
  stage11TypographyData: { heading: 'Inter', body: 'Inter' },
  stage11LogoData: { primaryColor: '#0a0a0a', svgPrompt: 'lock' },
  stage17Data: { archetypes: ['hero', 'feature_grid'] },
  deploymentUrl: 'https://example.app/',
};

describe('stage-21-visual-assets — pure helpers (FR-1/FR-4)', () => {
  describe('validateEntryPreconditions (FR-4)', () => {
    it('passes when all 4 upstream artifacts + deployment_url present', () => {
      const result = validateEntryPreconditions(VALID_UPSTREAM);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it.each(REQUIRED_UPSTREAM)('fails when $artifact_type missing', (req) => {
      const params = { ...VALID_UPSTREAM, [req.param_key]: null };
      const result = validateEntryPreconditions(params);
      expect(result.ok).toBe(false);
      expect(result.missing).toContainEqual({ artifact_type: req.artifact_type, source_stage: req.source_stage });
    });

    it('fails when deploymentUrl missing — emits venture_resources.deployment_url in missing list', () => {
      const params = { ...VALID_UPSTREAM, deploymentUrl: null };
      const result = validateEntryPreconditions(params);
      expect(result.ok).toBe(false);
      expect(result.missing).toContainEqual({ artifact_type: 'venture_resources.deployment_url', source_stage: 19 });
    });

    it('treats empty-object data as missing', () => {
      const result = validateEntryPreconditions({ ...VALID_UPSTREAM, stage11ColorData: {} });
      expect(result.ok).toBe(false);
      expect(result.missing[0].artifact_type).toBe('visual_color_palette');
    });

    it('treats empty-string deploymentUrl as missing', () => {
      const result = validateEntryPreconditions({ ...VALID_UPSTREAM, deploymentUrl: '   ' });
      expect(result.ok).toBe(false);
      expect(result.missing.some(m => m.artifact_type === 'venture_resources.deployment_url')).toBe(true);
    });
  });

  describe('validatePlatformCoverage', () => {
    it('passes happy path (4 required socials + 2 devices)', () => {
      const result = JSON.parse(makeLLMResponse());
      expect(() => validatePlatformCoverage(result)).not.toThrow();
    });

    it('throws on fewer than 2 device screenshots', () => {
      const result = JSON.parse(makeLLMResponse({ device_screenshots: [{ device: 'iphone_15', scene: 's', alt_text: 'a', key_features_visible: [] }] }));
      expect(() => validatePlatformCoverage(result)).toThrow(/device_screenshots count 1 below minimum 2/);
    });

    it('throws when any required social platform missing', () => {
      const result = JSON.parse(makeLLMResponse({
        social_graphics: [
          { platform: 'instagram', format: 'square', width: 1080, height: 1080 },
          { platform: 'instagram', format: 'portrait', width: 1080, height: 1350 },
          { platform: 'twitter', format: 'banner', width: 1500, height: 500 },
          // Missing facebook:cover
        ],
      }));
      expect(() => validatePlatformCoverage(result)).toThrow(/missing required social platform "facebook:cover"/);
    });
  });

  describe('splitArtifacts', () => {
    it('splits LLM result into screenshotData + socialData with file_urls=[] (FR-2 deferred)', () => {
      const result = JSON.parse(makeLLMResponse());
      const { screenshotData, socialData } = splitArtifacts(result);
      expect(screenshotData.device_screenshots.length).toBe(2);
      expect(screenshotData.total_screenshots).toBe(2);
      expect(screenshotData.devices_covered).toEqual(expect.arrayContaining(['iphone_15', 'macbook_pro']));
      expect(screenshotData.file_urls).toEqual([]);
      expect(screenshotData.rendering_status).toBe('specs_only');
      expect(socialData.social_graphics.length).toBe(4);
      expect(socialData.platforms_covered).toEqual(expect.arrayContaining(['instagram', 'twitter', 'facebook']));
      expect(socialData.video_storyboard.length).toBe(1);
    });

    it('handles missing arrays gracefully', () => {
      const { screenshotData, socialData } = splitArtifacts({});
      expect(screenshotData.device_screenshots).toEqual([]);
      expect(screenshotData.total_screenshots).toBe(0);
      expect(socialData.social_graphics).toEqual([]);
      expect(socialData.video_storyboard).toEqual([]);
    });
  });
});

describe('stage-21-visual-assets — orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['NO_DEPLOYMENT_URL',         { deploymentUrl: null },         'venture_resources.deployment_url'],
    ['NO_S11_VISUAL_IDENTITY',    { stage11ColorData: {} },        'visual_color_palette'],
    ['NO_S17_APPROVED_DESIGNS',   { stage17Data: null },           's17_archetypes'],
  ])('FR-4 — emits visual_assets_skipped with skip_reason=%s when %j', async (expectedReason, override, expectedMissingType) => {
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ...override,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-skip',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };

    const out = await analyzeStage21VisualAssets(params);

    expect(out._skip).toBe(true);
    expect(out.skip_reason).toBe(expectedReason);
    expect(out.precondition_missing.some(m => m.artifact_type === expectedMissingType)).toBe(true);

    const skipInsert = inserted.find(i => i.payload.artifact_type === 'visual_assets_skipped');
    expect(skipInsert).toBeDefined();
    expect(skipInsert.payload.artifact_data.skip_reason).toBe(expectedReason);
    expect(skipInsert.payload.artifact_data.missing_preconditions).toContain(expectedMissingType);
    expect(skipInsert.payload.lifecycle_stage).toBe(21);
    expect(skipInsert.payload.is_current).toBe(true);

    // No canonical artifacts emitted on skip path.
    expect(inserted.find(i => i.payload.artifact_type === 'visual_device_screenshots')).toBeUndefined();
    expect(inserted.find(i => i.payload.artifact_type === 'visual_social_graphics')).toBeUndefined();
  });

  it('FR-1 — dual-emit (canonical pair + legacy launch_test_plan) when flag OFF', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-1',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage21VisualAssets(params);

    expect(out.canonical_emission.flag_enabled).toBe(false);
    expect(out.canonical_emission.dual_emit).toBe(true);
    expect(inserted.find(i => i.payload.artifact_type === 'visual_device_screenshots')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'visual_social_graphics')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'launch_test_plan')).toBeDefined();
  });

  it('FR-1 — single-emit canonical pair only when flag ON', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: true });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-2',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage21VisualAssets(params);

    expect(out.canonical_emission.flag_enabled).toBe(true);
    expect(out.canonical_emission.dual_emit).toBe(false);
    expect(inserted.find(i => i.payload.artifact_type === 'visual_device_screenshots')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'visual_social_graphics')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'launch_test_plan')).toBeUndefined();
  });

  it('FR-1 — idempotent: marks prior is_current=true rows as is_current=false before insert', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, updated } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-3',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    await analyzeStage21VisualAssets(params);
    const screenshotUpdates = updated.filter(u => u.filters.artifact_type === 'visual_device_screenshots');
    const socialUpdates = updated.filter(u => u.filters.artifact_type === 'visual_social_graphics');
    const legacyUpdates = updated.filter(u => u.filters.artifact_type === 'launch_test_plan');
    expect(screenshotUpdates.length).toBe(1);
    expect(socialUpdates.length).toBe(1);
    expect(legacyUpdates.length).toBe(1);
    expect(screenshotUpdates[0].payload.is_current).toBe(false);
  });

  it('falls back to deterministic specs when LLM output fails platform coverage', async () => {
    // LLM returns malformed (only 1 device, only 2 socials)
    setupMockLLM(JSON.stringify({
      device_screenshots: [{ device: 'iphone_15', scene: 's', alt_text: 'a', key_features_visible: [] }],
      social_graphics: [
        { platform: 'instagram', format: 'square', width: 1080, height: 1080 },
      ],
      video_storyboard: [],
    }));
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-4',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage21VisualAssets(params);
    // After fallback, all 4 required platforms should be present.
    expect(out.social_count).toBeGreaterThanOrEqual(4);
    expect(out.screenshot_count).toBeGreaterThanOrEqual(2);
    // Canonical pair still emitted.
    expect(inserted.find(i => i.payload.artifact_type === 'visual_device_screenshots')).toBeDefined();
  });

  it('returns gracefully when supabase absent (no persistence happens)', async () => {
    setupMockLLM(makeLLMResponse());
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-5',
      supabase: null,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage21VisualAssets(params);
    expect(out.canonical_emission.flag_enabled).toBe(false);
    expect(out.device_screenshots.length).toBeGreaterThan(0);
  });
});

describe('stage-21-visual-assets — import canary (vi.mock guard)', () => {
  // Per memory reference_vi_mock_masks_broken_import: vi.mock can fabricate exports
  // that don't actually exist, masking broken imports. This test asserts each named
  // export is a function (non-undefined), which would fail if vi.mock is hiding a
  // missing real export.
  it('all named exports are defined functions or values', () => {
    expect(typeof analyzeStage21VisualAssets).toBe('function');
    expect(typeof validateEntryPreconditions).toBe('function');
    expect(typeof validatePlatformCoverage).toBe('function');
    expect(typeof splitArtifacts).toBe('function');
    expect(Array.isArray(DEVICE_FRAMES)).toBe(true);
    expect(Array.isArray(SOCIAL_SIZES)).toBe(true);
    expect(Array.isArray(REQUIRED_UPSTREAM)).toBe(true);
    expect(typeof FEATURE_FLAG_KEY).toBe('string');
    expect(FEATURE_FLAG_KEY).toBe('LEO_S21_REQUIRED_ARTIFACTS_GATE');
  });

  it('REQUIRED_UPSTREAM lists exactly 4 entries (3 S11 + 1 S17)', () => {
    expect(REQUIRED_UPSTREAM.length).toBe(4);
    const sources = new Set(REQUIRED_UPSTREAM.map(r => r.source_stage));
    expect(sources).toEqual(new Set([11, 17]));
  });

  it('SOCIAL_SIZES lists 5 entries with 4 marked required', () => {
    expect(SOCIAL_SIZES.length).toBe(5);
    expect(SOCIAL_SIZES.filter(s => s.required).length).toBe(4);
    expect(SOCIAL_SIZES.find(s => !s.required).platform).toBe('opengraph');
  });
});
