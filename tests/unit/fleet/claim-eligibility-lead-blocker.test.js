/**
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: lead_blocker fail-closed axis (TS-1/TS-2/TS-3).
 *
 * Live incident: SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-G1 carries metadata.lead_blocker (a
 * LEAD circuit-breaker bubble-up marker) but claim-eligibility.cjs had no axis reading it -- only
 * needs_coordinator_review was checked, so a clear-review of a stale needs_coordinator_review flag
 * let the SD slip past the still-active lead_blocker (documented in the SD's own
 * metadata.coordinator_review_reason as "RE-FENCE #3").
 */
import { describe, it, expect } from 'vitest';

const { classifyDispatchIneligibility, classifyAllDispatchIneligibility, CLAIM_WRITE_FENCE_AXES, isLeadBlockerActive } =
  require('../../../lib/fleet/claim-eligibility.cjs');

describe('SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: isLeadBlockerActive (pure truthiness matrix)', () => {
  it('recognizes absent/null/false/empty-string/whitespace-string as INACTIVE', () => {
    expect(isLeadBlockerActive(undefined)).toBe(false);
    expect(isLeadBlockerActive(null)).toBe(false);
    expect(isLeadBlockerActive(false)).toBe(false);
    expect(isLeadBlockerActive('')).toBe(false);
    expect(isLeadBlockerActive('   ')).toBe(false);
  });

  it('treats the live G1 object shape as ACTIVE', () => {
    expect(isLeadBlockerActive({
      detail: '-G under-decomposed: api-only leaf, no UI/data-model leaf',
      reason: 'DECOMPOSITION_GAP / spec-conflict — LEAD circuit-breaker bubble-up',
    })).toBe(true);
  });

  it('FAIL-CLOSED: non-empty string, true, number, array, and empty object are all ACTIVE', () => {
    expect(isLeadBlockerActive('some reason')).toBe(true);
    expect(isLeadBlockerActive(true)).toBe(true);
    expect(isLeadBlockerActive(1)).toBe(true);
    expect(isLeadBlockerActive(0)).toBe(true); // ambiguous shape -> fail-closed, not "falsy = ok"
    expect(isLeadBlockerActive([])).toBe(true);
    expect(isLeadBlockerActive({})).toBe(true); // empty object is still a truthy, unrecognized shape
  });
});

describe('SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: claim-eligibility lead_blocker axis', () => {
  it('classifyDispatchIneligibility returns lead_blocker_active for the live G1 shape', () => {
    const row = {
      sd_key: 'SD-FIXTURE-LEAD-BLOCKER-001',
      sd_type: 'feature',
      status: 'draft',
      metadata: {
        lead_blocker: { detail: 'under-decomposed', reason: 'DECOMPOSITION_GAP / spec-conflict' },
        needs_coordinator_review: false, // the exact live bug: ncr cleared, lead_blocker still active
      },
    };
    expect(classifyDispatchIneligibility(row)).toBe('lead_blocker_active');
  });

  it('falls through cleanly when lead_blocker is absent/false', () => {
    const row = { sd_key: 'SD-FIXTURE-LEAD-BLOCKER-002', sd_type: 'feature', status: 'draft', metadata: {} };
    expect(classifyDispatchIneligibility(row)).toBeNull();
    const rowFalse = { sd_key: 'SD-FIXTURE-LEAD-BLOCKER-003', sd_type: 'feature', status: 'draft', metadata: { lead_blocker: false } };
    expect(classifyDispatchIneligibility(rowFalse)).toBeNull();
  });

  it('classifyAllDispatchIneligibility surfaces lead_blocker_active alongside other axes', () => {
    const row = {
      sd_key: 'SD-FIXTURE-LEAD-BLOCKER-004',
      sd_type: 'feature',
      status: 'draft',
      metadata: { lead_blocker: 'blocked pending re-decomposition', needs_coordinator_review: true },
    };
    const all = classifyAllDispatchIneligibility(row);
    expect(all).toContain('lead_blocker_active');
    expect(all).toContain('needs_coordinator_review');
  });

  it('CLAIM_WRITE_FENCE_AXES includes lead_blocker_active', () => {
    expect(CLAIM_WRITE_FENCE_AXES.has('lead_blocker_active')).toBe(true);
  });
});
