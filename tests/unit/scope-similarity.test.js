/**
 * scope-similarity.js unit tests
 * SD: SD-MAN-INFRA-SEMANTIC-VALIDATION-GATES-002
 */
import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  calculateSimilarity,
  extractSDKeywords,
  keywordsToArray,
  STOP_WORDS,
  MIN_WORD_LENGTH
} from '../../scripts/modules/handoff/validation/scope-similarity.js';

describe('extractKeywords', () => {
  it('returns empty set for null/undefined input', () => {
    expect(extractKeywords(null).size).toBe(0);
    expect(extractKeywords(undefined).size).toBe(0);
    expect(extractKeywords('').size).toBe(0);
  });

  it('extracts keywords from text', () => {
    const keywords = extractKeywords('database migration schema validation');
    expect(keywords.has('database')).toBe(true);
    expect(keywords.has('migration')).toBe(true);
    expect(keywords.has('schema')).toBe(true);
    expect(keywords.has('validation')).toBe(true);
  });

  it('filters stop words', () => {
    const keywords = extractKeywords('the database and the migration');
    expect(keywords.has('the')).toBe(false);
    expect(keywords.has('and')).toBe(false);
    expect(keywords.has('database')).toBe(true);
    expect(keywords.has('migration')).toBe(true);
  });

  it('filters short words (< MIN_WORD_LENGTH)', () => {
    const keywords = extractKeywords('add new sd fix key');
    // All words are <= 3 chars except none
    expect(keywords.size).toBe(0);
  });

  it('normalizes to lowercase', () => {
    const keywords = extractKeywords('Database MIGRATION Schema');
    expect(keywords.has('database')).toBe(true);
    expect(keywords.has('migration')).toBe(true);
    expect(keywords.has('schema')).toBe(true);
  });

  it('handles object input by stringifying', () => {
    const keywords = extractKeywords({ area: 'database', detail: 'migration' });
    expect(keywords.has('database')).toBe(true);
    expect(keywords.has('migration')).toBe(true);
  });
});

describe('calculateSimilarity', () => {
  it('returns 0 for empty sets', () => {
    expect(calculateSimilarity(new Set(), new Set())).toBe(0);
    expect(calculateSimilarity(new Set(['test']), new Set())).toBe(0);
    expect(calculateSimilarity(new Set(), new Set(['test']))).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    const set = new Set(['database', 'migration', 'schema']);
    expect(calculateSimilarity(set, set)).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const setA = new Set(['database', 'migration']);
    const setB = new Set(['frontend', 'component']);
    expect(calculateSimilarity(setA, setB)).toBe(0);
  });

  it('returns correct Jaccard similarity', () => {
    const setA = new Set(['database', 'migration', 'schema']);
    const setB = new Set(['database', 'validation', 'schema']);
    // Intersection: {database, schema} = 2
    // Union: {database, migration, schema, validation} = 4
    // Jaccard: 2/4 = 0.5
    expect(calculateSimilarity(setA, setB)).toBe(0.5);
  });
});

describe('extractSDKeywords', () => {
  it('returns empty set for null SD', () => {
    expect(extractSDKeywords(null).size).toBe(0);
  });

  it('combines title, scope, description, and key_changes', () => {
    const sd = {
      title: 'Database Migration',
      scope: 'Schema validation update',
      description: 'Update infrastructure',
      key_changes: [{ area: 'tables', detail: 'modify columns' }]
    };
    const keywords = extractSDKeywords(sd);
    expect(keywords.has('database')).toBe(true);
    expect(keywords.has('migration')).toBe(true);
    expect(keywords.has('schema')).toBe(true);
    expect(keywords.has('validation')).toBe(true);
    expect(keywords.has('infrastructure')).toBe(true);
  });
});

describe('keywordsToArray', () => {
  it('converts set to sorted array', () => {
    const set = new Set(['schema', 'database', 'migration']);
    const arr = keywordsToArray(set);
    expect(arr).toEqual(['database', 'migration', 'schema']);
  });

  it('handles empty set', () => {
    expect(keywordsToArray(new Set())).toEqual([]);
  });
});
