/**
 * SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-4) — investigation of directed-assignment's REJECTION
 * fall-through paths.
 *
 * QUESTION: when a directed WORK_ASSIGNMENT claim attempt is REJECTED by claim_sd (a non-terminal
 * refusal such as claimed_by_live_peer, or this SD's new claim_switch_refused_mid_ci), does the
 * check-in pipeline correctly fall through to the self-claim tiers, or does it get stuck having
 * already skipped them for this tick?
 *
 * FINDING (no code change required — see lib/checkin/pipeline.cjs's contract: "a TRUTHY return
 * short-circuits the pipeline... a falsy return falls through to the next step"):
 * lib/checkin/steps/directed-assignment.cjs's non-terminal-rejection branch (the `else` at the
 * bottom of the sdKey block, guarding `if (TERMINAL_CLAIM_ERRORS.has(claimed.error))`) calls
 * markDeliveredOnly + sets ctx.base.assignment_claim_error, but never `return`s a value — so the
 * function implicitly returns undefined, which runSteps() (lib/checkin/pipeline.cjs) correctly
 * treats as "try the next step" (critical-qf-jump -> merged-pool-self-claim -> self-claim-qf, per
 * the registry order in lib/checkin/steps/index.cjs). The terminal-rejection branch above it
 * behaves identically (also no return). This test pins that contract directly against
 * directed-assignment.cjs's run(), rather than trusting the source read alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const step = require_(path.join(REPO, 'lib/checkin/steps/directed-assignment.cjs'));

const QF_KEY = 'QF-TEST-REJECT-FALLTHROUGH-001';

function makeAssignment(overrides = {}) {
  return {
    id: 'msg-assignment-1',
    message_type: 'WORK_ASSIGNMENT',
    // Already delivered so markDeliveredOnly's read_at check short-circuits without touching sb.
    read_at: new Date().toISOString(),
    payload: { assigned_sd: QF_KEY },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSb({ qfRow = { status: 'open', not_before: null } } = {}) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        // QF- key never matches an SD row -- assignedSdRow stays null, which short-circuits the
        // ineligibility/worktree-liveness checks in directed-assignment.cjs without needing to
        // mock classifyAllDispatchIneligibility / isCwdWorktreeLiveClaim.
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
      }
      if (table === 'quick_fixes') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: qfRow, error: null }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function makeHelpers({ tryClaimResult, terminalErrors = ['sd_terminal_status', 'sd_not_found'] }) {
  return {
    ws: { getMessagesForSession: vi.fn(async () => [makeAssignment()]) },
    extractSdFromAssignment: () => QF_KEY,
    isInformationalNudge: () => false,
    tryClaim: vi.fn(async () => tryClaimResult),
    stampDirectedAssignment: vi.fn(async () => {}),
    ackMessage: vi.fn(async () => ({ acknowledged: true })),
    antiWinddownDirective: () => '',
    ASSIGNMENT_RECENCY_WINDOW_MS: 24 * 60 * 60 * 1000,
    TERMINAL_CLAIM_ERRORS: new Set(terminalErrors),
  };
}

describe('FR-4: directed-assignment REJECTION falls through to self-claim (no gap found)', () => {
  it('a NEW non-terminal refusal (claim_switch_refused_mid_ci, FR-2) falls through: run() returns undefined, not a short-circuit', async () => {
    const helpers = makeHelpers({ tryClaimResult: { ok: false, error: 'claim_switch_refused_mid_ci' } });
    const ctx = { sb: makeSb(), sessionId: 'test-session-fallthrough', sessionRole: 'worker', helpers, base: {} };
    const result = await step.run(ctx);
    expect(result).toBeUndefined();
    // The deferred breadcrumb is set so the tick is observable, not silent.
    expect(ctx.base.assignment_claim_error).toBe('claim_switch_refused_mid_ci');
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'deferred', sd_key: QF_KEY, reason: 'claim_switch_refused_mid_ci' });
    // ackMessage must NOT be called for a transient (non-terminal) rejection -- the assignment
    // stays live for a retry, matching the existing claimed_by_live_peer behavior.
    expect(helpers.ackMessage).not.toHaveBeenCalled();
  });

  it('an EXISTING non-terminal refusal (claimed_by_live_peer) also falls through identically', async () => {
    const helpers = makeHelpers({ tryClaimResult: { ok: false, error: 'claimed_by_live_peer' } });
    const ctx = { sb: makeSb(), sessionId: 'test-session-fallthrough', sessionRole: 'worker', helpers, base: {} };
    const result = await step.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'deferred', sd_key: QF_KEY, reason: 'claimed_by_live_peer' });
  });

  it('a TERMINAL refusal also falls through (undefined), distinguished only by the purge breadcrumb', async () => {
    const helpers = makeHelpers({ tryClaimResult: { ok: false, error: 'sd_terminal_status' } });
    const ctx = { sb: makeSb(), sessionId: 'test-session-fallthrough', sessionRole: 'worker', helpers, base: {} };
    const result = await step.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.base.assignment_claim_terminal_purged).toMatchObject({ sd: QF_KEY, error: 'sd_terminal_status' });
    expect(ctx.base.directed_lane_verdict).toMatchObject({ outcome: 'skipped', sd_key: QF_KEY, reason: 'claim_terminal:sd_terminal_status' });
    expect(helpers.ackMessage).toHaveBeenCalledTimes(1);
  });

  it('[CONTRAST] a SUCCESSFUL claim DOES short-circuit (truthy return) -- proves the test setup can distinguish fall-through from short-circuit', async () => {
    const helpers = makeHelpers({ tryClaimResult: { ok: true } });
    const ctx = { sb: makeSb(), sessionId: 'test-session-fallthrough', sessionRole: 'worker', helpers, base: {} };
    const result = await step.run(ctx);
    expect(result).toBeTruthy();
    expect(result.action).toBe('claimed_assignment');
  });

  it('pipeline-level: runSteps() proceeds to the next step when directed-assignment.run() returns undefined', async () => {
    const { runSteps } = require_(path.join(REPO, 'lib/checkin/pipeline.cjs'));
    const helpers = makeHelpers({ tryClaimResult: { ok: false, error: 'claim_switch_refused_mid_ci' } });
    const ctx = { sb: makeSb(), sessionId: 'test-session-fallthrough', sessionRole: 'worker', helpers, base: {} };
    const nextStepRun = vi.fn(async () => ({ action: 'self_claimed', sd: 'SD-NEXT-001' }));
    const steps = [
      { name: 'directed-assignment', run: (c) => step.run(c) },
      { name: 'next-self-claim-tier', run: nextStepRun },
    ];
    const resolution = await runSteps(steps, ctx);
    expect(nextStepRun).toHaveBeenCalledTimes(1);
    expect(resolution).toMatchObject({ action: 'self_claimed', sd: 'SD-NEXT-001' });
  });
});
