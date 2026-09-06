#!/usr/bin/env node
// scripts/michael/queue-read.mjs — the seat's queue reader (READ ONLY; spec §5 seat tick).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-9, PR 8a).
//
// Prints, bounded, the ET date's michael_gmail_triage_items with class NULL (nullability IS the queue
// signal: thread_id, rule_key, last_message_id, borderline) and michael_todoist_snapshot rows with
// effort_grade NULL (task_id, proposed_date), plus counts. Reads go through readRows (literal 500 bound);
// a full page is reported as truncated and, only then, an exact count is taken — presence is established
// by the bounded read first, so a head-count can never read an absent table as present (DB-D10).
// With --headers (host venue only: the chairman grant lives on the host) the From / Subject / List-Id /
// Date of each queued thread's last message are re-fetched through getThreadMeta and printed to STDOUT
// ONLY — never written to a row, a log or a file; the classifier reads them from this output.
// Absent tables yield empty lists and exit 0 (inert). Never throws.
//
// Usage: node scripts/michael/queue-read.mjs [--json] [--et-date YYYY-MM-DD] [--headers]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, refusal, emit } from '../../lib/michael/db.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { getThreadMeta } from '../../lib/michael/gmail-client.mjs';
import { etDateStr } from '../../lib/time/chairman-et-wall-clock.js';

/** The bound readRows applies (lib/michael/db.mjs); a page of exactly this many rows is a truncated read. */
export const READ_BOUND = 500;
/** Header re-fetches per run: one Gmail call per queued thread, capped so a runaway queue cannot burn the grant. */
export const HEADERS_MAX = 200;
export const ITEM_KEYS = Object.freeze(['thread_id', 'rule_key', 'last_message_id', 'borderline']);
export const TASK_KEYS = Object.freeze(['task_id', 'proposed_date']);

/** Pure: exit code for the CLI — 0 for a read (empty, inert or truncated alike), 1 for a read failure, 2 for a refusal. */
export function exitCodeForQueue(r) {
  if (!r || r.ok === false) return r && r.refusal ? 2 : 1;
  return Array.isArray(r.errors) && r.errors.length ? 1 : 0;
}

/** Exact count for one queue, taken ONLY after the bounded read established the table is present. Null on any error. */
async function countExact(sb, table, build) {
  try {
    const { count, error } = await build(sb.from(table).select('id', { count: 'exact', head: true }));
    return error || !Number.isFinite(Number(count)) ? null : Number(count);
  } catch { return null; }
}

/** Pure: pick the published keys off a row (uniform key set, nothing else leaks to stdout). */
function pick(row, keys) {
  return Object.fromEntries(keys.map((k) => [k, row && row[k] !== undefined ? row[k] : null]));
}

/** The reader. deps: { sb, argv, now, env, auth, gmail (factory) }. Never throws. */
export async function runQueueRead({ sb, argv = [], now = new Date(), env = process.env, auth, gmail } = {}) {
  const a = parseArgs(argv);
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported; use --et-date YYYY-MM-DD');
  const etDate = a['et-date'] !== undefined ? String(a['et-date']) : etDateStr(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDate)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  const headers = a.headers === true;
  if (headers) { try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); } }

  const items = await readRows(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate).is('class', null).order('created_at', { ascending: true }), { select: ITEM_KEYS.join(',') });
  if (items.tables_absent) return { ok: true, tables_absent: true, et_date: etDate, items: [], tasks: [], counts: { items: 0, tasks: 0 }, errors: [] };
  const tasks = await readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate).is('effort_grade', null).order('created_at', { ascending: true }), { select: TASK_KEYS.join(',') });
  const errors = [items, tasks].map((r) => r.error).filter(Boolean);

  const counts = { items: items.rows.length, tasks: tasks.rows.length, items_truncated: items.rows.length >= READ_BOUND, tasks_truncated: tasks.rows.length >= READ_BOUND };
  if (counts.items_truncated) counts.items_total = await countExact(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate).is('class', null));
  if (counts.tasks_truncated) counts.tasks_total = await countExact(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate).is('effort_grade', null));

  const out = { ok: errors.length === 0, tables_absent: false, et_date: etDate, items: items.rows.map((r) => pick(r, ITEM_KEYS)), tasks: tasks.rows.map((r) => pick(r, TASK_KEYS)), counts, errors };
  if (headers && out.items.length) {
    const deps = { auth, gmailFactory: gmail, sb, env };
    counts.headers_fetched = 0; counts.headers_failed = 0; counts.headers_skipped = Math.max(out.items.length - HEADERS_MAX, 0);
    for (const item of out.items.slice(0, HEADERS_MAX)) {
      const m = await getThreadMeta({ threadId: item.thread_id }, deps);
      if (!m.ok) { counts.headers_failed += 1; item.headers = null; continue; }
      item.headers = { from: m.meta.from, subject: m.meta.subject, list_id: m.meta.listId, date: m.meta.date };
      counts.headers_fetched += 1;
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runQueueRead({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = exitCodeForQueue(r);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:queue-read] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
