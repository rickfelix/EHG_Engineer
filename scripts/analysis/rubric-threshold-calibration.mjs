/**
 * Per-rubric total_score distribution — the calibration input for resolveThreshold(sdType, rubric).
 *
 * WHY THIS EXISTS. FR-1 AC-2 requires the resolver to produce DIFFERENT base thresholds for
 * different rubrics under one sd_type. Any specific pair of numbers invented at a keyboard would be
 * a policy dressed as a measurement, and it would gate real work. The rubrics DO have measurably
 * different score distributions, so the offsets are derived here instead of guessed.
 *
 * IMPORTS identifyRubric FROM THE LIB rather than re-implementing the classifier. A second copy of
 * the matching rules is the same single-representation defect this SD exists to remove — and a
 * calibration computed with a classifier that disagrees with the shipped one is worse than no
 * calibration, because it looks derived.
 *
 * Re-run:  node scripts/analysis/rubric-threshold-calibration.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { identifyRubric } from '../../lib/handoff/threshold-resolver.js';

const PAGE = 500;

function quantile(sortedNums, q) {
  if (sortedNums.length === 0) return null;
  const pos = (sortedNums.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sortedNums[lo];
  return sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (pos - lo);
}

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const { count: expected, error: cErr } = await sb
  .from('eva_vision_scores').select('*', { count: 'exact', head: true });
if (cErr) throw new Error('count failed: ' + cErr.message);

const byRubric = new Map();
let seen = 0, nullScores = 0;

for (let from = 0; from < expected; from += PAGE) {
  const { data, error } = await sb
    .from('eva_vision_scores')
    .select('total_score, dimension_scores')
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`page ${from} failed: ${error.message}`);
  if (!data || data.length === 0) break;
  for (const row of data) {
    seen++;
    const rubric = identifyRubric(row.dimension_scores);
    if (!byRubric.has(rubric)) byRubric.set(rubric, []);
    const s = row.total_score;
    if (typeof s !== 'number' || !Number.isFinite(s)) { nullScores++; continue; }
    byRubric.get(rubric).push(s);
  }
}

// A census that silently read fewer rows than exist reports a clean-looking number for a
// population it never saw.
console.log(`expected=${expected} seen=${seen} ${seen === expected ? 'OK' : '*** INCOMPLETE ***'}`);
console.log(`rows with non-numeric total_score = ${nullScores}\n`);

const GRID = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90];
const rows = [...byRubric.entries()].sort((a, b) => b[1].length - a[1].length);

console.log('rubric                 n  ' + GRID.map(q => ('p' + Math.round(q * 100)).padStart(6)).join(''));
for (const [rubric, scores] of rows) {
  const s = [...scores].sort((a, b) => a - b);
  if (s.length === 0) { console.log(`${rubric.padEnd(20)} ${String(scores.length).padStart(5)}   (no numeric scores)`); continue; }
  console.log(`${rubric.padEnd(20)} ${String(s.length).padStart(5)}  ` +
    GRID.map(q => quantile(s, q).toFixed(1).padStart(6)).join(''));
}

// Emitted in paste-ready form so the table shipped in the lib is the table this run MEASURED,
// rather than a hand-transcription of it. Hand-copying a 45-number grid is a defect waiting to
// happen, and a mistyped calibration is invisible — it just gates slightly wrong forever.
console.log('\n// ── paste into lib/handoff/threshold-resolver.js ──');
console.log(`// MEASURED ${new Date().toISOString().slice(0, 10)} over ${seen} rows (full population).`);
console.log('export const RUBRIC_QUANTILES = {');
for (const [rubric, scores] of rows) {
  const s = [...scores].sort((a, b) => a - b);
  if (s.length === 0) continue;
  console.log(`  '${rubric}': { n: ${s.length}, q: [${GRID.map(q => quantile(s, q).toFixed(1)).join(', ')}] },`);
}
console.log('};');
