/**
 * QF-20260702-414 — coordinator_review and adam_advisory (from non-Adam senders addressing Adam
 * directly) must drain through the NORMAL Adam inbox lane, not the degraded orphan/visibility
 * fallback. Live data: 28 rows recirculated unchanged across 6+ drains before this fix. Mirrors
 * tests/unit/adam-inbox-coordinator-source-request.test.js's pinning pattern.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../../scripts/adam-advisory.cjs';

const { isAdamInboxRow, isOrphanedAdamRow, ADAM_INBOX_KINDS } = pkg;

const row = (kind) => (kind === undefined ? { payload: {} } : { payload: { kind } });

describe('Adam inbox drains coordinator_review + adam_advisory (recirculation fix)', () => {
  it('both kinds are in the Adam-scoped allowlist', () => {
    expect(ADAM_INBOX_KINDS).toContain('coordinator_review');
    expect(ADAM_INBOX_KINDS).toContain('adam_advisory');
  });

  it('isAdamInboxRow classifies both as drainable (typed lane)', () => {
    expect(isAdamInboxRow(row('coordinator_review'))).toBe(true);
    expect(isAdamInboxRow(row('adam_advisory'))).toBe(true);
  });

  it('isOrphanedAdamRow is FALSE for both (consumed by the normal drain, not the orphan fallback)', () => {
    expect(isOrphanedAdamRow(row('coordinator_review'))).toBe(false);
    expect(isOrphanedAdamRow(row('adam_advisory'))).toBe(false);
  });

  it('an unrelated unknown kind is still orphaned (the fix is scoped to these two kinds)', () => {
    expect(isAdamInboxRow(row('some_other_unregistered_kind'))).toBe(false);
    expect(isOrphanedAdamRow(row('some_other_unregistered_kind'))).toBe(true);
  });

  it('still drains the sibling Adam-directed kinds (regression)', () => {
    expect(isAdamInboxRow(row('coordinator_advisory'))).toBe(true);
    expect(isAdamInboxRow(row('coordinator_source_request'))).toBe(true);
  });
});
