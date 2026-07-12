/**
 * Unit Tests: Stage Zero Orchestrator
 * SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 *
 * Test Coverage:
 * - Throws on missing supabase
 * - Calls routePath with selected path
 * - Returns failure when path returns no output
 * - Calls synthesis when not skipped
 * - Skips synthesis when options.skipSynthesis=true
 * - Calls chairman review after synthesis
 * - Persists brief when approved, parks in nursery when rejected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transitive deps
vi.mock('../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

// Mock path-router
vi.mock('../../../../lib/eva/stage-zero/path-router.js', () => ({
  routePath: vi.fn(),
  ENTRY_PATHS: Object.freeze({
    COMPETITOR_TEARDOWN: 'competitor_teardown',
    BLUEPRINT_BROWSE: 'blueprint_browse',
    DISCOVERY_MODE: 'discovery_mode',
  }),
  PATH_OPTIONS: [
    { key: 'competitor_teardown', label: 'Competitor Teardown' },
    { key: 'blueprint_browse', label: 'Blueprint Browse' },
    { key: 'discovery_mode', label: 'Discovery Mode' },
  ],
  listDiscoveryStrategies: vi.fn().mockReturnValue([]),
}));

// Mock chairman-review. QF-20260712-860: spread importOriginal() so every real export
// (WipLimitExceededError, WIP_LIMIT_CONFIG_KEY, TEST_FIXTURE_NAME_PREFIXES, and any future
// addition) forwards through — an object-literal factory silently drops later-added exports,
// which a full-suite-scale vitest isolation-reset race can then expose as a cross-file
// undefined-import TypeError in an unrelated test file (RCA-confirmed, agentId a3eb2631b99a57084).
vi.mock('../../../../lib/eva/stage-zero/chairman-review.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, conductChairmanReview: vi.fn(), persistVentureBrief: vi.fn() };
});

// Mock synthesis
vi.mock('../../../../lib/eva/stage-zero/synthesis/index.js', () => ({
  runSynthesis: vi.fn(),
}));

// Mock modeling
vi.mock('../../../../lib/eva/stage-zero/modeling.js', () => ({
  generateForecast: vi.fn().mockResolvedValue({ revenue: 1000 }),
  calculateVentureScore: vi.fn().mockReturnValue(75),
}));

import { executeStageZero } from '../../../../lib/eva/stage-zero/stage-zero-orchestrator.js';
import { routePath } from '../../../../lib/eva/stage-zero/path-router.js';
import { conductChairmanReview, persistVentureBrief } from '../../../../lib/eva/stage-zero/chairman-review.js';
import { runSynthesis } from '../../../../lib/eva/stage-zero/synthesis/index.js';
import { generateForecast } from '../../../../lib/eva/stage-zero/modeling.js';

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockPathOutput = {
  origin_type: 'discovery',
  raw_material: {},
  suggested_name: 'TestVenture',
  suggested_problem: 'Test problem',
  suggested_solution: 'Test solution',
  target_market: 'Test market',
  competitor_urls: [],
  blueprint_id: null,
  discovery_strategy: null,
  metadata: {},
};

const mockBrief = {
  name: 'TestVenture',
  problem_statement: 'Test problem',
  solution: 'Test solution',
  target_market: 'Test market',
  origin_type: 'discovery',
  raw_chairman_intent: 'Test problem',
  maturity: 'ready',
  metadata: {},
};

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'v-1' }, error: null }),
  })),
};

describe('StageZeroOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw on missing supabase', async () => {
    await expect(
      executeStageZero({ path: 'discovery_mode' }, { logger: silentLogger }),
    ).rejects.toThrow('supabase client is required');
  });

  it('should call routePath with selected path', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-1' });

    await executeStageZero(
      { path: 'discovery_mode', pathParams: { strategy: 'market_gap' } },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(routePath).toHaveBeenCalledWith(
      'discovery_mode',
      { strategy: 'market_gap' },
      expect.objectContaining({ supabase: mockSupabase }),
    );
  });

  it('should return failure when path returns no output', async () => {
    routePath.mockResolvedValue(null);

    const result = await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Path returned no output');
    expect(result.duration_ms).toBeDefined();
  });

  it('should call synthesis when not skipped', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-1' });

    await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(runSynthesis).toHaveBeenCalledWith(
      mockPathOutput,
      expect.objectContaining({ supabase: mockSupabase }),
    );
  });

  // H7 (Delta-ledger 41a2e6da, SD-LEO-INFRA-SYNTHESIS-SCORING-HARDENING-001): a
  // forecast-generation throw previously left metadata.venture_score entirely absent
  // (silently missing) and the run proceeded anyway. It must now proceed with an
  // explicit, marked, below-neutral score instead.
  it('stamps a marked venture_score:0 (not silently absent) when forecast generation throws', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    generateForecast.mockRejectedValueOnce(new Error('LLM outage'));
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-1' });

    await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    const passedSynthesisResult = conductChairmanReview.mock.calls[0][0];
    expect(passedSynthesisResult.metadata.venture_score).toBe(0);
    expect(passedSynthesisResult.metadata.forecast_failed).toBe(true);
  });

  it('should skip synthesis when options.skipSynthesis=true', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-1' });

    await executeStageZero(
      { path: 'discovery_mode', options: { skipSynthesis: true } },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(runSynthesis).not.toHaveBeenCalled();
  });

  it('should call chairman review after synthesis', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-1' });

    await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(conductChairmanReview).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TestVenture' }),
      expect.objectContaining({ supabase: mockSupabase }),
    );
  });

  it('should persist brief and return venture record when approved', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    conductChairmanReview.mockResolvedValue({
      decision: 'ready',
      brief: mockBrief,
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'v-approved' });

    const result = await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(persistVentureBrief).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.decision).toBe('ready');
    expect(result.record_id).toBe('v-approved');
    expect(result.record_type).toBe('venture');
  });

  it('should park in nursery when rejected', async () => {
    routePath.mockResolvedValue(mockPathOutput);
    runSynthesis.mockResolvedValue(mockBrief);
    conductChairmanReview.mockResolvedValue({
      decision: 'park',
      brief: { ...mockBrief, maturity: 'blocked' },
      validation: { valid: true, errors: [] },
    });
    persistVentureBrief.mockResolvedValue({ id: 'nursery-1' });

    const result = await executeStageZero(
      { path: 'discovery_mode' },
      { supabase: mockSupabase, logger: silentLogger },
    );

    expect(persistVentureBrief).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.decision).toBe('park');
    expect(result.record_type).toBe('nursery_entry');
  });
});
