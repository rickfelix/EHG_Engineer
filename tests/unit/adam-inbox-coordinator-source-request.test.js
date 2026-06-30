/**
 * SD-LEO-INFRA-ADAM-INBOX-KINDS-SOURCE-REQUEST-001 — the coordinator belt-low source-to-capacity
 * handshake (payload.kind='coordinator_source_request') must drain through the NORMAL Adam inbox lane,
 * not the degraded orphan/visibility-recovery fallback. This pins the kind in the ADAM_INBOX_KINDS
 * allowlist so a future edit cannot silently drop the lane.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../../scripts/adam-advisory.cjs';

const { isAdamInboxRow, isOrphanedAdamRow, ADAM_INBOX_KINDS } = pkg;

const row = (kind) => (kind === undefined ? { payload: {} } : { payload: { kind } });

describe('Adam inbox drains coordinator_source_request (belt-low handshake)', () => {
  it('coordinator_source_request is in the Adam-scoped allowlist', () => {
    expect(ADAM_INBOX_KINDS).toContain('coordinator_source_request');
  });

  it('isAdamInboxRow classifies a coordinator_source_request row as drainable (typed lane)', () => {
    expect(isAdamInboxRow(row('coordinator_source_request'))).toBe(true);
  });

  it('isOrphanedAdamRow is FALSE for it (consumed by the normal drain, NOT the orphan fallback)', () => {
    expect(isOrphanedAdamRow(row('coordinator_source_request'))).toBe(false);
  });

  it('an unknown coordinator kind is still orphaned (the fix is scoped to this one kind)', () => {
    expect(isAdamInboxRow(row('coordinator_unknown_kind'))).toBe(false);
    expect(isOrphanedAdamRow(row('coordinator_unknown_kind'))).toBe(true);
  });

  it('still drains the sibling Adam-directed kinds (regression)', () => {
    expect(isAdamInboxRow(row('coordinator_advisory'))).toBe(true);
    expect(isAdamInboxRow(row('coordinator_adam_feedback'))).toBe(true);
  });
});
