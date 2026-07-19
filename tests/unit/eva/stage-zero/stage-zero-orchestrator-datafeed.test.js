/**
 * Orchestrator wiring test: executeStageZero constructs the Stage-0 dataFeed and threads it
 * into synthesis (deps.dataFeed) — the first caller ever to build the object that
 * tech-trajectory.js's getTechSignals() hook consumes.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-B.
 *
 * The heavy Stage-0 collaborators are mocked so the test isolates the dataFeed construction
 * + injection line. Synthesis is supplied as a capturing spy (deps.synthesize) so we can
 * observe exactly what deps.dataFeed synthesis received.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/eva/stage-zero/strategic-context-loader.js', () => ({
  loadStrategicContext: vi.fn().mockResolvedValue({ mission: 'test' }),
}));
vi.mock('../../../../lib/eva/stage-zero/path-router.js', () => ({
  routePath: vi.fn().mockResolvedValue({ suggested_name: 'Test Venture', metadata: {} }),
  ENTRY_PATHS: {},
  PATH_OPTIONS: [],
  listDiscoveryStrategies: vi.fn(() => []),
}));
vi.mock('../../../../lib/eva/stage-zero/modeling.js', () => ({
  generateForecast: vi.fn().mockResolvedValue({}),
  calculateVentureScore: vi.fn(() => 50),
}));
vi.mock('../../../../lib/eva/stage-zero/chairman-review.js', () => ({
  conductChairmanReview: vi.fn().mockResolvedValue({ brief: {}, decision: 'nursery', validation: {} }),
  persistVentureBrief: vi.fn().mockResolvedValue({ id: 'rec-1' }),
}));

const { executeStageZero } = await import('../../../../lib/eva/stage-zero/stage-zero-orchestrator.js');

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fakeSupabase = { from: vi.fn() };
const baseOptions = { dryRun: true, skipExperiments: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeStageZero dataFeed wiring', () => {
  test('constructs a dataFeed from supabase and passes it into synthesis', async () => {
    const synthesize = vi.fn().mockResolvedValue({ metadata: {} });

    await executeStageZero(
      { path: 'test', pathParams: {}, options: baseOptions },
      { supabase: fakeSupabase, logger: silentLogger, synthesize }
    );

    expect(synthesize).toHaveBeenCalledTimes(1);
    const depsPassed = synthesize.mock.calls[0][1];
    expect(depsPassed.dataFeed).toBeTruthy();
    expect(typeof depsPassed.dataFeed.getTechSignals).toBe('function');
  });

  test('preserves a caller-provided deps.dataFeed (test double wins)', async () => {
    const synthesize = vi.fn().mockResolvedValue({ metadata: {} });
    const injectedFeed = { getTechSignals: vi.fn().mockResolvedValue([{ subject: 'x' }]) };

    await executeStageZero(
      { path: 'test', pathParams: {}, options: baseOptions },
      { supabase: fakeSupabase, logger: silentLogger, synthesize, dataFeed: injectedFeed }
    );

    const depsPassed = synthesize.mock.calls[0][1];
    expect(depsPassed.dataFeed).toBe(injectedFeed);
  });
});
