/**
 * QF-20260902-544 — a directed WORK_ASSIGNMENT to a seat that already holds a claim sat unread
 * by design: resume (rung 4) short-circuits the ladder before directed-assignment (rung 5) ever
 * runs for a claimed seat, so the row was only SURFACED (pending_work_assignment on the resume
 * response) and never acked. Witnessed: a directed assignment waited 34 minutes for a human to
 * manually re-target it to an idle seat.
 *
 * resume.cjs now also acks the pending WORK_ASSIGNMENT (read_at + acknowledged_at stamped) so it
 * drains from the unread inbox, reusing canary-claim-fence.cjs's ack-and-decline shape. This is
 * deliberately NOT a claim of the redirected SD and does NOT touch ctx.mySd (never-strand,
 * CLAUDE.md rule 7a) — the deferral is still fully surfaced via pending_work_assignment.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const resume = require('../../../lib/checkin/steps/resume.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const ME = 'sess-under-test';
const PENDING_WA = { id: 'msg-pending-wa-1', message_type: 'WORK_ASSIGNMENT', created_at: new Date().toISOString(), payload: { assigned_sd: 'SD-OTHER-999' } };

function makeSb() {
  return {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
}

function makeCtx({ acked, mySd = 'SD-CURRENT-001' } = {}) {
  return {
    sb: makeSb(),
    sessionId: ME,
    opts: {},
    mySd,
    sessionRole: 'worker',
    sessionMetadata: {},
    base: { callsign: null },
    helpers: {
      ws: { getMessagesForSession: async () => [PENDING_WA], DIRECTIVE_KINDS: [] },
      confirmRowGone: async () => false,
      selfHealStaleClaim: async () => {},
      findOwnSdClaim: async () => mySd,
      healOwnClaimPointer: async () => true,
      extractDirectedSd: (m) => m.payload?.assigned_sd || null,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
      ackMessage: async (_sb, id, opts) => { acked.push({ id, opts }); return { acknowledged: true }; },
    },
  };
}

describe('QF-20260902-544: resume acks a pending directed WORK_ASSIGNMENT as DEFERRED', () => {
  it('calls ackMessage with the pending assignment id when a claimed seat resumes', async () => {
    const acked = [];
    const res = await runSteps([resume], makeCtx({ acked }));
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-CURRENT-001');
    // Deliberately does NOT claim the redirected SD.
    expect(res.pending_work_assignment).toMatchObject({ sd: 'SD-OTHER-999', message_id: PENDING_WA.id });
    expect(acked).toHaveLength(1);
    expect(acked[0].id).toBe(PENDING_WA.id);
    expect(acked[0].opts).toMatchObject({ role: 'worker', messageType: 'WORK_ASSIGNMENT' });
  });

  it('does not ack anything when there is no pending assignment for a different SD', async () => {
    const acked = [];
    const ctx = makeCtx({ acked });
    ctx.helpers.ws.getMessagesForSession = async () => [];
    const res = await runSteps([resume], ctx);
    expect(res.action).toBe('resume');
    expect(res.pending_work_assignment).toBeUndefined();
    expect(acked).toHaveLength(0);
  });

  it('a failed ack does not break resume (fail-open, best-effort)', async () => {
    const acked = [];
    const ctx = makeCtx({ acked });
    ctx.helpers.ackMessage = async () => { throw new Error('db down'); };
    const res = await runSteps([resume], ctx);
    expect(res.action).toBe('resume');
    expect(res.pending_work_assignment).toMatchObject({ sd: 'SD-OTHER-999' });
  });
});
