// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J / FR-3 — the health-sync v1.1 feeder.
import { describe, it, expect } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runHealthSync, parseMetrics, errCode, FEEDER, HEALTH_FILE } from './health-sync.mjs';

// 06:15 ET on Sunday 2026-09-06 (EDT, UTC-4) -> 10:15Z, inside the 06:00-06:30 window.
const IN_WINDOW = new Date('2026-09-06T10:15:00.000Z');
// 02:00 ET, before the window opens.
const OUTSIDE_WINDOW = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '', MICHAEL_HEALTH_DRIVE_FOLDER_ID: 'health-folder' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function db({ reads = [], writes = [] } = {}) {
  const calls = [];
  let r = 0, w = 0;
  const sb = stubClient((table, ops) => { calls.push({ table, kind: ops[0].op, ops }); if (ops[0].op === 'select') return reads[r++] || { data: [], error: null }; return writes[w++] || { data: null, error: null }; });
  return { sb, calls };
}

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
const FILE_META = { id: 'f2', name: HEALTH_FILE, parents: ['health-folder'], modifiedTime: '2026-09-06T09:00:00Z' };

describe('parseMetrics / errCode (pure)', () => {
  it('accepts only a JSON object; rejects arrays, null, primitives and invalid JSON', () => {
    expect(parseMetrics('{"steps":8000,"sleep_hours":7.5}')).toEqual({ steps: 8000, sleep_hours: 7.5 });
    expect(parseMetrics('{}')).toEqual({});
    expect(parseMetrics('[1,2,3]')).toBe(null);
    expect(parseMetrics('null')).toBe(null);
    expect(parseMetrics('42')).toBe(null);
    expect(parseMetrics('"steps"')).toBe(null);
    expect(parseMetrics('not json')).toBe(null);
  });
  it('errCode extracts a leading code-shaped token, else API_ERROR', () => {
    expect(errCode('503: backend')).toBe('503');
    expect(errCode('RATE_LIMIT: too many requests')).toBe('RATE_LIMIT');
    expect(errCode('lowercase message')).toBe('API_ERROR');
  });
});

describe('runHealthSync', () => {
  it('GITHUB_ACTIONS=true is refused HOST_VENUE_REQUIRED before any client or DB read', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive({ calls }), env: { ...env, GITHUB_ACTIONS: 'true' } });
    expect(r).toEqual({ ok: false, refusal: 'HOST_VENUE_REQUIRED', message: expect.any(String) });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('a missing MICHAEL_HEALTH_DRIVE_FOLDER_ID is CONSTANT_MISSING; a malformed --et-date is ET_DATE_INVALID', async () => {
    const { sb } = db();
    expect(await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive(), env: { GITHUB_ACTIONS: 'false' } })).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_HEALTH_DRIVE_FOLDER_ID' });
    expect(await runHealthSync({ sb, argv: ['--et-date', 'sunday'], now: IN_WINDOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
  });
  it('outside the ET window is inert with no drive or DB call; a missing table is inert tables_absent', async () => {
    const calls = [];
    const { sb } = db();
    const r = await runHealthSync({ sb, argv: ['--apply'], now: OUTSIDE_WINDOW, auth: 'AUTH', drive: drive({ calls }), env });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window', feeder: FEEDER });
    expect(calls).toEqual([]);
    const absent = db({ reads: [MISSING] });
    const r2 = await runHealthSync({ sb: absent.sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: drive({ calls }), env });
    expect(r2).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('dry run: the source file is absent is skipped with reason file_missing, and writes nothing', async () => {
    const { sb, calls: dbCalls } = db();
    const r = await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: drive({ list: [] }), env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'skipped', counts: { reason: 'file_missing' } });
    expect(dbCalls.map((c) => c.kind)).toEqual(['select']);
  });
  it('dry run: previews the metrics object for today\'s et_date and writes nothing', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: JSON.stringify({ steps: 8000, sleep_hours: 7.5 }) });
    const r = await runHealthSync({ sb, argv: ['--json'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'ok', et_date: '2026-09-06', counts: { metric_keys: 2, upserted: 0, dry_run: true } });
    expect(r.preview.row).toEqual({ et_date: '2026-09-06', metrics: { steps: 8000, sleep_hours: 7.5 } });
    expect(dbCalls.map((c) => c.kind)).toEqual(['select']);
  });
  it('--apply upserts one row keyed on et_date, and writes the run row', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: JSON.stringify({ weight_lbs: 180 }) });
    const r = await runHealthSync({ sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', attempt: 1, counts: { metric_keys: 1, upserted: 1 } });
    expect(dbCalls.map((c) => `${c.table}:${c.kind}`)).toEqual(['michael_feeder_runs:select', 'michael_feeder_runs:insert', 'michael_health_daily:upsert', 'michael_feeder_runs:update']);
    expect(dbCalls[2].ops[0].args).toEqual([{ et_date: '2026-09-06', metrics: { weight_lbs: 180 } }, { onConflict: 'et_date' }]);
    expect(dbCalls[3].ops[0].args[0]).toMatchObject({ status: 'ok', counts: { upserted: 1 } });
  });
  it('an empty metrics object ({}) is still a valid apply (metric_keys:0, upserted:1)', async () => {
    const { sb, calls: dbCalls } = db();
    const d = drive({ list: [FILE_META], meta: FILE_META, media: '{}' });
    const r = await runHealthSync({ sb, argv: ['--apply'], now: IN_WINDOW, auth: 'AUTH', drive: d, env });
    expect(r).toMatchObject({ status: 'ok', counts: { metric_keys: 0, upserted: 1 } });
    expect(dbCalls.map((c) => c.kind)).toEqual(['select', 'insert', 'upsert', 'update']);
  });
  it('an array or non-object metrics file is failed FILE_UNPARSEABLE, same as invalid JSON', async () => {
    const { sb } = db();
    const arr = drive({ list: [FILE_META], meta: FILE_META, media: '[1,2,3]' });
    expect(await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: arr, env })).toMatchObject({ status: 'failed', counts: { error_code: 'FILE_UNPARSEABLE', phase: 'parse' } });
    const bad = drive({ list: [FILE_META], meta: FILE_META, media: 'not json' });
    expect(await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: bad, env })).toMatchObject({ status: 'failed', counts: { error_code: 'FILE_UNPARSEABLE', phase: 'parse' } });
  });
  it('a drive list/read failure is failed with a real error_code', async () => {
    const { sb } = db();
    const listErr = drive({ list: Object.assign(new Error('backend'), { code: 503 }) });
    expect(await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: listErr, env })).toMatchObject({ status: 'failed', counts: { error_code: '503', phase: 'drive' } });
    const readErr = drive({ list: [FILE_META], meta: FILE_META, media: Object.assign(new Error('boom'), { code: 'RATE_LIMIT' }) });
    expect(await runHealthSync({ sb, argv: [], now: IN_WINDOW, auth: 'AUTH', drive: readErr, env })).toMatchObject({ status: 'failed', counts: { error_code: 'RATE_LIMIT', phase: 'read' } });
  });
  it('does not import googleapis or read a credential at import time', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./health-sync.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from 'googleapis'|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY/);
  });
});
