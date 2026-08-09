/**
 * SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001 FR-1 — resume must see BOTH claim kinds.
 *
 * resume is step 5 of the first-truthy-wins ladder (lib/checkin/pipeline.cjs), sitting ABOVE every
 * acquisition tier, so WHAT IT CAN SEE decides whether a seat can be stacked. Its `!ctx.mySd`
 * branch asked findOwnSdClaim — strategic_directives_v2 ONLY, .limit(1), never quick_fixes — so a
 * seat whose mirror (claude_sessions.sd_key) is NULL while it authoritatively holds a QF was
 * invisible: resume returned undefined and the ladder fell through to merged-pool-self-claim and
 * self-claim-qf, handing MORE vehicles onto a seat that already deliberately held one.
 *
 * MEASURED LIVE when this shipped, whole population not a sample (n=2): 2 of 2 quick_fixes carrying
 * an authoritative claiming_session_id had a NULL mirror — 100% in the stacking-reachable state.
 *
 * These drive the REAL step through the REAL pipeline runner with only the DB stubbed, following
 * tests/unit/checkin/canary-claim-fence.test.js. Asserting the predicate in isolation would prove
 * the module while leaving the LADDER — the thing that actually stacks — unproven.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const resume = require('../../../lib/checkin/steps/resume.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const ME = 'sess-under-test';

/**
 * Supabase double covering BOTH access shapes resume reaches:
 *   findOwnSdClaim — .from(t).select().eq().eq().limit(1).maybeSingle()
 *   getMyClaims    — .from(t).select().eq('claiming_session_id', id)  [awaited directly]
 * A builder that is BOTH thenable and chainable, so neither caller needs a bespoke stub.
 */
function makeSb({ sdRows = [], qfRows = [], sdError = null, qfError = null } = {}) {
  const calls = { tables: [] };
  const api = {
    from(table) { calls.tables.push(table); api._t = table; return api; },
    select() { return api; },
    eq() { return api; },
    limit() { return api; },
    maybeSingle() {
      // findOwnSdClaim's shape: it also filters is_working_on=true, which the rows encode.
      const row = sdRows.find((r) => r.is_working_on === true) || null;
      return Promise.resolve({ data: row, error: sdError });
    },
    then(resolve, reject) {
      const isQf = api._t === 'quick_fixes';
      const payload = isQf ? { data: qfRows, error: qfError } : { data: sdRows, error: sdError };
      return Promise.resolve(payload).then(resolve, reject);
    },
  };
  api._calls = calls;
  return api;
}

function makeCtx({ sb, mySd = null } = {}) {
  return {
    sb,
    sessionId: ME,
    opts: {},
    mySd,
    sessionRole: null,
    sessionMetadata: {},
    base: { callsign: null },
    helpers: {
      ws: { getMessagesForSession: async () => [], DIRECTIVE_KINDS: [] },
      confirmRowGone: async () => false,
      selfHealStaleClaim: async () => {},
      findOwnSdClaim: async (sb2, sid) => {
        const { data } = await sb2.from('strategic_directives_v2').select('sd_key')
          .eq('claiming_session_id', sid).eq('is_working_on', true).limit(1).maybeSingle();
        return data ? data.sd_key : null;
      },
      healOwnClaimPointer: async () => true,
      extractDirectedSd: () => null,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
    },
  };
}

/** A stand-in for every acquisition tier BELOW resume. If the ladder reaches it, the seat got stacked. */
function stackingTier(hits) {
  return { name: 'acquisition-tier-below-resume', async run() { hits.push('handed'); return { action: 'self_claimed_qf', qf: 'QF-EXTRA' }; } };
}

describe('FR-1 — a seat holding a QF is not handed more work', () => {
  it('POSITIVE: QF held authoritatively + NULL mirror resolves to resume, and NOTHING below runs', async () => {
    const hits = [];
    const sb = makeSb({ sdRows: [], qfRows: [{ id: 'QF-20260807-999', status: 'open' }] });
    const res = await runSteps([resume, stackingTier(hits)], makeCtx({ sb }));
    expect(res).toBeTruthy();
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('QF-20260807-999');
    // The whole point: the ladder must NOT continue into an acquisition tier.
    expect(hits).toEqual([]);
  });

  it('NEGATIVE CONTROL: a seat holding NOTHING still falls through and receives its ordinary hand', async () => {
    // Without this, a guard that refuses every hand would pass the positive arm and halt the fleet.
    const hits = [];
    const sb = makeSb({ sdRows: [], qfRows: [] });
    const res = await runSteps([resume, stackingTier(hits)], makeCtx({ sb }));
    expect(res.action).toBe('self_claimed_qf');
    expect(hits).toEqual(['handed']);
  });

  it('an authoritatively-held SD with a NULL mirror still resumes — no regression to the SD path', async () => {
    const hits = [];
    const sb = makeSb({ sdRows: [{ sd_key: 'SD-X-001', is_working_on: true, status: 'active' }], qfRows: [] });
    const res = await runSteps([resume, stackingTier(hits)], makeCtx({ sb }));
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-X-001');
    expect(hits).toEqual([]);
  });

  it('an UNREADABLE quick_fixes surface does not read as "holds nothing"', async () => {
    // get-my-claims reports partial-read errors precisely so a caller can tell "you hold nothing"
    // from "I could not see one of the two surfaces". Handing work on an unreadable surface is the
    // same class of defect as the blindness this FR fixes.
    const hits = [];
    const sb = makeSb({ sdRows: [], qfRows: [], qfError: { message: 'connection reset' } });
    await runSteps([resume, stackingTier(hits)], makeCtx({ sb }));
    expect(hits).toEqual([]);
  });
});

describe('FR-1 — multiplicity stays DETECTION-ONLY (coordinator ruling)', () => {
  it('surfaces claim_multiplicity without releasing anything', async () => {
    // resume.cjs states in terms that picking a winner between two authoritative claims is a POLICY
    // decision, deliberately not self-healed here. Ruled: leave it detected and unacted.
    const sb = makeSb({
      sdRows: [{ sd_key: 'SD-A-001', is_working_on: true, status: 'active' }],
      qfRows: [{ id: 'QF-B-002', status: 'open' }],
    });
    const ctx = makeCtx({ sb, mySd: 'SD-A-001' });
    const released = vi.fn();
    ctx.helpers.selfHealStaleClaim = released;
    const res = await runSteps([resume], ctx);
    expect(res.action).toBe('resume');
    expect(ctx.base.claim_multiplicity).toBeTruthy();
    expect(ctx.base.claim_multiplicity.held).toEqual(expect.arrayContaining(['SD-A-001', 'QF-B-002']));
    expect(released).not.toHaveBeenCalled();
  });
});
