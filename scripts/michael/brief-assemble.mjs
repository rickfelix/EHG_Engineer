#!/usr/bin/env node
// scripts/michael/brief-assemble.mjs — the GHA assembler feeder (05:15-06:00 ET, credential-free).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E (FR-2). Spec §5, §6.
//
// Gates on assembleReadiness (lib/michael/feeder.mjs, child D's assembleReadiness — imported
// unmodified, not re-derived): before BRIEF_DEADLINE_ET (05:45) with a required feeder not-ok the
// run is inert wait; at/after the deadline it proceeds degraded and names the missing feeder in
// headsUp; with every required feeder ok it assembles clean. Reads michael_calendar_day,
// michael_gmail_triage_items, michael_todoist_snapshot, michael_feeder_runs bounded through
// lib/michael/db.mjs readRows, builds data_json via lib/michael/brief-model.mjs with a template
// lede, and upserts michael_brief_runs by et_date with assembled_at set. This script alone must
// produce a complete brief of record whether or not the seat ever wakes.
//
// DRY-RUN BY DEFAULT (feeder family convention): --apply writes. No task/thread/email text reaches
// this script's own output — it only reads counts and the already-redacted upstream rows.
//
// Usage: node scripts/michael/brief-assemble.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit, assembleReadiness, READINESS_REQUIREMENTS, BRIEF_DEADLINE_ET } from '../../lib/michael/feeder.mjs';
import { buildBriefData, validateBriefData } from '../../lib/michael/brief-model.mjs';
import { renderBrief, verifyRender } from '../../lib/michael/render-brief.js';

export const FEEDER = 'brief-assemble';

/** The feeder. deps: { sb, argv, now }. Never throws. */
export async function runBriefAssemble({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, decision: null, degraded: false };

      const runsRes = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('et_date', etDate), { select: 'feeder,attempt,status,counts,id' });
      if (runsRes.tables_absent) return { status: 'ok', counts: { ...counts, error_code: 'TABLES_ABSENT', phase: 'readiness' } };
      if (runsRes.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'readiness' } };

      const readiness = assembleReadiness({ runs: runsRes.rows, now, required: READINESS_REQUIREMENTS, deadlineEt: BRIEF_DEADLINE_ET });
      counts.decision = readiness.decision;
      counts.degraded = readiness.degraded;
      counts.missing = readiness.missing;
      if (readiness.decision === 'wait') return { status: 'ok', counts: { ...counts, phase: 'wait' } };

      const [cal, triage, snap] = await Promise.all([
        readRows(sb, 'michael_calendar_day', (q) => q.eq('et_date', etDate), { select: 'et_date,event_id,coded_marker,optional,overlap_group' }),
        readRows(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate), { select: 'et_date,thread_id,class,action_taken_at,needs_you,needs_you_reason' }),
        readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate), { select: 'et_date,task_id,effort_grade' }),
      ]);
      if (cal.tables_absent || triage.tables_absent || snap.tables_absent) return { status: 'ok', counts: { ...counts, error_code: 'TABLES_ABSENT', phase: 'source' } };
      if (cal.error || triage.error || snap.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'source' } };

      const data = buildBriefData({ etDate, calendarRows: cal.rows, triageRows: triage.rows, snapshotRows: snap.rows, feederRuns: runsRes.rows });
      if (readiness.degraded) data.headsUp = [...new Set([...data.headsUp, `assembled degraded at deadline — missing: ${readiness.missing.join(', ') || 'none'}`])];
      const check = validateBriefData(data);
      if (!check.valid) return { status: 'failed', counts: { ...counts, error_code: check.refusal, phase: 'validate' } };

      const html = renderBrief(data, { etDate });
      const verdict = verifyRender(html, { etDate });
      counts.verified = verdict.verified;

      if (!apply) return { status: readiness.degraded ? 'degraded' : 'ok', counts, preview: { data_json: data, verified: verdict.verified } };

      const nowIso = now.toISOString();
      const w = await writeRows(sb, 'michael_brief_runs', (t) => t
        .upsert({ et_date: etDate, data_json: data, rendered_html: html, verified: verdict.verified, verify_notes: verdict.verify_notes || null, assembled_at: nowIso, rendered_at: nowIso }, { onConflict: 'et_date' })
        .select('id').single()); // et_date is uniquely indexed — exactly one row, bounded by design
      if (!w.ok) return { status: 'failed', counts: { ...counts, error_code: w.refusal, phase: 'write' } };
      counts.rows_written = 1;
      return { status: readiness.degraded ? 'degraded' : 'ok', counts };
    },
  }, { sb, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runBriefAssemble({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:brief-assemble] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
