/**
 * Test Fixtures and Mock Supabase Factories
 */

import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const fixturesPath = join(process.cwd(), 'tests', 'fixtures', 'protocol-improvements');

export const sampleRetrospective = JSON.parse(
  readFileSync(join(fixturesPath, 'sample-retrospective.json'), 'utf-8')
);

export const sampleImprovementQueue = JSON.parse(
  readFileSync(join(fixturesPath, 'sample-improvement-queue.json'), 'utf-8')
);

export const expectedExtraction = JSON.parse(
  readFileSync(join(fixturesPath, 'expected-extraction.json'), 'utf-8')
);

// =============================================================================
// MOCK SUPABASE FACTORIES
// =============================================================================

/**
 * Create mock Supabase client for ImprovementExtractor tests
 * @returns {object} Mock Supabase client with chainable methods
 */
export function createExtractorMockSupabase() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn()
  };
}

/**
 * Create mock Supabase client for ImprovementApplicator tests
 * @returns {object} Mock Supabase client with chainable methods
 */
export function createApplicatorMockSupabase() {
  return {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: {}, error: null })
  };
}

/**
 * Create mock Supabase client for EffectivenessTracker tests
 * @returns {object} Mock Supabase client with chainable methods
 */
export function createTrackerMockSupabase() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    single: vi.fn()
  };
}
