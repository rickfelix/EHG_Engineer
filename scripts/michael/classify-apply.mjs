#!/usr/bin/env node
// scripts/michael/classify-apply.mjs — the seat's provenance-checked recorder (spec §5 seat tick).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-9, PR 8b).
//
// Applies a RUNNER-PRODUCED verdict file to the queue rows. The file is an envelope
//   { producer, run_id, produced_at, et_date, model_used, tokens_in, tokens_out, counts?, items[], tasks[], content_hash }
// and is refused before any read when: producer / run_id are absent (PROVENANCE_MISSING, ratification
// 6c263823 — evidence without provenance is absent), the producer is not the seat classifier
// (PRODUCER_UNKNOWN), content_hash is absent or differs from sha256(canonicalJson(envelope minus
// content_hash)) (HASH_MISMATCH — the runner computes it with the exported contentHashFor), the model
// is outside the cheap tier (MODEL_NOT_ALLOWED: Sonnet classifies, Opus re-judges), metering is not
// non-negative integers (METERING_INVALID), produced_at is missing, in the future or older than three
// hours (PRODUCED_AT_INVALID), the file's et_date is not the run's (ET_DATE_MISMATCH), the path is
// outside .artifacts/michael-seat/ (PATH_NOT_ALLOWED), or any item / task carries a key outside its
// allow-list (FIELD_NOT_WRITABLE — the seat writes class, needs_you, needs_you_reason, borderline,
// verified_by, action_intent on items and effort_grade, est_minutes, proposed_date, role_tag on tasks;
// never summary, never chosen_action, never action_taken_at). Rows are updated by natural key and ONLY
// while still queued (class NULL / effort_grade NULL) and untouched (action_taken_at NULL / chosen_action
// and moved_back_at NULL); a verdict for a row that moved on is counted skipped, never overwritten.
// Metering lands on ONE seat run row per ET date — (et_date, 'seat-classify', attempt 1), venue 'seat' —
// accumulated across the tick's passes: counts { classified, needs_you, borderline, graded, opus_rejudged,
// sample } and tokens are summed, model_used lists every model seen. Window 04:30-07:30 ET and absent
// tables are inert (exit 0). No summary, no prose beyond needs_you_reason (bounded), nothing logged.
// DRY-RUN BY DEFAULT: --apply writes.
//
// Usage: node scripts/michael/classify-apply.mjs --file .artifacts/michael-seat/<run_id>.json [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, canonicalJson, sha256Hex } from '../../lib/michael/db.mjs';
import { FEEDERS, inWindow, etMinuteOfDay } from '../../lib/michael/feeder.mjs';
import { etDateStr } from '../../lib/time/chairman-et-wall-clock.js';

export const FEEDER = 'seat-classify';
export const PRODUCER = 'michael-seat-classifier';
export const VERDICT_DIR = path.join('.artifacts', 'michael-seat');
export const MODEL_ALLOWED = /^claude-(sonnet|opus)/i;
export const PRODUCED_AT_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const NEEDS_YOU_REASON_MAX = 240;
export const ITEM_WRITABLE = Object.freeze(['class', 'needs_you', 'needs_you_reason', 'borderline', 'verified_by', 'action_intent']);
export const TASK_WRITABLE = Object.freeze(['effort_grade', 'est_minutes', 'proposed_date', 'role_tag']);
export const ENVELOPE_KEYS = Object.freeze(['producer', 'run_id', 'produced_at', 'et_date', 'model_used', 'tokens_in', 'tokens_out', 'counts', 'items', 'tasks', 'content_hash']);
export const RUN_COUNT_KEYS = Object.freeze(['classified', 'needs_you', 'borderline', 'graded', 'opus_rejudged', 'sample']);
const CLASS_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const INTENT_RE = /^(archive|unarchive|label:[A-Za-z0-9_-]{1,64})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: the hash the runner writes and this script recomputes — sha256 over canonicalJson(envelope minus content_hash). */
export function contentHashFor(envelope) {
  const { content_hash, ...rest } = envelope && typeof envelope === 'object' ? envelope : {};
  void content_hash;
  return sha256Hex(canonicalJson(rest));
}

const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
const strOrNull = (v) => v === null || (typeof v === 'string' && v.length > 0);

/** Pure: validate one item verdict; returns a refusal code or null. */
export function itemProblem(it) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) return 'ITEM_INVALID';
  if (typeof it.thread_id !== 'string' || !it.thread_id) return 'ITEM_INVALID';
  for (const k of Object.keys(it)) if (k !== 'thread_id' && !ITEM_WRITABLE.includes(k)) return 'FIELD_NOT_WRITABLE';
  if (typeof it.class !== 'string' || !CLASS_RE.test(it.class)) return 'CLASS_INVALID';
  if ('needs_you' in it && typeof it.needs_you !== 'boolean') return 'ITEM_INVALID';
  if ('borderline' in it && typeof it.borderline !== 'boolean') return 'ITEM_INVALID';
  if ('needs_you_reason' in it && (!strOrNull(it.needs_you_reason) || (it.needs_you_reason && it.needs_you_reason.length > NEEDS_YOU_REASON_MAX))) return 'REASON_INVALID';
  if ('verified_by' in it && !strOrNull(it.verified_by)) return 'ITEM_INVALID';
  if ('action_intent' in it && it.action_intent !== null && !(typeof it.action_intent === 'string' && INTENT_RE.test(it.action_intent))) return 'INTENT_INVALID';
  return null;
}

/** Pure: validate one task verdict; returns a refusal code or null. */
export function taskProblem(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return 'TASK_INVALID';
  if (typeof t.task_id !== 'string' || !t.task_id) return 'TASK_INVALID';
  for (const k of Object.keys(t)) if (k !== 'task_id' && !TASK_WRITABLE.includes(k)) return 'FIELD_NOT_WRITABLE';
  if (!['S', 'M', 'L'].includes(t.effort_grade)) return 'GRADE_INVALID';
  if ('est_minutes' in t && t.est_minutes !== null && !isInt(t.est_minutes, 1)) return 'TASK_INVALID';
  if ('proposed_date' in t && t.proposed_date !== null && !(typeof t.proposed_date === 'string' && DATE_RE.test(t.proposed_date))) return 'TASK_INVALID';
  if ('role_tag' in t && !strOrNull(t.role_tag)) return 'TASK_INVALID';
  return null;
}

/** Pure: validate the whole envelope against the run's ET date and clock. Returns { ok:true } or { ok:false, refusal, message }. */
export function validateEnvelope(env, { etDate, now }) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return refusal('FILE_INVALID', 'the verdict file must be a JSON object');
  for (const k of Object.keys(env)) if (!ENVELOPE_KEYS.includes(k)) return refusal('FIELD_NOT_WRITABLE', `unknown envelope key "${k}"`);
  if (typeof env.producer !== 'string' || !env.producer || typeof env.run_id !== 'string' || !env.run_id) return refusal('PROVENANCE_MISSING', 'producer and run_id are required (ratification 6c263823)');
  if (env.producer !== PRODUCER) return refusal('PRODUCER_UNKNOWN', `producer must be ${PRODUCER}`);
  if (typeof env.content_hash !== 'string' || env.content_hash !== contentHashFor(env)) return refusal('HASH_MISMATCH', 'content_hash does not match sha256(canonicalJson(envelope minus content_hash))');
  if (typeof env.model_used !== 'string' || !MODEL_ALLOWED.test(env.model_used)) return refusal('MODEL_NOT_ALLOWED', 'model_used must be a claude-sonnet or claude-opus model');
  if (!isInt(env.tokens_in) || !isInt(env.tokens_out)) return refusal('METERING_INVALID', 'tokens_in and tokens_out must be non-negative integers');
  const at = typeof env.produced_at === 'string' ? Date.parse(env.produced_at) : NaN;
  if (!Number.isFinite(at) || at > now.getTime() + 60_000 || now.getTime() - at > PRODUCED_AT_MAX_AGE_MS) return refusal('PRODUCED_AT_INVALID', 'produced_at must be an ISO timestamp within the last three hours');
  if (env.et_date !== etDate) return refusal('ET_DATE_MISMATCH', `file et_date ${env.et_date} is not the run's ${etDate}`);
  if (!Array.isArray(env.items) || !Array.isArray(env.tasks)) return refusal('FILE_INVALID', 'items and tasks must be arrays');
  for (const it of env.items) { const p = itemProblem(it); if (p) return refusal(p, `item ${it && it.thread_id ? it.thread_id : '?'}`); }
  for (const t of env.tasks) { const p = taskProblem(t); if (p) return refusal(p, `task ${t && t.task_id ? t.task_id : '?'}`); }
  if (env.counts !== undefined) {
    if (!env.counts || typeof env.counts !== 'object' || Array.isArray(env.counts)) return refusal('FILE_INVALID', 'counts must be an object');
    for (const k of Object.keys(env.counts)) if (!['opus_rejudged', 'sample'].includes(k) || !isInt(env.counts[k])) return refusal('FILE_INVALID', `counts.${k} is not a non-negative integer or not a runner count`);
  }
  return { ok: true };
}

/** Pure: is `file` inside the allowed verdict directory under `root`? */
export function pathAllowed(file, root) {
  const dir = path.resolve(root, VERDICT_DIR);
  const full = path.resolve(root, file);
  const rel = path.relative(dir, full);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && full.toLowerCase().endsWith('.json');
}

/** Pure: merge this pass into the seat row's counts and metering (sums; model list). */
export function mergeRun(prior, pass) {
  const counts = { ...(prior && prior.counts && typeof prior.counts === 'object' ? prior.counts : {}) };
  for (const k of RUN_COUNT_KEYS) counts[k] = (isInt(counts[k]) ? counts[k] : 0) + (isInt(pass.counts[k]) ? pass.counts[k] : 0);
  counts.passes = (isInt(counts.passes) ? counts.passes : 0) + 1;
  counts.items_skipped = (isInt(counts.items_skipped) ? counts.items_skipped : 0) + pass.counts.items_skipped;
  counts.tasks_skipped = (isInt(counts.tasks_skipped) ? counts.tasks_skipped : 0) + pass.counts.tasks_skipped;
  counts.last_run_id = pass.run_id;
  const models = new Set(String(prior && prior.model_used ? prior.model_used : '').split('+').filter(Boolean));
  models.add(pass.model_used);
  return {
    counts,
    model_used: [...models].join('+'),
    tokens_in: (prior && isInt(prior.tokens_in) ? prior.tokens_in : 0) + pass.tokens_in,
    tokens_out: (prior && isInt(prior.tokens_out) ? prior.tokens_out : 0) + pass.tokens_out,
  };
}

/** The recorder. deps: { sb, argv, now, env, root, fs }. Never throws. */
export async function runClassifyApply({ sb, argv = [], now = new Date(), env = process.env, root = process.cwd(), fs: fsx = fs } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported; use --et-date YYYY-MM-DD');
  if (typeof a.file !== 'string' || !a.file) return refusal('FILE_REQUIRED', '--file <path under .artifacts/michael-seat/> is required');
  if (!pathAllowed(a.file, root)) return refusal('PATH_NOT_ALLOWED', `verdict files are read only from ${VERDICT_DIR}/*.json`);
  const etDate = a['et-date'] !== undefined ? String(a['et-date']) : etDateStr(now);
  if (!DATE_RE.test(etDate)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  let envelope;
  try { envelope = JSON.parse(fsx.readFileSync(path.resolve(root, a.file), 'utf8')); } catch (e) { return refusal('FILE_INVALID', `cannot read or parse the verdict file: ${e && e.code ? e.code : 'PARSE'}`); }
  const v = validateEnvelope(envelope, { etDate, now });
  if (!v.ok) return v;
  const reg = FEEDERS[FEEDER];
  if (!inWindow(etMinuteOfDay(now), reg.window)) return { ok: true, action: 'inert', feeder: FEEDER, et_date: etDate, reason: 'outside_et_window', window: reg.window };

  const pass = {
    run_id: envelope.run_id, model_used: envelope.model_used, tokens_in: envelope.tokens_in, tokens_out: envelope.tokens_out,
    counts: {
      classified: 0, needs_you: 0, borderline: 0, graded: 0,
      opus_rejudged: envelope.counts && isInt(envelope.counts.opus_rejudged) ? envelope.counts.opus_rejudged : 0,
      sample: envelope.counts && isInt(envelope.counts.sample) ? envelope.counts.sample : 0,
      items_skipped: 0, tasks_skipped: 0,
    },
  };
  const out = { ok: true, action: apply ? 'run' : 'dry_run', feeder: FEEDER, et_date: etDate, run_id: envelope.run_id, items: envelope.items.length, tasks: envelope.tasks.length, counts: pass.counts, errors: [] };

  // presence first: a bounded read of the seat row establishes the tables before any write
  const prior = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('et_date', etDate).eq('feeder', FEEDER).eq('attempt', 1), { select: 'id,status,counts,model_used,tokens_in,tokens_out,started_at' });
  if (prior.tables_absent) return { ok: true, action: 'inert', feeder: FEEDER, et_date: etDate, reason: 'tables_absent', tables_absent: true };
  if (prior.error) return refusal('READ_FAILED', prior.error);

  for (const it of envelope.items) {
    const patch = Object.fromEntries(ITEM_WRITABLE.filter((k) => k in it).map((k) => [k, it[k]]));
    if (!apply) { pass.counts.classified += 1; if (it.needs_you) pass.counts.needs_you += 1; if (it.borderline) pass.counts.borderline += 1; continue; }
    const w = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.update(patch).eq('et_date', etDate).eq('thread_id', it.thread_id).is('class', null).is('action_taken_at', null).select('thread_id'));
    if (!w.ok) { out.errors.push(`item ${it.thread_id}: ${w.refusal}`); continue; }
    if (!Array.isArray(w.data) || w.data.length !== 1) { pass.counts.items_skipped += 1; continue; }
    pass.counts.classified += 1; if (it.needs_you) pass.counts.needs_you += 1; if (it.borderline) pass.counts.borderline += 1;
  }
  for (const t of envelope.tasks) {
    const patch = Object.fromEntries(TASK_WRITABLE.filter((k) => k in t).map((k) => [k, t[k]]));
    if (!apply) { pass.counts.graded += 1; continue; }
    const w = await writeRows(sb, 'michael_todoist_snapshot', (x) => x.update(patch).eq('et_date', etDate).eq('task_id', t.task_id).is('effort_grade', null).is('chosen_action', null).is('moved_back_at', null).select('task_id'));
    if (!w.ok) { out.errors.push(`task ${t.task_id}: ${w.refusal}`); continue; }
    if (!Array.isArray(w.data) || w.data.length !== 1) { pass.counts.tasks_skipped += 1; continue; }
    pass.counts.graded += 1;
  }
  if (!apply) return { ...out, preview: { row: mergeRun(prior.rows[0] || null, pass) } };

  // one seat row per ET date, accumulated across passes; degraded when any row write was refused
  const merged = mergeRun(prior.rows[0] || null, pass);
  const row = { feeder: FEEDER, et_date: etDate, attempt: 1, venue: reg.venue, status: out.errors.length ? 'degraded' : 'ok', counts: merged.counts, model_used: merged.model_used, tokens_in: merged.tokens_in, tokens_out: merged.tokens_out, started_at: prior.rows[0] && prior.rows[0].started_at ? prior.rows[0].started_at : now.toISOString(), finished_at: new Date().toISOString() };
  const up = await writeRows(sb, 'michael_feeder_runs', (t) => t.upsert(row, { onConflict: 'et_date,feeder,attempt' }));
  out.run_row_ok = up.ok;
  if (!up.ok) out.errors.push(`seat run row: ${up.refusal}`);
  out.status = row.status;
  out.ok = out.errors.length === 0;
  return out;
}

/** Pure: exit code — 0 for a write, inert or dry-run; 1 for a partially refused write; 2 for a refusal. */
export function exitCodeForApply(r) {
  if (!r || r.ok === false) return r && r.refusal ? 2 : 1;
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runClassifyApply({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = exitCodeForApply(r);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:classify-apply] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
