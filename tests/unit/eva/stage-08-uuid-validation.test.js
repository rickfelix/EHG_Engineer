/**
 * Regression test for SD-MAN-FIX-EVA-PIPELINE-MINOR-001
 *
 * Verifies that analyzeStage08 passes ventureId (UUID) to
 * validateConsistency, not ventureName (human-readable string).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
  customerSegments: { items: [{ text: 'Segment 1', priority: 1, evidence: 'Source: Stage 1' }] },
  valuePropositions: { items: [{ text: 'Value 1', priority: 1, evidence: 'Source: Stage 1' }] },
  channels: { items: [{ text: 'Channel 1', priority: 1, evidence: 'Source: Stage 1' }] },
  customerRelationships: { items: [{ text: 'Rel 1', priority: 1, evidence: 'Source: Stage 1' }] },
  revenueStreams: { items: [{ text: 'Revenue 1', priority: 1, evidence: 'Source: Stage 1' }] },
  keyResources: { items: [{ text: 'Resource 1', priority: 1, evidence: 'Source: Stage 1' }] },
  keyActivities: { items: [{ text: 'Activity 1', priority: 1, evidence: 'Source: Stage 1' }] },
  keyPartnerships: { items: [{ text: 'Partner 1', priority: 1, evidence: 'Source: Stage 1' }] },
  costStructure: { items: [{ text: 'Cost 1', priority: 1, evidence: 'Source: Stage 1' }] },
}));

const mockValidateConsistency = vi.fn().mockResolvedValue({
  consistent: true, hasWarning: false, hasBlock: false, deviations: [],
});

vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

vi.mock('../../../lib/eva/contracts/financial-contract.js', () => ({
  validateConsistency: mockValidateConsistency,
}));

vi.mock('../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: (str) => JSON.parse(str),
  extractUsage: () => ({ input_tokens: 0, output_tokens: 0 }),
}));

vi.mock('../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: () => '',
}));

vi.mock('../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: () => ({}),
}));

vi.mock('../../../lib/eva/utils/sanitize-for-prompt.js', () => ({
  sanitizeForPrompt: (s) => s || '',
}));

const { analyzeStage08 } = await import(
  '../../../lib/eva/stage-templates/analysis-steps/stage-08-bmc-generation.js'
);

const VENTURE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VENTURE_NAME = 'FormatShift API';

const baseParams = {
  stage1Data: { description: 'A test venture', valueProp: 'Test', targetMarket: 'Test' },
  stage4Data: {},
  stage5Data: { unitEconomics: { cac: 100, ltv: 500 }, initialInvestment: 50000 },
  stage6Data: {},
  stage7Data: {},
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

describe('Stage 08 UUID validation (SD-MAN-FIX-EVA-PIPELINE-MINOR-001)', () => {
  beforeEach(() => {
    mockValidateConsistency.mockClear();
    mockComplete.mockClear();
  });

  it('US-001: validateConsistency receives ventureId (UUID), not ventureName', async () => {
    await analyzeStage08({
      ...baseParams,
      ventureName: VENTURE_NAME,
      ventureId: VENTURE_UUID,
    });

    expect(mockValidateConsistency).toHaveBeenCalledTimes(1);
    expect(mockValidateConsistency).toHaveBeenCalledWith(
      VENTURE_UUID,
      8,
      expect.objectContaining({ cac: 100, ltv: 500 }),
    );
    // Verify name string was NOT passed
    expect(mockValidateConsistency.mock.calls[0][0]).not.toBe(VENTURE_NAME);
  });

  it('US-001: validation skipped when ventureId is undefined', async () => {
    await analyzeStage08({
      ...baseParams,
      ventureName: VENTURE_NAME,
      ventureId: undefined,
    });

    expect(mockValidateConsistency).not.toHaveBeenCalled();
  });

  it('US-001: validation skipped when no unitEconomics', async () => {
    await analyzeStage08({
      ...baseParams,
      stage5Data: {},
      ventureName: VENTURE_NAME,
      ventureId: VENTURE_UUID,
    });

    expect(mockValidateConsistency).not.toHaveBeenCalled();
  });

  it('US-001: ventureName still used in LLM prompt', async () => {
    await analyzeStage08({
      ...baseParams,
      ventureName: VENTURE_NAME,
      ventureId: VENTURE_UUID,
    });

    expect(mockComplete).toHaveBeenCalledTimes(1);
    const promptArg = mockComplete.mock.calls[0][1];
    expect(promptArg).toContain(VENTURE_NAME);
  });
});
