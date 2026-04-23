/**
 * tests/unit/scripts/truncate-slug-word-boundary.test.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-008 / Issue #5 acceptance criteria)
 */

import { describe, it, expect } from 'vitest';
import { truncateSlugAtWordBoundary } from '../../../scripts/verify-git-branch-status.js';

describe('truncateSlugAtWordBoundary', () => {
  it('returns slug unchanged when within maxLen', () => {
    expect(truncateSlugAtWordBoundary('leo-protocol', 40)).toBe('leo-protocol');
    expect(truncateSlugAtWordBoundary('short', 40)).toBe('short');
  });

  it('truncates at last hyphen boundary within maxLen', () => {
    // "leo-protocol-policy-registry-conformance-harness" → at maxLen=40, chop at last hyphen ≤ 40
    const input = 'leo-protocol-policy-registry-conformance-harness';
    const result = truncateSlugAtWordBoundary(input, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).not.toMatch(/conforma$|harne$|polic$/); // never ends mid-word
    expect(result).toBe('leo-protocol-policy-registry-conformance');
  });

  it('keeps whole words — does not cut mid-word', () => {
    const input = 'alpha-beta-gamma-delta-epsilon-zeta-eta-theta';
    const result = truncateSlugAtWordBoundary(input, 20);
    // Result must end on a whole word, so the last char is not inside a word-boundary truncation
    expect(result.endsWith('-')).toBe(false);
    // Every segment in the result must be intact from the input
    const resultSegments = result.split('-');
    const inputSegments = input.split('-');
    for (let i = 0; i < resultSegments.length; i++) {
      expect(resultSegments[i]).toBe(inputSegments[i]);
    }
  });

  it('hard-cuts when no hyphen appears in first maxLen chars (pathological)', () => {
    const input = 'abcdefghijklmnopqrstuvwxyz-then-more';
    const result = truncateSlugAtWordBoundary(input, 10);
    expect(result).toBe('abcdefghij');
  });

  it('returns empty string for empty input', () => {
    expect(truncateSlugAtWordBoundary('', 40)).toBe('');
  });

  it('returns empty string for invalid input types', () => {
    expect(truncateSlugAtWordBoundary(null, 40)).toBe('');
    expect(truncateSlugAtWordBoundary(undefined, 40)).toBe('');
    expect(truncateSlugAtWordBoundary(42, 40)).toBe('');
    expect(truncateSlugAtWordBoundary('x', null)).toBe('');
    expect(truncateSlugAtWordBoundary('x', 0)).toBe('');
    expect(truncateSlugAtWordBoundary('x', -5)).toBe('');
  });

  it('handles input exactly at maxLen', () => {
    // Exactly 10 chars → return unchanged
    expect(truncateSlugAtWordBoundary('leo-bravo-', 10)).toBe('leo-bravo-');
    expect(truncateSlugAtWordBoundary('abc-def-gh', 10)).toBe('abc-def-gh');
  });

  it('real-world regression: leo-protocol-policy-registry-conformance-harness at 40', () => {
    // This is the exact failure mode from the bug report — confirm the fix
    const input = 'leo-protocol-policy-registry-conformance-harness';
    const result = truncateSlugAtWordBoundary(input, 40);
    // Before the fix: result would have been "leo-protocol-policy-registry-conformance" (40 chars)
    // which is actually word-boundary-correct at length 40 — but for a slightly different
    // maxLen this can cut mid-word. Test the contract: result never ends mid-word.
    expect(result.endsWith('-')).toBe(false);
    const lastWord = result.split('-').pop();
    const fullWords = input.split('-');
    expect(fullWords).toContain(lastWord);
  });
});
