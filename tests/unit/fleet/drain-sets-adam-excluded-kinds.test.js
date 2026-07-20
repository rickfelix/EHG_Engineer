/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-2 -- proves the repointed
 * isAdamInboxRow/isOrphanedAdamRow subtract ADAM_EXCLUDED_KINDS from the resolved
 * set even though DRAIN_SETS.adam includes them (handler-owned rows a dedicated
 * responder owns, not the generic inbox). TS-2 negative assertion.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DRAIN_SETS, ADAM_EXCLUDED_KINDS } = require('../../../lib/fleet/worker-status.cjs');
const { isAdamInboxRow, isOrphanedAdamRow } = require('../../../scripts/adam-advisory.cjs');

describe('Adam inbox ADAM_EXCLUDED_KINDS subtraction (FR-2 negative assertion)', () => {
  it('DRAIN_SETS.adam includes canary_request/comms_check/cross_party_ping (context: handler-owned, drained elsewhere)', () => {
    expect(DRAIN_SETS.adam).toContain('canary_request');
    expect(DRAIN_SETS.adam).toContain('comms_check');
    expect(DRAIN_SETS.adam).toContain('cross_party_ping');
  });

  it('isAdamInboxRow returns false for every ADAM_EXCLUDED_KINDS kind using the DEFAULT (module-derived) recognized-kinds set', () => {
    for (const kind of ['canary_request', 'comms_check', 'cross_party_ping']) {
      expect(isAdamInboxRow({ payload: { kind } }), `expected ${kind} to be NON-inbox`).toBe(false);
    }
  });

  it('isAdamInboxRow WOULD classify canary_request/comms_check/cross_party_ping as inbox if passed the raw (unsubtracted) DRAIN_SETS.adam array -- proves the subtraction is load-bearing, not a no-op', () => {
    for (const kind of ['canary_request', 'comms_check', 'cross_party_ping']) {
      expect(isAdamInboxRow({ payload: { kind } }, DRAIN_SETS.adam), `raw array should classify ${kind} as inbox`).toBe(true);
    }
  });

  it('isOrphanedAdamRow does NOT classify excluded kinds as orphaned (handler-owned, never touched)', () => {
    for (const kind of ADAM_EXCLUDED_KINDS) {
      expect(isOrphanedAdamRow({ payload: { kind } }), `expected ${kind} to not be orphaned`).toBe(false);
    }
  });

  it('every kind formerly in ADAM_INBOX_KINDS (DIRECTIVE_KINDS + reconciled 8 + adam_advisory) still classifies as inbox', () => {
    const formerlyInbox = [
      'coordinator_request', 'work_assignment', 'adam_action_required', 'coordinator_reminder',
      'coordinator_to_adam', 'coordinator_directive', 'chairman_directive', 'fence_notice', 'review_request',
      'chairman_heads_up', 'chairman_handoff', 'coordinator_advisory', 'coordinator_adam_feedback',
      'assist_request', 'reconcile_consult', 'coordinator_source_request', 'coordinator_review', 'adam_advisory',
    ];
    for (const kind of formerlyInbox) {
      expect(isAdamInboxRow({ payload: { kind } }), `expected ${kind} to be inbox`).toBe(true);
    }
  });
});
