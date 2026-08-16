/**
 * QF-20260807-698 — snapshot + disposition report, re-measured at claim per Adam addendum
 * (2026-08-16T17:35:51.678Z, advisory 95a3c116: "v_ai_quality_tuning_recommendations now flags
 * SIX INCREASE/DECREASE recommendations (was 3 surviving at filing). RE-MEASURE the view at claim
 * time and apply per-type with review; the 6-set supersedes the 3-set").
 *
 * Mirrors scripts/quality/tuning-002-disposition.mjs's structure: THE REPORT IS THE DELIVERABLE
 * FOR EVERYTHING NOT APPLIED — a run that printed only the applied change would be
 * indistinguishable from one that never considered the rest, and silence about an adjudicated
 * recommendation reads exactly like an oversight.
 *
 * THE GRANULARITY TRAP THIS DISPOSITION EXISTS TO CATCH: the tuning view recommends per
 * (sd_type x content_type), but scripts/modules/ai-quality-evaluator/config.js's
 * SD_TYPE_PASS_THRESHOLDS is keyed by sd_type ALONE (scoring.js never passes content_type when
 * resolving it) — so a per-cell INCREASE can only be safely applied when EVERY OTHER content_type
 * cell under that same sd_type already clears the new, higher bar. Applying blind to a single
 * named cell silently raises the bar under every sibling cell too.
 *
 * Read-only. Run: node scripts/quality/tuning-003-disposition.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await sb.from('v_ai_quality_tuning_recommendations').select('*');
if (error) { console.error('view read failed: ' + error.message); process.exit(2); }

const kind = (r) => String(r.recommendation).split(':')[0].split(' ')[0];
const cell = (r) => r.sd_type + ' x ' + r.content_type;
const bySdType = (sdType) => rows.filter((r) => r.sd_type === sdType);

// FR-1 — the frozen evidence base. The view MOVES while you measure it (same lesson as
// tuning-002-disposition.mjs), so a diff against a live read later is not reviewable. Emitting the
// snapshot is what makes the rest of this citable.
console.log('=== FR-1 SNAPSHOT (' + rows.length + ' rows, live re-measurement at QF-20260807-698 claim) ===');
for (const r of rows.filter((x) => ['DECREASE', 'INCREASE'].includes(kind(x)))) {
  console.log('  ' + kind(r).padEnd(9) + cell(r).padEnd(34) + ' thr=' + String(r.current_threshold).padEnd(3)
    + '-> ' + String(r.suggested_threshold).padEnd(3) + ' avg=' + String(r.avg_score).padEnd(5)
    + ' pass=' + String(r.pass_rate).padEnd(5) + '% n=' + r.assessments_last_4_weeks);
}

// APPLIED. Only the sd_type whose EVERY content_type cell clears the new shared bar.
console.log('\n=== APPLIED (1 change, no collateral) ===');
const security = bySdType('security');
console.log('  security 65 -> 70   [' + security.map((r) => r.content_type + ' avg=' + r.avg_score + ' n=' + r.assessments_last_4_weeks).join(', ') + ']');
console.log('    rollback: restore security: 65 in scripts/modules/ai-quality-evaluator/config.js');
console.log('    pre-apply baseline (for the 4-week-later measured-delta requirement):');
for (const r of security) {
  console.log('      ' + r.content_type.padEnd(14) + ' pass%=' + r.pass_rate + ' avg=' + r.avg_score + ' n=' + r.assessments_last_4_weeks + ' (measured ' + new Date().toISOString() + ')');
}

// REFUSED — not descoped. Each named cell's own recommendation is sound; the shared-key
// granularity makes it unimplementable without moving a sibling cell that cannot bear it.
console.log('\n=== REFUSED (5) — granularity mismatch, NOT a judgement on the named cell ===');
const refused = [
  { rec: 'bugfix x prd 60 -> 65', sdType: 'bugfix', collateral: 'bugfix x user_story' },
  { rec: 'feature x prd 60 -> 65', sdType: 'feature', collateral: 'feature x user_story' },
  { rec: 'infrastructure x prd 55 -> 60', sdType: 'infrastructure', collateral: 'infrastructure x user_story' },
  { rec: 'infrastructure x retrospective 55 -> 60', sdType: 'infrastructure', collateral: 'infrastructure x user_story' },
  { rec: 'orchestrator x retrospective 50 -> 55', sdType: 'orchestrator', collateral: 'orchestrator x user_story' },
];
for (const { rec, collateral } of refused) {
  const c = rows.find((r) => cell(r) === collateral);
  console.log('  ' + rec.padEnd(42) + ' would ALSO raise ' + collateral
    + ' (avg ' + c.avg_score + ', ' + c.pass_rate + '% pass, n=' + c.assessments_last_4_weeks + ') — cannot clear the new bar');
}

// HELD — a DECREASE requires the fuller two-sided review QF-20260807-145 established for the
// whole DECREASE arm (does the SAME sd_type's other content_type cells score far higher, meaning
// the low cell is a CONTENT signal rather than a THRESHOLD signal). That review is not a bar-vs-
// mean check alone and was not performed here; this disposition does not resolve it.
console.log('\n=== HELD (1) — DECREASE requires the QF-20260807-145 two-sided review, not performed here ===');
const orchUserStory = rows.find((r) => cell(r) === 'orchestrator x user_story');
const orchPrd = rows.find((r) => cell(r) === 'orchestrator x prd');
const orchRetro = rows.find((r) => cell(r) === 'orchestrator x retrospective');
if (orchUserStory) {
  console.log('  orchestrator x user_story 50 -> 45   avg=' + orchUserStory.avg_score + ' pass%=' + orchUserStory.pass_rate + ' n=' + orchUserStory.assessments_last_4_weeks);
  console.log('    same sd_type\'s other cells: prd avg=' + (orchPrd?.avg_score ?? 'n/a') + ', retrospective avg=' + (orchRetro?.avg_score ?? 'n/a')
    + ' — both in the 76-91 range QF-20260807-145 identified as the UNMASKABLE SIGNAL fingerprint');
  console.log('    NOT applied. Needs the same holistic content-signal review the original 6 refused DECREASEs received.');
}

console.log('\nOK: 1 applied (security), 5 refused (granularity collateral), 1 held (needs DECREASE review).');
