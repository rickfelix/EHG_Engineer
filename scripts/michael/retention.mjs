#!/usr/bin/env node
// scripts/michael/retention.mjs — 30-day prose retention for the michael_* tables (spec §2 data
// handling). SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-6).
//
// DRY-RUN BY DEFAULT (scripts/retention-enforce.js shape); --apply executes. Nulls rendered_html and
// brief_md on michael_brief_runs, summary and needs_you_reason on michael_gmail_triage_items, and
// DELETES michael_calendar_day rows, all STRICTLY older than the cutoff (et_date < today_ET - days).
// Rules, closures, dispositions, counts and every non-prose column are never touched.
//
// WHY NOT retention-enforce.js: its archive-before-delete would copy personal calendar rows into
// retention_archive indefinitely, contradicting spec §2; prose is nulled in place instead.
//
// Every run (dry and apply) stamps a michael_feeder_runs row feeder='retention', venue='gha',
// attempt = 1 + max(attempt) for today, so the age of the newest retention row is the liveness
// signal (no new table). Inert (exit 0, tables_absent=true, no stamp) until the chairman applies.
//
// Usage: node scripts/michael/retention.mjs [--apply] [--days 30] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, isMissingRelation, refusal, emit, todayEt } from '../../lib/michael/db.mjs';

export const DEFAULT_DAYS = 30;
export const RETENTION_TARGETS = Object.freeze([
  { table: 'michael_brief_runs', action: 'null', columns: ['rendered_html', 'brief_md'] },
  { table: 'michael_gmail_triage_items', action: 'null', columns: ['summary', 'needs_you_reason'] },
  { table: 'michael_calendar_day', action: 'delete', columns: [] },
]);
/** Never touched by retention (spec §2: rules, closures, dispositions and counts are kept). */
export const NEVER_TOUCHED = Object.freeze(['michael_rules', 'michael_closures', 'michael_feedback_ledger', 'michael_feeder_runs', 'michael_gmail_labels', 'michael_todoist_snapshot', 'michael_credentials', 'michael_staged_items']);

/** Pure: the ET calendar date `days` before today's ET date (YYYY-MM-DD). Rows with et_date < cutoff are eligible. */
export function cutoffEtDate(now = new Date(), days = DEFAULT_DAYS) {
  const today = todayEt(now);
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Bounded eligibility count via count:'exact' (never a row fetch). */
async function countEligible(sb, target, cutoff) {
  try {
    let q = sb.from(target.table).select('id', { count: 'exact', head: true }).lt('et_date', cutoff);
    if (target.action === 'null') q = q.or(target.columns.map((c) => `${c}.not.is.null`).join(','));
    const { count, error } = await q;
    if (error) return isMissingRelation(error) ? { count: null, tables_absent: true } : { count: null, error: `${target.table}: ${error.message || error.code}` };
    if (count === null || count === undefined) return { count: null, tables_absent: true };
    return { count };
  } catch (e) {
    return isMissingRelation(e) ? { count: null, tables_absent: true } : { count: null, error: `${target.table}: ${e && e.message ? e.message : String(e)}` };
  }
}

/** The job. deps: { sb, argv, now }. Never throws. */
export async function runRetention({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const days = a.days === undefined ? DEFAULT_DAYS : Number(a.days);
  if (!Number.isInteger(days) || days < 1) return refusal('DAYS_INVALID', '--days must be a positive integer');
  const cutoff = cutoffEtDate(now, days);
  const started = now.toISOString();
  const mode = apply ? 'apply' : 'dry_run';
  const perTable = [];
  let anyError = false;
  let tablesAbsent = false;
  for (const target of RETENTION_TARGETS) {
    const c = await countEligible(sb, target, cutoff);
    if (c.tables_absent) { tablesAbsent = true; perTable.push({ table: target.table, action: target.action, eligible: null, tables_absent: true }); continue; }
    const entry = { table: target.table, action: target.action, columns: target.columns, eligible: c.count, error: c.error || null };
    if (c.error) anyError = true;
    if (apply && !c.error && c.count > 0) {
      const w = target.action === 'delete'
        ? await writeRows(sb, target.table, (t) => t.delete().lt('et_date', cutoff))
        : await writeRows(sb, target.table, (t) => t.update(Object.fromEntries(target.columns.map((col) => [col, null]))).lt('et_date', cutoff).or(target.columns.map((col) => `${col}.not.is.null`).join(',')));
      if (!w.ok) { entry.error = w.error; anyError = true; } else entry.applied = c.count;
    }
    perTable.push(entry);
  }
  if (tablesAbsent) return { ok: true, tables_absent: true, mode, days, cutoff, per_table: perTable, stamped: false };

  // Liveness stamp — every run, dry or apply (retention-enforce.js:212-223 precedence).
  const et = todayEt(now);
  const prev = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('feeder', 'retention').eq('et_date', et).order('attempt', { ascending: false }), { select: 'attempt' });
  const attempt = 1 + (prev.rows[0] ? Number(prev.rows[0].attempt) || 0 : 0);
  const stamp = await writeRows(sb, 'michael_feeder_runs', (t) => t.insert({
    feeder: 'retention', et_date: et, attempt, venue: 'gha', status: anyError ? 'failed' : 'ok',
    counts: { mode, days, cutoff, per_table: perTable },
    started_at: started, finished_at: new Date().toISOString(),
  }).select('id').single());
  if (!stamp.ok) anyError = true;
  return { ok: !anyError, tables_absent: false, mode, days, cutoff, per_table: perTable, stamped: stamp.ok, attempt, stamp_error: stamp.ok ? null : stamp.error };
}

/** Human rendering. */
export function renderRetention(r) {
  const out = [`— michael retention (${r.mode}, days=${r.days}, cutoff et_date < ${r.cutoff}) —`];
  if (r.tables_absent) { out.push('  michael_* tables not applied yet — nothing to do (inert).'); return out; }
  for (const t of r.per_table) out.push(`  ${t.table.padEnd(28)} ${t.action.padEnd(6)} eligible=${t.eligible}${t.applied !== undefined ? ` applied=${t.applied}` : ''}${t.error ? ` ERROR: ${t.error}` : ''}`);
  out.push(r.stamped ? `  ✓ michael_feeder_runs stamp written (retention attempt ${r.attempt})` : `  ⚠ stamp failed: ${r.stamp_error}`);
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runRetention({ sb: createMichaelClient(), argv });
  if (argv.includes('--json')) emit(r, { json: true });
  else for (const line of renderRetention(r)) console.log(line);
  process.exitCode = r.ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-RETENTION] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
