/**
 * SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E — FR-3 canary claim fence.
 *
 * TR-6 REQUIRED THIS FIXTURE TO BE BUILT, not skipped. There was no tests/unit/checkin/ directory;
 * checkin-pipeline.test.js pins ORDER but runs SYNTHETIC steps only. The cheap path here was to
 * assert the predicate in isolation and call it done — which would have dropped ALL of FR-3's
 * pipeline coverage while still reading green. So these tests drive the REAL exported step array
 * through the REAL pipeline runner, with only the DB and the acquiring tiers stubbed.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const STEPS = require('../../../lib/checkin/steps/index.cjs');
const fence = require('../../../lib/checkin/steps/canary-claim-fence.cjs');
const { runSteps } = require('../../../lib/checkin/pipeline.cjs');

const CANARY_PRE_REGISTRATION_KIND = 'canary_pre_registration';

/** Minimal supabase double: only the shape canary-session.js actually uses. */
function sbWithPreRegistration({ rows = [], error = null } = {}) {
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    limit() { return Promise.resolve({ data: rows, error }); },
  };
  return api;
}

/** ctx mirroring resolveCheckin's real construction (worker-checkin.cjs:1609-1621). */
function makeCtx({ metadata = {}, sb = sbWithPreRegistration(), helpers = {} } = {}) {
  return {
    sb,
    sessionId: 'sess-under-test',
    opts: {},
    coordinatorId: 'coord-1',
    callsign: null,
    mySd: null,
    sessionRole: null,
    sessionMetadata: metadata,
    base: { callsign: null },
    helpers: {
      ws: { getMessagesForSession: async () => [], DIRECTIVE_KINDS: [] },
      ackMessage: async () => {},
      isInformationalNudge: () => false,
      ASSIGNMENT_RECENCY_WINDOW_MS: 86_400_000,
      DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
      ...helpers,
    },
  };
}

describe('FR-3 placement — the fence must sit above every acquisition tier', () => {
  const names = STEPS.map((s) => s.name);

  it('is registered in the pipeline at all', () => {
    expect(names).toContain('canary-claim-fence');
  });

  it('runs BEFORE every acquiring step', () => {
    // TS-10: a future insertion must not be able to silently demote the fence below a claim tier.
    // Asserting against the REAL exported array is what makes this a regression guard rather than
    // a restatement of the source.
    const fenceIdx = names.indexOf('canary-claim-fence');
    const acquiring = [
      'directed-assignment',        // 8  — coordinator dispatch
      'recover-stranded-final',     // 10 — stranded LEAD_FINAL recovery
      'adopt-orphan',               // 11 — orphan in_progress adoption
      'critical-qf-jump',           // 14
      'merged-pool-self-claim',     // 15 (two claim sites)
      'self-claim-qf',              // 16
    ];
    for (const step of acquiring) {
      const idx = names.indexOf(step);
      expect(idx, `${step} must be present`).toBeGreaterThan(-1);
      expect(fenceIdx, `fence must precede ${step}`).toBeLessThan(idx);
    }
  });

  it('sits after resume, which is deliberately NOT fenced', () => {
    // resume is reachable only when a claim is ALREADY held — the state the fence prevents. Fencing
    // it would strand a canary that somehow acquired one, instead of letting it resume and be seen.
    expect(names.indexOf('resume')).toBeLessThan(names.indexOf('canary-claim-fence'));
  });
});

describe('FR-3 behaviour through the REAL pipeline runner', () => {
  it('TS-1: a canary short-circuits and NO acquiring step runs', async () => {
    const ran = [];
    const spy = (name) => ({ name, async run() { ran.push(name); return null; } });
    // Real fence, real runner; downstream tiers replaced with recorders so "did not run" is provable.
    const pipeline = [fence, spy('directed-assignment'), spy('recover-stranded-final'), spy('adopt-orphan'), spy('self-claim-qf')];
    const ctx = makeCtx({ metadata: { account_profile: 'canary' } });

    const out = await runSteps(pipeline, ctx);

    expect(out.action).toBe('idle');
    expect(out.canary_fence_reason).toBe('canary_metadata');
    expect(out.message).toMatch(/FENCED/);
    expect(ran).toEqual([]); // the whole point: zero acquisition attempts
  });

  it('TS-13: fences from the PRE-REGISTRATION alone with metadata EMPTY (the 0-10s window)', async () => {
    const ran = [];
    const pipeline = [fence, { name: 'directed-assignment', async run() { ran.push('x'); return null; } }];
    const ctx = makeCtx({ metadata: {}, sb: sbWithPreRegistration({ rows: [{ id: 'pre-1' }] }) });

    const out = await runSteps(pipeline, ctx);

    expect(out.canary_fence_reason).toBe('canary_pre_registration');
    expect(ran).toEqual([]);
  });

  it('TS-4 NEGATIVE CONTROL: an ordinary worker is NOT fenced and DOES reach the tiers', async () => {
    // Without this the fence could be unconditional and every other test would still pass.
    const ran = [];
    const pipeline = [fence, { name: 'directed-assignment', async run() { ran.push('directed-assignment'); return { action: 'claimed_assignment' }; } }];
    const ctx = makeCtx({ metadata: { account_profile: 'live', fleet_identity: { callsign: 'Bravo' } } });

    const out = await runSteps(pipeline, ctx);

    expect(ran).toEqual(['directed-assignment']);
    expect(out.action).toBe('claimed_assignment');
    expect(out.canary_fence_reason).toBeUndefined();
  });

  it('TS-11: ACKS-AND-DECLINES a directed WORK_ASSIGNMENT so none is stranded (b8eb6111)', async () => {
    const acked = [];
    const ctx = makeCtx({
      metadata: { canary_session: true },
      helpers: {
        ws: {
          getMessagesForSession: async () => [
            { id: 'wa-1', message_type: 'WORK_ASSIGNMENT', payload: { kind: 'work_assignment' } },
            { id: 'info-1', message_type: 'WORK_ASSIGNMENT', payload: { kind: 'completion_nudge' } },
            { id: 'other', message_type: 'INFO', payload: {} },
          ],
          DIRECTIVE_KINDS: [],
        },
        isInformationalNudge: (m) => m.payload && m.payload.kind === 'completion_nudge',
        ackMessage: async (_sb, id) => { acked.push(id); },
      },
    });

    const out = await runSteps([fence], ctx);

    expect(acked).toEqual(['wa-1']); // the real assignment only — nudge and INFO untouched
    expect(out.message).toMatch(/Declined 1 directed WORK_ASSIGNMENT/);
    expect(out.message).toMatch(/b8eb6111/);
  });

  it('a failing ack does NOT convert the fence into a pass-through', async () => {
    // The fence standing is more important than the decline succeeding.
    const ran = [];
    const ctx = makeCtx({
      metadata: { canary_session: true },
      helpers: {
        ws: { getMessagesForSession: async () => { throw new Error('inbox unreachable'); }, DIRECTIVE_KINDS: [] },
      },
    });

    const out = await runSteps([fence, { name: 'directed-assignment', async run() { ran.push('x'); return null; } }], ctx);

    expect(out.action).toBe('idle');
    expect(out.canary_fence_reason).toBe('canary_metadata');
    expect(ran).toEqual([]);
  });

  it('FR-2: an INDETERMINATE canary check fences (fail-closed) rather than falling through', async () => {
    const ran = [];
    const ctx = makeCtx({ metadata: {}, sb: sbWithPreRegistration({ error: { message: 'db down' } }) });

    const out = await runSteps([fence, { name: 'directed-assignment', async run() { ran.push('x'); return null; } }], ctx);

    expect(out.canary_fence_reason).toBe('canary_check_indeterminate_fail_closed');
    expect(ran).toEqual([]);
  });

  it('states a REASON so a fenced canary is never mistaken for an idle seat', () => {
    // "The canary just looked idle" is how this defect class hides; the reason is load-bearing.
    const src = require('node:fs').readFileSync(
      require.resolve('../../../lib/checkin/steps/canary-claim-fence.cjs'), 'utf8');
    expect(src).toMatch(/canary_fence_reason/);
  });
});

void CANARY_PRE_REGISTRATION_KIND;
