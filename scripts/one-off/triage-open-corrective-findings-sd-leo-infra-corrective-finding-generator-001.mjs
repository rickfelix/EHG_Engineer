#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 / FR-1 — per-row triage of the
 * currently-open corrective_finding feedback rows.
 *
 * Writes ONE UPDATE per row (never a bulk statement), setting
 * metadata.triage_disposition = { disposition, evidence, triaged_at, triaged_by }.
 * Does NOT touch `status` — disposition is advisory metadata, not a state change,
 * per the coordinator ruling constraint (no bulk drain, no reopen).
 *
 * Disposition rationale: each of the 19 currently-open rows carries a DIFFERENT
 * source_sd_id (confirmed via direct query -- these are not literal re-mints of
 * the same gap; the class's actual recurrence bug, now fixed by FR-3/FR-4, was
 * REGENERATING NEW findings for DIFFERENT SDs on every rescore, not duplicating
 * an existing one). Independently re-verifying 19 unrelated SDs' true completion
 * quality is out of proportion to this SD's generator-mechanism scope and risks
 * introducing new misjudgments; ROUTE is the honest disposition for those --
 * deferred to each named SD's own /heal review, not unilaterally decided here.
 * The one exception is the row already promoted to an active EXEC-phase SD
 * (SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001), which is disposed ACT (already
 * being worked) and left untouched otherwise.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRIAGED_BY = 'SD-LEO-INFRA-CORRECTIVE-FINDING-GENERATOR-001 (Golf-7, EXEC phase, 2026-08-21)';

const DISPOSITIONS = {
  // Already promoted and actively worked -- ACT, no further action needed here.
  'a5161052-1bf1-4bc1-a962-0513f39a639f': {
    disposition: 'act',
    evidence: 'Already promoted (metadata.source=corrective_triage_promotion) to SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001, status=active, phase=EXEC. Being actively worked; not touched further by this triage.',
  },
};

const ROUTE_EVIDENCE = (sourceSdId) =>
  `Distinct source_sd_id (${sourceSdId}) confirms this is NOT a re-mint of an existing finding -- each open row's dedup_hash is unique. The class's actual defect (fixed in this SD: computeDedupHash keyed on ever-fresh gate_run_id + effectiveMinOccurrences bypass for isSDHeal mode) was regenerating NEW findings for DIFFERENT SDs on every /heal rescore, not duplicating one existing gap. Independently re-verifying this named SD's true smoke_tests_pass/success_criteria_met completion state is out of proportion to this SD's generator-mechanism scope. Routed to ${sourceSdId}'s own /heal review rather than unilaterally decided here.`;

async function main() {
  const { data: rows, error } = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', 'corrective_finding')
    .in('status', ['new', 'in_progress']);

  if (error) throw new Error(`fetch failed: ${error.message}`);

  console.log(`[triage] ${rows.length} open corrective_finding rows to disposition`);

  let acted = 0;
  let routed = 0;

  for (const row of rows) {
    const override = DISPOSITIONS[row.id];
    const disposition = override?.disposition ?? 'route';
    const evidence = override?.evidence ?? ROUTE_EVIDENCE(row.metadata?.source_sd_id ?? 'unknown');

    const newMetadata = {
      ...row.metadata,
      triage_disposition: {
        disposition,
        evidence,
        triaged_at: new Date().toISOString(),
        triaged_by: TRIAGED_BY,
      },
    };

    // ONE row per UPDATE call -- no bulk statement.
    const { error: updateErr } = await supabase
      .from('feedback')
      .update({ metadata: newMetadata })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`[triage] FAILED id=${row.id}: ${updateErr.message}`);
      continue;
    }

    if (disposition === 'act') acted++;
    else routed++;
    console.log(`[triage] id=${row.id} disposition=${disposition}`);
  }

  console.log(`[triage] DONE: ${acted} act, ${routed} route (status untouched on all rows)`);
}

main().catch((err) => {
  console.error('[triage] FATAL:', err.message);
  process.exit(1);
});
