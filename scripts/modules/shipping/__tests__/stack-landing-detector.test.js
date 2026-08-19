/**
 * QF-20260727-876: ship-preflight's Branch Verification and Multi-Repo Coordination
 * checks previously blocked a stacked-PR landing (N open PRs for one SD, all based
 * directly on main) on the stack's own existence -- the gate could only be cleared BY
 * the merge it gates. MEASURED live on SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001's
 * 21-PR landing (Branch Verification: 21 open PRs; Multi-Repo Coordination: 22
 * actions needed), both describing the stack itself.
 *
 * isStackedLanding is the shared, pure predicate both checks use to distinguish that
 * shape from one genuinely forgotten branch (which must keep blocking).
 */
import { describe, it, expect } from 'vitest';
import { isStackedLanding } from '../stack-landing-detector.js';

describe('QF-20260727-876 — isStackedLanding', () => {
  it('recognizes N>1 sibling PRs all based on main as a deliberate stacked landing', () => {
    expect(isStackedLanding(['main', 'main', 'main'])).toBe(true);
  });

  it('does NOT treat a single open PR as a stack — indistinguishable from one forgotten branch', () => {
    expect(isStackedLanding(['main'])).toBe(false);
  });

  it('does NOT treat an empty list as a stack', () => {
    expect(isStackedLanding([])).toBe(false);
  });

  it('refuses to discount a genuine dependency chain — a PR based on ANOTHER branch stays blocking', () => {
    // One PR literally stacked on a sibling's branch (not on main) is a real
    // ordering dependency, not an independently-mergeable landing.
    expect(isStackedLanding(['main', 'main', 'feat/SD-X-part-1'])).toBe(false);
  });

  it('respects a custom targetBase', () => {
    expect(isStackedLanding(['develop', 'develop'], { targetBase: 'develop' })).toBe(true);
    expect(isStackedLanding(['main', 'main'], { targetBase: 'develop' })).toBe(false);
  });

  it('treats a null/undefined baseRefName as non-main — fails closed, stays blocking', () => {
    expect(isStackedLanding(['main', null])).toBe(false);
    expect(isStackedLanding(['main', undefined])).toBe(false);
  });
});
