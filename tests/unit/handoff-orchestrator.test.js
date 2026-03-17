/**
 * Unit tests for HandoffOrchestrator
 * Tests the main orchestrator at scripts/modules/handoff/HandoffOrchestrator.js
 *
 * Strategy: Mock all dependencies via constructor injection.
 * The orchestrator coordinates executors, validation, recording, and auto-proceed —
 * each dependency is replaced with a vi.fn() mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external modules BEFORE importing the class under test
// ---------------------------------------------------------------------------

// auto-proceed-resolver — returns deterministic values
vi.mock('../../scripts/modules/handoff/auto-proceed-resolver.js', () => ({
  resolveAutoProceed: vi.fn().mockResolvedValue({
    autoProceed: true,
    source: 'default',
    sessionId: 'test-session-001'
  }),
  createHandoffMetadata: vi.fn().mockReturnValue({ mode: 'auto', source: 'default' })
}));

// ResultBuilder — use real implementation so we can assert return shapes
// (no mock needed — it's a pure static class)

// flywheel capture — fire-and-forget, just stub it
vi.mock('../../lib/flywheel/capture.js', () => ({
  captureHandoffGate: vi.fn().mockResolvedValue(undefined)
}));

// safeTruncate — simple passthrough
vi.mock('../../lib/utils/safe-truncate.js', () => ({
  safeTruncate: vi.fn((str, len) => (str && str.length > len ? str.slice(0, len) : str))
}));

// rejection-subagent-mapping — used by ResultBuilder
vi.mock('../../scripts/modules/handoff/rejection-subagent-mapping.js', () => ({
  getRemediation: vi.fn().mockReturnValue(null)
}));

// Supabase client factory — never called because we inject mocks
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn().mockReturnValue({})
}));

// Now import the class under test
import { HandoffOrchestrator, createHandoffSystem } from '../../scripts/modules/handoff/HandoffOrchestrator.js';
import { resolveAutoProceed } from '../../scripts/modules/handoff/auto-proceed-resolver.js';
import { captureHandoffGate } from '../../lib/flywheel/capture.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock executor that resolves with a success result */
function createMockExecutor(overrides = {}) {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, ...overrides }),
    getRequiredGates: vi.fn().mockResolvedValue([]),
    getRemediation: vi.fn().mockReturnValue(null)
  };
}

/** Create a mock executor that resolves with a failure result */
function createFailingExecutor(reasonCode = 'GATE_FAILED', message = 'Validation failed') {
  return {
    execute: vi.fn().mockResolvedValue({
      success: false,
      rejected: true,
      reasonCode,
      message
    }),
    getRequiredGates: vi.fn().mockResolvedValue([]),
    getRemediation: vi.fn().mockReturnValue(null)
  };
}

/** Build the default set of injected dependencies */
function createMockDeps() {
  return {
    supabase: {},
    sdRepo: {
      verifyExists: vi.fn().mockResolvedValue(true),
      getById: vi.fn().mockResolvedValue({
        id: 'uuid-123',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        sd_type: 'feature'
      })
    },
    prdRepo: {
      getByDirectiveId: vi.fn().mockResolvedValue(null)
    },
    handoffRepo: {
      loadTemplate: vi.fn().mockResolvedValue({ id: 'tmpl-1', name: 'Test Template' }),
      listExecutions: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({ total: 0 })
    },
    validationOrchestrator: {
      validateGatesAll: vi.fn().mockResolvedValue({
        passed: true,
        passedGates: [{ name: 'GATE_1' }],
        failedGates: []
      })
    },
    contentBuilder: {},
    recorder: {
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn().mockResolvedValue(undefined)
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandoffOrchestrator', () => {
  let deps;
  let orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    orchestrator = new HandoffOrchestrator(deps);
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should accept injected dependencies', () => {
      expect(orchestrator.sdRepo).toBe(deps.sdRepo);
      expect(orchestrator.prdRepo).toBe(deps.prdRepo);
      expect(orchestrator.handoffRepo).toBe(deps.handoffRepo);
      expect(orchestrator.validationOrchestrator).toBe(deps.validationOrchestrator);
      expect(orchestrator.recorder).toBe(deps.recorder);
    });

    it('should list all 5 supported handoff types', () => {
      expect(orchestrator.supportedHandoffs).toEqual([
        'LEAD-TO-PLAN',
        'PLAN-TO-EXEC',
        'EXEC-TO-PLAN',
        'PLAN-TO-LEAD',
        'LEAD-FINAL-APPROVAL'
      ]);
    });

    it('should accept pre-built executors map', () => {
      const executors = { 'LEAD-TO-PLAN': createMockExecutor() };
      const o = new HandoffOrchestrator({ ...deps, executors });
      expect(o._executors).toBe(executors);
    });
  });

  // =========================================================================
  // createHandoffSystem factory
  // =========================================================================
  describe('createHandoffSystem', () => {
    it('should return a HandoffOrchestrator instance', () => {
      const system = createHandoffSystem(deps);
      expect(system).toBeInstanceOf(HandoffOrchestrator);
    });
  });

  // =========================================================================
  // registerExecutor
  // =========================================================================
  describe('registerExecutor', () => {
    it('should register an executor and normalize the type to uppercase', () => {
      const executor = createMockExecutor();
      orchestrator.registerExecutor('lead-to-plan', executor);
      expect(orchestrator._executors['LEAD-TO-PLAN']).toBe(executor);
    });

    it('should initialize _executors map if null', () => {
      orchestrator._executors = null;
      const executor = createMockExecutor();
      orchestrator.registerExecutor('PLAN-TO-EXEC', executor);
      expect(orchestrator._executors['PLAN-TO-EXEC']).toBe(executor);
    });
  });

  // =========================================================================
  // executeHandoff — routing to correct executor
  // =========================================================================
  describe('executeHandoff', () => {
    const HANDOFF_TYPES = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'LEAD-FINAL-APPROVAL'
    ];

    for (const type of HANDOFF_TYPES) {
      it(`should route ${type} to its registered executor`, async () => {
        const executor = createMockExecutor();
        orchestrator.registerExecutor(type, executor);

        const result = await orchestrator.executeHandoff(type, 'SD-TEST-001');

        expect(result.success).toBe(true);
        expect(executor.execute).toHaveBeenCalledTimes(1);
        expect(executor.execute).toHaveBeenCalledWith('SD-TEST-001', expect.objectContaining({
          autoProceed: true
        }));
      });
    }

    it('should normalize lowercase handoff type to uppercase', async () => {
      const executor = createMockExecutor();
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      const result = await orchestrator.executeHandoff('lead-to-plan', 'SD-TEST-001');

      expect(result.success).toBe(true);
      expect(executor.execute).toHaveBeenCalledTimes(1);
    });

    it('should reject unknown handoff type', async () => {
      // Register a valid executor so _getExecutor can work,
      // but pass an invalid type
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      const result = await orchestrator.executeHandoff('INVALID-TYPE', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
      expect(result.message).toContain('INVALID-TYPE');
    });

    it('should reject when executor not found', async () => {
      // Set _executors to an empty map (no lazy loading)
      orchestrator._executors = {};

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('EXECUTOR_NOT_FOUND');
    });

    it('should verify SD exists before proceeding', async () => {
      const executor = createMockExecutor();
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(deps.sdRepo.verifyExists).toHaveBeenCalledWith('SD-TEST-001');
    });

    it('should return system error when SD does not exist', async () => {
      deps.sdRepo.verifyExists.mockRejectedValue(new Error('SD not found: SD-MISSING'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-MISSING');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toContain('SD not found');
    });

    it('should resolve auto-proceed before execution', async () => {
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(resolveAutoProceed).toHaveBeenCalledWith(
        expect.objectContaining({ supabase: deps.supabase, verbose: true })
      );
    });

    it('should include autoProceed in the result on success', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createMockExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.autoProceed).toBe(true);
      expect(result.autoProceedSource).toBe('default');
    });

    it('should include autoProceed in the result even on executor failure', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createFailingExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.autoProceed).toBe(true);
    });
  });

  // =========================================================================
  // executeHandoff — recording
  // =========================================================================
  describe('executeHandoff recording', () => {
    it('should record success when executor succeeds', async () => {
      const executor = createMockExecutor({ phaseProgress: 100 });
      orchestrator.registerExecutor('PLAN-TO-EXEC', executor);

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(deps.recorder.recordSuccess).toHaveBeenCalledTimes(1);
      expect(deps.recorder.recordSuccess).toHaveBeenCalledWith(
        'PLAN-TO-EXEC',
        'SD-TEST-001',
        expect.objectContaining({ success: true }),
        expect.any(Object) // template
      );
    });

    it('should record failure when executor returns non-success (not systemError)', async () => {
      orchestrator.registerExecutor('EXEC-TO-PLAN', createFailingExecutor());

      await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');

      expect(deps.recorder.recordFailure).toHaveBeenCalledTimes(1);
      expect(deps.recorder.recordSuccess).not.toHaveBeenCalled();
    });

    it('should record system error when an exception is thrown', async () => {
      const executor = {
        execute: vi.fn().mockRejectedValue(new Error('DB connection lost'))
      };
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.systemError).toBe(true);
      expect(deps.recorder.recordSystemError).toHaveBeenCalledWith(
        'LEAD-TO-PLAN',
        'SD-TEST-001',
        'DB connection lost'
      );
    });

    it('should not record failure for system errors (no double-recording)', async () => {
      const executor = {
        execute: vi.fn().mockRejectedValue(new Error('timeout'))
      };
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(deps.recorder.recordFailure).not.toHaveBeenCalled();
      expect(deps.recorder.recordSystemError).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // executeHandoff — flywheel capture
  // =========================================================================
  describe('executeHandoff flywheel capture', () => {
    it('should fire captureHandoffGate on success', async () => {
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(captureHandoffGate).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        'LEAD-TO-PLAN',
        'SD-TEST-001',
        'test-session-001'
      );
    });

    it('should fire captureHandoffGate on failure too', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createFailingExecutor());

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(captureHandoffGate).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // executeHandoff — deferred PRD generation
  // =========================================================================
  describe('executeHandoff deferred PRD generation', () => {
    it('should call _executeDeferredPrdGeneration when result has _deferredPrdGeneration', async () => {
      const executor = createMockExecutor({
        _deferredPrdGeneration: { sdId: 'SD-TEST-001', sd: { id: 'uuid-1', title: 'Test' } }
      });
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      // Spy on the deferred method
      const spy = vi.spyOn(orchestrator, '_executeDeferredPrdGeneration').mockResolvedValue(undefined);

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(spy).toHaveBeenCalledWith({
        sdId: 'SD-TEST-001',
        sd: { id: 'uuid-1', title: 'Test' }
      });
    });

    it('should not call deferred PRD generation when flag is absent', async () => {
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());
      const spy = vi.spyOn(orchestrator, '_executeDeferredPrdGeneration');

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeHandoff — self-critique pre-flight
  // =========================================================================
  describe('self-critique pre-flight (_validateSelfCritique)', () => {
    it('should not block when no self-critique is provided (soft enforcement)', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {});

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBeNull();
    });

    it('should not block with high confidence (>= 7)', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: { confidence: 9, reasoning: 'All gates pass' }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.confidence).toBe(9);
    });

    it('should warn but not block with medium confidence (5-6)', () => {
      const result = orchestrator._validateSelfCritique('EXEC-TO-PLAN', {
        self_critique: { confidence: 6, reasoning: 'Some concerns' }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBe(6);
    });

    it('should block with low confidence (< 5) and no explanation', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-LEAD', {
        self_critique: { confidence: 3 }
      });

      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(3);
    });

    it('should not block low confidence when sufficient reasoning is provided', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-LEAD', {
        self_critique: {
          confidence: 3,
          reasoning: 'The retrospective has known issues but they are documented and tracked in JIRA'
        }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBe(3);
    });

    it('should accept numeric self_critique as confidence directly', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
        self_critique: 8
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(8);
    });

    it('should accept selfCritique (camelCase) option key', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
        selfCritique: { confidence: 9 }
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(9);
    });

    it('should accept confidence option key directly', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
        confidence: { score: 8 }
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(8);
    });

    it('should block handoff execution when self-critique blocks', async () => {
      orchestrator.registerExecutor('PLAN-TO-LEAD', createMockExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-TEST-001', {
        self_critique: { confidence: 2 }
      });

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('LOW_CONFIDENCE');
    });

    it('should include gaps in medium-confidence results', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: {
          confidence: 5,
          gaps: ['Missing integration tests', 'No load testing']
        }
      });

      expect(result.gaps).toEqual(['Missing integration tests', 'No load testing']);
    });
  });

  // =========================================================================
  // executeHandoff — template loading
  // =========================================================================
  describe('executeHandoff template loading', () => {
    it('should load template from handoffRepo', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createMockExecutor());

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(deps.handoffRepo.loadTemplate).toHaveBeenCalledWith('PLAN-TO-EXEC');
    });

    it('should continue without template when none is found', async () => {
      deps.handoffRepo.loadTemplate.mockResolvedValue(null);
      orchestrator.registerExecutor('PLAN-TO-EXEC', createMockExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // precheckHandoff
  // =========================================================================
  describe('precheckHandoff', () => {
    it('should return failure for unsupported handoff type', async () => {
      const result = await orchestrator.precheckHandoff('INVALID-TYPE', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.failedGates).toHaveLength(1);
      expect(result.failedGates[0].name).toBe('HANDOFF_TYPE');
    });

    it('should return failure when SD not found', async () => {
      deps.sdRepo.getById.mockResolvedValue(null);

      const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-MISSING');

      expect(result.success).toBe(false);
      expect(result.failedGates[0].name).toBe('SD_EXISTS');
    });

    it('should return failure when no executor is found', async () => {
      // Empty executors map
      orchestrator._executors = {};

      const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.failedGates[0].name).toBe('EXECUTOR');
    });

    it('should validate all gates without stopping on first failure', async () => {
      const executor = createMockExecutor();
      executor.getRequiredGates.mockResolvedValue([
        { name: 'GATE_A' },
        { name: 'GATE_B' },
        { name: 'GATE_C' }
      ]);
      orchestrator.registerExecutor('PLAN-TO-EXEC', executor);

      deps.validationOrchestrator.validateGatesAll.mockResolvedValue({
        passed: false,
        passedGates: [{ name: 'GATE_A' }],
        failedGates: [
          { name: 'GATE_B', issues: ['Missing PRD'] },
          { name: 'GATE_C', issues: ['No tests'] }
        ]
      });

      const result = await orchestrator.precheckHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.passedGates).toHaveLength(1);
      expect(result.failedGates).toHaveLength(2);
    });

    it('should return success when all gates pass', async () => {
      const executor = createMockExecutor();
      executor.getRequiredGates.mockResolvedValue([{ name: 'GATE_A' }]);
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      deps.validationOrchestrator.validateGatesAll.mockResolvedValue({
        passed: true,
        passedGates: [{ name: 'GATE_A' }],
        failedGates: []
      });

      const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(true);
      expect(result.handoffType).toBe('LEAD-TO-PLAN');
      expect(result.sdTitle).toBe('Test SD');
    });

    it('should normalize handoff type to uppercase', async () => {
      const executor = createMockExecutor();
      executor.getRequiredGates.mockResolvedValue([]);
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      deps.validationOrchestrator.validateGatesAll.mockResolvedValue({
        passed: true,
        passedGates: [],
        failedGates: []
      });

      const result = await orchestrator.precheckHandoff('lead-to-plan', 'SD-TEST-001');

      expect(result.handoffType).toBe('LEAD-TO-PLAN');
    });

    it('should pass precheckMode flag to validation orchestrator', async () => {
      const executor = createMockExecutor();
      executor.getRequiredGates.mockResolvedValue([{ name: 'G1' }]);
      orchestrator.registerExecutor('PLAN-TO-EXEC', executor);

      deps.validationOrchestrator.validateGatesAll.mockResolvedValue({
        passed: true,
        passedGates: [{ name: 'G1' }],
        failedGates: []
      });

      await orchestrator.precheckHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(deps.validationOrchestrator.validateGatesAll).toHaveBeenCalledWith(
        [{ name: 'G1' }],
        expect.objectContaining({ precheckMode: true })
      );
    });

    it('should handle exceptions gracefully', async () => {
      deps.sdRepo.getById.mockRejectedValue(new Error('Network timeout'));

      const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.failedGates[0].name).toBe('SYSTEM');
    });
  });

  // =========================================================================
  // listHandoffExecutions & getHandoffStats
  // =========================================================================
  describe('listHandoffExecutions', () => {
    it('should delegate to handoffRepo.listExecutions', async () => {
      const filters = { sdId: 'SD-TEST-001' };
      await orchestrator.listHandoffExecutions(filters);

      expect(deps.handoffRepo.listExecutions).toHaveBeenCalledWith(filters);
    });
  });

  describe('getHandoffStats', () => {
    it('should delegate to handoffRepo.getStats', async () => {
      await orchestrator.getHandoffStats();

      expect(deps.handoffRepo.getStats).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Error resilience
  // =========================================================================
  describe('error resilience', () => {
    it('should return systemError when resolveAutoProceed throws', async () => {
      resolveAutoProceed.mockRejectedValueOnce(new Error('Session lookup failed'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toContain('Session lookup failed');
    });

    it('should return systemError when recorder.recordSuccess throws', async () => {
      deps.recorder.recordSuccess.mockRejectedValue(new Error('Insert failed'));
      orchestrator.registerExecutor('PLAN-TO-EXEC', createMockExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
    });

    it('should not crash when captureHandoffGate rejects (fire-and-forget)', async () => {
      captureHandoffGate.mockRejectedValueOnce(new Error('Flywheel down'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createMockExecutor());

      // Should not throw
      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // _executeDeferredPrdGeneration (inline mode)
  // =========================================================================
  describe('_executeDeferredPrdGeneration inline mode', () => {
    it('should log inline instructions when LLM_PRD_INLINE is not false', async () => {
      const originalEnv = process.env.LLM_PRD_INLINE;
      delete process.env.LLM_PRD_INLINE;

      // Should return without spawning
      await orchestrator._executeDeferredPrdGeneration({
        sdId: 'SD-TEST-001',
        sd: { id: 'uuid-123', title: 'Test SD' }
      });

      // No error thrown — inline mode just logs
      process.env.LLM_PRD_INLINE = originalEnv;
    });
  });
});
