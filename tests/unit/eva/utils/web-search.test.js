/**
 * Unit tests for Web Search Client - Tavily API Integration
 * SD: SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-A
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSearchEnabled,
  search,
  searchBatch,
  formatResultsForPrompt,
  clearCache,
  getCacheStats,
} from '../../../../lib/eva/utils/web-search.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('web-search', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isSearchEnabled', () => {
    it('returns false when SEARCH_ENABLED is not set', () => {
      delete process.env.SEARCH_ENABLED;
      delete process.env.TAVILY_API_KEY;
      expect(isSearchEnabled()).toBe(false);
    });

    it('returns false when SEARCH_ENABLED is false', () => {
      process.env.SEARCH_ENABLED = 'false';
      process.env.TAVILY_API_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(false);
    });

    it('returns false when TAVILY_API_KEY is missing', () => {
      process.env.SEARCH_ENABLED = 'true';
      delete process.env.TAVILY_API_KEY;
      expect(isSearchEnabled()).toBe(false);
    });

    it('returns true when both env vars are set', () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';
      expect(isSearchEnabled()).toBe(true);
    });
  });

  describe('search', () => {
    it('returns empty array when search is disabled', async () => {
      delete process.env.SEARCH_ENABLED;
      const results = await search('test query');
      expect(results).toEqual([]);
    });

    it('calls Tavily API with correct parameters', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key-123';

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
          ],
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const logger = createMockLogger();
      const results = await search('test query', { logger });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.api_key).toBe('test-key-123');
      expect(body.query).toBe('test query');
      expect(body.max_results).toBe(5);
      expect(body.search_depth).toBe('basic');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result 1');
    });

    it('returns empty array on API error', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      const logger = createMockLogger();
      const results = await search('test query', { logger });

      expect(results).toEqual([]);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('API error 500'));
    });

    it('returns empty array on timeout', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      globalThis.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      const logger = createMockLogger();
      const results = await search('test query', { timeoutMs: 100, logger });

      expect(results).toEqual([]);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Timeout'));
    });

    it('caches results for subsequent calls', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ title: 'Cached', url: 'https://example.com', content: 'C', score: 1 }],
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const logger = createMockLogger();
      await search('cache test', { logger });
      await search('cache test', { logger });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith('[WebSearch] Cache hit:', expect.any(String));
    });

    it('normalizes cache keys (case insensitive, trimmed)', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ title: 'T', url: 'https://a.com', content: 'C', score: 1 }],
        }),
      };
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const logger = createMockLogger();
      await search('Hello World', { logger });
      await search('  hello world  ', { logger });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('searchBatch', () => {
    it('returns empty array when disabled', async () => {
      delete process.env.SEARCH_ENABLED;
      const results = await searchBatch(['q1', 'q2']);
      expect(results).toEqual([]);
    });

    it('returns empty for empty queries', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';
      const results = await searchBatch([]);
      expect(results).toEqual([]);
    });

    it('deduplicates results by URL', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      const sharedUrl = 'https://example.com/shared';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            { title: 'Shared', url: sharedUrl, content: 'Content', score: 0.8 },
            { title: 'Unique', url: 'https://example.com/unique', content: 'U', score: 0.7 },
          ],
        }),
      });

      const logger = createMockLogger();
      const results = await searchBatch(['q1', 'q2'], { logger });

      const urlCounts = results.filter(r => r.url === sharedUrl);
      expect(urlCounts).toHaveLength(1);
    });
  });

  describe('formatResultsForPrompt', () => {
    it('returns empty string for empty results', () => {
      expect(formatResultsForPrompt([])).toBe('');
      expect(formatResultsForPrompt(null)).toBe('');
    });

    it('formats results with numbered entries', () => {
      const results = [
        { title: 'Title 1', url: 'https://example.com/1', content: 'Content one' },
        { title: 'Title 2', url: 'https://example.com/2', content: 'Content two' },
      ];
      const formatted = formatResultsForPrompt(results);
      expect(formatted).toContain('[1] Title 1');
      expect(formatted).toContain('[2] Title 2');
      expect(formatted).toContain('Source: https://example.com/1');
      expect(formatted).toContain('Web Research:');
    });

    it('uses custom label', () => {
      const results = [{ title: 'T', url: 'u', content: 'c' }];
      const formatted = formatResultsForPrompt(results, 'Custom Label');
      expect(formatted).toContain('Custom Label:');
    });

    it('truncates long content to 300 chars', () => {
      const longContent = 'A'.repeat(500);
      const results = [{ title: 'T', url: 'u', content: longContent }];
      const formatted = formatResultsForPrompt(results);
      expect(formatted).not.toContain('A'.repeat(500));
      expect(formatted).toContain('A'.repeat(300));
    });
  });

  describe('clearCache and getCacheStats', () => {
    it('starts with empty cache', () => {
      expect(getCacheStats().size).toBe(0);
    });

    it('reports cache size after search', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [] }),
      });

      const logger = createMockLogger();
      await search('stats test', { logger });

      expect(getCacheStats().size).toBe(1);
      expect(getCacheStats().maxSize).toBe(1000);
    });

    it('clears cache completely', async () => {
      process.env.SEARCH_ENABLED = 'true';
      process.env.TAVILY_API_KEY = 'test-key';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [] }),
      });

      const logger = createMockLogger();
      await search('clear test', { logger });
      expect(getCacheStats().size).toBe(1);

      clearCache();
      expect(getCacheStats().size).toBe(0);
    });
  });
});
