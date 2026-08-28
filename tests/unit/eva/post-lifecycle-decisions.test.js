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

// SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-5): handlePostLifecycleDecision now checks
// artifact-existence for the terminal stage before executing any decision. Default to
// not-blocked so every pre-existing test below (none of which concern this new check) keeps
// exercising its own decision-handler behavior unchanged.
vi.mock('../../../lib/eva/stage-artifact-precondition.js', () => ({
  checkStageArtifactPrecondition: vi.fn().mockResolvedValue({ blocked: false, missingArtifacts: [], deviatedArtifacts: [], source: 'test-mock' }),
}));

import { routeException } from '../../../lib/crm/spine-consumption-client.js';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';
import { checkStageArtifactPrecondition } from '../../../lib/eva/stage-artifact-precondition.js';

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
  // SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001: MAX_LIFECYCLE_STAGE updated 26 -> 27.
  it('should return true for stage 27', () => {
    expect(isFinalStage(27)).toBe(true);
  });

  it('should return true for stage > 27', () => {
    expect(isFinalStage(28)).toBe(true);
    expect(isFinalStage(100)).toBe(true);
  });

  it('should return false for stage < 27', () => {
    expect(isFinalStage(26)).toBe(false);
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

  // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-5): entry-point artifact-existence check
  // (stage-advancement-path-census.md row #17) — checked once for every decision type,
  // NOT inside handlePivot itself (which remains functionally unguarded per its own
  // acceptance criteria, since it is a distinct backward re-entry operation, not a
  // forward stage-completion advance).
  describe('FR-5 artifact-existence check (SD-LEO-INFRA-MINUS-GATE-SSOT-001)', () => {
    it('refuses ANY decision (including pivot) when the terminal stage is missing required artifacts', async () => {
      checkStageArtifactPrecondition.mockResolvedValueOnce({
        blocked: true, missingArtifacts: ['ops_cycle_metrics'], deviatedArtifacts: [], source: 'canonical',
      });
      const supabase = makeMockSupabase();
      const result = await handlePostLifecycleDecision(
        { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'pivot' } },
        { supabase, logger: silentLogger },
      );

      expect(checkStageArtifactPrecondition).toHaveBeenCalledWith(supabase, 'venture-1', MAX_LIFECYCLE_STAGE);
      expect(result.handled).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('artifact_precondition_unmet');
      expect(result.missingArtifacts).toEqual(['ops_cycle_metrics']);
    });

    it('a pivot decision still succeeds when the terminal stage artifacts are present (handlePivot itself stays unguarded)', async () => {
      // Default mock (module-level) already resolves blocked:false -- this test just makes
      // that explicit and asserts the pivot completes normally.
      const supabase = makeMockSupabase();
      const result = await handlePostLifecycleDecision(
        { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'pivot', pivotStage: 12 } },
        { supabase, logger: silentLogger },
      );

      expect(result.handled).toBe(true);
      expect(result.result.action).toBe('pivot');
      expect(result.result.success).toBe(true);
      expect(result.result.pivotStage).toBe(12);
    });
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

  it('passes a per-venture dedup_key so distinct ventures never collapse into one row (adversarial review round 2)', async () => {
    const supabase = makeMockSupabase();
    await handlePostLifecycleDecision(
      { ventureId: 'venture-1', ventureContext, stageOutput, artifacts: [], decision: { type: 'continue' } },
      { supabase, logger: silentLogger },
    );

    expect(emitFeedback).toHaveBeenCalledWith(expect.objectContaining({ dedup_key: 'no-deposit:venture-1:continue' }));
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
  // SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001: updated 26 -> 27 for the 2026-08-28 renumbering.
  it('should be 27', () => {
    expect(MAX_LIFECYCLE_STAGE).toBe(27);
  });
});

describe('MODULE_VERSION', () => {
  it('should be 1.0.0', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });
});
