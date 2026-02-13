/**
 * Unit tests for Stage 23 Analysis Step - Launch Execution
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-23-launch-execution.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage23, LAUNCH_TYPES, TASK_STATUSES, CRITERION_PRIORITIES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-execution.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    launchType: 'beta',
    launchBrief: 'Launching the MVP to a closed beta group of 50 users for initial feedback.',
    successCriteria: [
      { metric: 'User signups', target: '50 in 7 days', measurementWindow: '7 days', priority: 'primary' },
      { metric: 'Error rate', target: 'Below 5%', measurementWindow: '7 days', priority: 'secondary' },
      { metric: 'NPS score', target: 'Above 30', measurementWindow: '14 days', priority: 'secondary' },
    ],
    rollbackTriggers: [
      { condition: 'Error rate exceeds 10% for 1 hour', severity: 'critical' },
      { condition: 'Zero signups in first 48 hours', severity: 'warning' },
    ],
    launchTasks: [
      { name: 'Deploy to production', owner: 'Engineering', status: 'done' },
      { name: 'Send beta invites', owner: 'Marketing', status: 'pending' },
      { name: 'Configure monitoring', owner: 'DevOps', status: 'in_progress' },
    ],
    plannedLaunchDate: '2026-03-01',
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const VALID_PARAMS = {
  stage22Data: {
    releaseDecision: { decision: 'release', rationale: 'QA passed' },
    releaseItems: [{ name: 'Feature A', status: 'approved' }],
    sprintRetrospective: { wentWell: ['Velocity improved'] },
  },
};

describe('stage-23-launch-execution.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export LAUNCH_TYPES', () => {
      expect(LAUNCH_TYPES).toEqual(['soft_launch', 'beta', 'general_availability']);
    });

    it('should export TASK_STATUSES', () => {
      expect(TASK_STATUSES).toEqual(['pending', 'in_progress', 'done', 'blocked']);
    });

    it('should export CRITERION_PRIORITIES', () => {
      expect(CRITERION_PRIORITIES).toEqual(['primary', 'secondary']);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage22Data is missing', async () => {
      await expect(analyzeStage23({})).rejects.toThrow('Stage 23 launch execution requires Stage 22');
    });
  });

  describe('Launch type normalization', () => {
    it('should accept valid launch types', async () => {
      for (const lt of LAUNCH_TYPES) {
        setupMock({ launchType: lt });
        const result = await analyzeStage23(VALID_PARAMS);
        expect(result.launchType).toBe(lt);
      }
    });

    it('should default to soft_launch for invalid type', async () => {
      setupMock({ launchType: 'invalid' });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchType).toBe('soft_launch');
    });
  });

  describe('Launch brief normalization', () => {
    it('should use LLM-provided brief', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchBrief).toContain('MVP');
    });

    it('should truncate to 1000 characters', async () => {
      setupMock({ launchBrief: 'X'.repeat(2000) });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchBrief.length).toBe(1000);
    });

    it('should default when missing', async () => {
      setupMock({ launchBrief: undefined });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchBrief).toBe('Launch brief pending.');
    });
  });

  describe('Success criteria normalization', () => {
    it('should use LLM-provided criteria', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.successCriteria.length).toBe(3);
      expect(result.successCriteria[0].metric).toBe('User signups');
    });

    it('should provide defaults when fewer than 2 criteria', async () => {
      setupMock({ successCriteria: [{ metric: 'Only one' }] });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.successCriteria.length).toBe(2);
      expect(result.successCriteria[0].priority).toBe('primary');
    });

    it('should ensure at least one primary criterion', async () => {
      setupMock({
        successCriteria: [
          { metric: 'M1', target: 'T1', measurementWindow: '7 days', priority: 'secondary' },
          { metric: 'M2', target: 'T2', measurementWindow: '7 days', priority: 'secondary' },
        ],
      });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.successCriteria.some(sc => sc.priority === 'primary')).toBe(true);
    });

    it('should default invalid priority to secondary', async () => {
      setupMock({
        successCriteria: [
          { metric: 'M1', target: 'T1', measurementWindow: '7 days', priority: 'primary' },
          { metric: 'M2', target: 'T2', measurementWindow: '7 days', priority: 'invalid' },
        ],
      });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.successCriteria[1].priority).toBe('secondary');
    });

    it('should truncate metric to 200 characters', async () => {
      setupMock({
        successCriteria: [
          { metric: 'M'.repeat(300), target: 'T1', measurementWindow: '7 days', priority: 'primary' },
          { metric: 'M2', target: 'T2', measurementWindow: '7 days', priority: 'secondary' },
        ],
      });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.successCriteria[0].metric.length).toBe(200);
    });
  });

  describe('Rollback triggers normalization', () => {
    it('should use LLM-provided triggers', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.rollbackTriggers.length).toBe(2);
    });

    it('should provide default when empty', async () => {
      setupMock({ rollbackTriggers: [] });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.rollbackTriggers.length).toBe(1);
      expect(result.rollbackTriggers[0].severity).toBe('critical');
    });

    it('should default invalid severity to warning', async () => {
      setupMock({
        rollbackTriggers: [{ condition: 'Something bad', severity: 'invalid' }],
      });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.rollbackTriggers[0].severity).toBe('warning');
    });
  });

  describe('Launch tasks normalization', () => {
    it('should use LLM-provided tasks', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchTasks.length).toBe(3);
    });

    it('should provide default when empty', async () => {
      setupMock({ launchTasks: [] });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchTasks.length).toBe(1);
    });

    it('should default invalid status to pending', async () => {
      setupMock({
        launchTasks: [{ name: 'Task', owner: 'Owner', status: 'invalid' }],
      });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchTasks[0].status).toBe('pending');
    });

    it('should accept all valid task statuses', async () => {
      for (const status of TASK_STATUSES) {
        setupMock({
          launchTasks: [{ name: 'Task', owner: 'Owner', status }],
        });
        const result = await analyzeStage23(VALID_PARAMS);
        expect(result.launchTasks[0].status).toBe(status);
      }
    });
  });

  describe('Planned launch date normalization', () => {
    it('should accept valid YYYY-MM-DD date', async () => {
      setupMock({ plannedLaunchDate: '2026-03-15' });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.plannedLaunchDate).toBe('2026-03-15');
    });

    it('should generate default date for invalid format', async () => {
      setupMock({ plannedLaunchDate: 'not-a-date' });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.plannedLaunchDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Output shape', () => {
    it('should return all expected fields', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result).toHaveProperty('launchType');
      expect(result).toHaveProperty('launchBrief');
      expect(result).toHaveProperty('successCriteria');
      expect(result).toHaveProperty('rollbackTriggers');
      expect(result).toHaveProperty('launchTasks');
      expect(result).toHaveProperty('plannedLaunchDate');
      expect(result).toHaveProperty('totalTasks');
      expect(result).toHaveProperty('blockedTasks');
      expect(result).toHaveProperty('primaryCriteria');
      expect(result).toHaveProperty('totalCriteria');
    });

    it('should compute derived counts correctly', async () => {
      setupMock();
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.totalTasks).toBe(result.launchTasks.length);
      expect(result.blockedTasks).toBe(result.launchTasks.filter(lt => lt.status === 'blocked').length);
      expect(result.primaryCriteria).toBe(result.successCriteria.filter(sc => sc.priority === 'primary').length);
      expect(result.totalCriteria).toBe(result.successCriteria.length);
    });
  });

  describe('Upstream data integration', () => {
    it('should include stage22 release context in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage23(VALID_PARAMS);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('release');
    });

    it('should include stage01 criteria in prompt when provided', async () => {
      const mockComplete = setupMock();
      await analyzeStage23({
        ...VALID_PARAMS,
        stage01Data: { successCriteria: [{ metric: 'Revenue', target: '$10K MRR' }] },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('Revenue');
    });

    it('should include ventureName in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage23({ ...VALID_PARAMS, ventureName: 'TestVenture' });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('TestVenture');
    });
  });

  describe('JSON parsing', () => {
    it('should handle markdown code block wrapping', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage23(VALID_PARAMS);
      expect(result.launchType).toBe('beta');
    });

    it('should throw on unparseable response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('Not JSON');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage23(VALID_PARAMS)).rejects.toThrow('Failed to parse launch execution response');
    });
  });
});
