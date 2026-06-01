/**
 * Unit Tests: Competitor Teardown Path
 *
 * Test Coverage:
 * - Throws on no URLs / empty array
 * - Analyzes each URL, returns PathOutput with origin_type='competitor_teardown'
 * - Handles single/multiple competitors
 * - Uses injected llmClient
 * - Runs gap analysis for multiple competitors
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => mockLlmClient),
}));

vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { executeCompetitorTeardown } from '../../../../../lib/eva/stage-zero/paths/competitor-teardown.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

let mockLlmClient;

function _createMockLlm(analysisResponse, deconstructionResponse, _gapResponse) {
  let callCount = 0;

  return {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockImplementation(() => {
        callCount++;
        // First N calls = competitor analyses (one per URL)
        // Then deconstruction, then gap analysis
        if (callCount <= (analysisResponse ? 1 : 0)) {
          return Promise.resolve({
            content: [{ text: JSON.stringify(analysisResponse) }],
          });
        }
        // For simplicity, return different responses based on call order
        // The implementation calls: analyzeCompetitor (per URL), deconstructToFirstPrinciples, runGapAnalysis
        return Promise.resolve({
          content: [{ text: JSON.stringify(deconstructionResponse || {
            suggested_venture_name: 'AI Venture',
            root_customer_problem: 'Customer problem',
            automation_solution: 'Automated solution',
            target_market: 'SMBs',
          }) }],
        });
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Simple mock that always returns valid JSON for any LLM call.
  // The SUT (analyzeCompetitor/deconstructToFirstPrinciples/runGapAnalysis) calls
  // `client.complete(system, prompt, opts)` and accepts either a raw string or
  // `{ content }`; `messages.create` is retained for any legacy callers.
  const mockAnalysisJson = JSON.stringify({
    company_name: 'TestCorp',
    url: 'http://test.com',
    business_model: 'SaaS',
    value_proposition: 'Test value',
    target_market: 'B2B',
    key_features: ['feature1'],
    work_components: [],
    weaknesses: ['slow'],
    differentiation_opportunities: ['AI automation'],
    suggested_venture_name: 'AI TestCorp',
    root_customer_problem: 'Manual processes',
    automation_solution: 'Full automation',
  });
  mockLlmClient = {
    _model: 'test-model',
    complete: vi.fn().mockResolvedValue(mockAnalysisJson),
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ text: mockAnalysisJson }] }),
    },
  };
});

describe('executeCompetitorTeardown', () => {
  test('throws when no URLs provided', async () => {
    await expect(executeCompetitorTeardown({ urls: [] }, { logger: silentLogger }))
      .rejects.toThrow('At least one competitor URL is required');
  });

  test('throws when urls is undefined', async () => {
    await expect(executeCompetitorTeardown({}, { logger: silentLogger }))
      .rejects.toThrow('At least one competitor URL is required');
  });

  test('analyzes single URL and returns PathOutput', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result).not.toBeNull();
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.competitor_urls).toEqual(['http://competitor.com']);
    expect(result.raw_material.competitor_analyses).toHaveLength(1);
    expect(result.metadata.path).toBe('competitor_teardown');
    expect(result.metadata.url_count).toBe(1);
  });

  test('analyzes multiple URLs', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://a.com', 'http://b.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result.competitor_urls).toEqual(['http://a.com', 'http://b.com']);
    expect(result.raw_material.competitor_analyses).toHaveLength(2);
    // Gap analysis runs for multiple competitors
    expect(result.raw_material.gap_analysis).not.toBeNull();
  });

  test('single competitor does not run gap analysis', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://single.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result.raw_material.gap_analysis).toBeNull();
  });

  test('uses injected llmClient', async () => {
    await executeCompetitorTeardown(
      { urls: ['http://test.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(mockLlmClient.complete).toHaveBeenCalled();
  });

  test('returns valid PathOutput with suggested fields from deconstruction', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://test.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    // The suggested fields come from the deconstruction response
    expect(result.suggested_name).toBeDefined();
    expect(result.suggested_problem).toBeDefined();
    expect(result.suggested_solution).toBeDefined();
    expect(result.target_market).toBeDefined();
  });
});

describe('executeCompetitorTeardown — differentiation board wiring (SD-LEO-INFRA-ACTIVATE-COMPETITIVE-INTELLIGENCE-001)', () => {
  const seededBoard = {
    gate: { seedable: true, delta: 0.7, threshold: 0.5, reason: 'defensible, seedable' },
    strategy: { angle: 'Automate the entire workflow with AI' },
    sanitization_status: 'passed',
  };

  test('TS-3: flag OFF — no persist, no board, no result_extras (no regression)', async () => {
    const persistSpy = vi.fn();
    const boardSpy = vi.fn();
    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      {
        logger: silentLogger,
        llmClient: mockLlmClient,
        supabase: {}, // present, but persist disabled
        persistTeardownAnalyses: persistSpy,
        runDifferentiationBoard: boardSpy,
      }
    );

    expect(persistSpy).not.toHaveBeenCalled();
    expect(boardSpy).not.toHaveBeenCalled();
    expect(result.result_extras).toBeUndefined();
    expect(result.origin_type).toBe('competitor_teardown');
  });

  test('TS-4: flag ON + board success — result_extras carries the mapped ExtendedStageZeroResult shape', async () => {
    const persistSpy = vi.fn().mockResolvedValue([{ id: 'ci-rec-1' }, { id: 'ci-rec-2' }]);
    const boardSpy = vi.fn().mockResolvedValue(seededBoard);

    const result = await executeCompetitorTeardown(
      { urls: ['http://a.com', 'http://b.com'] },
      {
        logger: silentLogger,
        llmClient: mockLlmClient,
        supabase: {},
        persistToCanonical: true,
        persistTeardownAnalyses: persistSpy,
        runDifferentiationBoard: boardSpy,
      }
    );

    // board runs on the PRIMARY (first) seeded record
    expect(boardSpy).toHaveBeenCalledTimes(1);
    expect(boardSpy.mock.calls[0][0]).toBe('ci-rec-1');

    expect(result.result_extras).toEqual({
      competitor_intelligence_id: 'ci-rec-1', // primary record stamped for the venture link
      differentiation_strategy: 'Automate the entire workflow with AI',
      delta_gate: { verdict: 'seedable', score: 0.7, threshold: 0.5, reason: 'defensible, seedable' },
      sanitization_status: 'passed',
      // SD-LEO-INFRA-SURFACE-DIFFERENTIATION-BOARD-001 FR-1: the projection now also
      // surfaces the board strategy's unique_advantages as opportunity cards. The
      // seededBoard fixture has no unique_advantages, so this is an empty array.
      differentiation_opportunities: [],
    });
    // canonical record ids still surfaced in metadata
    expect(result.metadata.canonical_ci_record_ids).toEqual(['ci-rec-1', 'ci-rec-2']);
  });

  test('TS-5: flag ON + board throws — teardown still completes, no result_extras, warning logged', async () => {
    const persistSpy = vi.fn().mockResolvedValue([{ id: 'ci-rec-1' }]);
    const boardSpy = vi.fn().mockRejectedValue(new Error('LLM timeout'));
    const warnLogger = { log: vi.fn(), warn: vi.fn() };

    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      {
        logger: warnLogger,
        llmClient: mockLlmClient,
        supabase: {},
        persistToCanonical: true,
        persistTeardownAnalyses: persistSpy,
        runDifferentiationBoard: boardSpy,
      }
    );

    expect(boardSpy).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result.origin_type).toBe('competitor_teardown');
    // Graceful degradation: board-display fields absent, but the venture-link id is
    // still stamped so confirm can link the record to the venture (Stage-4 lights up).
    expect(result.result_extras).toEqual({ competitor_intelligence_id: 'ci-rec-1' });
    expect(result.result_extras.delta_gate).toBeUndefined();
    expect(warnLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('differentiation board failed')
    );
  });

  test('flag ON but persist returns zero records — board is skipped', async () => {
    const persistSpy = vi.fn().mockResolvedValue([]);
    const boardSpy = vi.fn();

    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      {
        logger: silentLogger,
        llmClient: mockLlmClient,
        supabase: {},
        persistToCanonical: true,
        persistTeardownAnalyses: persistSpy,
        runDifferentiationBoard: boardSpy,
      }
    );

    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(boardSpy).not.toHaveBeenCalled();
    expect(result.result_extras).toBeUndefined();
  });
});
