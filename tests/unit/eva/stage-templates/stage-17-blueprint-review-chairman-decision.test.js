/**
 * Tests for stage-17-blueprint-review.js's chairman_decisions write path.
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-F (C4.1): the PASS branch used to self-approve
 * (status='approved', decision='approve', resolved_at=...) on chairman_decisions, a write
 * that always failed silently (the table has no resolved_at column) while the paired log
 * still claimed "auto-approved". These tests assert the self-approval write is gone and
 * every gate recommendation now logs the same honest pending state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ARTIFACT_TYPES } from '../../../../lib/eva/artifact-types.js';

const mockCreateOrReusePendingDecision = vi.fn();
const mockRecordGateResult = vi.fn();
const mockRecordGateAttempt = vi.fn();
const mockFetchSripSummary = vi.fn();

vi.mock('../../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: (...args) => mockCreateOrReusePendingDecision(...args),
}));
vi.mock('../../../../lib/eva/artifact-persistence-service.js', () => ({
  recordGateResult: (...args) => mockRecordGateResult(...args),
  recordGateAttempt: (...args) => mockRecordGateAttempt(...args),
}));
vi.mock('../../../../lib/eva/eva-orchestrator-helpers.js', () => ({
  fetchSripSummary: (...args) => mockFetchSripSummary(...args),
}));

const { analyzeStage17 } = await import('../../../../lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js');

const REQUIRED_ARTIFACT_TYPES_BY_STAGE = {
  1: ARTIFACT_TYPES.TRUTH_IDEA_BRIEF,
  2: ARTIFACT_TYPES.TRUTH_AI_CRITIQUE,
  3: ARTIFACT_TYPES.TRUTH_VALIDATION_DECISION,
  4: ARTIFACT_TYPES.TRUTH_COMPETITIVE_ANALYSIS,
  5: ARTIFACT_TYPES.TRUTH_FINANCIAL_MODEL,
  6: ARTIFACT_TYPES.ENGINE_RISK_MATRIX,
  7: ARTIFACT_TYPES.ENGINE_PRICING_MODEL,
  8: ARTIFACT_TYPES.ENGINE_BUSINESS_MODEL_CANVAS,
  9: ARTIFACT_TYPES.ENGINE_EXIT_STRATEGY,
  10: ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND,
  11: ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL,
  12: ARTIFACT_TYPES.IDENTITY_GTM_SALES_STRATEGY,
  13: ARTIFACT_TYPES.BLUEPRINT_PRODUCT_ROADMAP,
  14: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
  15: ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK,
  16: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
};

function makeFullArtifactSet(qualityScore = 90) {
  return Object.entries(REQUIRED_ARTIFACT_TYPES_BY_STAGE).map(([stage, artifact_type]) => ({
    id: `art-${stage}`,
    lifecycle_stage: Number(stage),
    artifact_type,
    is_current: true,
    metadata: {},
    quality_score: qualityScore,
    created_at: new Date().toISOString(),
    artifact_data: {},
  }));
}

/**
 * Chainable Supabase mock covering the two venture_artifacts query shapes this module
 * issues: the main completeness-check query (terminates in .order()) and the
 * supplementary wireframe lookup (terminates in .maybeSingle()).
 */
function makeSupabaseMock({ artifacts = [] } = {}) {
  const fromCalls = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => chain,
    order: () => Promise.resolve({ data: artifacts, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
  };
  const supabase = {
    from: (table) => {
      fromCalls.push(table);
      return chain;
    },
  };
  return { supabase, fromCalls };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateOrReusePendingDecision.mockResolvedValue({ id: 'decision-abc-123' });
  mockRecordGateResult.mockResolvedValue(undefined);
  mockRecordGateAttempt.mockResolvedValue(undefined);
  mockFetchSripSummary.mockResolvedValue(null);
});

describe('analyzeStage17 chairman_decisions write path', () => {
  it('never writes to chairman_decisions on a PASS recommendation', async () => {
    const { supabase, fromCalls } = makeSupabaseMock({ artifacts: makeFullArtifactSet(90) });

    const result = await analyzeStage17({ ventureId: 'venture-1', supabase, logger });

    expect(result.gate_recommendation).toBe('PASS');
    expect(fromCalls).not.toContain('chairman_decisions');
    expect(mockCreateOrReusePendingDecision).toHaveBeenCalledTimes(1);
  });

  it('logs the same honest pending message on PASS as on non-PASS (no "auto-approved" claim)', async () => {
    const { supabase } = makeSupabaseMock({ artifacts: makeFullArtifactSet(90) });

    await analyzeStage17({ ventureId: 'venture-1', supabase, logger });

    const pendingLogCall = logger.info.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('chairman decision pending')
    );
    expect(pendingLogCall).toBeDefined();
    expect(pendingLogCall[0]).toContain('PASS');

    const autoApprovedCall = logger.info.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('auto-approved')
    );
    expect(autoApprovedCall).toBeUndefined();
  });

  it('never writes to chairman_decisions on a non-PASS (FAIL) recommendation either', async () => {
    const { supabase, fromCalls } = makeSupabaseMock({ artifacts: [] });

    const result = await analyzeStage17({ ventureId: 'venture-1', supabase, logger });

    expect(result.gate_recommendation).toBe('FAIL');
    expect(fromCalls).not.toContain('chairman_decisions');
    expect(mockCreateOrReusePendingDecision).toHaveBeenCalledTimes(1);

    const pendingLogCall = logger.info.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('chairman decision pending')
    );
    expect(pendingLogCall).toBeDefined();
    expect(pendingLogCall[0]).toContain('FAIL');
  });

  it('still creates/reuses a pending decision even when createOrReusePendingDecision is the only chairman-decision touchpoint', async () => {
    const { supabase } = makeSupabaseMock({ artifacts: makeFullArtifactSet(90) });

    await analyzeStage17({ ventureId: 'venture-42', supabase, logger });

    expect(mockCreateOrReusePendingDecision).toHaveBeenCalledWith(
      expect.objectContaining({ ventureId: 'venture-42', stageNumber: 17 })
    );
  });
});
