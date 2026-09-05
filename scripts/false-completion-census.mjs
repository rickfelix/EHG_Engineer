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
 *
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: the per-SD check is now wrapped in a try/catch
 * (see runFalseCompletionCensus below) so a single SD whose migration-evidence table has
 * drifted no longer aborts the whole census run -- it is recorded as could-not-verify
 * instead. The census logic is exported as a plain function (supabase, opts) -> result,
 * separate from the CLI's console/exit-code side effects, so it is importable and testable
 * (matching the scripts/adam-self-adherence-review.mjs precedent) rather than only runnable
 * as a top-level-await script that calls process.exit() directly.
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { isFalseCompletion } from '../lib/quality/false-completion-predicate.js';
import { findEvidenceMigrationGaps } from '../lib/quality/migration-data-presence.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

// The 3 SDs this SD's scope explicitly commits to reconciling. Pre-existing
// portfolio-wide anomalies outside this list are out of scope here (see
// harness_backlog follow-up) -- --assert must not silently expand to "zero
// anomalies across the whole portfolio".
export const NAMED_TARGET_SDS = [
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D',
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001E',
  'SD-LEO-ORCH-EVA-IDEA-PROCESSING-001F',
];

export async function fetchAllCompleted(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      // 'progress' is a known-dead column (SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001) --
      // 'progress_percentage' is the live one, kept here for diagnostic display only (it
      // plays no role in isFalseCompletion()'s actual predicate).
      .select('id, sd_key, status, current_phase, completion_date, progress_percentage, metadata')
      .eq('status', 'completed')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

/**
 * Run the full false-completion census. Pure of console/process side effects so it is
 * directly testable; the CLI wrapper (main(), below) owns all console.log/process.exit.
 *
 * @param {object} supabase
 * @param {{assertMode?: boolean}} [opts]
 * @returns {Promise<{rows, anomalous, disputed, dataGaps, couldNotVerify, assertMode, assertPassed, assertMessage}>}
 */
export async function runFalseCompletionCensus(supabase, { assertMode = false } = {}) {
  const rows = await fetchAllCompleted(supabase);
  const anomalous = rows.filter(isFalseCompletion);
  // QF-20260829-936 part 1: a coordinator-annotated dispute on a record that IS internally
  // consistent (so isFalseCompletion misses it) must still render somewhere.
  const disputed = rows.filter((sd) => sd.metadata?.completion_disputed);

  // QF-20260829-936 part 2 (the deeper fix): a record can be internally consistent AND
  // substantively false when its own evidence names a migration whose data never landed.
  //
  // SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F FR-4: findEvidenceMigrationGaps() now throws on a
  // genuine query error (it used to swallow it into an empty gaps array). Wrapped per-SD so
  // one drifted SD's table cannot abort the whole census -- it is recorded as could-not-verify
  // instead, distinct from a confirmed-missing data-artifact gap.
  const dataGaps = [];
  const couldNotVerify = [];
  for (const sd of rows) {
    try {
      const gaps = await findEvidenceMigrationGaps(supabase, sd.id);
      for (const gap of gaps) dataGaps.push({ sd_key: sd.sd_key, ...gap });
    } catch (err) {
      couldNotVerify.push({ sd_key: sd.sd_key, sd_id: sd.id, reason: err?.message || String(err) });
    }
  }

  let assertPassed = true;
  let assertMessage = null;
  if (assertMode) {
    const stillAnomalous = NAMED_TARGET_SDS.filter((key) => anomalous.some((sd) => sd.sd_key === key));
    // FR-5 (decided at PLAN, per LEAD/PLAN-phase sub-agent review): could-not-verify and
    // confirmed-missing (dataGaps) BOTH scope to NAMED_TARGET_SDS only for --assert's exit
    // code -- symmetric with the pre-existing anomalous-check scoping, so a pre-existing
    // portfolio-wide gap/could-not-verify entry outside this SD's named scope does not
    // newly fail CI. A portfolio-wide gate is an explicit, deferred follow-up.
    const scopedDataGaps = dataGaps.filter((g) => NAMED_TARGET_SDS.includes(g.sd_key));
    const scopedCouldNotVerify = couldNotVerify.filter((c) => NAMED_TARGET_SDS.includes(c.sd_key));

    if (stillAnomalous.length > 0) {
      assertPassed = false;
      assertMessage = `FAIL: named target SD(s) still anomalous: ${stillAnomalous.join(', ')}`;
    } else if (scopedDataGaps.length > 0) {
      assertPassed = false;
      assertMessage = `FAIL: named target SD(s) have confirmed-missing data-artifact gaps: ${scopedDataGaps.map((g) => g.sd_key).join(', ')}`;
    } else if (scopedCouldNotVerify.length > 0) {
      assertPassed = false;
      assertMessage = `FAIL: named target SD(s) could not be verified (query error, treat as unresolved): ${scopedCouldNotVerify.map((c) => c.sd_key).join(', ')}`;
    } else {
      assertMessage = `PASS: all ${NAMED_TARGET_SDS.length} named target SDs are reconciled`;
    }
  }

  return { rows, anomalous, disputed, dataGaps, couldNotVerify, assertMode, assertPassed, assertMessage };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const assertMode = process.argv.includes('--assert');
  const result = await runFalseCompletionCensus(supabase, { assertMode });
  const { rows, anomalous, disputed, dataGaps, couldNotVerify } = result;

  console.log(`false-completion census — completed SDs=${rows.length} anomalous=${anomalous.length} disputed=${disputed.length}`);
  for (const sd of anomalous) {
    const disputedFlag = sd.metadata?.completion_disputed ? ' [DISPUTED]' : '';
    console.log(`  ${sd.sd_key}  current_phase=${sd.current_phase ?? 'null'} completion_date=${sd.completion_date ?? 'null'} progress_percentage=${sd.progress_percentage ?? 'null'}${disputedFlag}`);
  }
  for (const sd of disputed.filter((sd) => !anomalous.includes(sd))) {
    console.log(`  ${sd.sd_key}  [DISPUTED] (record otherwise internally consistent)`);
  }

  console.log('checking completed SDs\' evidence for named migrations with missing data...');
  for (const gap of dataGaps) {
    console.log(`  ${gap.sd_key}  [DATA-ARTIFACT-ABSENT] ${gap.path} -> ${gap.table}.${gap.column} missing ${gap.missing.length}/${gap.expected}: ${gap.missing.join(', ')}`);
  }
  console.log(`data-artifact gaps found: ${dataGaps.length}`);
  for (const cnv of couldNotVerify) {
    console.log(`  ${cnv.sd_key}  [COULD-NOT-VERIFY] ${cnv.reason}`);
  }
  console.log(`could-not-verify (query error) count: ${couldNotVerify.length}`);

  if (!assertMode) {
    process.exit(0);
  }

  console.log(result.assertMessage);
  if (!result.assertPassed) {
    process.exit(1);
  }
  const remaining = anomalous.length;
  if (remaining > 0) {
    console.log(`NOTE: ${remaining} pre-existing portfolio-wide anomal${remaining === 1 ? 'y remains' : 'ies remain'} outside this SD's scope (tracked via harness_backlog follow-up)`);
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('false-completion-census failed:', e.message);
    process.exit(1);
  });
}
