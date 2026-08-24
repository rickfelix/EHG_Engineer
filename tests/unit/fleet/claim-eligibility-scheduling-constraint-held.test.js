/**
 * SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-1/FR-3/FR-4 (TS-1, TS-2, TS-3):
 * metadata.scheduling_constraint fail-closed "held" axis.
 *
 * Live incident: SD-LEO-FEAT-EVA-VENTURE-IDEATION-001 carries metadata.scheduling_constraint
 * (a chairman W6-ruling narrative hold — {note, source}, no structured resolution condition) but
 * classifyDispatchIneligibility had no axis reading it — zero code readers anywhere in the
 * codebase (confirmed by repo-wide grep, LEAD phase). The SD stayed claimable indefinitely.
 */
import { describe, it, expect } from 'vitest';

const {
  classifyDispatchIneligibility,
  classifyAllDispatchIneligibility,
  CLAIM_WRITE_FENCE_AXES,
  isSchedulingConstraintActive,
} = require('../../../lib/fleet/claim-eligibility.cjs');
const { claimableDbFreeReason } = require('../../../scripts/lib/claimable-leaves.mjs');

describe('SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001: isSchedulingConstraintActive (pure truthiness matrix)', () => {
  it('recognizes absent/null/false/empty-string/empty-object as INACTIVE', () => {
    expect(isSchedulingConstraintActive(undefined)).toBe(false);
    expect(isSchedulingConstraintActive(null)).toBe(false);
    expect(isSchedulingConstraintActive(false)).toBe(false);
    expect(isSchedulingConstraintActive('')).toBe(false);
    expect(isSchedulingConstraintActive('   ')).toBe(false);
    expect(isSchedulingConstraintActive({})).toBe(false);
  });

  it('treats the live specimen shape as ACTIVE (TS-1)', () => {
    // Real shape read from SD-LEO-FEAT-EVA-VENTURE-IDEATION-001.metadata.scheduling_constraint.
    expect(isSchedulingConstraintActive({
      note: 'post-W3-start (draft now; execution after W3 traversal starts)',
      source: 'w6_ruling on e09426eb, ruled_at 2026-08-22T11:01:57.994Z',
    })).toBe(true);
  });

  it('FAIL-CLOSED: non-empty string, true, number, array are all ACTIVE (never throws on an unanticipated shape)', () => {
    expect(isSchedulingConstraintActive('held pending chairman review')).toBe(true);
    expect(isSchedulingConstraintActive(true)).toBe(true);
    expect(isSchedulingConstraintActive(1)).toBe(true);
    expect(isSchedulingConstraintActive([])).toBe(true);
  });
});

describe('SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001: claim-eligibility scheduling_constraint axis', () => {
  it('classifyDispatchIneligibility returns scheduling_constraint_held for the live specimen shape (TS-1)', () => {
    const row = {
      sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-001',
      sd_type: 'feature',
      status: 'active',
      metadata: {
        scheduling_constraint: {
          note: 'post-W3-start (draft now; execution after W3 traversal starts)',
          source: 'w6_ruling on e09426eb, ruled_at 2026-08-22T11:01:57.994Z',
        },
      },
    };
    expect(classifyDispatchIneligibility(row)).toBe('scheduling_constraint_held');
  });

  it('falls through cleanly when scheduling_constraint is absent/false/empty (TS-2 — non-regression)', () => {
    const row = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-002', sd_type: 'feature', status: 'active', metadata: {} };
    expect(classifyDispatchIneligibility(row)).toBeNull();
    const rowFalse = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-003', sd_type: 'feature', status: 'active', metadata: { scheduling_constraint: false } };
    expect(classifyDispatchIneligibility(rowFalse)).toBeNull();
    const rowEmpty = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-004', sd_type: 'feature', status: 'active', metadata: { scheduling_constraint: {} } };
    expect(classifyDispatchIneligibility(rowEmpty)).toBeNull();
  });

  it('a malformed/legacy scheduling_constraint value never throws (TR-4)', () => {
    const rowString = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-005', sd_type: 'feature', status: 'active', metadata: { scheduling_constraint: 'legacy plain string' } };
    expect(() => classifyDispatchIneligibility(rowString)).not.toThrow();
    expect(classifyDispatchIneligibility(rowString)).toBe('scheduling_constraint_held');
  });

  it('classifyAllDispatchIneligibility surfaces scheduling_constraint_held alongside other axes', () => {
    const row = {
      sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-006',
      sd_type: 'feature',
      status: 'active',
      metadata: { scheduling_constraint: { note: 'blocked' }, needs_coordinator_review: true },
    };
    const all = classifyAllDispatchIneligibility(row);
    expect(all).toContain('scheduling_constraint_held');
    expect(all).toContain('needs_coordinator_review');
  });

  it('CLAIM_WRITE_FENCE_AXES includes scheduling_constraint_held', () => {
    expect(CLAIM_WRITE_FENCE_AXES.has('scheduling_constraint_held')).toBe(true);
  });

  it('does not regress any other pre-existing axis outcome (TS-2 explicit non-regression)', () => {
    const orchestratorRow = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-007', sd_type: 'orchestrator', status: 'active', metadata: {} };
    expect(classifyDispatchIneligibility(orchestratorRow)).toBe('orchestrator_parent');
    const notBeforeRow = { sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-008', sd_type: 'feature', status: 'active', metadata: { not_before: '2099-01-01T00:00:00Z' } };
    expect(classifyDispatchIneligibility(notBeforeRow)).toBe('not_before_hold');
  });
});

describe('SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001: claimableDbFreeReason same-tick exclusion (TS-3)', () => {
  it('a held SD is excluded from claimableDbFreeReason() in the same tick the hold is set, no polling window', () => {
    const row = {
      sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-009',
      sd_type: 'feature',
      status: 'active',
      claiming_session_id: null,
      metadata: {
        scheduling_constraint: {
          note: 'post-W3-start (draft now; execution after W3 traversal starts)',
          source: 'w6_ruling on test, ruled_at 2026-08-24T00:00:00.000Z',
        },
      },
    };
    expect(claimableDbFreeReason(row)).toBe('scheduling_constraint_held');
  });

  it('an otherwise-claimable row without scheduling_constraint is unaffected', () => {
    const row = {
      sd_key: 'SD-FIXTURE-SCHEDULING-CONSTRAINT-010',
      sd_type: 'feature',
      status: 'active',
      claiming_session_id: null,
      metadata: {},
    };
    expect(claimableDbFreeReason(row)).toBeNull();
  });
});
