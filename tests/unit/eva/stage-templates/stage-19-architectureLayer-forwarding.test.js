/**
 * SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-1 — the S19 sprint planner must forward each item's
 * architectureLayer signal (plus decomposition_strategy) into sd_bridge_payloads, instead of
 * stripping it. Without this, the bridge's selectApplicableLayers never sees the signal and falls
 * back to all four architecture layers (the vacuous-decomposition root cause).
 */
import { describe, it, expect, vi } from 'vitest';

// Mandatory portfolio-default capabilities analyzeStage19 validates for (feedback-widget +
// error-capture-middleware); the planner throws MissingDefaultCapabilityError without them.
const MANDATORY_ITEMS = [
  { title: 'Integrate Feedback Widget', description: 'Add feedback widget', type: 'infra', priority: 'medium', estimatedLoc: 30, acceptanceCriteria: 'Widget visible', architectureLayer: 'frontend', milestoneRef: 'MVP' },
  { title: 'Wire Error Capture Middleware', description: 'Add error capture', type: 'infra', priority: 'medium', estimatedLoc: 20, acceptanceCriteria: 'Errors captured', architectureLayer: 'backend', milestoneRef: 'MVP' },
];

const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
  sprintGoal: 'Ship the landing experience',
  sprintItems: [
    { title: 'Landing Hero', description: 'Hero section', type: 'feature', priority: 'high', estimatedLoc: 80, acceptanceCriteria: 'Hero renders', architectureLayer: 'frontend', milestoneRef: 'MVP' },
    { title: 'Signup API', description: 'POST /signup', type: 'feature', priority: 'high', estimatedLoc: 120, acceptanceCriteria: 'Signup works', architectureLayer: 'backend', milestoneRef: 'MVP' },
    ...MANDATORY_ITEMS,
  ],
}));

vi.mock('../../../../lib/llm/index.js', () => ({ getLLMClient: () => ({ complete: mockComplete }) }));
vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({ parseJSON: (str) => JSON.parse(str), extractUsage: () => ({}) }));
vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({ getFourBucketsPrompt: () => '' }));
vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({ parseFourBuckets: () => ({}) }));
vi.mock('../../../../lib/eva/bridge/sd-router.js', () => ({ resolveTargetApplication: () => ({ targetApp: 'ehg' }) }));

const { analyzeStage19 } = await import('../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js');

describe('SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-1 — planner forwards architectureLayer', () => {
  const baseStage18 = {
    buildReadiness: { decision: 'go', rationale: 'ok' },
    ventureDescription: 'Landing-first venture',
    problemStatement: 'Need a landing page',
  };
  const logger = { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const callArgs = { stage18Data: baseStage18, stage17Data: { decision: 'PASS' }, ventureName: 'LandingCo', logger };

  it('carries each item architectureLayer into sd_bridge_payloads (previously stripped)', async () => {
    const result = await analyzeStage19(callArgs);
    expect(result.sd_bridge_payloads.length).toBeGreaterThan(0);
    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));
    expect(byTitle['Landing Hero'].architectureLayer).toBe('frontend');
    expect(byTitle['Signup API'].architectureLayer).toBe('backend');
  });

  it('defaults decomposition_strategy to "leaf" (one SD per item) on every payload', async () => {
    const result = await analyzeStage19(callArgs);
    for (const p of result.sd_bridge_payloads) {
      expect(p.decomposition_strategy).toBe('leaf');
    }
  });
});
