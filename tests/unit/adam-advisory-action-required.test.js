/**
 * Unit tests — QF-20260621-174
 * Adam advisory lane: action-required vs status-relay partition predicate.
 *
 * The unactioned backlog reached 80+ rows (mostly belt-countdown status relays), burying
 * genuine action-required asks under the old LIMIT 20. isActionRequiredAdvisory lets the
 * render path partition the lane so action-required advisories surface un-truncated.
 * These tests pin the predicate (pure/total) — the dashboard render + LIMIT raise are
 * behavioural (covered by the QF smoke steps).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isActionRequiredAdvisory } = require('../../lib/coordinator/adam-advisory-store.cjs');

describe('isActionRequiredAdvisory (QF-20260621-174)', () => {
  it('is true when payload.expects_reply is set', () => {
    expect(isActionRequiredAdvisory({ payload: { expects_reply: true }, body: 'fyi only' })).toBe(true);
  });

  it('matches action phrasing in the body', () => {
    expect(isActionRequiredAdvisory({ body: 'ACTION REQUIRED: file the SD' })).toBe(true);
    expect(isActionRequiredAdvisory({ body: 'Please file a quick-fix for this' })).toBe(true);
    expect(isActionRequiredAdvisory({ body: 'chairman-priority ask' })).toBe(true);
    expect(isActionRequiredAdvisory({ body: 'needs a decision from you' })).toBe(true);
    expect(isActionRequiredAdvisory({ body: 'action requested' })).toBe(true);
  });

  it('matches action phrasing in the subject', () => {
    expect(isActionRequiredAdvisory({ subject: 'Action Requested', body: '' })).toBe(true);
  });

  it('is false for a passive belt-countdown status relay', () => {
    expect(isActionRequiredAdvisory({ body: 'belt at 7 SDs, countdown to refill in 3h' })).toBe(false);
    expect(isActionRequiredAdvisory({ body: 'status: sourcing nominal' })).toBe(false);
  });

  it('is total — never throws on odd input', () => {
    expect(isActionRequiredAdvisory(null)).toBe(false);
    expect(isActionRequiredAdvisory(undefined)).toBe(false);
    expect(isActionRequiredAdvisory('string')).toBe(false);
    expect(isActionRequiredAdvisory({})).toBe(false);
    expect(isActionRequiredAdvisory({ payload: null })).toBe(false);
    expect(isActionRequiredAdvisory({ payload: { expects_reply: false } })).toBe(false);
  });
});
