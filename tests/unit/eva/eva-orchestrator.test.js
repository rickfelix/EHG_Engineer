/**
 * Tests for Eva Orchestrator
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect, vi } from 'vitest';

// Mock transitive deps with shebangs that vitest can't transform
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

vi.mock('../../../lib/eva/devils-advocate.js', () => ({
  isDevilsAdvocateGate: vi.fn().mockReturnValue({ isGate: false, gateType: null }),
  getDevilsAdvocateReview: vi.fn(),
  buildArtifactRecord: vi.fn().mockReturnValue({}),
}));

import { processStage, run, _internal } from '../../../lib/eva/eva-orchestrator.js';
import { isDevilsAdvocateGate, getDevilsAdvocateReview } from '../../../lib/eva/devils-advocate.js';

const { buildResult, mergeArtifactOutputs, STATUS, FILTER_ACTION } = _internal;

function createMockSupabase(overrides = {}) {
  const mockFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'v-1',
        name: 'Test Venture',
        status: 'active',
        current_lifecycle_stage: 1,
        archetype: 'saas',
        created_at: '2026-01-01',
      },
      error: null,
    }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  };

  return {
    from: vi.fn(() => ({ ...mockFrom })),
    _mockFrom: mockFrom,
  };
}

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('EvaOrchestrator', () => {
  describe('processStage - missing dependencies', () => {
    it('should FAIL when supabase is not provided', async () => {
      const result = await processStage({ ventureId: 'v1' }, {});
      expect(result.status).toBe(STATUS.FAILED);
      expect(result.errors[0].code).toBe('MISSING_DEPENDENCY');
    });
  });

  describe('processStage - basic flow', () => {
    it('should process a stage with no template steps', async () => {
      const mockSupabase = createMockSupabase();
      const evaluateDecisionFn = vi.fn().mockReturnValue({
        auto_proceed: true,
        triggers: [],
        recommendation: 'AUTO_PROCEED',
      });
      const evaluateRealityGateFn = vi.fn().mockResolvedValue({ passed: true, status: 'PASS' });
      const validateStageGateFn = vi.fn().mockResolvedValue({ passed: true });

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn,
          evaluateRealityGateFn,
          validateStageGateFn,
        },
      );

      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.ventureId).toBe('v-1');
      expect(result.filterDecision.action).toBe(FILTER_ACTION.AUTO_PROCEED);
    });

    it('should execute template analysis steps', async () => {
      const mockSupabase = createMockSupabase();
      const stepFn = vi.fn().mockResolvedValue({
        artifactType: 'test_output',
        payload: { score: 8, cost: 5000 },
        source: 'test-step',
      });

      const result = await processStage(
        {
          ventureId: 'v-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'step1', execute: stepFn }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(stepFn).toHaveBeenCalled();
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].artifactType).toBe('test_output');
    });
  });

  describe('processStage - gate blocking', () => {
    it('should return BLOCKED when stage gate fails', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn(),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: false, summary: 'Gate requirements not met' }),
        },
      );

      expect(result.status).toBe(STATUS.BLOCKED);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return BLOCKED when reality gate fails', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn(),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: false, error: 'Artifacts missing' }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.status).toBe(STATUS.BLOCKED);
    });
  });

  describe('processStage - filter decisions', () => {
    it('should map HIGH triggers to STOP action', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({
            auto_proceed: false,
            triggers: [{ severity: 'HIGH', message: 'Cost too high' }],
            recommendation: 'PRESENT_TO_CHAIRMAN',
          }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.filterDecision.action).toBe(FILTER_ACTION.STOP);
    });

    it('should map MEDIUM triggers to REQUIRE_REVIEW action', async () => {
      const mockSupabase = createMockSupabase();

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({
            auto_proceed: false,
            triggers: [{ severity: 'MEDIUM', message: 'Low score' }],
            recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
          }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(result.filterDecision.action).toBe(FILTER_ACTION.REQUIRE_REVIEW);
    });
  });

  describe('processStage - context load failure', () => {
    it('should FAIL when venture cannot be loaded', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        })),
      };

      const result = await processStage(
        { ventureId: 'nonexistent' },
        { supabase: mockSupabase, logger: silentLogger },
      );

      expect(result.status).toBe(STATUS.FAILED);
      expect(result.errors[0].code).toBe('CONTEXT_LOAD_FAILED');
    });
  });

  describe('processStage - analysis step failure', () => {
    it('should FAIL when an analysis step throws', async () => {
      const mockSupabase = createMockSupabase();
      const failingStep = vi.fn().mockRejectedValue(new Error('LLM timeout'));

      const result = await processStage(
        {
          ventureId: 'v-1',
          options: {
            dryRun: true,
            stageTemplate: { analysisSteps: [{ id: 'failing', execute: failingStep }] },
          },
        },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn(),
          evaluateRealityGateFn: vi.fn(),
          validateStageGateFn: vi.fn(),
        },
      );

      expect(result.status).toBe(STATUS.FAILED);
      expect(result.errors[0].code).toBe('ANALYSIS_STEP_FAILED');
    });
  });

  describe('run - orchestration loop', () => {
    it('should stop on BLOCKED status', async () => {
      const mockSupabase = createMockSupabase();

      const results = await run(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: false }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(STATUS.BLOCKED);
    });

    it('should stop on REQUIRE_REVIEW filter decision', async () => {
      const mockSupabase = createMockSupabase();

      const results = await run(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({
            auto_proceed: false,
            triggers: [{ severity: 'MEDIUM', message: 'Review needed' }],
            recommendation: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS',
          }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      expect(results).toHaveLength(1);
    });
  });

  describe('internal helpers', () => {
    describe('buildResult', () => {
      it('should build a complete result object', () => {
        const result = buildResult({
          ventureId: 'v1',
          stageId: 5,
          startedAt: '2026-01-01',
          correlationId: 'c1',
          status: STATUS.COMPLETED,
        });
        expect(result.ventureId).toBe('v1');
        expect(result.stageId).toBe(5);
        expect(result.status).toBe('COMPLETED');
        expect(result.completedAt).toBeDefined();
        expect(result.artifacts).toEqual([]);
      });
    });

    describe('mergeArtifactOutputs', () => {
      it('should merge artifact payloads into single output', () => {
        const artifacts = [
          { payload: { cost: 5000, score: 8 } },
          { payload: { technologies: ['React'] } },
        ];
        const output = mergeArtifactOutputs(artifacts, { name: 'TestVenture' });
        expect(output.cost).toBe(5000);
        expect(output.score).toBe(8);
        expect(output.technologies).toEqual(['React']);
        expect(output.description).toBe('TestVenture');
      });

      it('should use venture name as description', () => {
        const output = mergeArtifactOutputs([], { name: 'MyVenture' });
        expect(output.description).toBe('MyVenture');
      });
    });

    describe('STATUS constants', () => {
      it('should define COMPLETED, BLOCKED, FAILED', () => {
        expect(STATUS.COMPLETED).toBe('COMPLETED');
        expect(STATUS.BLOCKED).toBe('BLOCKED');
        expect(STATUS.FAILED).toBe('FAILED');
      });
    });

    describe('FILTER_ACTION constants', () => {
      it('should define AUTO_PROCEED, REQUIRE_REVIEW, STOP', () => {
        expect(FILTER_ACTION.AUTO_PROCEED).toBe('AUTO_PROCEED');
        expect(FILTER_ACTION.REQUIRE_REVIEW).toBe('REQUIRE_REVIEW');
        expect(FILTER_ACTION.STOP).toBe('STOP');
      });
    });
  });

  describe("Devil's Advocate advisory behavior", () => {
    it('should include DA gate result with passed=true on successful review', async () => {
      const mockSupabase = createMockSupabase();
      isDevilsAdvocateGate.mockReturnValue({ isGate: true, gateType: 'kill' });
      getDevilsAdvocateReview.mockResolvedValue({
        overallAssessment: 'Venture has risks but manageable',
        counterArguments: [{ argument: 'Market too small' }, { argument: 'High CAC' }],
        isFallback: false,
      });

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      const daGate = result.gateResults.find(g => g.type === 'devils_advocate');
      expect(daGate).toBeDefined();
      expect(daGate.passed).toBe(true);
      expect(daGate.assessment).toBe('Venture has risks but manageable');
      expect(daGate.counterArguments).toBe(2);
      expect(daGate.isFallback).toBe(false);

      // Restore default mock
      isDevilsAdvocateGate.mockReturnValue({ isGate: false, gateType: null });
    });

    it('should still pass DA gate when getDevilsAdvocateReview throws', async () => {
      const mockSupabase = createMockSupabase();
      isDevilsAdvocateGate.mockReturnValue({ isGate: true, gateType: 'kill' });
      getDevilsAdvocateReview.mockRejectedValue(new Error('GPT-4o unavailable'));

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      const daGate = result.gateResults.find(g => g.type === 'devils_advocate');
      expect(daGate).toBeDefined();
      expect(daGate.passed).toBe(true);
      expect(daGate.error).toBe('GPT-4o unavailable');

      // Restore default mock
      isDevilsAdvocateGate.mockReturnValue({ isGate: false, gateType: null });
    });

    it('should never set status to BLOCKED when only DA fails', async () => {
      const mockSupabase = createMockSupabase();
      isDevilsAdvocateGate.mockReturnValue({ isGate: true, gateType: 'kill' });
      getDevilsAdvocateReview.mockRejectedValue(new Error('DA service down'));

      const result = await processStage(
        { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [] } } },
        {
          supabase: mockSupabase,
          logger: silentLogger,
          evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
          evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true }),
          validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
        },
      );

      // DA failure should NOT block the stage
      expect(result.status).toBe(STATUS.COMPLETED);
      expect(result.status).not.toBe(STATUS.BLOCKED);

      // Restore default mock
      isDevilsAdvocateGate.mockReturnValue({ isGate: false, gateType: null });
    });
  });
});
