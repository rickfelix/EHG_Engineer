// QF-20260803-882 — the freeze remedy had a path where the alarm does not fire.
//
// fleet-down-alert main() ran its two notification arms as bare awaits with nothing between them,
// and the EMAIL arm ran FIRST. A throw from Resend — provider outage, rate limit, malformed address
// — aborted main() before the chairman pager arm ever ran. So the fleet-down pager, shipped as the
// remedy for worker freezes, could silently not fire at all: a suppressed run and a clean run were
// indistinguishable in both the log and the exit code.
//
// The acceptance is TWO-SIDED on purpose, and the QF says why: "a control must not become silent in
// either direction". Isolating the arms so the pager survives an email failure is only half of it —
// if the pager arm fails, email must still send AND the failure must be visible. A fix that made
// failures quiet in the other direction would pass a one-sided test and reintroduce the defect
// wearing the opposite mask.
import { describe, it, expect } from 'vitest';
import { runAlertArm, runAlertArms } from '../../scripts/fleet-down-alert.mjs';

const io = () => {
  const errs = [];
  return { io: { error: (m) => errs.push(String(m)) }, errs };
};

describe('QF-20260803-882: neither arm can suppress the other', () => {
  // (a) THE WITNESSED PATH. Email throws; the pager must still fire.
  it('an email-arm throw does NOT suppress the coordinator pager', async () => {
    const fired = [];
    const { io: i } = io();
    const { failed } = await runAlertArms([
      ['dead-coordinator-pager', async () => { fired.push('pager'); }],
      ['worker-fleet-email', async () => { throw new Error('resend 429'); }],
    ], i);
    expect(fired).toContain('pager');
    expect(failed.map((f) => f.name)).toEqual(['worker-fleet-email']);
  });

  // (b) THE OTHER DIRECTION, which the QF names explicitly. A control must not go silent either way.
  it('a pager-arm throw does NOT suppress email, and the failure is LOGGED not swallowed', async () => {
    const fired = [];
    const { io: i, errs } = io();
    const { failed } = await runAlertArms([
      ['dead-coordinator-pager', async () => { throw new Error('sms gateway down'); }],
      ['worker-fleet-email', async () => { fired.push('email'); }],
    ], i);
    expect(fired).toContain('email');
    expect(failed.map((f) => f.name)).toEqual(['dead-coordinator-pager']);
    // Swallowing is the failure mode being fixed — the arm failure must be visible.
    expect(errs.join('\n')).toMatch(/ARM FAILED: dead-coordinator-pager/);
    expect(errs.join('\n')).toMatch(/sms gateway down/);
  });

  // A half-delivered alert must be distinguishable from a clean run. Without this, the workflow
  // treats a partial page as success — the same silence one layer up.
  it('reports PARTIAL DELIVERY when any arm fails', async () => {
    const { io: i, errs } = io();
    await runAlertArms([
      ['dead-coordinator-pager', async () => {}],
      ['worker-fleet-email', async () => { throw new Error('boom'); }],
    ], i);
    expect(errs.join('\n')).toMatch(/PARTIAL DELIVERY: 1 of 2/);
    expect(errs.join('\n')).toMatch(/did NOT fully fire/);
  });

  // CONTROL — the guard must not report failure on a healthy run, or the signal means nothing.
  it('CONTROL: a clean run reports no failures and logs nothing', async () => {
    const { io: i, errs } = io();
    const { results, failed } = await runAlertArms([
      ['dead-coordinator-pager', async () => {}],
      ['worker-fleet-email', async () => {}],
    ], i);
    expect(failed).toEqual([]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(errs).toEqual([]);
  });

  // BOTH arms failing must still be survivable and fully reported — the worst case is exactly when
  // the operator most needs to know the alert did not reach them.
  it('survives BOTH arms throwing and names both', async () => {
    const { io: i, errs } = io();
    const { failed } = await runAlertArms([
      ['dead-coordinator-pager', async () => { throw new Error('a'); }],
      ['worker-fleet-email', async () => { throw new Error('b'); }],
    ], i);
    expect(failed.map((f) => f.name).sort()).toEqual(['dead-coordinator-pager', 'worker-fleet-email']);
    expect(errs.join('\n')).toMatch(/PARTIAL DELIVERY: 2 of 2/);
  });

  it('runAlertArm never throws, whatever the arm does', async () => {
    const { io: i } = io();
    for (const thrower of [() => { throw new Error('x'); }, async () => { throw 'not-an-error'; }]) {
      await expect(runAlertArm('t', thrower, i)).resolves.toMatchObject({ ok: false });
    }
  });
});

describe('the pager arm is ordered FIRST', () => {
  // Isolation already prevents suppression, so ordering is belt-and-braces: if the process is
  // killed mid-run (workflow timeout, runner eviction), the arm that already fired should be the
  // one that reaches a human.
  it('runs arms in the order given, pager before email', async () => {
    const order = [];
    const { io: i } = io();
    await runAlertArms([
      ['dead-coordinator-pager', async () => { order.push('pager'); }],
      ['worker-fleet-email', async () => { order.push('email'); }],
    ], i);
    expect(order).toEqual(['pager', 'email']);
  });
});
