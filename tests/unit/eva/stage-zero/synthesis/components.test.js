/**
 * Unit Tests: Stage 0 Synthesis Components (1-8)
 * SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F/G/H
 *
 * Test Coverage (2 tests per component = 16 tests):
 * 1. Cross-Reference: returns enrichment object, handles missing input
 * 2. Portfolio Evaluation: returns evaluation object, handles empty portfolio
 * 3. Problem Reframing: returns reframing object, handles missing problem
 * 4. Moat Architecture: returns moat object, handles LLM failure
 * 5. Chairman Constraints: returns constraint evaluation, handles null input
 * 6. Time Horizon: returns time assessment, handles LLM failure
 * 7. Archetypes: returns archetype classification, handles LLM failure
 * 8. Build Cost: returns cost estimation, handles LLM failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transitive deps
vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

// Mock LLM client factory for all components that use it
vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: '{}' }],
      }),
    },
  })),
}));

import { crossReferenceIntellectualCapital } from '../../../../../lib/eva/stage-zero/synthesis/cross-reference.js';
import { evaluatePortfolioFit } from '../../../../../lib/eva/stage-zero/synthesis/portfolio-evaluation.js';
import { reframeProblem } from '../../../../../lib/eva/stage-zero/synthesis/problem-reframing.js';
import { designMoat } from '../../../../../lib/eva/stage-zero/synthesis/moat-architecture.js';
import { applyChairmanConstraints } from '../../../../../lib/eva/stage-zero/synthesis/chairman-constraints.js';
import { assessTimeHorizon } from '../../../../../lib/eva/stage-zero/synthesis/time-horizon.js';
import { classifyArchetype } from '../../../../../lib/eva/stage-zero/synthesis/archetypes.js';
import { estimateBuildCost } from '../../../../../lib/eva/stage-zero/synthesis/build-cost-estimation.js';

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockPathOutput = {
  suggested_name: 'TestVenture',
  suggested_problem: 'Users need better AI-powered data collection tools',
  suggested_solution: 'Automated data pipeline with proprietary collection',
  target_market: 'Enterprise SaaS companies',
  origin_type: 'discovery',
  competitor_urls: [],
  blueprint_id: null,
  discovery_strategy: null,
  metadata: {},
};

function createMockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || [];
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data, error: null }),
        single: vi.fn().mockResolvedValue({ data: data[0] || null, error: null }),
      };
    }),
  };
}

describe('Synthesis Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Component 1: Cross-Reference ──────────────────────────────

  describe('crossReferenceIntellectualCapital', () => {
    it('should return enrichment object with expected keys', async () => {
      const mockSupabase = createMockSupabase({
        venture_nursery: [],
        brainstorm_sessions: [],
        retrospectives: [],
        issue_patterns: [],
      });

      const result = await crossReferenceIntellectualCapital(mockPathOutput, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(result.component).toBe('cross_reference');
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('lessons');
      expect(result).toHaveProperty('relevance_score');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it('should throw when supabase is missing', async () => {
      await expect(
        crossReferenceIntellectualCapital(mockPathOutput, { logger: silentLogger }),
      ).rejects.toThrow('supabase client is required');
    });
  });

  // ── Component 2: Portfolio Evaluation ─────────────────────────

  describe('evaluatePortfolioFit', () => {
    it('should return evaluation object with expected keys', async () => {
      const mockSupabase = createMockSupabase({ ventures: [] });

      const result = await evaluatePortfolioFit(mockPathOutput, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(result.component).toBe('portfolio_evaluation');
      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('composite_score');
      expect(result).toHaveProperty('portfolio_size');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('summary');
    });

    it('should return opportunity scores for empty portfolio', async () => {
      const mockSupabase = createMockSupabase({ ventures: [] });

      const result = await evaluatePortfolioFit(mockPathOutput, {
        supabase: mockSupabase,
        logger: silentLogger,
      });

      expect(result.portfolio_size).toBe(0);
      expect(result.composite_score).toBe(70);
      expect(result.recommendation).toBe('proceed');
      expect(result.dimensions.portfolio_gaps.score).toBe(10);
      expect(result.dimensions.redundancy_check.score).toBe(10);
    });
  });

  // ── Component 3: Problem Reframing ────────────────────────────

  describe('reframeProblem', () => {
    it('should return reframing object with expected keys', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                assumptions_challenged: [{ assumption: 'test', challenge: 'why', validity: 'moderate' }],
                reframings: [{ framing: 'reframed', market_size: 'large', defensibility: 'high', automation_potential: 'high', strategic_score: 90, rationale: 'better' }],
                recommended_framing: { framing: 'reframed', reason: 'better fit' },
                summary: 'Test summary',
              }),
            }],
          }),
        },
      };

      const result = await reframeProblem(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('problem_reframing');
      expect(result).toHaveProperty('original_problem');
      expect(result).toHaveProperty('reframings');
      expect(result).toHaveProperty('assumptions_challenged');
      expect(result).toHaveProperty('recommended_framing');
      expect(result).toHaveProperty('summary');
    });

    it('should handle missing problem statement gracefully', async () => {
      const result = await reframeProblem(
        { ...mockPathOutput, suggested_problem: '' },
        { logger: silentLogger },
      );

      expect(result.component).toBe('problem_reframing');
      expect(result.original_problem).toBe('');
      expect(result.reframings).toEqual([]);
      expect(result.summary).toContain('No problem statement');
    });
  });

  // ── Component 4: Moat Architecture ────────────────────────────

  describe('designMoat', () => {
    it('should return moat object with expected keys', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                primary_moat: { type: 'data_moat', strategy: 'collect user data', compounding: {} },
                secondary_moats: [{ type: 'automation_speed', strategy: 'AI ops', confidence: 80 }],
                moat_score: 75,
                portfolio_moat_synergy: 'Data feeds other ventures',
                vulnerabilities: ['Open source competition'],
                summary: 'Strong data moat potential',
              }),
            }],
          }),
        },
      };

      const result = await designMoat(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('moat_architecture');
      expect(result).toHaveProperty('primary_moat');
      expect(result).toHaveProperty('secondary_moats');
      expect(result).toHaveProperty('moat_score');
      expect(result).toHaveProperty('vulnerabilities');
      expect(result).toHaveProperty('summary');
    });

    it('should return default result when LLM fails', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('LLM timeout')),
        },
      };

      const result = await designMoat(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('moat_architecture');
      expect(result.primary_moat).toBeNull();
      expect(result.moat_score).toBe(0);
      expect(result.summary).toContain('failed');
    });
  });

  // ── Component 5: Chairman Constraints ─────────────────────────

  describe('applyChairmanConstraints', () => {
    it('should return constraint evaluation with expected keys', async () => {
      const result = await applyChairmanConstraints(mockPathOutput, {
        logger: silentLogger,
      });

      expect(result.component).toBe('chairman_constraints');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('evaluations');
      expect(result).toHaveProperty('passed_count');
      expect(result).toHaveProperty('failed_count');
      expect(result).toHaveProperty('total_constraints');
      expect(result).toHaveProperty('summary');
      expect(result.total_constraints).toBeGreaterThan(0);
    });

    it('should handle null/missing input gracefully using defaults', async () => {
      const result = await applyChairmanConstraints(
        { suggested_solution: null, suggested_problem: null, suggested_name: null, target_market: null },
        { logger: silentLogger },
      );

      expect(result.component).toBe('chairman_constraints');
      expect(result.evaluations).toBeDefined();
      expect(result.total_constraints).toBeGreaterThan(0);
      // With null inputs, heuristic checks should still produce evaluations
      expect(result.evaluations.length).toBe(result.total_constraints);
    });
  });

  // ── Component 6: Time Horizon ─────────────────────────────────

  describe('assessTimeHorizon', () => {
    it('should return time assessment with expected keys', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                position: 'build_now',
                confidence: 85,
                market_readiness: { score: 8, rationale: 'Market is ready' },
                technology_maturity: { score: 9, rationale: 'Tech is mature' },
                competitive_density: { score: 6, rationale: 'Few competitors' },
                adoption_stage: 'early_majority',
                trigger_conditions: [],
                urgency_factors: [],
                summary: 'Build now - market is ready',
              }),
            }],
          }),
        },
      };

      const result = await assessTimeHorizon(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('time_horizon');
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('market_readiness');
      expect(result).toHaveProperty('technology_maturity');
      expect(result).toHaveProperty('competitive_density');
      expect(result).toHaveProperty('summary');
      expect(result.position).toBe('build_now');
    });

    it('should return default result when LLM fails', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      };

      const result = await assessTimeHorizon(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('time_horizon');
      expect(result.position).toBe('build_now');
      expect(result.confidence).toBe(0);
      expect(result.summary).toContain('failed');
    });
  });

  // ── Component 7: Archetypes ───────────────────────────────────

  describe('classifyArchetype', () => {
    it('should return archetype classification with expected keys', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                primary_archetype: 'automator',
                primary_confidence: 85,
                primary_rationale: 'AI-powered automation pipeline',
                secondary_archetypes: [{ key: 'democratizer', fit_score: 6, rationale: 'Makes tools accessible' }],
                archetype_scores: { automator: 9, democratizer: 6 },
                execution_implications: ['Focus on pipeline reliability'],
                summary: 'Automator archetype fits best',
              }),
            }],
          }),
        },
      };

      const result = await classifyArchetype(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('archetypes');
      expect(result).toHaveProperty('primary_archetype');
      expect(result).toHaveProperty('primary_confidence');
      expect(result).toHaveProperty('secondary_archetypes');
      expect(result).toHaveProperty('archetype_scores');
      expect(result).toHaveProperty('execution_implications');
      expect(result).toHaveProperty('summary');
      expect(result.primary_archetype).toBe('automator');
    });

    it('should return default result when LLM fails', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API rate limit')),
        },
      };

      const result = await classifyArchetype(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('archetypes');
      expect(result.primary_archetype).toBe('automator');
      expect(result.primary_confidence).toBe(0);
      expect(result.summary).toContain('failed');
    });
  });

  // ── Component 8: Build Cost Estimation ────────────────────────

  describe('estimateBuildCost', () => {
    it('should return cost estimation with expected keys', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify({
                complexity: 'moderate',
                loc_estimate: { min: 2000, max: 5000, breakdown: { backend: 2000 } },
                sd_count: { min: 8, max: 15, breakdown: { core_features: 6 } },
                infrastructure: { required: ['supabase'], optional: ['redis'], estimated_monthly_cost: 50 },
                token_budget: { development_tokens_monthly: 500000, production_tokens_monthly: 200000, estimated_monthly_cost: 30 },
                timeline_weeks: { optimistic: 4, realistic: 8, pessimistic: 14 },
                risk_factors: ['API dependency'],
                summary: 'Moderate complexity build',
              }),
            }],
          }),
        },
      };

      const result = await estimateBuildCost(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('build_cost');
      expect(result).toHaveProperty('complexity');
      expect(result).toHaveProperty('loc_estimate');
      expect(result).toHaveProperty('sd_count');
      expect(result).toHaveProperty('infrastructure');
      expect(result).toHaveProperty('token_budget');
      expect(result).toHaveProperty('timeline_weeks');
      expect(result).toHaveProperty('summary');
      expect(result.complexity).toBe('moderate');
    });

    it('should return default result when LLM fails', async () => {
      const mockLLM = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        },
      };

      const result = await estimateBuildCost(mockPathOutput, {
        logger: silentLogger,
        llmClient: mockLLM,
      });

      expect(result.component).toBe('build_cost');
      expect(result.complexity).toBe('moderate');
      expect(result.loc_estimate.min).toBe(0);
      expect(result.summary).toContain('failed');
    });
  });
});
