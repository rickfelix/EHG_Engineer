/**
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001: durable time-gated defer for quick_fixes.
 *
 * A QF that is genuinely not ready yet (e.g. needs a clean 24h observation window) has
 * status='open' but not_before set to a future timestamp. isAutoStartableQF() -- shared by
 * both worker-checkin.cjs self-claim picker paths (selfClaimQuickFix + the critical-QF-jump
 * path via isCriticalQfJumpEligible) -- must exclude such rows until not_before passes, so
 * the same worker doesn't get re-assigned it every check-in cycle (QF-20260704-348 thrashed
 * 2x within ~15 minutes before this fix).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isAutoStartableQF, isCriticalQfJumpEligible } = require('../../scripts/worker-checkin.cjs');

const NOW = Date.parse('2026-07-05T12:00:00Z');
const PAST = '2026-07-05T00:00:00Z';
const FUTURE = '2026-07-05T21:00:00Z';

function qf(overrides = {}) {
  return {
    id: 'QF-X',
    status: 'open',
    pr_url: null,
    commit_sha: null,
    created_at: '2026-07-04T00:00:00Z',
    routing_tier: null,
    title: 'x',
    severity: 'medium',
    not_before: null,
    ...overrides,
  };
}

describe('isAutoStartableQF — not_before durable time-gated defer', () => {
  it('excludes a QF with not_before in the future', () => {
    expect(isAutoStartableQF(qf({ not_before: FUTURE }), NOW)).toBe(false);
  });

  it('includes a QF with not_before in the past', () => {
    expect(isAutoStartableQF(qf({ not_before: PAST }), NOW)).toBe(true);
  });

  it('includes a QF with not_before null (no regression to pre-existing behavior)', () => {
    expect(isAutoStartableQF(qf({ not_before: null }), NOW)).toBe(true);
  });

  it('includes a QF with not_before exactly equal to now (gate has passed)', () => {
    expect(isAutoStartableQF(qf({ not_before: new Date(NOW).toISOString() }), NOW)).toBe(true);
  });

  it('a malformed not_before value does not crash the predicate (fail-open to other checks)', () => {
    expect(() => isAutoStartableQF(qf({ not_before: 'not-a-date' }), NOW)).not.toThrow();
  });
});

describe('isCriticalQfJumpEligible — inherits the not_before guard via isAutoStartableQF', () => {
  it('excludes a critical, aged QF gated by a future not_before', () => {
    const gracedCritical = qf({
      severity: 'critical',
      created_at: '2026-07-05T00:00:00Z', // well past the 10min grace window relative to NOW
      not_before: FUTURE,
    });
    expect(isCriticalQfJumpEligible(gracedCritical, NOW)).toBe(false);
  });

  it('still allows a critical, aged QF with no not_before gate', () => {
    const gracedCritical = qf({
      severity: 'critical',
      created_at: '2026-07-05T00:00:00Z',
      not_before: null,
    });
    expect(isCriticalQfJumpEligible(gracedCritical, NOW)).toBe(true);
  });
});
