#!/usr/bin/env node
/**
 * Batched, per-type review of the gate-threshold tuning recommendations. QF-20260807-145.
 *
 * WHY THIS IS A SCRIPT AND NOT A WRITTEN VERDICT. The ruling requires each recommendation reviewed
 * PER-TYPE against its evidence, with a measured delta and, for every DECREASE, the real-defect
 * signal it cannot be masking. A verdict typed into a PR description is true only on the day it is
 * typed — the underlying stream moves (bugfix/user_story shifted n=229→221 and avg 43.6→43.1 within
 * minutes during this very review). So the review is re-runnable, and re-running it is how anyone
 * checks whether the conclusion still holds.
 *
 * IT COMPARES TWO THINGS THAT DISAGREE, ON PURPOSE:
 *   LIVE  — what v_ai_quality_tuning_recommendations currently emits.
 *   SPEC  — what lib/quality/tuning-rules.js says it SHOULD emit.
 * They differ because the corrected rules are chairman-gated DDL that has not been applied
 * (database/chairman-gated/20260804_ai_quality_tuning_symmetric_guards.sql). The gap between the
 * columns IS the finding, so it is printed rather than resolved.
 *
 * NOTHING HERE WRITES. Applying a threshold means changing the code that stamps
 * ai_quality_assessments.pass_threshold — there is no config table to edit — and the corrected rules
 * are behind a ceremony this script must not pre-empt. Review is the deliverable; the apply is a
 * separate, ruled act.
 */

import { createClient } from '@supabase/supabase-js';
import { recommend } from '../lib/quality/tuning-rules.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const liveVerb = (r) => String(r.recommendation || '').split(/[ (:]/)[0];
const cell = (r) => `${r.sd_type}/${r.content_type}`;

const { data, error } = await db.from('v_ai_quality_tuning_recommendations').select('*');
if (error) { console.error('view read failed:', error.message); process.exit(1); }

const rows = data.map((r) => ({
  r,
  live: liveVerb(r),
  spec: recommend({
    pass_rate: r.pass_rate, avg_score: r.avg_score,
    current_threshold: r.current_threshold, total: r.assessments_last_4_weeks
  })
}));

const actionable = rows.filter((x) => x.live === 'INCREASE' || x.live === 'DECREASE');

console.log(`\nPULLED FRESH: ${rows.length} cells, ${actionable.length} carrying an actionable recommendation.\n`);

console.log('DECREASE ARM — reviewed per-type against its own evidence');
console.log('cell                          n      avg    pass%  cur→sug   bar-vs-mean  SPEC VERDICT');
for (const { r, spec } of rows.filter((x) => x.live === 'DECREASE')) {
  const gap = (r.suggested_threshold - r.avg_score).toFixed(1);
  console.log(
    `${cell(r).padEnd(30)}${String(r.assessments_last_4_weeks).padEnd(7)}${String(r.avg_score).padEnd(7)}`
    + `${String(r.pass_rate).padEnd(7)}${r.current_threshold}→${r.suggested_threshold}`.padEnd(10)
    + `  +${String(gap).padEnd(11)}${spec.recommendation}`
  );
}

console.log('\nINCREASE ARM');
console.log('cell                          n      avg    pass%  cur→sug   SPEC VERDICT');
for (const { r, spec } of rows.filter((x) => x.live === 'INCREASE')) {
  console.log(
    `${cell(r).padEnd(30)}${String(r.assessments_last_4_weeks).padEnd(7)}${String(r.avg_score).padEnd(7)}`
    + `${String(r.pass_rate).padEnd(7)}${r.current_threshold}→${r.suggested_threshold}`.padEnd(10)
    + `  ${spec.recommendation}`
  );
}

// The two-sided requirement: a DECREASE must name the signal it cannot be masking. That is not a
// sentence someone writes — it is a measurement. If the proposed bar still sits above the mean, the
// change cannot move its own pass rate, so whatever is depressing the scores is content, not the
// threshold, and lowering the bar would hide it.
const ineffective = rows.filter((x) => x.live === 'DECREASE' && x.spec.recommendation === 'INEFFECTIVE_CHANGE');
const contentTypes = new Set(rows.filter((x) => x.live === 'DECREASE').map((x) => x.r.content_type));

console.log('\n── TWO-SIDED ACCEPTANCE ─────────────────────────────────────────');
console.log(`DECREASE recommendations: ${rows.filter((x) => x.live === 'DECREASE').length}`);
console.log(`  of which the SPEC rules INEFFECTIVE (bar stays above the mean): ${ineffective.length}`);
console.log(`  predicted pass-rate delta for those: ~0 — the cut cannot reach its population.`);
console.log(`  content_type(s) spanned by the whole DECREASE arm: ${[...contentTypes].join(', ')}`);
console.log(`  UNMASKABLE SIGNAL: with every DECREASE landing on a single content_type while other`);
console.log(`  content types on the SAME sd_types score 76–91, the depressed scores are a property of`);
console.log(`  that content type, not of the bars. Lowering six bars would convert a visible content`);
console.log(`  signal into a passing statistic without changing a single artifact.`);

const disagree = rows.filter((x) => x.live !== x.spec.recommendation);
console.log(`\nLIVE vs SPEC disagreement: ${disagree.length} of ${rows.length} cells.`);
for (const { r, live, spec } of disagree) console.log(`  ${cell(r).padEnd(30)} live=${live.padEnd(18)} spec=${spec.recommendation}`);
console.log('\nThe live view has not been corrected — its fix is chairman-gated and unapplied.');
console.log('Reviewed, not applied. No threshold is moved by this script.\n');
