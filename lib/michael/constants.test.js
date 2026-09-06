// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-2, TS-16 — env-resolved chairman constants.
import { describe, it, expect } from 'vitest';
import { resolveConstant, resolveConstants, gmailModifyCeiling, MICHAEL_CONSTANTS } from './constants.mjs';

describe('resolveConstant', () => {
  it('a missing required constant is refusal CONSTANT_MISSING naming the variable (never a throw)', () => {
    expect(resolveConstant('MICHAEL_EXELON_CALENDAR_ID', {})).toEqual({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_EXELON_CALENDAR_ID', message: expect.stringContaining('MICHAEL_EXELON_CALENDAR_ID') });
    expect(resolveConstant('MICHAEL_TASKS_DRIVE_FOLDER_ID', { MICHAEL_TASKS_DRIVE_FOLDER_ID: '   ' })).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING' });
    expect(resolveConstant('MICHAEL_DAILY_CHECKIN_TASK_ID', { MICHAEL_DAILY_CHECKIN_TASK_ID: ' 123 ' })).toEqual({ ok: true, value: '123', source: 'env' });
  });
  it('defaults: the ceiling is 60 and the EHG chairman project id matches chairman-notify.js', () => {
    expect(resolveConstant('MICHAEL_GMAIL_MODIFY_CEILING', {})).toEqual({ ok: true, value: 60, source: 'default' });
    expect(gmailModifyCeiling({})).toEqual({ ok: true, value: 60, source: 'default' });
    expect(resolveConstant('MICHAEL_EHG_CHAIRMAN_PROJECT_ID', {})).toEqual({ ok: true, value: '6grHWpvVM8QXrj5W', source: 'default' });
  });
  it('the ceiling parses an env override and refuses a non-positive-integer value', () => {
    expect(gmailModifyCeiling({ MICHAEL_GMAIL_MODIFY_CEILING: '25' })).toEqual({ ok: true, value: 25, source: 'env' });
    expect(gmailModifyCeiling({ MICHAEL_GMAIL_MODIFY_CEILING: '500' })).toEqual({ ok: true, value: 500, source: 'env' });
    for (const bad of ['0', '-1', '1.5', 'sixty', '1e308', '0x40', '501', '9999999']) {
      expect(gmailModifyCeiling({ MICHAEL_GMAIL_MODIFY_CEILING: bad })).toMatchObject({ ok: false, refusal: 'CONSTANT_INVALID', variable: 'MICHAEL_GMAIL_MODIFY_CEILING' });
    }
  });
  it('an unknown name is CONSTANT_UNKNOWN and the registry is frozen', () => {
    expect(resolveConstant('MICHAEL_NOPE', { MICHAEL_NOPE: 'x' })).toMatchObject({ ok: false, refusal: 'CONSTANT_UNKNOWN', variable: 'MICHAEL_NOPE' });
    expect(resolveConstant('constructor', {})).toMatchObject({ ok: false, refusal: 'CONSTANT_UNKNOWN' });
    expect(Object.isFrozen(MICHAEL_CONSTANTS)).toBe(true);
    expect(Object.keys(MICHAEL_CONSTANTS)).toEqual(['MICHAEL_EXELON_CALENDAR_ID', 'MICHAEL_TASKS_DRIVE_FOLDER_ID', 'MICHAEL_DAILY_CHECKIN_TASK_ID', 'MICHAEL_EHG_CHAIRMAN_PROJECT_ID', 'MICHAEL_GMAIL_MODIFY_CEILING']);
  });
});

describe('resolveConstants', () => {
  it('returns all values or the first refusal', () => {
    const env = { MICHAEL_EXELON_CALENDAR_ID: 'cal@group.calendar.google.com', MICHAEL_TASKS_DRIVE_FOLDER_ID: 'F1' };
    expect(resolveConstants(['MICHAEL_EXELON_CALENDAR_ID', 'MICHAEL_GMAIL_MODIFY_CEILING'], env)).toEqual({ ok: true, values: { MICHAEL_EXELON_CALENDAR_ID: 'cal@group.calendar.google.com', MICHAEL_GMAIL_MODIFY_CEILING: 60 } });
    expect(resolveConstants(['MICHAEL_TASKS_DRIVE_FOLDER_ID', 'MICHAEL_DAILY_CHECKIN_TASK_ID'], env)).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_DAILY_CHECKIN_TASK_ID' });
  });
});
