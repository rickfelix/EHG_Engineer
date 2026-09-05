#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A / FR-5 — stamp a queryable disposition on every
 * historically-affected completed SD (100%-template success_criteria, grandfathered before
 * GATE_PLACEHOLDER_CONTENT_DETECTION's FR-1 flip could have blocked it).
 *
 * Mirrors the metadata.requires_human_action shape (lib/fleet/claim-eligibility.cjs
 * setHold/releaseHold): {disposition, reason, set_by, set_at, source}, written via the shared
 * atomic mergeMetadataKeys helper (never a read-spread-write full-blob update). This SD is the
 * first user of metadata.template_sc_disposition -- no existing shape to preserve.
 *
 * Reuses the SAME predicate the gate itself enforces (analyzePlaceholderContent(criteria,
 * 'criterion') with percentage === 100), imported rather than re-derived, so this script can
 * never silently diverge from what the gate actually blocks on.
 *
 * Idempotent: a row already carrying metadata.template_sc_disposition is skipped (re-running
 * this script does not re-stamp or duplicate). --dry-run prints the population without writing.
 *
 * Usage: node scripts/one-off/stamp-template-sc-disposition-002-a.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';
import { analyzePlaceholderContent } from '../modules/handoff/executors/lead-to-plan/gates/placeholder-content.js';
import { mergeMetadataKeys } from '../../lib/coordinator/safe-metadata-merge.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const DISPOSITION = 'grandfathered_pre_enforcement';
const REASON = 'Completed before GATE_PLACEHOLDER_CONTENT_DETECTION FR-1 (SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A) began blocking on 100%-template success_criteria; historical, not re-litigated.';
const SET_BY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A batch stamp';
const SOURCE = 'scripts/one-off/stamp-template-sc-disposition-002-a.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rows = await fetchAllPaginated(() => supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, success_criteria, metadata')
  .eq('status', 'completed')
  .not('success_criteria', 'is', null)
  .order('id', { ascending: true }));

const affected = rows.filter((r) => {
  const criteria = Array.isArray(r.success_criteria) ? r.success_criteria : [];
  const analysis = analyzePlaceholderContent(criteria, 'criterion');
  return analysis.total > 0 && analysis.percentage === 100;
});

const alreadyStamped = affected.filter((r) => !!r.metadata?.template_sc_disposition);
const needsStamp = affected.filter((r) => !r.metadata?.template_sc_disposition);

console.log(`Completed SDs scanned: ${rows.length}`);
console.log(`100%-template success_criteria (affected): ${affected.length}`);
console.log(`Already disposed (idempotent skip): ${alreadyStamped.length}`);
console.log(`Needs stamping: ${needsStamp.length}`);

if (DRY_RUN) {
  console.log('--dry-run: no writes performed.');
  process.exit(0);
}

const nowIso = new Date().toISOString();
let stamped = 0;
let failed = 0;
for (const row of needsStamp) {
  const result = await mergeMetadataKeys(row.sd_key, {
    template_sc_disposition: {
      disposition: DISPOSITION,
      reason: REASON,
      set_by: SET_BY,
      set_at: nowIso,
      source: SOURCE,
    },
  });
  if (result.merged) stamped += 1;
  else {
    failed += 1;
    console.error(`  FAILED to stamp ${row.sd_key}: ${result.error || 'unknown'}`);
  }
}
console.log(`Stamped: ${stamped}`);
console.log(`Failed: ${failed}`);

// Read back rather than trust the write's own success flag (per this SD's own FR-5 acceptance
// criteria: "the write is read back rather than trusted from the write's own success flag").
// Scoped to the AFFECTED population specifically (one bulk re-fetch, not per-row round trips) --
// a plain "no marker at all" count would also include rows that never needed one (success_criteria
// present but not 100% template), which is a different, always-nonzero, and irrelevant count.
const affectedKeys = affected.map((r) => r.sd_key);
const stillMissing = [];
if (affectedKeys.length > 0) {
  const { data: fresh, error: refetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata')
    .in('sd_key', affectedKeys);
  if (refetchErr) {
    console.error(`Post-write verification re-fetch FAILED (not the same as 0 remaining): ${refetchErr.message}`);
    process.exit(1);
  }
  for (const row of fresh || []) {
    if (!row.metadata?.template_sc_disposition) stillMissing.push(row.sd_key);
  }
}
console.log(`Affected rows STILL lacking a disposition marker after this run: ${stillMissing.length}`);
if (stillMissing.length > 0) {
  console.error(JSON.stringify(stillMissing));
  process.exit(1);
}
console.log('OK: 0 affected rows lack a disposition marker.');
