#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001 -- census for the false-completion
 * defect class: an SD marked status='completed' whose current_phase never actually
 * reached 'COMPLETED'. See lib/quality/false-completion-predicate.js for why this
 * predicate replaces the SD's own literal wording (progress=0 OR completion_date
 * IS NULL), which measured as noise against the live portfolio.
 *
 *   node scripts/false-completion-census.mjs             # print the full census
 *   node scripts/false-completion-census.mjs --assert     # exit 1 unless every named
 *                                                          target SD below is reconciled
 *
 * READS THE WHOLE POPULATION, never a capped page -- a capped fetch grouped in memory
 * measures the cap, not the portfolio.
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isFalseCompletion } from '../lib/quality/false-completion-predicate.js';

const supabase = createSupabaseServiceClient();

// The 3 SDs this SD's scope explicitly commits to reconciling. Pre-existing
// portfolio-wide anomalies outside this list are out of scope here (see
// harness_backlog follow-up) -- --assert must not silently expand to "zero
// anomalies across the whole portfolio".
const NAMED_TARGET_SDS = [
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D',
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001E',
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F',
];

async function fetchAllCompleted() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      // 'progress' is a known-dead column (SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001) --
      // 'progress_percentage' is the live one, kept here for diagnostic display only (it
      // plays no role in isFalseCompletion()'s actual predicate).
      .select('sd_key, status, current_phase, completion_date, progress_percentage')
      .eq('status', 'completed')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const assertMode = process.argv.includes('--assert');
const rows = await fetchAllCompleted();
const anomalous = rows.filter(isFalseCompletion);

console.log(`false-completion census — completed SDs=${rows.length} anomalous=${anomalous.length}`);
for (const sd of anomalous) {
  console.log(`  ${sd.sd_key}  current_phase=${sd.current_phase ?? 'null'} completion_date=${sd.completion_date ?? 'null'} progress_percentage=${sd.progress_percentage ?? 'null'}`);
}

if (!assertMode) {
  process.exit(0);
}

const stillAnomalous = NAMED_TARGET_SDS.filter((key) => anomalous.some((sd) => sd.sd_key === key));
if (stillAnomalous.length > 0) {
  console.log(`FAIL: named target SD(s) still anomalous: ${stillAnomalous.join(', ')}`);
  process.exit(1);
}

console.log(`PASS: all ${NAMED_TARGET_SDS.length} named target SDs are reconciled`);
const remaining = anomalous.length;
if (remaining > 0) {
  console.log(`NOTE: ${remaining} pre-existing portfolio-wide anomal${remaining === 1 ? 'y remains' : 'ies remain'} outside this SD's scope (tracked via harness_backlog follow-up)`);
}
process.exit(0);
