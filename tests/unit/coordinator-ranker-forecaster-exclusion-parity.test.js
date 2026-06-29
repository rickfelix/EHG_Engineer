/**
 * SD-FDBK-INFRA-RANKER-FORECAST-EXCLUSION-PARITY-001
 *
 * The backlog-ranker and the capacity-forecaster must AGREE on excluding an un-actionable auto-filed
 * venture-remediation SD. Before this fix they used divergent detectors: the forecaster excluded via
 * isExcludedFromBelt -> isUnactionableRemediationSd, while the ranker demoted ONLY bare-shell stubs
 * (isBareShell), so a ~345-char SD-LEO-FIX-REMEDIATION-* stub targeting a venture earned a real
 * dispatch_rank above a walk-blocker. The fix lifts the SAME shared predicate into the ranker's
 * claimableDbFreeReason, so both paths exclude the same rows by construction (SSOT).
 *
 * NOTE (spec reconciliation, signal 2cde0ce8): the SD's FR-1 described a 'generated_by fr-c' criterion,
 * but the forecaster's ACTUAL detector is the key-prefix + non-EHG_Engineer-target isUnactionableRemediationSd.
 * Parity (FR-4) requires the SAME predicate in both paths, so this test pins parity on the existing
 * shared predicate rather than a divergent new one.
 */
import { describe, it, expect } from 'vitest';
import { claimableDbFreeReason } from '../../scripts/coordinator-backlog-rank.mjs';
import { isExcludedFromBelt, isUnactionableRemediationSd, isBareShell } from '../../lib/coordinator/sd-exclusion.mjs';

// An un-actionable auto-filed venture-remediation SD: canonical remediation key + a NON-EHG_Engineer
// target (the venture repo). 345-char description => NOT bare-shell (that was the gap).
const ventureRemediationStub = {
  sd_key: 'SD-LEO-FIX-REMEDIATION-UNIT-TEST-006',
  sd_type: 'infrastructure',
  status: 'draft',
  current_phase: 'LEAD',
  claiming_session_id: null,
  target_application: 'EHG',
  description: 'x'.repeat(345),
  title: 'Remediate unit_test findings',
  metadata: {},
};

// A genuine scoped harness SD targeting the fleet's own checkout.
const genuineScoped = {
  sd_key: 'SD-LEO-INFRA-GENUINE-SCOPED-001',
  sd_type: 'infrastructure',
  status: 'draft',
  current_phase: 'LEAD',
  claiming_session_id: null,
  target_application: 'EHG_Engineer',
  description: 'A fully authored strategic directive with real scope and acceptance criteria.',
  title: 'Genuine scoped SD',
  metadata: {},
};

describe('FR-4: ranker + forecaster agree on un-actionable venture-remediation exclusion', () => {
  it('the venture-remediation stub is excluded by BOTH paths (parity)', () => {
    // forecaster path
    expect(isExcludedFromBelt(ventureRemediationStub)).toBe(true);
    // ranker path
    expect(claimableDbFreeReason(ventureRemediationStub)).toBe('unactionable_venture_remediation');
    // both via the same shared predicate
    expect(isUnactionableRemediationSd(ventureRemediationStub)).toBe(true);
  });

  it('a genuine scoped SD is excluded by NEITHER path', () => {
    expect(isExcludedFromBelt(genuineScoped)).toBe(false);
    expect(claimableDbFreeReason(genuineScoped)).toBeNull();
    expect(isUnactionableRemediationSd(genuineScoped)).toBe(false);
  });

  it('a remediation SD targeting EHG_Engineer (actionable) is NOT excluded', () => {
    const selfTargeted = { ...ventureRemediationStub, sd_key: 'SD-LEO-FIX-REMEDIATION-LINT-009', target_application: 'EHG_Engineer' };
    expect(isUnactionableRemediationSd(selfTargeted)).toBe(false);
    expect(claimableDbFreeReason(selfTargeted)).toBeNull();
    expect(isExcludedFromBelt(selfTargeted)).toBe(false);
  });
});

describe('isBareShell behavior unchanged', () => {
  it('empty description => bare-shell', () => {
    expect(isBareShell({ description: '', title: 'T' })).toBe(true);
  });
  it('description equal to title => bare-shell', () => {
    expect(isBareShell({ description: 'Same', title: 'Same' })).toBe(true);
  });
  it('authored description => NOT bare-shell (incl. the 345-char remediation stub)', () => {
    expect(isBareShell(genuineScoped)).toBe(false);
    expect(isBareShell(ventureRemediationStub)).toBe(false);
  });
});
