/**
 * SD-LEO-INFRA-S19-SPRINT-ITEM-001 — schema-constrain architectureLayer + bounded re-ask on
 * refusal. Walk specimen: the S19 generator emitted architectureLayer "api" (outside the six-value
 * enum) for a feature item with no UI-interaction signal, and the honest-refusal guard correctly
 * refused — but was terminal on the FIRST occurrence instead of re-asking. This suite covers the
 * bounded validate-and-re-ask loop added around the honest-refusal guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../../../lib/eva/config/venture-default-capabilities.js';

const SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js'
);
const SOURCE_TEXT = fs.readFileSync(SOURCE_PATH, 'utf8');

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

// A feature item with an out-of-enum architectureLayer ("api") and a title/description that
// does NOT imply user interaction — this is the exact walk specimen shape (Stage-14 vocabulary
// term "api" leaking past the six-value enum) that previously threw on first occurrence.
function badLayerItem() {
  return {
    title: 'Develop Alt Text Generation API',
    description: 'Server-side endpoint for generating alt text',
    type: 'feature',
    priority: 'high',
    estimatedLoc: 150,
    acceptanceCriteria: 'Endpoint returns generated alt text',
    architectureLayer: 'api', // out-of-enum
    milestoneRef: 'MVP',
  };
}

function goodLayerItem() {
  return { ...badLayerItem(), architectureLayer: 'backend' };
}

function responseWith(items) {
  return JSON.stringify({
    sprintGoal: 'Ship the alt-text feature',
    sprintItems: [...items, ...MANDATORY_ITEMS],
  });
}

const mockComplete = vi.fn();

vi.mock('../../../../lib/llm/index.js', () => ({ getLLMClient: () => ({ complete: mockComplete }) }));
const mockExtractUsage = vi.fn(() => ({}));
vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({ parseJSON: (str) => JSON.parse(str), extractUsage: (r) => mockExtractUsage(r) }));
vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({ getFourBucketsPrompt: () => '' }));
vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({ parseFourBuckets: () => ({}) }));
vi.mock('../../../../lib/eva/bridge/sd-router.js', () => ({ resolveTargetApplication: () => ({ targetApp: 'ehg' }) }));

const { analyzeStage19, findArchitectureLayerViolations, MAX_ARCHITECTURE_LAYER_REASKS, ARCHITECTURE_LAYERS } =
  await import('../../../../lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js');

describe('SD-LEO-INFRA-S19-SPRINT-ITEM-001 — architectureLayer bounded re-ask', () => {
  const baseStage18 = {
    buildReadiness: { decision: 'go', rationale: 'ok' },
    ventureDescription: 'AltifyAI',
    problemStatement: 'Need alt-text generation',
  };
  const logger = { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const callArgs = () => ({ stage18Data: baseStage18, stage17Data: { decision: 'PASS' }, ventureName: 'AltifyAI', logger });

  beforeEach(() => {
    mockComplete.mockReset();
    logger.warn.mockClear();
    mockExtractUsage.mockReset();
    mockExtractUsage.mockReturnValue({});
  });

  it('findArchitectureLayerViolations flags a feature item with an out-of-enum layer and no UI signal', () => {
    const violations = findArchitectureLayerViolations([badLayerItem(), goodLayerItem()]);
    expect(violations).toHaveLength(1);
    expect(violations[0].title).toBe('Develop Alt Text Generation API');
    expect(violations[0].architectureLayer).toBe('api');
  });

  it('findArchitectureLayerViolations ignores items already in-enum', () => {
    expect(findArchitectureLayerViolations([goodLayerItem()])).toHaveLength(0);
  });

  it('MAX_ARCHITECTURE_LAYER_REASKS is 2 and ARCHITECTURE_LAYERS is the canonical six-value enum', () => {
    expect(MAX_ARCHITECTURE_LAYER_REASKS).toBe(2);
    expect(ARCHITECTURE_LAYERS).toEqual(['frontend', 'backend', 'database', 'infrastructure', 'integration', 'security']);
  });

  it('re-asks and succeeds: schema rejects the out-of-enum value, re-ask fires naming the violation, corrected response is accepted', async () => {
    mockComplete
      .mockResolvedValueOnce(responseWith([badLayerItem()]))
      .mockResolvedValueOnce(responseWith([goodLayerItem()]));

    const result = await analyzeStage19(callArgs());

    expect(mockComplete).toHaveBeenCalledTimes(2);
    // Re-ask prompt names the violating title and the bad value, and restates the full enum
    // (FR-1 AC#3) — not just naming the violation, but giving the model the corrective payload.
    const reaskPrompt = mockComplete.mock.calls[1][1];
    expect(reaskPrompt).toContain('Develop Alt Text Generation API');
    expect(reaskPrompt).toContain('"api"');
    expect(reaskPrompt).toContain('CORRECTION REQUIRED');
    for (const layer of ARCHITECTURE_LAYERS) {
      expect(reaskPrompt).toContain(layer);
    }

    // FR-3: every attempt is called with response_format:json_object.
    expect(mockComplete.mock.calls[0][2]).toMatchObject({ response_format: { type: 'json_object' } });
    expect(mockComplete.mock.calls[1][2]).toMatchObject({ response_format: { type: 'json_object' } });

    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));
    expect(byTitle['Develop Alt Text Generation API'].architectureLayer).toBe('backend');
    expect(logger.warn).toHaveBeenCalledWith(
      '[Stage19] architectureLayer violation(s) detected — re-asking',
      expect.objectContaining({ attempt: 1 })
    );
  });

  it('persistently-bad mock: exactly MAX_ARCHITECTURE_LAYER_REASKS re-asks (3 total calls), then honest terminal refusal', async () => {
    mockComplete.mockResolvedValue(responseWith([badLayerItem()]));

    await expect(analyzeStage19(callArgs())).rejects.toThrow(
      /unrecognized\/missing architectureLayer \("api"\)/
    );

    // 1 initial attempt + MAX_ARCHITECTURE_LAYER_REASKS re-asks = 3 total calls, never more.
    expect(mockComplete).toHaveBeenCalledTimes(MAX_ARCHITECTURE_LAYER_REASKS + 1);
  });

  it('never silently remaps an out-of-enum layer for a feature item with no UI signal — same call count, still throws with the offending value named', async () => {
    mockComplete.mockResolvedValue(responseWith([badLayerItem()]));
    let caught;
    try {
      await analyzeStage19(callArgs());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('"api"');
    expect(caught.message).not.toContain('defaulting'); // no silent default language
  });

  it('PRD TS-3: an unparseable response on a re-ask attempt retries rather than crashing, and a corrected response succeeds', async () => {
    mockComplete
      .mockResolvedValueOnce('not valid json')
      .mockResolvedValueOnce(responseWith([goodLayerItem()]));

    const result = await analyzeStage19(callArgs());

    expect(mockComplete).toHaveBeenCalledTimes(2);
    const reaskPrompt = mockComplete.mock.calls[1][1];
    expect(reaskPrompt).toContain('CORRECTION REQUIRED');
    expect(reaskPrompt).toContain('not valid JSON');
    expect(logger.warn).toHaveBeenCalledWith(
      '[Stage19] LLM JSON parse failed — re-asking',
      expect.objectContaining({ attempt: 1 })
    );

    const byTitle = Object.fromEntries(result.sd_bridge_payloads.map(p => [p.title, p]));
    expect(byTitle['Develop Alt Text Generation API'].architectureLayer).toBe('backend');
  });

  it('PRD TS-3: persistently unparseable responses propagate the parse error after exhausting re-asks (3 total calls)', async () => {
    mockComplete.mockResolvedValue('not valid json');

    await expect(analyzeStage19(callArgs())).rejects.toThrow();
    expect(mockComplete).toHaveBeenCalledTimes(MAX_ARCHITECTURE_LAYER_REASKS + 1);
  });

  it('PRD TS-4: an in-enum architectureLayer never triggers a re-ask — exactly 1 client.complete() call', async () => {
    mockComplete.mockResolvedValueOnce(responseWith([goodLayerItem()]));

    await analyzeStage19(callArgs());

    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('FR-2: SYSTEM_PROMPT no longer contains the bare Stage-14-reference phrasing and names the six-value enum', () => {
    expect(SOURCE_TEXT).not.toContain('must reference the technical architecture from Stage 14');
    expect(SOURCE_TEXT).toContain('map each item to the CLOSEST of these six');
    // Scoped to the Rules-section constraint line itself (not "anywhere in the file" — the
    // ARCHITECTURE_LAYERS constant declaration would trivially satisfy a bare-word search and
    // make this assertion vacuous; testing-agent mutation M5 caught exactly that during PLAN
    // re-verification, evidence row d7e286e3-01b0-4b99-a978-30a50379a75c).
    expect(SOURCE_TEXT).toContain(
      'MUST be exactly one of: frontend|backend|database|infrastructure|integration|security'
    );
  });

  it('accumulates token usage across every re-ask attempt rather than only reporting the final call', async () => {
    mockExtractUsage
      .mockReturnValueOnce({ inputTokens: 100, outputTokens: 50 })
      .mockReturnValueOnce({ inputTokens: 120, outputTokens: 60 });
    mockComplete
      .mockResolvedValueOnce(responseWith([badLayerItem()]))
      .mockResolvedValueOnce(responseWith([goodLayerItem()]));

    const result = await analyzeStage19(callArgs());

    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(result.usage).toEqual({ inputTokens: 220, outputTokens: 110 });
  });
});
