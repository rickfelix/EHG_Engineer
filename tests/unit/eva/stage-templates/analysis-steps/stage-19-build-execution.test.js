/**
 * Unit tests for Stage 19 Analysis Step - Build Execution Progress
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

import { analyzeStage19, TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, COMPLETION_DECISIONS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-19-build-execution.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    tasks: [
      { name: 'Implement API', description: 'Build REST endpoints', assignee: 'Dev', status: 'done' },
      { name: 'Write tests', description: 'Unit and integration', assignee: 'QA', status: 'in_progress' },
    ],
    issues: [
      { description: 'Flaky test in CI', severity: 'medium', status: 'investigating' },
    ],
    sprintCompletion: {
      decision: 'continue',
      readyForQa: true,
      rationale: '1 of 2 tasks done, tests in progress',
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

const STAGE18_DATA = {
  sprint_goal: 'Build core features',
  items: [
    { title: 'API Endpoints', type: 'feature', story_points: 5 },
    { title: 'Test Suite', type: 'infrastructure', story_points: 3 },
  ],
  total_items: 2,
};

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('stage-19-build-execution.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LLM Path', () => {
    it('should synthesize build execution from sprint data', async () => {
      setupMock();
      const result = await analyzeStage19({ stage18Data: STAGE18_DATA, logger });

      expect(result.tasks).toHaveLength(2);
      expect(result.total_tasks).toBe(2);
      expect(result.completed_tasks).toBe(1);
      expect(result.completion_pct).toBeCloseTo(50);
      expect(result.sprintCompletion.decision).toBe('continue');
    });

    it('should throw without stage18Data', async () => {
      await expect(analyzeStage19({ logger })).rejects.toThrow('Stage 19 build execution requires Stage 18');
    });

    it('should normalize invalid task statuses to pending', async () => {
      setupMock({ tasks: [{ name: 'T1', status: 'INVALID' }] });
      const result = await analyzeStage19({ stage18Data: STAGE18_DATA, logger });

      expect(result.tasks[0].status).toBe('pending');
    });

    it('should compute tasks_by_status', async () => {
      setupMock();
      const result = await analyzeStage19({ stage18Data: STAGE18_DATA, logger });

      expect(result.tasks_by_status.done).toBe(1);
      expect(result.tasks_by_status.in_progress).toBe(1);
    });

    it('should track LLM fallback fields', async () => {
      setupMock({ tasks: [{ name: 'T1', status: 'INVALID' }] });
      const result = await analyzeStage19({ stage18Data: STAGE18_DATA, logger });

      expect(result.llmFallbackCount).toBeGreaterThan(0);
    });
  });

  describe('Real Data Path', () => {
    it('should use real data when venture_stage_work has tasks', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    advisory_data: {
                      tasks: [
                        { name: 'SD-A', status: 'done', assignee: 'leo-protocol' },
                        { name: 'SD-B', status: 'in_progress', assignee: 'leo-protocol' },
                        { name: 'SD-C', status: 'blocked', assignee: 'leo-protocol' },
                      ],
                      total_tasks: 3,
                      completed_tasks: 1,
                      blocked_tasks: 1,
                      issues: [{ description: 'SD-C blocked', severity: 'high', status: 'open' }],
                    },
                    stage_status: 'in_progress',
                    health_score: 'yellow',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      const result = await analyzeStage19({
        stage18Data: STAGE18_DATA,
        supabase: mockSupabase,
        ventureId: 'test-venture-id',
        logger,
      });

      expect(result.dataSource).toBe('venture_stage_work');
      expect(result.tasks).toHaveLength(3);
      expect(result.total_tasks).toBe(3);
      expect(result.completed_tasks).toBe(1);
      expect(result.blocked_tasks).toBe(1);
      expect(result.llmFallbackCount).toBe(0);
      expect(result.fourBuckets).toBeNull();
    });

    it('should fall back to LLM when no real data exists', async () => {
      setupMock();
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };

      const result = await analyzeStage19({
        stage18Data: STAGE18_DATA,
        supabase: mockSupabase,
        ventureId: 'test-venture-id',
        logger,
      });

      expect(result.dataSource).toBeUndefined();
      expect(result.fourBuckets).toBeDefined();
    });

    it('should map todo status to pending', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    advisory_data: {
                      tasks: [{ name: 'T1', status: 'todo', assignee: 'leo' }],
                      total_tasks: 1,
                      completed_tasks: 0,
                      blocked_tasks: 0,
                    },
                    stage_status: 'in_progress',
                    health_score: 'green',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      const result = await analyzeStage19({
        stage18Data: STAGE18_DATA,
        supabase: mockSupabase,
        ventureId: 'test-id',
        logger,
      });

      expect(result.tasks[0].status).toBe('pending');
    });
  });

  describe('Constants', () => {
    it('should export correct constant arrays', () => {
      expect(TASK_STATUSES).toContain('done');
      expect(ISSUE_SEVERITIES).toContain('critical');
      expect(ISSUE_STATUSES).toContain('resolved');
      expect(COMPLETION_DECISIONS).toContain('complete');
    });
  });
});
