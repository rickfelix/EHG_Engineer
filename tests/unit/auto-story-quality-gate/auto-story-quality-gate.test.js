/**
 * Tests for SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 (Option B).
 *
 * Validates:
 *   T1: allAcsBoilerplate helper detects all-boilerplate criteria correctly
 *   T2: Mixed acceptance_criteria (some boilerplate, some not) returns false (defaults to ready)
 *   T3: Empty / non-array criteria returns false (no false-positive draft)
 *   T4: Regression-pin signature for promote-user-stories.js CLI args parsing
 */

import { describe, it, expect } from 'vitest';
import { allAcsBoilerplate } from '../../../scripts/modules/auto-trigger-stories.mjs';

describe('SD-LEO-INFRA-AUTO-STORY-QUALITY-GATE-001 allAcsBoilerplate', () => {
  it('T1: returns true when every AC has is_boilerplate=true', () => {
    const criteria = [
      { id: 'AC-1', is_boilerplate: true, scenario: 'a' },
      { id: 'AC-2', is_boilerplate: true, scenario: 'b' },
      { id: 'AC-3', is_boilerplate: true, scenario: 'c' },
    ];
    expect(allAcsBoilerplate(criteria)).toBe(true);
  });

  it('T2: returns false when any AC has is_boilerplate=false or missing flag (mixed = ready)', () => {
    const mixedFalse = [
      { id: 'AC-1', is_boilerplate: true, scenario: 'a' },
      { id: 'AC-2', is_boilerplate: false, scenario: 'b (real)' },
    ];
    expect(allAcsBoilerplate(mixedFalse)).toBe(false);

    const mixedMissing = [
      { id: 'AC-1', is_boilerplate: true, scenario: 'a' },
      { id: 'AC-2', scenario: 'b (no flag)' },
    ];
    expect(allAcsBoilerplate(mixedMissing)).toBe(false);
  });

  it('T3: returns false for empty array, non-array, null, undefined (no false-positive draft)', () => {
    expect(allAcsBoilerplate([])).toBe(false);
    expect(allAcsBoilerplate(null)).toBe(false);
    expect(allAcsBoilerplate(undefined)).toBe(false);
    expect(allAcsBoilerplate('not an array')).toBe(false);
    expect(allAcsBoilerplate(42)).toBe(false);
  });

  it('T4: returns false when AC items are strings (legacy format), not objects', () => {
    // Some older PRDs have acceptance_criteria as array of strings; those should
    // default to ready (not draft) since they don't carry the is_boilerplate signal.
    const stringCriteria = ['Validate input', 'Persist data', 'Return response'];
    expect(allAcsBoilerplate(stringCriteria)).toBe(false);
  });
});
