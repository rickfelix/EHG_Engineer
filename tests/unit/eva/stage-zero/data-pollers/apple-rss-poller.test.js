/**
 * Unit Tests: Apple RSS Poller
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-001)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pollAppleRSS } from '../../../../../lib/eva/stage-zero/data-pollers/apple-rss-poller.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

function createMockSupabase(upsertError = null) {
  return {
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: upsertError }),
    })),
  };
}

const sampleAppleResponse = {
  feed: {
    results: Array.from({ length: 3 }, (_, i) => ({
      name: `App ${i + 1}`,
      artistName: `Dev ${i + 1}`,
      url: `https://apps.apple.com/app/app${i + 1}/id${100 + i}`,
    })),
  },
};

describe('pollAppleRSS', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fetches and upserts data for each category', async () => {
    const mockSupabase = createMockSupabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleAppleResponse),
    });

    const result = await pollAppleRSS({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [{ id: 6013, name: 'Health & Fitness' }],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(mockSupabase.from).toHaveBeenCalledWith('app_rankings');
  });

  test('returns failure when API returns non-200', async () => {
    const mockSupabase = createMockSupabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await pollAppleRSS({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [{ id: 6013, name: 'Health & Fitness' }],
    });

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  test('returns failure when network error occurs', async () => {
    const mockSupabase = createMockSupabase();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await pollAppleRSS({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [{ id: 6013, name: 'Health & Fitness' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No data collected');
  });

  test('continues processing other categories when one fails', async () => {
    const mockSupabase = createMockSupabase();
    // SUT wraps each category fetch in withRetry (up to 2 retries). Gate by the
    // category id embedded in the URL so the failing category (6013) fails ALL of
    // its attempts, while the second category (6015) succeeds — otherwise a retry
    // of the "failing" category would succeed and inflate the count.
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/6013/')) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sampleAppleResponse) });
    });

    const result = await pollAppleRSS({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [
        { id: 6013, name: 'Health & Fitness' },
        { id: 6015, name: 'Finance' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3); // Only second category succeeded
  });
});
