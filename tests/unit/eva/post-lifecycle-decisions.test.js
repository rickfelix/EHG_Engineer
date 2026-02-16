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
  it('should return true for stage 25', () => {
    expect(isFinalStage(25)).toBe(true);
  });

  it('should return true for stage > 25', () => {
    expect(isFinalStage(26)).toBe(true);
    expect(isFinalStage(100)).toBe(true);
  });

  it('should return false for stage < 25', () => {
    expect(isFinalStage(24)).toBe(false);
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
  it('should be 25', () => {
    expect(MAX_LIFECYCLE_STAGE).toBe(25);
  });
});

describe('MODULE_VERSION', () => {
  it('should be 1.0.0', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });
});
