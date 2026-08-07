/**
 * QF-20260807-368 — an IDLE worker must be told it has pending directives.
 *
 * THE DEFECT: `resume.cjs` surfaces a PENDING DIRECTIVES count, and its own comment says it was
 * added because directive kinds other than WORK_ASSIGNMENT "had NO surfacing path" for a
 * CLAIM-HOLDING worker. That fixed the instance and left the class — a worker with no claim never
 * reaches resume.cjs, and idle is precisely the state in which undrained directives accumulate.
 *
 * MEASURED on session 7c0540c2 (2026-08-07): three coordinator requests went unread, one a release
 * request nudged THREE times while a peer sat blocked. Every check-in that afternoon returned
 * `idle_fable_propose` and carried no directive count; the backlog surfaced only when an unrelated
 * claim collision flipped the action to `resume`. The escalation that worked was incidental.
 *
 * WHY THE SEEDED COUNT IS DELIBERATELY LARGE. The companion worker-side defect was a FIXED-SIZE
 * window over a growing list — it behaved perfectly for six messages and failed from the seventh
 * onward. A test with a short inbox therefore passes against the broken shape, which is exactly why
 * this survived. So the fixture seeds TWELVE and asserts the reported count is TWELVE: any
 * truncation, at any layer, shows up as a smaller number.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const idleStep = require('../../lib/checkin/steps/idle.cjs');

const DIRECTIVE_KINDS = ['coordinator_request', 'coordinator_directive', 'fence_notice'];

function makeCtx({ directives = [], model, throwOnFetch = false } = {}) {
  const calls = { fetchOpts: null, writes: 0 };
  return {
    calls,
    ctx: {
      sb: {
        // Any write attempt is a contract violation: this path is SURFACE-ONLY.
        from() { calls.writes += 1; return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }; },
      },
      sessionId: 'S-1',
      sessionMetadata: model ? { model } : {},
      base: { belt_ranked_claimable: 0, belt_claimable_at_my_tier: 0, work_class_fenced: [] },
      helpers: {
        DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
        getCommsActivitySignals: async () => ({}),
        computeAdaptiveCadence: () => ({ tight: false }),
        ASSIGNMENT_RECENCY_WINDOW_MS: 6 * 60 * 60 * 1000,
        ws: {
          DIRECTIVE_KINDS,
          getMessagesForSession: async (_sb, _sid, opts) => {
            calls.fetchOpts = opts;
            if (throwOnFetch) throw new Error('directive query exploded');
            return directives;
          },
        },
      },
    },
  };
}

const seed = (n) => Array.from({ length: n }, (_, i) => ({
  id: `msg-${i}`,
  payload: { kind: i === 0 ? 'coordinator_request' : 'coordinator_directive' },
}));

describe('QF-20260807-368 — idle surfaces pending directives', () => {
  it('reports the FULL count on the plain idle terminal — 12 seeded, 12 reported', async () => {
    const { ctx } = makeCtx({ directives: seed(12) });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle');
    // The number is the assertion. Any window/truncation anywhere reports fewer than 12.
    expect(out.message).toContain('PENDING DIRECTIVES (12)');
    expect(out.message).toContain('READ AND ACTION THEM NOW');
  });

  it('reports it on the idle_fable_propose terminal too — the path that actually went silent', async () => {
    // This is the terminal session 7c0540c2 hit on every check-in while three requests waited.
    // Fixing only the plain `idle` return would repeat the exact fix-the-instance error being fixed.
    const { ctx } = makeCtx({ directives: seed(12), model: 'fable' });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle_fable_propose');
    expect(out.message).toContain('PENDING DIRECTIVES (12)');
  });

  it('says nothing when nothing is pending — silence must stay meaningful', async () => {
    for (const model of [undefined, 'fable']) {
      const { ctx } = makeCtx({ directives: [], model });
      const out = await idleStep.run(ctx);
      expect(out.message).not.toContain('PENDING DIRECTIVE');
    }
  });

  it('SURFACE ONLY — asks for unacked rows and never writes', async () => {
    // read_at IS NULL is the deliberate deliver-not-consume signal for DIRECTIVE_KINDS; stamping it
    // here would re-introduce a corrected regression and forge a read receipt the worker never earned.
    const { ctx, calls } = makeCtx({ directives: seed(3) });
    await idleStep.run(ctx);
    expect(calls.fetchOpts.unackedOnly).toBe(true);
    expect(calls.fetchOpts.sinceIso).toBeTruthy();
    expect(calls.writes, 'the idle path must not write anything').toBe(0);
  });

  it('FAIL-OPEN — a directive-query fault must never break the check-in', async () => {
    // An idle worker that crashes its own check-in is worse off than one that misses a count.
    const { ctx } = makeCtx({ throwOnFetch: true });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle');
    expect(out.recommended_wakeup_seconds).toBe(1200);
    expect(out.message).not.toContain('PENDING DIRECTIVE');
  });

  it('ignores non-directive kinds rather than inflating the count', async () => {
    const { ctx } = makeCtx({ directives: [
      { id: 'a', payload: { kind: 'coordinator_request' } },
      { id: 'b', payload: { kind: 'coordinator_reply' } },   // not a directive kind
      { id: 'c', payload: { kind: 'SET_IDENTITY' } },        // not a directive kind
    ] });
    const out = await idleStep.run(ctx);
    expect(out.message).toContain('PENDING DIRECTIVE (1)');
  });
});
