/**
 * SD-LEO-INFRA-PARENT-SCOPE-COVERAGE-001 (FR-1 / activation test).
 *
 * Pure core: extractScopeElements(sd) parses declared scope/success_criteria into
 * discrete elements; computeScopeCoverage(sd, children) matches each element against
 * the children's title/scope/scope_slice text. No DB/IO — every assertion is over the
 * pure functions.
 */
import { describe, it, expect } from 'vitest';
import { extractScopeElements, computeScopeCoverage } from '../../lib/sd/scope-coverage.js';

describe('extractScopeElements', () => {
  it('splits a numbered-list scope string into discrete elements', () => {
    const sd = { scope: '1. Build the landing page UI\n2. Build the signup UI\n3. Wire analytics' };
    const elements = extractScopeElements(sd);
    expect(elements).toHaveLength(3);
    expect(elements[0]).toEqual({ element: 'Build the landing page UI', source: 'scope' });
    expect(elements.every((e) => e.source === 'scope')).toBe(true);
  });

  it('extracts success_criteria entries in {criterion,measure} shape', () => {
    const sd = { success_criteria: [{ criterion: 'Users can sign up', measure: 'E2E test passes' }, 'Plain string criterion'] };
    const elements = extractScopeElements(sd);
    expect(elements).toHaveLength(2);
    expect(elements[0]).toEqual({ element: 'Users can sign up', source: 'success_criteria' });
    expect(elements[1]).toEqual({ element: 'Plain string criterion', source: 'success_criteria' });
  });

  it('returns an empty array (never a fabricated element) when scope and success_criteria are both blank', () => {
    expect(extractScopeElements({ scope: '', success_criteria: [] })).toEqual([]);
    expect(extractScopeElements({})).toEqual([]);
    expect(extractScopeElements(null)).toEqual([]);
  });

  it('falls back to treating a single unstructured paragraph as one element', () => {
    const sd = { scope: 'A single free-text scope paragraph with no list structure' };
    expect(extractScopeElements(sd)).toEqual([
      { element: 'A single free-text scope paragraph with no list structure', source: 'scope' },
    ]);
  });
});

describe('computeScopeCoverage', () => {
  const parent = { scope: '1. Landing page UI\n2. Signup UI' };

  it('reports 100% coverage when every element matches a child', () => {
    const children = [
      { sd_key: 'CHILD-A', title: 'Build the landing page UI', scope: '' },
      { sd_key: 'CHILD-B', title: 'Build the signup UI', scope: '' },
    ];
    const result = computeScopeCoverage(parent, children);
    expect(result.coverage_pct).toBe(100);
    expect(result.elements.every((e) => e.covered)).toBe(true);
    expect(result.elements.find((e) => e.element === 'Landing page UI').coveringChildren).toContain('CHILD-A');
  });

  it('reports partial coverage — the real incident specimen (API-only child)', () => {
    const children = [{ sd_key: 'CHILD-API', title: 'Build the API layer', scope: 'REST endpoints for venture data' }];
    const result = computeScopeCoverage(parent, children);
    expect(result.coverage_pct).toBe(0);
    expect(result.elements.filter((e) => !e.covered)).toHaveLength(2);
    expect(result.elements.every((e) => e.coveringChildren.length === 0)).toBe(true);
  });

  it('reports 0% (not a crash) for a parent with zero children', () => {
    const result = computeScopeCoverage(parent, []);
    expect(result.coverage_pct).toBe(0);
    expect(result.elements).toHaveLength(2);
  });

  it('reports 100% (zero elements, not a fabricated verdict) for an empty-scope parent', () => {
    const result = computeScopeCoverage({ scope: '', success_criteria: [] }, [{ sd_key: 'X', title: 'anything' }]);
    expect(result.coverage_pct).toBe(100);
    expect(result.elements).toEqual([]);
  });

  it('matches via child.scope_slice text when title/scope alone would not match', () => {
    const children = [
      { sd_key: 'CHILD-A', title: 'Frontend work', scope: '', scope_slice: { stages: ['landing page ui rollout'] } },
    ];
    const result = computeScopeCoverage({ scope: '1. Landing page UI rollout' }, children);
    expect(result.coverage_pct).toBe(100);
  });
});
