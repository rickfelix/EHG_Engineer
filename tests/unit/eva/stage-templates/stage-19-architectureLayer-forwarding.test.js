/**
 * SD-LEO-INFRA-REPO-GROUNDED-INTELLIGENT-001 FR-1 — the S19 sprint planner must forward each item's
 * architectureLayer signal (plus decomposition_strategy) into sd_bridge_payloads, instead of
 * stripping it. Without this, the bridge's selectApplicableLayers never sees the signal and falls
 * back to all four architecture layers (the vacuous-decomposition root cause).
 */
import { describe, it, expect, vi } from 'vitest';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../../../lib/eva/config/venture-default-capabilities.js';

// Mandatory portfolio-default capabilities analyzeStage19 validates for; the planner throws
// MissingDefaultCapabilityError without them. SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-EXPAND-001:
// derive from the canonical config (was a hardcoded 2-item list that broke when the set grew to 7).
const MANDATORY_ITEMS = EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => ({
  title: c.name,
  description: c.description.slice(0, 60),
  type: 'infra',
  priority: 'medium',
  estimatedLoc: 30,
  acceptanceCriteria: 'Mandatory capability present',
  architectureLayer: 'infrastructure',
  milestoneRef: 'MVP',
}));

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

  it('defaults decomposition_strategy to "leaf" for infra items with no user-interaction signal', async () => {
    const result = await analyzeStage19(callArgs);
    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));
    for (const cap of EHG_VENTURE_DEFAULT_CAPABILITIES) {
      expect(byTitle[cap.name].decomposition_strategy).toBe('leaf');
    }
  });

  // SD-LEO-INFRA-S19-DECOMPOSITION-COVERAGE-001 FR-1: a feature-type item whose title/description
  // implies user interaction now opts into 'layered' decomposition regardless of its single
  // architectureLayer classification, guaranteeing a ui-layer grandchild downstream. Both "Landing
  // Hero" (hero/landing) and "Signup API" (signup) carry a user-interaction signal in this fixture
  // — biased toward recall, since a missed customer-facing feature is the costlier failure mode.
  it('marks feature items with a user-interaction signal as decomposition_strategy=layered', async () => {
    const result = await analyzeStage19(callArgs);
    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));
    expect(byTitle['Landing Hero'].decomposition_strategy).toBe('layered');
    expect(byTitle['Signup API'].decomposition_strategy).toBe('layered');
  });
});
