/**
 * SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-4): extractCandidateTestPaths' best-effort filter.
 * Pure function, no DB access.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({}),
}));
vi.mock('../../../lib/learning/issue-knowledge-base.js', () => ({
  IssueKnowledgeBase: class {},
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const { extractCandidateTestPaths } = await import('../../../scripts/auto-extract-patterns-from-retro.js');

describe('extractCandidateTestPaths', () => {
  it('extracts real test-file paths from affected_components', () => {
    const retro = { affected_components: ['lib/eva/devils-advocate.js', 'tests/unit/eva/devils-advocate.test.js'] };
    expect(extractCandidateTestPaths(retro)).toEqual(['tests/unit/eva/devils-advocate.test.js']);
  });

  it('excludes generic non-path labels', () => {
    const retro = { affected_components: ['LEO Protocol', 'Handoff System'] };
    expect(extractCandidateTestPaths(retro)).toEqual([]);
  });

  it('matches paths under a tests/ directory even without a .test. suffix', () => {
    const retro = { affected_components: ['tests/fixtures/some-fixture.js'] };
    expect(extractCandidateTestPaths(retro)).toEqual(['tests/fixtures/some-fixture.js']);
  });

  it('combines affected_components and related_files', () => {
    const retro = {
      affected_components: ['lib/foo.js'],
      related_files: ['tests/unit/foo.test.js'],
    };
    expect(extractCandidateTestPaths(retro)).toEqual(['tests/unit/foo.test.js']);
  });

  it('returns [] (never throws) when both fields are absent or non-array', () => {
    expect(extractCandidateTestPaths({})).toEqual([]);
    expect(extractCandidateTestPaths({ affected_components: null, related_files: 'not-an-array' })).toEqual([]);
    expect(extractCandidateTestPaths(null)).toEqual([]);
    expect(extractCandidateTestPaths(undefined)).toEqual([]);
  });
});
