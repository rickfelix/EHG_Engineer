// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J / FR-2 — the oracle-extract v1.1 feeder.
import { describe, it, expect } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runOracleExtract, parseEntries, errCode, FEEDER, ORACLE_FILE } from './oracle-extract.mjs';

// 06:15 ET on Sunday 2026-09-06 (EDT, UTC-4) -> 10:15Z, inside the 06:00-06:30 window.
const IN_WINDOW = new Date('2026-09-06T10:15:00.000Z');
// 02:00 ET, before the window opens.
const OUTSIDE_WINDOW = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '', MICHAEL_ORACLE_DRIVE_FOLDER_ID: 'oracle-folder' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function db({ reads = [], writes = [] } = {}) {
  const calls = [];
  let r = 0, w = 0;
  const sb = stubClient((table, ops) => { calls.push({ table, kind: ops[0].op, ops }); if (ops[0].op === 'select') return reads[r++] || { data: [], error: null }; return writes[w++] || { data: null, error: null }; });
  return { sb, calls };
}

/** Drive factory: files.list returns `list`; files.get returns `meta` (default) or `media` (alt=media); either may be an Error to throw. */
function drive({ list = [], meta, media, calls = [] } = {}) {
  return async () => ({
    files: {
      list: async (args) => { calls.push(['list', args]); if (list instanceof Error) throw list; return { data: { files: list } }; },
      get: async (args) => {
        calls.push(['get', args]);
        if (args.alt === 'media') { if (media instanceof Error) throw media; return { data: media }; }
        if (meta instanceof Error) throw meta;
        return { data: meta };
      },
    },
  });
}
const FILE_META = { id: 'f1', name: ORACLE_FILE, parents: ['oracle-folder'], modifiedTime: '2026-09-06T09:00:00Z' };

describe('parseEntries / errCode (pure)', () => {
  it('accepts a bare array or {items:[...]}, trims content, defaults tags, drops empty/non-string content, rejects other shapes', () => {
    expect(parseEntries('[{"content":"  hi  "},{"content":"x","tags":["a","b"]}]')).toEqual([{ content: 'hi', tags: [] }, { content: 'x', tags: ['a', 'b'] }]);
    expect(parseEntries('{"items":[{"content":"y"}]}')).toEqual([{ content: 'y', tags: [] }]);
    expect(parseEntries('[{"content":""},{"content":"  "},{"content":42},{}]')).toEqual([]);
    expect(parseEntries('not json')).toBe(null);
    expect(parseEntries('{"nope":1}')).toBe(null);
    expect(parseEntries('42')).toBe(null);
  });
  it('errCode extracts a leading code-shaped token, else API_ERROR', () => {
    expect(errCode('503: backend')).toBe('503');
    expect(errCode('RATE_LIMIT: too many requests')).toBe('RATE_LIMIT');
    expect(errCode('some lowercase message')).toBe('API_ERROR');
    expect(errCode(undefined)).toBe('API_ERROR');
  });
});

describe('runOracleExtract', () => {
  it('GITHUB_ACTIONS=true is refused HOST_VENUE_REQUIRED before any client or DB read', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive({ calls }), env: { ...env, GITHUB_ACTIONS: 'true' } });
    expect(r).toEqual({ ok: false, refusal: 'HOST_VENUE_REQUIRED', message: expect.any(String) });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('a missing MICHAEL_ORACLE_DRIVE_FOLDER_ID is CONSTANT_MISSING; a malformed --et-date is ET_DATE_INVALID', async () => {
    const { sb } = db();
    expect(await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive(), env: { GITHUB_ACTIONS: 'false' } })).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_ORACLE_DRIVE_FOLDER_ID' });
    expect(await runOracleExtract({ sb, argv: ['--et-date', 'sunday'], now: IN_WINDOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
  });
  it('outside the ET window is inert with no drive or DB call; a missing table is inert tables_absent', async () => {
    const calls = [];
    const { sb } = db();
    const r = await runOracleExtract({ sb, argv: ['--apply'], now: OUTSIDE_WINDOW, auth: 'AUTH', drive: drive({ calls }), env });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window', feeder: FEEDER });
    expect(calls).toEqual([]);
    const absent = db({ reads: [MISSING] });
    const r2 = await runOracleExtract({ sb: absent.sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: drive({ calls }), env });
    expect(r2).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('dry run: the source file is absent is skipped with reason file_missing, and writes nothing', async () => {
    const { sb, calls: dbCalls } = db();
    const r = await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive({ list: [] }), env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'skipped', counts: { reason: 'file_missing' } });
    expect(dbCalls.map((c) => c.kind)).toEqual(['select']);
  });
  it('dry run: previews numbered rows for today\'s et_date and writes nothing', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: JSON.stringify([{ content: 'first' }, { content: 'second', tags: ['t'] }]) });
    const r = await runOracleExtract({ sb, argv: ['--json'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'ok', et_date: '2026-09-06', counts: { entries: 2, replaced: 0, dry_run: true } });
    expect(r.preview.rows).toEqual([{ et_date: '2026-09-06', seq: 1, content: 'first', tags: [] }, { et_date: '2026-09-06', seq: 2, content: 'second', tags: ['t'] }]);
    expect(dbCalls.map((c) => c.kind)).toEqual(['select']);
  });
  it('--apply deletes today\'s rows then inserts the fresh set, and writes the run row', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: JSON.stringify({ items: [{ content: 'only' }] }) });
    const r = await runOracleExtract({ sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', attempt: 1, counts: { entries: 1, replaced: 1 } });
    expect(dbCalls.map((c) => `${c.table}:${c.kind}`)).toEqual(['michael_feeder_runs:select', 'michael_feeder_runs:insert', 'michael_oracle_history:delete', 'michael_oracle_history:insert', 'michael_feeder_runs:update']);
    expect(dbCalls[2].ops[0].args).toEqual([]);
    const eqArgs = dbCalls[2].ops.find((o) => o.op === 'eq').args;
    expect(eqArgs).toEqual(['et_date', '2026-09-06']);
    expect(dbCalls[3].ops[0].args[0]).toEqual([{ et_date: '2026-09-06', seq: 1, content: 'only', tags: [] }]);
    expect(dbCalls[4].ops[0].args[0]).toMatchObject({ status: 'ok', counts: { replaced: 1 } });
  });
  it('--apply with zero entries still replaces (delete only, no insert call) and reports replaced:0', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: JSON.stringify([]) });
    const r = await runOracleExtract({ sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ status: 'ok', counts: { entries: 0, replaced: 0 } });
    expect(dbCalls.map((c) => `${c.table}:${c.kind}`)).toEqual(['michael_feeder_runs:select', 'michael_feeder_runs:insert', 'michael_oracle_history:delete', 'michael_feeder_runs:update']);
  });
  it('unparseable file content is failed FILE_UNPARSEABLE; a drive list/read failure is failed with a real error_code', async () => {
    const { sb } = db();
    const bad = drive({ list: [FILE_META], meta: FILE_META, media: 'not json' });
    expect(await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: bad, env })).toMatchObject({ status: 'failed', counts: { error_code: 'FILE_UNPARSEABLE', phase: 'parse' } });
    const listErr = drive({ list: Object.assign(new Error('backend'), { code: 503 }) });
    expect(await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: listErr, env })).toMatchObject({ status: 'failed', counts: { error_code: '503', phase: 'drive' } });
    const readErr = drive({ list: [FILE_META], meta: FILE_META, media: Object.assign(new Error('boom'), { code: 'RATE_LIMIT' }) });
    expect(await runOracleExtract({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: readErr, env })).toMatchObject({ status: 'failed', counts: { error_code: 'RATE_LIMIT', phase: 'read' } });
  });
  it('does not import googleapis or read a credential at import time', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./oracle-extract.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from 'googleapis'|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY/);
  });
});
