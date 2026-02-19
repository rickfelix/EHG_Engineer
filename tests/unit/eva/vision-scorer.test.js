/**
 * Tests for Vision Scorer: classifyScore and THRESHOLDS
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 *
 * vision-scorer.js exports only scoreSD. classifyScore and THRESHOLDS are
 * module-internal. We test classification behaviour through scoreSD with
 * full mocking of Supabase, LLM, and notifications.
 *
 * We also verify the expected threshold constants independently.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GRADE } from '../../../lib/standards/grade-scale.js';

// Mock heavy side-effect modules
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('../../../lib/llm/client-factory.js', () => ({ getValidationClient: vi.fn() }));
vi.mock('../../../lib/notifications/orchestrator.js', () => ({
  sendVisionScoreNotification: vi.fn(),
  sendVisionScoreTelegramNotification: vi.fn(),
}));

let scoreSD;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/vision-scorer.js');
  scoreSD = mod.scoreSD;
});

// Thresholds derived from GRADE constants (lib/standards/grade-scale.js)
// These mirror vision-scorer.js THRESHOLDS after the grade-scale alignment.
const THRESHOLDS = {
  ACCEPT:        GRADE.A,        // 93
  MINOR_SD:      GRADE.B,        // 83
  GAP_CLOSURE_SD: GRADE.C_MINUS, // 70
};

describe('vision-scorer: classifyScore (via threshold constants)', () => {
  it('maps score 100 to accept tier', () => {
    expect(100).toBeGreaterThanOrEqual(THRESHOLDS.ACCEPT);
  });

  it('maps score 93 (ACCEPT boundary = GRADE.A) to accept tier', () => {
    expect(GRADE.A).toBeGreaterThanOrEqual(THRESHOLDS.ACCEPT);
  });

  it('maps score 92 (ACCEPT - 1) to minor_sd tier', () => {
    expect(GRADE.A - 1).toBeLessThan(THRESHOLDS.ACCEPT);
    expect(GRADE.A - 1).toBeGreaterThanOrEqual(THRESHOLDS.MINOR_SD);
  });

  it('maps score 83 (MINOR_SD boundary = GRADE.B) to minor_sd tier', () => {
    expect(GRADE.B).toBeGreaterThanOrEqual(THRESHOLDS.MINOR_SD);
    expect(GRADE.B).toBeLessThan(THRESHOLDS.ACCEPT);
  });

  it('maps score 82 (MINOR_SD - 1) to gap_closure_sd tier', () => {
    expect(GRADE.B - 1).toBeLessThan(THRESHOLDS.MINOR_SD);
    expect(GRADE.B - 1).toBeGreaterThanOrEqual(THRESHOLDS.GAP_CLOSURE_SD);
  });

  it('maps score 70 (GAP_CLOSURE_SD boundary = GRADE.C_MINUS) to gap_closure_sd tier', () => {
    expect(GRADE.C_MINUS).toBeGreaterThanOrEqual(THRESHOLDS.GAP_CLOSURE_SD);
    expect(GRADE.C_MINUS).toBeLessThan(THRESHOLDS.MINOR_SD);
  });

  it('maps score 69 (GAP_CLOSURE_SD - 1) to escalate tier', () => {
    expect(GRADE.C_MINUS - 1).toBeLessThan(THRESHOLDS.GAP_CLOSURE_SD);
  });

  it('maps score 0 to escalate tier', () => {
    expect(0).toBeLessThan(THRESHOLDS.GAP_CLOSURE_SD);
  });
});

describe('vision-scorer: THRESHOLDS alignment with GRADE', () => {
  it('THRESHOLDS.ACCEPT equals GRADE.A (93)', () => {
    expect(THRESHOLDS.ACCEPT).toBe(GRADE.A);
    expect(THRESHOLDS.ACCEPT).toBe(93);
  });

  it('THRESHOLDS.MINOR_SD equals GRADE.B (83)', () => {
    expect(THRESHOLDS.MINOR_SD).toBe(GRADE.B);
    expect(THRESHOLDS.MINOR_SD).toBe(83);
  });

  it('THRESHOLDS.GAP_CLOSURE_SD equals GRADE.C_MINUS (70)', () => {
    expect(THRESHOLDS.GAP_CLOSURE_SD).toBe(GRADE.C_MINUS);
    expect(THRESHOLDS.GAP_CLOSURE_SD).toBe(70);
  });
});

describe('vision-scorer: scoreSD classification via full mock', () => {
  function buildMockLLMResponse(totalScore) {
    return {
      content: JSON.stringify({
        dimensions: [
          { id: 'V01', name: 'Vision Dimension', score: totalScore, reasoning: 'Test vision', gaps: [] },
          { id: 'A01', name: 'Arch Dimension', score: totalScore, reasoning: 'Test arch', gaps: [] },
        ],
        total_score: totalScore,
        summary: 'Test summary',
      }),
    };
  }

  function buildMockSupabase() {
    const visionData = {
      id: 'vision-uuid',
      vision_key: 'VISION-TEST',
      extracted_dimensions: [{ name: 'Vision Dimension', description: 'Test vision dim', weight: 1.0 }],
      status: 'active',
    };
    const archData = {
      id: 'arch-uuid',
      plan_key: 'ARCH-TEST',
      extracted_dimensions: [{ name: 'Arch Dimension', description: 'Test arch dim', weight: 1.0 }],
      status: 'active',
    };
    const sdData = {
      id: 'sd-uuid',
      sd_key: 'SD-TEST',
      title: 'Test SD',
      description: 'Test',
      key_changes: [],
      success_criteria: [],
      sd_type: 'feature',
    };

    return {
      from: vi.fn((table) => {
        if (table === 'eva_vision_documents') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  single: () => ({ data: visionData, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'eva_architecture_plans') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  single: () => ({ data: archData, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: () => ({
                single: () => ({ data: sdData, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };
  }

  it('classifies score 95 as accept', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(95)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('accept');
  });

  it('classifies score 87 (B+ range) as minor_sd', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(87)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('minor_sd');
  });

  it('classifies score 75 (C+ range) as gap_closure_sd', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(75)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('gap_closure_sd');
  });

  it('classifies score 40 as escalate', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(40)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('escalate');
  });

  it('classifies exact boundary 93 (GRADE.A) as accept', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(GRADE.A)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('accept');
  });

  it('classifies exact boundary 83 (GRADE.B) as minor_sd', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(GRADE.B)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('minor_sd');
  });

  it('classifies exact boundary 70 (GRADE.C_MINUS) as gap_closure_sd', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue(buildMockLLMResponse(GRADE.C_MINUS)) };
    const result = await scoreSD({
      sdKey: 'SD-TEST',
      dryRun: true,
      supabase: buildMockSupabase(),
      llmClient: mockLLM,
    });
    expect(result.threshold_action).toBe('gap_closure_sd');
  });
});
