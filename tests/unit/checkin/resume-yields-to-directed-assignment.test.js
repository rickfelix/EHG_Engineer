/**
 * SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 — FR-1/FR-2/FR-3.
 *
 * THE SPECIMEN (WORK_ASSIGNMENT 13655143, measured 2026-09-04): resume (rung 4) rediscovers a
 * REDUCED-mirror claim via findOwnSdClaim/getMyClaims (a "resumable release" — the sweep cleared
 * claude_sessions.sd_key while leaving the authoritative claim untouched) and short-circuits the
 * ladder BEFORE directed-assignment (rung 5) ever runs — so an addressed, unread WORK_ASSIGNMENT
 * for a DIFFERENT item sat unread for 98 minutes.
 *
 * FIX: resume.cjs tracks whether ctx.mySd was REDISCOVERED in this tick (the mirror was empty —
 * `justRehydrated`) as opposed to arriving already populated (a claim continuously held since
 * before this tick). ONLY the rediscovered case yields to a directed WORK_ASSIGNMENT for a
 * different item: it nulls ctx.mySd and returns undefined, letting the pipeline fall through to
 * directed-assignment, which genuinely claims it via claim_sd (the symmetric-clear fix,
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A, correctly releases the rediscovered claim as part of that
 * switch). The continuously-held case is BYTE-IDENTICAL to before (see
 * resume-defers-pending-work-assignment.test.js and resume-sees-both-claim-kinds-fr1.test.js,
 * both unmodified by this SD and still green) — rule 7a (never-strand) still protects real
 * in-progress work.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const resume = require('../../../lib/checkin/steps/resume.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const ME = 'sess-under-test';
const RESUMABLE_SD = 'SD-RESUMABLE-X';
const DIRECTED_WA = (sd) => ({ id: 'msg-directed-y', message_type: 'WORK_ASSIGNMENT', created_at: new Date().toISOString(), payload: { assigned_sd: sd } });

function makeSb() {
  return {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
}

/** ctx.mySd starts NULL — the "resumable release" case: findOwnSdClaim rediscovers RESUMABLE_SD. */
function makeRehydratingCtx({ messages = [], ackedIds = [], sessionMetadata = {}, isBuildForbiddenSession = () => false } = {}) {
  return {
    sb: makeSb(),
    sessionId: ME,
    opts: {},
    mySd: null,
    sessionRole: 'worker',
    sessionMetadata,
    base: { callsign: null, directed_lane_verdict: { outcome: 'none', id: null, sd_key: null, reason: null } },
    helpers: {
      ws: { getMessagesForSession: async () => messages, DIRECTIVE_KINDS: [] },
      confirmRowGone: async () => false,
      selfHealStaleClaim: async () => {},
      findOwnSdClaim: async () => RESUMABLE_SD,
      healOwnClaimPointer: async () => true,
      extractDirectedSd: (m) => m.payload?.assigned_sd || null,
      extractSdFromAssignment: (m) => m.payload?.assigned_sd || null,
      isInformationalNudge: () => false,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
      ackMessage: async (_sb, id) => { ackedIds.push(id); return { acknowledged: true }; },
      isBuildForbiddenSession,
    },
  };
}

/** A stand-in for directed-assignment (rung 5), to prove the pipeline actually reaches it. */
function directedAssignmentStub(hits) {
  return {
    name: 'directed-assignment',
    async run(ctx) {
      hits.push({ mySd: ctx.mySd });
      return { ...ctx.base, action: 'claimed_assignment', sd: 'SD-DIRECTED-Y' };
    },
  };
}

describe('FR-1: a rediscovered (resumable-release) claim yields to a directed WORK_ASSIGNMENT for a different item', () => {
  it('fixture (a) — the specimen: yields, nulls mySd, and directed-assignment claims the directed item', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({ messages: [DIRECTED_WA('SD-DIRECTED-Y')] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(res.sd).toBe('SD-DIRECTED-Y');
    // resume must NOT have resolved the checkin itself — the pipeline reached the next step.
    expect(hits).toEqual([{ mySd: null }]);
    expect(ctx.base.resume_yielded_to_directed).toMatchObject({ resumable_sd: RESUMABLE_SD, directed_sd: 'SD-DIRECTED-Y', message_id: 'msg-directed-y' });
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'yielded_to_directed', id: 'msg-directed-y', sd_key: 'SD-DIRECTED-Y' });
  });

  it('fixture (b) — same-item resume: a WORK_ASSIGNMENT for the SAME rediscovered SD resumes once, no yield, no double claim', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({ messages: [DIRECTED_WA(RESUMABLE_SD)] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('resume');
    expect(res.sd).toBe(RESUMABLE_SD);
    expect(hits).toEqual([]); // directed-assignment never runs — no double claim
    expect(ctx.base.resume_yielded_to_directed).toBeUndefined();
  });

  it('fixture (c) — the race: no directed row visible this tick resumes normally; a fresh rediscovery tick that DOES see one yields', async () => {
    // Tick 1: the WA does not exist yet at the time of this tick's message fetch.
    const tick1 = makeRehydratingCtx({ messages: [] });
    const res1 = await runSteps([resume, directedAssignmentStub([])], tick1);
    expect(res1.action).toBe('resume');
    expect(res1.sd).toBe(RESUMABLE_SD);

    // Tick 2 (a later, independent rediscovery — e.g. the sweep releases the mirror again, or this
    // models a fresh checkin whose own mirror read is still empty): the WA now exists and is seen.
    const hits2 = [];
    const tick2 = makeRehydratingCtx({ messages: [DIRECTED_WA('SD-DIRECTED-Y')] });
    const res2 = await runSteps([resume, directedAssignmentStub(hits2)], tick2);
    expect(res2.action).toBe('claimed_assignment');
    expect(hits2).toEqual([{ mySd: null }]);
  });

  it('does not yield for a keyless/non-WORK_ASSIGNMENT message, or when extractDirectedSd finds nothing', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({ messages: [{ id: 'm1', message_type: 'INFO', payload: {} }] });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('resume');
    expect(hits).toEqual([]);
  });
});

describe('FR-1 hardening: a build-forbidden or canary session never attempts the yield', () => {
  it('a build-forbidden (propose-only) session takes the surface-only yielded_to_resume path instead of yielding', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({
      messages: [DIRECTED_WA('SD-DIRECTED-Y')],
      sessionMetadata: { non_fleet: true, role: 'adam' },
      isBuildForbiddenSession: () => true,
    });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    // Falls through to the pre-existing, unmodified yielded_to_resume branch: resume itself
    // short-circuits before build-forbidden-guard/canary-claim-fence ever run, exactly preserving
    // the invariant those steps' own positioning relies on.
    expect(res.action).toBe('resume');
    expect(res.sd).toBe(RESUMABLE_SD);
    expect(hits).toEqual([]); // directed-assignment never reached — no yield attempt
    expect(ctx.base.resume_yielded_to_directed).toBeUndefined();
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'yielded_to_resume', sd_key: 'SD-DIRECTED-Y' });
  });

  it('a build-forbidden check that throws fails OPEN to attempting the yield (downstream gates still fail closed)', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({
      messages: [DIRECTED_WA('SD-DIRECTED-Y')],
      isBuildForbiddenSession: () => { throw new Error('boom'); },
    });
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('claimed_assignment');
    expect(hits).toEqual([{ mySd: null }]);
  });
});

describe('FR-1 regression guard: the continuously-held case never yields (rule 7a, never-strand)', () => {
  it('a claim already populated before resume runs only SURFACES the directed row — never yields or switches', async () => {
    const hits = [];
    const ctx = makeRehydratingCtx({ messages: [DIRECTED_WA('SD-DIRECTED-Y')] });
    ctx.mySd = 'SD-CONTINUOUSLY-HELD'; // populated BEFORE resume runs -- the !ctx.mySd branch never fires
    const res = await runSteps([resume, directedAssignmentStub(hits)], ctx);
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-CONTINUOUSLY-HELD');
    expect(res.pending_work_assignment).toMatchObject({ sd: 'SD-DIRECTED-Y' });
    expect(hits).toEqual([]); // directed-assignment never reached — no switch
    expect(ctx.base.resume_yielded_to_directed).toBeUndefined();
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'yielded_to_resume', id: 'msg-directed-y', sd_key: 'SD-DIRECTED-Y' });
  });
});
