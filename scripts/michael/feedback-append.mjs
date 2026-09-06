#!/usr/bin/env node
// scripts/michael/feedback-append.mjs — the ledger entry that closes a morning conversation and the
// per-decision disposition grain autonomy-read computes streaks from (spec §2/§7, Solomon Q4).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-3). Upserts michael_feedback_ledger by et_date;
// dispositions are APPENDED on the same day, never replaced.
//
// Usage: node scripts/michael/feedback-append.mjs [--date 2026-09-06] [--landed "..."] [--friction "..."] \
//          [--outcome "..."] [--acted] --disposition '{"topic":"gmail","rule_key":"newsletters-archive","proposed":"archive","chosen":"approve","reasoning":"..."}' \
//          [--dry-run] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt } from '../../lib/michael/db.mjs';

export const CHOSEN = Object.freeze(['approve', 'override', 'auto', 'skip']);

/** Pure: validate one disposition entry. Returns { ok, message?, disposition? }. */
export function normalizeDisposition(raw, now = new Date()) {
  let d = raw;
  if (typeof raw === 'string') {
    try { d = JSON.parse(raw); } catch (e) { return { ok: false, message: `--disposition is not JSON: ${e.message}` }; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, message: 'disposition must be a JSON object' };
  if (!CHOSEN.includes(d.chosen)) return { ok: false, message: `chosen must be one of ${CHOSEN.join('|')} (got ${d.chosen})` };
  if (!d.topic) return { ok: false, message: 'disposition.topic is required' };
  return {
    ok: true,
    disposition: {
      topic: String(d.topic),
      rule_key: d.rule_key ? String(d.rule_key) : null,
      proposed: d.proposed ?? null,
      chosen: d.chosen,
      reasoning: d.reasoning ?? null,
      at: d.at || now.toISOString(),
    },
  };
}

export async function runFeedbackAppend({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  const etDate = typeof a.date === 'string' ? a.date : todayEt(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDate)) return refusal('DATE_INVALID', '--date must be YYYY-MM-DD (ET calendar day)');
  const dispositions = [];
  const rawList = a.disposition === undefined ? [] : Array.isArray(a.disposition) ? a.disposition : [a.disposition];
  for (const raw of rawList) {
    const n = normalizeDisposition(raw, now);
    if (!n.ok) return refusal('DISPOSITION_INVALID', n.message);
    dispositions.push(n.disposition);
  }
  const hasField = ['landed', 'friction', 'outcome'].some((k) => typeof a[k] === 'string') || a.acted === true;
  if (!dispositions.length && !hasField) return refusal('MISSING_ARGS', 'pass at least one of --disposition, --landed, --friction, --outcome, --acted');

  const existing = await readRows(sb, 'michael_feedback_ledger', (q) => q.eq('et_date', etDate));
  if (existing.tables_absent) return refusal('TABLES_ABSENT', 'michael_feedback_ledger is not applied yet (chairman applies 20260906_michael_tables.sql)');
  if (existing.error) return refusal('READ_FAILED', existing.error);
  const prior = existing.rows[0] || null;
  const merged = [...(prior && Array.isArray(prior.dispositions) ? prior.dispositions : []), ...dispositions];
  const row = {
    et_date: etDate,
    dispositions: merged,
    landed: typeof a.landed === 'string' ? a.landed : prior?.landed ?? null,
    friction: typeof a.friction === 'string' ? a.friction : prior?.friction ?? null,
    outcome_vs_jobs: typeof a.outcome === 'string' ? a.outcome : prior?.outcome_vs_jobs ?? null,
    acted: a.acted === true ? true : Boolean(prior?.acted),
  };
  if (a['dry-run']) return { ok: true, dry_run: true, would_write: row, appended: dispositions.length };
  const w = await writeRows(sb, 'michael_feedback_ledger', (t) => t.upsert(row, { onConflict: 'et_date' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error);
  return { ok: true, id: w.data ? w.data.id : null, et_date: etDate, appended: dispositions.length, total: merged.length };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runFeedbackAppend({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-FEEDBACK-APPEND] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
