/**
 * QF-20260905-030.
 *
 * THE SPECIMEN: Alpha held SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002 (an orchestrator parent)
 * across its own two setup handoffs (LEAD-TO-PLAN, then PLAN-TO-EXEC). A standby wakeup fired
 * mid-setup; /checkin rediscovered the parent claim (a "resumable release" -- the mirror had gone
 * empty) and, per SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001's yield rule, yielded to an
 * unconsumed directed WORK_ASSIGNMENT for the parent's own first child (-002-A) -- swapping the
 * seat's claim off the parent BETWEEN LEAD-TO-PLAN and PLAN-TO-EXEC. GATE_CLAIM_VALIDITY then
 * returned NO_CLAIM twice on the parent's PLAN-TO-EXEC handoff before Alpha re-claimed the parent.
 *
 * FIX: resume.cjs's mayAttemptYield chain gets a third disqualifying check (after
 * isBuildForbiddenSession / isCanarySession): when the rediscovered claim is an ORCHESTRATOR
 * still between its own LEAD-TO-PLAN and PLAN-TO-EXEC handoffs (current_phase in
 * {LEAD, PLAN_PRD, PLAN} -- never yet reached EXEC) AND the directed target is a REGISTERED
 * CHILD of that parent (parent_sd_id match), the yield is refused; resume instead surfaces the
 * assignment via the pre-existing yielded_to_resume path, exactly like a continuously-held claim.
 * An orchestrator past PLAN-TO-EXEC, or a directed target that is NOT this parent's child, or a
 * non-orchestrator SD, all keep the ordinary yield behavior (regression guards below).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const resume = require('../../../lib/checkin/steps/resume.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const ME = 'sess-under-test';
const PARENT_SD = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002';
const CHILD_SD = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A';
const PARENT_ROW_ID = 'parent-row-id';
const DIRECTED_WA = (sd) => ({ id: 'msg-directed-child', message_type: 'WORK_ASSIGNMENT', created_at: new Date().toISOString(), payload: { assigned_sd: sd } });

/**
 * A minimal sb stub that differentiates the two `strategic_directives_v2` reads resume.cjs makes
 * for the rediscovered claim: (1) the parent's own row (select carries 'sd_type'), keyed by
 * sd_key=ctx.mySd; (2) the child-registration check (select is bare 'id'), keyed by
 * sd_key=waSd AND parent_sd_id=<parent row id>. Every other query (e.g. the pre-existing
 * stale-terminal `.select('status')` check) falls through to {data:null,error:null}, which
 * preserves resume for those checks exactly as makeSb() in the sibling FR-1 test file does.
 */
function makeOrchSb({ parentRow, childMatches }) {
  return {
    from(table) { this._table = table; this._eqs = {}; return this; },
    select(cols) { this._cols = cols; return this; },
    eq(col, val) { this._eqs[col] = val; return this; },
    limit() { return this; },
    maybeSingle() {
      if (this._table === 'strategic_directives_v2' && this._cols === 'id, sd_type, current_phase') {
        const match = parentRow && this._eqs.sd_key === parentRow.sd_key;
        return Promise.resolve({ data: match ? parentRow : null, error: null });
      }
      if (this._table === 'strategic_directives_v2' && this._cols === 'id') {
        const match = childMatches && parentRow
          && this._eqs.sd_key === CHILD_SD && this._eqs.parent_sd_id === parentRow.id;
        return Promise.resolve({ data: match ? { id: 'child-row-id' } : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function makeCtx({ sb, mySd, messages = [] }) {
  return {
    sb,
    sessionId: ME,
    opts: {},
    mySd: null,
    sessionRole: 'worker',
    sessionMetadata: {},
    base: { callsign: null, directed_lane_verdict: { outcome: 'none', id: null, sd_key: null, reason: null } },
    helpers: {
      ws: { getMessagesForSession: async () => messages, DIRECTIVE_KINDS: [] },
      confirmRowGone: async () => false,
      selfHealStaleClaim: async () => {},
      findOwnSdClaim: async () => mySd,
      healOwnClaimPointer: async () => true,
      extractDirectedSd: (m) => m.payload?.assigned_sd || null,
      extractSdFromAssignment: (m) => m.payload?.assigned_sd || null,
      isInformationalNudge: () => false,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
      ackMessage: async () => ({ acknowledged: true }),
      isBuildForbiddenSession: () => false,
    },
  };
}

function directedAssignmentStub(hits) {
  return {
    name: 'directed-assignment',
    async run(ctx) {
      hits.push({ mySd: ctx.mySd });
      return { ...ctx.base, action: 'claimed_assignment', sd: ctx.base.pendingDirectedSd || CHILD_SD };
    },
  };
}

describe('QF-20260905-030: an orchestrator parent mid-setup never yields to a directed WA for its own child', () => {
  it('parent at PLAN_PRD (post LEAD-TO-PLAN, pre PLAN-TO-EXEC) with the WA targeting its registered child: refuses the yield, surfaces instead', async () => {
    const parentRow = { id: PARENT_ROW_ID, sd_key: PARENT_SD, sd_type: 'orchestrator', current_phase: 'PLAN_PRD' };
    const sb = makeOrchSb({ parentRow, childMatches: true });
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA(CHILD_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('resume');
    expect(res.sd).toBe(PARENT_SD);
    expect(hits).toEqual([]); // directed-assignment never reached -- no swap off the parent
    expect(ctx.base.resume_yielded_to_directed).toBeUndefined();
    expect(res.pending_work_assignment).toMatchObject({ sd: CHILD_SD });
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'yielded_to_resume', sd_key: CHILD_SD });
  });

  it('parent at LEAD (pre LEAD-TO-PLAN) with the WA targeting its registered child: also refuses the yield', async () => {
    const parentRow = { id: PARENT_ROW_ID, sd_key: PARENT_SD, sd_type: 'orchestrator', current_phase: 'LEAD' };
    const sb = makeOrchSb({ parentRow, childMatches: true });
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA(CHILD_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('resume');
    expect(hits).toEqual([]);
  });

  it('regression: a parent already past PLAN-TO-EXEC (current_phase=EXEC) still yields normally', async () => {
    const parentRow = { id: PARENT_ROW_ID, sd_key: PARENT_SD, sd_type: 'orchestrator', current_phase: 'EXEC' };
    const sb = makeOrchSb({ parentRow, childMatches: true });
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA(CHILD_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(hits).toEqual([{ mySd: null }]);
    expect(ctx.base.resume_yielded_to_directed).toMatchObject({ resumable_sd: PARENT_SD, directed_sd: CHILD_SD });
  });

  it('regression: a mid-setup orchestrator parent still yields when the directed target is NOT its registered child', async () => {
    const parentRow = { id: PARENT_ROW_ID, sd_key: PARENT_SD, sd_type: 'orchestrator', current_phase: 'PLAN_PRD' };
    const sb = makeOrchSb({ parentRow, childMatches: false }); // directed target unrelated to this parent
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA('SD-UNRELATED-Z')] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(hits).toEqual([{ mySd: null }]);
  });

  it('regression: a non-orchestrator mid-phase rediscovered claim still yields normally (unaffected by this check)', async () => {
    const parentRow = { id: PARENT_ROW_ID, sd_key: PARENT_SD, sd_type: 'feature', current_phase: 'PLAN_PRD' };
    const sb = makeOrchSb({ parentRow, childMatches: true });
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA(CHILD_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(hits).toEqual([{ mySd: null }]);
  });

  it('a query error on the parent-row lookup fails OPEN to attempting the yield (downstream gates still fail closed)', async () => {
    const sb = {
      from() { return this; },
      select() { return this; },
      eq() { return this; },
      limit() { return this; },
      maybeSingle() { throw new Error('boom'); },
    };
    const hits = [];
    const ctx = makeCtx({ sb, mySd: PARENT_SD, messages: [DIRECTED_WA(CHILD_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(hits).toEqual([{ mySd: null }]);
  });
});
