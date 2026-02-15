/**
 * Integration Tests for Eva Orchestrator
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-C
 *
 * Wires real Eva modules together with mocked external boundaries (DB/LLM).
 * Tests the integration between:
 *   - processStage (orchestrator)
 *   - evaluateDecision (decision filter engine)
 *   - evaluateRealityGate (reality gates)
 *   - isDevilsAdvocateGate / getDevilsAdvocateReview (devil's advocate)
 *   - convertSprintToSDs (lifecycle SD bridge, Stage 18)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock sd-key-generator (has shebang that vitest can't transform)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-ORCH-SPRINT-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { processStage, _internal } from '../../../lib/eva/eva-orchestrator.js';
import { evaluateDecision, DEFAULTS } from '../../../lib/eva/decision-filter-engine.js';
import { evaluateRealityGate, BOUNDARY_CONFIG } from '../../../lib/eva/reality-gates.js';
import { isDevilsAdvocateGate } from '../../../lib/eva/devils-advocate.js';

const { STATUS, FILTER_ACTION } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

// ── Mock Supabase Factory ────────────────────────────────────────

function createIntegrationMockSupabase({
  venture = {
    id: 'v-integ-1',
    name: 'Integration Test Venture',
    status: 'active',
    current_lifecycle_stage: 1,
    archetype: 'saas',
    created_at: '2026-01-01',
  },
  artifacts = [],
  insertError = null,
} = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: venture, error: null }),
        };
      }
      if (table === 'venture_artifacts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        };
      }
      // Fallback for any other table (chairman_preferences, stage_templates, etc.)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
  };
}

// ── Integration Tests ────────────────────────────────────────────

describe('Eva Orchestrator Integration', () => {
  describe('processStage with real evaluateDecision', () => {
    it('should auto-proceed when decision filter finds no triggers', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      // Use real evaluateDecision (not mocked)
      // Analysis step returns cost within default and score >= chairman_review_score (9)
      // to avoid the two-tier low_score trigger (score < 9 fires MEDIUM low_score)
      const analysisStep = vi.fn().mockResolvedValue({
        artifactType: 'market_analysis',
        payload: { cost: 5000, score: 10 },
        source: 'market-analysis-step',
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'market', execute: analysisStep }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.filterDecision.action).toBe(FILTER_ACTION.AUTO_PROCEED);
      // evaluateDecision returns "missing preference" constraint_drift triggers
      // when no chairman preferences are provided, but auto_proceed is still true
      expect(result.filterDecision.raw.auto_proceed).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].payload.cost).toBe(5000);
    });

    it('should STOP when decision filter detects high cost', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      // Step returns a cost that exceeds default threshold
      const expensiveStep = vi.fn().mockResolvedValue({
        artifactType: 'cost_analysis',
        payload: { cost: DEFAULTS['filter.cost_max_usd'] + 50000 },
        source: 'cost-step',
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'cost', execute: expensiveStep }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.filterDecision.action).toBe(FILTER_ACTION.STOP);
      // Trigger objects are in filterDecision.raw.triggers (filterDecision.reasons has message strings)
      const costTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'cost_threshold');
      expect(costTrigger).toBeDefined();
      expect(costTrigger.severity).toBe('HIGH');
    });

    it('should REQUIRE_REVIEW when decision filter detects low score (MEDIUM tier)', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      // Score 8 is above min_score (7) but below chairman_review_score (9)
      // → triggers MEDIUM low_score → maps to REQUIRE_REVIEW (not STOP)
      const lowScoreStep = vi.fn().mockResolvedValue({
        artifactType: 'score_analysis',
        payload: { score: 8 },
        source: 'score-step',
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'score', execute: lowScoreStep }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.filterDecision.action).toBe(FILTER_ACTION.REQUIRE_REVIEW);
      const scoreTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'low_score');
      expect(scoreTrigger).toBeDefined();
    });
  });

  describe('processStage with real evaluateRealityGate', () => {
    it('should BLOCK when reality gate detects missing artifacts at boundary 5->6', async () => {
      const mockSupabase = createIntegrationMockSupabase({
        venture: {
          id: 'v-integ-1',
          name: 'Test Venture',
          status: 'active',
          current_lifecycle_stage: 5,
          archetype: 'saas',
          created_at: '2026-01-01',
        },
        artifacts: [], // No artifacts - should trigger FAIL
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          stageId: 5,
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          // Use real evaluateRealityGate (not mocked)
          evaluateRealityGateFn: async (params, deps) => {
            const result = await evaluateRealityGate({
              ventureId: params.ventureId || params.from,
              fromStage: params.from,
              toStage: params.to,
              supabase: deps.supabase,
              logger: silentLogger,
            });
            return { passed: result.status === 'PASS', ...result };
          },
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.BLOCKED);
    });

    it('should PASS when reality gate finds all required artifacts at boundary 5->6', async () => {
      const boundary = BOUNDARY_CONFIG['5->6'];
      const artifacts = boundary.required_artifacts.map(req => ({
        artifact_type: req.artifact_type,
        quality_score: 0.8,
        is_current: true,
      }));

      const mockSupabase = createIntegrationMockSupabase({
        venture: {
          id: 'v-integ-1',
          name: 'Test Venture',
          status: 'active',
          current_lifecycle_stage: 5,
          archetype: 'saas',
          created_at: '2026-01-01',
        },
        artifacts,
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          stageId: 5,
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: async (params, deps) => {
            const result = await evaluateRealityGate({
              ventureId: params.ventureId || params.from,
              fromStage: params.from,
              toStage: params.to,
              supabase: deps.supabase,
              logger: silentLogger,
            });
            return { passed: result.status === 'PASS', ...result };
          },
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
    });
  });

  describe('processStage at devil\'s advocate gate stages', () => {
    it('should identify kill gate at stage 3', () => {
      const { isGate, gateType } = isDevilsAdvocateGate(3);
      expect(isGate).toBe(true);
      expect(gateType).toBe('kill');
    });

    it('should identify promotion gate at stage 16', () => {
      const { isGate, gateType } = isDevilsAdvocateGate(16);
      expect(isGate).toBe(true);
      expect(gateType).toBe('promotion');
    });

    it('should skip devil\'s advocate for non-gate stages', () => {
      const { isGate } = isDevilsAdvocateGate(1);
      expect(isGate).toBe(false);
    });
  });

  describe('multi-module integration: analysis + decision + gates', () => {
    it('should process complete stage with all modules wired together', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      // Multiple analysis steps producing different artifact types
      const marketStep = vi.fn().mockResolvedValue({
        artifactType: 'market_analysis',
        payload: { cost: 3000, score: 9, technologies: ['React', 'Node.js'] },
        source: 'market-analysis',
      });
      const techStep = vi.fn().mockResolvedValue({
        artifactType: 'tech_assessment',
        payload: { patterns: ['microservices'], vendors: ['AWS'] },
        source: 'tech-assessment',
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: {
              analysisSteps: [
                { id: 'market', execute: marketStep },
                { id: 'tech', execute: techStep },
              ],
            },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].artifactType).toBe('market_analysis');
      expect(result.artifacts[1].artifactType).toBe('tech_assessment');
      // With no chairman preferences, unapproved technologies trigger new_tech_vendor (HIGH)
      // and novel patterns trigger novel_pattern (MEDIUM), so action is STOP
      expect(result.filterDecision.action).toBe(FILTER_ACTION.STOP);
      const techTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'new_tech_vendor');
      expect(techTrigger).toBeDefined();

      // Verify both steps were called with venture context
      expect(marketStep).toHaveBeenCalledWith(
        expect.objectContaining({ ventureContext: expect.objectContaining({ name: 'Integration Test Venture' }) }),
      );
      expect(techStep).toHaveBeenCalledWith(
        expect.objectContaining({ ventureContext: expect.objectContaining({ name: 'Integration Test Venture' }) }),
      );
    });

    it('should fail when analysis step throws, preserving partial artifacts', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      const successStep = vi.fn().mockResolvedValue({
        artifactType: 'step1_output',
        payload: { data: 'ok' },
        source: 'step1',
      });
      const failingStep = vi.fn().mockRejectedValue(new Error('LLM timeout'));

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: {
              analysisSteps: [
                { id: 'step1', execute: successStep },
                { id: 'step2', execute: failingStep },
              ],
            },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn(),
          validateStageGateFn: vi.fn(),
        },
      );

      expect(result.status).toBe(STATUS.FAILED);
      expect(result.errors[0].code).toBe('ANALYSIS_STEP_FAILED');
      expect(result.errors[0].message).toBe('LLM timeout');
      // First artifact was captured before failure
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].artifactType).toBe('step1_output');
    });

    it('should combine cost trigger + novel pattern trigger from analysis output', async () => {
      const mockSupabase = createIntegrationMockSupabase();

      const step = vi.fn().mockResolvedValue({
        artifactType: 'combined_analysis',
        payload: {
          cost: DEFAULTS['filter.cost_max_usd'] + 10000,
          patterns: ['event-sourcing'],
          priorPatterns: [],
        },
        source: 'combined-step',
      });

      const result = await processStage(
        {
          ventureId: 'v-integ-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'combined', execute: step }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: evaluateDecision,
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.filterDecision.action).toBe(FILTER_ACTION.STOP);

      const costTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'cost_threshold');
      const novelTrigger = result.filterDecision.raw.triggers.find(t => t.type === 'novel_pattern');
      expect(costTrigger).toBeDefined();
      expect(novelTrigger).toBeDefined();
    });
  });

  describe('cross-module boundary validation', () => {
    it('should properly map evaluateRealityGate boundary config to real boundaries', () => {
      // Verify that the boundary config keys match the stage transitions
      const boundaries = Object.keys(BOUNDARY_CONFIG);
      expect(boundaries).toContain('5->6');
      expect(boundaries).toContain('9->10');
      expect(boundaries).toContain('12->13');
      expect(boundaries).toContain('16->17');
      expect(boundaries).toContain('22->23');

      // Each boundary has 3 required artifacts
      for (const key of boundaries) {
        expect(BOUNDARY_CONFIG[key].required_artifacts).toHaveLength(3);
      }
    });

    it('should map decision filter DEFAULTS to orchestrator preferences', () => {
      // Verify the defaults exist and have sensible values
      expect(DEFAULTS['filter.cost_max_usd']).toBeGreaterThan(0);
      expect(DEFAULTS['filter.min_score']).toBeGreaterThan(0);
      expect(DEFAULTS['filter.min_score']).toBeLessThanOrEqual(10);
    });

    it('should verify kill gates and promotion gates are disjoint', () => {
      const killGates = [3, 5, 13, 23];
      const promotionGates = [16, 17, 22];

      for (const stage of killGates) {
        expect(promotionGates).not.toContain(stage);
      }
      for (const stage of promotionGates) {
        expect(killGates).not.toContain(stage);
      }
    });
  });
});
