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
 *
 * QF-20260817-962 — count-vs-rows split fixed. The directive note used to run its OWN separate
 * getMessagesForSession query, a second DB read of the exact same "unacked coordinator push"
 * concept roll-call.cjs already fetched into ctx.base.coordinator_messages moments earlier in the
 * same checkin call. Two reads at two different instants let a directive land in the gap: visible
 * to the later (count) read, invisible to the earlier (rows) read already baked into the JSON
 * response — count>0, rows=[] in one response (measured live, session Golf-2, 2026-08-17). The fix
 * derives the note from ctx.base.coordinator_messages instead of issuing a second read, so the two
 * can no longer disagree — there is only one query left to disagree with itself. Tests below now
 * seed `coordinator_messages` (the single source) rather than driving getMessagesForSession, and
 * assert getMessagesForSession is never called by this step at all.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const idleStep = require('../../lib/checkin/steps/idle.cjs');

const DIRECTIVE_KINDS = ['coordinator_request', 'coordinator_directive', 'fence_notice'];

function makeCtx({ coordinatorMessages = [], model, base = {} } = {}) {
  const calls = { writes: 0, getMessagesForSessionCalls: 0 };
  return {
    calls,
    ctx: {
      sb: {
        // Any write attempt is a contract violation: this path is SURFACE-ONLY.
        from() { calls.writes += 1; return { update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }; },
      },
      sessionId: 'S-1',
      sessionMetadata: model ? { model } : {},
      base: { belt_ranked_claimable: 0, belt_claimable_at_my_tier: 0, work_class_fenced: [], coordinator_messages: coordinatorMessages, ...base },
      helpers: {
        DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
        getCommsActivitySignals: async () => ({}),
        computeAdaptiveCadence: () => ({ tight: false }),
        ws: {
          DIRECTIVE_KINDS,
          // QF-20260817-962: idle.cjs must never call this — the note is derived from
          // ctx.base.coordinator_messages alone. Kept here only so a regression that
          // re-introduces a second read fails LOUD (see the "never re-reads" test below)
          // instead of silently passing because the mock happens to agree.
          getMessagesForSession: async () => {
            calls.getMessagesForSessionCalls += 1;
            throw new Error('idle.cjs must not issue a second directive read — this is the QF-20260817-962 regression');
          },
        },
      },
    },
  };
}

// Pre-normalized shape surfaceCoordinatorMessages actually produces on ctx.base.coordinator_messages
// (roll-call.cjs, upstream of idle.cjs in the step pipeline) — {id, message_type, kind, ...}, not the
// raw {payload:{kind}} row shape getMessagesForSession returns.
const seed = (n) => Array.from({ length: n }, (_, i) => ({
  id: `msg-${i}`,
  message_type: 'INFO',
  kind: i === 0 ? 'coordinator_request' : 'coordinator_directive',
}));

describe('QF-20260807-368 — idle surfaces pending directives', () => {
  it('reports the FULL count on the plain idle terminal — 12 seeded, 12 reported', async () => {
    const { ctx } = makeCtx({ coordinatorMessages: seed(12) });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle');
    // The number is the assertion. Any window/truncation anywhere reports fewer than 12.
    expect(out.message).toContain('PENDING DIRECTIVES (12)');
    expect(out.message).toContain('READ AND ACTION THEM NOW');
  });

  it('reports it on the idle_fable_propose terminal too — the path that actually went silent', async () => {
    // This is the terminal session 7c0540c2 hit on every check-in while three requests waited.
    // Fixing only the plain `idle` return would repeat the exact fix-the-instance error being fixed.
    const { ctx } = makeCtx({ coordinatorMessages: seed(12), model: 'fable' });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle_fable_propose');
    expect(out.message).toContain('PENDING DIRECTIVES (12)');
  });

  it('says nothing when nothing is pending — silence must stay meaningful', async () => {
    for (const model of [undefined, 'fable']) {
      const { ctx } = makeCtx({ coordinatorMessages: [], model });
      const out = await idleStep.run(ctx);
      expect(out.message).not.toContain('PENDING DIRECTIVE');
    }
  });

  it('ignores non-directive kinds rather than inflating the count', async () => {
    const { ctx } = makeCtx({ coordinatorMessages: [
      { id: 'a', message_type: 'INFO', kind: 'coordinator_request' },
      { id: 'b', message_type: 'INFO', kind: 'coordinator_reply' },   // not a directive kind
      { id: 'c', message_type: 'SET_IDENTITY', kind: null },          // not a directive kind
    ] });
    const out = await idleStep.run(ctx);
    expect(out.message).toContain('PENDING DIRECTIVE (1)');
  });

  it('FAIL-OPEN — a malformed coordinator_messages entry must never break the check-in', async () => {
    // An idle worker that crashes its own check-in is worse off than one that misses a count.
    const { ctx } = makeCtx({ coordinatorMessages: [null] });
    const out = await idleStep.run(ctx);
    expect(out.action).toBe('idle');
    expect(out.recommended_wakeup_seconds).toBe(1200);
    expect(out.message).not.toContain('PENDING DIRECTIVE');
  });
});

describe('QF-20260817-962 — count and rows share one predicate', () => {
  it('never issues a second directive read — the note is derived from ctx.base.coordinator_messages alone', async () => {
    const { ctx, calls } = makeCtx({ coordinatorMessages: seed(3) });
    const out = await idleStep.run(ctx);
    expect(out.message).toContain('PENDING DIRECTIVES (3)');
    expect(calls.getMessagesForSessionCalls, 'idle.cjs must not re-query — that second read is the exact race this QF closes').toBe(0);
    expect(calls.writes, 'the idle path must not write anything').toBe(0);
  });

  it('the reported count and the array length structurally agree — same source, same instant', async () => {
    // Before the fix these were two independent DB reads that could observe different snapshots.
    // After the fix there is exactly one array to disagree with itself, so count === array.length
    // by construction, not by luck.
    const messages = seed(7);
    const { ctx } = makeCtx({ coordinatorMessages: messages });
    const out = await idleStep.run(ctx);
    const directiveCount = messages.filter((m) => DIRECTIVE_KINDS.includes(m.kind)).length;
    expect(out.message).toContain(`PENDING DIRECTIVES (${directiveCount})`);
    expect(out.coordinator_messages).toBe(messages); // same array reference, single source of truth
  });
});
