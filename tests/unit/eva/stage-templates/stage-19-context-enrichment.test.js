/**
 * Unit tests for Stage 19 context enrichment and value gate
 * Part of SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-A
 *
 * Tests the enriched context building (milestones, architecture, venture problem/solution)
 * and the value gate that checks for feature-type items.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock complete function so tests can inspect calls
const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
  sprintGoal: 'Build core user dashboard',
  sprintItems: [
    {
      title: 'User Dashboard UI',
      description: 'Build the main user dashboard with key metrics',
      type: 'feature',
      priority: 'high',
      estimatedLoc: 200,
      acceptanceCriteria: 'Dashboard shows user metrics',
      architectureLayer: 'frontend',
      milestoneRef: 'MVP Launch',
    },
  ],
}));

vi.mock('../../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: () => '',
}));

vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: () => ({}),
}));

vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: (str) => JSON.parse(str),
  extractUsage: () => ({ input_tokens: 100, output_tokens: 50 }),
}));

vi.mock('../../../../lib/eva/bridge/sd-router.js', () => ({
  resolveTargetApplication: () => ({ targetApp: 'ehg' }),
}));

import { analyzeStage19 } from '../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js';

describe('Stage 19 Context Enrichment', () => {
  const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FR-1: Milestone context enrichment', () => {
    it('should include full milestone descriptions in LLM prompt', async () => {
      const stage13Data = {
        milestones: [
          { name: 'MVP Launch', description: 'Launch minimum viable product with core features', success_criteria: 'Users can sign up and use main feature' },
          { name: 'Growth Phase', description: 'Expand user base and add integrations', success_criteria: '1000 active users' },
        ],
      };

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        stage13Data,
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('MVP Launch');
      expect(promptArg).toContain('Launch minimum viable product with core features');
      expect(promptArg).toContain('Users can sign up and use main feature');
    });

    it('should handle milestones without descriptions gracefully', async () => {
      const stage13Data = {
        milestones: [{ name: 'Phase 1' }],
      };

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        stage13Data,
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('Phase 1');
    });
  });

  describe('FR-2: Architecture context enrichment', () => {
    it('should include component responsibilities in LLM prompt', async () => {
      const stage14Data = {
        total_components: 8,
        layer_count: 3,
        layers: {
          frontend: { responsibility: 'User interface and interactions', components: [{ name: 'Dashboard' }, { name: 'Auth' }] },
          backend: { responsibility: 'API and business logic', components: [{ name: 'UserService' }] },
          database: { responsibility: 'Data persistence and queries' },
        },
      };

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        stage14Data,
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('User interface and interactions');
      expect(promptArg).toContain('API and business logic');
      expect(promptArg).toContain('Dashboard');
    });

    it('should handle layers without components gracefully', async () => {
      const stage14Data = {
        total_components: 2,
        layers: {
          frontend: { description: 'UI layer' },
        },
      };

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        stage14Data,
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('frontend');
      expect(promptArg).toContain('UI layer');
    });
  });

  describe('FR-3: Venture problem/solution context', () => {
    it('should include venture description in LLM prompt', async () => {

      await analyzeStage19({
        stage18Data: {
          buildReadiness: { decision: 'go', rationale: 'Ready' },
          ventureDescription: 'A platform for managing small business finances',
        },
        ventureName: 'FinanceApp',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('A platform for managing small business finances');
    });

    it('should include problem and solution in LLM prompt', async () => {

      await analyzeStage19({
        stage18Data: {
          buildReadiness: { decision: 'go', rationale: 'Ready' },
          problemStatement: 'Small businesses lack affordable accounting tools',
          solutionHypothesis: 'AI-powered bookkeeping that automates 80% of tasks',
        },
        ventureName: 'FinanceApp',
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('Small businesses lack affordable accounting tools');
      expect(promptArg).toContain('AI-powered bookkeeping');
    });

    it('should handle missing venture context gracefully', async () => {

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      // Should not throw, prompt should still be valid
      expect(mockComplete).toHaveBeenCalled();
    });
  });

  describe('FR-4: Value-feature system prompt instruction', () => {
    it('should include value-feature instruction in system prompt', async () => {

      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      const systemPromptArg = mockComplete.mock.calls[0][0];
      expect(systemPromptArg).toContain('CRITICAL');
      expect(systemPromptArg).toContain('type "feature"');
      expect(systemPromptArg).toContain('core user-facing value');
    });
  });

  describe('FR-5: Value gate validation', () => {
    it('should warn when sprint contains no feature-type items', async () => {
      // Mock LLM to return infra-only items
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        sprintGoal: 'Set up infrastructure',
        sprintItems: [
          { title: 'Set up CI/CD', description: 'Configure pipeline', type: 'infra', priority: 'high', estimatedLoc: 100, acceptanceCriteria: 'Pipeline works', architectureLayer: 'infrastructure', milestoneRef: 'MVP' },
          { title: 'Refactor auth', description: 'Clean up auth code', type: 'refactor', priority: 'medium', estimatedLoc: 80, acceptanceCriteria: 'Auth works', architectureLayer: 'backend', milestoneRef: 'MVP' },
        ],
      }));

      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('VALUE GATE'),
      );
      expect(result.hasValueFeature).toBe(false);
    });

    it('should not warn when sprint includes feature-type items', async () => {
      // Default mock returns a feature item
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(silentLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('VALUE GATE'),
      );
      expect(result.hasValueFeature).toBe(true);
    });

    it('should include hasValueFeature in return object', async () => {
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(result).toHaveProperty('hasValueFeature');
      expect(typeof result.hasValueFeature).toBe('boolean');
    });
  });

  describe('FR-6: Backward compatibility', () => {
    it('should work with minimal stage18Data only', async () => {
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(result.sprint_name).toBeDefined();
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.sd_bridge_payloads).toBeDefined();
    });

    it('should preserve existing output schema fields', async () => {
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(result).toHaveProperty('sprint_name');
      expect(result).toHaveProperty('sprint_duration_days');
      expect(result).toHaveProperty('sprint_goal');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total_items');
      expect(result).toHaveProperty('total_story_points');
      expect(result).toHaveProperty('sd_bridge_payloads');
      expect(result).toHaveProperty('llmFallbackCount');
      expect(result).toHaveProperty('fourBuckets');
      expect(result).toHaveProperty('usage');
    });
  });

  describe('Sprint Iteration (SD-D)', () => {
    it('should accept sprintIteration parameter and include in return', async () => {
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        sprintIteration: 2,
        logger: silentLogger,
      });

      expect(result.sprintIteration).toBe(2);
    });

    it('should default sprintIteration to 0 when not provided', async () => {
      const result = await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        logger: silentLogger,
      });

      expect(result.sprintIteration).toBe(0);
    });

    it('should include sprint iteration context in LLM prompt when iteration > 0', async () => {
      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        sprintIteration: 1,
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).toContain('Sprint Iteration: 1');
      expect(promptArg).toContain('core user-facing features');
    });

    it('should NOT include sprint iteration context when iteration is 0', async () => {
      await analyzeStage19({
        stage18Data: { buildReadiness: { decision: 'go', rationale: 'Ready' } },
        ventureName: 'TestVenture',
        sprintIteration: 0,
        logger: silentLogger,
      });

      const promptArg = mockComplete.mock.calls[0][1];
      expect(promptArg).not.toContain('Sprint Iteration:');
    });
  });
});
