/**
 * Unit tests for Stage 12 GTM Sales - EVA Key Artifact Writing
 * SD-LEO-ORCH-PIPELINE-INTEGRITY-FIX-002-B
 *
 * Tests:
 * - writeArtifact is called with correct params when supabase/ventureId provided
 * - writeArtifact is skipped when supabase/ventureId not provided (backward compat)
 * - writeArtifact failure is non-blocking (graceful degradation)
 * - Function signature accepts visionKey, planKey, supabase, ventureId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing module under test
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

vi.mock('../../../../../lib/eva/artifact-persistence-service.js', () => ({
  writeArtifact: vi.fn().mockResolvedValue('artifact-uuid-123'),
}));

vi.mock('../../../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(() => false),
  searchBatch: vi.fn(),
  formatResultsForPrompt: vi.fn(),
}));

import { analyzeStage12 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-12-gtm-sales.js';
import { writeArtifact } from '../../../../../lib/eva/artifact-persistence-service.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createValidLLMResponse() {
  return JSON.stringify({
    marketTiers: [
      { name: 'Tier 1', description: 'SMB', persona: 'Persona A', painPoints: ['cost'], tam: 100000, sam: 50000, som: 5000 },
      { name: 'Tier 2', description: 'Mid-Market', persona: 'Persona B', painPoints: ['scale'], tam: 200000, sam: 100000, som: 10000 },
      { name: 'Tier 3', description: 'Enterprise', persona: 'Persona C', painPoints: ['compliance'], tam: 500000, sam: 200000, som: 20000 },
    ],
    channels: Array.from({ length: 8 }, (_, i) => ({
      name: `Channel ${i + 1}`, channelType: 'organic', primaryTier: 'Tier 1',
      monthly_budget: 1000, expected_cac: 50, primary_kpi: 'Leads',
    })),
    salesModel: 'hybrid',
    sales_cycle_days: 30,
    deal_stages: [
      { name: 'Qualification', description: 'Initial', avg_duration_days: 3, mappedFunnelStage: 'Awareness' },
      { name: 'Discovery', description: 'Demo', avg_duration_days: 7, mappedFunnelStage: 'Interest' },
      { name: 'Proposal', description: 'Pricing', avg_duration_days: 5, mappedFunnelStage: 'Consideration' },
    ],
    funnel_stages: [
      { name: 'Awareness', metric: 'Visitors', target_value: 10000, conversionRateEstimate: 0.1 },
      { name: 'Interest', metric: 'Signups', target_value: 1000, conversionRateEstimate: 0.3 },
      { name: 'Consideration', metric: 'Trials', target_value: 300, conversionRateEstimate: 0.2 },
      { name: 'Purchase', metric: 'Paid', target_value: 60, conversionRateEstimate: 0.5 },
    ],
    customer_journey: [
      { step: 'Discover', funnel_stage: 'Awareness', touchpoint: 'Search' },
      { step: 'Explore', funnel_stage: 'Interest', touchpoint: 'Website' },
      { step: 'Try', funnel_stage: 'Consideration', touchpoint: 'Trial' },
      { step: 'Engage', funnel_stage: 'Consideration', touchpoint: 'Product' },
      { step: 'Buy', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
    ],
  });
}

const baseInput = {
  stage1Data: { description: 'Test venture', targetMarket: 'SaaS', problemStatement: 'Testing' },
  stage10Data: {
    customerPersonas: [
      { name: 'Persona A', goals: ['goal1'], painPoints: ['pain1'] },
      { name: 'Persona B', goals: ['goal2'], painPoints: ['pain2'] },
      { name: 'Persona C', goals: ['goal3'], painPoints: ['pain3'] },
    ],
    brandGenome: { archetype: 'Hero', audience: 'developers', differentiators: ['fast'] },
  },
  ventureName: 'TestVenture',
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

describe('stage-12-gtm-sales.js - EVA Key Artifact Writing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockClient = { complete: vi.fn().mockResolvedValue(createValidLLMResponse()) };
    getLLMClient.mockReturnValue(mockClient);
  });

  it('should call writeArtifact with EVA keys when supabase and ventureId provided', async () => {
    const mockSupabase = {};
    const result = await analyzeStage12({
      ...baseInput,
      supabase: mockSupabase,
      ventureId: 'venture-uuid-123',
      visionKey: 'VISION-TESTVENTURE-L2-001',
      planKey: null,
    });

    expect(writeArtifact).toHaveBeenCalledTimes(1);
    expect(writeArtifact).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({
      ventureId: 'venture-uuid-123',
      lifecycleStage: 12,
      artifactType: 'identity_gtm_strategy',
      visionKey: 'VISION-TESTVENTURE-L2-001',
      planKey: null,
      source: 'stage-12-analysis',
    }));

    // Verify analysis result is still returned
    expect(result.marketTiers).toHaveLength(3);
    expect(result.channels).toHaveLength(8);
    expect(result.salesModel).toBe('hybrid');
  });

  it('should skip writeArtifact when supabase is not provided (backward compat)', async () => {
    const result = await analyzeStage12({ ...baseInput });

    expect(writeArtifact).not.toHaveBeenCalled();
    expect(result.marketTiers).toHaveLength(3);
    expect(result.salesModel).toBe('hybrid');
  });

  it('should skip writeArtifact when ventureId is not provided', async () => {
    const result = await analyzeStage12({
      ...baseInput,
      supabase: {},
    });

    expect(writeArtifact).not.toHaveBeenCalled();
    expect(result.marketTiers).toHaveLength(3);
  });

  it('should handle writeArtifact failure gracefully', async () => {
    writeArtifact.mockRejectedValueOnce(new Error('DB connection failed'));

    const result = await analyzeStage12({
      ...baseInput,
      supabase: {},
      ventureId: 'venture-uuid-123',
      visionKey: 'VISION-TEST-L2-001',
    });

    expect(writeArtifact).toHaveBeenCalledTimes(1);
    expect(baseInput.logger.warn).toHaveBeenCalledWith(
      '[Stage12] GTM artifact write failed (non-blocking)',
      expect.objectContaining({ error: 'DB connection failed' }),
    );

    // Analysis result still returned despite artifact write failure
    expect(result.marketTiers).toHaveLength(3);
    expect(result.channels).toHaveLength(8);
  });

  it('should pass correct metadata in artifact write', async () => {
    await analyzeStage12({
      ...baseInput,
      supabase: {},
      ventureId: 'venture-uuid-123',
      visionKey: 'VISION-TEST-L2-001',
    });

    const callArgs = writeArtifact.mock.calls[0][1];
    expect(callArgs.title).toBe('GTM & Sales Strategy (Stage 12)');
    expect(callArgs.metadata).toMatchObject({
      channel_count: 8,
      tier_count: 3,
      source: 'stage-12-analysis',
    });
    expect(callArgs.metadata.reality_gate_pass).toBeDefined();
  });
});
