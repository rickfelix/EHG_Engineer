/**
 * Tests for Stage 19 Build Brief Consumption
 * SD-LEO-FEAT-STAGE-BUILD-BRIEF-001
 *
 * Verifies that Stage 19 sprint planning includes build_brief context in the
 * LLM prompt and works correctly without it (backward compatibility).
 */
import { describe, it, expect, vi } from 'vitest';

// Shared mock function to capture calls
const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
  sprintGoal: 'Build core parking feature',
  sprintItems: [{
    title: 'Parking search feature',
    description: 'Search for nearby parking spots',
    type: 'feature',
    priority: 'high',
    estimatedLoc: 200,
    acceptanceCriteria: 'Users can search and see results',
    architectureLayer: 'frontend',
    milestoneRef: 'MVP',
  }],
}));

vi.mock('../../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: (str) => JSON.parse(str),
  extractUsage: () => ({}),
}));

vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: () => '',
}));

vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: () => ({}),
}));

vi.mock('../../../../lib/eva/bridge/sd-router.js', () => ({
  resolveTargetApplication: () => ({ targetApp: 'ehg' }),
}));

const { analyzeStage19 } = await import('../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js');

describe('Stage 19 build_brief consumption', () => {
  const baseStage18 = {
    buildReadiness: { decision: 'go', rationale: 'All checks passed' },
    ventureDescription: 'AI parking finder app',
    problemStatement: 'Users cannot find parking',
  };

  it('includes build_brief content in LLM prompt when provided', async () => {
    const stage17Data = {
      decision: 'PASS',
      build_brief: {
        problem_and_value: 'Users waste 20 min/day finding parking',
        customer_personas: 'Urban commuter, age 25-40',
        business_model: 'Freemium with premium tier',
        competitive_edge: 'Real-time ML predictions',
        pricing_strategy: '$5/mo premium',
        gtm_strategy: 'App store + social media',
        srip: 'Search, Reserve, Navigate user stories',
        product_roadmap: 'MVP in 3 months',
        financial_model: '',
        risk_matrix: '',
        brand_identity: '',
        architecture: '',
      },
    };

    await analyzeStage19({
      stage18Data: baseStage18,
      stage17Data,
      ventureName: 'ParkAI',
      logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    // Verify the LLM was called with build_brief content in the prompt
    const callArgs = mockComplete.mock.calls[0];
    const userPrompt = callArgs[1];

    expect(userPrompt).toContain('Build Context:');
    expect(userPrompt).toContain('Problem/Value: Users waste 20 min/day');
    expect(userPrompt).toContain('Personas: Urban commuter');
    expect(userPrompt).toContain('Business Model: Freemium');
    expect(userPrompt).toContain('Competitive Edge: Real-time ML');
    expect(userPrompt).toContain('Pricing: $5/mo');
    expect(userPrompt).toContain('GTM: App store');
    expect(userPrompt).toContain('SRIP: Search, Reserve');
    expect(userPrompt).toContain('Roadmap: MVP in 3 months');
  });

  it('works without build_brief (backward compatibility)', async () => {
    const stage17Data = { decision: 'PASS' };

    const result = await analyzeStage19({
      stage18Data: baseStage18,
      stage17Data,
      ventureName: 'ParkAI',
      logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    // Should still produce a valid sprint plan
    expect(result.sprint_name).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total_story_points).toBeGreaterThan(0);

    // Prompt should not contain build_brief sections
    const lastCallIdx = mockComplete.mock.calls.length - 1;
    const userPrompt = mockComplete.mock.calls[lastCallIdx][1];
    expect(userPrompt).not.toContain('Build Context:');
  });

  it('works when build_brief has all empty sections', async () => {
    const stage17Data = {
      decision: 'PASS',
      build_brief: {
        problem_and_value: '', competitive_edge: '', financial_model: '',
        risk_matrix: '', pricing_strategy: '', business_model: '',
        customer_personas: '', brand_identity: '', gtm_strategy: '',
        product_roadmap: '', architecture: '', srip: '',
      },
    };

    const result = await analyzeStage19({
      stage18Data: baseStage18,
      stage17Data,
      ventureName: 'ParkAI',
      logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    expect(result.sprint_name).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });
});
