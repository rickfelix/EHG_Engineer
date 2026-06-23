/**
 * SD-REFILL-00SO4HZY: an orchestrator CHILD must not be dispatched until its PARENT passes LEAD.
 * parentLeadPending(sb, sd) is the shared gate (used by evaluateDispatchEligibility for baselined
 * candidates and by worker-checkin's draft self-claim path). It returns true ONLY when the parent
 * exists, is not completed, and is still in a pre-LEAD-pass phase (LEAD / LEAD_APPROVAL). Fail-open.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parentLeadPending } = require('../../lib/fleet/claim-eligibility.cjs');

// Mock supabase: .from(...).select(...).or(...).maybeSingle() resolves to { data, error }.
function mkSb(result) {
  return {
    from() {
      const q = {
        select() { return q; },
        or() { return q; },
        maybeSingle() { return Promise.resolve(result); },
      };
      return q;
    },
  };
}

describe('SD-REFILL-00SO4HZY: parentLeadPending', () => {
  it('returns false for an SD with no parent (not an orchestrator child)', async () => {
    const sb = mkSb({ data: null, error: null });
    expect(await parentLeadPending(sb, { parent_sd_id: null })).toBe(false);
    expect(await parentLeadPending(sb, {})).toBe(false);
  });

  it('returns TRUE when the parent is pre-LEAD-pass (draft @ LEAD) — child must NOT be claimed', async () => {
    const sb = mkSb({ data: { status: 'draft', current_phase: 'LEAD' }, error: null });
    expect(await parentLeadPending(sb, { parent_sd_id: 'SD-PARENT-001' })).toBe(true);
  });

  it('returns TRUE for a parent at LEAD_APPROVAL (case-insensitive)', async () => {
    const sb = mkSb({ data: { status: 'draft', current_phase: 'lead_approval' }, error: null });
    expect(await parentLeadPending(sb, { parent_sd_id: 'SD-PARENT-001' })).toBe(true);
  });

  it('returns false once the parent has PASSED LEAD (current_phase = PLAN)', async () => {
    const sb = mkSb({ data: { status: 'in_progress', current_phase: 'PLAN' }, error: null });
    expect(await parentLeadPending(sb, { parent_sd_id: 'SD-PARENT-001' })).toBe(false);
  });

  it('returns false when the parent is completed (children fully workable)', async () => {
    const sb = mkSb({ data: { status: 'completed', current_phase: 'COMPLETED' }, error: null });
    expect(await parentLeadPending(sb, { parent_sd_id: 'SD-PARENT-001' })).toBe(false);
  });

  it('fail-open: a query error or missing parent never strands the child', async () => {
    expect(await parentLeadPending(mkSb({ data: null, error: { message: 'boom' } }), { parent_sd_id: 'SD-X' })).toBe(false);
    expect(await parentLeadPending(mkSb({ data: null, error: null }), { parent_sd_id: 'SD-GONE' })).toBe(false);
  });
});
