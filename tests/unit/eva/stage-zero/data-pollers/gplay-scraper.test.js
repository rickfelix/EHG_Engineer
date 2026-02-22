/**
 * Unit Tests: Google Play Scraper Poller
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-002)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock google-play-scraper before importing the poller
const mockList = vi.fn();
vi.mock('google-play-scraper', () => ({
  default: {
    list: mockList,
    collection: { TOP_FREE: 'topselling_free' },
  },
}));

import { pollGooglePlay } from '../../../../../lib/eva/stage-zero/data-pollers/gplay-scraper.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

function createMockSupabase(upsertError = null) {
  return {
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: upsertError }),
    })),
  };
}

const sampleResults = [
  { title: 'FitApp', developer: 'FitCo', url: 'https://play.google.com/store/apps/details?id=com.fit', scoreText: '4.5', reviews: 1000, installs: '500,000+', summary: 'Fitness tracker' },
  { title: 'HealthApp', developer: 'HealthCo', url: 'https://play.google.com/store/apps/details?id=com.health', scoreText: '4.2', reviews: 500, installs: '100,000+', summary: 'Health monitor' },
];

describe('pollGooglePlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('fetches and upserts data for each category', async () => {
    const mockSupabase = createMockSupabase();
    mockList.mockResolvedValue(sampleResults);

    const result = await pollGooglePlay({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [{ id: 'FINANCE', name: 'Finance' }],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ category: 'FINANCE' }));
  });

  test('returns failure when scraper throws', async () => {
    const mockSupabase = createMockSupabase();
    mockList.mockRejectedValue(new Error('RequestError'));

    const result = await pollGooglePlay({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [{ id: 'FINANCE', name: 'Finance' }],
    });

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
  });

  test('continues processing when one category fails', async () => {
    const mockSupabase = createMockSupabase();
    let callCount = 0;
    mockList.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('RequestError'));
      return Promise.resolve(sampleResults);
    });

    const result = await pollGooglePlay({
      supabase: mockSupabase,
      logger: silentLogger,
      categories: [
        { id: 'EDUCATION', name: 'Education' },
        { id: 'FINANCE', name: 'Finance' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});
