/**
 * BLAST RADIUS of migrating a gate from (SD_TYPE_THRESHOLDS + calculateDynamicThreshold)
 * onto resolveEffectiveThreshold.  SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001 FR-1.
 *
 * WHY THIS RUNS BEFORE ANY GATE IS REWIRED. FR-2's acceptance criterion required counting
 * in-flight impact before merging a change that moved five sd_type thresholds. This change moves
 * EVERY threshold on EVERY scoring SD, so it needs the same count a fortiori. A migration whose
 * effect is described rather than counted is a migration nobody can approve.
 *
 * COUNTS A VERDICT FLIP, NOT A THRESHOLD DELTA. A threshold that moves 4 points changes nothing if
 * the score clears both numbers; a threshold that moves 1 point flips the gate if the score sits
 * between them. Only the flip is the blast.
 *
 * USES THE LATEST SCORE PER SD, because that is what a gate reads. Counting all 6059 historical
 * rows would inflate the radius with scores no gate will ever consult again.
 *
 * Re-run:  node scripts/analysis/rubric-migration-blast-radius.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  identifyRubric,
  resolveEffectiveThreshold,
  countAddressableDimensions,
  calculateDynamicThreshold,
  SD_TYPE_THRESHOLDS,
} from '../../lib/handoff/threshold-resolver.js';

const PAGE = 500;
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function pageAll(table, columns) {
  const { count, error: cErr } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (cErr) throw new Error(`${table} count failed: ${cErr.message}`);
  const out = [];
  for (let from = 0; from < count; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} page ${from} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
  }
  if (out.length !== count) throw new Error(`${table}: read ${out.length} of ${count} — INCOMPLETE, refusing to report`);
  return out;
}

const scores = await pageAll('eva_vision_scores', 'sd_id, total_score, dimension_scores, scored_at, invalidated_at');
const sds = await pageAll('strategic_directives_v2', 'id, sd_key, sd_type, status, metadata');

// Latest LIVE score per SD — what a gate actually reads.
// INVALIDATED ROWS ARE EXCLUDED. A gate does not consult an invalidated score, so counting one
// as the SD's current reading would measure a population no gate sees — and would let a stale
// row masquerade as the live verdict for an SD whose real latest score is different.
let invalidatedSkipped = 0;
const latest = new Map();
for (const r of scores) {
  if (!r.sd_id) continue;
  if (r.invalidated_at) { invalidatedSkipped++; continue; }
  const prev = latest.get(r.sd_id);
  if (!prev || String(r.scored_at) > String(prev.scored_at)) latest.set(r.sd_id, r);
}
console.log(`scores=${scores.length} (invalidated skipped: ${invalidatedSkipped}) -> ${latest.size} SDs with a live latest score`);

// sd_id may hold either the uuid or the sd_key; index both so a format mismatch cannot
// silently yield an empty join (a filter on a phantom key format returns nothing, with no error).
const sdBy = new Map();
for (const sd of sds) {
  if (sd.id) sdBy.set(sd.id, sd);
  if (sd.sd_key) sdBy.set(sd.sd_key, sd);
}

const TERMINAL = new Set(['completed', 'cancelled', 'archived', 'superseded']);
const tally = {
  matched: 0, unmatched: 0,
  flips: { toStricter: 0, toLenient: 0 }, same: 0,
  refused: { latency: 0, unregistered: 0 },
  byRubric: new Map(), inFlightFlips: [],
};

for (const [sdId, row] of latest) {
  const sd = sdBy.get(sdId);
  if (!sd) { tally.unmatched++; continue; }
  tally.matched++;

  const sdType = sd.sd_type || '_default';
  const rubric = identifyRubric(row.dimension_scores);
  if (!tally.byRubric.has(rubric)) tally.byRubric.set(rubric, { n: 0, flips: 0, refused: 0 });
  const rb = tally.byRubric.get(rubric);
  rb.n++;

  const { addressable, total } = countAddressableDimensions(sdType, row.dimension_scores, sd.metadata);
  const oldT = calculateDynamicThreshold(SD_TYPE_THRESHOLDS[sdType] ?? SD_TYPE_THRESHOLDS._default, addressable, total);

  let newT;
  try {
    newT = resolveEffectiveThreshold(sdType, row.dimension_scores, sd.metadata);
  } catch (e) {
    const kind = /latency/i.test(e.message) ? 'latency' : 'unregistered';
    tally.refused[kind]++; rb.refused++;
    continue;
  }

  const score = typeof row.total_score === 'number' ? row.total_score : null;
  if (score === null) continue;
  const passOld = score >= oldT, passNew = score >= newT;
  if (passOld === passNew) { tally.same++; continue; }
  rb.flips++;
  if (passOld && !passNew) tally.flips.toStricter++; else tally.flips.toLenient++;
  if (!TERMINAL.has(String(sd.status || '').toLowerCase())) {
    tally.inFlightFlips.push({ key: sd.sd_key, type: sdType, rubric, score, oldT, newT, dir: passOld ? 'PASS->FAIL' : 'FAIL->PASS' });
  }
}

console.log(`SDs with a score: ${tally.matched} matched, ${tally.unmatched} unmatched\n`);
console.log(`verdict UNCHANGED : ${tally.same}`);
console.log(`verdict FLIPPED   : ${tally.flips.toStricter + tally.flips.toLenient}` +
            `  (PASS->FAIL ${tally.flips.toStricter}, FAIL->PASS ${tally.flips.toLenient})`);
console.log(`now REFUSED       : ${tally.refused.latency} latency + ${tally.refused.unregistered} unregistered ` +
            `= ${tally.refused.latency + tally.refused.unregistered}\n`);

console.log('rubric                  n   flips  refused');
for (const [r, v] of [...tally.byRubric.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${r.padEnd(20)} ${String(v.n).padStart(5)}  ${String(v.flips).padStart(5)}  ${String(v.refused).padStart(7)}`);
}

console.log(`\nIN-FLIGHT (non-terminal) verdict flips: ${tally.inFlightFlips.length}`);
for (const f of tally.inFlightFlips.slice(0, 25)) {
  console.log(`  ${f.dir}  ${f.key}  type=${f.type} rubric=${f.rubric} score=${f.score} ${f.oldT}->${f.newT}`);
}
if (tally.inFlightFlips.length > 25) console.log(`  … and ${tally.inFlightFlips.length - 25} more`);
