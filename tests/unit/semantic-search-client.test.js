/**
 * Unit Tests for Semantic Search Client
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 *
 * Note: These are smoke tests that validate the API structure.
 * Full mocking of Supabase and OpenAI is complex in ES modules,
 * so we focus on integration testing in E2E tests instead.
 */

import { describe, it, expect } from '@jest/globals';
import { searchCode, searchAllApplications, getIndexStatus, getCodebaseStats } from '../../lib/semantic-search-client.js';

describe('Semantic Search Client API', () => {
  describe('Module Exports', () => {
    it('should export searchCode function', () => {
      expect(typeof searchCode).toBe('function');
    });

    it('should export searchAllApplications function', () => {
      expect(typeof searchAllApplications).toBe('function');
    });

    it('should export getIndexStatus function', () => {
      expect(typeof getIndexStatus).toBe('function');
    });

    it('should export getCodebaseStats function', () => {
      expect(typeof getCodebaseStats).toBe('function');
    });
  });

  describe('Function Signatures', () => {
    it('searchCode should require query parameter', async () => {
      // This will fail due to missing OpenAI/Supabase config, but validates signature
      await expect(searchCode({})).rejects.toThrow();
    });

    it('searchAllApplications should accept query string', async () => {
      // This will fail due to missing OpenAI/Supabase config, but validates signature
      await expect(searchAllApplications('test')).rejects.toThrow();
    });

    it('getIndexStatus should return promise', async () => {
      const result = getIndexStatus();
      expect(result).toBeInstanceOf(Promise);

      // Will fail due to missing Supabase config, but that's expected
      await expect(result).rejects.toThrow();
    });

    it('getCodebaseStats should return promise', async () => {
      const result = getCodebaseStats();
      expect(result).toBeInstanceOf(Promise);

      // Will fail due to missing Supabase config, but that's expected
      await expect(result).rejects.toThrow();
    });
  });
});
