#!/usr/bin/env node
// SD-LEO-INFRA-EXECUTOR-120S-1800S-001 / FR-4: mark pre-fix historical MANUAL_REQUIRED rows
// (produced by executor.js's old bare catch{}) with an explicit corruption marker
// (metadata.pre_fix_corrupted=true), so a gate or query reading sub_agent_execution_results
// history can distinguish corrupted evidence from clean evidence.
//
// FINGERPRINT (TR-4 / TESTING verification finding N1): verdict='MANUAL_REQUIRED' AND
// recommendations contains the literal missing-module text AND metadata.failure_cause IS NULL.
// The failure_cause clause is REQUIRED, not optional: post-fix, a genuinely correct
// missing_module row legitimately carries the SAME recommendations text (FR-1 AC-3) but ALSO
// carries a populated metadata.failure_cause -- without the clause this script would wrongly
// mark correct post-fix evidence as corrupted on every re-run.
//
// IDEMPOTENT + LIVE-RE-QUERYING (TR-4): re-queries the live table at execution time rather than
// operating against a hardcoded row count or id list; safe to re-run indefinitely, including
// after FR-1 has shipped and new, correct missing_module rows exist alongside old ones.
//
// READ-MERGE-WRITE, NOT BLIND OVERWRITE (TESTING finding G5): results-storage.js's 5-minute
// dedup-window write path replaces metadata wholesale for a concurrent write to the same
// (sd_id, sub_agent_code, phase). Fetching each row's current metadata immediately before
// writing narrows (does not fully eliminate) that collision window.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const MISSING_MODULE_FINGERPRINT_TEXT = 'for automation';

export function matchesPreFixFingerprint(row) {
  if (row.verdict !== 'MANUAL_REQUIRED') return false;
  const recs = Array.isArray(row.recommendations) ? row.recommendations : [];
  const hasFingerprintText = recs.some((r) => typeof r === 'string' && r.includes(MISSING_MODULE_FINGERPRINT_TEXT) && r.includes('Create lib/sub-agents/'));
  if (!hasFingerprintText) return false;
  const failureCause = row.metadata && typeof row.metadata === 'object' ? row.metadata.failure_cause : undefined;
  return failureCause === undefined || failureCause === null;
}

export async function remediate(supabase, { log = console.log } = {}) {
  // .limit(5000): generously bounded above the live MANUAL_REQUIRED population (measured ~82
  // at PLAN time, monotonically growing while DOCMON/STORIES/TESTING's own timeout causes
  // remain live and unfixed -- out of scope here); this is not the historical-scan population,
  // just the current verdict=MANUAL_REQUIRED slice, which will never plausibly reach 5000 rows
  // for one verdict value on this table (count-truncation discipline, explicit bound).
  const CANDIDATE_FETCH_LIMIT = 5000;
  const { data: candidates, error: fetchErr } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, sub_agent_code, phase, verdict, recommendations, metadata')
    .eq('verdict', 'MANUAL_REQUIRED')
    .limit(CANDIDATE_FETCH_LIMIT);
  if (fetchErr) throw new Error(`remediate: candidate fetch failed: ${fetchErr.message}`);
  // SECURITY finding L4 (evidence 2f9ab06f): a silently-hit cap would otherwise read as "the
  // whole population", not "the whole population up to the cap" -- log it loudly if ever hit.
  if ((candidates || []).length === CANDIDATE_FETCH_LIMIT) {
    log(`  ⚠ candidate fetch hit the ${CANDIDATE_FETCH_LIMIT}-row cap -- some MANUAL_REQUIRED rows may be silently excluded from this run`);
  }

  const toMark = (candidates || []).filter(matchesPreFixFingerprint);
  log(`remediate-executor-manual-required-corruption: ${(candidates || []).length} MANUAL_REQUIRED row(s) live, ${toMark.length} match the pre-fix fingerprint`);

  let marked = 0;
  let alreadyMarked = 0;
  let skippedRace = 0;
  for (const candidate of toMark) {
    // Read-merge-write: re-fetch this ONE row's current metadata immediately before writing,
    // rather than trusting the batch snapshot above, to narrow the concurrent-write collision
    // window (TESTING finding G5).
    const { data: fresh, error: freshErr } = await supabase
      .from('sub_agent_execution_results')
      .select('id, verdict, recommendations, metadata')
      .eq('id', candidate.id)
      .maybeSingle();
    if (freshErr || !fresh) {
      log(`  skip ${candidate.id}: re-fetch failed (${freshErr?.message || 'row gone'})`);
      skippedRace++;
      continue;
    }
    // Re-check the fingerprint against the FRESH row -- if a concurrent write already changed
    // it (e.g. FR-1's code shipped and re-ran this exact sub-agent), do not mark it.
    if (!matchesPreFixFingerprint(fresh)) {
      log(`  skip ${candidate.id}: no longer matches fingerprint as of read-merge-write re-fetch`);
      skippedRace++;
      continue;
    }
    if (fresh.metadata?.pre_fix_corrupted === true) {
      alreadyMarked++;
      continue;
    }
    const mergedMetadata = { ...(fresh.metadata || {}), pre_fix_corrupted: true };
    const { error: updateErr } = await supabase
      .from('sub_agent_execution_results')
      .update({ metadata: mergedMetadata })
      .eq('id', candidate.id);
    if (updateErr) {
      log(`  FAILED to mark ${candidate.id}: ${updateErr.message}`);
      continue;
    }
    marked++;
  }

  log(`remediate-executor-manual-required-corruption: ${marked} newly marked, ${alreadyMarked} already marked, ${skippedRace} skipped (raced/no-longer-matching)`);
  return { total: (candidates || []).length, fingerprintMatched: toMark.length, marked, alreadyMarked, skippedRace };
}

async function run() {
  const supabase = createSupabaseServiceClient();
  await remediate(supabase);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
