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

// Mock Supabase client factory
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
import { HandoffOrchestrator } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';
import { resolveAutoProceed } from '../../../scripts/modules/handoff/auto-proceed-resolver.js';
import { captureHandoffGate } from '../../../lib/flywheel/capture.js';

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
