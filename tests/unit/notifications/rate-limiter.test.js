/**
 * Tests for lib/notifications/rate-limiter.js
 * SD: SD-EVA-FEAT-NOTIFICATION-001
 *
 * Covers: checkRateLimit with mock Supabase client
 * Focus: allowed/denied cases, error handling, default and custom limits
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../../../lib/notifications/rate-limiter.js';

function createMockSupabase({ count = 0, error = null } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ count, error })
            })
          })
        })
      })
    })
  };
}

describe('rate-limiter', () => {
  describe('checkRateLimit', () => {
    it('returns allowed=true when count is below default limit', async () => {
      const supabase = createMockSupabase({ count: 3 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(3);
      expect(result.limit).toBe(10); // DEFAULT_RATE_LIMIT
    });

    it('returns allowed=false when count meets the limit', async () => {
      const supabase = createMockSupabase({ count: 10 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(10);
    });

    it('returns allowed=false when count exceeds the limit', async () => {
      const supabase = createMockSupabase({ count: 15 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(15);
    });

    it('returns allowed=true when count is zero', async () => {
      const supabase = createMockSupabase({ count: 0 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('respects custom limit parameter', async () => {
      const supabase = createMockSupabase({ count: 3 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai', 5);
      expect(result.limit).toBe(5);
      expect(result.allowed).toBe(true);
    });

    it('denies when count meets custom limit', async () => {
      const supabase = createMockSupabase({ count: 5 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai', 5);
      expect(result.allowed).toBe(false);
    });

    it('allows send on query error (fail-open)', async () => {
      const supabase = createMockSupabase({ error: { message: 'connection timeout' } });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('returns the effective limit on error', async () => {
      const supabase = createMockSupabase({ error: { message: 'DB down' } });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.limit).toBe(10);
    });

    it('queries the chairman_notifications table', async () => {
      const supabase = createMockSupabase({ count: 0 });
      await checkRateLimit(supabase, 'test@example.com');
      expect(supabase.from).toHaveBeenCalledWith('chairman_notifications');
    });

    it('handles null count as zero', async () => {
      const supabase = createMockSupabase({ count: null });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('boundary: count exactly one below limit allows send', async () => {
      const supabase = createMockSupabase({ count: 9 });
      const result = await checkRateLimit(supabase, 'chairman@ehg.ai');
      expect(result.allowed).toBe(true);
    });
  });
});
