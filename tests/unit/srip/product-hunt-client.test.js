/**
 * Tests for Product Hunt GraphQL Client
 * SD: SD-MAN-INFRA-PRODUCT-HUNT-GRAPHQL-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchByCategory, clearCache, getCacheSize, cache, CACHE_TTL_MS } from '../../../lib/eva/services/product-hunt-client.js';

const mockLogger = { log: vi.fn(), warn: vi.fn() };

describe('product-hunt-client', () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.PRODUCT_HUNT_TOKEN;
  });

  it('returns empty array when no category provided', async () => {
    const result = await searchByCategory('', { logger: mockLogger });
    expect(result).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No category'));
  });

  it('returns empty array when token not configured', async () => {
    delete process.env.PRODUCT_HUNT_TOKEN;
    const result = await searchByCategory('ai', { logger: mockLogger });
    expect(result).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('PRODUCT_HUNT_TOKEN'));
  });

  it('parses successful GraphQL response', async () => {
    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        data: {
          posts: {
            edges: [
              {
                node: {
                  name: 'TestProduct',
                  tagline: 'A test product',
                  url: 'https://producthunt.com/posts/test',
                  votesCount: 500,
                  description: 'Description here',
                  topics: { edges: [{ node: { name: 'AI' } }, { node: { name: 'SaaS' } }] },
                },
              },
            ],
          },
        },
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await searchByCategory('ai', { logger: mockLogger });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'TestProduct',
      tagline: 'A test product',
      url: 'https://producthunt.com/posts/test',
      votesCount: 500,
      description: 'Description here',
      topics: ['AI', 'SaaS'],
    });
  });

  it('caches results and returns on second call', async () => {
    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { posts: { edges: [{ node: { name: 'Cached', tagline: 'T', url: 'u', votesCount: 1, description: '', topics: { edges: [] } } }] } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchByCategory('fintech', { logger: mockLogger });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await searchByCategory('fintech', { logger: mockLogger });
    expect(fetchMock).toHaveBeenCalledTimes(1); // No second API call
    expect(second[0].name).toBe('Cached');
    expect(getCacheSize()).toBe(1);
  });

  it('returns empty array on API error response', async () => {
    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await searchByCategory('ai', { logger: mockLogger });
    expect(result).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('401'));
  });

  it('returns empty array on network error', async () => {
    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

    const result = await searchByCategory('ai', { logger: mockLogger });
    expect(result).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('API request failed'), 'Network timeout');
  });

  it('returns empty array on GraphQL errors', async () => {
    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ errors: [{ message: 'Invalid query' }] }),
    }));

    const result = await searchByCategory('ai', { logger: mockLogger });
    expect(result).toEqual([]);
  });

  it('cache expires after TTL', async () => {
    // Manually set expired cache entry
    cache.set('expired:10', { data: [{ name: 'Old' }], cachedAt: Date.now() - CACHE_TTL_MS - 1000 });

    process.env.PRODUCT_HUNT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { posts: { edges: [{ node: { name: 'Fresh', tagline: 'T', url: 'u', votesCount: 1, description: '', topics: { edges: [] } } }] } } }),
    }));

    const result = await searchByCategory('expired', { logger: mockLogger });
    expect(result[0].name).toBe('Fresh'); // Not 'Old'
  });

  it('clearCache removes all entries', () => {
    cache.set('test:10', { data: [], cachedAt: Date.now() });
    expect(getCacheSize()).toBe(1);
    clearCache();
    expect(getCacheSize()).toBe(0);
  });
});
