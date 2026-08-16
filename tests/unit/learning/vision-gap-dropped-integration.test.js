/**
 * SD-LEO-INFRA-LEARN-VISION-GAP-RUBRIC-CLASSIFY-001 (TS-7, FR-4): buildLearningContext's
 * vision-gap integration must degrade safely when the sync fails, and must thread the
 * excluded/unscored drop-accounting through to context.intelligence.vision_gap_dropped
 * when it succeeds. getVisionGapPatterns (context-builder.js) has no `export` keyword and
 * cannot be imported directly by a test -- this exercises it through buildLearningContext,
 * the actual exported entry point, per the corrected PLAN-phase test plan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Chainable, always-safe empty-result builder -- every method returns the same builder
 * so arbitrary chain depth/order is supported, and awaiting it resolves to an empty,
 * error-free result. This lets buildLearningContext's OTHER six Promise.all branches
 * (lessons, patterns, improvements, feedback learnings/patterns, sub-agent learnings)
 * complete normally with "nothing found", so the test can isolate the vision-gap branch.
 */
function makeEmptyBuilder() {
  const result = { data: [], error: null, count: 0 };
  const builder = {};
  const chainMethods = [
    'select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'ilike', 'like',
    'gte', 'lte', 'gt', 'lt', 'contains', 'order', 'limit', 'range', 'match',
  ];
  for (const m of chainMethods) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: vi.fn(() => makeEmptyBuilder()),
  }),
}));

vi.mock('../../../scripts/eva/vision-to-patterns.js', () => ({
  syncVisionScoresToPatterns: vi.fn(),
}));

const { buildLearningContext } = await import('../../../scripts/modules/learning/context-builder.js');
const { syncVisionScoresToPatterns } = await import('../../../scripts/eva/vision-to-patterns.js');

describe('buildLearningContext vision-gap drop accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-7: when the sync itself throws, vision_gap_dropped is null (not undefined, not a thrown exception) and the rest of the context still builds', async () => {
    syncVisionScoresToPatterns.mockRejectedValue(new Error('eva_vision_scores query failed'));

    const context = await buildLearningContext(null, {});

    expect(context.intelligence.vision_gap_dropped).toBeNull();
    expect(Array.isArray(context.intelligence.vision_gaps)).toBe(true);
    // The rest of the context is still populated -- the vision-gap failure is isolated,
    // not fatal to the whole learning context (existing try/catch behavior, unchanged).
    expect(context).toHaveProperty('lessons');
    expect(context).toHaveProperty('patterns');
    expect(context).toHaveProperty('summary');
  });

  it('carries the excluded/unscored counts through to context.intelligence.vision_gap_dropped when the sync succeeds', async () => {
    syncVisionScoresToPatterns.mockResolvedValue({
      synced: 1, skipped: 3, errors: 0, resolved: 0, excluded: 22, unscored: 9,
    });

    const context = await buildLearningContext(null, {});

    expect(context.intelligence.vision_gap_dropped).toEqual({ excluded: 22, unscored: 9 });
  });

  it('reports {excluded: 0, unscored: 0} (not null) when the sync succeeds and finds nothing to drop -- distinguishes "ran cleanly" from "failed"', async () => {
    syncVisionScoresToPatterns.mockResolvedValue({
      synced: 0, skipped: 0, errors: 0, resolved: 0, excluded: 0, unscored: 0,
    });

    const context = await buildLearningContext(null, {});

    expect(context.intelligence.vision_gap_dropped).toEqual({ excluded: 0, unscored: 0 });
  });
});
