/**
 * Unit tests for Eva Orchestrator v1
 * SD-LEO-FEAT-EVA-ORCHESTRATOR-001
 *
 * Uses dependency injection (not module mocking) for gate/filter functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processStage, run, _internal } from '../../lib/eva/eva-orchestrator.js';

// ── Test helpers ────────────────────────────────────────────────

function makeChain(resolveValue) {
  const chain = {
    select() { return chain; },
    insert() { return chain; },
    update() { return chain; },
    delete() { return chain; },
    eq() { return chain; },
    single() { return Promise.resolve(resolveValue); },
  };
  return chain;
}

function mockSupabase() {
  const ventureData = {
    id: 'v-001', name: 'Test Venture', status: 'active',
    current_lifecycle_stage: 3, archetype: 'saas', created_at: '2026-01-01',
  };
  return {
    from: (table) => {
      if (table === 'ventures') return makeChain({ data: ventureData, error: null });
      if (table === 'venture_artifacts') return makeChain({ data: { id: 'art-001' }, error: null });
      if (table === 'venture_stage_templates') return makeChain({ data: null, error: null });
      return makeChain({ data: null, error: null });
    },
  };
}

const silentLogger = { log: () => {}, error: () => {}, warn: () => {} };

function baseDeps(overrides = {}) {
  return {
    supabase: mockSupabase(),
    logger: silentLogger,
    evaluateDecisionFn: () => ({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
    evaluateRealityGateFn: async () => ({ passed: true, reasons: [] }),
    validateStageGateFn: async () => ({ passed: true, gate_name: null, details: {} }),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Eva Orchestrator', () => {
  describe('processStage', () => {
    it('returns FAILED when supabase is missing', async () => {
      const result = await processStage({ ventureId: 'v-001' }, {});
      expect(result.status).toBe('FAILED');
      expect(result.errors[0].code).toBe('MISSING_DEPENDENCY');
    });

    it('returns COMPLETED on happy path with auto-proceed', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { autoProceed: true, dryRun: true } },
        baseDeps()
      );
      expect(result.status).toBe('COMPLETED');
      expect(result.ventureId).toBe('v-001');
      expect(result.stageId).toBe(3);
      expect(result.filterDecision.action).toBe('AUTO_PROCEED');
    });

    it('uses provided stageId over venture current stage', async () => {
      const result = await processStage(
        { ventureId: 'v-001', stageId: 7, options: { dryRun: true } },
        baseDeps()
      );
      expect(result.stageId).toBe(7);
      expect(result.status).toBe('COMPLETED');
    });

    it('returns FAILED when venture context load fails', async () => {
      const failSb = {
        from: () => makeChain({ data: null, error: { message: 'Not found' } }),
      };
      const result = await processStage(
        { ventureId: 'v-missing' },
        baseDeps({ supabase: failSb })
      );
      expect(result.status).toBe('FAILED');
      expect(result.errors[0].code).toBe('CONTEXT_LOAD_FAILED');
    });

    it('returns BLOCKED when stage gate fails', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { dryRun: true } },
        baseDeps({
          validateStageGateFn: async () => ({
            passed: false, gate_name: 'KILL_GATE_STAGE_5',
            summary: 'Kill gate failed', status: 'REQUIRES_CHAIRMAN_DECISION',
          }),
        })
      );
      expect(result.status).toBe('BLOCKED');
      expect(result.errors.some(e => e.code === 'STAGE_GATE_FAILED')).toBe(true);
    });

    it('returns BLOCKED when reality gate fails', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { dryRun: true } },
        baseDeps({
          evaluateRealityGateFn: async () => ({
            passed: false, reasons: [{ code: 'ARTIFACT_MISSING', message: 'missing' }],
          }),
        })
      );
      expect(result.status).toBe('BLOCKED');
      expect(result.errors.some(e => e.code === 'REALITY_GATE_FAILED')).toBe(true);
    });

    it('sets REQUIRE_REVIEW when filter engine has non-HIGH triggers', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { dryRun: true } },
        baseDeps({
          evaluateDecisionFn: () => ({
            auto_proceed: false,
            triggers: [{ type: 'low_score', severity: 'MEDIUM', message: 'Score below threshold' }],
            recommendation: 'PRESENT_TO_CHAIRMAN',
          }),
        })
      );
      expect(result.status).toBe('COMPLETED');
      expect(result.filterDecision.action).toBe('REQUIRE_REVIEW');
    });

    it('sets STOP when filter engine has HIGH triggers', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { dryRun: true } },
        baseDeps({
          evaluateDecisionFn: () => ({
            auto_proceed: false,
            triggers: [{ type: 'cost_threshold', severity: 'HIGH', message: 'Cost too high' }],
            recommendation: 'STOP',
          }),
        })
      );
      expect(result.filterDecision.action).toBe('STOP');
    });

    it('executes stage template analysis steps', async () => {
      const stepExecute = vi.fn().mockResolvedValue({
        artifactType: 'analysis', payload: { score: 8 }, source: 'test-step',
      });
      const result = await processStage(
        {
          ventureId: 'v-001',
          options: {
            dryRun: true,
            stageTemplate: {
              stageId: 3, version: '1.0.0',
              analysisSteps: [{ id: 'step-1', execute: stepExecute }],
            },
          },
        },
        baseDeps()
      );
      expect(stepExecute).toHaveBeenCalledOnce();
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].artifactType).toBe('analysis');
    });

    it('returns FAILED when analysis step throws', async () => {
      const result = await processStage(
        {
          ventureId: 'v-001',
          options: {
            dryRun: true,
            stageTemplate: {
              stageId: 3, version: '1.0.0',
              analysisSteps: [{
                id: 'bad-step',
                execute: async () => { throw new Error('Step exploded'); },
              }],
            },
          },
        },
        baseDeps()
      );
      expect(result.status).toBe('FAILED');
      expect(result.errors[0].code).toBe('ANALYSIS_STEP_FAILED');
      expect(result.errors[0].step).toBe('bad-step');
    });

    it('does not advance stage when autoProceed is false', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { autoProceed: false, dryRun: true } },
        baseDeps()
      );
      expect(result.status).toBe('COMPLETED');
      expect(result.nextStageId).toBe(4);
    });

    it('includes correlationId and timestamps', async () => {
      const result = await processStage(
        { ventureId: 'v-001', options: { dryRun: true } },
        baseDeps()
      );
      expect(result.correlationId).toBeDefined();
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });
  });

  describe('run', () => {
    it('stops on BLOCKED status', async () => {
      let callCount = 0;
      const results = await run(
        { ventureId: 'v-001', options: { maxStages: 5, dryRun: true } },
        baseDeps({
          validateStageGateFn: async () => {
            callCount++;
            if (callCount > 1) return { passed: false, summary: 'blocked' };
            return { passed: true, details: {} };
          },
        })
      );
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('COMPLETED');
      expect(results[1].status).toBe('BLOCKED');
    });

    it('stops on REQUIRE_REVIEW', async () => {
      const results = await run(
        { ventureId: 'v-001', options: { maxStages: 10, dryRun: true } },
        baseDeps({
          evaluateDecisionFn: () => ({
            auto_proceed: false,
            triggers: [{ type: 'low_score', severity: 'MEDIUM', message: 'review' }],
            recommendation: 'PRESENT_TO_CHAIRMAN',
          }),
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].filterDecision.action).toBe('REQUIRE_REVIEW');
    });

    it('respects maxStages limit', async () => {
      const results = await run(
        { ventureId: 'v-001', options: { maxStages: 1, dryRun: true } },
        baseDeps()
      );
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('_internal helpers', () => {
    it('buildResult produces correct shape', () => {
      const result = _internal.buildResult({
        ventureId: 'v-001', stageId: 5, startedAt: 'now', correlationId: 'c-1',
        status: 'COMPLETED',
      });
      expect(result).toHaveProperty('ventureId', 'v-001');
      expect(result).toHaveProperty('stageId', 5);
      expect(result).toHaveProperty('status', 'COMPLETED');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('correlationId', 'c-1');
      expect(result).toHaveProperty('artifacts');
      expect(result).toHaveProperty('errors');
    });

    it('mergeArtifactOutputs combines artifact payloads', () => {
      const output = _internal.mergeArtifactOutputs(
        [
          { payload: { cost: 500, score: 8, technologies: ['React'] } },
          { payload: { vendors: ['AWS'], patterns: ['microservices'] } },
        ],
        { name: 'Test Venture' }
      );
      expect(output.cost).toBe(500);
      expect(output.score).toBe(8);
      expect(output.technologies).toEqual(['React']);
      expect(output.vendors).toEqual(['AWS']);
      expect(output.description).toBe('Test Venture');
    });

    it('STATUS and FILTER_ACTION constants are frozen', () => {
      expect(Object.isFrozen(_internal.STATUS)).toBe(true);
      expect(Object.isFrozen(_internal.FILTER_ACTION)).toBe(true);
    });
  });
});
