/**
 * Unit tests for PLAN-TO-LEAD Sub-Agent Orchestration Gate
 * SD: SD-LEARN-FIX-ADDRESS-PAT-AUTO-014
 *
 * Tests SD-type exemption parity with EXEC-TO-PLAN gate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the orchestrate module used by the gate (relative from gate file location)
vi.mock('../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/../../../../../orchestrate-phase-subagents.js', () => ({
  orchestrate: vi.fn(),
}));

const gatePath = '../../../../../scripts/modules/handoff/executors/plan-to-lead/gates/sub-agent-orchestration.js';

describe('PLAN-TO-LEAD Sub-Agent Orchestration Gate', () => {
  let createSubAgentOrchestrationGate;
  let mockOrchestrate;

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  function createMockSupabase(requiresSubAgents) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { requires_sub_agents: requiresSubAgents },
              error: null,
            }),
          }),
        }),
      }),
    };
  }

  function createErrorSupabase() {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockRejectedValue(new Error('DB connection failed')),
          }),
        }),
      }),
    };
  }

  it('skips orchestration for infrastructure SD (requires_sub_agents=false)', async () => {
    const supabase = createMockSupabase(false);

    const mod = await import(gatePath);
    const gate = mod.createSubAgentOrchestrationGate(supabase);
    const ctx = { sdId: 'SD-TEST-001', sd: { sd_type: 'infrastructure' } };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.skipped).toBe(true);
    expect(ctx._orchestrationResult.skipped).toBe(true);
  });

  it('gate response includes warnings when skipping', async () => {
    const supabase = createMockSupabase(false);

    const mod = await import(gatePath);
    const gate = mod.createSubAgentOrchestrationGate(supabase);
    const ctx = { sdId: 'SD-TEST-006', sd: { sd_type: 'documentation' } };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('documentation');
    expect(result.warnings[0]).toContain('requires_sub_agents=false');
  });

  it('gate response format includes all required fields', async () => {
    const supabase = createMockSupabase(false);

    const mod = await import(gatePath);
    const gate = mod.createSubAgentOrchestrationGate(supabase);
    const ctx = { sdId: 'SD-TEST-007', sd: { sd_type: 'infrastructure' } };

    const result = await gate.validator(ctx);

    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('max_score');
    expect(result).toHaveProperty('issues');
    expect(result).toHaveProperty('warnings');
    expect(result.max_score).toBe(100);
  });
});
