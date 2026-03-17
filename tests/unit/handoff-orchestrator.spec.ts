/**
 * Unit tests for the LEO Handoff Orchestrator system.
 *
 * Tests the HandoffOrchestrator, workflow definitions, ResultBuilder,
 * and core handoff validation logic without hitting the real database.
 *
 * Part of SD-LEO-INFRA-HANDOFF-ORCHESTRATOR-UNIT-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing the modules under test.
// This prevents Supabase, dotenv, and other side-effect-heavy imports from
// running during test setup.
// ---------------------------------------------------------------------------

// Supabase client factory — returns a builder-pattern mock
function createMockSupabaseClient(overrides: Record<string, any> = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return {
    from: vi.fn(() => chainable),
    _chain: chainable, // expose for per-test overrides
  };
}

// Mock the supabase-client module so no real connections are attempted
// Path is relative to THIS test file: tests/unit/ -> ../../lib/
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => createMockSupabaseClient()),
  createSupabaseClient: vi.fn(() => createMockSupabaseClient()),
}));

// Mock dotenv — not needed in tests (must have default export for `import dotenv from 'dotenv'`)
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// Mock flywheel capture — fire-and-forget in production, noop in tests
vi.mock('../../../lib/flywheel/capture.js', () => ({
  captureHandoffGate: vi.fn().mockResolvedValue(undefined),
}));

// Mock auto-proceed resolver with sensible defaults
// Path is relative to THIS test file: tests/unit/ -> ../../scripts/modules/handoff/
vi.mock(
  '../../scripts/modules/handoff/auto-proceed-resolver.js',
  () => ({
    resolveAutoProceed: vi.fn().mockResolvedValue({
      autoProceed: false,
      source: 'default',
      sessionId: 'test-session-001',
    }),
    createHandoffMetadata: vi.fn(() => ({ autoProceed: false })),
    RESOLUTION_SOURCES: { CLI: 'cli', ENV: 'env', SESSION: 'session', DATABASE: 'database', DEFAULT: 'default' },
    DEFAULT_AUTO_PROCEED: false,
  }),
);

// Mock safe-truncate utility
vi.mock('../../../lib/utils/safe-truncate.js', () => ({
  safeTruncate: vi.fn((s: string, n: number) => (s && s.length > n ? s.slice(0, n) : s)),
}));

// Mock rejection-subagent-mapping (used by ResultBuilder)
vi.mock(
  '../../../scripts/modules/handoff/rejection-subagent-mapping.js',
  () => ({
    getRemediation: vi.fn(() => null),
  }),
);

// ---------------------------------------------------------------------------
// Import modules under test — these must come AFTER vi.mock calls
// ---------------------------------------------------------------------------

import {
  WORKFLOW_BY_SD_TYPE,
  getWorkflowForType,
  isHandoffRequired,
  isHandoffOptional,
} from '../../scripts/modules/handoff/cli/workflow-definitions.js';

import { ResultBuilder } from '../../scripts/modules/handoff/ResultBuilder.js';

// We import the class directly so we can construct it with injected mocks
import { HandoffOrchestrator } from '../../scripts/modules/handoff/HandoffOrchestrator.js';

// ============================================================================
// 1. Handoff Type Validation
// ============================================================================

describe('Handoff Type Validation', () => {
  it('recognizes all 5 handoff types on the orchestrator', () => {
    const mockSupabase = createMockSupabaseClient();
    const orchestrator = new HandoffOrchestrator({ supabase: mockSupabase });

    const expected = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'LEAD-FINAL-APPROVAL',
    ];

    expect(orchestrator.supportedHandoffs).toEqual(expected);
  });

  it('rejects unsupported handoff type via ResultBuilder', () => {
    const result = ResultBuilder.unsupportedType('EXEC-TO-LEAD', [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
    ]);

    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
    expect(result.message).toContain('EXEC-TO-LEAD');
    expect(result.details.supportedTypes).toContain('LEAD-TO-PLAN');
  });

  it('normalizes lowercase handoff type to uppercase', async () => {
    const mockSupabase = createMockSupabaseClient();
    // Make verifyExists throw to short-circuit after normalization check
    const mockSdRepo = {
      verifyExists: vi.fn().mockRejectedValue(new Error('SD not found: test-sd')),
      getById: vi.fn().mockRejectedValue(new Error('not found')),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
    });

    const result = await orchestrator.executeHandoff('lead-to-plan', 'SD-TEST-001');

    // Should have called verifyExists (meaning it got past normalization)
    expect(mockSdRepo.verifyExists).toHaveBeenCalledWith('SD-TEST-001');
    // Returns system error because SD not found
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// 2. SD Existence Check
// ============================================================================

describe('SD Existence Check', () => {
  it('fails gracefully when SD does not exist', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockRejectedValue(
        new Error('Strategic Directive SD-NONEXISTENT-001 not found in database.'),
      ),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
    });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-NONEXISTENT-001');

    expect(result.success).toBe(false);
    expect(result.systemError).toBe(true);
    expect(result.error).toContain('not found');
    expect(mockRecorder.recordSystemError).toHaveBeenCalled();
  });

  it('ResultBuilder.notFound produces correct structure', () => {
    const result = ResultBuilder.notFound('SD', 'SD-MISSING-001');

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('SD_NOT_FOUND');
    expect(result.message).toContain('SD-MISSING-001');
    expect(result.details.entityType).toBe('SD');
    expect(result.details.id).toBe('SD-MISSING-001');
  });

  it('precheckHandoff returns SD_EXISTS failure for missing SD', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      getById: vi.fn().mockResolvedValue(null),
      verifyExists: vi.fn(),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
    });

    const result = await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'SD-GHOST-001');

    expect(result.success).toBe(false);
    expect(result.failedGates).toHaveLength(1);
    expect(result.failedGates[0].name).toBe('SD_EXISTS');
  });
});

// ============================================================================
// 3. Phase Transition Rules (Workflow Definitions)
// ============================================================================

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
    const workflow = getWorkflowForType('infrastructure');

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
    expect(workflow.intensityOverrides!.cosmetic.required).toEqual([
      'LEAD-TO-PLAN',
      'PLAN-TO-LEAD',
    ]);
    expect(workflow.intensityOverrides!.architectural.required).toContain(
      'LEAD-FINAL-APPROVAL',
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
      'orchestrator',
    ];

    for (const sdType of expectedTypes) {
      expect(WORKFLOW_BY_SD_TYPE).toHaveProperty(sdType);
      expect(WORKFLOW_BY_SD_TYPE[sdType].name).toBeTruthy();
      expect(Array.isArray(WORKFLOW_BY_SD_TYPE[sdType].required)).toBe(true);
    }
  });
});

// ============================================================================
// 4. Gate Evaluation
// ============================================================================

describe('Gate Evaluation', () => {
  it('executeHandoff returns unsupported type when handoff type is invalid', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
    });

    const result = await orchestrator.executeHandoff('INVALID-TYPE', 'SD-TEST-001');

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
    expect(result.details.supportedTypes).toHaveLength(5);
    // Note: unsupported type is returned early (before executor runs),
    // so recordFailure is NOT called — only executor-produced failures
    // trigger recording.
  });

  it('executeHandoff delegates to the correct executor', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        message: 'Gate passed',
        gateResults: {},
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn(),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      executors: {
        'LEAD-TO-PLAN': mockExecutor,
      },
    });

    const result = await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

    expect(mockExecutor.execute).toHaveBeenCalledWith(
      'SD-TEST-001',
      expect.objectContaining({ autoProceed: false }),
    );
    expect(result.success).toBe(true);
    expect(mockRecorder.recordSuccess).toHaveBeenCalled();
  });

  it('precheckHandoff returns issues for unsupported handoff type', async () => {
    const mockSupabase = createMockSupabaseClient();
    const orchestrator = new HandoffOrchestrator({ supabase: mockSupabase });

    const result = await orchestrator.precheckHandoff('TOTALLY-WRONG', 'SD-TEST-001');

    expect(result.success).toBe(false);
    expect(result.failedGates[0].name).toBe('HANDOFF_TYPE');
    expect(result.issues[0].issue).toContain('Unsupported type');
  });

  it('records failure when executor returns non-success result', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'draft',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: false,
        rejected: true,
        reasonCode: 'GATE_FAILED',
        message: 'SD_STATUS gate failed',
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn(),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      executors: { 'PLAN-TO-EXEC': mockExecutor },
    });

    const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

    expect(result.success).toBe(false);
    expect(mockRecorder.recordFailure).toHaveBeenCalled();
    expect(mockRecorder.recordSuccess).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 5. Error Handling
// ============================================================================

describe('Error Handling', () => {
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
      { sdId: 'SD-TEST-001' },
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
      max_score: 100,
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
      'Run add-prd-to-database.js to populate',
    );

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('DATABASE_FIELD_ERROR');
    expect(result.details.table).toBe('product_requirements_v2');
    expect(result.details.field).toBe('metadata.gate2_validation');
    expect(result.details.fullPath).toBe(
      'product_requirements_v2.metadata.gate2_validation',
    );
    expect(result.remediation).toContain('add-prd-to-database.js');
  });

  it('executeHandoff catches unhandled executor errors and returns systemError', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('Unexpected null pointer')),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn().mockResolvedValue(undefined),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      executors: { 'EXEC-TO-PLAN': mockExecutor },
    });

    const result = await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');

    expect(result.success).toBe(false);
    expect(result.systemError).toBe(true);
    expect(result.error).toContain('Unexpected null pointer');
    expect(mockRecorder.recordSystemError).toHaveBeenCalled();
  });
});

// ============================================================================
// 6. Self-Critique Pre-Flight (Confidence Scoring)
// ============================================================================

describe('Self-Critique Pre-Flight', () => {
  let orchestrator: InstanceType<typeof HandoffOrchestrator>;

  beforeEach(() => {
    const mockSupabase = createMockSupabaseClient();
    orchestrator = new HandoffOrchestrator({ supabase: mockSupabase });
  });

  it('allows handoff when no confidence is provided (soft enforcement)', () => {
    const result = (orchestrator as any)._validateSelfCritique('PLAN-TO-EXEC', {});

    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.confidence).toBeNull();
  });

  it('allows high confidence (>= 7) without warning', () => {
    const result = (orchestrator as any)._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: { confidence: 9, reasoning: 'All gates aligned' },
    });

    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(false);
    expect(result.confidence).toBe(9);
  });

  it('warns on medium confidence (5-6) but allows', () => {
    const result = (orchestrator as any)._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: { confidence: 6, reasoning: 'Some uncertainty' },
    });

    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.confidence).toBe(6);
  });

  it('blocks low confidence (< 5) without explanation', () => {
    const result = (orchestrator as any)._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: { confidence: 3 },
    });

    expect(result.blocked).toBe(true);
    expect(result.confidence).toBe(3);
  });

  it('allows low confidence with detailed explanation', () => {
    const result = (orchestrator as any)._validateSelfCritique('PLAN-TO-EXEC', {
      self_critique: {
        confidence: 3,
        reasoning: 'The PRD is complete but I am uncertain about the E2E coverage path.',
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.confidence).toBe(3);
  });
});

// ============================================================================
// 7. Orchestrator Factory and Executor Registration
// ============================================================================

describe('Orchestrator Construction and Executor Registration', () => {
  it('registerExecutor adds a custom executor at runtime', () => {
    const mockSupabase = createMockSupabaseClient();
    const orchestrator = new HandoffOrchestrator({ supabase: mockSupabase });

    const customExecutor = { execute: vi.fn() };
    orchestrator.registerExecutor('LEAD-TO-PLAN', customExecutor);

    // The executor should be stored (accessed via the private _executors map)
    expect((orchestrator as any)._executors['LEAD-TO-PLAN']).toBe(customExecutor);
  });

  it('registerExecutor normalizes type to uppercase', () => {
    const mockSupabase = createMockSupabaseClient();
    const orchestrator = new HandoffOrchestrator({ supabase: mockSupabase });

    const customExecutor = { execute: vi.fn() };
    orchestrator.registerExecutor('plan-to-exec', customExecutor);

    expect((orchestrator as any)._executors['PLAN-TO-EXEC']).toBe(customExecutor);
  });

  it('returns EXECUTOR_NOT_FOUND when no executor is registered for type', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn(),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      executors: {}, // empty — no executors registered
    });

    const result = await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('EXECUTOR_NOT_FOUND');
  });
});

// ============================================================================
// 8. ResultBuilder.success
// ============================================================================

describe('ResultBuilder.success', () => {
  it('creates a success result with extra data', () => {
    const result = ResultBuilder.success({
      sdId: 'SD-TEST-001',
      score: 95,
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

// ============================================================================
// 9. Handoff Recording (Success vs Failure routing)
// ============================================================================

describe('Handoff Recording', () => {
  it('records success when executor returns success', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({ success: true }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn(),
    };
    const mockHandoffRepo = {
      loadTemplate: vi.fn().mockResolvedValue({ id: 'tpl-001', content: 'test template' }),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      handoffRepo: mockHandoffRepo,
      executors: { 'LEAD-TO-PLAN': mockExecutor },
    });

    await orchestrator.executeHandoff('LEAD-TO-PLAN', 'SD-TEST-001');

    expect(mockRecorder.recordSuccess).toHaveBeenCalledWith(
      'LEAD-TO-PLAN',
      'SD-TEST-001',
      expect.objectContaining({ success: true }),
      expect.anything(), // template
    );
    expect(mockRecorder.recordFailure).not.toHaveBeenCalled();
  });

  it('records failure (not systemError) when executor rejects', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: false,
        rejected: true,
        reasonCode: 'GATE_FAILED',
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordSystemError: vi.fn(),
    };
    const mockHandoffRepo = {
      loadTemplate: vi.fn().mockResolvedValue(null),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      handoffRepo: mockHandoffRepo,
      executors: { 'PLAN-TO-EXEC': mockExecutor },
    });

    await orchestrator.executeHandoff('PLAN-TO-EXEC', 'SD-TEST-001');

    expect(mockRecorder.recordFailure).toHaveBeenCalled();
    expect(mockRecorder.recordSuccess).not.toHaveBeenCalled();
  });

  it('does NOT record failure when result has systemError flag', async () => {
    const mockSupabase = createMockSupabaseClient();
    const mockSdRepo = {
      verifyExists: vi.fn().mockResolvedValue({
        id: 'uuid-001',
        sd_key: 'SD-TEST-001',
        title: 'Test SD',
        status: 'active',
      }),
    };
    const mockExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: false,
        systemError: true,
        error: 'Internal error',
      }),
    };
    const mockRecorder = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordSystemError: vi.fn(),
    };

    const orchestrator = new HandoffOrchestrator({
      supabase: mockSupabase,
      sdRepo: mockSdRepo,
      recorder: mockRecorder,
      executors: { 'EXEC-TO-PLAN': mockExecutor },
    });

    await orchestrator.executeHandoff('EXEC-TO-PLAN', 'SD-TEST-001');

    // systemError results are not recorded via recordFailure
    expect(mockRecorder.recordFailure).not.toHaveBeenCalled();
    expect(mockRecorder.recordSuccess).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 10. Workflow Definitions — Security and Database SD types
// ============================================================================

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
