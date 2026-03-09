/**
 * Smoke Test Evidence Gate - Unit Tests
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-053
 *
 * Tests content type normalization and section handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const MODULE_PATH = '../../../scripts/modules/handoff/executors/plan-to-lead/gates/smoke-test-evidence.js';

describe('Smoke Test Evidence Gate', () => {
  let createGate;
  let mockSupabase;
  let mockCtx;

  beforeEach(async () => {
    const mod = await import(MODULE_PATH);
    createGate = mod.createSmokeTestEvidenceGate;

    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockCtx = {
      sd: {
        id: 'SD-PIPELINE-001',
        sd_key: 'SD-PIPELINE-001',
        title: 'Fix pipeline orchestrator',
        description: 'Fix the stage-execution pipeline',
        tags: [],
        metadata: { arch_key: 'ARCH-PIPELINE-001' },
      },
      sdId: 'SD-PIPELINE-001',
    };
  });

  function setupMockSupabase(childCount, archPlan) {
    let queryCount = 0;
    return {
      from: vi.fn().mockImplementation(() => {
        queryCount++;
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(),
        };

        if (queryCount === 1) {
          // Children check
          chain.eq = vi.fn().mockResolvedValue({
            data: childCount > 0 ? new Array(childCount).fill({ id: 'child' }) : [],
          });
          return chain;
        }

        if (queryCount === 2) {
          // Architecture plan query
          chain.single = vi.fn().mockResolvedValue({ data: archPlan });
          return chain;
        }

        return chain;
      }),
    };
  }

  it('should handle JSONB object content by stringifying it', async () => {
    // Content stored as a JSONB object instead of a string
    const archPlan = {
      plan_key: 'ARCH-PIPELINE-001',
      content: {
        sections: [
          { heading: 'Overview', body: 'This plan addresses the pipeline' },
          { heading: 'Baseline Observation', body: 'Runtime observation: [eva] Error at stage 3' },
        ],
      },
      sections: null,
    };

    mockSupabase = setupMockSupabase(0, archPlan);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    // After stringification, "baseline.?observation" pattern should match
    expect(result.passed).toBe(true);
    expect(result.details.has_evidence).toBe(true);
  });

  it('should handle string content normally', async () => {
    const archPlan = {
      plan_key: 'ARCH-PIPELINE-001',
      content: '## Baseline Observation\n\nRan the pipeline and observed the following errors...',
      sections: null,
    };

    mockSupabase = setupMockSupabase(0, archPlan);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.details.has_evidence).toBe(true);
  });

  it('should handle sections stored as an object instead of array', async () => {
    const archPlan = {
      plan_key: 'ARCH-PIPELINE-001',
      content: 'No evidence markers in the main content',
      sections: {
        0: { title: 'Overview' },
        1: { title: 'Smoke Test Evidence' },
      },
    };

    mockSupabase = setupMockSupabase(0, archPlan);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.details.section_evidence).toBe(true);
  });

  it('should auto-pass for non-pipeline SDs', async () => {
    mockCtx.sd.sd_key = 'SD-FEATURE-UI-001';
    mockCtx.sd.title = 'Add user profile page';
    mockCtx.sd.description = 'New feature for user profiles';

    mockSupabase = setupMockSupabase(0, null);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.is_pipeline_sd).toBe(false);
  });

  it('should auto-pass for SD-LEARN-* even with pipeline keywords', async () => {
    mockCtx.sd.sd_key = 'SD-LEARN-FIX-001';
    mockCtx.sd.title = 'Fix handoff-system pattern';
    mockCtx.sd.description = 'Addresses pipeline issues in the orchestrator';

    mockSupabase = setupMockSupabase(0, null);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should fail when pipeline SD has no evidence in plan', async () => {
    const archPlan = {
      plan_key: 'ARCH-PIPELINE-001',
      content: 'This plan describes the architecture for the pipeline fix. No runtime data included.',
      sections: [],
    };

    mockSupabase = setupMockSupabase(0, archPlan);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should handle null sections gracefully', async () => {
    const archPlan = {
      plan_key: 'ARCH-PIPELINE-001',
      content: '## Smoke Test\n\nRan the pipeline to observe behavior',
      sections: null,
    };

    mockSupabase = setupMockSupabase(0, archPlan);
    const gate = createGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
  });
});
