// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — reaper scheduled-task registration.

import { describe, it, expect } from 'vitest';
import {
  buildReaperSchtasksArgs,
  principalSpecFor,
  TASK_NAME,
} from '../../../scripts/setup-console-reaper-task.mjs';

describe('FR5-TASK: the reaper must never be registered interactively', () => {
  it('REFUSES --interactive at CONSTRUCTION, not merely in docs', () => {
    // The guard sits where the command is BUILT. Emitting argv and trusting the caller not to
    // run it would leave the unsafe command one copy-paste away.
    expect(() => buildReaperSchtasksArgs({ interactive: true }))
      .toThrow(/leaks a console per run/);
  });

  it('NEVER emits /IT — that flag IS the leak mechanism', () => {
    const args = buildReaperSchtasksArgs({ requireRunner: false });
    expect(args).not.toContain('/IT');
  });

  it('refuses a named interactive user, because that is not a session-0 principal', () => {
    expect(() => buildReaperSchtasksArgs({ runAs: 'rickf' }))
      .toThrow(/not a recognised session-0 logon type/);
  });

  it('accepts the session-0 accounts', () => {
    for (const acct of ['SYSTEM', 'NT AUTHORITY\\SYSTEM', 'LocalService', 'NetworkService']) {
      expect(() => buildReaperSchtasksArgs({ runAs: acct, requireRunner: false })).not.toThrow();
    }
  });

  it('REFUSES to build a command pointing at a MISSING runner', () => {
    // Registering a task whose target does not exist succeeds, then fails silently every
    // interval — the accepted-but-unread shape this SD has now hit five times. The path is
    // injected so this asserts the GUARD, not the incidental presence of a sibling file.
    expect(() => buildReaperSchtasksArgs({ requireRunner: true, runnerPath: 'C:/nope/missing-runner.mjs' }))
      .toThrow(/runner not found/);
  });

  it('ACCEPTS the real runner, which now exists — the gate releases', () => {
    expect(() => buildReaperSchtasksArgs({ requireRunner: true })).not.toThrow();
  });

  it('maps run-as to the principal spec the shared validator understands', () => {
    expect(principalSpecFor('SYSTEM').logonType).toBe('ServiceAccount');
    expect(principalSpecFor('rickf').logonType).toBe('Password');
    expect(principalSpecFor('SYSTEM', { interactive: true }).logonType).toBe('Interactive');
  });
});

describe('FR5-TASK: argv shape', () => {
  it('defaults to SYSTEM at HIGHEST run level and is idempotent (/F)', () => {
    const args = buildReaperSchtasksArgs({ requireRunner: false });
    expect(args).toEqual(expect.arrayContaining(['/RU', 'SYSTEM', '/RL', 'HIGHEST', '/F']));
    expect(args).toEqual(expect.arrayContaining(['/TN', TASK_NAME]));
  });

  it('schedules on a MINUTE interval', () => {
    const args = buildReaperSchtasksArgs({ intervalMinutes: 15, requireRunner: false });
    const i = args.indexOf('/MO');
    expect(args[i - 1]).toBe('MINUTE');
    expect(args[i + 1]).toBe('15');
  });

  it('rejects a nonsense interval rather than registering a task that never fires sanely', () => {
    for (const bad of [0, -1, 1440, 2.5, 'soon']) {
      expect(() => buildReaperSchtasksArgs({ intervalMinutes: bad, requireRunner: false })).toThrow(/interval-minutes/);
    }
  });
});
