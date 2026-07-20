/**
 * SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B) FR-1 -- reconcile DRAIN_SETS.adam
 * with scripts/adam-advisory.cjs's ADAM_INBOX_KINDS before FR-2 repoints the inbox
 * onto the registry-reader. TS-1.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DRAIN_SETS } = require('../../../lib/fleet/worker-status.cjs');

// Mirrors scripts/adam-advisory.cjs's ADAM_INBOX_KINDS spread (DIRECTIVE_KINDS + these).
// Not importing the module directly to avoid pulling in its Supabase-touching top level;
// this is the same allowlist the file documents, kept as a literal for pin purposes.
const DIRECTIVE_KINDS = [
  'coordinator_request', 'work_assignment', 'adam_action_required', 'coordinator_reminder',
  'coordinator_to_adam', 'coordinator_directive', 'chairman_directive', 'fence_notice', 'review_request',
];
const ADAM_INBOX_KINDS = [
  ...DIRECTIVE_KINDS,
  'chairman_heads_up', 'chairman_handoff', 'coordinator_advisory', 'coordinator_adam_feedback',
  'assist_request', 'reconcile_consult', 'coordinator_source_request', 'coordinator_review', 'adam_advisory',
];

describe('DRAIN_SETS.adam reconciliation with ADAM_INBOX_KINDS (TS-1)', () => {
  it('DRAIN_SETS.adam is a superset of every kind in ADAM_INBOX_KINDS', () => {
    for (const kind of ADAM_INBOX_KINDS) {
      expect(DRAIN_SETS.adam, `DRAIN_SETS.adam missing kind: ${kind}`).toContain(kind);
    }
  });

  it('DRAIN_SETS.adam grew by exactly 8 kinds (the reconciliation), no other role changed', () => {
    // Pre-reconciliation counts (captured before FR-1 landed): solomon=12, coordinator=16, worker=17.
    // adam was 14 before FR-1 (DIRECTIVE_KINDS(9) + ADAM_ADVISORY + COORDINATOR_REPLY + CANARY_REQUEST
    // + comms_check + CROSS_PARTY_PING), now 22.
    expect(DRAIN_SETS.adam.length).toBe(22);
    expect(DRAIN_SETS.solomon.length).toBe(12);
    expect(DRAIN_SETS.coordinator.length).toBe(16);
    expect(DRAIN_SETS.worker.length).toBe(17);
  });

  it('the 8 reconciled kinds are present in DRAIN_SETS.adam', () => {
    const reconciled = [
      'chairman_heads_up', 'chairman_handoff', 'coordinator_advisory', 'coordinator_adam_feedback',
      'assist_request', 'reconcile_consult', 'coordinator_source_request', 'coordinator_review',
    ];
    for (const kind of reconciled) {
      expect(DRAIN_SETS.adam).toContain(kind);
    }
  });
});
