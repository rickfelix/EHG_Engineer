// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-1, TS-1, TS-2, TS-3 — the feeder harness.
import { describe, it, expect, vi } from 'vitest';
import { stubClient } from './db.test.js';
import {
  FEEDERS, FEEDER_IDS, READINESS_REQUIREMENTS, BRIEF_DEADLINE_ET, INERT_REASONS,
  hhmmToMinutes, inWindow, etMinuteOfDay, isUniqueViolation, staleThresholdMinutes, exitCodeFor, inertReasonFor,
  runFeeder, assembleReadiness,
} from './feeder.mjs';

// 05:00 ET on a September morning (EDT = UTC-4) -> 09:00Z; 02:00 ET -> 06:00Z; 06:00 ET -> 10:00Z.
const FIVE_AM_ET = new Date('2026-09-06T09:00:00.000Z');
const TWO_AM_ET = new Date('2026-09-06T06:00:00.000Z');
const SIX_AM_ET = new Date('2026-09-06T10:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const DUP = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "michael_feeder_runs_date_feeder_attempt_uniq"' } };
const env = { GITHUB_ACTIONS: 'false' };
const quiet = () => {};

/** Scripted client: reads answer from `reads` in order, inserts from `inserts`, updates from `updates`; every call is recorded. */
function scripted({ reads = [], inserts = [], updates = [] } = {}) {
  const calls = [];
  let r = 0, i = 0, u = 0;
  const sb = stubClient((table, ops) => {
    const kind = ops[0].op;
    calls.push({ table, kind, ops });
    if (kind === 'insert') return inserts[i++] || { data: { id: `row-${i}`, attempt: ops[0].args[0].attempt }, error: null };
    if (kind === 'update') return updates[u++] || { data: null, error: null };
    return reads[r++] || { data: [], error: null };
  });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('registry lists the six feeder ids with venues and inclusive windows', () => {
    expect(FEEDER_IDS).toEqual(['tasks-classifier', 'calendar-read', 'gmail-triage', 'todoist-brief', 'seat-classify', 'retention']);
    expect(FEEDERS['gmail-triage']).toEqual({ venue: 'task_scheduler', window: { start: '04:30', end: '05:30' }, intervalMinutes: 15 });
    expect(FEEDERS['seat-classify'].venue).toBe('seat');
    expect(Object.isFrozen(FEEDERS)).toBe(true);
    expect(READINESS_REQUIREMENTS).toEqual(['tasks-classifier', 'calendar-read', 'gmail-triage', 'todoist-brief']);
    expect(BRIEF_DEADLINE_ET).toBe('05:45');
    expect(INERT_REASONS).toContain('ceiling_hit');
  });
  it('inWindow is inclusive at both ends and requires a window', () => {
    const w = { start: '04:30', end: '05:30' };
    expect(hhmmToMinutes('04:30')).toBe(270);
    expect(inWindow(270, w)).toBe(true);
    expect(inWindow(hhmmToMinutes('05:30'), w)).toBe(true);
    expect(inWindow(hhmmToMinutes('05:31'), w)).toBe(false);
    expect(inWindow(hhmmToMinutes('04:29'), w)).toBe(false);
    expect(inWindow(hhmmToMinutes('23:30'), { start: '23:00', end: '01:00' })).toBe(true);
    expect(inWindow(300)).toBe(false);
    expect(inWindow(NaN, w)).toBe(false);
  });
  it('etMinuteOfDay, isUniqueViolation, staleThresholdMinutes and exitCodeFor', () => {
    expect(etMinuteOfDay(FIVE_AM_ET)).toBe(300);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ error: 'michael_feeder_runs: duplicate key value violates unique constraint' })).toBe(true);
    expect(isUniqueViolation({ code: '23514', error: 'check violation' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(staleThresholdMinutes('gmail-triage')).toBe(20);
    expect(staleThresholdMinutes('retention')).toBe(20);
    expect(exitCodeFor({ ok: true, action: 'inert', reason: 'tables_absent' })).toBe(0);
    expect(exitCodeFor({ ok: true, action: 'run', status: 'degraded' })).toBe(0);
    expect(exitCodeFor({ ok: true, action: 'run', status: 'failed' })).toBe(1);
    expect(exitCodeFor({ ok: false, refusal: 'FEEDER_UNKNOWN' })).toBe(2);
    expect(exitCodeFor(null)).toBe(2);
  });
});

describe('runFeeder inert paths (TS-1)', () => {
  it('refuses an unregistered feeder id before any read', async () => {
    const { sb, calls } = scripted();
    const r = await runFeeder({ feeder: 'gmail-triag', run: async () => ({ status: 'ok' }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: false, refusal: 'FEEDER_UNKNOWN' });
    expect(calls).toHaveLength(0);
  });
  it('is inert outside the ET window with no read and no run', async () => {
    const { sb, calls } = scripted();
    const run = vi.fn();
    const r = await runFeeder({ feeder: 'gmail-triage', run }, { sb, env, now: TWO_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window', feeder: 'gmail-triage', et_date: '2026-09-06' });
    expect(calls).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });
  it('treats the window end minute as in-window (calendar-read at exactly 05:00)', async () => {
    const { sb, calls } = scripted();
    const r = await runFeeder({ feeder: 'calendar-read', run: async () => ({ status: 'ok', counts: { events: 0 } }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r.action).toBe('run');
    expect(calls.map((c) => c.kind)).toEqual(['select', 'insert', 'update']);
  });
  it('is inert with tables_absent when the relation is missing', async () => {
    const { sb } = scripted({ reads: [MISSING] });
    const run = vi.fn();
    const r = await runFeeder({ feeder: 'gmail-triage', run }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'tables_absent', tables_absent: true });
    expect(run).not.toHaveBeenCalled();
  });
  it('is inert already_ok, ceiling_hit and upstream_not_ready', async () => {
    const ok = scripted({ reads: [{ data: [{ attempt: 1, status: 'ok', counts: {} }], error: null }] });
    expect((await runFeeder({ feeder: 'gmail-triage', run: vi.fn() }, { sb: ok.sb, env, now: FIVE_AM_ET, logger: quiet })).reason).toBe('already_ok');
    const ceil = scripted({ reads: [{ data: [{ attempt: 2, status: 'degraded', counts: { ceiling_hit: true, threads_modified: 60 }, finished_at: '2026-09-06T08:50:00.000Z' }], error: null }] });
    expect((await runFeeder({ feeder: 'gmail-triage', run: vi.fn() }, { sb: ceil.sb, env, now: FIVE_AM_ET, logger: quiet })).reason).toBe('ceiling_hit');
    const up = scripted({ reads: [{ data: [], error: null }, { data: [{ feeder: 'calendar-read', status: 'failed' }], error: null }] });
    const r = await runFeeder({ feeder: 'todoist-brief', upstream: ['calendar-read', 'tasks-classifier'], run: vi.fn() }, { sb: up.sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ reason: 'upstream_not_ready', upstream_not_ready: ['calendar-read', 'tasks-classifier'] });
    expect(up.calls[1].ops.some((o) => o.op === 'in' && o.args[0] === 'feeder')).toBe(true);
  });
  it('a degraded upstream counts as ready', async () => {
    const up = scripted({ reads: [{ data: [], error: null }, { data: [{ feeder: 'calendar-read', status: 'degraded' }], error: null }] });
    const r = await runFeeder({ feeder: 'todoist-brief', upstream: ['calendar-read'], run: async () => ({ status: 'ok' }) }, { sb: up.sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r.action).toBe('run');
  });
});

describe('single-flight and attempt (TS-2)', () => {
  const started = (minutesAgo) => new Date(FIVE_AM_ET.getTime() - minutesAgo * 60 * 1000).toISOString();
  it('a row started 12 minutes ago on a */15 feeder is still in_flight; 21 minutes ago is not', async () => {
    const live = scripted({ reads: [{ data: [{ attempt: 1, status: 'skipped', counts: { phase: 'started' }, started_at: started(12), finished_at: null }], error: null }] });
    expect((await runFeeder({ feeder: 'gmail-triage', run: vi.fn() }, { sb: live.sb, env, now: FIVE_AM_ET, logger: quiet })).reason).toBe('in_flight');
    const dead = scripted({ reads: [{ data: [{ attempt: 1, status: 'skipped', counts: { phase: 'started' }, started_at: started(21), finished_at: null }], error: null }] });
    const r = await runFeeder({ feeder: 'gmail-triage', run: async () => ({ status: 'ok' }) }, { sb: dead.sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ action: 'run', attempt: 2 });
  });
  it('writes the start row as status skipped / phase started with ISO started_at, then finishes with the real status', async () => {
    const { sb, calls } = scripted();
    const r = await runFeeder({ feeder: 'gmail-triage', run: async () => ({ status: 'degraded', counts: { threads: 3 }, log_md: 'counts only' }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    const ins = calls[1].ops[0].args[0];
    expect(ins).toEqual({ feeder: 'gmail-triage', et_date: '2026-09-06', attempt: 1, venue: 'task_scheduler', status: 'skipped', counts: { phase: 'started' }, started_at: '2026-09-06T09:00:00.000Z' });
    expect(typeof ins.started_at).toBe('string');
    expect(calls[1].ops.map((o) => o.op)).toEqual(['insert', 'select', 'single']);
    const upd = calls[2].ops[0].args[0];
    expect(upd).toMatchObject({ status: 'degraded', counts: { threads: 3 }, log_md: 'counts only' });
    expect(typeof upd.finished_at).toBe('string');
    expect(calls[2].ops.filter((o) => o.op === 'eq').map((o) => o.args)).toEqual([['et_date', '2026-09-06'], ['feeder', 'gmail-triage'], ['attempt', 1]]);
    expect(r).toMatchObject({ ok: true, action: 'run', attempt: 1, status: 'degraded', counts: { threads: 3 }, finish_write_ok: true });
    // The quiet tick's failed-count filter (status = 'failed') never sees an in-flight row.
    expect(ins.status).not.toBe('failed');
  });
  it('a 23505 whose re-read shows the winner still running yields in_flight (never a second concurrent attempt)', async () => {
    const { sb, calls } = scripted({ reads: [{ data: [], error: null }, { data: [{ attempt: 1, status: 'skipped', counts: { phase: 'started' }, started_at: '2026-09-06T08:59:59.000Z', finished_at: null }], error: null }], inserts: [DUP] });
    const run = vi.fn();
    const r = await runFeeder({ feeder: 'gmail-triage', run }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(1);
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'in_flight' });
    expect(run).not.toHaveBeenCalled();
  });
  it('retries exactly once on a 23505 when the re-read shows the winner already finished degraded, minting attempt max+1', async () => {
    const { sb, calls } = scripted({ reads: [{ data: [], error: null }, { data: [{ attempt: 1, status: 'degraded', counts: { threads: 1 }, started_at: '2026-09-06T08:59:58.000Z', finished_at: '2026-09-06T08:59:59.500Z' }], error: null }], inserts: [DUP] });
    const r = await runFeeder({ feeder: 'gmail-triage', run: async () => ({ status: 'ok' }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(2);
    expect(calls.filter((c) => c.kind === 'insert')[1].ops[0].args[0].attempt).toBe(2);
    expect(r).toMatchObject({ action: 'run', attempt: 2 });
  });
  it('a re-read after a 23505 that shows an ok, imported or ceiling_hit row is inert with that reason', async () => {
    const ok = scripted({ reads: [{ data: [], error: null }, { data: [{ attempt: 1, status: 'ok', counts: {}, finished_at: '2026-09-06T08:59:59.500Z' }], error: null }], inserts: [DUP] });
    expect((await runFeeder({ feeder: 'gmail-triage', run: vi.fn() }, { sb: ok.sb, env, now: FIVE_AM_ET, logger: quiet })).reason).toBe('already_ok');
    expect(inertReasonFor([{ status: 'imported' }], 'gmail-triage', FIVE_AM_ET)).toBe('already_ok');
    expect(inertReasonFor([{ status: 'degraded', counts: { ceiling_hit: true } }], 'gmail-triage', FIVE_AM_ET)).toBe('ceiling_hit');
    expect(inertReasonFor([], 'gmail-triage', FIVE_AM_ET)).toBe(null);
  });
  it('a finish write the ledger did not hold returns finish_write_ok false and exit code 1', async () => {
    const { sb } = scripted({ updates: [{ data: null, error: { code: '57014', message: 'statement timeout' } }] });
    const r = await runFeeder({ feeder: 'gmail-triage', run: async () => ({ status: 'ok' }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', finish_write_ok: false });
    expect(exitCodeFor(r)).toBe(1);
  });
  it('losing the race twice is inert in_flight, never failed', async () => {
    const { sb, calls } = scripted({ reads: [{ data: [], error: null }, { data: [], error: null }], inserts: [DUP, DUP] });
    const run = vi.fn();
    const r = await runFeeder({ feeder: 'gmail-triage', run }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'in_flight' });
    expect(calls.filter((c) => c.kind === 'insert')).toHaveLength(2);
    expect(run).not.toHaveBeenCalled();
  });
  it('a coded throw from run() lands as status failed with counts.refusal and exit code 1', async () => {
    const { sb, calls } = scripted();
    const err = Object.assign(new Error('secret@example.com must not leak'), { code: 'HOST_VENUE_REQUIRED' });
    const r = await runFeeder({ feeder: 'calendar-read', run: async () => { throw err; } }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ action: 'run', status: 'failed', counts: { refusal: 'HOST_VENUE_REQUIRED' } });
    expect(JSON.stringify(calls[2].ops[0].args[0])).not.toContain('@');
    expect(exitCodeFor(r)).toBe(1);
  });
  it('hands run() the prior rows, the ET date, the attempt and an etDateOverride', async () => {
    const prior = [{ attempt: 1, status: 'degraded', counts: { threads_modified: 60 }, started_at: '2026-09-05T08:30:00.000Z', finished_at: '2026-09-05T08:31:00.000Z' }];
    const { sb } = scripted({ reads: [{ data: prior, error: null }] });
    const run = vi.fn(async () => ({ status: 'ok' }));
    const r = await runFeeder({ feeder: 'gmail-triage', run, etDateOverride: '2026-09-05' }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(run.mock.calls[0][0]).toMatchObject({ etDate: '2026-09-05', attempt: 2, priorRuns: prior, env });
    expect(r.et_date).toBe('2026-09-05');
  });
  it('logs single-line JSON to the injected logger and never to stdout', async () => {
    const { sb } = scripted();
    const lines = [];
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await runFeeder({ feeder: 'gmail-triage', run: async () => ({ status: 'ok', counts: { threads: 1 } }) }, { sb, env, now: FIVE_AM_ET, logger: (l) => lines.push(l) });
    } finally { out.mockRestore(); }
    expect(out).not.toHaveBeenCalled();
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l).toMatch(/^\[michael:gmail-triage\] \{.*\}$/);
      expect(l).not.toContain('\n');
      expect(() => JSON.parse(l.slice('[michael:gmail-triage] '.length))).not.toThrow();
    }
  });
});

describe('dry run', () => {
  it('runs the gates, calls run() with dryRun and writes nothing (no claim, no run row)', async () => {
    const { sb, calls } = scripted({ reads: [{ data: [{ attempt: 1, status: 'degraded', counts: {}, finished_at: '2026-09-06T08:40:00.000Z' }], error: null }] });
    const run = vi.fn(async () => ({ status: 'ok', counts: { events: 2 }, preview: [{ id: 'x' }] }));
    const r = await runFeeder({ feeder: 'calendar-read', dryRun: true, run }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', attempt: 2, status: 'ok', counts: { events: 2 }, preview: [{ id: 'x' }] });
    expect(calls.map((c) => c.kind)).toEqual(['select']);
    expect(run.mock.calls[0][0]).toMatchObject({ dryRun: true, attempt: 2 });
    expect(exitCodeFor(r)).toBe(0);
  });
  it('a dry run still honours the inert gates and maps a failed status to exit 1', async () => {
    const ok = scripted({ reads: [{ data: [{ attempt: 1, status: 'ok', counts: {} }], error: null }] });
    expect((await runFeeder({ feeder: 'calendar-read', dryRun: true, run: vi.fn() }, { sb: ok.sb, env, now: FIVE_AM_ET, logger: quiet })).reason).toBe('already_ok');
    const { sb } = scripted();
    const r = await runFeeder({ feeder: 'calendar-read', dryRun: true, run: async () => ({ status: 'failed', counts: { failed_calendar: ['primary', 'exelon'] } }) }, { sb, env, now: FIVE_AM_ET, logger: quiet });
    expect(r).toMatchObject({ action: 'dry_run', status: 'failed' });
    expect(exitCodeFor(r)).toBe(1);
  });
});

describe('assembleReadiness (TS-3)', () => {
  const rows = (...pairs) => pairs.map(([feeder, status]) => ({ feeder, status }));
  it('assembles when every required feeder is ok, taking the best attempt per feeder', () => {
    const r = assembleReadiness({ runs: rows(['tasks-classifier', 'ok'], ['calendar-read', 'failed'], ['calendar-read', 'ok'], ['gmail-triage', 'ok'], ['todoist-brief', 'ok'], ['seat-classify', 'failed']), now: FIVE_AM_ET });
    expect(r).toMatchObject({ decision: 'assemble', ready: true, degraded: false, missing: [], degraded_feeders: [] });
  });
  it('assembles degraded when a required feeder is only degraded', () => {
    const r = assembleReadiness({ runs: rows(['tasks-classifier', 'ok'], ['calendar-read', 'degraded'], ['gmail-triage', 'ok'], ['todoist-brief', 'ok']), now: FIVE_AM_ET });
    expect(r).toMatchObject({ decision: 'assemble_degraded', ready: true, degraded: true, degraded_feeders: ['calendar-read'] });
  });
  it('waits for a missing feeder before the deadline and assembles degraded after it', () => {
    const runs = rows(['tasks-classifier', 'ok'], ['calendar-read', 'ok'], ['gmail-triage', 'skipped']);
    expect(assembleReadiness({ runs, now: FIVE_AM_ET })).toMatchObject({ decision: 'wait', ready: false, missing: ['gmail-triage', 'todoist-brief'], past_deadline: false });
    expect(assembleReadiness({ runs, now: SIX_AM_ET })).toMatchObject({ decision: 'assemble_degraded', ready: true, missing: ['gmail-triage', 'todoist-brief'], past_deadline: true });
  });
  it('honours injected required set and deadline (child E contract)', () => {
    const r = assembleReadiness({ runs: rows(['calendar-read', 'ok']), now: FIVE_AM_ET, required: ['calendar-read'], deadlineEt: '04:00' });
    expect(r).toMatchObject({ decision: 'assemble', deadline_et: '04:00', past_deadline: true });
    expect(typeof assembleReadiness).toBe('function');
    expect(assembleReadiness({ now: TWO_AM_ET }).decision).toBe('wait');
  });
});
