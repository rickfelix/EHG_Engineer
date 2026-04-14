/**
 * Tests for Stage 19 Landing Page Gate
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-A-B
 *
 * Verifies that Stage 19 sprint planning enforces landing page presence
 * and auto-injects a default item when the LLM output omits one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track calls for assertion
let mockComplete;

function createMockResponse(sprintItems) {
  return JSON.stringify({
    sprintGoal: 'Build core features',
    sprintItems,
  });
}

const infraItem = {
  title: 'Setup CI/CD pipeline',
  description: 'Configure build and deploy',
  type: 'infra',
  priority: 'high',
  estimatedLoc: 100,
  acceptanceCriteria: 'Pipeline runs green',
  architectureLayer: 'infrastructure',
  milestoneRef: 'MVP',
};

const featureItem = {
  title: 'User dashboard',
  description: 'Create main user dashboard with stats',
  type: 'feature',
  priority: 'high',
  estimatedLoc: 200,
  acceptanceCriteria: 'Dashboard displays user data',
  architectureLayer: 'frontend',
  milestoneRef: 'MVP',
};

const landingPageItem = {
  title: 'Landing Page',
  description: 'Create the main landing page for the venture',
  type: 'feature',
  priority: 'high',
  estimatedLoc: 150,
  acceptanceCriteria: 'Page loads at root URL',
  architectureLayer: 'frontend',
  milestoneRef: 'MVP',
};

const demoPageItem = {
  title: 'Demo Page for stakeholders',
  description: 'Build a demo page showing core functionality',
  type: 'feature',
  priority: 'high',
  estimatedLoc: 120,
  acceptanceCriteria: 'Demo accessible',
  architectureLayer: 'frontend',
  milestoneRef: 'MVP',
};

const homePageDescItem = {
  title: 'Main navigation component',
  description: 'Navigation with link to home page and features',
  type: 'feature',
  priority: 'medium',
  estimatedLoc: 80,
  acceptanceCriteria: 'Nav renders correctly',
  architectureLayer: 'frontend',
  milestoneRef: 'MVP',
};

beforeEach(() => {
  vi.resetModules();
  mockComplete = vi.fn();
});

vi.mock('../../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: (...args) => mockComplete(...args) }),
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

const baseStage18 = {
  buildReadiness: { decision: 'go', rationale: 'Ready' },
};
let silentLogger;

describe('Stage 19 Landing Page Gate', () => {
  beforeEach(() => {
    silentLogger = { log: vi.fn(), warn: vi.fn() };
  });

  it('auto-injects landing page item when LLM output has none', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem, infraItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    expect(result.hasLandingPage).toBe(false);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LANDING PAGE GATE'),
    );
    // Auto-injected item should be present
    const injected = result.items.find(i => /landing|demo/i.test(i.title));
    expect(injected).toBeDefined();
    expect(injected.type).toBe('feature');
    expect(injected.scope).toBe('frontend');
  });

  it('does NOT inject when LLM includes a landing page item', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem, landingPageItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    expect(result.hasLandingPage).toBe(true);
    // Should be exactly 2 items, no injection
    expect(result.items).toHaveLength(2);
    expect(silentLogger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('LANDING PAGE GATE'),
    );
  });

  it('detects demo page as equivalent to landing page', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem, demoPageItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    expect(result.hasLandingPage).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('detects home page keyword in description', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem, homePageDescItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    expect(result.hasLandingPage).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('increments llmFallbackCount when landing page is auto-injected', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    expect(result.hasLandingPage).toBe(false);
    expect(result.llmFallbackCount).toBeGreaterThanOrEqual(1);
  });

  it('does not increment llmFallbackCount when landing page exists', async () => {
    mockComplete.mockResolvedValueOnce(createMockResponse([featureItem, landingPageItem]));

    const result = await analyzeStage19({ stage18Data: baseStage18, logger: silentLogger });

    // llmFallbackCount should be 0 (value gate passes, landing page passes, all fields valid)
    expect(result.llmFallbackCount).toBe(0);
  });
});
