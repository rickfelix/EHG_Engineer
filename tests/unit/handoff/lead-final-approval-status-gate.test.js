/**
 * Regression tests for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-4.
 *
 * Covers the fail-fast status pre-gate in LEAD-FINAL-APPROVAL setup():
 *   - Draft SD → DRAFT_SD_NOT_APPROVED rejection BEFORE any gate runs (AC-1, AC-4)
 *   - Error message contains current status + expected status + remediation command (AC-2)
 *   - pending_approval SD → proceeds (returns null from setup()) (AC-3)
 *   - completed SD → idempotent path (allows re-approval)
 *
 * Addresses PAT-RETRO-LEADFINALAPPROVAL-d94c34d8 (3 occurrences): 60-120s per
 * attempt wasted running gates on draft SDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadFinalApprovalExecutor } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

function makeExecutor({ completedHandoffs = [] } = {}) {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: completedHandoffs, error: null })
        })
      })
    })
  };
  return new LeadFinalApprovalExecutor({
    supabase,
    prdRepo: { findBySdId: async () => null }
  });
}

describe('LEAD-FINAL-APPROVAL setup() status pre-gate (FR-4)', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('AC-1 + AC-4: draft SD is rejected with DRAFT_SD_NOT_APPROVED code before any gate runs', async () => {
    const executor = makeExecutor();
    const sd = { id: 'sd-uuid-1', sd_key: 'SD-TEST-001', status: 'draft', sd_type: 'infrastructure' };
    const options = {};

    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).toBeTruthy();
    expect(result.success).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.reasonCode).toBe('DRAFT_SD_NOT_APPROVED');
    // Pre-gate log must be emitted BEFORE any rejection-reason log.
    const logCalls = logSpy.mock.calls.map(c => String(c[0] || ''));
    const preGateIndex = logCalls.findIndex(l => l.includes('Pre-gate'));
    const rejectIndex = logCalls.findIndex(l => l.includes("status is 'draft'"));
    expect(preGateIndex).toBeGreaterThanOrEqual(0);
    expect(rejectIndex).toBeGreaterThan(preGateIndex);
  });

  it('AC-2: rejection message contains current status, expected status, and remediation command', async () => {
    const executor = makeExecutor();
    const sd = { id: 'sd-uuid-2', sd_key: 'SD-TEST-002', status: 'draft', sd_type: 'feature' };

    const result = await executor.setup('SD-TEST-002', sd, {});

    expect(result.message).toContain("current: 'draft'");
    expect(result.message).toContain("pending_approval");
    expect(result.message).toContain('PLAN-TO-LEAD');
    expect(result.details.currentStatus).toBe('draft');
    expect(result.details.requiredStatus).toBe('pending_approval');
    expect(result.details.nextCommand).toBe('node scripts/handoff.js execute PLAN-TO-LEAD SD-TEST-002');
  });

  it('AC-3: pending_approval SD proceeds (setup returns null — no regression)', async () => {
    const executor = makeExecutor();
    const sd = { id: 'sd-uuid-3', sd_key: 'SD-TEST-003', status: 'pending_approval', sd_type: 'feature' };
    const options = {};

    const result = await executor.setup('SD-TEST-003', sd, options);

    expect(result).toBeNull();
    expect(options._sd).toBe(sd);
    expect(options._alreadyCompleted).toBeUndefined();
  });

  it('completed SD takes idempotent path (options._alreadyCompleted set, setup returns null)', async () => {
    const executor = makeExecutor();
    const sd = { id: 'sd-uuid-4', sd_key: 'SD-TEST-004', status: 'completed', sd_type: 'feature' };
    const options = {};

    const result = await executor.setup('SD-TEST-004', sd, options);

    expect(result).toBeNull();
    expect(options._alreadyCompleted).toBe(true);
  });

  it('other non-pending_approval statuses (e.g. active) fall through to INVALID_STATUS diagnostic path', async () => {
    const executor = makeExecutor();
    const sd = { id: 'sd-uuid-5', sd_key: 'SD-TEST-005', status: 'active', sd_type: 'infrastructure' };

    const result = await executor.setup('SD-TEST-005', sd, {});

    expect(result.rejected).toBe(true);
    expect(result.reasonCode).toBe('INVALID_STATUS');
    expect(result.details.currentStatus).toBe('active');
  });
});
