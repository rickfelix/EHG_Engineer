#!/usr/bin/env node
// scripts/michael/brief-finalize.mjs — the seat's overnight-enrichment overlay (spec §6).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E (FR-5).
//
// A seat verb in the scripts/michael/classify-apply.mjs shape — direct read, guarded write, never
// runs through runFeeder (not a durable-venue feeder; no attempt/single-flight bookkeeping). Rebuilds
// data_json from the CURRENT calendar/triage/snapshot state, which already reflects whatever the
// seat's classify-apply.mjs wrote, so the lede and the Today sentence are the natural byproduct of a
// fresh buildBriefData call rather than a separate patch. Re-renders through render-brief.js and
// re-verifies before writing.
//
// Refuses (no write at all) when: no michael_brief_runs row exists for the ET date, or the row was
// not assembled (assembled_at unset) — there is nothing to overlay onto. When the re-render FAILS
// verification, it still writes (rendered_html / verified:false / verify_notes) so the attempt stays
// visible, but does NOT stamp enriched_at — never claim more than landed.
//
// DRY-RUN BY DEFAULT: --apply writes.
//
// Usage: node scripts/michael/brief-finalize.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt } from '../../lib/michael/db.mjs';
import { buildBriefData, validateBriefData } from '../../lib/michael/brief-model.mjs';
import { renderBrief, verifyRender } from '../../lib/michael/render-brief.js';

/** deps: { sb, argv, now }. Never throws. */
export async function runBriefFinalize({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const etDate = a['et-date'] !== undefined ? String(a['et-date']) : todayEt(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDate)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');

  const rowRes = await readRows(sb, 'michael_brief_runs', (q) => q.eq('et_date', etDate), { select: 'id,et_date,assembled_at,data_json' });
  if (rowRes.tables_absent) return refusal('TABLES_ABSENT', 'michael_brief_runs is not applied yet');
  if (rowRes.error) return refusal('READ_FAILED', rowRes.error);
  const row = rowRes.rows[0];
  if (!row) return refusal('NO_ROW', `no michael_brief_runs row for ${etDate} — brief-assemble.mjs has not run yet`);
  if (!row.assembled_at) return refusal('NOT_ASSEMBLED', `michael_brief_runs row for ${etDate} was not assembled`);

  const [cal, triage, snap, runs] = await Promise.all([
    readRows(sb, 'michael_calendar_day', (q) => q.eq('et_date', etDate), { select: 'et_date,event_id,coded_marker,optional,overlap_group' }),
    readRows(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate), { select: 'et_date,thread_id,class,action_taken_at,needs_you,needs_you_reason' }),
    readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate), { select: 'et_date,task_id,effort_grade' }),
    readRows(sb, 'michael_feeder_runs', (q) => q.eq('et_date', etDate), { select: 'feeder,attempt,status,counts,id' }),
  ]);
  if (cal.tables_absent || triage.tables_absent || snap.tables_absent || runs.tables_absent) return refusal('TABLES_ABSENT', 'a source table is not applied yet');
  if (cal.error || triage.error || snap.error || runs.error) return refusal('READ_FAILED', 'source read failed');

  const data = buildBriefData({ etDate, calendarRows: cal.rows, triageRows: triage.rows, snapshotRows: snap.rows, feederRuns: runs.rows });
  // Enrichment stays scoped to signals in v1 (brief-model.mjs header); this is the one line
  // that marks the seat actually touched the row, distinct from an unenriched brief of record.
  data.enrichment = { ...data.enrichment, signals: ['overnight enrichment applied by the seat'] };
  const check = validateBriefData(data);
  if (!check.valid) return refusal(check.refusal, check.message);

  const html = renderBrief(data, { etDate });
  const verdict = verifyRender(html, { etDate });

  if (!apply) return { ok: true, action: 'dry_run', et_date: etDate, verified: verdict.verified, preview: { data_json: data } };

  const nowIso = now.toISOString();
  const patch = { data_json: data, rendered_html: html, verified: verdict.verified, verify_notes: verdict.verify_notes || null, rendered_at: nowIso };
  // Never stamp enriched_at on a failing render — that field is the "trust this enrichment" signal.
  if (verdict.verified) patch.enriched_at = nowIso;
  const w = await writeRows(sb, 'michael_brief_runs', (t) => t.update(patch).eq('et_date', etDate).select('id'));
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'run', et_date: etDate, verified: verdict.verified, enriched: verdict.verified };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runBriefFinalize({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r && r.ok === false ? 2 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:brief-finalize] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
