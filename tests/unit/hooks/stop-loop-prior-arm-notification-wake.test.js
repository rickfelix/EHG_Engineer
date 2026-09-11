// QF-20260903-916 — a task-notification re-invokes a seat ~60s into a 459s armed wake; the Stop
// hook sees "no ScheduleWakeup in the current turn" and blocks, burning consecutive turns re-polling
// external state the pending wake was already going to carry. Fixtures named by the QF row.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { findPendingPriorArm, isEnforcementDisabled, ENFORCEMENT_ID, ENFORCEMENT_ID_PRIOR_ARM_CARRY } = require(path.resolve(__dirname, '../../../scripts/hooks/lib/wakeup-arm-evidence.cjs'));
const { shouldRemind, decideMessageBlock, classifyWindDownReason } = require(path.resolve(__dirname, '../../../scripts/hooks/stop-loop-wakeup-reminder.cjs'));

const NOW = 1_800_000_000_000;
const worker = { loopState: 'awaiting_tick', stopHookActive: false, flagEnabled: true, enforcementDisabled: false, hasActiveClaim: true };
const prompt = (promptId, extra = {}) => ({ type: 'user', promptId, message: { content: 'x' }, ...extra });
const armResult = (promptId, scheduledFor) => ({ type: 'user', promptId, toolUseResult: { scheduledFor } });
const opened = { notification: { origin: { kind: 'task-notification' } }, human: { origin: { kind: 'human' } }, wakeup: { scheduledFireId: 'f1' } };
const decide = (entries) => {
  const prior = findPendingPriorArm(entries, { nowMs: NOW });
  const priorArmCarries = Boolean(prior.pending && prior.notificationOpened);
  return shouldRemind({ ...worker, armVerdict: 'unarmed', priorArmCarries });
};

describe('QF-20260903-916 — armed previous turn, re-invoked before due', () => {
  it('notification-opened turn with a not-yet-due prior arm ends silently', () => {
    const entries = [prompt('p1'), armResult('p1', NOW + 400_000), prompt('p2', opened.notification)];
    expect(findPendingPriorArm(entries, { nowMs: NOW })).toMatchObject({ pending: true, notificationOpened: true, dueInMs: 400_000 });
    expect(decide(entries)).toBe(false);
  });
  it('user-text (human) turn with the same prior arm still blocks once', () => {
    expect(decide([prompt('p1'), armResult('p1', NOW + 400_000), prompt('p2', opened.human)])).toBe(true);
  });
  it('no arm anywhere blocks once', () => {
    expect(decide([prompt('p1'), prompt('p2', opened.notification)])).toBe(true);
  });
  it('a prior arm that is already due does not excuse the stop', () => {
    expect(decide([prompt('p1'), armResult('p1', NOW - 1), prompt('p2', opened.notification)])).toBe(true);
  });
  it('a prior arm consumed by its own fire does not excuse a later notification turn', () => {
    const entries = [prompt('p1'), armResult('p1', NOW + 400_000), prompt('p2', opened.wakeup), prompt('p3', opened.notification)];
    expect(findPendingPriorArm(entries, { nowMs: NOW }).reason).toBe('prior arm already fired');
    expect(decide(entries)).toBe(true);
  });
  it('a stop:true arm in the prior turn is a loop end, not a pending wake', () => {
    const stopArm = { type: 'assistant', promptId: 'p1', message: { content: [{ type: 'tool_use', name: 'ScheduleWakeup', input: { stop: true } }] } };
    expect(decide([prompt('p1'), armResult('p1', NOW + 400_000), stopArm, prompt('p2', opened.notification)])).toBe(true);
  });
});

// SD-LEO-FIX-STOP-HOOK-OVERRIDES-001 FR-7..FR-10 — the three suppression-direction branches TESTING
// 4b182e6d and RISK fa2a41f4 measured, each pinned to fail toward BLOCK.
describe('SD-LEO-FIX-STOP-HOOK-OVERRIDES-001 — fail toward block, never toward silence', () => {
  it('TS-11: a throwing entry cannot take the verdict down — the probe is total and reads pending=false', () => {
    const poison = { type: 'user', promptId: 'p2', get origin() { throw new Error('boom'); } };
    const r = findPendingPriorArm([prompt('p1'), armResult('p1', NOW + 400_000), poison], { nowMs: NOW });
    expect(r.pending).toBe(false);
    expect(r.reason).toMatch(/threw/);
    expect(shouldRemind({ ...worker, armVerdict: 'unarmed', priorArmCarries: Boolean(r.pending && r.notificationOpened) })).toBe(true);
  });
  it('TS-8 leg 3 / FR-10: a renamed fire marker cannot resurrect an arm from an older turn (scan is bounded)', () => {
    const entries = [prompt('p1'), armResult('p1', NOW + 400_000), prompt('p2', { firedId: 'renamed' }), prompt('p3', opened.notification)];
    const r = findPendingPriorArm(entries, { nowMs: NOW });
    expect(r.pending).toBe(false);
    expect(r.reason).toMatch(/bounded to the prior turn/);
    expect(decide(entries)).toBe(true);
  });
  it('TS-8 legs 1-2: renamed scheduledFor or origin.kind fail toward block', () => {
    const renamedArm = { type: 'user', promptId: 'p1', toolUseResult: { scheduled_for: NOW + 400_000 } };
    expect(decide([prompt('p1'), renamedArm, prompt('p2', opened.notification)])).toBe(true);
    expect(decide([prompt('p1'), armResult('p1', NOW + 400_000), prompt('p2', { origin: { type: 'task-notification' } })])).toBe(true);
  });
  it('TS-7: the carried path remaps the message decision to armed — routine rows informational, hard interrupts still block', () => {
    const routine = [{ id: 'a', kind: 'coordinator_reply', subject: 'fyi', body: 'x', read_at: null }];
    const hard = [{ id: 'b', kind: 'chairman_directive', subject: 'do', body: 'y', read_at: null }];
    const r1 = decideMessageBlock({ pendingMessages: routine, armVerdict: 'armed' });
    expect(r1.block).toBe(false);
    expect(r1.detail.length).toBeGreaterThan(0);
    const r2 = decideMessageBlock({ pendingMessages: hard, armVerdict: 'armed' });
    expect(r2.block).toBe(true);
    expect(r2.reason).toBe('unacked hard-interrupt row present');
  });
  it('TS-12 / FR-8: a carried turn-end is countable and no longer lands in the step-C bucket', () => {
    const base = { windDownSignaled: false, stopHookActive: false, hasActiveClaim: true, armVerdict: 'unarmed' };
    expect(classifyWindDownReason({ ...base, loopState: 'active', priorArmCarries: true })).toBe('turn_end_carried_by_prior_arm');
    expect(classifyWindDownReason({ ...base, loopState: 'active' })).toBe('turn_end_with_claim_no_wakeup');
    expect(classifyWindDownReason({ ...base, loopState: 'awaiting_tick' })).toBe('turn_end_with_claim_wakeup_scheduled');
    expect(classifyWindDownReason({ ...base, stopHookActive: true, priorArmCarries: true })).toBe('second_stop_still_unarmed');
  });
  it('TS-13 / FR-9: the suppression has its own kill id; the blanket row still disables both', () => {
    const future = new Date(NOW + 60_000).toISOString();
    const carryRow = [{ payload: { enforcement: ENFORCEMENT_ID_PRIOR_ARM_CARRY }, expires_at: future }];
    expect(isEnforcementDisabled(carryRow, { enforcement: ENFORCEMENT_ID_PRIOR_ARM_CARRY, nowMs: NOW })).toBe(true);
    expect(isEnforcementDisabled(carryRow, { enforcement: ENFORCEMENT_ID, nowMs: NOW })).toBe(false);
    const blanket = [{ payload: {}, expires_at: future }];
    expect(isEnforcementDisabled(blanket, { enforcement: ENFORCEMENT_ID_PRIOR_ARM_CARRY, nowMs: NOW })).toBe(true);
    expect(isEnforcementDisabled(blanket, { enforcement: ENFORCEMENT_ID, nowMs: NOW })).toBe(true);
  });
  it('an arm two turns back never carries, even with an intact fire marker absent', () => {
    const entries = [prompt('p0'), armResult('p0', NOW + 400_000), prompt('p1'), prompt('p2', opened.notification)];
    expect(findPendingPriorArm(entries, { nowMs: NOW }).pending).toBe(false);
  });
});
