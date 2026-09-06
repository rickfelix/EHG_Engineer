/**
 * SD-LEO-INFRA-CHECKIN-DIRECTED-BEFORE-RESUME-001 — FR-1 hardening.
 *
 * Adversarial-review finding (deep-tier review of PR shipping this SD): resume.cjs's yield
 * branch nulls ctx.mySd and falls through to directed-assignment, trusting a genuine claim_sd
 * switch will follow. But directed-assignment.cjs has real rejection paths (fitness-check
 * failure, target-terminal, ineligible, QF not_before, a non-terminal tryClaim error) that never
 * call claim_sd and never restore ctx.mySd -- so a downstream self-claim tier could silently
 * evict the still-DB-held original claim via the symmetric-clear fix, believing the seat holds
 * nothing. This step (positioned right after directed-assignment) restores ctx.mySd and stops the
 * pipeline whenever a yield did not produce a successful claim.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fallback = require('../../../lib/checkin/steps/resume-yield-fallback.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

function ctxAfterFailedYield(resumableSd = 'SD-RESUMABLE-X', directedSd = 'SD-DIRECTED-Y') {
  return {
    mySd: null, // the yield branch nulled it; directed-assignment fell through without claiming
    base: {
      resume_yielded_to_directed: { resumable_sd: resumableSd, directed_sd: directedSd, message_id: 'msg-directed-y' },
      directed_lane_verdict: { outcome: 'deferred', id: 'msg-directed-y', sd_key: directedSd, reason: 'ineligible:repo_mismatch' },
    },
  };
}

describe('resume-yield-fallback: applies()', () => {
  it('applies when a yield happened and ctx.mySd is still null (the claim did not succeed)', () => {
    expect(fallback.applies(ctxAfterFailedYield())).toBe(true);
  });

  it('does not apply when no yield happened this tick', () => {
    expect(fallback.applies({ mySd: null, base: {} })).toBe(false);
  });

  it('does not apply when ctx.mySd is populated (a successful claim would short-circuit before this step, but guard defensively anyway)', () => {
    const ctx = ctxAfterFailedYield();
    ctx.mySd = 'SD-DIRECTED-Y';
    expect(fallback.applies(ctx)).toBe(false);
  });
});

describe('resume-yield-fallback: run() restores the yielded claim instead of stranding it', () => {
  it('restores ctx.mySd to the resumable SD and reports action=resume', async () => {
    const ctx = ctxAfterFailedYield('SD-RESUMABLE-X', 'SD-DIRECTED-Y');
    const res = await fallback.run(ctx);
    expect(ctx.mySd).toBe('SD-RESUMABLE-X');
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-RESUMABLE-X');
    expect(res.message).toContain('SD-DIRECTED-Y could not be claimed this tick');
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'yielded_to_directed', sd_key: 'SD-DIRECTED-Y' });
    expect(ctx.base.directed_lane_verdict.reason).toContain('ineligible:repo_mismatch');
  });

  it('uses the quick-fix resume message when the resumable item is a QF', async () => {
    const ctx = ctxAfterFailedYield('QF-20260906-123', 'SD-DIRECTED-Y');
    const res = await fallback.run(ctx);
    expect(res.action).toBe('resume');
    expect(res.sd).toBe('QF-20260906-123');
    expect(res.message).toContain('read-quick-fix.js QF-20260906-123');
    expect(res.message).not.toContain('sd-start.js QF-20260906-123');
  });

  it('never claims a NEW item and never returns action=idle or a self-claim action', async () => {
    const ctx = ctxAfterFailedYield();
    const res = await fallback.run(ctx);
    expect(res.action).toBe('resume');
    expect(res.sd).not.toBe(ctx.base.resume_yielded_to_directed.directed_sd);
  });
});

describe('resume-yield-fallback: pipeline integration — stops before any self-claim tier runs', () => {
  it('a failed yield attempt (directed-assignment falls through) restores the claim and never reaches a downstream self-claim step', async () => {
    const selfClaimHits = [];
    const directedAssignmentFailsToClaimStub = {
      name: 'directed-assignment',
      async run(ctx) {
        // Mirrors a real rejection branch: sets directed_lane_verdict, does NOT call claim_sd,
        // does NOT restore ctx.mySd, and falls through (undefined = pipeline continues).
        ctx.base.directed_lane_verdict = { outcome: 'skipped', id: 'msg-directed-y', sd_key: 'SD-DIRECTED-Y', reason: 'ineligible:repo_mismatch' };
        return undefined;
      },
    };
    const selfClaimStub = {
      name: 'merged-pool-self-claim',
      async run(ctx) {
        selfClaimHits.push({ mySd: ctx.mySd });
        return { ...ctx.base, action: 'self_claimed', sd: 'SD-UNRELATED-Z' };
      },
    };

    const ctx = {
      mySd: null,
      base: { resume_yielded_to_directed: { resumable_sd: 'SD-RESUMABLE-X', directed_sd: 'SD-DIRECTED-Y', message_id: 'msg-directed-y' } },
    };
    const res = await runSteps([directedAssignmentFailsToClaimStub, fallback, selfClaimStub], ctx);

    expect(res.action).toBe('resume');
    expect(res.sd).toBe('SD-RESUMABLE-X');
    expect(selfClaimHits).toEqual([]); // the self-claim tier must NEVER run — that is the eviction risk this closes
    expect(ctx.mySd).toBe('SD-RESUMABLE-X'); // restored, not left null
  });

  it('a SUCCESSFUL directed claim short-circuits before this step runs at all (unaffected by this fix)', async () => {
    const fallbackHits = [];
    const directedAssignmentSucceedsStub = {
      name: 'directed-assignment',
      async run(ctx) {
        return { ...ctx.base, action: 'claimed_assignment', sd: 'SD-DIRECTED-Y' };
      },
    };
    const instrumentedFallback = {
      name: 'resume-yield-fallback',
      applies: fallback.applies,
      async run(ctx) { fallbackHits.push(true); return fallback.run(ctx); },
    };

    const ctx = {
      mySd: null,
      base: { resume_yielded_to_directed: { resumable_sd: 'SD-RESUMABLE-X', directed_sd: 'SD-DIRECTED-Y', message_id: 'msg-directed-y' } },
    };
    const res = await runSteps([directedAssignmentSucceedsStub, instrumentedFallback], ctx);

    expect(res.action).toBe('claimed_assignment');
    expect(res.sd).toBe('SD-DIRECTED-Y');
    expect(fallbackHits).toEqual([]); // never invoked — the successful claim already resolved the pipeline
  });
});
