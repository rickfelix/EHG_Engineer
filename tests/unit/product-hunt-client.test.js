/**
 * Tests for Product Hunt GraphQL Client
 * SD: SD-MAN-INFRA-PRODUCT-HUNT-GRAPHQL-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase before importing the module — vi.mock is hoisted automatically
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    const chain = {
      select: vi.fn().mockImplementation(() => chain),
      eq: vi.fn().mockImplementation(() => chain),
      gt: vi.fn().mockImplementation(() => chain),
      order: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockImplementation(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockImplementation(() => chain),
    };
    return {
      from: vi.fn(() => chain),
    };
  }),
}));

import {
  searchProductHuntByCategory,
  getProductHuntCache,
  clearProductHuntCache,
  STATIC_PRODUCTS,
  PH_API_URL,
} from '../../lib/eva/services/product-hunt-client.js';

describe('product-hunt-client', () => {
  const savedToken = process.env.PRODUCT_HUNT_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PRODUCT_HUNT_TOKEN;
  });

  afterEach(() => {
    if (savedToken) {
      process.env.PRODUCT_HUNT_TOKEN = savedToken;
    } else {
      delete process.env.PRODUCT_HUNT_TOKEN;
    }
  });

  // -----------------------------------------------------------------------
  // Static dataset validation
  // -----------------------------------------------------------------------

  describe('static dataset', () => {
    it('contains 30+ products', () => {
      expect(STATIC_PRODUCTS.length).toBeGreaterThanOrEqual(30);
    });

    it('covers all 6 required categories', () => {
      const categories = new Set(STATIC_PRODUCTS.map((p) => p.category));
      expect(categories).toContain('artificial-intelligence');
      expect(categories).toContain('saas');
      expect(categories).toContain('fintech');
      expect(categories).toContain('health');
      expect(categories).toContain('productivity');
      expect(categories).toContain('developer-tools');
      expect(categories.size).toBeGreaterThanOrEqual(6);
    });

    it('every product has required fields (name, tagline, url, votesCount)', () => {
      for (const product of STATIC_PRODUCTS) {
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('tagline');
        expect(product).toHaveProperty('url');
        expect(product).toHaveProperty('votesCount');
        expect(typeof product.name).toBe('string');
        expect(typeof product.tagline).toBe('string');
        expect(typeof product.url).toBe('string');
        expect(typeof product.votesCount).toBe('number');
        expect(product.votesCount).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // searchProductHuntByCategory
  // -----------------------------------------------------------------------

  describe('searchProductHuntByCategory', () => {
    it('returns empty array when no category provided', async () => {
      const result = await searchProductHuntByCategory('');
      expect(result).toEqual([]);
    });

    it('returns static data when no API token (fallback mode)', async () => {
      delete process.env.PRODUCT_HUNT_TOKEN;
      const result = await searchProductHuntByCategory('artificial-intelligence', 5);

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);
      // Verify result has required fields
      for (const item of result) {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('tagline');
        expect(item).toHaveProperty('url');
        expect(item).toHaveProperty('votesCount');
      }
    });

    it('returns static data filtered by category in fallback mode', async () => {
      delete process.env.PRODUCT_HUNT_TOKEN;
      const result = await searchProductHuntByCategory('fintech', 10);

      expect(result.length).toBeGreaterThan(0);
      // All results should be fintech products (category stripped from output)
      expect(result[0].name).toBeTruthy();
    });

    it('parses successful GraphQL API response', async () => {
      process.env.PRODUCT_HUNT_TOKEN = 'test-token';
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              posts: {
                edges: [
                  {
                    node: {
                      id: 'ph-123',
                      name: 'TestProduct',
                      tagline: 'A test product',
                      url: 'https://producthunt.com/posts/test',
                      votesCount: 500,
                      website: 'https://test.com',
                      description: 'Description here',
                      topics: {
                        edges: [{ node: { name: 'AI' } }, { node: { name: 'SaaS' } }],
                      },
                    },
                  },
                ],
              },
            },
          }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await searchProductHuntByCategory('ai', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'TestProduct',
        tagline: 'A test product',
        url: 'https://producthunt.com/posts/test',
        votesCount: 500,
        website: 'https://test.com',
        description: 'Description here',
        topics: ['AI', 'SaaS'],
      });

      // Verify correct API endpoint was called
      expect(fetch).toHaveBeenCalledWith(
        PH_API_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('falls back to static data on API error response', async () => {
      process.env.PRODUCT_HUNT_TOKEN = 'test-token';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      const result = await searchProductHuntByCategory('artificial-intelligence', 5);
      // Should get static fallback data, not empty
      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to static data on network error', async () => {
      process.env.PRODUCT_HUNT_TOKEN = 'test-token';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

      const result = await searchProductHuntByCategory('fintech', 5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('falls back to static data on GraphQL errors', async () => {
      process.env.PRODUCT_HUNT_TOKEN = 'test-token';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ errors: [{ message: 'Invalid query' }] }),
        }),
      );

      const result = await searchProductHuntByCategory('saas', 5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('respects limit parameter', async () => {
      delete process.env.PRODUCT_HUNT_TOKEN;
      const result = await searchProductHuntByCategory('saas', 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('returns cross-category products for unknown category', async () => {
      delete process.env.PRODUCT_HUNT_TOKEN;
      const result = await searchProductHuntByCategory('obscure-category-xyz', 5);
      // Should still return something from the full dataset
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // getProductHuntCache
  // -----------------------------------------------------------------------

  describe('getProductHuntCache', () => {
    it('returns null for missing ventureId', async () => {
      const result = await getProductHuntCache(null, 'ai');
      expect(result).toBeNull();
    });

    it('returns null for missing category', async () => {
      const result = await getProductHuntCache('some-uuid', null);
      expect(result).toBeNull();
    });

    it('returns null for non-existent cache entries', async () => {
      // The mock Supabase returns { data: null, error: null } by default
      const result = await getProductHuntCache('non-existent-uuid', 'fintech');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // clearProductHuntCache
  // -----------------------------------------------------------------------

  describe('clearProductHuntCache', () => {
    it('returns 0 when no ventureId provided', async () => {
      const result = await clearProductHuntCache(null);
      expect(result).toBe(0);
    });
  });
});
