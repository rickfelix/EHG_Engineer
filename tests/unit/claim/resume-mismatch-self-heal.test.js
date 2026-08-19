// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-1) -- behavioral coverage.
//
// tests/unit/claim/guard-order-and-mismatch-fr7-fr8.test.js pins FR-1's self-heal via source-text
// regexes against an extracted function-body slice -- it has never actually INVOKED resume.run().
// A source-pin can't see wrong argument order, a helper missing from ctx.helpers, or a catch block
// silently swallowing the self-heal. This file exercises the real code path: a genuinely mismatched
// ctx.mySd, a real (fake-backed) getMyClaims() call via lib/claim/get-my-claims.cjs, and an
// assertion that resume.run() falls through instead of returning action:'resume' for the foreign claim.

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const resumeStep = require('../../../lib/checkin/steps/resume.cjs');

// getMyClaims (lib/claim/get-my-claims.cjs) does `await supabase.from(T).select(...).eq(...)` --
// .eq() must be directly awaitable. resume.cjs's OWN staleTerminal check does
// `await sb.from(T).select(...).eq(...).maybeSingle()` -- .eq() must ALSO expose .maybeSingle().
// One object supporting both shapes lets a single fake sb serve both call sites correctly.
function eqResult({ data, error = null, singleData = null }) {
  return {
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject),
    maybeSingle: async () => ({ data: singleData, error: null }),
  };
}

function makeSb({ sdClaims = [], qfClaims = [], sdStatusRow = null } = {}) {
  return {
    from: (table) => ({
      select: () => ({
        eq: () => {
          if (table === 'strategic_directives_v2') return eqResult({ data: sdClaims, singleData: sdStatusRow });
          if (table === 'quick_fixes') return eqResult({ data: qfClaims });
          return eqResult({ data: [] });
        },
      }),
    }),
  };
}

describe('FR-1: resume.run() self-heals a claim_mirror_mismatch (behavioral, not just source-pinned)', () => {
  it('clears the stale mirror and does NOT resume the foreign claim when ctx.mySd matches no authoritative claim', async () => {
    const selfHealStaleClaim = vi.fn(async () => true);
    const sb = makeSb({
      sdClaims: [{ sd_key: 'SD-REAL-OWNED-001', status: 'active', current_phase: 'EXEC' }],
      qfClaims: [],
    });
    const ctx = {
      sb,
      sessionId: 'session-ME',
      sessionRole: 'worker',
      mySd: 'SD-STALE-MIRROR-001', // the mismatched mirror -- session does NOT actually hold this
      base: {},
      helpers: {
        selfHealStaleClaim,
        // Unreached for this path: self-heal nulls ctx.mySd before the "already working -> resume"
        // block runs, so it never calls ws/confirmRowGone/etc.
        ws: undefined,
        confirmRowGone: undefined,
        findOwnSdClaim: undefined,
        healOwnClaimPointer: undefined,
        extractDirectedSd: undefined,
        ASSIGNMENT_RECENCY_WINDOW_MS: 0,
      },
    };

    const result = await resumeStep.run(ctx);

    expect(selfHealStaleClaim).toHaveBeenCalledTimes(1);
    expect(selfHealStaleClaim).toHaveBeenCalledWith(sb, 'session-ME', 'SD-STALE-MIRROR-001');
    expect(ctx.base.claim_mirror_mismatch).toEqual({ mirror: 'SD-STALE-MIRROR-001', authoritative: ['SD-REAL-OWNED-001'] });
    expect(ctx.base.self_healed_claim_mismatch).toBe('SD-STALE-MIRROR-001');
    expect(ctx.mySd).toBeNull();
    // The whole point of FR-1: no action:'resume' for the claim we don't actually hold.
    expect(result).toBeUndefined();
  });

  it('does NOT self-heal when the mirror matches an authoritative claim (no false trigger)', async () => {
    const selfHealStaleClaim = vi.fn(async () => true);
    const sb = makeSb({
      sdClaims: [{ sd_key: 'SD-REAL-OWNED-001', status: 'active', current_phase: 'EXEC' }],
      qfClaims: [],
    });
    const ctx = {
      sb,
      sessionId: 'session-ME',
      sessionRole: 'worker',
      mySd: 'SD-REAL-OWNED-001', // matches the held claim -- no mismatch
      base: {},
      helpers: {
        selfHealStaleClaim,
        ws: undefined, confirmRowGone: undefined, findOwnSdClaim: undefined,
        healOwnClaimPointer: undefined, extractDirectedSd: undefined, ASSIGNMENT_RECENCY_WINDOW_MS: 0,
      },
    };

    // The downstream "already working -> resume" machinery (ws.getMessagesForSession etc.) is not
    // this test's concern and isn't fully stubbed here -- only that self-heal was correctly skipped.
    await resumeStep.run(ctx).catch(() => {});

    expect(selfHealStaleClaim).not.toHaveBeenCalled();
    expect(ctx.base.claim_mirror_mismatch).toBeUndefined();
    expect(ctx.mySd).toBe('SD-REAL-OWNED-001'); // mirror preserved -- it was correct
  });
});
