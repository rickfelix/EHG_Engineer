// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 -- fix success_metrics text that trips the
// PLAN-TO-LEAD SUCCESS_METRICS gate's unanchored-regex parser (RCA finding, plan-to-lead-metrics-rca).
//
// Root cause (verified against the real gate code, scripts/modules/handoff/executors/
// plan-to-lead/gates/success-metrics-gate.js's parseMetricValue/meetsTarget): the parser scans
// the WHOLE target/actual string for ANY "N%", "N of M", or "N/M" pattern, not just a leading
// one. Metric 1's target embedded "9/16" in a parenthetical counterfactual -> parsed as 56.25,
// not the intended 0. Metric 3's target embedded "100%" in a parenthetical baseline note ->
// parsed as 100, not the intended >0. Metric 1's actual was also a stale, never-updated
// placeholder ("Not yet measured -- pending implementation").
//
// Fix: replace the stale placeholder with a real, evidence-backed actual for metric 1; rewrite
// both targets so contextual numbers are spelled out in words (no digit-pattern the parser can
// misread) rather than embedded as digits. Metric 2 is untouched -- it parses correctly today
// and is genuinely, correctly unmet (target explicitly forward-dated to a not-yet-created
// follow-up SD's writer). Every replacement string was verified against the REAL imported
// parseMetricValue/meetsTarget before being written here (.artifacts/verify-metrics-fix.mjs) --
// not hand-traced, per the exact mistake RCA caught in an earlier proposed fix.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseMetricValue, meetsTarget } from '../modules/handoff/executors/plan-to-lead/gates/success-metrics-gate.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001';

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('success_metrics').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const metrics = current.success_metrics;
if (!Array.isArray(metrics) || metrics.length !== 3) {
  throw new Error(`Expected 3 success_metrics, found ${Array.isArray(metrics) ? metrics.length : typeof metrics}`);
}

metrics[0].target = "0 -- was the dominant failure mode of the original, uncorrected scope (nine of sixteen would have been false positives).";
metrics[0].actual = "0 -- 144 regex_fr_mentions across the 30-SD pinned baseline (20 SDs had at least one), 0 ever promoted a FR to delivered; structurally enforced by TS-9's mutation test.";

// metrics[1] (fr_coverage adoption) intentionally untouched.

metrics[2].target = ">0 -- matching the measured pre-existing baseline (nine of twenty-seven SDs; five entirely undelivered, four mixed); this SD must not regress that count.";
metrics[2].actual = "9 SDs of 27 with FRs already produce at least one undelivered FR today, pre-existing and unrelated to this SD; the 0-classification-diff check confirms no regression.";

// Re-verify against the REAL gate functions right before writing, not just trust the file above.
const checks = [
  { i: 0, expect: true }, { i: 1, expect: false }, { i: 2, expect: true },
];
for (const { i, expect } of checks) {
  const met = meetsTarget(metrics[i].actual, metrics[i].target);
  if (met !== expect) {
    throw new Error(`Metric ${i} verification failed: meetsTarget=${met}, expected ${expect}. Refusing to write.`);
  }
}
const scores = metrics.map((m, i) => {
  const met = meetsTarget(m.actual, m.target);
  return met === true ? 100 : met === false ? 50 : 75;
});
const achievementScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
console.log('Per-metric scores:', scores, '-> achievement:', achievementScore);
if (achievementScore < 70) throw new Error(`Achievement score ${achievementScore} still below 70 -- refusing to write.`);

const { error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ success_metrics: metrics })
  .eq('sd_key', SD_KEY);
if (updateErr) throw updateErr;
console.log('success_metrics updated and re-verified against the real gate parser.');
