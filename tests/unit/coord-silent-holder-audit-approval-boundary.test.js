/**
 * QF-20260728-193 — the silent-holder audit (scripts/one-off/_coord-silent-holder-audit.cjs)
 * scored EVERY sd_key-holding session on signal age + work product, including a holder whose SD
 * is at an approval boundary (status=pending_approval, current_phase=LEAD_FINAL) — where zero
 * commits/signals is the CORRECT, EXPECTED shape because the worker is waiting on a human
 * decision, not stalled. Live false positive: Alpha (status=pending_approval,
 * current_phase=LEAD_FINAL, progress=90%, PR merged) tripped both audit axes hourly while
 * stale-session-sweep.cjs itself printed "awaiting LEAD-FINAL-APPROVAL" on the same tick.
 * isApprovalBoundarySd() mirrors that same skip condition.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isApprovalBoundarySd } = require('../../scripts/one-off/_coord-silent-holder-audit.cjs');

describe('isApprovalBoundarySd() (QF-20260728-193)', () => {
  it('excludes a status=pending_approval SD regardless of phase', () => {
    expect(isApprovalBoundarySd({ status: 'pending_approval', current_phase: 'EXEC' })).toBe(true);
  });

  it('excludes an SD in the LEAD_FINAL phase family (the measured live specimen)', () => {
    expect(isApprovalBoundarySd({ status: 'in_progress', current_phase: 'LEAD_FINAL' })).toBe(true);
    expect(isApprovalBoundarySd({ status: 'in_progress', current_phase: 'LEAD_FINAL_APPROVAL' })).toBe(true);
  });

  it('does NOT exclude an SD actively in EXEC/PLAN with no approval-boundary signal', () => {
    expect(isApprovalBoundarySd({ status: 'in_progress', current_phase: 'EXEC' })).toBe(false);
    expect(isApprovalBoundarySd({ status: 'in_progress', current_phase: 'PLAN' })).toBe(false);
  });

  it('fails safe (does not exclude) on missing/undefined fields', () => {
    expect(isApprovalBoundarySd({})).toBe(false);
    expect(isApprovalBoundarySd(undefined)).toBe(false);
  });

  it('does not match a phase that merely CONTAINS LEAD_FINAL mid-string (prefix-anchored)', () => {
    expect(isApprovalBoundarySd({ status: 'in_progress', current_phase: 'PRE_LEAD_FINAL' })).toBe(false);
  });
});

describe('module load sanity (QF-20260728-193)', () => {
  it('requiring the script does not auto-run the audit (require.main guard)', () => {
    // If the guard were missing, require() above would already have thrown/hung on a live
    // Supabase call in this unit-tier sandbox (fetch is refused for non-loopback URLs). Reaching
    // this line at all is the proof; this test exists to pin the guard, not just infer it.
    expect(typeof isApprovalBoundarySd).toBe('function');
  });
});
