/**
 * Integration tests for Stage 15 Template (Design Studio)
 * SD: SD-FIX-S15-WIREFRAME-TESTS-001
 *
 * Tests sub-step ordering (UserStories -> IA -> Wireframes -> Convergence)
 * and Stitch post-hook regression for the wireframe delivery pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Track call order ────────────────────────────────────────────────
const callOrder = [];

// ── Mock sub-step modules ───────────────────────────────────────────
const mockGenerateUserStoryPack = vi.fn(async () => {
  callOrder.push('userStoryPack');
  return { epics: [{ name: 'Auth', stories: [{ title: 'Login' }] }], mvp_story_count: 1, total_story_points: 3 };
});

const mockGenerateIA = vi.fn(async () => {
  callOrder.push('ia');
  return { pages: [{ name: 'Dashboard', path: '/dashboard', purpose: 'Main', priority: 'primary' }], navigation: { primary: ['Dashboard'] }, user_flows: [], total_pages: 1 };
});

const mockAnalyzeWireframes = vi.fn(async () => {
  callOrder.push('wireframes');
  return {
    screens: [
      { name: 'Dashboard', purpose: 'Main', persona: 'Founder', ascii_layout: '+---+\n|   |\n+---+', key_components: ['Nav'], interaction_notes: 'Test' },
    ],
  };
});

const mockAnalyzeConvergence = vi.fn(async () => {
  callOrder.push('convergence');
  return { overall_score: 82, verdict: 'PASS', passes: [{ label: 'UX Expert', score: 82 }] };
});

const mockWriteArtifact = vi.fn(async () => {});

// ── Mock output schema ──────────────────────────────────────────────
vi.mock('../../lib/eva/stage-templates/output-schema-extractor.js', () => ({
  extractOutputSchema: vi.fn(() => ({})),
  ensureOutputSchema: vi.fn(),
}));

vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-15-user-story-pack.js', () => ({
  generateUserStoryPack: mockGenerateUserStoryPack,
}));

vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-15-ia-generator.js', () => ({
  generateInformationArchitecture: mockGenerateIA,
}));

vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js', () => ({
  analyzeStage15WireframeGenerator: mockAnalyzeWireframes,
}));

vi.mock('../../lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence.js', () => ({
  analyzeStage19VisualConvergence: mockAnalyzeConvergence,
}));

vi.mock('../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: mockWriteArtifact,
}));

// ── Import template AFTER mocks ─────────────────────────────────────
const { default: TEMPLATE } = await import('../../lib/eva/stage-templates/stage-15.js');

// ── Test Helpers ────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

function createFullCtx(overrides = {}) {
  return {
    ventureId: 'venture-123',
    ventureName: 'TestVenture',
    stage10Data: {
      customerPersonas: [{ name: 'Founder', goals: ['Grow'], painPoints: ['No time'] }],
      brandGenome: { archetype: 'Creator', values: ['Innovation'] },
    },
    stage14Data: { layers: { presentation: { technology: 'React' } } },
    supabase: { from: vi.fn() },
    logger: silentLogger,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Stage 15 Template - Design Studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOrder.length = 0;
  });

  // ─── Template metadata ────────────────────────────────────────────

  describe('template metadata', () => {
    it('has correct id and slug', () => {
      expect(TEMPLATE.id).toBe('stage-15');
      expect(TEMPLATE.slug).toBe('design-studio');
    });

    it('has an analysisStep function', () => {
      expect(typeof TEMPLATE.analysisStep).toBe('function');
    });
  });

  // ─── Sub-step ordering ────────────────────────────────────────────

  describe('sub-step execution order', () => {
    it('executes UserStories -> IA -> Wireframes -> Convergence in order', async () => {
      const ctx = createFullCtx();
      await TEMPLATE.analysisStep(ctx);

      expect(callOrder).toEqual(['userStoryPack', 'ia', 'wireframes', 'convergence']);
    });

    it('passes user story result into IA context', async () => {
      const ctx = createFullCtx();
      await TEMPLATE.analysisStep(ctx);

      // IA should have been called with userStoryPack in context
      const iaCall = mockGenerateIA.mock.calls[0][0];
      expect(iaCall).toHaveProperty('userStoryPack');
      expect(iaCall.userStoryPack.epics).toHaveLength(1);
    });

    it('passes user stories and IA result into wireframe context', async () => {
      const ctx = createFullCtx();
      await TEMPLATE.analysisStep(ctx);

      const wfCall = mockAnalyzeWireframes.mock.calls[0][0];
      expect(wfCall).toHaveProperty('userStoryPack');
      expect(wfCall).toHaveProperty('iaSitemap');
    });

    it('passes wireframe result into convergence call', async () => {
      const ctx = createFullCtx();
      await TEMPLATE.analysisStep(ctx);

      const convCall = mockAnalyzeConvergence.mock.calls[0];
      expect(convCall[0]).toBe('venture-123');
      expect(convCall[1]).toHaveProperty('stage15_data');
      expect(convCall[1].stage15_data.screens).toHaveLength(1);
    });
  });

  // ─── Non-fatal failure handling ───────────────────────────────────

  describe('non-fatal sub-step failures', () => {
    it('continues when user story pack fails', async () => {
      mockGenerateUserStoryPack.mockRejectedValueOnce(new Error('Story gen failed'));
      const ctx = createFullCtx();

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result.user_story_pack).toBeNull();
      expect(mockGenerateIA).toHaveBeenCalled();
      expect(mockAnalyzeWireframes).toHaveBeenCalled();
    });

    it('continues when IA generation fails', async () => {
      mockGenerateIA.mockRejectedValueOnce(new Error('IA gen failed'));
      const ctx = createFullCtx();

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result.ia_sitemap).toBeNull();
      expect(mockAnalyzeWireframes).toHaveBeenCalled();
    });

    it('continues when convergence fails', async () => {
      mockAnalyzeConvergence.mockRejectedValueOnce(new Error('Convergence failed'));
      const ctx = createFullCtx();

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result.wireframe_convergence).toBeNull();
      expect(result.wireframes).toBeTruthy();
    });

    it('skips wireframes when no brand data', async () => {
      const ctx = createFullCtx({
        stage10Data: { customerPersonas: [], brandGenome: null },
      });

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result.wireframes).toBeNull();
      expect(mockAnalyzeWireframes).not.toHaveBeenCalled();
    });
  });

  // ─── Output structure ─────────────────────────────────────────────

  describe('output structure', () => {
    it('returns all four sub-step results', async () => {
      const ctx = createFullCtx();

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result).toHaveProperty('wireframes');
      expect(result).toHaveProperty('wireframe_convergence');
      expect(result).toHaveProperty('user_story_pack');
      expect(result).toHaveProperty('ia_sitemap');
    });

    it('persists user story artifact when supabase available', async () => {
      const ctx = createFullCtx();

      await TEMPLATE.analysisStep(ctx);

      expect(mockWriteArtifact).toHaveBeenCalledWith(
        ctx.supabase,
        expect.objectContaining({
          ventureId: 'venture-123',
          lifecycleStage: 15,
          artifactType: 'blueprint_user_story_pack',
        }),
      );
    });

    it('persists wireframe artifact when supabase available', async () => {
      const ctx = createFullCtx();

      await TEMPLATE.analysisStep(ctx);

      expect(mockWriteArtifact).toHaveBeenCalledWith(
        ctx.supabase,
        expect.objectContaining({
          ventureId: 'venture-123',
          lifecycleStage: 15,
          artifactType: 'blueprint_wireframes',
        }),
      );
    });
  });

  // ─── Stitch post-hook regression ──────────────────────────────────

  describe('stitch post-hook regression', () => {
    it('wireframe result includes screens array for stitch provisioner consumption', async () => {
      const ctx = createFullCtx();

      const result = await TEMPLATE.analysisStep(ctx);

      expect(result.wireframes).toBeTruthy();
      expect(Array.isArray(result.wireframes.screens)).toBe(true);
      expect(result.wireframes.screens.length).toBeGreaterThan(0);
    });

    it('wireframe artifact includes ia_sitemap for downstream consumers', async () => {
      const ctx = createFullCtx();

      await TEMPLATE.analysisStep(ctx);

      // Find the wireframe artifact write call
      const wireframeArtifactCall = mockWriteArtifact.mock.calls.find(
        call => call[1]?.artifactType === 'blueprint_wireframes',
      );
      expect(wireframeArtifactCall).toBeTruthy();
      expect(wireframeArtifactCall[1].artifactData).toHaveProperty('wireframes');
      expect(wireframeArtifactCall[1].artifactData).toHaveProperty('ia_sitemap');
    });

    it('convergence only runs when wireframes have screens', async () => {
      mockAnalyzeWireframes.mockResolvedValueOnce({ screens: [] });
      const ctx = createFullCtx();

      await TEMPLATE.analysisStep(ctx);

      expect(mockAnalyzeConvergence).not.toHaveBeenCalled();
    });

    it('skips convergence when wireframes are null', async () => {
      // No brand data = no wireframes
      const ctx = createFullCtx({
        stage10Data: { customerPersonas: [], brandGenome: null },
      });

      await TEMPLATE.analysisStep(ctx);

      expect(mockAnalyzeConvergence).not.toHaveBeenCalled();
    });
  });

  // ─── Validate helper ──────────────────────────────────────────────

  describe('validate', () => {
    it('returns valid for object data', () => {
      const result = TEMPLATE.validate({ wireframes: null });
      expect(result.valid).toBe(true);
    });

    it('returns invalid for null data', () => {
      const result = TEMPLATE.validate(null);
      expect(result.valid).toBe(false);
    });

    it('returns invalid for non-object data', () => {
      const result = TEMPLATE.validate('string');
      expect(result.valid).toBe(false);
    });
  });
});
