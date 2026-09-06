// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-2/FR-3.
//
// Reproduces and closes the confirmed live defect: a genuinely bypassed LEAD-FINAL-APPROVAL was
// recorded validation_passed=true with no bypass marker at all on the canonical sd_phase_handoffs
// row (specimen: SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001, row 987bfd16-0eb8-4c68-9729-9ac032872317,
// vs the correctly-stamped leo_handoff_executions row 4b8cb8fa-64b3-42c0-9667-f6fbc1c78727 for the
// SAME approval). These pure functions are directly testable without driving executeSpecific()'s
// full DB-touching completion cascade -- mirrors lead-final-gate-results-persistence.test.js's
// existing pattern for projectGateResultsForPersistence.
import { describe, it, expect } from 'vitest';
import { deriveCanonicalLfaFields, deriveReconciledLfaFields } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

describe('deriveCanonicalLfaFields', () => {
  it('non-bypassed: validation_passed=true, score_source=measured, no bypass key', () => {
    const result = deriveCanonicalLfaFields(null);
    expect(result).toEqual({ validation_passed: true, score_source: 'measured', bypass: null });
  });

  it('bypassed: validation_passed=false, score_source=bypassed, bypass populated -- reproduces the fixed defect', () => {
    const bypassInfo = {
      reason: 'PR_MERGE_VERIFICATION false positive',
      gates: ['PR_MERGE_VERIFICATION'],
      source: 'cli',
      patternId: null,
      followupSdKey: 'SD-LEO-INFRA-WIDEN-BRANCH-TYPE-001',
      selfAuthorshipCheckStatus: 'cleared',
    };
    const result = deriveCanonicalLfaFields(bypassInfo);

    expect(result.validation_passed).toBe(false);
    expect(result.score_source).toBe('bypassed');
    expect(result.bypass).toMatchObject({
      reason: 'PR_MERGE_VERIFICATION false positive',
      gates: ['PR_MERGE_VERIFICATION'],
      actor: 'cli',
      followup_sd_key: 'SD-LEO-INFRA-WIDEN-BRANCH-TYPE-001',
      self_authorship_check_status: 'cleared',
    });
  });

  it('never returns validation_passed=true when bypassed -- the single invariant this whole fix exists to enforce', () => {
    const result = deriveCanonicalLfaFields({ reason: null, gates: [], source: 'cli' });
    expect(result.validation_passed).toBe(false);
  });
});

describe('deriveReconciledLfaFields', () => {
  it('no sibling row: falls back to measured/not_measured, no bypass', () => {
    expect(deriveReconciledLfaFields(null, true)).toEqual({ validation_passed: true, score_source: 'measured', bypass: null });
    expect(deriveReconciledLfaFields(null, false)).toEqual({ validation_passed: true, score_source: 'not_measured', bypass: null });
  });

  it('copies validation_passed=true/score_source from a genuine non-bypassed sibling row', () => {
    const srcRow = { validation_passed: true, validation_details: { score_source: 'measured' } };
    expect(deriveReconciledLfaFields(srcRow, true)).toEqual({ validation_passed: true, score_source: 'measured', bypass: null });
  });

  it('copies validation_passed=false + bypass from a genuine bypassed sibling row -- never hardcodes true', () => {
    const srcRow = {
      validation_passed: false,
      validation_details: { score_source: 'bypassed', bypass: { reason: 'x', actor: 'cli', gates: ['G'], bypassed_at: '2026-01-01T00:00:00Z' } },
    };
    const result = deriveReconciledLfaFields(srcRow, true);
    expect(result.validation_passed).toBe(false);
    expect(result.score_source).toBe('bypassed');
    expect(result.bypass).toEqual(srcRow.validation_details.bypass);
  });

  it('falls back to measured/not_measured when the sibling row has no score_source recorded', () => {
    const srcRow = { validation_passed: true, validation_details: {} };
    expect(deriveReconciledLfaFields(srcRow, false).score_source).toBe('not_measured');
  });
});
