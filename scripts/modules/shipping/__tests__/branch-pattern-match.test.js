/**
 * QF-20260727-876 (adversarial review, PR #7298): the pre-existing SD branch/PR
 * pattern match had no boundary check, so `feat/SD-X-1` could phantom-match
 * `feat/SD-X-10-description` (a genuinely different, unrelated SD). Before
 * stacked-landing detection existed, that collision could only cause a
 * false-positive BLOCK (safe direction). With stacking recognized, a phantom
 * match could instead inflate N and demote a genuinely lone, blocking PR to
 * non-blocking "stack" context -- the unsafe direction.
 */
import { describe, it, expect } from 'vitest';
import { matchesSdBranchPattern } from '../branch-pattern-match.js';

describe('QF-20260727-876 — matchesSdBranchPattern boundary check', () => {
  it('matches an exact branch name', () => {
    expect(matchesSdBranchPattern('feat/SD-X-1', 'feat/SD-X-1')).toBe(true);
  });

  it('matches with a "-description" suffix', () => {
    expect(matchesSdBranchPattern('feat/SD-X-1-add-widget', 'feat/SD-X-1')).toBe(true);
  });

  it('matches a remote-prefixed ref ("origin/feat/SD-X-1")', () => {
    expect(matchesSdBranchPattern('origin/feat/SD-X-1', 'feat/SD-X-1')).toBe(true);
  });

  it('does NOT match a longer SD id that literally contains the pattern as a prefix', () => {
    // feat/SD-X-1 is a character-prefix of feat/SD-X-10-description, but SD-X-10
    // is a different SD -- the old bare .includes() phantom-matched this.
    expect(matchesSdBranchPattern('feat/SD-X-10-description', 'feat/SD-X-1')).toBe(false);
  });

  it('does NOT match when glued directly onto more identifier characters', () => {
    expect(matchesSdBranchPattern('feat/SD-X-1abc', 'feat/SD-X-1')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesSdBranchPattern('FEAT/sd-x-1-thing', 'feat/SD-X-1')).toBe(true);
  });

  it('returns false when the pattern is absent entirely', () => {
    expect(matchesSdBranchPattern('feat/SD-Y-1', 'feat/SD-X-1')).toBe(false);
  });

  it('checks EVERY occurrence, not just the first — a later real boundary match must not be shadowed by an earlier phantom one (round-2 adversarial finding, PR #7298)', () => {
    // The first "SD-X-1" occurs inside "SD-X-10" (boundary fails); a second,
    // genuine boundary-matching occurrence follows at the string's end.
    expect(matchesSdBranchPattern('chore/SD-X-10-fix-SD-X-1', 'SD-X-1')).toBe(true);
  });
});
