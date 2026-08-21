/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 — TS-3/TS-4: scheduled-task registration
 * (scripts/setup-console-creation-watcher-task.mjs), argv-shape + principal-safety only.
 * Mirrors tests/unit/fleet/console-reaper-task-registration.test.js's pattern.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCreateArgs,
  buildStartupCreateArgs,
  buildRemoveArgs,
  buildWrapperScript,
  assertSafePrincipal,
  verifyPersistedDefinition,
  TASK_NAME,
  STARTUP_TASK_NAME,
} from '../../../scripts/setup-console-creation-watcher-task.mjs';

describe('buildCreateArgs — TS-3', () => {
  it('produces a repeating /SC MINUTE trigger with a non-SYSTEM S4U principal', () => {
    const args = buildCreateArgs({ wrapperPath: 'C:\\wrapper.cmd', runAs: 'rickf' });
    expect(args).toEqual(['/Create', '/TN', TASK_NAME, '/TR', 'C:\\wrapper.cmd', '/SC', 'MINUTE', '/MO', '5', '/F', '/RU', 'rickf', '/NP']);
  });

  it('omits /NP for a well-known service account', () => {
    const args = buildCreateArgs({ wrapperPath: 'C:\\wrapper.cmd', runAs: 'SYSTEM' });
    expect(args).toContain('/RU');
    expect(args).not.toContain('/NP');
  });

  it('throws on an invalid interval', () => {
    expect(() => buildCreateArgs({ wrapperPath: 'C:\\wrapper.cmd', intervalMinutes: 0 })).toThrow();
  });
});

describe('buildStartupCreateArgs — TS-3', () => {
  it('registers the startup companion via /SC ONLOGON with the same principal', () => {
    const args = buildStartupCreateArgs({ wrapperPath: 'C:\\wrapper.cmd', runAs: 'rickf' });
    expect(args).toEqual(['/Create', '/TN', STARTUP_TASK_NAME, '/TR', 'C:\\wrapper.cmd', '/SC', 'ONLOGON', '/F', '/RU', 'rickf', '/NP']);
  });
});

describe('buildRemoveArgs', () => {
  it('targets the given task name', () => {
    expect(buildRemoveArgs(TASK_NAME)).toEqual(['/Delete', '/TN', TASK_NAME, '/F']);
  });
});

describe('buildWrapperScript', () => {
  it('cds to the repo root and calls the npm script', () => {
    const script = buildWrapperScript({ repoRoot: 'C:\\repo' });
    expect(script).toContain('cd /d "C:\\repo"');
    expect(script).toContain('call npm run console-creation-watcher');
  });
});

describe('assertSafePrincipal — TS-4', () => {
  it('accepts a non-empty current-user runAs (S4U, non-interactive)', () => {
    expect(() => assertSafePrincipal('rickf')).not.toThrow();
  });

  it('accepts a well-known service account (SYSTEM)', () => {
    expect(() => assertSafePrincipal('SYSTEM')).not.toThrow();
  });

  it('rejects an empty/undefined runAs — an unspecified principal may default to Interactive', () => {
    expect(() => assertSafePrincipal('')).toThrow(/unsafe scheduled-task principal/);
    expect(() => assertSafePrincipal(undefined)).toThrow(/unsafe scheduled-task principal/);
  });
});

describe('verifyPersistedDefinition', () => {
  it('passes a repeating, enabled cadence definition', () => {
    const xml = '<Task><Triggers><TimeTrigger><Repetition><Interval>PT5M</Interval></Repetition></TimeTrigger></Triggers></Task>';
    expect(verifyPersistedDefinition(xml).ok).toBe(true);
  });

  it('flags a non-repeating definition', () => {
    const xml = '<Task><Triggers><TimeTrigger></TimeTrigger></Triggers></Task>';
    const res = verifyPersistedDefinition(xml);
    expect(res.ok).toBe(false);
    expect(res.problems.join(' ')).toMatch(/no repeating interval/);
  });

  it('flags an explicitly disabled task', () => {
    const xml = '<Task><Triggers><TimeTrigger><Repetition><Interval>PT5M</Interval></Repetition></TimeTrigger></Triggers><Settings><Enabled>false</Enabled></Settings></Task>';
    const res = verifyPersistedDefinition(xml);
    expect(res.ok).toBe(false);
    expect(res.problems.join(' ')).toMatch(/explicitly disabled/);
  });

  it('flags empty input', () => {
    expect(verifyPersistedDefinition('').ok).toBe(false);
  });
});
