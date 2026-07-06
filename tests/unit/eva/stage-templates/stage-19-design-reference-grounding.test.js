/**
 * SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001 FR-5 — designReference.wireframeName was previously
 * requested from the LLM in the prompt schema but silently dropped during sprintItems
 * normalization, never reaching `items` or `sd_bridge_payloads`. This also grounds the prompt
 * with the venture's REAL Stage 15 wireframe screen names so wireframeName can't be hallucinated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../../../lib/eva/config/venture-default-capabilities.js';

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

vi.mock('../../../../lib/llm/index.js', () => ({ getLLMClient: () => ({ complete: mockComplete }) }));
vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({ parseJSON: (str) => JSON.parse(str), extractUsage: () => ({}) }));
vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({ getFourBucketsPrompt: () => '' }));
vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({ parseFourBuckets: () => ({}) }));
vi.mock('../../../../lib/eva/bridge/sd-router.js', () => ({ resolveTargetApplication: () => ({ targetApp: 'ehg' }) }));

const { analyzeStage19 } = await import('../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js');

describe('SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001 FR-5 — designReference grounding', () => {
  const baseStage18 = {
    buildReadiness: { decision: 'go', rationale: 'ok' },
    ventureDescription: 'Landing-first venture',
    problemStatement: 'Need a landing page',
  };
  const logger = { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const stage15Data = { screens: [{ name: 'Landing Page' }, { name: 'Dashboard' }] };

  beforeEach(() => {
    mockComplete.mockClear();
  });

  function llmResponse(items) {
    return JSON.stringify({
      sprintGoal: 'Ship the landing experience',
      sprintItems: [...items, ...MANDATORY_ITEMS],
    });
  }

  it('injects real Stage 15 screen names into the prompt', async () => {
    mockComplete.mockResolvedValue(llmResponse([]));
    await analyzeStage19({ stage18Data: baseStage18, stage17Data: {}, stage15Data, ventureName: 'LandingCo', logger });
    const userPrompt = mockComplete.mock.calls[0][1];
    expect(userPrompt).toContain('Landing Page, Dashboard');
  });

  it('carries a designReference through to items/sd_bridge_payloads when it matches a real screen', async () => {
    mockComplete.mockResolvedValue(llmResponse([
      {
        title: 'Dashboard View', description: 'Renders the dashboard', type: 'feature', priority: 'high',
        estimatedLoc: 100, acceptanceCriteria: 'Dashboard renders', architectureLayer: 'frontend', milestoneRef: 'MVP',
        designReference: { wireframeName: 'Dashboard', designLayer: 'layout' },
      },
    ]));
    const result = await analyzeStage19({ stage18Data: baseStage18, stage17Data: {}, stage15Data, ventureName: 'LandingCo', logger });
    const item = result.items.find(i => i.title === 'Dashboard View');
    expect(item.designReference).toEqual({ wireframeName: 'Dashboard', designLayer: 'layout' });
    const payload = result.sd_bridge_payloads.find(p => p.title === 'Dashboard View');
    expect(payload.design_reference).toEqual({ wireframeName: 'Dashboard', designLayer: 'layout' });
  });

  it('nulls out a hallucinated wireframeName that does not match a real screen', async () => {
    mockComplete.mockResolvedValue(llmResponse([
      {
        title: 'Settings View', description: 'Renders settings', type: 'feature', priority: 'medium',
        estimatedLoc: 80, acceptanceCriteria: 'Settings renders', architectureLayer: 'frontend', milestoneRef: 'MVP',
        designReference: { wireframeName: 'Nonexistent Screen', designLayer: 'layout' },
      },
    ]));
    const result = await analyzeStage19({ stage18Data: baseStage18, stage17Data: {}, stage15Data, ventureName: 'LandingCo', logger });
    const item = result.items.find(i => i.title === 'Settings View');
    expect(item.designReference).toBeNull();
  });

  it('degrades gracefully to null designReference when stage15Data is absent (no regression)', async () => {
    mockComplete.mockResolvedValue(llmResponse([
      {
        title: 'Generic Feature', description: 'Some feature', type: 'feature', priority: 'medium',
        estimatedLoc: 80, acceptanceCriteria: 'Feature works', architectureLayer: 'frontend', milestoneRef: 'MVP',
        designReference: { wireframeName: 'Landing Page', designLayer: 'layout' },
      },
    ]));
    const result = await analyzeStage19({ stage18Data: baseStage18, stage17Data: {}, ventureName: 'LandingCo', logger });
    const item = result.items.find(i => i.title === 'Generic Feature');
    expect(item.designReference).toBeNull();
    const userPrompt = mockComplete.mock.calls[0][1];
    expect(userPrompt).not.toContain('Available Wireframe Screens');
  });
});
