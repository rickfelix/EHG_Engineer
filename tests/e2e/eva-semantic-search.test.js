/**
 * E2E Tests for EVA Hybrid Semantic Search
 *
 * Tests the complete hybrid search workflow:
 * 1. Database RPCs deployed (match_venture_artifacts, match_issue_patterns, keyword_search_fallback)
 * 2. Vector columns exist on venture_artifacts and issue_patterns
 * 3. Keyword fallback returns results from text search
 * 4. searchSimilar hybrid merge produces correct output structure
 *
 * SD: SD-EVA-FEAT-SEMANTIC-SEARCH-001
 */

import { test, expect, describe, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

describe('EVA Hybrid Semantic Search E2E', () => {
  let supabase;

  beforeAll(() => {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  });

  describe('Database Migration Verification', () => {
    test('venture_artifacts has embedding columns', async () => {
      const { data, error } = await supabase
        .from('venture_artifacts')
        .select('artifact_embedding, embedding_model, embedding_updated_at, indexing_status')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('issue_patterns has embedding columns', async () => {
      const { data, error } = await supabase
        .from('issue_patterns')
        .select('content_embedding, embedding_updated_at')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('RPC Functions', () => {
    test('match_venture_artifacts RPC exists and accepts parameters', async () => {
      // Call with a zero vector - should return empty results, not error
      const { data, error } = await supabase.rpc('match_venture_artifacts', {
        query_embedding: Array(1536).fill(0.0),
        match_threshold: 0.9,
        match_count: 5,
        filter_venture_id: null,
        filter_artifact_type: null
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('match_issue_patterns RPC exists and accepts parameters', async () => {
      const { data, error } = await supabase.rpc('match_issue_patterns', {
        query_embedding: Array(1536).fill(0.0),
        match_threshold: 0.9,
        match_count: 5,
        filter_category: null,
        filter_severity: null
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('keyword_search_fallback RPC exists and returns results', async () => {
      const { data, error } = await supabase.rpc('keyword_search_fallback', {
        search_query: 'test search query',
        target_tables: ['venture_artifacts', 'issue_patterns', 'retrospectives'],
        match_count: 5
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      // Verify result structure if any results returned
      if (data.length > 0) {
        const result = data[0];
        expect(result).toHaveProperty('source_table');
        expect(result).toHaveProperty('record_id');
        expect(result).toHaveProperty('content_preview');
        expect(result).toHaveProperty('similarity_score');
      }
    });

    test('keyword_search_fallback handles single table filter', async () => {
      const { data, error } = await supabase.rpc('keyword_search_fallback', {
        search_query: 'pattern',
        target_tables: ['issue_patterns'],
        match_count: 3
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      // All results should come from issue_patterns
      data.forEach(r => {
        expect(r.source_table).toBe('issue_patterns');
      });
    });

    test('keyword_search_fallback respects match_count limit', async () => {
      const { data, error } = await supabase.rpc('keyword_search_fallback', {
        search_query: 'a',  // broad query likely to match many rows
        target_tables: ['venture_artifacts', 'issue_patterns', 'retrospectives'],
        match_count: 2
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('searchSimilar Integration', () => {
    test('searchSimilar returns structured results for keyword-only search', async () => {
      // Dynamic import to handle ESM
      const { searchSimilar } = await import('../../lib/eva/cross-venture-learning.js');

      const results = await searchSimilar(supabase, {
        query: 'performance optimization database',
        limit: 5
      });

      expect(Array.isArray(results)).toBe(true);

      // Verify result structure if any results returned
      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('source');
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('score');
        expect(typeof result.score).toBe('number');
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    test('searchSimilar throws when neither query nor queryEmbedding provided', async () => {
      const { searchSimilar } = await import('../../lib/eva/cross-venture-learning.js');

      await expect(
        searchSimilar(supabase, { limit: 5 })
      ).rejects.toThrow('requires at least query or queryEmbedding');
    });

    test('searchSimilar respects limit parameter', async () => {
      const { searchSimilar } = await import('../../lib/eva/cross-venture-learning.js');

      const results = await searchSimilar(supabase, {
        query: 'test',
        limit: 2
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Data Integrity', () => {
    test('venture_artifacts indexing_status column has valid enum values', async () => {
      const { data, error } = await supabase
        .from('venture_artifacts')
        .select('indexing_status')
        .not('indexing_status', 'is', null)
        .limit(10);

      expect(error).toBeNull();
      const validStatuses = ['pending', 'indexed', 'failed', 'skipped'];
      if (data) {
        data.forEach(r => {
          expect(validStatuses).toContain(r.indexing_status);
        });
      }
    });

    test('venture_artifacts with embeddings have matching model metadata', async () => {
      const { data, error } = await supabase
        .from('venture_artifacts')
        .select('artifact_embedding, embedding_model, embedding_updated_at')
        .not('artifact_embedding', 'is', null)
        .limit(5);

      expect(error).toBeNull();
      if (data && data.length > 0) {
        data.forEach(r => {
          // If embedding exists, model and timestamp should too
          expect(r.embedding_model).toBeTruthy();
          expect(r.embedding_updated_at).toBeTruthy();
        });
      }
    });
  });
});
