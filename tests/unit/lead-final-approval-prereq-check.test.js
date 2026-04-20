/**
 * Unit Tests: Prerequisite Chain Diagnostic in LEAD-FINAL-APPROVAL setup()
 * SD: SD-LEARN-FIX-ADDRESS-PAT-RETRO-002
 *
 * Verifies that when LEAD-FINAL-APPROVAL is attempted with wrong SD status,
 * the error includes which prerequisite handoffs are missing and the exact
 * remediation command.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test setup() indirectly by importing the executor and calling setup()
// with mock supabase clients.

function makeSupabaseMock(completedHandoffs = []) {
  return {
    from: (table) => {
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: function () { return this; },
            then: undefined,
            // Chain eq calls
            data: completedHandoffs.map(h => ({ handoff_type: h })),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }) };
    },
  };
}

// Build a chainable supabase mock
function buildSupabaseMock(completedHandoffs = []) {
  const handoffData = completedHandoffs.map(h => ({ handoff_type: h }));
  return {
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        data: handoffData,
        error: null,
      };
      // Make it thenable for async
      chain.then = (resolve) => resolve({ data: handoffData, error: null });
      return chain;
    },
  };
}

describe('LEAD-FINAL-APPROVAL Prerequisite Chain Diagnostic', () => {
  let LeadFinalApprovalExecutor;

  beforeEach(async () => {
    // Dynamic import to get the class
    const mod = await import('../../scripts/modules/handoff/executors/lead-final-approval/index.js');
    LeadFinalApprovalExecutor = mod.LeadFinalApprovalExecutor;
  });

  it('should include missing handoffs when status is draft with no handoffs', async () => {
    const supabase = buildSupabaseMock([]);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'draft', sd_type: 'feature' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).not.toBeNull();
    expect(result.reasonCode).toBe('INVALID_STATUS');
    expect(result.message).toContain('Missing handoffs');
    expect(result.message).toContain('LEAD-TO-PLAN');
    expect(result.details.missingHandoffs).toBeInstanceOf(Array);
    expect(result.details.missingHandoffs.length).toBeGreaterThan(0);
  });

  it('should show only remaining missing handoffs when some are completed', async () => {
    const supabase = buildSupabaseMock(['LEAD-TO-PLAN', 'PLAN-TO-EXEC']);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'draft', sd_type: 'feature' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).not.toBeNull();
    expect(result.details.missingHandoffs).toContain('EXEC-TO-PLAN');
    expect(result.details.missingHandoffs).not.toContain('LEAD-TO-PLAN');
  });

  it('should provide remediation command for next missing handoff', async () => {
    const supabase = buildSupabaseMock(['LEAD-TO-PLAN']);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'draft', sd_type: 'feature' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).not.toBeNull();
    expect(result.details.nextCommand).toBe('node scripts/handoff.js execute PLAN-TO-EXEC SD-TEST-001');
    expect(result.message).toContain('PLAN-TO-EXEC');
  });

  it('should pass when status is pending_approval', async () => {
    const supabase = buildSupabaseMock([]);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'pending_approval', sd_type: 'feature' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    // null means setup passed
    expect(result).toBeNull();
  });

  it('should handle completed status idempotently', async () => {
    const supabase = buildSupabaseMock([]);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'completed', sd_type: 'feature' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).toBeNull();
    expect(options._alreadyCompleted).toBe(true);
  });

  it('should use infrastructure workflow for infrastructure SDs', async () => {
    const supabase = buildSupabaseMock([]);
    const executor = new LeadFinalApprovalExecutor({ supabase });
    executor.supabase = supabase;

    const sd = { id: 'uuid-123', sd_key: 'SD-TEST-001', status: 'draft', sd_type: 'infrastructure' };
    const options = {};
    const result = await executor.setup('SD-TEST-001', sd, options);

    expect(result).not.toBeNull();
    // Infrastructure workflow doesn't include EXEC-TO-PLAN
    expect(result.details.missingHandoffs).not.toContain('EXEC-TO-PLAN');
    expect(result.details.missingHandoffs).toContain('LEAD-TO-PLAN');
  });
});
