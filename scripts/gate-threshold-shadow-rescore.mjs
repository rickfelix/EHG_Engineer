#!/usr/bin/env node
/**
 * Gate-threshold shadow re-score. QF-20260902-515.
 *
 * Solomon's ruling (84c92184) on the parked gate-threshold tuning candidate (f10c6ef5): no
 * threshold may change without a verification plan, because the blast radius is every future
 * gate verdict on the affected pairs. This is that plan's instrument, not the change itself.
 *
 * For each v_ai_quality_tuning_recommendations row whose suggested_threshold differs from its
 * current_threshold, re-scores the SAME population the view already counted (assessments of
 * that sd_type x content_type scored under that current_threshold in the trailing 28 days)
 * against both thresholds and writes one durable `feedback` row (category
 * gate_threshold_shadow) with n, both pass rates, PASS-to-FAIL / FAIL-to-PASS flip counts, and
 * the view's own n>=10 sample-floor verdict.
 *
 * NO THRESHOLD IS CHANGED. This reports pass-rate deltas per pair — never the LEO Intelligence
 * Integration score (lib/adam/briefings/harness.js:22-29 counts recommendations as opportunity
 * and must not be the target of this instrument).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeShadowRescore } from '../lib/quality/gate-threshold-shadow.js';
import { emitFeedbackBatch } from '../lib/governance/emit-feedback.js';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WINDOW_DAYS = 28;
const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

// A silent-truncated view read would drop candidate cells without any error — full pagination,
// not a fixed limit(), even though the view's cardinality (sd_type x content_type x historical
// threshold) is small today.
let view;
try {
  view = await fetchAllPaginated(() => supabase.from('v_ai_quality_tuning_recommendations').select('*'));
} catch (err) {
  console.error('view read failed:', err.message);
  process.exit(1);
}

const candidates = view.filter((r) => r.suggested_threshold !== null && r.suggested_threshold !== r.current_threshold);
console.log(`\n${candidates.length} candidate cell(s) out of ${view.length} view rows.\n`);

const items = [];
for (const c of candidates) {
  // A silent-truncated population read would UNDER-COUNT flips without any error — a wrong
  // shadow number is worse than no number for a decision input, so this reads ALL matching
  // rows via range-pagination rather than a single capped select().
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('ai_quality_assessments')
      .select('weighted_score')
      .eq('sd_type', c.sd_type)
      .eq('content_type', c.content_type)
      .eq('pass_threshold', c.current_threshold)
      .gte('assessed_at', windowStart));
  } catch (err) {
    console.error(`re-score read failed for ${c.sd_type}/${c.content_type}:`, err.message);
    continue;
  }

  const shadow = computeShadowRescore(rows, c.current_threshold, c.suggested_threshold);
  const cell = `${c.sd_type}/${c.content_type}`;

  console.log(
    `${cell.padEnd(28)} n=${String(shadow.n).padEnd(5)} ${c.current_threshold}->${c.suggested_threshold}`.padEnd(50)
    + `pass ${shadow.currentPassRatePct}%->${shadow.candidatePassRatePct}%  `
    + `PASS->FAIL=${shadow.passToFailFlips} FAIL->PASS=${shadow.failToPassFlips} ${shadow.sampleFloorVerdict}`
  );

  items.push({
    title: `Gate-threshold shadow re-score: ${cell} ${c.current_threshold}->${c.suggested_threshold}`,
    description: `Shadow re-score (no change applied): ${cell} n=${shadow.n} over trailing `
      + `${WINDOW_DAYS}d, current_threshold=${c.current_threshold} (pass ${shadow.currentPassRatePct}%), `
      + `candidate_threshold=${c.suggested_threshold} (pass ${shadow.candidatePassRatePct}%), `
      + `PASS-to-FAIL flips=${shadow.passToFailFlips}, FAIL-to-PASS flips=${shadow.failToPassFlips}, `
      + `sample_floor=${shadow.sampleFloorVerdict}.`,
    category: 'gate_threshold_shadow',
    dedup_key: `gate_threshold_shadow:${c.sd_type}:${c.content_type}:${c.current_threshold}:${c.suggested_threshold}`,
    metadata: {
      sd_type: c.sd_type, content_type: c.content_type, window_days: WINDOW_DAYS,
      current_threshold: c.current_threshold, candidate_threshold: c.suggested_threshold,
      n: shadow.n, current_pass_rate_pct: shadow.currentPassRatePct, candidate_pass_rate_pct: shadow.candidatePassRatePct,
      pass_to_fail_flips: shadow.passToFailFlips, fail_to_pass_flips: shadow.failToPassFlips,
      sample_floor_verdict: shadow.sampleFloorVerdict,
    },
  });
}

if (items.length > 0) {
  const result = await emitFeedbackBatch({ supabase, items });
  console.log(`\nwrote ${result.inserted.length} row(s), deduped ${result.deduped.length}, skipped ${result.skipped}.`);
}

console.log('\nNo threshold was changed. This is decision input only.\n');
