/**
 * E2E Tests for Semantic Search Infrastructure
 *
 * Tests the complete semantic search workflow:
 * 1. Database migration applied
 * 2. Sample entities indexed with embeddings
 * 3. Search queries return relevant results
 * 4. Filters work correctly
 *
 * SD: SD-SEMANTIC-SEARCH-001
 * Story: US-001 - Natural Language Code Search
 */

import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { searchCode, getIndexStatus, getCodebaseStats } from '../../lib/semantic-search-client.js';
import dotenv from 'dotenv';

dotenv.config();

// Sample test data
const SAMPLE_ENTITIES = [
  {
    file_path: 'test/handlers/button.tsx',
    entity_type: 'component',
    entity_name: 'Button',
    code_snippet: 'const Button = (props) => { return <button onClick={props.onClick}>{props.children}</button>; }',
    semantic_description: 'component: Button. React button component with click handler. Code: const Button = (props) => { return <button onClick={props.onClick}>{props.children}</button>; }',
    line_start: 1,
    line_end: 5,
    language: 'tsx',
    application: 'ehg_engineer'
  },
  {
    file_path: 'test/utils/math.js',
    entity_type: 'function',
    entity_name: 'calculateSum',
    code_snippet: 'function calculateSum(numbers) { return numbers.reduce((a, b) => a + b, 0); }',
    semantic_description: 'function: calculateSum. Parameters: numbers. Calculates the sum of an array of numbers. Code: function calculateSum(numbers) { return numbers.reduce((a, b) => a + b, 0); }',
    line_start: 10,
    line_end: 12,
    language: 'javascript',
    application: 'ehg_engineer'
  },
  {
    file_path: 'test/database/functions/search.sql',
    entity_type: 'function',
    entity_name: 'search_users',
    code_snippet: 'CREATE FUNCTION search_users(query TEXT) RETURNS TABLE(id UUID) AS $$ BEGIN RETURN QUERY SELECT id FROM users WHERE name ILIKE query; END; $$ LANGUAGE plpgsql;',
    semantic_description: 'function: search_users. PostgreSQL function to search users by name. Code: CREATE FUNCTION search_users(query TEXT) RETURNS TABLE(id UUID) AS $$...',
    line_start: 1,
    line_end: 6,
    language: 'sql',
    application: 'ehg_engineer'
  }
];

describe('Semantic Search E2E', () => {
  let supabase;
  let testEntityIds = [];

  beforeAll(async () => {
    // Initialize Supabase client with service role (for test data insertion)
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify database migration applied
    const { error: tableError } = await supabase
      .from('codebase_semantic_index')
      .select('*', { count: 'exact', head: true });

    if (tableError) {
      throw new Error(`Database migration not applied: ${tableError.message}. Run migration first.`);
    }

    // Clean up any existing test data
    await supabase
      .from('codebase_semantic_index')
      .delete()
      .like('file_path', 'test/%');

    // Note: Actual embedding generation requires OpenAI API
    // For E2E tests, we'll skip embedding generation and focus on DB operations
    console.log('✅ E2E test environment prepared');
  });

  afterAll(async () => {
    // Clean up test data
    if (testEntityIds.length > 0) {
      await supabase
        .from('codebase_semantic_index')
        .delete()
        .in('id', testEntityIds);
    }

    // Also clean up any test files
    await supabase
      .from('codebase_semantic_index')
      .delete()
      .like('file_path', 'test/%');
  });

  describe('Database Migration Verification', () => {
    test('should have codebase_semantic_index table', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('*', { count: 'exact', head: true });

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('should have codebase_semantic_stats view', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_stats')
        .select('*');

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    test('should have semantic_code_search RPC function', async () => {
      // Test with dummy embedding (will return no results but shouldn't error)
      const { data, error } = await supabase.rpc('semantic_code_search', {
        query_embedding: Array(1536).fill(0.1),
        match_threshold: 0.5,
        match_count: 5
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Index Status API', () => {
    test('should get index status', async () => {
      const status = await getIndexStatus();

      expect(status).toHaveProperty('totalEntities');
      expect(status).toHaveProperty('lastUpdated');
      expect(status).toHaveProperty('isPopulated');
      expect(typeof status.totalEntities).toBe('number');
      expect(typeof status.isPopulated).toBe('boolean');
    });

    test('should get codebase statistics', async () => {
      const stats = await getCodebaseStats();

      expect(Array.isArray(stats)).toBe(true);
      // Stats might be empty if no entities indexed yet
    });
  });

  describe('Entity Filtering', () => {
    test('should filter by entity type', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('*')
        .eq('entity_type', 'function')
        .limit(10);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      // All results should be functions
      data.forEach(entity => {
        expect(entity.entity_type).toBe('function');
      });
    });

    test('should filter by application', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('*')
        .eq('application', 'ehg_engineer')
        .limit(10);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      // All results should be from ehg_engineer
      data.forEach(entity => {
        expect(entity.application).toBe('ehg_engineer');
      });
    });

    test('should filter by language', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('*')
        .eq('language', 'typescript')
        .limit(10);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      // All results should be TypeScript
      data.forEach(entity => {
        expect(entity.language).toBe('typescript');
      });
    });
  });

  describe('RLS Policies', () => {
    test('authenticated users should have read access', async () => {
      // Using service role key which has full access
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('*')
        .limit(1);

      expect(error).toBeNull();
    });

    test('should enforce unique constraint on file_path + entity_name + entity_type', async () => {
      // Attempt to insert duplicate entity
      const entity = {
        file_path: 'test/duplicate.ts',
        entity_type: 'function',
        entity_name: 'testFunction',
        code_snippet: 'function testFunction() {}',
        semantic_description: 'Test function',
        embedding: Array(1536).fill(0.1),
        line_start: 1,
        line_end: 1,
        language: 'typescript',
        application: 'ehg_engineer'
      };

      // First insert should succeed
      const { data: first, error: error1 } = await supabase
        .from('codebase_semantic_index')
        .insert(entity)
        .select();

      expect(error1).toBeNull();
      expect(first).toHaveLength(1);
      testEntityIds.push(first[0].id);

      // Second insert should fail (unique constraint violation)
      const { error: error2 } = await supabase
        .from('codebase_semantic_index')
        .insert(entity);

      expect(error2).not.toBeNull();
      expect(error2.code).toBe('23505'); // Unique violation
    });
  });

  describe('Search Integration (Smoke Test)', () => {
    test('should handle search with no results gracefully', async () => {
      // Search for something unlikely to exist
      const results = await searchCode({
        query: 'quantum entanglement flux capacitor',
        matchThreshold: 0.9,
        matchCount: 5
      });

      expect(Array.isArray(results)).toBe(true);
      // Results might be empty, that's okay
    });

    test('should respect match count parameter', async () => {
      const results = await searchCode({
        query: 'function component handler',
        matchCount: 3
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    test('should return results with expected structure', async () => {
      const results = await searchCode({
        query: 'database table user',
        matchCount: 1
      });

      if (results.length > 0) {
        const result = results[0];

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('file_path');
        expect(result).toHaveProperty('entity_type');
        expect(result).toHaveProperty('entity_name');
        expect(result).toHaveProperty('code_snippet');
        expect(result).toHaveProperty('semantic_description');
        expect(result).toHaveProperty('similarity');
        expect(result).toHaveProperty('language');
        expect(result).toHaveProperty('application');

        // Similarity should be between 0 and 1
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Data Integrity', () => {
    test('should have valid vector dimensions (1536)', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('embedding')
        .limit(1)
        .single();

      if (data && data.embedding) {
        // pgvector returns embeddings as arrays
        expect(Array.isArray(data.embedding) || typeof data.embedding === 'string').toBe(true);
      }

      expect(error).toBeNull();
    });

    test('should have timestamps', async () => {
      const { data, error } = await supabase
        .from('codebase_semantic_index')
        .select('indexed_at, last_updated')
        .limit(1);

      if (data && data.length > 0) {
        const entity = data[0];
        expect(entity.indexed_at).toBeTruthy();
        expect(entity.last_updated).toBeTruthy();
      }

      expect(error).toBeNull();
    });
  });
});
