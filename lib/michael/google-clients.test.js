// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-2, TS-16 — Calendar and Drive legs (injected factories).
import { describe, it, expect } from 'vitest';
import { listCalendarEvents, listDriveFiles, readDriveFileText, driveQuery, CALENDAR_MAX_RESULTS, DRIVE_FILE_FIELDS } from './google-clients.mjs';

function calendarFactory(calls, { reject = null, items = [] } = {}) {
  return async (auth) => { calls.push(['factory', auth]); return { events: { list: async (args) => { calls.push(['events.list', args]); if (reject) throw reject; return { data: { items } }; } } }; };
}
function driveFactory(calls, { reject = null, files = [], meta = { id: 'f1', name: 'current-tasks.json', parents: ['FOLDER'], modifiedTime: '2026-09-06T08:00:00Z' }, text = '{"items":[]}' } = {}) {
  return async (auth) => {
    calls.push(['factory', auth]);
    return { files: {
      list: async (args) => { calls.push(['files.list', args]); if (reject) throw reject; return { data: { files } }; },
      get: async (args, opts) => { calls.push(['files.get', args, opts]); if (reject) throw reject; return args.alt === 'media' ? { data: text } : { data: meta }; },
    } };
  };
}

describe('listCalendarEvents', () => {
  it('maps calendarId/timeMin/timeMax with singleEvents, orderBy startTime and maxResults 250', async () => {
    const calls = [];
    const r = await listCalendarEvents({ calendarId: 'primary', timeMin: '2026-09-06T04:00:00Z', timeMax: '2026-09-07T04:00:00Z' }, { auth: 'AUTH', calendarFactory: calendarFactory(calls, { items: [{ id: 'e1' }] }) });
    expect(r).toEqual({ ok: true, events: [{ id: 'e1' }], calendarId: 'primary' });
    expect(calls).toEqual([['factory', 'AUTH'], ['events.list', { calendarId: 'primary', timeMin: '2026-09-06T04:00:00Z', timeMax: '2026-09-07T04:00:00Z', singleEvents: true, orderBy: 'startTime', maxResults: 250 }]]);
    expect(CALENDAR_MAX_RESULTS).toBe(250);
  });
  it('refuses missing args and maps a rejecting factory to { ok:false, error }', async () => {
    expect(await listCalendarEvents({ timeMin: 'a', timeMax: 'b' }, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_CALENDAR_ID' });
    expect(await listCalendarEvents({ calendarId: 'x' }, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_TIME_RANGE' });
    const err = new Error('backend'); err.code = 503;
    expect(await listCalendarEvents({ calendarId: 'x', timeMin: 'a', timeMax: 'b' }, { auth: 'AUTH', calendarFactory: calendarFactory([], { reject: err }) })).toEqual({ ok: false, error: '503: backend' });
  });
});

describe('listDriveFiles and readDriveFileText', () => {
  it('lists files in a folder by exact name with the bounded field set', async () => {
    const calls = [];
    const r = await listDriveFiles({ folderId: 'FOLDER', name: "o'brien.json" }, { auth: 'AUTH', driveFactory: driveFactory(calls, { files: [{ id: 'f1', name: "o'brien.json", parents: ['FOLDER'] }] }) });
    expect(r).toEqual({ ok: true, files: [{ id: 'f1', name: "o'brien.json", parents: ['FOLDER'] }] });
    expect(calls[1]).toEqual(['files.list', { q: "'FOLDER' in parents and trashed = false and name = 'o\\'brien.json'", fields: `files(${DRIVE_FILE_FIELDS})`, pageSize: 100, spaces: 'drive' }]);
    expect(driveQuery({ folderId: 'F' })).toBe("'F' in parents and trashed = false");
    expect(await listDriveFiles({}, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_FOLDER_ID' });
  });
  it('reads text only after the parents check passes (metadata get, then alt=media)', async () => {
    const calls = [];
    const r = await readDriveFileText({ fileId: 'f1', folderId: 'FOLDER' }, { auth: 'AUTH', driveFactory: driveFactory(calls) });
    expect(r).toEqual({ ok: true, text: '{"items":[]}', file: { id: 'f1', name: 'current-tasks.json', modifiedTime: '2026-09-06T08:00:00Z' } });
    expect(calls[1]).toEqual(['files.get', { fileId: 'f1', fields: DRIVE_FILE_FIELDS }, undefined]);
    expect(calls[2]).toEqual(['files.get', { fileId: 'f1', alt: 'media' }, { responseType: 'text' }]);
  });
  it('FILE_OUTSIDE_CONFIGURED_FOLDER for a file whose parents omit the folder, and no content is fetched (SECURITY F-10)', async () => {
    const calls = [];
    const r = await readDriveFileText({ fileId: 'f2', folderId: 'FOLDER' }, { auth: 'AUTH', driveFactory: driveFactory(calls, { meta: { id: 'f2', name: 'secret.txt', parents: ['ELSEWHERE'] }, text: 'must not surface' }) });
    expect(r).toEqual({ ok: false, error: 'FILE_OUTSIDE_CONFIGURED_FOLDER', fileId: 'f2' });
    expect(calls.filter((c) => c[0] === 'files.get')).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain('must not surface');
    expect(await readDriveFileText({ folderId: 'F' }, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_FILE_ID' });
    expect(await readDriveFileText({ fileId: 'f' }, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_FOLDER_ID' });
    const err = new Error('not found'); err.code = 404;
    expect(await readDriveFileText({ fileId: 'f', folderId: 'F' }, { auth: 'AUTH', driveFactory: driveFactory([], { reject: err }) })).toEqual({ ok: false, error: '404: not found' });
  });
  it('without injected auth and with an empty env the credential resolver refuses (no network, no throw)', async () => {
    const r = await listDriveFiles({ folderId: 'F' }, { env: {}, sb: { from: () => { throw new Error('must not read'); } } });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/GOOGLE_CLIENT_MISSING|MICHAEL_ENCRYPTION_KEY/);
  });
});
