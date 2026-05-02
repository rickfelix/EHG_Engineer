/**
 * Tests for vision-to-patterns.js malformed dimension guard
 * SD: SD-LEARN-FIX-ADDRESS-VGAP-A05EVENTBUSINT-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the event bus before importing
vi.mock('../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: vi.fn(),
  VISION_EVENTS: { GAP_DETECTED: 'vision.gap_detected' },
}));

const { syncVisionScoresToPatterns } = await import('../../scripts/eva/vision-to-patterns.js');

/**
 * Build a chainable thenable mock query builder for one table.
 * `data` is what `await query` resolves to; chain methods (.select/.eq/.lt/...)
 * all return the same builder so depth doesn't matter.
 */
function makeBuilder(data, extras = {}) {
  const result = { data, error: null };
  const builder = { ...extras };
  const chainMethods = [
    'select', 'eq', 'neq', 'in', 'is', 'or', 'not', 'ilike', 'like',
    'gte', 'lte', 'gt', 'lt', 'contains', 'order', 'limit', 'range',
  ];
  for (const m of chainMethods) {
    if (!builder[m]) builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createMockSupabase(scoreRecords, existingPatterns = []) {
  const mockUpdate = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  const mockInsert = vi.fn().mockResolvedValue({ error: null });

  return {
    from: vi.fn((table) => {
      if (table === 'eva_vision_scores') {
        return makeBuilder(scoreRecords);
      }
      if (table === 'issue_patterns') {
        return makeBuilder(existingPatterns, { update: mockUpdate, insert: mockInsert });
      }
      // Fallback: any other table returns empty data but still chainable.
      return makeBuilder([]);
    }),
    _mockInsert: mockInsert,
    _mockUpdate: mockUpdate,
  };
}

describe('syncVisionScoresToPatterns', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip dimensions with undefined score', async () => {
    const scores = [{
      id: 'test-1',
      sd_id: 'SD-TEST-001',
      total_score: 50,
      dimension_scores: {
        A05_event_bus_integration: { name: undefined, score: undefined },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // Should be skipped, not synced
    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should skip dimensions with NaN score', async () => {
    const scores = [{
      id: 'test-2',
      sd_id: 'SD-TEST-002',
      total_score: 45,
      dimension_scores: {
        A01: { name: 'test_dim', score: NaN },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should skip dimensions with null score', async () => {
    const scores = [{
      id: 'test-3',
      sd_id: 'SD-TEST-003',
      total_score: 40,
      dimension_scores: {
        V01: { name: 'broken_dim', score: null },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should process valid low-scoring dimensions normally', async () => {
    const scores = [{
      id: 'test-4',
      sd_id: 'SD-TEST-004',
      total_score: 50,
      dimension_scores: {
        A05: { name: 'event_bus_integration', score: 45 },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('should extract name from dimension key when dim.name is undefined but score is valid', async () => {
    const scores = [{
      id: 'test-5',
      sd_id: 'SD-TEST-005',
      total_score: 50,
      dimension_scores: {
        A05_event_bus_integration: { name: undefined, score: 35 },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // Score 35 is valid and below threshold (60), so it should be synced
    expect(result.synced).toBe(1);
  });

  it('should skip high-scoring dimensions', async () => {
    const scores = [{
      id: 'test-6',
      sd_id: 'SD-TEST-006',
      total_score: 50,
      dimension_scores: {
        A05: { name: 'good_dim', score: 85 },
      },
      rubric_snapshot: {},
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
  });

  it('should handle mixed valid and malformed dimensions', async () => {
    const scores = [{
      id: 'test-7',
      sd_id: 'SD-TEST-007',
      total_score: 50,
      dimension_scores: {
        A01: { name: 'valid_low', score: 30 },
        A02: { name: undefined, score: undefined },
        A03: { name: 'valid_high', score: 90 },
        A04: { name: 'also_broken', score: NaN },
      },
      rubric_snapshot: { vision_key: 'v1', arch_key: 'a1' },
    }];

    const supabase = createMockSupabase(scores);
    const result = await syncVisionScoresToPatterns(supabase, { dryRun: true });

    // A01: synced (valid, below threshold)
    // A02: skipped (undefined score)
    // A03: skipped (above threshold)
    // A04: skipped (NaN score)
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(3);
  });
});
