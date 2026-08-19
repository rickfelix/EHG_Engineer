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
 * not the aggregate view) against the proposed threshold.
 *
 * MASKING, DEFINED DIRECTION-AGNOSTICALLY: the known-bad specimen currently FAILS
 * (passesOld=false) but would NEWLY PASS under the proposed threshold (passesNew=true). This is
 * the only algebra that can actually fire for a DECREASE (a lowered bar can turn a fail into a
 * pass) -- for a pure INCREASE it is structurally impossible (a raised bar can never turn a fail
 * into a pass), so an INCREASE cell can never be rejected on masking grounds; its own Goodhart
 * value is instead the VALIDATED signal below. An earlier draft of this script defined masking as
 * passesOld && passesNew, which degenerates to "already passing" for a DECREASE and can never
 * fire on a currently-failing specimen -- exactly the case the falsifier exists to catch.
 * Adversarial review on PR #7283 caught this before merge.
 *
 * DECREASE-kind rows are NOT auto-verdicted by the granularity check alone: per
 * tuning-003-disposition.mjs's own precedent, a DECREASE requires the fuller two-sided review
 * QF-20260807-145 established (is the depressed score a CONTENT signal or a THRESHOLD signal).
 * This script surfaces the masking result for a DECREASE but routes it to a HELD bucket rather
 * than an auto-APPLY, even when masking is clear.
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

/**
 * KNOWN LIMITATION (flagged in adversarial review, non-blocking because DECREASE rows always
 * route to HELD regardless of this probe's result -- see the bucketing loop below): this always
 * selects the single global-minimum-score specimen. That is the ideal probe for INCREASE's
 * `validated` signal, but for a DECREASE it is the specimen LEAST likely to land in the
 * [suggested, current) "would newly pass" masking band -- a real near-miss elsewhere in the same
 * window can go unreported in the diagnostic text even though the row is still correctly HELD for
 * human review either way. A future revision could instead search specifically within
 * [suggested, current) when kind(r) === 'DECREASE'.
 */
async function knownBad(sd_type, content_type) {
  const { data, error: qErr } = await sb.from('ai_quality_assessments')
    .select('id,content_id,weighted_score,assessed_at')
    .eq('sd_type', sd_type).eq('content_type', content_type)
    .gte('assessed_at', fourWeeksAgo)
    .order('weighted_score', { ascending: true }).limit(1);
  if (qErr) return { error: qErr.message };
  return { specimen: data?.[0] || null };
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
  const { specimen: kb, error: kbErr } = await knownBad(r.sd_type, r.content_type);
  if (kbErr) {
    console.log('  ' + cell(r).padEnd(34) + 'QUERY FAILED: ' + kbErr + ' -- treated as UNVERIFIED, not "no specimen"');
    verdicts.push({ r, kb: null, kbErr, masking: false, validated: false });
    continue;
  }
  const passesOld = kb ? kb.weighted_score >= r.current_threshold : null;
  const passesNew = kb ? kb.weighted_score >= r.suggested_threshold : null;
  const masking = passesOld === false && passesNew === true;
  const validated = passesOld === true && passesNew === false;
  let note;
  if (!kb) note = 'NO SPECIMEN FOUND in 4-week window';
  else if (masking) note = '*** MASKING: currently fails, would newly pass -> REJECT ***';
  else if (validated) note = '(current false negative: currently passes, would newly fail -> increase catches it)';
  else if (passesOld) note = '(already passing both old and new bar -- this specimen does not validate the change)';
  else note = '(already failing both old and new bar -- change adds no new evidence either way)';
  console.log('  ' + cell(r).padEnd(34) + (kb
    ? `specimen=${kb.content_id} score=${kb.weighted_score} passesOld=${passesOld} passesNew=${passesNew}  ${note}`
    : note));
  verdicts.push({ r, kb, masking, validated });
}

console.log('\n=== GRANULARITY COLLATERAL CHECK (SD_TYPE_PASS_THRESHOLDS is keyed by sd_type alone) ===');
const applied = [];
const refused = [];
const held = [];
for (const { r, masking, kbErr } of verdicts) {
  if (kind(r) === 'DECREASE') {
    // Never auto-verdict a DECREASE from this script alone -- tuning-003-disposition.mjs's own
    // precedent: it needs the fuller two-sided content-vs-threshold-signal review
    // (QF-20260807-145), which this falsifier does not perform.
    held.push({ r, reason: masking ? 'DECREASE + Goodhart MASKING confirmed -- still needs the two-sided review before any action, not a green light' : 'DECREASE -- needs the QF-20260807-145 two-sided review, not performed here' });
    continue;
  }
  if (kbErr) { refused.push({ r, reason: `UNVERIFIED: known-bad query failed (${kbErr}) -- cannot confirm Goodhart-clean` }); continue; }
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
for (const { r, reason } of held) {
  console.log('  ' + cell(r).padEnd(34) + 'HELD — ' + reason);
}

console.log(`\nOK: ${applied.length} clear, ${refused.length} refused, ${held.length} held for further review.`);
console.log('No threshold is moved by this script — review is the deliverable per QF-20260818-306.');
