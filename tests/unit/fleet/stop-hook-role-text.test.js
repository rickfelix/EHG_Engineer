/**
 * SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-2 — the stop hook keeps its check, changes its text.
 *
 * WHY THE CHECK IS NOT ROLE-GATED. shouldRemind's worker gate is
 *   hasActiveClaim || loop_state IN (active, awaiting_tick)
 * so a ROLE seat that runs a loop has a live loop_state and is already worker-shaped by that
 * predicate. That is exactly how the Solomon seat kept getting worker doctrine, and why the only
 * escape was setting loop_state='exited'. The fix is NOT to exempt role seats from the reminder —
 * a role seat that ends a turn unarmed goes just as silent as a worker. It is to keep the reminder
 * and stop telling it to push WIP on a branch it does not have.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const hook = require_('../../../scripts/hooks/stop-loop-wakeup-reminder.cjs');
const { reminderFor, REMINDER, shouldRemind } = hook;

const WORKER_DOCTRINE = /WIND-DOWN HANDSHAKE|PUSH your WIP|claim-bound branch|prepark-wip|claim-sweep/;
const ARM_REQUIREMENT = /NO ScheduleWakeup tool_use found in THIS turn/;

describe('FR-2 reminder text is selected by seat', () => {
  it('the WORKER reminder still carries the full wind-down doctrine', () => {
    // The two-sided half. If this ever goes quiet, the fix broke the guard it was preserving.
    const w = reminderFor(false);
    expect(w).toMatch(ARM_REQUIREMENT);
    expect(w).toMatch(WORKER_DOCTRINE);
    expect(w).toMatch(/loop_state='exited'/);
  });

  it('the exported REMINDER constant is unchanged — importers and static pins keep their string', () => {
    // Repurposing this constant's meaning would be a silent break for anything importing it.
    expect(REMINDER).toBe(reminderFor(false));
  });

  it('the ROLE reminder drops every worker-doctrine instruction', () => {
    expect(reminderFor(true)).not.toMatch(WORKER_DOCTRINE);
  });

  it('the ROLE reminder KEEPS the arm requirement — the useful half survives', () => {
    // The SD is explicit: keep the arm-a-wakeup check, exempting role seats would trade a noise
    // bug for a silence bug.
    const r = reminderFor(true);
    expect(r).toMatch(ARM_REQUIREMENT);
    expect(r).toMatch(/arm the next tick/);
  });

  it('both seats share the same head — the transcript rule is true for any session', () => {
    const head = 'NO ScheduleWakeup tool_use found in THIS turn';
    expect(reminderFor(true)).toContain(head);
    expect(reminderFor(false)).toContain(head);
  });

  it('CONTROL: the two texts genuinely differ, and each contains what the other asserts absent', () => {
    // Without this, "role text has no worker doctrine" would be satisfied by an empty string, and
    // by a reminderFor that ignored its argument entirely.
    expect(reminderFor(true)).not.toBe(reminderFor(false));
    expect(reminderFor(false)).toMatch(WORKER_DOCTRINE);   // the doctrine really is in the worker text
  });
});

describe('FR-2 the CHECK itself is untouched', () => {
  const base = { flagEnabled: true, enforcementDisabled: false, stopHookActive: false, loopState: 'active' };

  it('still blocks an unarmed worker holding a claim', () => {
    expect(shouldRemind({ ...base, hasActiveClaim: true, armVerdict: 'unarmed' })).toBe(true);
  });

  it('still blocks an unarmed session on a live loop_state — the path a role seat takes', () => {
    // This is the case the SD cares about: a role seat running a loop is worker-shaped to this
    // predicate. It must STILL be reminded; only its wording changes.
    expect(shouldRemind({ ...base, hasActiveClaim: false, armVerdict: 'unarmed' })).toBe(true);
  });

  it('still lets an armed session through', () => {
    expect(shouldRemind({ ...base, hasActiveClaim: true, armVerdict: 'armed' })).toBe(false);
  });

  it("still honours loop_state='exited' and the once-per-turn guard", () => {
    expect(shouldRemind({ ...base, loopState: 'exited', hasActiveClaim: true, armVerdict: 'unarmed' })).toBe(false);
    expect(shouldRemind({ ...base, stopHookActive: true, hasActiveClaim: true, armVerdict: 'unarmed' })).toBe(false);
  });

  it('still fails open on an unknown arm verdict', () => {
    expect(shouldRemind({ ...base, hasActiveClaim: true, armVerdict: 'unknown' })).toBe(false);
  });
});
