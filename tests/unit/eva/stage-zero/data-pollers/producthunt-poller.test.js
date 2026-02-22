/**
 * Unit Tests: Product Hunt Poller
 * Part of SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-003)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { pollProductHunt } from '../../../../../lib/eva/stage-zero/data-pollers/producthunt-poller.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

function createMockSupabase(upsertError = null) {
  return {
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: upsertError }),
    })),
  };
}

const sampleGraphQLResponse = {
  data: {
    posts: {
      edges: [
        { node: { id: '1', name: 'AIHelper', tagline: 'Your AI assistant', votesCount: 500, url: 'https://www.producthunt.com/posts/aihelper', website: 'https://aihelper.com', createdAt: '2026-02-20' } },
        { node: { id: '2', name: 'CodeBot', tagline: 'Code faster', votesCount: 300, url: 'https://www.producthunt.com/posts/codebot', website: 'https://codebot.io', createdAt: '2026-02-20' } },
      ],
    },
  },
};

describe('pollProductHunt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns no_token error when apiToken is undefined', async () => {
    const result = await pollProductHunt({
      supabase: createMockSupabase(),
      logger: silentLogger,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('no_token');
  });

  test('fetches and upserts data with valid token', async () => {
    const mockSupabase = createMockSupabase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(sampleGraphQLResponse),
    });

    const result = await pollProductHunt({
      supabase: mockSupabase,
      logger: silentLogger,
      topics: ['artificial-intelligence'],
      apiToken: 'test-token',
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  test('returns error on 401 Unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await pollProductHunt({
      supabase: createMockSupabase(),
      logger: silentLogger,
      topics: ['ai'],
      apiToken: 'bad-token',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('401 Unauthorized');
  });

  test('returns error on 429 rate limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => '60' },
    });

    const result = await pollProductHunt({
      supabase: createMockSupabase(),
      logger: silentLogger,
      topics: ['ai'],
      apiToken: 'test-token',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('429 Rate Limited');
  });
});
