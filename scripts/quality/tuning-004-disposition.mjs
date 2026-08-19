/**
 * QF-20260818-306 — snapshot + disposition report, re-measured at claim (2026-08-19).
 *
 * Mirrors tuning-002/tuning-003-disposition.mjs's structure and the same granularity-trap
 * methodology (SD_TYPE_PASS_THRESHOLDS is keyed by sd_type ALONE — scoring.js never passes
 * content_type — so a per-cell INCREASE can only be safely applied when EVERY OTHER content_type
 * cell under that same sd_type already clears the new, higher bar).
 *
 * ADDS the Goodhart falsifier the oracle review (306a3a12) requires and the prior two
 * dispositions did not perform: for each actionable cell, replay ONE real known-bad historical
 * specimen (lowest weighted_score in the 4-week window, individual ai_quality_assessments row,
 * not the aggregate view) against the proposed threshold. If a known-bad specimen CURRENTLY
 * PASSES and would STILL PASS under the new threshold, the increase is masking and must be
 * REJECTED regardless of the aggregate numbers. For a pure INCREASE this is structurally rare
 * (raising a bar cannot turn a fail into a pass), so the falsifier's real value here is
 * confirming (a) a genuine known-bad specimen exists for the cell, and (b) whether it is a
 * CURRENT false negative the increase would newly catch.
 *
 * Read-only. Run: node scripts/quality/tuning-004-disposition.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SD_TYPE_PASS_THRESHOLDS } from '../modules/ai-quality-evaluator/config.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: rows, error } = await sb.from('v_ai_quality_tuning_recommendations').select('*');
if (error) { console.error('view read failed: ' + error.message); process.exit(2); }

const kind = (r) => String(r.recommendation).split(':')[0].split(' ')[0];
const cell = (r) => r.sd_type + ' x ' + r.content_type;
const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

async function knownBad(sd_type, content_type) {
  const { data } = await sb.from('ai_quality_assessments')
    .select('id,content_id,weighted_score,assessed_at')
    .eq('sd_type', sd_type).eq('content_type', content_type)
    .gte('assessed_at', fourWeeksAgo)
    .order('weighted_score', { ascending: true }).limit(1);
  return data?.[0] || null;
}

console.log('=== FR-1 SNAPSHOT (' + rows.length + ' rows, live re-measurement at QF-20260818-306 claim) ===');
const actionable = rows.filter((x) => ['DECREASE', 'INCREASE'].includes(kind(x)));
for (const r of actionable) {
  console.log('  ' + kind(r).padEnd(9) + cell(r).padEnd(34) + ' thr=' + String(r.current_threshold).padEnd(3)
    + '-> ' + String(r.suggested_threshold).padEnd(3) + ' avg=' + String(r.avg_score).padEnd(5)
    + ' pass=' + String(r.pass_rate).padEnd(5) + '% n=' + r.assessments_last_4_weeks);
}

console.log('\n=== GOODHART FALSIFIER — one real known-bad specimen replayed per cell ===');
const verdicts = [];
for (const r of actionable) {
  const kb = await knownBad(r.sd_type, r.content_type);
  const passesOld = kb ? kb.weighted_score >= r.current_threshold : null;
  const passesNew = kb ? kb.weighted_score >= r.suggested_threshold : null;
  const masking = passesOld === true && passesNew === true;
  console.log('  ' + cell(r).padEnd(34) + (kb
    ? `specimen=${kb.content_id} score=${kb.weighted_score} passesOld=${passesOld} passesNew=${passesNew}`
      + (masking ? '  *** MASKING -> REJECT ***' : passesOld ? '  (current false negative, increase would newly catch it)' : '  (already failing; increase adds no new evidence)')
    : 'NO SPECIMEN FOUND in 4-week window'));
  verdicts.push({ r, kb, masking });
}

console.log('\n=== GRANULARITY COLLATERAL CHECK (SD_TYPE_PASS_THRESHOLDS is keyed by sd_type alone) ===');
const applied = [];
const refused = [];
for (const { r, masking } of verdicts) {
  if (masking) { refused.push({ r, reason: 'GOODHART: known-bad specimen would newly pass (masking)' }); continue; }
  const siblings = rows.filter((x) => x.sd_type === r.sd_type && x.content_type !== r.content_type);
  const blockers = siblings.filter((s) => s.avg_score < r.suggested_threshold);
  if (blockers.length === 0) {
    applied.push(r);
  } else {
    refused.push({ r, reason: `GRANULARITY: ${blockers.map((b) => `${b.content_type} avg=${b.avg_score} n=${b.assessments_last_4_weeks}`).join(', ')} cannot clear ${r.suggested_threshold}` });
  }
}

console.log('\n=== VERDICT TABLE ===');
for (const r of applied) {
  // Compare against the ACTUAL LIVE config value, not the view row's own historical
  // current_threshold stamp (which reflects whatever threshold was in effect when that
  // specific assessment ran, and can be stale relative to config.js today).
  const liveConfigValue = SD_TYPE_PASS_THRESHOLDS[r.sd_type];
  const alreadyLive = liveConfigValue >= r.suggested_threshold;
  console.log('  ' + cell(r).padEnd(34) + (alreadyLive
    ? `ALREADY APPLIED (config.js SD_TYPE_PASS_THRESHOLDS.${r.sd_type}=${liveConfigValue}, already >= ${r.suggested_threshold})`
    : `APPLY ${liveConfigValue} -> ${r.suggested_threshold} (no collateral, Goodhart clean)`));
}
for (const { r, reason } of refused) {
  console.log('  ' + cell(r).padEnd(34) + 'REFUSED — ' + reason);
}

console.log(`\nOK: ${applied.length} clear (see ALREADY APPLIED vs APPLY above), ${refused.length} refused.`);
console.log('No threshold is moved by this script — review is the deliverable per QF-20260818-306.');
