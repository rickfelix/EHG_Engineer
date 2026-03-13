/**
 * Automated UAT Gate — Unit Tests
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-D
 *
 * Tests the AUTOMATED_UAT_GATE that validates user story acceptance criteria.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const MODULE_PATH = '../../../scripts/modules/handoff/executors/lead-final-approval/gates/automated-uat-gate.js';

describe('Automated UAT Gate', () => {
  let createAutomatedUatGate;
  let mockSupabase;
  let mockCtx;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const mod = await import(MODULE_PATH);
    createAutomatedUatGate = mod.createAutomatedUatGate;

    mockCtx = {
      sd: {
        id: 'test-sd-uuid-001',
        sd_key: 'SD-TEST-001',
        sd_type: 'feature',
        title: 'Test SD',
      },
      sdId: 'test-sd-uuid-001',
    };
  });

  function makeSupabase(stories) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: stories, error: null }),
        }),
      }),
    };
  }

  it('should return justified skip (score 100) for documentation SD type', async () => {
    mockCtx.sd.sd_type = 'documentation';
    mockSupabase = makeSupabase([]);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('documentation');
    expect(result.details.skipped).toBe(true);
  });

  it('should return justified skip (score 100) for protocol SD type', async () => {
    mockCtx.sd.sd_type = 'protocol';
    mockSupabase = makeSupabase([]);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped).toBe(true);
  });

  it('should return justified pass (score 80) when no user stories found', async () => {
    mockSupabase = makeSupabase([]);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings).toContain('No user stories for UAT validation');
  });

  it('should return advisory pass (score 85) when stories have no acceptance criteria', async () => {
    const stories = [
      { id: 'us-1', title: 'Story 1', story_key: 'SD-TEST-001:US-001', acceptance_criteria: null, status: 'completed' },
      { id: 'us-2', title: 'Story 2', story_key: 'SD-TEST-001:US-002', acceptance_criteria: [], status: 'completed' },
    ];
    mockSupabase = makeSupabase(stories);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(85);
    expect(result.warnings[0]).toContain('none have acceptance criteria');
  });

  it('should return correct gate structure', async () => {
    mockSupabase = makeSupabase([]);

    const gate = createAutomatedUatGate(mockSupabase);

    expect(gate.name).toBe('AUTOMATED_UAT_GATE');
    expect(gate.required).toBe(false);
    expect(typeof gate.validator).toBe('function');
  });

  it('should return result with passed, score, issues, warnings fields', async () => {
    mockSupabase = makeSupabase([]);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('max_score', 100);
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should pass when stories have acceptance criteria and test files exist', async () => {
    const stories = [
      {
        id: 'us-1',
        title: 'Story with criteria',
        story_key: 'SD-TEST-001:US-001',
        acceptance_criteria: [
          { scenario: 'Happy path', given: 'system ready', when: 'action taken', then: 'result achieved' },
        ],
        status: 'completed',
      },
    ];
    mockSupabase = makeSupabase(stories);

    const gate = createAutomatedUatGate(mockSupabase);
    const result = await gate.validator(mockCtx);

    // Since we're running inside a project that HAS test files, this should pass
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });
});
