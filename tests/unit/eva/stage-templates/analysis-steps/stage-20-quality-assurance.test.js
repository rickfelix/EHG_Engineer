/**
 * Unit tests for Stage 20 Analysis Step - Quality Assurance
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C
 *
 * Tests both LLM-synthesis and real-data paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

vi.mock('../../../../../lib/eva/contracts/financial-contract.js', () => ({
  getContract: vi.fn().mockResolvedValue(null),
}));

import { analyzeStage20, QUALITY_DECISIONS, TEST_SUITE_TYPES, DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_PASS_RATE, MIN_COVERAGE_PCT } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-20-quality-assurance.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    testSuites: [
      { name: 'Unit Tests', type: 'unit', totalTests: 100, passingTests: 97, coveragePct: 85, taskRefs: ['API'] },
    ],
    knownDefects: [
      { description: 'Race condition in auth', severity: 'high', status: 'open', testSuiteRef: 'Unit Tests' },
    ],
    qualityDecision: {
      decision: 'pass',
      rationale: '97% pass rate exceeds threshold',
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const STAGE19_DATA = {
  tasks: [{ name: 'API', status: 'done' }],
  total_tasks: 3,
  completed_tasks: 2,
  blocked_tasks: 0,
  issues: [],
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-20-quality-assurance.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Path', () => {
    it('should generate QA assessment from build data', async () => {
      setupMock();
      const result = await analyzeStage20({ stage19Data: STAGE19_DATA, logger });

      expect(result.test_suites).toHaveLength(1);
      expect(result.overall_pass_rate).toBe(97);
      expect(result.qualityDecision.decision).toBe('pass');
    });

    it('should throw without stage19Data', async () => {
      await expect(analyzeStage20({ logger })).rejects.toThrow('Stage 20 QA requires Stage 19');
    });

    it('should fallback to default test suite when LLM returns empty', async () => {
      setupMock({ testSuites: [] });
      const result = await analyzeStage20({ stage19Data: STAGE19_DATA, logger });

      expect(result.test_suites).toHaveLength(1);
      expect(result.test_suites[0].name).toBe('Core Test Suite');
    });

    it('should cap passingTests to totalTests', async () => {
      setupMock({ testSuites: [{ name: 'T', type: 'unit', totalTests: 10, passingTests: 15, coveragePct: 80 }] });
      const result = await analyzeStage20({ stage19Data: STAGE19_DATA, logger });

      expect(result.test_suites[0].passing_tests).toBeLessThanOrEqual(result.test_suites[0].total_tests);
    });

    it('should compute quality_gate_passed correctly', async () => {
      setupMock({ testSuites: [{ name: 'T', type: 'unit', totalTests: 100, passingTests: 100, coveragePct: 80 }] });
      const result = await analyzeStage20({ stage19Data: STAGE19_DATA, logger });

      // 100% pass rate + 80% coverage >= MIN_COVERAGE_PCT → gate passed
      expect(result.quality_gate_passed).toBe(true);
    });
  });

  describe('Real Data Path', () => {
    it('should use real QA data from venture_stage_work when stage19 used real data', async () => {
      const stage19Real = {
        ...STAGE19_DATA,
        dataSource: 'venture_stage_work',
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    advisory_data: {
                      tasks: [
                        { name: 'SD-A', status: 'done' },
                        { name: 'SD-B', status: 'done' },
                        { name: 'SD-C', status: 'blocked' },
                      ],
                      total_tasks: 3,
                      completed_tasks: 2,
                      blocked_tasks: 1,
                      issues: [{ description: 'SD-C blocked', severity: 'high', status: 'open' }],
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      const result = await analyzeStage20({
        stage19Data: stage19Real,
        supabase: mockSupabase,
        ventureId: 'test-venture-id',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.test_suites[0].name).toBe('SD Completion Suite');
      expect(result.test_suites[0].type).toBe('integration');
      expect(result.overall_pass_rate).toBeCloseTo(66.67, 1);
      expect(result.llmFallbackCount).toBe(0);
    });

    it('should skip real data path when stage19 did not use real data', async () => {
      setupMock();
      const stage19NoReal = { ...STAGE19_DATA }; // no dataSource

      const result = await analyzeStage20({
        stage19Data: stage19NoReal,
        supabase: {},
        ventureId: 'test-id',
        logger,
      });

      // Should have used LLM since stage19 didn't use real data
      expect(result.dataSource).toBeUndefined();
    });
  });

  describe('Constants', () => {
    it('should export correct thresholds', () => {
      expect(MIN_PASS_RATE).toBe(95);
      expect(MIN_COVERAGE_PCT).toBe(60);
      expect(QUALITY_DECISIONS).toContain('conditional_pass');
      expect(TEST_SUITE_TYPES).toEqual(['unit', 'integration', 'e2e']);
    });
  });
});
