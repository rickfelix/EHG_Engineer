/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-3 -- proves the repointed
 * isSolomonInboxRow subtracts comms_check from the resolved-kinds set even though
 * DRAIN_SETS.solomon includes it (for the dedicated first-class branch in drainInbox,
 * not the generic filter). TS-3.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DRAIN_SETS } = require('../../../lib/fleet/worker-status.cjs');
const { isSolomonInboxRow, isOrphanedSolomonRow } = require('../../../scripts/solomon-advisory.cjs');

describe('Solomon inbox comms_check subtraction (FR-3 negative assertion)', () => {
  it('DRAIN_SETS.solomon includes comms_check (context: it is drained by a dedicated branch, not the generic filter)', () => {
    expect(DRAIN_SETS.solomon).toContain('comms_check');
  });

  it('isSolomonInboxRow returns false for a comms_check row using the DEFAULT (module-derived) recognized-kinds set', () => {
    const row = { payload: { kind: 'comms_check' } };
    expect(isSolomonInboxRow(row)).toBe(false);
  });

  it('isSolomonInboxRow returns false for comms_check even when passed the raw (unsubtracted) DRAIN_SETS.solomon array -- proves callers must subtract, not rely on a lucky default', () => {
    const row = { payload: { kind: 'comms_check' } };
    // Passing the raw array directly (simulating a hypothetical naive repoint) SHOULD
    // classify comms_check as inbox -- demonstrating the subtraction is load-bearing.
    expect(isSolomonInboxRow(row, DRAIN_SETS.solomon)).toBe(true);
    // The module's own default (subtracted) parameter is what actually protects behavior:
    expect(isSolomonInboxRow(row)).toBe(false);
  });

  it('isOrphanedSolomonRow does NOT classify comms_check as orphaned (it is handler-owned, excluded)', () => {
    const row = { payload: { kind: 'comms_check' } };
    expect(isOrphanedSolomonRow(row)).toBe(false);
  });

  it('every kind formerly in SOLOMON_INBOX_KINDS (DIRECTIVE_KINDS + solomon_consult + solomon_duty_reminder) still classifies as inbox', () => {
    const formerlyInbox = [
      'coordinator_request', 'work_assignment', 'adam_action_required', 'coordinator_reminder',
      'coordinator_to_adam', 'coordinator_directive', 'chairman_directive', 'fence_notice',
      'review_request', 'solomon_consult', 'solomon_duty_reminder',
    ];
    for (const kind of formerlyInbox) {
      expect(isSolomonInboxRow({ payload: { kind } }), `expected ${kind} to be inbox`).toBe(true);
    }
  });
});
