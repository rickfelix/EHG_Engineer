#!/usr/bin/env node
// scripts/michael/brief-doc.mjs — Drive-doc copy of the finalized brief (GHA venue, own credential).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E (FR-7). LEAD correction after VALIDATION 0adb8248:
// GOOGLE_SERVICE_ACCOUNT_JSON is a GHA-only repo secret, not the chairman OAuth grant the SD title's
// "(host)" assumed — a host-only script would be dead by construction. assertHostVenue is never
// imported here.
//
// Gated on today's michael_brief_runs row having assembled_at set (the GHA assembler already ran).
// Idempotent per date: a doc id already at data_json.logs.brief_doc means a prior run already wrote
// it — this run is a no-op, never a duplicate doc. Derives a plain-text brief_md from data_json
// (no other component in this child populates that column), runs it through runPreShipGate
// (lib/daily-review/artifact-preship-gate.js, reused unmodified) before ANY write, and refuses the
// doc write if the gate blocks. createBriefDoc (lib/daily-review/drive-doc-client.js) fails closed
// via MissingCredentialError when GOOGLE_SERVICE_ACCOUNT_JSON is absent — that failure IS the venue
// guard; no separate check is written.
//
// DRY-RUN BY DEFAULT: --apply writes (both the Drive doc and the michael_brief_runs patch).
//
// Usage: node scripts/michael/brief-doc.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt } from '../../lib/michael/db.mjs';
import { runPreShipGate } from '../../lib/daily-review/artifact-preship-gate.js';
import { createBriefDoc } from '../../lib/daily-review/drive-doc-client.js';
import { formatLongDate } from '../../lib/michael/render-brief.js';

/** Pure: schema-2 data_json -> plain text, the Drive doc body (createBriefDoc inserts verbatim). */
export function renderBriefText(data = {}, { etDate } = {}) {
  const longDate = formatLongDate(etDate || data.date);
  const fp = data.frontPage || {};
  const today = fp.today || {};
  const gmail = fp.gmail || {};
  const todoist = fp.todoist || {};
  const ehg = fp.ehg || {};
  const lines = [longDate, '', data.lede || '', ''];
  if (Array.isArray(data.headsUp) && data.headsUp.length) {
    lines.push('Heads up:');
    for (const h of data.headsUp) lines.push(`- ${h}`);
    lines.push('');
  }
  lines.push(`Today: ${today.event_count || 0} event(s), ${today.coded_count || 0} coded, ${today.optional_open || 0} optional open.`);
  lines.push(`Gmail: ${gmail.handled || 0} handled, ${gmail.unclassifiedCount || 0} unclassified. ${gmail.call || ''}`);
  lines.push(`Todoist: ${todoist.state || ''} — ${todoist.note || ''}`);
  if (ehg.shown) lines.push(`${ehg.pointer || ''}: ${ehg.handedCount || 0}`);
  return lines.join('\n');
}

/** Pure: the numeric/date facts in data_json, mapped to runPreShipGate's elements shape. Every
 * element carries a named source, so rule 1 (source-attribution) never fires on this deterministic
 * data — the gate's real job here is a structural safety net against a future regression. */
export function buildPreShipElements(data = {}, { etDate } = {}) {
  const fp = data.frontPage || {};
  return [
    { id: 'date', kind: 'date', value: etDate || data.date, source: 'etDate (chairman ET wall clock)' },
    { id: 'gmail.unclassifiedCount', kind: 'number', value: (fp.gmail || {}).unclassifiedCount || 0, source: 'michael_gmail_triage_items' },
    { id: 'ehg.handedCount', kind: 'number', value: (fp.ehg || {}).handedCount || 0, source: 'michael_todoist_snapshot (via todoist-brief counts.ehg_pointer)' },
  ];
}

/** deps: { sb, argv, now, createDoc, env }. Never throws. */
export async function runBriefDoc({ sb, argv = [], now = new Date(), createDoc = createBriefDoc, env = process.env } = {}) {
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
  const existingDocId = row.data_json && row.data_json.logs && row.data_json.logs.brief_doc;
  if (existingDocId) return { ok: true, action: 'noop', reason: 'already_created', doc_id: existingDocId, et_date: etDate };

  const briefMd = renderBriefText(row.data_json || {}, { etDate });
  const elements = buildPreShipElements(row.data_json || {}, { etDate });
  const verdict = runPreShipGate({ elements }, { getForecast: () => undefined });
  if (verdict.blocked) return refusal('PRESHIP_BLOCKED', 'pre-ship gate blocked delivery', { offending: verdict.offending });

  if (!apply) return { ok: true, action: 'dry_run', et_date: etDate, preview: { brief_md: briefMd } };

  let created;
  try {
    created = await createDoc({ title: `Michael's Brief — ${etDate}`, body: briefMd }, { env });
  } catch (e) {
    const code = e && e.name === 'MissingCredentialError' ? 'MISSING_CREDENTIAL' : ((e && e.code) || 'DRIVE_WRITE_FAILED');
    return refusal(code, (e && e.message) || 'createBriefDoc failed');
  }

  const nextData = { ...(row.data_json || {}), logs: { ...((row.data_json || {}).logs || {}), brief_doc: created.docId } };
  // et_date is uniquely indexed — exactly one row, bounded by design.
  const w = await writeRows(sb, 'michael_brief_runs', (t) => t.update({ data_json: nextData, brief_md: briefMd }).eq('et_date', etDate).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, action: 'run', et_date: etDate, doc_id: created.docId, web_view_link: created.webViewLink };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runBriefDoc({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r && r.ok === false ? 2 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:brief-doc] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
