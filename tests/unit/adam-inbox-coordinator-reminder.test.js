import { describe, it, expect } from 'vitest';
import pkg from '../../scripts/adam-advisory.cjs';

const { isAdamInboxRow, isDirectiveRow, ADAM_INBOX_KINDS } = pkg;

// SD-LEO-FEAT-ADAM-INBOX-CONSUMPTION-001 (regression guard): the coordinator hourly-review sends Adam a
// payload.kind='coordinator_reminder'. The reported "sits unread ~59m/hr" bug was a FALSE PREMISE — the
// kind has been drainable since #4610 (2026-06-10) because it lives in the shared DIRECTIVE_KINDS, which
// ADAM_INBOX_KINDS spreads in; live data confirmed 0 unread. This test PINS that non-obvious cross-module
// coupling so a future DIRECTIVE_KINDS edit can't silently break Adam's drain of the hourly reminder.
const row = (kind) => (kind === undefined ? { payload: {} } : { payload: { kind } });

describe('Adam inbox drains coordinator_reminder (inheritance guard)', () => {
  it('coordinator_reminder is in the Adam-scoped allowlist (via shared DIRECTIVE_KINDS)', () => {
    expect(ADAM_INBOX_KINDS).toContain('coordinator_reminder');
  });

  it('isAdamInboxRow classifies a coordinator_reminder row as drainable', () => {
    expect(isAdamInboxRow(row('coordinator_reminder'))).toBe(true);
  });

  it('still drains the other Adam-directed kinds (regression)', () => {
    expect(isAdamInboxRow(row('coordinator_advisory'))).toBe(true);
    expect(isAdamInboxRow(row('chairman_heads_up'))).toBe(true);
  });

  it('responder-owned / terminal kinds remain NON-drainable', () => {
    expect(isAdamInboxRow(row('comms_check'))).toBe(false);
    expect(isAdamInboxRow(row('ack'))).toBe(false);
    expect(isAdamInboxRow(row('canary_request'))).toBe(false);
  });

  it('untyped rows (no payload.kind) remain NON-drainable', () => {
    expect(isAdamInboxRow(row(undefined))).toBe(false);
    expect(isAdamInboxRow({})).toBe(false);
    expect(isAdamInboxRow(null)).toBe(false);
  });

  it('coordinator_reminder is a SHARED directive — that inheritance is exactly what makes Adam drain it', () => {
    // isDirectiveRow uses the imported DIRECTIVE_KINDS. coordinator_reminder IS in it (workers + Adam both
    // consume that lane); ADAM_INBOX_KINDS = [...DIRECTIVE_KINDS, ...] so Adam inherits it. If a future
    // edit removed it from DIRECTIVE_KINDS, BOTH this assertion and the drain above would fail — by design.
    expect(isDirectiveRow(row('coordinator_reminder'))).toBe(true);
  });
});
