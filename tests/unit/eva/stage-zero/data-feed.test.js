/**
 * Unit tests for the Stage-0 data feed.
 * SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-B.
 *
 * Covers the read path against Child A's standing reference table and the honest-idle
 * contract that keeps tech-trajectory's training-data fallback intact when nothing is live.
 */
import { describe, test, expect, vi } from 'vitest';
import { createStageZeroDataFeed, TECH_ENTRY_TYPES } from '../../../../lib/eva/stage-zero/data-feed.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/**
 * Build a mock supabase whose from('research_intelligence_reference') query chain
 * (.select().eq().in()) resolves to the supplied { data, error }. Records the arguments
 * so the test can assert the table + filters used.
 */
function mockSupabase(result) {
  const calls = { table: null, select: null, eq: null, in: null };
  const builder = {
    select: vi.fn((cols) => { calls.select = cols; return builder; }),
    eq: vi.fn((col, val) => { calls.eq = [col, val]; return builder; }),
    in: vi.fn((col, vals) => { calls.in = [col, vals]; return Promise.resolve(result); }),
  };
  const supabase = {
    from: vi.fn((table) => { calls.table = table; return builder; }),
  };
  return { supabase, calls };
}

const TECH_ROW = {
  subject: 'llm_frontier_models',
  entry_type: 'tech_landscape',
  confidence: 'medium',
  version: 3,
  payload: { trend: 'reasoning gains accelerating' },
  source_refs: [{ youtube_video_id: 'abc123' }],
};
const MODEL_ROW = {
  subject: 'open_weight_models',
  entry_type: 'model_landscape',
  confidence: 'high',
  version: 1,
  payload: { note: 'cost deflation continuing' },
  source_refs: [],
};

describe('createStageZeroDataFeed.getTechSignals', () => {
  test('maps current tech/model-landscape rows to compact signals', async () => {
    const { supabase, calls } = mockSupabase({ data: [TECH_ROW, MODEL_ROW], error: null });
    const feed = createStageZeroDataFeed(supabase, { logger: silentLogger });

    const signals = await feed.getTechSignals();

    expect(Array.isArray(signals)).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toEqual({
      subject: 'llm_frontier_models',
      entry_type: 'tech_landscape',
      confidence: 'medium',
      version: 3,
      payload: { trend: 'reasoning gains accelerating' },
      source_refs: [{ youtube_video_id: 'abc123' }],
    });
    // Correct table + filters: is_current true, entry_type restricted to the tech family.
    expect(calls.table).toBe('research_intelligence_reference');
    expect(calls.eq).toEqual(['is_current', true]);
    expect(calls.in).toEqual(['entry_type', TECH_ENTRY_TYPES]);
  });

  test('is honest-idle on an empty result (returns null, not [])', async () => {
    const { supabase } = mockSupabase({ data: [], error: null });
    const feed = createStageZeroDataFeed(supabase, { logger: silentLogger });

    const signals = await feed.getTechSignals();

    expect(signals).toBeNull();
  });

  test('fails closed to null on a supabase error (never throws)', async () => {
    const { supabase } = mockSupabase({ data: null, error: { message: 'boom' } });
    const feed = createStageZeroDataFeed(supabase, { logger: silentLogger });

    await expect(feed.getTechSignals()).resolves.toBeNull();
  });

  test('returns null when the client is missing/malformed', async () => {
    const feed = createStageZeroDataFeed(null, { logger: silentLogger });
    await expect(feed.getTechSignals()).resolves.toBeNull();

    const feed2 = createStageZeroDataFeed({}, { logger: silentLogger });
    await expect(feed2.getTechSignals()).resolves.toBeNull();
  });

  test('fails closed to null when the query throws', async () => {
    const supabase = { from: () => { throw new Error('unexpected'); } };
    const feed = createStageZeroDataFeed(supabase, { logger: silentLogger });
    await expect(feed.getTechSignals()).resolves.toBeNull();
  });

  test('normalizes missing/odd row fields without fabricating data', async () => {
    const { supabase } = mockSupabase({ data: [{ subject: 'x', entry_type: 'tech_landscape' }], error: null });
    const feed = createStageZeroDataFeed(supabase, { logger: silentLogger });

    const [signal] = await feed.getTechSignals();

    expect(signal.confidence).toBe('unverified');
    expect(signal.version).toBe(1);
    expect(signal.payload).toEqual({});
    expect(signal.source_refs).toEqual([]);
  });

  test('exposes only the tech/model-landscape entry types (Child B read scope)', () => {
    expect(TECH_ENTRY_TYPES).toEqual(['tech_landscape', 'model_landscape']);
  });
});
