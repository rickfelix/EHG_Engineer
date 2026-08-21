// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — reaper scheduled-task registration.

import { describe, it, expect } from 'vitest';
import {
  buildReaperSchtasksArgs,
  buildQueryArgs,
  buildRemoveArgs,
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

// SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-2, TS-9 — rollback is proven, not just forward
// activation. The pure argv-construction half is fully testable here; the LIVE round-trip
// (register on the host, confirm FOUND, unregister, confirm NOT FOUND) requires an elevated
// (Administrator) principal this session's shell does not hold -- schtasks /Create refused with
// "Access is denied" for /RU SYSTEM, and none of the sibling watcher tasks are registered on this
// host either, confirming the gap is this execution context's privilege level, not a code defect.
// Whoever completes the elevated registration should run the full round-trip once as final proof;
// this suite is the part of that proof that does not require elevation.
describe('FR5-TASK: rollback (--status / --remove) argv is correct and idempotent', () => {
  it('buildQueryArgs targets the exact task name with a verbose, parseable format', () => {
    expect(buildQueryArgs()).toEqual(['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']);
  });

  it('buildRemoveArgs force-deletes the exact task name (no confirmation prompt to hang on)', () => {
    expect(buildRemoveArgs()).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
  });

  it('query and remove both target LEO-ConsoleReaper specifically, not a wildcard', () => {
    // A wildcard or mistyped name here would make --remove a no-op that reports success, or worse,
    // touch an unrelated task -- the exact "accepted but silently wrong" shape this SD is full of.
    expect(buildQueryArgs()).toContain(TASK_NAME);
    expect(buildRemoveArgs()).toContain(TASK_NAME);
  });
});
