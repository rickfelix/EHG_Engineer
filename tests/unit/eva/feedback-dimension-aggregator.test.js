/**
 * Tests for feedback-dimension-aggregator.js
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E
 */
import { describe, it, expect, vi } from 'vitest';
import { aggregateFeedbackQuality } from '../../../lib/eva/feedback-dimension-aggregator.js';

function createMockSupabase(feedbackItems = [], queryError = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        not: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() =>
                Promise.resolve({
                  data: queryError ? null : feedbackItems,
                  error: queryError,
                })
              ),
            })),
          })),
        })),
      })),
    })),
  };
}

describe('feedback-dimension-aggregator', () => {
  it('should return empty object when supabase is null', async () => {
    const result = await aggregateFeedbackQuality(null, ['V01']);
    expect(result).toEqual({});
  });

  it('should return empty object when dimensionIds is empty', async () => {
    const supabase = createMockSupabase([]);
    const result = await aggregateFeedbackQuality(supabase, []);
    expect(result).toEqual({});
  });

  it('should return empty object when no feedback items found', async () => {
    const supabase = createMockSupabase([]);
    const result = await aggregateFeedbackQuality(supabase, ['V01', 'A01']);
    expect(result).toEqual({});
  });

  it('should aggregate scores for matching dimensions', async () => {
    const now = new Date().toISOString();
    const feedbackItems = [
      { id: '1', rubric_score: 80, metadata: { dimension_codes: ['V01', 'V02'] }, created_at: now },
      { id: '2', rubric_score: 60, metadata: { dimension_codes: ['V01'] }, created_at: now },
      { id: '3', rubric_score: 90, metadata: { dimension_codes: ['V02'] }, created_at: now },
    ];

    const supabase = createMockSupabase(feedbackItems);
    const result = await aggregateFeedbackQuality(supabase, ['V01', 'V02']);

    expect(result.V01).toBeDefined();
    expect(result.V01.avgScore).toBe(70); // (80 + 60) / 2
    expect(result.V01.count).toBe(2);

    expect(result.V02).toBeDefined();
    expect(result.V02.avgScore).toBe(85); // (80 + 90) / 2
    expect(result.V02.count).toBe(2);
  });

  it('should only include requested dimensions', async () => {
    const now = new Date().toISOString();
    const feedbackItems = [
      { id: '1', rubric_score: 80, metadata: { dimension_codes: ['V01', 'A01'] }, created_at: now },
    ];

    const supabase = createMockSupabase(feedbackItems);
    const result = await aggregateFeedbackQuality(supabase, ['V01']);

    expect(result.V01).toBeDefined();
    expect(result.A01).toBeUndefined();
  });

  it('should skip items without dimension_codes in metadata', async () => {
    const now = new Date().toISOString();
    const feedbackItems = [
      { id: '1', rubric_score: 80, metadata: {}, created_at: now },
      { id: '2', rubric_score: 90, metadata: null, created_at: now },
      { id: '3', rubric_score: 70, metadata: { dimension_codes: ['V01'] }, created_at: now },
    ];

    const supabase = createMockSupabase(feedbackItems);
    const result = await aggregateFeedbackQuality(supabase, ['V01']);

    expect(result.V01.count).toBe(1);
    expect(result.V01.avgScore).toBe(70);
  });

  it('should handle query errors gracefully', async () => {
    const supabase = createMockSupabase(null, { message: 'Connection timeout' });
    const result = await aggregateFeedbackQuality(supabase, ['V01']);
    expect(result).toEqual({});
  });

  it('should compute trend from recent vs full window', async () => {
    const now = new Date();
    const recent = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
    const old = new Date(now - 25 * 24 * 60 * 60 * 1000).toISOString(); // 25 days ago

    const feedbackItems = [
      { id: '1', rubric_score: 90, metadata: { dimension_codes: ['V01'] }, created_at: recent },
      { id: '2', rubric_score: 50, metadata: { dimension_codes: ['V01'] }, created_at: old },
    ];

    const supabase = createMockSupabase(feedbackItems);
    const result = await aggregateFeedbackQuality(supabase, ['V01']);

    expect(result.V01.count).toBe(2);
    expect(result.V01.avgScore).toBe(70); // (90 + 50) / 2
    // Recent avg is 90, full avg is 70, trend should be positive
    expect(result.V01.trend).toBeGreaterThan(0);
  });
});
