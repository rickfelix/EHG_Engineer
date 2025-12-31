/**
 * Pattern Library Unit Tests
 *
 * Tests for lib/genesis/pattern-library.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  PatternTypes,
  getPatterns,
  getPatternByType,
  getPatternById,
  getPatternByName,
  searchPatterns,
  getPatternStats,
} from '../pattern-library.js';

describe('PatternTypes', () => {
  it('should have all 9 pattern types', () => {
    expect(Object.keys(PatternTypes)).toHaveLength(9);
    expect(PatternTypes.COMPONENT).toBe('component');
    expect(PatternTypes.HOOK).toBe('hook');
    expect(PatternTypes.SERVICE).toBe('service');
    expect(PatternTypes.PAGE).toBe('page');
    expect(PatternTypes.LAYOUT).toBe('layout');
    expect(PatternTypes.API_ROUTE).toBe('api_route');
    expect(PatternTypes.DATABASE_TABLE).toBe('database_table');
    expect(PatternTypes.RLS_POLICY).toBe('rls_policy');
    expect(PatternTypes.MIGRATION).toBe('migration');
  });
});

describe('getPatterns', () => {
  it('should return all patterns', async () => {
    const { data, error } = await getPatterns();

    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(20);
  });

  it('should return patterns with required fields', async () => {
    const { data } = await getPatterns();

    if (data.length > 0) {
      const pattern = data[0];
      expect(pattern).toHaveProperty('id');
      expect(pattern).toHaveProperty('pattern_name');
      expect(pattern).toHaveProperty('pattern_type');
      expect(pattern).toHaveProperty('template_code');
    }
  });
});

describe('getPatternByType', () => {
  it('should return patterns for valid type', async () => {
    const { data, error } = await getPatternByType('component');

    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);
    data.forEach((pattern) => {
      expect(pattern.pattern_type).toBe('component');
    });
  });

  it('should return error for invalid type', async () => {
    const { data, error } = await getPatternByType('invalid_type');

    expect(error).not.toBeNull();
    expect(error.message).toContain('Invalid pattern type');
    expect(data).toEqual([]);
  });

  it('should work for all 9 pattern types', async () => {
    for (const type of Object.values(PatternTypes)) {
      const { error } = await getPatternByType(type);
      expect(error).toBeNull();
    }
  });
});

describe('getPatternByName', () => {
  it('should return pattern for valid name', async () => {
    const { data, error } = await getPatternByName('DataTable');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.pattern_name).toBe('DataTable');
    expect(data.pattern_type).toBe('component');
  });

  it('should return null for non-existent name', async () => {
    const { data, error } = await getPatternByName('NonExistentPattern');

    expect(data).toBeNull();
    // Supabase returns an error for .single() with no rows
    expect(error).not.toBeNull();
  });
});

describe('getPatternStats', () => {
  it('should return total and byType stats', async () => {
    const { data, error } = await getPatternStats();

    expect(error).toBeNull();
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('byType');
    expect(data.total).toBeGreaterThanOrEqual(20);
    expect(Object.keys(data.byType)).toHaveLength(9);
  });

  it('should have counts for all pattern types', async () => {
    const { data } = await getPatternStats();

    for (const type of Object.values(PatternTypes)) {
      expect(data.byType).toHaveProperty(type);
      expect(typeof data.byType[type]).toBe('number');
    }
  });
});

describe('searchPatterns', () => {
  it('should find patterns by name keyword', async () => {
    const { data, error } = await searchPatterns('Table');

    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);
  });

  it('should return empty array for no matches', async () => {
    const { data, error } = await searchPatterns('zzzznonexistent');

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
