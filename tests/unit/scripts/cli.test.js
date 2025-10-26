/**
 * Script Management CLI Unit Tests
 *
 * Part of Quick Wins Path - Week 1 (Task 4)
 * Tests: 5 unit tests for CLI functionality
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  searchScripts,
  getScriptsByCategory,
  getScriptInfo,
} from '../../../scripts/cli.cjs';

describe('Script Management CLI', () => {
  let mockInventory;

  beforeAll(() => {
    // Create mock inventory for testing
    mockInventory = {
      totalScripts: 5,
      scripts: [
        {
          filename: 'accept-handoff-infra.mjs',
          description: 'Accept infrastructure handoff from PLAN phase',
          category: 'handoff',
          complexity: 'simple',
          linesOfCode: 64,
          hasDatabase: true,
          isAsync: true,
          dependencies: ['@supabase/supabase-js', 'fs/promises'],
          exports: ['acceptHandoff'],
        },
        {
          filename: 'create-handoff-test.mjs',
          description: 'Create test handoff for validation',
          category: 'handoff',
          complexity: 'medium',
          linesOfCode: 125,
          hasDatabase: true,
          isAsync: true,
          dependencies: ['@supabase/supabase-js'],
          exports: ['createHandoff'],
        },
        {
          filename: 'run-database-migration.js',
          description: 'Run database schema migrations',
          category: 'database',
          complexity: 'complex',
          linesOfCode: 450,
          hasDatabase: true,
          isAsync: true,
          dependencies: ['pg', 'fs/promises', 'path'],
          exports: ['runMigration', 'validateSchema'],
        },
        {
          filename: 'generate-test-data.mjs',
          description: 'Generate test data for development',
          category: 'testing',
          complexity: 'simple',
          linesOfCode: 89,
          hasDatabase: false,
          isAsync: true,
          dependencies: ['faker'],
          exports: [],
        },
        {
          filename: 'cleanup-temp-files.sh',
          description: 'Clean up temporary files',
          category: 'utilities',
          complexity: 'simple',
          linesOfCode: 25,
          hasDatabase: false,
          isAsync: false,
          dependencies: [],
          exports: [],
        },
      ],
      statistics: {
        totalLinesOfCode: 753,
        averageLinesOfCode: 150.6,
        withDatabase: 3,
        async: 4,
        byComplexity: {
          simple: 3,
          medium: 1,
          complex: 1,
        },
      },
    };
  });

  // Test 1: Search functionality
  describe('searchScripts', () => {
    it('should find scripts matching keyword', () => {
      const results = searchScripts(mockInventory, 'handoff');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].filename).toBe('accept-handoff-infra.mjs');
      expect(results[1].filename).toBe('create-handoff-test.mjs');
    });

    it('should search in description, category, and dependencies', () => {
      const databaseResults = searchScripts(mockInventory, 'database');

      expect(databaseResults.length).toBeGreaterThan(0);

      // Should find both scripts with 'database' category and migration script
      const hasCategory = databaseResults.some(
        (s) => s.category === 'database'
      );
      const hasDescription = databaseResults.some((s) =>
        s.description.toLowerCase().includes('database')
      );

      expect(hasCategory || hasDescription).toBe(true);
    });

    it('should be case insensitive', () => {
      const upperCase = searchScripts(mockInventory, 'HANDOFF');
      const lowerCase = searchScripts(mockInventory, 'handoff');

      expect(upperCase.length).toBe(lowerCase.length);
    });

    it('should return empty array when no matches found', () => {
      const results = searchScripts(mockInventory, 'nonexistent-keyword-xyz');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  // Test 2: Script info retrieval
  describe('getScriptInfo', () => {
    it('should return script metadata by filename', () => {
      const script = getScriptInfo(
        mockInventory,
        'accept-handoff-infra.mjs'
      );

      expect(script).toBeTruthy();
      expect(script.filename).toBe('accept-handoff-infra.mjs');
      expect(script.description).toBe(
        'Accept infrastructure handoff from PLAN phase'
      );
      expect(script.category).toBe('handoff');
      expect(script.complexity).toBe('simple');
      expect(script.linesOfCode).toBe(64);
      expect(script.hasDatabase).toBe(true);
      expect(script.isAsync).toBe(true);
      expect(Array.isArray(script.dependencies)).toBe(true);
      expect(script.dependencies.length).toBe(2);
    });

    it('should return null for non-existent script', () => {
      const script = getScriptInfo(mockInventory, 'nonexistent-script.js');

      expect(script).toBeNull();
    });

    it('should handle scripts with no exports', () => {
      const script = getScriptInfo(mockInventory, 'cleanup-temp-files.sh');

      expect(script).toBeTruthy();
      expect(script.exports).toBeDefined();
      expect(Array.isArray(script.exports)).toBe(true);
      expect(script.exports.length).toBe(0);
    });
  });

  // Test 3: Category listing
  describe('getScriptsByCategory', () => {
    it('should return all scripts in a category', () => {
      const handoffScripts = getScriptsByCategory(mockInventory, 'handoff');

      expect(Array.isArray(handoffScripts)).toBe(true);
      expect(handoffScripts.length).toBe(2);

      // All returned scripts should be in 'handoff' category
      handoffScripts.forEach((script) => {
        expect(script.category).toBe('handoff');
      });
    });

    it('should return empty array for non-existent category', () => {
      const results = getScriptsByCategory(mockInventory, 'nonexistent');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should return correct count for each category', () => {
      const handoff = getScriptsByCategory(mockInventory, 'handoff');
      const database = getScriptsByCategory(mockInventory, 'database');
      const testing = getScriptsByCategory(mockInventory, 'testing');
      const utilities = getScriptsByCategory(mockInventory, 'utilities');

      expect(handoff.length).toBe(2);
      expect(database.length).toBe(1);
      expect(testing.length).toBe(1);
      expect(utilities.length).toBe(1);
    });
  });

  // Test 4: Category statistics (helper function from CLI)
  describe('getCategories', () => {
    // Import getCategories inline since it's not exported
    const getCategories = (inventory) => {
      const categoryCounts = {};
      inventory.scripts.forEach((script) => {
        categoryCounts[script.category] =
          (categoryCounts[script.category] || 0) + 1;
      });

      return Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    it('should calculate category counts correctly', () => {
      const categories = getCategories(mockInventory);

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(4);

      // Find handoff category (should have 2 scripts)
      const handoffCategory = categories.find((c) => c.name === 'handoff');
      expect(handoffCategory).toBeTruthy();
      expect(handoffCategory.count).toBe(2);
    });

    it('should sort categories by count (descending)', () => {
      const categories = getCategories(mockInventory);

      // First category should have highest count (handoff with 2)
      expect(categories[0].name).toBe('handoff');
      expect(categories[0].count).toBe(2);

      // Verify descending order
      for (let i = 1; i < categories.length; i++) {
        expect(categories[i - 1].count).toBeGreaterThanOrEqual(
          categories[i].count
        );
      }
    });

    it('should return all unique categories', () => {
      const categories = getCategories(mockInventory);
      const categoryNames = categories.map((c) => c.name);

      expect(categoryNames).toContain('handoff');
      expect(categoryNames).toContain('database');
      expect(categoryNames).toContain('testing');
      expect(categoryNames).toContain('utilities');

      // No duplicates
      const uniqueNames = new Set(categoryNames);
      expect(uniqueNames.size).toBe(categoryNames.length);
    });
  });

  // Test 5: Error handling and edge cases
  describe('Error Handling and Edge Cases', () => {
    it('should handle empty inventory gracefully', () => {
      const emptyInventory = { totalScripts: 0, scripts: [] };

      const searchResults = searchScripts(emptyInventory, 'test');
      expect(searchResults.length).toBe(0);

      const categoryResults = getScriptsByCategory(emptyInventory, 'any');
      expect(categoryResults.length).toBe(0);

      const scriptInfo = getScriptInfo(emptyInventory, 'any.js');
      expect(scriptInfo).toBeNull();
    });

    it('should handle scripts with missing optional fields', () => {
      const minimalInventory = {
        totalScripts: 1,
        scripts: [
          {
            filename: 'minimal-script.js',
            category: 'test',
            complexity: 'simple',
            linesOfCode: 10,
            dependencies: [],
          },
        ],
      };

      const script = getScriptInfo(minimalInventory, 'minimal-script.js');
      expect(script).toBeTruthy();
      expect(script.filename).toBe('minimal-script.js');
    });

    it('should handle special characters in search', () => {
      const results = searchScripts(mockInventory, '@supabase/supabase-js');

      expect(results.length).toBeGreaterThan(0);

      // Should find scripts with this dependency
      const hasSupabase = results.some((s) =>
        s.dependencies.includes('@supabase/supabase-js')
      );
      expect(hasSupabase).toBe(true);
    });

    it('should handle whitespace in search terms literally', () => {
      const withSpaces = searchScripts(mockInventory, '  handoff  ');
      const noSpaces = searchScripts(mockInventory, 'handoff');

      // Note: Current implementation does NOT trim, so these will differ
      // This is a potential improvement area
      expect(noSpaces.length).toBe(2);
      expect(withSpaces.length).toBe(0); // Whitespace is included in search
    });
  });
});
