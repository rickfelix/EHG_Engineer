/**
 * Unit tests for HandoffOrchestrator
 * SD-LEO-INFRA-HANDOFF-ORCHESTRATOR-UNIT-001
 *
 * Covers:
 * - All 5 handoff types: LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
 * - Executor selection per handoff type
 * - Auto-proceed detection
 * - Self-critique blocking (low confidence)
 * - Gate policy resolver cache behavior
 *
 * All external dependencies (Supabase, DB, file system) are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external modules BEFORE importing HandoffOrchestrator
// ---------------------------------------------------------------------------

// Mock Supabase client factory — no real DB is touched anywhere in this suite,
// so no describeDb / HAS_REAL_DB guard is needed (the factory below returns an
// inert stub; the DB-import audit matches the mocked symbol name only).
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ _mock: true }))
}));

// Mock safeTruncate (used in _validateSelfCritique logging)
vi.mock('../../../lib/utils/safe-truncate.js', () => ({
  safeTruncate: vi.fn((str, max) => (str && str.length > max ? str.substring(0, max) : str || ''))
}));

// Mock flywheel capture (fire-and-forget)
vi.mock('../../../lib/flywheel/capture.js', () => ({
  captureHandoffGate: vi.fn(() => Promise.resolve())
}));

// Mock auto-proceed-resolver
vi.mock('../../../scripts/modules/handoff/auto-proceed-resolver.js', () => ({
  resolveAutoProceed: vi.fn(() => Promise.resolve({
    autoProceed: true,
    source: 'default',
    sessionId: 'session-mock-001'
  })),
  createHandoffMetadata: vi.fn((ap, src) => ({
    autoProceed: ap,
    autoProceedSource: src,
    autoProceedResolvedAt: '2026-03-17T00:00:00.000Z'
  }))
}));

// Mock rejection-subagent-mapping (imported by ResultBuilder)
vi.mock('../../../scripts/modules/handoff/rejection-subagent-mapping.js', () => ({
  getRemediation: vi.fn(() => null)
}));

// ---------------------------------------------------------------------------
// Now import the class under test
// ---------------------------------------------------------------------------
import { HandoffOrchestrator, createHandoffSystem } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';
import { resolveAutoProceed } from '../../../scripts/modules/handoff/auto-proceed-resolver.js';
import { captureHandoffGate } from '../../../lib/flywheel/capture.js';
import { ResultBuilder } from '../../../scripts/modules/handoff/ResultBuilder.js';
import {
  WORKFLOW_BY_SD_TYPE,
  getWorkflowForType,
  isHandoffRequired,
  isHandoffOptional
} from '../../../scripts/modules/handoff/cli/workflow-definitions.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

/**
 * Create a mock executor that returns a configurable result.
 */
function createMockExecutor(result = { success: true }) {
  return {
    execute: vi.fn(() => Promise.resolve({ ...result })),
    getRequiredGates: vi.fn(() => Promise.resolve([])),
    getRemediation: vi.fn(() => null)
  };
}

/**
 * Build a HandoffOrchestrator with all dependencies mocked.
 * Accepts overrides for individual dependencies.
 */
function createTestOrchestrator(overrides = {}) {
  const supabase = overrides.supabase || { _mock: true };

  const sdRepo = overrides.sdRepo || {
    verifyExists: vi.fn(() => Promise.resolve({ id: 'uuid-123', sd_key: 'SD-TEST-001', title: 'Test SD' })),
    getById: vi.fn(() => Promise.resolve({ id: 'uuid-123', sd_key: 'SD-TEST-001', title: 'Test SD' }))
  };

  const prdRepo = overrides.prdRepo || {
    getByDirectiveId: vi.fn(() => Promise.resolve(null))
  };

  const handoffRepo = overrides.handoffRepo || {
    loadTemplate: vi.fn(() => Promise.resolve({ id: 'tmpl-1', name: 'Test Template' })),
    listExecutions: vi.fn(() => Promise.resolve([])),
    getStats: vi.fn(() => Promise.resolve({}))
  };

  const recorder = overrides.recorder || {
    recordSuccess: vi.fn(() => Promise.resolve()),
    recordFailure: vi.fn(() => Promise.resolve()),
    recordSystemError: vi.fn(() => Promise.resolve())
  };

  const validationOrchestrator = overrides.validationOrchestrator || {
    validateGatesAll: vi.fn(() => Promise.resolve({ passed: true, passedGates: [], failedGates: [] }))
  };

  const contentBuilder = overrides.contentBuilder || {};

  // Build executor map with all 5 types
  const executors = overrides.executors || {
    'LEAD-TO-PLAN': createMockExecutor(),
    'PLAN-TO-EXEC': createMockExecutor(),
    'EXEC-TO-PLAN': createMockExecutor(),
    'PLAN-TO-LEAD': createMockExecutor(),
    'LEAD-FINAL-APPROVAL': createMockExecutor()
  };

  return new HandoffOrchestrator({
    supabase,
    sdRepo,
    prdRepo,
    handoffRepo,
    recorder,
    validationOrchestrator,
    contentBuilder,
    executors
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HandoffOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auto-proceed to default behavior
    resolveAutoProceed.mockResolvedValue({
      autoProceed: true,
      source: 'default',
      sessionId: 'session-mock-001'
    });
  });

  // =========================================================================
  // 1. Executor selection for all 5 handoff types
  // =========================================================================
  describe('Executor selection', () => {
    const HANDOFF_TYPES = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'LEAD-FINAL-APPROVAL'
    ];

    it.each(HANDOFF_TYPES)(
      'selects the correct executor for %s',
      async (type) => {
        const executors = {};
        for (const t of HANDOFF_TYPES) {
          executors[t] = createMockExecutor();
        }

        const orchestrator = createTestOrchestrator({ executors });
        await orchestrator.executeHandoff(type, 'SD-TEST-001');

        // Only the matching executor should have been called
        expect(executors[type].execute).toHaveBeenCalledOnce();
        expect(executors[type].execute).toHaveBeenCalledWith(
          'SD-TEST-001',
          expect.objectContaining({ autoProceed: true })
        );

        // All other executors should NOT have been called
        for (const t of HANDOFF_TYPES) {
          if (t !== type) {
            expect(executors[t].execute).not.toHaveBeenCalled();
          }
        }
      }
    );

    it('normalizes lowercase handoff type to uppercase', async () => {
      const executors = {
        'LEAD-TO-PLAN': createMockExecutor(),
        'PLAN-TO-EXEC': createMockExecutor(),
        'EXEC-TO-PLAN': createMockExecutor(),
        'PLAN-TO-LEAD': createMockExecutor(),
        'LEAD-FINAL-APPROVAL': createMockExecutor()
      };
      const orchestrator = createTestOrchestrator({ executors });

      await orchestrator.executeHandoff('plan-to-exec', 'SD-TEST-001');
      expect(executors['PLAN-TO-EXEC'].execute).toHaveBeenCalledOnce();
    });

    it('returns unsupported type error for unknown handoff type', async () => {
      const orchestrator = createTestOrchestrator();
      const result = await orchestrator.executeHandoff('UNKNOWN-TYPE', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
    });

    it('returns EXECUTOR_NOT_FOUND when executor is missing', async () => {
      const orchestrator = createTestOrchestrator({
        executors: {
          // Missing LEAD-TO-PLAN executor
          'PLAN-TO-EXEC': createMockExecutor()
        }
      });

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');
      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.reasonCode).toBe('EXECUTOR_NOT_FOUND');
    });
  });

  // =========================================================================
  // 2. Success and failure recording
  // =========================================================================
  describe('Result recording', () => {
    it('records success when executor returns success', async () => {
      const recorder = {
        recordSuccess: vi.fn(() => Promise.resolve()),
        recordFailure: vi.fn(() => Promise.resolve()),
        recordSystemError: vi.fn(() => Promise.resolve())
      };

      const orchestrator = createTestOrchestrator({ recorder });
      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(true);
      expect(recorder.recordSuccess).toHaveBeenCalledOnce();
      expect(recorder.recordFailure).not.toHaveBeenCalled();
    });

    it('records failure when executor returns failure (non-system)', async () => {
      const recorder = {
        recordSuccess: vi.fn(() => Promise.resolve()),
        recordFailure: vi.fn(() => Promise.resolve()),
        recordSystemError: vi.fn(() => Promise.resolve())
      };

      const failExecutor = createMockExecutor({ success: false, rejected: true, reasonCode: 'GATE_FAILED' });
      const orchestrator = createTestOrchestrator({
        recorder,
        executors: {
          'PLAN-TO-EXEC': failExecutor,
          'LEAD-TO-PLAN': createMockExecutor(),
          'EXEC-TO-PLAN': createMockExecutor(),
          'PLAN-TO-LEAD': createMockExecutor(),
          'LEAD-FINAL-APPROVAL': createMockExecutor()
        }
      });

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(recorder.recordFailure).toHaveBeenCalledOnce();
      expect(recorder.recordSuccess).not.toHaveBeenCalled();
    });

    it('records system error when executor throws', async () => {
      const recorder = {
        recordSuccess: vi.fn(() => Promise.resolve()),
        recordFailure: vi.fn(() => Promise.resolve()),
        recordSystemError: vi.fn(() => Promise.resolve())
      };

      const throwingExecutor = {
        execute: vi.fn(() => Promise.reject(new Error('Database connection lost')))
      };

      const orchestrator = createTestOrchestrator({
        recorder,
        executors: {
          'EXEC-TO-PLAN': throwingExecutor,
          'LEAD-TO-PLAN': createMockExecutor(),
          'PLAN-TO-EXEC': createMockExecutor(),
          'PLAN-TO-LEAD': createMockExecutor(),
          'LEAD-FINAL-APPROVAL': createMockExecutor()
        }
      });

      const result = await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toBe('Database connection lost');
      expect(recorder.recordSystemError).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // 3. Auto-proceed detection
  // =========================================================================
  describe('Auto-proceed detection', () => {
    it('injects autoProceed=true into executor options when resolved as enabled', async () => {
      resolveAutoProceed.mockResolvedValue({
        autoProceed: true,
        source: 'session',
        sessionId: 'sess-123'
      });

      const executor = createMockExecutor();
      const orchestrator = createTestOrchestrator({
        executors: {
          'LEAD-TO-PLAN': executor,
          'PLAN-TO-EXEC': createMockExecutor(),
          'EXEC-TO-PLAN': createMockExecutor(),
          'PLAN-TO-LEAD': createMockExecutor(),
          'LEAD-FINAL-APPROVAL': createMockExecutor()
        }
      });

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      const callOptions = executor.execute.mock.calls[0][1];
      expect(callOptions.autoProceed).toBe(true);
      expect(callOptions.autoProceedSource).toBe('session');
      expect(callOptions.autoProceedSessionId).toBe('sess-123');
    });

    it('injects autoProceed=false into executor options when resolved as disabled', async () => {
      resolveAutoProceed.mockResolvedValue({
        autoProceed: false,
        source: 'cli',
        sessionId: null
      });

      const executor = createMockExecutor();
      const orchestrator = createTestOrchestrator({
        executors: {
          'PLAN-TO-EXEC': executor,
          'LEAD-TO-PLAN': createMockExecutor(),
          'EXEC-TO-PLAN': createMockExecutor(),
          'PLAN-TO-LEAD': createMockExecutor(),
          'LEAD-FINAL-APPROVAL': createMockExecutor()
        }
      });

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      const callOptions = executor.execute.mock.calls[0][1];
      expect(callOptions.autoProceed).toBe(false);
      expect(callOptions.autoProceedSource).toBe('cli');
    });

    it('attaches autoProceed to the result', async () => {
      resolveAutoProceed.mockResolvedValue({
        autoProceed: true,
        source: 'env',
        sessionId: null
      });

      const orchestrator = createTestOrchestrator();
      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.autoProceed).toBe(true);
      expect(result.autoProceedSource).toBe('env');
    });
  });

  // =========================================================================
  // 4. Self-critique blocking (low confidence)
  // =========================================================================
  describe('Self-critique pre-flight', () => {
    it('blocks handoff when confidence < 5 and no explanation', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001', {
        self_critique: { confidence: 3 }
      });

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.reasonCode).toBe('LOW_CONFIDENCE');
      expect(result.message).toContain('Low confidence');
    });

    it('blocks handoff when confidence is 1 with short reasoning', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001', {
        self_critique: { confidence: 1, reasoning: 'too short' }
      });

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('LOW_CONFIDENCE');
    });

    it('allows handoff when confidence < 5 but has sufficient explanation', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001', {
        self_critique: {
          confidence: 4,
          reasoning: 'The implementation is incomplete because the API endpoint has not been deployed yet, but the code is ready'
        }
      });

      // Should proceed (not blocked) because explanation is provided
      expect(result.success).toBe(true);
    });

    it('allows handoff with warning when confidence is 5-6', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001', {
        self_critique: { confidence: 6, reasoning: 'mostly complete' }
      });

      expect(result.success).toBe(true);
    });

    it('allows handoff without warning when confidence >= 7', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001', {
        self_critique: { confidence: 9 }
      });

      expect(result.success).toBe(true);
    });

    it('allows handoff with soft warning when no self_critique provided', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('PLAN-TO-LEAD', 'SD-TEST-001');

      // No self-critique = soft enforcement, should not block
      expect(result.success).toBe(true);
    });

    it('accepts numeric confidence directly (not object)', async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001', {
        confidence: 2
      });

      // confidence=2 with no reasoning → blocked
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('LOW_CONFIDENCE');
    });
  });

  // =========================================================================
  // 5. Flywheel capture
  // =========================================================================
  describe('Flywheel capture', () => {
    it('fires captureHandoffGate on successful handoff', async () => {
      const orchestrator = createTestOrchestrator();
      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(captureHandoffGate).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        'LEAD-TO-PLAN',
        'SD-TEST-001',
        'session-mock-001'
      );
    });
  });

  // =========================================================================
  // 6. Precheck mode
  // =========================================================================
  describe('precheckHandoff', () => {
    it('returns unsupported type for invalid handoff type', async () => {
      const orchestrator = createTestOrchestrator();
      const result = await orchestrator.precheckHandoff('INVALID-TYPE', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.failedGates).toHaveLength(1);
      expect(result.failedGates[0].name).toBe('HANDOFF_TYPE');
    });

    it('returns SD_EXISTS failure when SD is not found', async () => {
      const sdRepo = {
        verifyExists: vi.fn(() => Promise.resolve(null)),
        getById: vi.fn(() => Promise.resolve(null))
      };

      const orchestrator = createTestOrchestrator({ sdRepo });
      const result = await orchestrator.precheckHandoff('PLAN-TO-EXEC', 'SD-MISSING-999');

      expect(result.success).toBe(false);
      expect(result.failedGates[0].name).toBe('SD_EXISTS');
    });

    it('returns EXECUTOR failure when no executor registered', async () => {
      const orchestrator = createTestOrchestrator({
        executors: {} // empty — no executors
      });

      const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.failedGates[0].name).toBe('EXECUTOR');
    });

    it('returns success when all gates pass', async () => {
      const orchestrator = createTestOrchestrator();
      const result = await orchestrator.precheckHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(true);
      expect(result.handoffType).toBe('PLAN-TO-EXEC');
      expect(result.sdId).toBe('SD-TEST-001');
    });
  });

  // =========================================================================
  // 7. registerExecutor
  // =========================================================================
  describe('registerExecutor', () => {
    it('allows registering a custom executor at runtime', async () => {
      const orchestrator = createTestOrchestrator({
        executors: {} // start empty
      });

      const customExecutor = createMockExecutor({ success: true, custom: true });
      orchestrator.registerExecutor('LEAD-TO-PLAN', customExecutor);

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');
      expect(result.success).toBe(true);
      expect(customExecutor.execute).toHaveBeenCalledOnce();
    });

    it('normalizes registered executor type to uppercase', async () => {
      const orchestrator = createTestOrchestrator({ executors: {} });

      const customExecutor = createMockExecutor({ success: true });
      orchestrator.registerExecutor('exec-to-plan', customExecutor);

      const result = await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');
      expect(result.success).toBe(true);
      expect(customExecutor.execute).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // 8. Deferred PRD generation (inline mode)
  // =========================================================================
  describe('Deferred PRD generation', () => {
    it('handles deferred PRD generation in inline mode without error', async () => {
      const executor = createMockExecutor({
        success: true,
        _deferredPrdGeneration: { sdId: 'SD-TEST-001', sd: { id: 'uuid-123', title: 'Test' } }
      });

      const orchestrator = createTestOrchestrator({
        executors: {
          'LEAD-TO-PLAN': executor,
          'PLAN-TO-EXEC': createMockExecutor(),
          'EXEC-TO-PLAN': createMockExecutor(),
          'PLAN-TO-LEAD': createMockExecutor(),
          'LEAD-FINAL-APPROVAL': createMockExecutor()
        }
      });

      // LLM_PRD_INLINE defaults to not 'false', so inline mode runs
      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');
      expect(result.success).toBe(true);
    });
  });
});

// ===========================================================================
// Gate Policy Resolver — cache behavior tests
// ===========================================================================
describe('Gate Policy Resolver — cache behavior', () => {
  // We import the actual module (already tested in gate-policy-resolver.test.js)
  // but focus specifically on cache hit/miss/expiry and timeout behavior here
  let applyGatePolicies, resetGatePolicyMetrics, invalidatePolicyCache, getGatePolicyMetrics;

  beforeEach(async () => {
    // Dynamic import to get fresh references
    const mod = await import('../../../scripts/modules/handoff/gate-policy-resolver.js');
    applyGatePolicies = mod.applyGatePolicies;
    resetGatePolicyMetrics = mod.resetGatePolicyMetrics;
    invalidatePolicyCache = mod.invalidatePolicyCache;
    getGatePolicyMetrics = mod.getGatePolicyMetrics;

    resetGatePolicyMetrics();
    invalidatePolicyCache();
  });

  const mockGates = [
    { name: 'GATE_A', validator: vi.fn(), required: true },
    { name: 'GATE_B', validator: vi.fn(), required: true }
  ];

  function createCacheTestSupabase(policies = []) {
    return {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockResolvedValue({ data: policies, error: null })
    };
  }

  it('uses cached data on second call (cache hit)', async () => {
    const policies = [
      { gate_key: 'GATE_A', sd_type: 'uat', validation_profile: null, applicability: 'DISABLED', reason: 'test' }
    ];
    const supabase = createCacheTestSupabase(policies);

    // First call — fetches from DB
    await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });
    expect(supabase.from).toHaveBeenCalledTimes(1);

    // Second call — should use cache (no additional DB call)
    await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });
    expect(supabase.from).toHaveBeenCalledTimes(1); // still 1
  });

  it('refreshes cache after invalidation (cache miss)', async () => {
    const policies = [];
    const supabase = createCacheTestSupabase(policies);

    await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });
    expect(supabase.from).toHaveBeenCalledTimes(1);

    invalidatePolicyCache();

    await applyGatePolicies(supabase, mockGates, { sdType: 'uat' });
    expect(supabase.from).toHaveBeenCalledTimes(2); // re-fetched
  });

  it('cache expires after TTL and re-fetches', async () => {
    const policies = [];
    const supabase = createCacheTestSupabase(policies);

    // First call — populates cache
    await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });
    expect(supabase.from).toHaveBeenCalledTimes(1);

    // Advance time beyond the cache TTL (default 60s)
    const realDateNow = Date.now;
    Date.now = vi.fn(() => realDateNow() + 120_000); // 120 seconds later

    await applyGatePolicies(supabase, mockGates, { sdType: 'feature' });
    expect(supabase.from).toHaveBeenCalledTimes(2); // cache expired, re-fetched

    // Restore
    Date.now = realDateNow;
  });

  it('falls back to all gates when DB returns an error (timeout behavior)', async () => {
    const errorSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } })
    };

    const result = await applyGatePolicies(errorSupabase, mockGates, { sdType: 'uat' });

    expect(result.filteredGates).toHaveLength(2); // all gates returned (fail-open)
    expect(result.fallbackUsed).toBe(true);

    const metrics = getGatePolicyMetrics();
    expect(metrics.dbFallbackTotal).toBe(1);
  });

  it('falls back when abortSignal throws AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const timeoutSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockRejectedValue(abortError)
    };

    const result = await applyGatePolicies(timeoutSupabase, mockGates, { sdType: 'uat' });

    expect(result.filteredGates).toHaveLength(2);
    expect(result.fallbackUsed).toBe(true);
  });
});

// ===========================================================================
// Self-critique blocking (standalone _validateSelfCritique tests)
// ===========================================================================
describe('Self-critique _validateSelfCritique internals', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = createTestOrchestrator();
  });

  it('treats confidence 0 as default 7 due to JS falsy (known edge case)', () => {
    // Note: { confidence: 0 } triggers `0 || 7` = 7 in source code (0 is falsy).
    // This is a known edge case — confidence 0 falls through to the default of 7.
    const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: { confidence: 0 }
    });
    expect(result.blocked).toBe(false);
    expect(result.confidence).toBe(7); // 0 || 7 = 7
  });

  it('blocks when confidence is 4 with short (< 20 char) reasoning', () => {
    const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: { confidence: 4, reasoning: 'short' }
    });
    expect(result.blocked).toBe(true);
  });

  it('does NOT block when confidence is 4 with long reasoning', () => {
    const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: {
        confidence: 4,
        reasoning: 'This is a detailed explanation of why confidence is low but the handoff should proceed'
      }
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
  });

  it('returns warning=true for medium confidence (5-6)', () => {
    const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
      self_critique: { confidence: 5 }
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.confidence).toBe(5);
  });

  it('returns warning=false for high confidence (>=7)', () => {
    const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
      self_critique: { confidence: 8 }
    });
    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(false);
    expect(result.confidence).toBe(8);
  });

  it('extracts confidence from nested selfCritique (camelCase)', () => {
    const result = orchestrator._validateSelfCritique('EXEC-TO-PLAN', {
      selfCritique: { confidence: 10 }
    });
    expect(result.blocked).toBe(false);
    expect(result.confidence).toBe(10);
  });

  it('treats bare number as confidence when passed via confidence key', () => {
    const result = orchestrator._validateSelfCritique('EXEC-TO-PLAN', {
      confidence: 3
    });
    expect(result.blocked).toBe(true);
    expect(result.confidence).toBe(3);
  });

  it('includes gaps in result when provided', () => {
    const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: {
        confidence: 5,
        gaps: ['Missing error handling', 'No integration test']
      }
    });
    expect(result.gaps).toEqual(['Missing error handling', 'No integration test']);
  });
});

// ===========================================================================
// Injected-deps suite — consolidated from tests/unit/handoff-orchestrator.test.js
// (SD-LEO-INFRA-TEST-ESTATE-HYGIENE-001 FR-3). Uses a single shared deps object
// rebuilt per test, mirroring the original file's constructor-injection style.
// ===========================================================================
describe('HandoffOrchestrator (injected-deps suite)', () => {
  /** Create a mock executor that resolves with a success result */
  function createDepsExecutor(overrides = {}) {
    return {
      execute: vi.fn().mockResolvedValue({ success: true, ...overrides }),
      getRequiredGates: vi.fn().mockResolvedValue([]),
      getRemediation: vi.fn().mockReturnValue(null)
    };
  }

  /** Create a mock executor that resolves with a failure result */
  function createFailingDepsExecutor(reasonCode = 'GATE_FAILED', message = 'Validation failed') {
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

  let deps;
  let orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveAutoProceed.mockResolvedValue({
      autoProceed: true,
      source: 'default',
      sessionId: 'test-session-001'
    });
    deps = createMockDeps();
    orchestrator = new HandoffOrchestrator(deps);
  });

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
      const executors = { 'LEAD-TO-PLAN': createDepsExecutor() };
      const o = new HandoffOrchestrator({ ...deps, executors });
      expect(o._executors).toBe(executors);
    });
  });

  describe('createHandoffSystem', () => {
    it('should return a HandoffOrchestrator instance', () => {
      const system = createHandoffSystem(deps);
      expect(system).toBeInstanceOf(HandoffOrchestrator);
    });
  });

  describe('registerExecutor', () => {
    it('should register an executor and normalize the type to uppercase', () => {
      const executor = createDepsExecutor();
      orchestrator.registerExecutor('lead-to-plan', executor);
      expect(orchestrator._executors['LEAD-TO-PLAN']).toBe(executor);
    });

    it('should initialize _executors map if null', () => {
      orchestrator._executors = null;
      const executor = createDepsExecutor();
      orchestrator.registerExecutor('PLAN-TO-EXEC', executor);
      expect(orchestrator._executors['PLAN-TO-EXEC']).toBe(executor);
    });
  });

  describe('executeHandoff', () => {
    it('should verify SD exists before proceeding', async () => {
      const executor = createDepsExecutor();
      orchestrator.registerExecutor('LEAD-TO-PLAN', executor);

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(deps.sdRepo.verifyExists).toHaveBeenCalledWith('SD-TEST-001');
    });

    it('should return system error when SD does not exist', async () => {
      deps.sdRepo.verifyExists.mockRejectedValue(new Error('SD not found: SD-MISSING'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createDepsExecutor());

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-MISSING');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toContain('SD not found');
    });

    it('should resolve auto-proceed before execution', async () => {
      orchestrator.registerExecutor('LEAD-TO-PLAN', createDepsExecutor());

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(resolveAutoProceed).toHaveBeenCalledWith(
        expect.objectContaining({ supabase: deps.supabase, verbose: true })
      );
    });

    it('should include autoProceed in the result even on executor failure', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createFailingDepsExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.autoProceed).toBe(true);
    });
  });

  describe('executeHandoff recording', () => {
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

  describe('executeHandoff flywheel capture', () => {
    it('should fire captureHandoffGate on failure too', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createFailingDepsExecutor());

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(captureHandoffGate).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeHandoff deferred PRD generation', () => {
    it('should call _executeDeferredPrdGeneration when result has _deferredPrdGeneration', async () => {
      const executor = createDepsExecutor({
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
      orchestrator.registerExecutor('LEAD-TO-PLAN', createDepsExecutor());
      const spy = vi.spyOn(orchestrator, '_executeDeferredPrdGeneration');

      await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('self-critique pre-flight (_validateSelfCritique) — additional cases', () => {
    it('should not block when no self-critique is provided (soft enforcement)', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {});

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBeNull();
    });

    it('should block with low confidence (< 5) and no explanation', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-LEAD', {
        self_critique: { confidence: 3 }
      });

      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(3);
    });

    it('should accept numeric self_critique as confidence directly', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
        self_critique: 8
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(8);
    });

    it('should accept confidence option key directly', () => {
      const result = orchestrator._validateSelfCritique('LEAD-TO-PLAN', {
        confidence: { score: 8 }
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(8);
    });
  });

  describe('executeHandoff template loading', () => {
    it('should load template from handoffRepo', async () => {
      orchestrator.registerExecutor('PLAN-TO-EXEC', createDepsExecutor());

      await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(deps.handoffRepo.loadTemplate).toHaveBeenCalledWith('PLAN-TO-EXEC');
    });

    it('should continue without template when none is found', async () => {
      deps.handoffRepo.loadTemplate.mockResolvedValue(null);
      orchestrator.registerExecutor('PLAN-TO-EXEC', createDepsExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(true);
    });
  });

  describe('precheckHandoff', () => {
    it('should validate all gates without stopping on first failure', async () => {
      const executor = createDepsExecutor();
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

    it('should normalize handoff type to uppercase', async () => {
      const executor = createDepsExecutor();
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
      const executor = createDepsExecutor();
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

  describe('error resilience', () => {
    it('should return systemError when resolveAutoProceed throws', async () => {
      resolveAutoProceed.mockRejectedValueOnce(new Error('Session lookup failed'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createDepsExecutor());

      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toContain('Session lookup failed');
    });

    it('should return systemError when recorder.recordSuccess throws', async () => {
      deps.recorder.recordSuccess.mockRejectedValue(new Error('Insert failed'));
      orchestrator.registerExecutor('PLAN-TO-EXEC', createDepsExecutor());

      const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
    });

    it('should not crash when captureHandoffGate rejects (fire-and-forget)', async () => {
      captureHandoffGate.mockRejectedValueOnce(new Error('Flywheel down'));
      orchestrator.registerExecutor('LEAD-TO-PLAN', createDepsExecutor());

      // Should not throw
      const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

      expect(result.success).toBe(true);
    });
  });

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

// ===========================================================================
// ResultBuilder — translated from tests/unit/handoff-orchestrator.spec.ts
// (TS-only type assertions dropped; behavior preserved).
// ===========================================================================
describe('ResultBuilder', () => {
  it('rejects unsupported handoff type via ResultBuilder', () => {
    const result = ResultBuilder.unsupportedType('EXEC-TO-LEAD', [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC'
    ]);

    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
    expect(result.message).toContain('EXEC-TO-LEAD');
    expect(result.details.supportedTypes).toContain('LEAD-TO-PLAN');
  });

  it('ResultBuilder.notFound produces correct structure', () => {
    const result = ResultBuilder.notFound('SD', 'SD-MISSING-001');

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('SD_NOT_FOUND');
    expect(result.message).toContain('SD-MISSING-001');
    expect(result.details.entityType).toBe('SD');
    expect(result.details.id).toBe('SD-MISSING-001');
  });

  it('ResultBuilder.systemError wraps Error objects', () => {
    const error = new Error('Connection timeout');
    const result = ResultBuilder.systemError(error);

    expect(result.success).toBe(false);
    expect(result.systemError).toBe(true);
    expect(result.reasonCode).toBe('SYSTEM_ERROR');
    expect(result.error).toBe('Connection timeout');
  });

  it('ResultBuilder.systemError wraps string messages', () => {
    const result = ResultBuilder.systemError('Something broke');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Something broke');
  });

  it('ResultBuilder.rejected includes remediation guidance', () => {
    const result = ResultBuilder.rejected(
      'PRD_NOT_FOUND',
      'PRD not found for SD-TEST-001',
      { sdId: 'SD-TEST-001' }
    );

    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reasonCode).toBe('PRD_NOT_FOUND');
    expect(result.message).toContain('PRD not found');
  });

  it('ResultBuilder.gateFailure formats gate issues', () => {
    const gateResult = {
      issues: ['Missing PRD', 'No user stories'],
      score: 20,
      max_score: 100
    };

    const result = ResultBuilder.gateFailure('PRD_QUALITY', gateResult);

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('PRD_QUALITY_FAILED');
    expect(result.message).toContain('Missing PRD');
    expect(result.message).toContain('No user stories');
  });

  it('ResultBuilder.fieldError provides table and field path', () => {
    const result = ResultBuilder.fieldError(
      'product_requirements_v2',
      'metadata.gate2_validation',
      'Field is null',
      'Run add-prd-to-database.js to populate'
    );

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('DATABASE_FIELD_ERROR');
    expect(result.details.table).toBe('product_requirements_v2');
    expect(result.details.field).toBe('metadata.gate2_validation');
    expect(result.details.fullPath).toBe(
      'product_requirements_v2.metadata.gate2_validation'
    );
    expect(result.remediation).toContain('add-prd-to-database.js');
  });

  it('creates a success result with extra data', () => {
    const result = ResultBuilder.success({
      sdId: 'SD-TEST-001',
      score: 95
    });

    expect(result.success).toBe(true);
    expect(result.sdId).toBe('SD-TEST-001');
    expect(result.score).toBe(95);
  });

  it('creates a minimal success result', () => {
    const result = ResultBuilder.success();

    expect(result.success).toBe(true);
    expect(Object.keys(result)).toEqual(['success']);
  });
});

// ===========================================================================
// Workflow definitions — translated from tests/unit/handoff-orchestrator.spec.ts
// ===========================================================================
describe('Phase Transition Rules — Workflow Definitions', () => {
  it('feature SD requires all 5 handoff types', () => {
    const workflow = getWorkflowForType('feature');

    expect(workflow.required).toContain('LEAD-TO-PLAN');
    expect(workflow.required).toContain('PLAN-TO-EXEC');
    expect(workflow.required).toContain('EXEC-TO-PLAN');
    expect(workflow.required).toContain('PLAN-TO-LEAD');
    expect(workflow.required).toContain('LEAD-FINAL-APPROVAL');
    expect(workflow.optional).toHaveLength(0);
  });

  it('infrastructure SD makes EXEC-TO-PLAN optional', () => {
    expect(isHandoffRequired('infrastructure', 'LEAD-TO-PLAN')).toBe(true);
    expect(isHandoffRequired('infrastructure', 'PLAN-TO-EXEC')).toBe(true);
    expect(isHandoffRequired('infrastructure', 'EXEC-TO-PLAN')).toBe(false);
    expect(isHandoffOptional('infrastructure', 'EXEC-TO-PLAN')).toBe(true);
  });

  it('documentation SD skips code validation gates', () => {
    const workflow = getWorkflowForType('documentation');

    expect(workflow.skippedValidation).toContain('TESTING');
    expect(workflow.skippedValidation).toContain('Implementation Fidelity');
    expect(isHandoffOptional('documentation', 'EXEC-TO-PLAN')).toBe(true);
  });

  it('orchestrator SD only requires LEAD-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL', () => {
    const workflow = getWorkflowForType('orchestrator');

    expect(workflow.required).toEqual(['LEAD-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL']);
    expect(workflow.optional).toContain('PLAN-TO-EXEC');
    expect(workflow.optional).toContain('EXEC-TO-PLAN');
  });

  it('refactor SD has intensity-level overrides', () => {
    const workflow = getWorkflowForType('refactor');

    expect(workflow.intensityOverrides).toBeDefined();
    expect(workflow.intensityOverrides.cosmetic.required).toEqual([
      'LEAD-TO-PLAN',
      'PLAN-TO-LEAD'
    ]);
    expect(workflow.intensityOverrides.architectural.required).toContain(
      'LEAD-FINAL-APPROVAL'
    );
  });

  it('unknown SD type falls back to feature workflow', () => {
    const workflow = getWorkflowForType('totally_unknown_type');

    expect(workflow).toEqual(WORKFLOW_BY_SD_TYPE.feature);
  });

  it('isHandoffRequired is case-insensitive on handoff type', () => {
    expect(isHandoffRequired('feature', 'lead-to-plan')).toBe(true);
    expect(isHandoffRequired('feature', 'Lead-To-Plan')).toBe(true);
  });

  it('all 9 SD types are defined in WORKFLOW_BY_SD_TYPE', () => {
    const expectedTypes = [
      'feature',
      'infrastructure',
      'documentation',
      'database',
      'security',
      'refactor',
      'bugfix',
      'performance',
      'orchestrator'
    ];

    for (const sdType of expectedTypes) {
      expect(WORKFLOW_BY_SD_TYPE).toHaveProperty(sdType);
      expect(WORKFLOW_BY_SD_TYPE[sdType].name).toBeTruthy();
      expect(Array.isArray(WORKFLOW_BY_SD_TYPE[sdType].required)).toBe(true);
    }
  });
});

describe('Workflow Definitions — Additional SD Types', () => {
  it('security SD requires all 5 handoffs with no skipped validation', () => {
    const workflow = getWorkflowForType('security');

    expect(workflow.required).toHaveLength(5);
    expect(workflow.skippedValidation).toHaveLength(0);
    expect(workflow.note).toContain('SECURITY');
  });

  it('database SD requires DATABASE sub-agent validation', () => {
    const workflow = getWorkflowForType('database');

    expect(workflow.required).toContain('EXEC-TO-PLAN');
    expect(workflow.note).toContain('DATABASE');
  });

  it('bugfix SD requires all 5 handoffs with regression testing', () => {
    const workflow = getWorkflowForType('bugfix');

    expect(workflow.required).toHaveLength(5);
    expect(workflow.note).toContain('regression');
  });

  it('performance SD requires PERFORMANCE sub-agent with benchmarks', () => {
    const workflow = getWorkflowForType('performance');

    expect(workflow.required).toHaveLength(5);
    expect(workflow.note).toContain('PERFORMANCE');
    expect(workflow.note).toContain('metrics');
  });
});

// ===========================================================================
// Result recording — executor RETURNS a systemError-flagged result (distinct
// from executor THROWING) — translated from handoff-orchestrator.spec.ts
// ===========================================================================
describe('Result recording — returned systemError flag', () => {
  it('does NOT record failure when result has systemError flag', async () => {
    const recorder = {
      recordSuccess: vi.fn(() => Promise.resolve()),
      recordFailure: vi.fn(() => Promise.resolve()),
      recordSystemError: vi.fn(() => Promise.resolve())
    };
    const systemErrorExecutor = {
      execute: vi.fn(() => Promise.resolve({
        success: false,
        systemError: true,
        error: 'Internal error'
      }))
    };

    const orchestrator = createTestOrchestrator({
      recorder,
      executors: {
        'EXEC-TO-PLAN': systemErrorExecutor,
        'LEAD-TO-PLAN': createMockExecutor(),
        'PLAN-TO-EXEC': createMockExecutor(),
        'PLAN-TO-LEAD': createMockExecutor(),
        'LEAD-FINAL-APPROVAL': createMockExecutor()
      }
    });

    await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');

    // systemError results are not recorded via recordFailure
    expect(recorder.recordFailure).not.toHaveBeenCalled();
    expect(recorder.recordSuccess).not.toHaveBeenCalled();
  });
});
