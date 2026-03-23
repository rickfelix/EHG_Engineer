/**
 * Unit tests for Stage 19 Visual Convergence Loop
 * SD: SD-MAN-INFRA-ITERATOR-STAGE-VISUAL-001
 *
 * Tests the 5-pass convergence analysis, weighted scoring, verdict logic,
 * edge cases for missing/empty wireframes, and pass weight integrity.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock LLM client ─────────────────────────────────────────────────
const mockComplete = vi.fn();
vi.mock('../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: mockComplete,
  })),
}));

// ── Mock parse-json utils ───────────────────────────────────────────
vi.mock('../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((response) => {
    if (typeof response === 'object' && response !== null && response._parsed) {
      return response._parsed;
    }
    return response;
  }),
  extractUsage: vi.fn(() => ({ input_tokens: 100, output_tokens: 200 })),
}));

// ── Import the module under test AFTER mocks ────────────────────────
import {
  analyzeStage19VisualConvergence,
  CONVERGENCE_THRESHOLD,
  VERDICT_PASS,
  VERDICT_NEEDS_REFINEMENT,
  PASS_DEFINITIONS,
  generateMockResponse,
} from '../../lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence.js';

// ── Test Helpers ────────────────────────────────────────────────────

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
};

/**
 * Create realistic Stage 15 wireframe screen data.
 */
function createMockScreens(count = 5) {
  const screens = [];
  for (let i = 0; i < count; i++) {
    screens.push({
      name: `Screen ${i + 1}`,
      purpose: `Purpose for screen ${i + 1}: main dashboard view`,
      persona: `Persona ${(i % 3) + 1}`,
      ascii_layout: [
        '+-------------------------------------------+',
        `|  Logo   [ Nav ]  [ Profile ]              |`,
        '+-------------------------------------------+',
        '|  Welcome back!                             |',
        '|  +----------------+  +----------------+    |',
        '|  |  Metric A      |  |  Metric B      |   |',
        '|  +----------------+  +----------------+    |',
        '|  [ Action Button ]                         |',
        '+-------------------------------------------+',
      ].join('\n'),
      key_components: ['Navigation bar', 'Metrics cards', 'Action button', 'Profile menu'],
      interaction_notes: 'User lands here after login and accesses key metrics and actions.',
    });
  }
  return screens;
}

function createStageData(screens) {
  return {
    stage15_data: { screens },
  };
}

/**
 * Make the mock LLM return a specific score for all passes.
 */
function setupLLMWithScore(score) {
  mockComplete.mockResolvedValue({
    _parsed: {
      score,
      strengths: ['Good structure', 'Clear layout'],
      improvements: ['Add annotations', 'Improve spacing'],
    },
  });
}

/**
 * Make the mock LLM return per-domain scores via a map.
 */
function setupLLMWithDomainScores(domainScoreMap) {
  let callIndex = 0;
  const domains = PASS_DEFINITIONS.map(p => p.domain);
  mockComplete.mockImplementation(() => {
    const domain = domains[callIndex++];
    const score = domainScoreMap[domain] ?? 70;
    return Promise.resolve({
      _parsed: {
        score,
        strengths: [`Strength for ${domain}`],
        improvements: [`Improvement for ${domain}`],
      },
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Stage 19 Visual Convergence Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Output structure ─────────────────────────────────────────────

  describe('output structure', () => {
    it('returns correct top-level properties', async () => {
      setupLLMWithScore(75);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result).toHaveProperty('passes');
      expect(result).toHaveProperty('overall_score');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('threshold');
      expect(result).toHaveProperty('screen_count');
      expect(result).toHaveProperty('refinement_priority');

      expect(Array.isArray(result.passes)).toBe(true);
      expect(typeof result.overall_score).toBe('number');
      expect(typeof result.verdict).toBe('string');
      expect(typeof result.threshold).toBe('number');
      expect(typeof result.screen_count).toBe('number');
      expect(Array.isArray(result.refinement_priority)).toBe(true);
    });

    it('each pass has domain, score, strengths, improvements, expertPersona, and weight', async () => {
      setupLLMWithScore(80);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.passes.length).toBe(5);
      for (const pass of result.passes) {
        expect(pass).toHaveProperty('domain');
        expect(pass).toHaveProperty('score');
        expect(pass).toHaveProperty('strengths');
        expect(pass).toHaveProperty('improvements');
        expect(pass).toHaveProperty('expertPersona');
        expect(pass).toHaveProperty('weight');

        expect(typeof pass.domain).toBe('string');
        expect(typeof pass.score).toBe('number');
        expect(Array.isArray(pass.strengths)).toBe(true);
        expect(Array.isArray(pass.improvements)).toBe(true);
        expect(typeof pass.expertPersona).toBe('string');
        expect(typeof pass.weight).toBe('number');
      }
    });
  });

  // ─── All 5 passes produce domain scores ───────────────────────────

  describe('convergence passes', () => {
    it('produces exactly 5 domain-specific passes', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(6);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      const expectedDomains = [
        'layout_structure',
        'typography_hierarchy',
        'color_accessibility',
        'interactive_elements',
        'handoff_completeness',
      ];

      expect(result.passes.length).toBe(5);
      const domains = result.passes.map(p => p.domain);
      expect(domains).toEqual(expectedDomains);
    });

    it('each pass has a distinct expert persona', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      const personas = result.passes.map(p => p.expertPersona);
      const uniquePersonas = new Set(personas);
      expect(uniquePersonas.size).toBe(5);

      expect(personas).toContain('UX Architect');
      expect(personas).toContain('Visual Designer');
      expect(personas).toContain('Accessibility Expert');
      expect(personas).toContain('Interaction Designer');
      expect(personas).toContain('QA Reviewer');
    });
  });

  // ─── Weights sum to 1.0 ───────────────────────────────────────────

  describe('weight integrity', () => {
    it('PASS_DEFINITIONS weights sum to exactly 1.0', () => {
      const totalWeight = PASS_DEFINITIONS.reduce((sum, p) => sum + p.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });

    it('result pass weights sum to 1.0', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      const totalWeight = result.passes.reduce((sum, p) => sum + p.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });

  // ─── PASS verdict when score >= 60 ────────────────────────────────

  describe('verdict: PASS', () => {
    it('returns PASS when overall score >= 60', async () => {
      setupLLMWithScore(75);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(75);
      expect(result.verdict).toBe(VERDICT_PASS);
    });

    it('returns PASS at exactly the threshold (60)', async () => {
      setupLLMWithScore(60);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(60);
      expect(result.verdict).toBe(VERDICT_PASS);
    });

    it('returns PASS when all domains score 100', async () => {
      setupLLMWithScore(100);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(100);
      expect(result.verdict).toBe(VERDICT_PASS);
    });
  });

  // ─── NEEDS_REFINEMENT when score < 60 ─────────────────────────────

  describe('verdict: NEEDS_REFINEMENT', () => {
    it('returns NEEDS_REFINEMENT when overall score < 60', async () => {
      setupLLMWithScore(40);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(40);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
    });

    it('returns NEEDS_REFINEMENT at score 59', async () => {
      setupLLMWithScore(59);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(59);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
    });

    it('returns NEEDS_REFINEMENT when all domains score 0', async () => {
      setupLLMWithScore(0);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(0);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
    });
  });

  // ─── Weighted scoring correctness ─────────────────────────────────

  describe('weighted scoring', () => {
    it('computes overall_score as weighted average of domain scores', async () => {
      setupLLMWithDomainScores({
        layout_structure: 80,       // * 0.25 = 20
        typography_hierarchy: 70,   // * 0.20 = 14
        color_accessibility: 60,    // * 0.20 = 12
        interactive_elements: 90,   // * 0.20 = 18
        handoff_completeness: 50,   // * 0.15 = 7.5
      });

      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      // Expected: 20 + 14 + 12 + 18 + 7.5 = 71.5, rounded to 72
      expect(result.overall_score).toBe(72);
      expect(result.verdict).toBe(VERDICT_PASS);
    });

    it('threshold is always CONVERGENCE_THRESHOLD', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.threshold).toBe(CONVERGENCE_THRESHOLD);
      expect(result.threshold).toBe(60);
    });
  });

  // ─── Missing Stage 15 data ────────────────────────────────────────

  describe('missing Stage 15 data', () => {
    it('returns minimal result with score 0 when stageData is null', async () => {
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        null,
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(0);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
      expect(result.passes).toEqual([]);
      expect(result.screen_count).toBe(0);
      expect(result.refinement_priority.length).toBeGreaterThan(0);
    });

    it('returns minimal result when stage15_data is missing', async () => {
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        { other_data: {} },
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(0);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
      expect(result.passes).toEqual([]);
      expect(result.screen_count).toBe(0);
    });

    it('returns minimal result when screens is undefined', async () => {
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        { stage15_data: {} },
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(0);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
      expect(result.screen_count).toBe(0);
    });
  });

  // ─── Empty wireframes ─────────────────────────────────────────────

  describe('empty wireframes', () => {
    it('returns minimal result when screens array is empty', async () => {
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData([]),
        { logger: silentLogger },
      );

      expect(result.overall_score).toBe(0);
      expect(result.verdict).toBe(VERDICT_NEEDS_REFINEMENT);
      expect(result.passes).toEqual([]);
      expect(result.screen_count).toBe(0);
    });
  });

  // ─── Refinement priority ──────────────────────────────────────────

  describe('refinement priority', () => {
    it('collects improvements from all passes into refinement_priority', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      // Each pass returns 2 improvements from our mock
      expect(result.refinement_priority.length).toBe(10);
      // Each entry should be prefixed with the pass label
      for (const item of result.refinement_priority) {
        expect(item).toMatch(/^\[/);
      }
    });

    it('sorts improvements by impact (highest first)', async () => {
      // Low-scoring domains should have their improvements ranked higher
      setupLLMWithDomainScores({
        layout_structure: 90,       // low impact (100-90)*0.25 = 2.5
        typography_hierarchy: 30,   // high impact (100-30)*0.20 = 14
        color_accessibility: 80,    // low impact (100-80)*0.20 = 4
        interactive_elements: 20,   // highest impact (100-20)*0.20 = 16
        handoff_completeness: 50,   // moderate (100-50)*0.15 = 7.5
      });

      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      // First items should be from Interactive Elements (highest impact) or Typography
      const firstItem = result.refinement_priority[0];
      expect(
        firstItem.includes('Interactive Elements') || firstItem.includes('Typography'),
      ).toBe(true);
    });
  });

  // ─── screen_count tracking ────────────────────────────────────────

  describe('screen_count', () => {
    it('reports correct screen count', async () => {
      setupLLMWithScore(70);
      const screens = createMockScreens(8);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      expect(result.screen_count).toBe(8);
    });
  });

  // ─── Mock fallback behavior ───────────────────────────────────────

  describe('LLM fallback to mock', () => {
    it('uses mock responses when LLM throws', async () => {
      mockComplete.mockRejectedValue(new Error('LLM unavailable'));

      const screens = createMockScreens(5);
      const result = await analyzeStage19VisualConvergence(
        'venture-123',
        createStageData(screens),
        { logger: silentLogger },
      );

      // Should still produce valid results via mock
      expect(result.passes.length).toBe(5);
      expect(result.overall_score).toBeGreaterThan(0);
      expect([VERDICT_PASS, VERDICT_NEEDS_REFINEMENT]).toContain(result.verdict);
    });
  });

  // ─── generateMockResponse unit tests ──────────────────────────────

  describe('generateMockResponse', () => {
    it('returns score, strengths, and improvements', () => {
      const passDef = PASS_DEFINITIONS[0]; // layout_structure
      const screens = createMockScreens(5);
      const result = generateMockResponse(passDef, screens);

      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.strengths)).toBe(true);
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(Array.isArray(result.improvements)).toBe(true);
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('produces different scores for different domains', () => {
      const screens = createMockScreens(5);
      const scores = PASS_DEFINITIONS.map(pd => generateMockResponse(pd, screens).score);

      // Not all scores should be identical (domain offsets ensure variance)
      const uniqueScores = new Set(scores);
      expect(uniqueScores.size).toBeGreaterThan(1);
    });

    it('gives higher base scores for more screens', () => {
      const fewScreens = createMockScreens(2);
      const manyScreens = createMockScreens(10);
      const passDef = PASS_DEFINITIONS[0];

      const fewResult = generateMockResponse(passDef, fewScreens);
      const manyResult = generateMockResponse(passDef, manyScreens);

      expect(manyResult.score).toBeGreaterThanOrEqual(fewResult.score);
    });
  });
});
