/**
 * SD-LEO-INFRA-S19-DECOMPOSITION-COVERAGE-001 — end-to-end regression proof.
 *
 * Runs the REAL planner-normalization (analyzeStage19) output through the REAL bridge
 * decomposition logic (selectApplicableLayers, exported via lifecycle-sd-bridge.js's
 * _internal) — no mocking of either the planner-normalization or the bridge-decomposition
 * gate under test. Only the LLM client and JSON-parsing plumbing are mocked, matching the
 * established pattern in stage-19-architectureLayer-forwarding.test.js.
 *
 * Fixes the Stage-19 defect that shipped MarketLens to Stage 24 with no customer interface:
 * 9 of 10 sprint features (including "Develop Landing Page with Hero and CTA" and "User
 * Registration and Login Flow") produced ONLY api-layer children.
 */
import { describe, it, expect, vi } from 'vitest';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../../lib/eva/config/venture-default-capabilities.js';

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

const mockComplete = vi.fn();

vi.mock('../../../lib/llm/index.js', () => ({ getLLMClient: () => ({ complete: mockComplete }) }));
vi.mock('../../../lib/eva/utils/parse-json.js', () => ({ parseJSON: (str) => JSON.parse(str), extractUsage: () => ({}) }));
vi.mock('../../../lib/eva/utils/four-buckets-prompt.js', () => ({ getFourBucketsPrompt: () => '' }));
vi.mock('../../../lib/eva/utils/four-buckets-parser.js', () => ({ parseFourBuckets: () => ({}) }));
vi.mock('../../../lib/eva/bridge/sd-router.js', () => ({ resolveTargetApplication: () => ({ targetApp: 'EHG_Engineer' }) }));

const { analyzeStage19 } = await import('../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js');
const { _internal } = await import('../../../lib/eva/lifecycle-sd-bridge.js');
const { selectApplicableLayers } = _internal;

const baseStage18 = {
  buildReadiness: { decision: 'go', rationale: 'ok' },
  ventureDescription: 'MarketLens venture',
  problemStatement: 'Customer-facing SaaS front door',
};
const logger = { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
const callArgs = { stage18Data: baseStage18, stage17Data: { decision: 'PASS' }, ventureName: 'MarketLens', logger };

describe('SD-LEO-INFRA-S19-DECOMPOSITION-COVERAGE-001 — real planner + bridge path', () => {
  it('a customer-facing feature decomposes into BOTH ui and api children', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'Ship the front door',
      sprintItems: [
        {
          title: 'Develop Landing Page with Hero and CTA', description: 'Public landing page',
          type: 'feature', priority: 'high', estimatedLoc: 150,
          acceptanceCriteria: 'Visitor sees hero + CTA and can click through',
          architectureLayer: 'backend', // deliberately wrong single-layer, as the real LLM emitted
          milestoneRef: 'MVP',
        },
        ...MANDATORY_ITEMS,
      ],
    }));

    const result = await analyzeStage19(callArgs);
    const payload = result.sd_bridge_payloads.find(p => p.title === 'Develop Landing Page with Hero and CTA');
    expect(payload.decomposition_strategy).toBe('layered');

    const layers = selectApplicableLayers(payload).map(l => l.key);
    expect(layers).toContain('ui');
    expect(layers).toContain('api');
  });

  it('a genuinely backend-only item still produces EXACTLY one api child (no regression)', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'Harden observability',
      sprintItems: [
        {
          title: 'Wire Error Capture Middleware', description: 'Express error middleware',
          type: 'feature', priority: 'medium', estimatedLoc: 60,
          acceptanceCriteria: 'Errors are captured and logged',
          architectureLayer: 'backend',
          milestoneRef: 'MVP',
        },
        ...MANDATORY_ITEMS,
      ],
    }));

    const result = await analyzeStage19(callArgs);
    const payload = result.sd_bridge_payloads.find(p => p.title === 'Wire Error Capture Middleware');
    expect(payload.decomposition_strategy).toBe('leaf');

    const layers = selectApplicableLayers(payload).map(l => l.key);
    expect(layers).toEqual(['api']);
  });

  it('a feature item with an unrecognized architectureLayer and no UI signal fails loud, naming the item', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'Ship something ambiguous',
      sprintItems: [
        {
          title: 'Reconcile Ledger Batch Job', description: 'Nightly reconciliation job',
          type: 'feature', priority: 'medium', estimatedLoc: 90,
          acceptanceCriteria: 'Ledger reconciles nightly',
          architectureLayer: 'bogus',
          milestoneRef: 'MVP',
        },
        ...MANDATORY_ITEMS,
      ],
    }));

    await expect(analyzeStage19(callArgs)).rejects.toThrow(/Reconcile Ledger Batch Job/);
  });

  it('re-running the MarketLens sprint fixture yields ui children for every customer-facing feature', async () => {
    // The 9 real MarketLens sprint features that shipped API-only, plus the 1 genuinely
    // backend-only item ("Wire Error Capture Middleware") that must NOT regress.
    const marketLensFeatures = [
      'Develop Landing Page with Hero and CTA',
      'User Registration and Login Flow',
      'Persona Generation Results Page',
      'WTP Survey Form and Submission',
      'Chairman Decision Card Dashboard',
      'Feedback Widget UI',
      'Pricing Tier Signup Flow',
      'Account Profile Settings Page',
      'Onboarding Welcome Screen',
    ];

    mockComplete.mockResolvedValueOnce(JSON.stringify({
      sprintGoal: 'MarketLens full sprint',
      sprintItems: [
        ...marketLensFeatures.map(title => ({
          title, description: `${title} for MarketLens customers`,
          type: 'feature', priority: 'high', estimatedLoc: 100,
          acceptanceCriteria: 'Customer can complete the flow',
          architectureLayer: 'backend', // as the real LLM mis-emitted for all 9
          milestoneRef: 'MVP',
        })),
        {
          title: 'Wire Error Capture Middleware', description: 'Express error middleware',
          type: 'feature', priority: 'medium', estimatedLoc: 60,
          acceptanceCriteria: 'Errors are captured and logged',
          architectureLayer: 'backend',
          milestoneRef: 'MVP',
        },
        ...MANDATORY_ITEMS,
      ],
    }));

    const result = await analyzeStage19(callArgs);
    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));

    for (const title of marketLensFeatures) {
      const layers = selectApplicableLayers(byTitle[title]).map(l => l.key);
      expect(layers, `${title} must include a ui-layer child`).toContain('ui');
    }

    const backendOnlyLayers = selectApplicableLayers(byTitle['Wire Error Capture Middleware']).map(l => l.key);
    expect(backendOnlyLayers).toEqual(['api']);
  });
});
