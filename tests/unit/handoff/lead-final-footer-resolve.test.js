// QF-20260525-306 (CAPA-1, PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001):
// LEAD-FINAL autoCloseFeedback closed feedback only by link (SD id / branch /
// deferred_from_sd_key) and never parsed "Closes feedback <uuid>" footers, unlike
// the complete-quick-fix orchestrator. resolveFeedbackFooters wires that in.
// Borrow the prototype method with a fake supabase so we exercise the wiring
// (full-UUID footer needs no DB expansion).

import { describe, it, expect } from 'vitest';
import LeadFinalApprovalExecutor from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

const UUID = 'cd74b43c-42fa-4cb7-8651-10ff06763bf3';

function makeFakeSupabase(captured) {
  const chain = {
    update(obj) { captured.push(obj); return chain; },
    eq() { return chain; },
    neq() { return chain; },
    // resolveFeedback ends in .select('id'); non-empty data => updated:true
    select() { return Promise.resolve({ data: [{ id: UUID }], error: null }); },
  };
  return { from() { return chain; } };
}

describe('CAPA-1 resolveFeedbackFooters: footer-referenced rows get resolved', () => {
  it('resolves a feedback row named only by a Closes-feedback footer', async () => {
    const captured = [];
    const ctx = {
      supabase: makeFakeSupabase(captured),
      resolveFeedbackFooters: LeadFinalApprovalExecutor.prototype.resolveFeedbackFooters,
    };
    // sd_key with no matching git commits → git path no-ops; footer comes from description.
    const sd = {
      id: 'SD-CAPA1-TEST-001',
      sd_key: 'SD-CAPA1-TEST-001',
      description: `Body.\nCloses feedback ${UUID}\n`,
    };
    const count = await ctx.resolveFeedbackFooters(sd);
    expect(count).toBe(1);
    expect(captured.length).toBe(1);
    expect(captured[0].status).toBe('resolved');
    expect(captured[0].resolution_sd_id).toBe('SD-CAPA1-TEST-001');
  });

  it('no footer → no resolve, no update issued', async () => {
    const captured = [];
    const ctx = {
      supabase: makeFakeSupabase(captured),
      resolveFeedbackFooters: LeadFinalApprovalExecutor.prototype.resolveFeedbackFooters,
    };
    const sd = { id: 'SD-CAPA1-TEST-002', sd_key: 'SD-CAPA1-TEST-002', description: 'No footer here.' };
    const count = await ctx.resolveFeedbackFooters(sd);
    expect(count).toBe(0);
    expect(captured.length).toBe(0);
  });
});
