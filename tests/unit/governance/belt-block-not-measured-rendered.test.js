/**
 * QF-20260729-685 — NOT_MEASURED must not render as silence, on EITHER idle terminal.
 *
 * THE DEFECT. assessCoordinatorBeltBlock is careful to return NOT_MEASURED rather than OK when its
 * inputs are absent, precisely so an UNREAD belt stays distinguishable from a healthy one. The idle
 * message then threw that distinction away at the last step: the only render branch was
 * `if (belt.blocked)`, and NOT_MEASURED carries blocked:false. Unread and healthy produced
 * byte-identical output — the same silence.
 *
 * THE WORDING ALREADY EXISTED AND WAS UNREACHABLE. formatCoordinatorBeltBlock has always had a
 * NOT_MEASURED arm ("This is NOT a healthy belt; it is an unread one"), but its only production
 * caller sat inside that blocked-guard. Tests reached the arm; production could not.
 *
 * THE WIDER HALF, found by measurement rather than from the QF text: there are TWO idle terminals,
 * and `idle_fable_propose` did not interpolate the note AT ALL. On that path all three states
 * collapsed — including the loud BLOCKED_ON_COORDINATOR case the gauge was built for. A Fable seat
 * could sit on a coordinator-fenced belt and be told only that no Fable-fit work was available.
 *
 * WHY THE CONTROLS ARE NOT OPTIONAL. "NOT_MEASURED renders a note" passes just as well for a fix
 * that emits a note UNCONDITIONALLY, which would destroy the healthy/unread distinction from the
 * other direction and make the gauge noise. Every positive assertion here is therefore paired with
 * a healthy-belt run asserting SILENCE.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const idleStep = require('../../../lib/checkin/steps/idle.cjs');

function makeCtx(base, model) {
  return {
    sb: {},
    sessionId: 'test-session',
    sessionMetadata: model ? { model } : {},
    helpers: {
      getCommsActivitySignals: async () => { throw new Error('stubbed'); },
      computeAdaptiveCadence: () => ({ tight: false, intervalMs: 0, reason: '' }),
      DEFAULT_IDLE_WAKEUP_SECONDS: 1200,
    },
    base,
  };
}

/** Inputs present, belt genuinely fine — the state that SHOULD stay silent. */
const HEALTHY = {
  belt_ranked_claimable: 21,
  belt_claimable_at_my_tier: 0,
  belt_ineligibility_breakdown: { human_action_required: 17, needs_coordinator_review: 2 },
};
/** The breakdown never arrived — the gauge could not see. */
const UNMEASURED = {
  belt_ranked_claimable: 21,
  belt_claimable_at_my_tier: 0,
  // belt_ineligibility_breakdown deliberately absent
};
/** Coordinator-owned bucket largest — the loud case. */
const BLOCKED = {
  belt_ranked_claimable: 21,
  belt_claimable_at_my_tier: 0,
  belt_ineligibility_breakdown: { needs_coordinator_review: 10, human_action_required: 9 },
};

const run = (base, model) => idleStep.run(makeCtx(base, model));

describe('the plain idle terminal', () => {
  it('THE POINT: an UNMEASURED belt says so instead of going silent', async () => {
    const out = await run(UNMEASURED);
    expect(out.action).toBe('idle');
    expect(out.message).toMatch(/NOT_MEASURED/);
    expect(out.message).toMatch(/unread/i);
  });

  it('CONTROL: a HEALTHY belt stays silent — the note is not unconditional', async () => {
    // Without this, an always-emit "fix" passes the test above while erasing the distinction
    // from the other side.
    const out = await run(HEALTHY);
    expect(out.message).not.toMatch(/NOT_MEASURED/);
    expect(out.message).not.toMatch(/BELT BLOCKED/);
  });

  it('DIFFERENTIAL: the belt note is the ONLY thing separating unmeasured from healthy', async () => {
    // THIS TEST WAS REWRITTEN AFTER IT PASSED A MUTATION IT SHOULD HAVE FAILED. The first version
    // compared whole messages for UNMEASURED vs HEALTHY and asserted they differed — which stayed
    // green with the NOT_MEASURED arm disabled, because those two inputs differ in
    // belt_ineligibility_breakdown, and that field ALSO drives the unrelated tierNote. The
    // assertion was reading a difference the fix had nothing to do with: a test that cannot fail
    // when the feature is removed is theatre, and only the mutation run exposed it.
    //
    // Fixed by silencing the confounder: with belt_ranked_claimable 0, formatIdleIneligibilityNote
    // returns '' for BOTH inputs, so the belt note is the only remaining source of difference.
    const quiet = { belt_ranked_claimable: 0, belt_claimable_at_my_tier: 0 };
    const [unmeasured, healthy] = await Promise.all([
      run({ ...quiet }),                                                        // breakdown absent
      run({ ...quiet, belt_ineligibility_breakdown: { human_action_required: 3 } }),
    ]);
    expect(unmeasured.message).not.toBe(healthy.message);
    expect(unmeasured.message).toMatch(/NOT_MEASURED/);
    expect(healthy.message).not.toMatch(/NOT_MEASURED/);
  });

  it('the blocked case is UNCHANGED — this fix adds an arm, it does not move one', async () => {
    const out = await run(BLOCKED);
    expect(out.message).toMatch(/BELT BLOCKED ON THE COORDINATOR/);
  });
});

describe('the idle_fable_propose terminal — the wider half', () => {
  it('renders the belt note at all, which it previously never did', async () => {
    const out = await run(BLOCKED, 'fable');
    expect(out.action).toBe('idle_fable_propose');
    expect(out.message).toMatch(/BELT BLOCKED ON THE COORDINATOR/);
  });

  it('surfaces NOT_MEASURED on this terminal too', async () => {
    const out = await run(UNMEASURED, 'fable');
    expect(out.action).toBe('idle_fable_propose');
    expect(out.message).toMatch(/NOT_MEASURED/);
  });

  it('CONTROL: a healthy belt on a Fable seat stays silent', async () => {
    const out = await run(HEALTHY, 'fable');
    expect(out.action).toBe('idle_fable_propose');
    expect(out.message).not.toMatch(/NOT_MEASURED|BELT BLOCKED/);
  });

  it('CONTROL: the Fable terminal is genuinely being exercised, not the plain one', async () => {
    // If modelWorkClasses ever stopped recognising this model, every assertion above would run
    // against the 'idle' terminal and pass for the wrong reason.
    const [fable, plain] = await Promise.all([run(HEALTHY, 'fable'), run(HEALTHY)]);
    expect(fable.action).toBe('idle_fable_propose');
    expect(plain.action).toBe('idle');
    expect(fable.message).not.toBe(plain.message);
  });
});
