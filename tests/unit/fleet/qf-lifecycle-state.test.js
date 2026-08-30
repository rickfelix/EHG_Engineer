/**
 * QF-20260830-559 — a QF with an open PR must derive as awaiting-review, distinct from a QF
 * still being built and one that's merely open (unclaimed). Fixture: one row per state.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isAwaitingReview, deriveQfLifecycleState } = require('../../../lib/fleet/qf-lifecycle-state.cjs');

const BUILDING = { id: 'QF-BUILD', status: 'in_progress', pr_url: null };
const AWAITING_REVIEW = { id: 'QF-REVIEW', status: 'in_progress', pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/7799' };
const OPEN = { id: 'QF-OPEN', status: 'open', pr_url: null };

describe('isAwaitingReview', () => {
  it('a building QF (in_progress, no PR) is NOT awaiting review', () => {
    expect(isAwaitingReview(BUILDING)).toBe(false);
  });
  it('an in_progress QF with a PR IS awaiting review', () => {
    expect(isAwaitingReview(AWAITING_REVIEW)).toBe(true);
  });
  it('an open (unclaimed) QF is NOT awaiting review, even with a stray pr_url', () => {
    expect(isAwaitingReview(OPEN)).toBe(false);
    expect(isAwaitingReview({ ...OPEN, pr_url: 'https://x' })).toBe(false);
  });
  it('is null-safe', () => {
    expect(isAwaitingReview(null)).toBe(false);
    expect(isAwaitingReview(undefined)).toBe(false);
  });
});

describe('deriveQfLifecycleState', () => {
  it('overrides in_progress with awaiting_review when a PR is set', () => {
    expect(deriveQfLifecycleState(AWAITING_REVIEW)).toBe('awaiting_review');
  });
  it('passes through in_progress unchanged when no PR is set', () => {
    expect(deriveQfLifecycleState(BUILDING)).toBe('in_progress');
  });
  it('passes through every other status unchanged (open/completed/cancelled/closed)', () => {
    for (const status of ['open', 'completed', 'cancelled', 'closed']) {
      expect(deriveQfLifecycleState({ status, pr_url: 'https://x' })).toBe(status);
    }
  });
});
