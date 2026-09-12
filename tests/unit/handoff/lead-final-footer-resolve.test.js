// QF-20260525-306 (CAPA-1, PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001):
// LEAD-FINAL autoCloseFeedback closed feedback only by link (SD id / branch /
// deferred_from_sd_key) and never parsed "Closes feedback <uuid>" footers, unlike
// the complete-quick-fix orchestrator. resolveFeedbackFooters wires that in.
// Borrow the prototype method with a fake supabase so we exercise the wiring
// (full-UUID footer needs no DB expansion).

import { describe, it, expect } from 'vitest';
import LeadFinalApprovalExecutor from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

const UUID = 'cd74b43c-42fa-4cb7-8651-10ff06763bf3';

// SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A: resolveFeedback() now resolves the chain-tip via
// fetchLatestFeedback (an .eq().maybeSingle() base fetch + an .or().order().order().limit()
// .maybeSingle() root-scoped fetch) and inserts a correction instead of calling .update().
function makeFakeSupabase(captured) {
  const openRow = { id: UUID, status: 'new', type: 'issue', created_at: '2026-01-01T00:00:00.000Z', metadata: {} };
  return {
    from() {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: openRow, error: null }) }),
          or: () => ({
            order: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: openRow, error: null }) }),
              }),
            }),
          }),
        }),
        insert: (obj) => { captured.push(obj); return Promise.resolve({ error: null }); },
      };
    },
  };
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
