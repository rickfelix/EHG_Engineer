/**
 * Tests for Post-Lifecycle Decision Handlers
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-A
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handlePostLifecycleDecision,
  isFinalStage,
  DECISION_TYPES,
  MAX_LIFECYCLE_STAGE,
  MODULE_VERSION,
  _internal,
} from '../../../lib/eva/post-lifecycle-decisions.js';

// Mock the dependencies
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  markCompleted: vi.fn().mockResolvedValue({ completed: true }),
  ORCHESTRATOR_STATES: {
    IDLE: 'idle',
    PROCESSING: 'processing',
    BLOCKED: 'blocked',
    FAILED: 'failed',
    COMPLETED: 'completed',
  },
}));

vi.mock('../../../lib/eva/lifecycle-sd-bridge.js', () => ({
  convertExpansionToSD: vi.fn().mockResolvedValue({ created: true, sdKey: 'SD-TEST-EXPAND-001', errors: [] }),
}));

vi.mock('../../../lib/crm/spine-consumption-client.js', () => ({
  routeException: vi.fn().mockResolvedValue({ routed_to: 'venture-ceo-tier', exception_type: 'NO_CAPABILITY_DEPOSIT', source: 'stub' }),
}));

vi.mock('../../../lib/governance/emit-feedback.js', () => ({
  emitFeedback: vi.fn().mockResolvedValue({ id: 'feedback-id', deduped: false }),
}));

import { routeException } from '../../../lib/crm/spine-consumption-client.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeMockSupabase(overrides = {}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
}

const ventureContext = { id: 'venture-1', name: 'TestVenture', status: 'active' };
const stageOutput = { description: 'Stage 25 output' };

describe('DECISION_TYPES', () => {
  it('should have 5 decision types', () => {
    expect(Object.keys(DECISION_TYPES)).toHaveLength(5);
  });

  it('should contain all expected types', () => {
    expect(DECISION_TYPES.CONTINUE).toBe('continue');
    expect(DECISION_TYPES.PIVOT).toBe('pivot');
    expect(DECISION_TYPES.EXPAND).toBe('expand');
    expect(DECISION_TYPES.SUNSET).toBe('sunset');
    expect(DECISION_TYPES.EXIT).toBe('exit');
  });
});

describe('isFinalStage', () => {
  it('should return true for stage 26', () => {
    expect(isFinalStage(26)).toBe(true);
  });

  it('should return true for stage > 26', () => {
    expect(isFinalStage(27)).toBe(true);
    expect(isFinalStage(100)).toBe(true);
  });

  it('should return false for stage < 26', () => {
    expect(isFinalStage(25)).toBe(false);
    expect(isFinalStage(1)).toBe(false);
  });

  it('should return false for stage 0', () => {
    expect(isFinalStage(0)).toBe(false);
  });
});

describe('handlePostLifecycleDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return requiresReview when no decision provided', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [] },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(false);
    expect(result.requiresReview).toBe(true);
    expect(result.decisionOptions).toBeDefined();
    expect(result.decisionOptions).toHaveLength(5);
    expect(result.summary).toContain('TestVenture');
  });

  it('should reject invalid decision type', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'invalid' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(false);
    expect(result.error).toContain('Invalid decision type');
  });

  it('should return error when no supabase client', async () => {
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase: null, logger: silentLogger },
    );

    expect(result.handled).toBe(false);
    expect(result.error).toContain('Missing');
  });

  it('should handle CONTINUE decision', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.decision.type).toBe('continue');
    expect(result.result.action).toBe('continue');
    expect(result.result.newStatus).toBe('monitoring');
  });

  it('should handle PIVOT decision with default stage', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'pivot' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.action).toBe('pivot');
    expect(result.result.pivotStage).toBe(_internal.DEFAULT_PIVOT_STAGE);
  });

  it('should handle PIVOT decision with custom stage', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'pivot', pivotStage: 10 } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.pivotStage).toBe(10);
  });

  it('should reject invalid pivot stage', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'pivot', pivotStage: 0 } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.success).toBe(false);
    expect(result.result.error).toContain('Invalid pivot stage');
  });

  it('should handle EXPAND decision', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      {
        ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [],
        decision: { type: 'expand', expansionTitle: 'New Venture', expansionDescription: 'Expansion from test' },
      },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.action).toBe('expand');
    expect(result.result.success).toBe(true);
    expect(result.result.sdKey).toBe('SD-TEST-EXPAND-001');
  });

  it('should handle SUNSET decision', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'sunset' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.action).toBe('sunset');
    expect(result.result.noticeDays).toBe(_internal.SUNSET_NOTICE_DAYS);
    expect(result.result.sunsetAt).toBeDefined();
  });

  it('should handle EXIT decision', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'exit' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(result.result.action).toBe('exit');
    expect(result.result.success).toBe(true);
  });

  it('QF-20260713-172: EXIT archive update must not reference the non-existent eva_ventures.completed_at column', async () => {
    const supabase = makeMockSupabase();
    await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'exit' } },
      { supabase, logger: silentLogger },
    );

    // supabase.from() returns the same mocked object regardless of table name,
    // so the shared update() mock records calls from BOTH markCompleted()
    // (targets 'ventures', sets status:'completed') and handleExit's own
    // eva_ventures update (status:'archived') -- isolate the latter by payload.
    const archiveCall = supabase.from().update.mock.calls.find(
      (call) => call[0]?.status === 'archived',
    );
    expect(archiveCall).toBeDefined();
    expect(archiveCall[0]).not.toHaveProperty('completed_at');
    expect(archiveCall[0]).toHaveProperty('updated_at');
  });
});

describe('no-deposit capability exception (SD-LEO-GEN-SATELLITE-CAPABILITY-EXTRACTION-001, FR-2, TS-3/TS-4/TS-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes + durably persists an exception when extractedCapabilities is absent (TS-3)', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(routeException).toHaveBeenCalledTimes(1);
    expect(routeException).toHaveBeenCalledWith('NO_CAPABILITY_DEPOSIT', expect.objectContaining({ ventureId: 'venture-1', decisionType: 'continue' }));
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback).toHaveBeenCalledWith(expect.objectContaining({ category: 'capability_no_deposit' }));
  });

  it('routes + persists an exception when extractedCapabilities is an empty array (TS-3)', async () => {
    const supabase = makeMockSupabase();
    await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'sunset', extractedCapabilities: [] } },
      { supabase, logger: silentLogger },
    );

    expect(routeException).toHaveBeenCalledTimes(1);
    expect(emitFeedback).toHaveBeenCalledTimes(1);
  });

  it('does NOT route an exception when extractedCapabilities is non-empty (TS-4, unchanged pre-existing behavior)', async () => {
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      {
        ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [],
        decision: { type: 'continue', extractedCapabilities: [{ name: 'cap-1', capabilityType: 'integration' }] },
      },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(routeException).not.toHaveBeenCalled();
    expect(emitFeedback).not.toHaveBeenCalled();
  });

  it('fails open on a routeException error, and still durably persists via emitFeedback (TS-5, durability-independence)', async () => {
    routeException.mockRejectedValueOnce(new Error('spine routing boom'));
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No-deposit exception routing failed'));
    // The durability guarantee must not depend on routeException succeeding -- emitFeedback
    // still fires (with routed_to:null since routing failed), or the exception silently
    // vanishes exactly the way the code comment says it must not (adversarial-review fix).
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ routed_to: null }) }));
  });

  it('fails open on an emitFeedback error without throwing (TS-5, independent try/catch)', async () => {
    emitFeedback.mockRejectedValueOnce(new Error('feedback insert boom'));
    const supabase = makeMockSupabase();
    const result = await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    expect(result.handled).toBe(true);
    expect(routeException).toHaveBeenCalledTimes(1);
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No-deposit feedback persistence failed'));
  });

  it('never interpolates the venture name into title/description (log-injection regression guard)', async () => {
    const supabase = makeMockSupabase();
    await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    const call = emitFeedback.mock.calls[0][0];
    expect(call.title).not.toContain(ventureContext.name);
    expect(call.description).not.toContain(ventureContext.name);
    expect(call.metadata.venture_name).toBe(ventureContext.name);
  });
});

describe('decision options', () => {
  it('should build options with labels and descriptions', () => {
    const options = _internal.buildDecisionOptions(ventureContext, stageOutput);
    expect(options).toHaveLength(5);
    for (const option of options) {
      expect(option.type).toBeDefined();
      expect(option.label).toBeDefined();
      expect(option.description).toBeDefined();
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});

describe('MAX_LIFECYCLE_STAGE', () => {
  it('should be 26', () => {
    expect(MAX_LIFECYCLE_STAGE).toBe(26);
  });
});

describe('MODULE_VERSION', () => {
  it('should be 1.0.0', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });
});
