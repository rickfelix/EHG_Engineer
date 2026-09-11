// QF-20260903-916 — a task-notification re-invokes a seat ~60s into a 459s armed wake; the Stop
// hook sees "no ScheduleWakeup in the current turn" and blocks, burning consecutive turns re-polling
// external state the pending wake was already going to carry. Fixtures named by the QF row.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { findPendingPriorArm } = require(path.resolve(__dirname, '../../../scripts/hooks/lib/wakeup-arm-evidence.cjs'));
const { shouldRemind } = require(path.resolve(__dirname, '../../../scripts/hooks/stop-loop-wakeup-reminder.cjs'));

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
