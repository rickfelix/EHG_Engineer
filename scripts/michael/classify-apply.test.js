// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-9 (PR 8b) — the seat's provenance-checked recorder.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stubClient } from '../../lib/michael/db.test.js';
import { runClassifyApply, validateEnvelope, contentHashFor, itemProblem, taskProblem, pathAllowed, mergeRun, exitCodeForApply, ITEM_WRITABLE, TASK_WRITABLE, PRODUCER, FEEDER } from './classify-apply.mjs';

// 05:00 ET on 2026-09-06 (EDT) -> 09:00Z (inside 04:30-07:30); 02:00 ET -> 06:00Z (outside).
const NOW = new Date('2026-09-06T09:00:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const ROOT = 'C:\\repo';
const FILE = '.artifacts/michael-seat/run-1.json';
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

function envelope(over = {}) {
  const base = {
    producer: PRODUCER, run_id: 'run-1', produced_at: '2026-09-06T08:55:00.000Z', et_date: '2026-09-06',
    model_used: 'claude-sonnet-5', tokens_in: 1200, tokens_out: 300, counts: { opus_rejudged: 1, sample: 0 },
    items: [
      { thread_id: 't1', class: 'newsletter', needs_you: false, borderline: false, action_intent: 'archive' },
      { thread_id: 't2', class: 'personal', needs_you: true, needs_you_reason: 'A friend asks about Saturday', borderline: true, verified_by: 'claude-opus-5' },
    ],
    tasks: [{ task_id: 'k1', effort_grade: 'M', est_minutes: 45, proposed_date: null, role_tag: 'home' }],
    ...over,
  };
  return { ...base, content_hash: contentHashFor(base) };
}
/** fs stub: one readable file. */
const fsFor = (content) => ({ readFileSync: (p) => { if (path.resolve(ROOT, FILE) !== p) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return typeof content === 'string' ? content : JSON.stringify(content); } });
/** DB stub: prior seat row, per-row update answers (rows matched), records calls. */
function db({ prior = [], absent = false, matched = () => 1, refuse = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'update') {
      if (refuse === table) return { data: null, error: { code: '23514', message: 'check violation' } };
      const key = ops.find((o) => o.op === 'eq' && (o.args[0] === 'thread_id' || o.args[0] === 'task_id'));
      const n = matched(key.args[1], table);
      return { data: Array.from({ length: n }, () => ({ [key.args[0]]: key.args[1] })), error: null };
    }
    if (ops[0].op === 'upsert') return { data: null, error: null };
    if (table === 'michael_feeder_runs') return { data: prior, error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}
const run = (over = {}) => runClassifyApply({ sb: db().sb, argv: ['--file', FILE, '--apply'], now: NOW, root: ROOT, fs: fsFor(envelope()), ...over });

describe('validation (pure)', () => {
  it('a file without producer or run_id is refused PROVENANCE_MISSING before any read; a wrong producer PRODUCER_UNKNOWN', () => {
    const noProd = envelope({ producer: undefined }); delete noProd.producer;
    expect(validateEnvelope({ ...noProd, content_hash: contentHashFor(noProd) }, { etDate: '2026-09-06', now: NOW })).toMatchObject({ ok: false, refusal: 'PROVENANCE_MISSING' });
    expect(validateEnvelope(envelope({ run_id: '' }), { etDate: '2026-09-06', now: NOW })).toMatchObject({ ok: false, refusal: 'PROVENANCE_MISSING' });
    expect(validateEnvelope(envelope({ producer: 'classify-apply' }), { etDate: '2026-09-06', now: NOW })).toMatchObject({ ok: false, refusal: 'PRODUCER_UNKNOWN' });
  });
  it('a tampered file is refused HASH_MISMATCH (any field, including metering and a verdict); a missing hash too', () => {
    const ok = envelope();
    expect(validateEnvelope(ok, { etDate: '2026-09-06', now: NOW })).toEqual({ ok: true });
    expect(validateEnvelope({ ...ok, tokens_in: 1 }, { etDate: '2026-09-06', now: NOW })).toMatchObject({ refusal: 'HASH_MISMATCH' });
    const flipped = { ...ok, items: [{ ...ok.items[0], needs_you: true }, ok.items[1]] };
    expect(validateEnvelope(flipped, { etDate: '2026-09-06', now: NOW })).toMatchObject({ refusal: 'HASH_MISMATCH' });
    const { content_hash, ...noHash } = ok; void content_hash;
    expect(validateEnvelope(noHash, { etDate: '2026-09-06', now: NOW })).toMatchObject({ refusal: 'HASH_MISMATCH' });
    // the hash is over the canonical form: key order never matters
    const reordered = Object.fromEntries(Object.entries(ok).reverse());
    expect(validateEnvelope(reordered, { etDate: '2026-09-06', now: NOW })).toEqual({ ok: true });
  });
  it('model, metering, produced_at, et_date and unknown envelope keys are refused with their own codes', () => {
    const at = (over) => validateEnvelope(envelope(over), { etDate: '2026-09-06', now: NOW });
    expect(at({ model_used: 'claude-haiku-4-5' })).toMatchObject({ refusal: 'MODEL_NOT_ALLOWED' });
    expect(at({ model_used: 'claude-opus-5' })).toEqual({ ok: true });
    expect(at({ tokens_in: -1 })).toMatchObject({ refusal: 'METERING_INVALID' });
    expect(at({ tokens_out: 1.5 })).toMatchObject({ refusal: 'METERING_INVALID' });
    expect(at({ produced_at: '2026-09-06T05:30:00.000Z' })).toMatchObject({ refusal: 'PRODUCED_AT_INVALID' }); // 3h30 old
    expect(at({ produced_at: '2026-09-06T09:10:00.000Z' })).toMatchObject({ refusal: 'PRODUCED_AT_INVALID' }); // future
    expect(at({ produced_at: undefined })).toMatchObject({ refusal: 'PRODUCED_AT_INVALID' });
    expect(at({ et_date: '2026-09-05' })).toMatchObject({ refusal: 'ET_DATE_MISMATCH' });
    expect(at({ summary: 'never' })).toMatchObject({ refusal: 'FIELD_NOT_WRITABLE' });
    expect(at({ counts: { classified: 3 } })).toMatchObject({ refusal: 'FILE_INVALID' });
    expect(validateEnvelope([], { etDate: '2026-09-06', now: NOW })).toMatchObject({ refusal: 'FILE_INVALID' });
  });
  it('items and tasks: allow-lists, class shape, bounded reason, intent shape, grades', () => {
    expect(ITEM_WRITABLE).toEqual(['class', 'needs_you', 'needs_you_reason', 'borderline', 'verified_by', 'action_intent']);
    expect(TASK_WRITABLE).toEqual(['effort_grade', 'est_minutes', 'proposed_date', 'role_tag']);
    expect(itemProblem({ thread_id: 't1', class: 'newsletter' })).toBe(null);
    expect(itemProblem({ thread_id: 't1', class: 'newsletter', summary: 'x' })).toBe('FIELD_NOT_WRITABLE');
    expect(itemProblem({ thread_id: 't1', class: 'newsletter', action_taken_at: 'now' })).toBe('FIELD_NOT_WRITABLE');
    expect(itemProblem({ thread_id: 't1', class: null })).toBe('CLASS_INVALID');
    expect(itemProblem({ thread_id: 't1', class: 'Has Spaces' })).toBe('CLASS_INVALID');
    expect(itemProblem({ thread_id: 't1', class: 'x', needs_you_reason: 'r'.repeat(241) })).toBe('REASON_INVALID');
    expect(itemProblem({ thread_id: 't1', class: 'x', action_intent: 'delete' })).toBe('INTENT_INVALID');
    expect(itemProblem({ thread_id: 't1', class: 'x', action_intent: 'label:L_1' })).toBe(null);
    expect(itemProblem({ thread_id: '', class: 'x' })).toBe('ITEM_INVALID');
    expect(taskProblem({ task_id: 'k1', effort_grade: 'S' })).toBe(null);
    expect(taskProblem({ task_id: 'k1', effort_grade: 'XL' })).toBe('GRADE_INVALID');
    expect(taskProblem({ task_id: 'k1', effort_grade: 'S', chosen_action: 'x' })).toBe('FIELD_NOT_WRITABLE');
    expect(taskProblem({ task_id: 'k1', effort_grade: 'S', est_minutes: 0 })).toBe('TASK_INVALID');
    expect(taskProblem({ task_id: 'k1', effort_grade: 'S', proposed_date: 'tomorrow' })).toBe('TASK_INVALID');
  });
  it('pathAllowed admits only .json files under .artifacts/michael-seat/; mergeRun sums counts and metering and lists models', () => {
    expect(pathAllowed('.artifacts/michael-seat/run-1.json', ROOT)).toBe(true);
    expect(pathAllowed('.artifacts/michael-seat/nested/run-1.json', ROOT)).toBe(true);
    expect(pathAllowed('.artifacts/michael-seat/../other/run-1.json', ROOT)).toBe(false);
    expect(pathAllowed('.artifacts/michael-seat/run-1.txt', ROOT)).toBe(false);
    expect(pathAllowed('.artifacts/michael-seat', ROOT)).toBe(false);
    expect(pathAllowed('C:\\elsewhere\\run-1.json', ROOT)).toBe(false);
    const pass = { run_id: 'r2', model_used: 'claude-opus-5', tokens_in: 10, tokens_out: 5, counts: { classified: 2, needs_you: 1, borderline: 1, graded: 0, opus_rejudged: 1, sample: 0, items_skipped: 1, tasks_skipped: 0 } };
    const prior = { counts: { classified: 5, needs_you: 0, borderline: 0, graded: 3, opus_rejudged: 0, sample: 1, passes: 1, items_skipped: 0, tasks_skipped: 2, last_run_id: 'r1' }, model_used: 'claude-sonnet-5', tokens_in: 100, tokens_out: 50 };
    expect(mergeRun(prior, pass)).toEqual({ counts: { classified: 7, needs_you: 1, borderline: 1, graded: 3, opus_rejudged: 1, sample: 1, passes: 2, items_skipped: 1, tasks_skipped: 2, last_run_id: 'r2' }, model_used: 'claude-sonnet-5+claude-opus-5', tokens_in: 110, tokens_out: 55 });
    expect(mergeRun(null, pass).counts.passes).toBe(1);
  });
});

describe('runClassifyApply', () => {
  it('a valid file updates only the addressed rows by natural key, never those with action_taken_at / chosen_action / already classified or graded, and upserts one seat feeder_runs row with metering', async () => {
    const { sb, calls } = db();
    const r = await runClassifyApply({ sb, argv: ['--file', FILE, '--apply'], now: NOW, root: ROOT, fs: fsFor(envelope()) });
    expect(r).toMatchObject({ ok: true, action: 'run', feeder: FEEDER, et_date: '2026-09-06', run_id: 'run-1', status: 'ok', run_row_ok: true, counts: { classified: 2, needs_you: 1, borderline: 1, graded: 1, opus_rejudged: 1, sample: 0, items_skipped: 0, tasks_skipped: 0 } });
    const updates = calls.filter((c) => c.kind === 'update');
    expect(updates.map((u) => u.table)).toEqual(['michael_gmail_triage_items', 'michael_gmail_triage_items', 'michael_todoist_snapshot']);
    expect(updates[0].ops[0].args[0]).toEqual({ class: 'newsletter', needs_you: false, borderline: false, action_intent: 'archive' });
    expect(updates[0].ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is', 'is', 'select']);
    expect(updates[0].ops.slice(1, 5).map((o) => o.args)).toEqual([['et_date', '2026-09-06'], ['thread_id', 't1'], ['class', null], ['action_taken_at', null]]);
    expect(updates[1].ops[0].args[0]).toEqual({ class: 'personal', needs_you: true, needs_you_reason: 'A friend asks about Saturday', borderline: true, verified_by: 'claude-opus-5' });
    expect(updates[2].ops[0].args[0]).toEqual({ effort_grade: 'M', est_minutes: 45, proposed_date: null, role_tag: 'home' });
    expect(updates[2].ops.slice(1, 6).map((o) => o.args)).toEqual([['et_date', '2026-09-06'], ['task_id', 'k1'], ['effort_grade', null], ['chosen_action', null], ['moved_back_at', null]]);
    const up = calls.find((c) => c.kind === 'upsert');
    expect(up.table).toBe('michael_feeder_runs');
    expect(up.ops[0].args[1]).toEqual({ onConflict: 'et_date,feeder,attempt' });
    expect(up.ops[0].args[0]).toMatchObject({ feeder: 'seat-classify', et_date: '2026-09-06', attempt: 1, venue: 'seat', status: 'ok', model_used: 'claude-sonnet-5', tokens_in: 1200, tokens_out: 300, counts: { classified: 2, needs_you: 1, borderline: 1, graded: 1, opus_rejudged: 1, sample: 0, passes: 1, last_run_id: 'run-1' } });
    expect(up.ops[0].args[0].started_at).toBe(NOW.toISOString());
    expect(JSON.stringify(up.ops[0].args[0])).not.toMatch(/Saturday|summary/);
    expect(exitCodeForApply(r)).toBe(0);
  });
  it('a second pass accumulates into the same seat row (counts and tokens summed, models listed, started_at kept); rows that moved on are skipped, not overwritten', async () => {
    const prior = [{ id: 'row', status: 'ok', counts: { classified: 4, needs_you: 0, borderline: 0, graded: 2, opus_rejudged: 0, sample: 1, passes: 1, items_skipped: 0, tasks_skipped: 0, last_run_id: 'run-0' }, model_used: 'claude-sonnet-5', tokens_in: 500, tokens_out: 100, started_at: '2026-09-06T08:31:00.000Z' }];
    const { sb, calls } = db({ prior, matched: (id) => (id === 't2' ? 0 : 1) });
    const r = await runClassifyApply({ sb, argv: ['--file', FILE, '--apply'], now: NOW, root: ROOT, fs: fsFor(envelope({ model_used: 'claude-opus-5' })) });
    expect(r.counts).toMatchObject({ classified: 1, needs_you: 0, borderline: 0, items_skipped: 1, graded: 1 });
    const up = calls.find((c) => c.kind === 'upsert').ops[0].args[0];
    expect(up).toMatchObject({ status: 'ok', model_used: 'claude-sonnet-5+claude-opus-5', tokens_in: 1700, tokens_out: 400, started_at: '2026-09-06T08:31:00.000Z', counts: { classified: 5, graded: 3, sample: 1, opus_rejudged: 1, passes: 2, items_skipped: 1, last_run_id: 'run-1' } });
  });
  it('dry-run by default: validates, reads the seat row, writes nothing, previews the merged row', async () => {
    const { sb, calls } = db();
    const r = await runClassifyApply({ sb, argv: ['--file', FILE], now: NOW, root: ROOT, fs: fsFor(envelope()) });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', counts: { classified: 2, needs_you: 1, borderline: 1, graded: 1 } });
    expect(r.preview.row.tokens_in).toBe(1200);
    expect(calls.every((c) => c.kind === 'select')).toBe(true);
    expect(exitCodeForApply(r)).toBe(0);
  });
  it('refusals: PATH_NOT_ALLOWED, FILE_REQUIRED, FILE_INVALID, --date, and every envelope refusal happen before any DB call; outside the window and absent tables are inert', async () => {
    const { sb, calls } = db();
    const at = (argv, content) => runClassifyApply({ sb, argv, now: NOW, root: ROOT, fs: fsFor(content === undefined ? envelope() : content) });
    expect(await at(['--file', 'scripts/michael/x.json', '--apply'])).toMatchObject({ ok: false, refusal: 'PATH_NOT_ALLOWED' });
    expect(await at(['--apply'])).toMatchObject({ ok: false, refusal: 'FILE_REQUIRED' });
    expect(await at(['--file', FILE, '--date', '2026-09-06'])).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    expect(await at(['--file', FILE, '--et-date', 'today'])).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    expect(await at(['--file', FILE], '{not json')).toMatchObject({ ok: false, refusal: 'FILE_INVALID' });
    expect(await at(['--file', FILE], { ...envelope(), tokens_in: 7 })).toMatchObject({ ok: false, refusal: 'HASH_MISMATCH' });
    const bad = envelope(); delete bad.run_id; bad.content_hash = contentHashFor(bad);
    const p = await at(['--file', FILE], bad);
    expect(p).toMatchObject({ ok: false, refusal: 'PROVENANCE_MISSING' }); expect(exitCodeForApply(p)).toBe(2);
    expect(await at(['--file', FILE, '--et-date', '2026-09-05'])).toMatchObject({ ok: false, refusal: 'ET_DATE_MISMATCH' });
    expect(calls).toEqual([]);
    const early = await runClassifyApply({ sb, argv: ['--file', FILE, '--apply'], now: TWO_AM, root: ROOT, fs: fsFor(envelope({ produced_at: '2026-09-06T05:55:00.000Z' })) });
    expect(early).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window' });
    expect(calls).toEqual([]);
    const absent = await runClassifyApply({ sb: db({ absent: true }).sb, argv: ['--file', FILE, '--apply'], now: NOW, root: ROOT, fs: fsFor(envelope()) });
    expect(absent).toMatchObject({ ok: true, action: 'inert', reason: 'tables_absent', tables_absent: true });
    expect(exitCodeForApply(absent)).toBe(0);
  });
  it('a refused row write is reported, the pass continues, the seat row lands degraded, exit 1', async () => {
    const r = await run({ sb: db({ refuse: 'michael_todoist_snapshot' }).sb });
    expect(r).toMatchObject({ ok: false, status: 'degraded', run_row_ok: true, counts: { classified: 2, graded: 0 } });
    expect(r.errors).toEqual(['task k1: WRITE_FAILED']);
    expect(exitCodeForApply(r)).toBe(1);
  });
  it('never writes summary, prose or a run row outside the allow-lists (source guard)', () => {
    const src = readFileSync(new URL('./classify-apply.mjs', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(src).not.toMatch(/summary:|log_md|\.insert\(|\.delete\(|writeFileSync|console\.log\(/);
    expect(src).toMatch(/\.is\('class', null\)\.is\('action_taken_at', null\)/);
    expect(src).toMatch(/\.is\('effort_grade', null\)\.is\('chosen_action', null\)\.is\('moved_back_at', null\)/);
  });
});
