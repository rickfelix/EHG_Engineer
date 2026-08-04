/**
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002 — snapshot + disposition report.
 *
 * FR-1 (snapshot), FR-3 (blocked six reported, never dropped) and the two REFUSED INCREASEs in one
 * artifact. THE REPORT IS THE DELIVERABLE FOR EVERYTHING NOT APPLIED: a run that printed only the
 * applied change would be indistinguishable from one that never considered the other nine, and
 * silence about an adjudicated recommendation reads exactly like an oversight.
 *
 * Read-only. Run: node scripts/quality/tuning-002-disposition.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows, error } = await sb.from('v_ai_quality_tuning_recommendations').select('*');
if (error) { console.error('view read failed: ' + error.message); process.exit(2); }

const kind = (r) => String(r.recommendation).split(':')[0].split(' ')[0];
const cell = (r) => r.sd_type + ' x ' + r.content_type;

// FR-1 — the frozen evidence base. The view MOVES while you measure it (infrastructure x user_story
// was observed going n=1457/avg 41.3 -> n=1466/avg 41.5 inside forty minutes), so a diff against a
// live read is not reviewable. Emitting the snapshot is what makes the rest of this citable.
console.log('=== FR-1 SNAPSHOT (' + rows.length + ' rows) ===');
for (const r of rows.filter((x) => ['DECREASE', 'INCREASE'].includes(kind(x)))) {
  console.log('  ' + kind(r).padEnd(9) + cell(r).padEnd(34) + ' thr=' + String(r.current_threshold).padEnd(3)
    + '-> ' + String(r.suggested_threshold).padEnd(3) + ' avg=' + String(r.avg_score).padEnd(5)
    + ' pass=' + String(r.pass_rate).padEnd(5) + '% n=' + r.assessments_last_4_weeks);
}

// APPLIED. One config key satisfying two recommendations, with no collateral.
console.log('\n=== APPLIED (1 change, satisfies 2 recommendations) ===');
console.log('  refactor 60 -> 65   [refactor x retrospective 88.4/100%/n=11, refactor x user_story 82.4/100%/n=41]');
console.log('    rollback: DELETE the refactor key — it did not exist before and fell through to DEFAULT_THRESHOLD 60');
console.log('    consequence: refactor x user_story is TUNING-001 scorer-exoneration CONTROL. Its bar moved 2026-08-04.');

// REFUSED — not descoped. The recommendation is sound for the named cell and unimplementable at the
// granularity the config supports, which is a different thing from being wrong.
console.log('\n=== REFUSED (2) — granularity mismatch, NOT a judgement on the recommendation ===');
console.log('  scoring.js:88 resolves SD_TYPE_PASS_THRESHOLDS[sd.sd_type] and never sees content_type,');
console.log('  so a per-cell recommendation cannot be applied without moving every cell in that sd_type.');
for (const [rec, collateral] of [
  ['feature x prd 60 -> 65', 'feature x user_story'],
  ['infrastructure x retrospective 55 -> 60', 'infrastructure x user_story'],
]) {
  const c = rows.find((r) => cell(r) === collateral);
  console.log('  ' + rec.padEnd(42) + ' would ALSO raise ' + collateral
    + ' (avg ' + c.avg_score + ', ' + c.pass_rate + '% pass, n=' + c.assessments_last_4_weeks + ') — a HELD lane');
}

// FR-3 — the six held rows, reported with the measurement that holds them.
const dec = rows.filter((r) => kind(r) === 'DECREASE');
console.log('\n=== HELD (' + dec.length + ') — blocked by SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001 (PR #6816) ===');
let cosmetic = 0;
for (const r of dec) {
  const gap = Number(r.suggested_threshold) - Number(r.avg_score);
  if (gap > 0) cosmetic++;
  console.log('  ' + cell(r).padEnd(34) + ' thr=' + r.current_threshold + ' UNCHANGED; the -5 bar would still sit '
    + gap.toFixed(1) + ' ABOVE the mean');
}
console.log('  -> ' + cosmetic + '/' + dec.length + ' are cosmetic: the cut would not move their pass rate.');
console.log('  -> 001 FR-4 gates re-evaluation behind its FR-1 AND FR-2; FR-2 is blocked three ways, so the hold stands.');

// FR-6 — the disposition travels with the SD so a re-source arrives answered.
const ineff = rows.filter((r) => kind(r) === 'INEFFECTIVE').length;
console.log('\n=== FR-6 RE-SOURCING NOTICE ===');
console.log('  001 symmetric-guard DDL applied? ' + (ineff ? 'YES' : 'NO — still the permissive rule'));
console.log('  While unapplied, the daily scan will KEEP emitting these ' + dec.length + ' DECREASEs and this SD will be');
console.log('  re-sourced. The scan is deliberately not suppressed: one that stops reporting a live');
console.log('  condition is worse than a duplicate SD. This disposition is the answer to attach next time.');

// EXIT CODE CARRIES THE HELD-SET INVARIANT so a CI consumer cannot read a clean run as "all applied".
const moved = dec.filter((r) => ({ bugfix: 60, database: 65, documentation: 50, feature: 60, infrastructure: 55, orchestrator: 50 })[r.sd_type] !== Number(r.current_threshold));
if (moved.length) {
  console.error('\nFAIL: ' + moved.length + ' held threshold(s) MOVED — a narrowed SD must not re-open the hold.');
  process.exit(1);
}
console.log('\nOK: all ' + dec.length + ' held thresholds unchanged.');
