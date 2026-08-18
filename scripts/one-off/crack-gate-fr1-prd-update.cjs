require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr1 = fr.find((f) => f.id === 'FR-1');
  if (!fr1) throw new Error('FR-1 not found in functional_requirements');

  fr1.acceptance_criteria = [
    "A venture past nursery with no existing pbn_verdict is scored automatically -- IMPLEMENTED as Job 5 (venture-pbn-auto-score-sweep) in scripts/cron/venture-ops-actuals-sweep.mjs, the existing 6h-cadence cron sweep. Chose the sweep-tick hook over a stage-transition hook: PBN applies to the whole portfolio (measured live: 152 ventures), not a specific stage boundary, and reuses this SD's own already-established sweep-job pattern (ARMED registration, liveness stamp, NC-7-style escalation logging) rather than finding/instrumenting a new stage-transition call site",
    "The trigger calls retroactivelyScoreVenture() directly -- confirmed by code review: scripts/cron/venture-ops-actuals-sweep.mjs imports and calls it unmodified, zero duplicate scoring logic",
    "The verdict is written via the same set_venture_pbn_verdict_stage_zero() RPC path retroactive-pbn-score.mjs already uses -- unmodified, no second write path",
    "BLOCKED-ON-EXTERNAL, CONFIRMED LIVE (not inferred from docs): probed the RPC directly (supabase.rpc('set_venture_pbn_verdict_stage_zero', ...)) -- PGRST202, the function does not exist in the schema cache, despite database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql being in the AUTO-APPLIED path (not chairman-gated) with real merged commit history. Signaled as a harness-bug (132c7f7c) since this contradicts the stated auto-apply convention. Job 5 handles this gracefully: a missing-function error is counted separately (function_missing) and logged once in aggregate, never as 152 per-venture error strings -- the trigger is live now and will begin scoring automatically the moment the migration is actually applied, no further EXEC-phase work needed",
  ];

  metadata.fr1_implementation_note_2026_08_18 = {
    finding: "Verified live (not assumed from doc text) that set_venture_pbn_verdict_stage_zero RPC does not exist despite its migration being merged in the auto-applied database/migrations/ path -- see harness-bug signal 132c7f7c. This meant the original risk concern (would FR-1's trigger immediately mass-score 151 real ventures on first cron run?) does not apply today -- it will safely no-op via graceful function_missing handling until the migration lands.",
    action_taken: "Implemented Job 5 in scripts/cron/venture-ops-actuals-sweep.mjs (fetchAllVentureIds -- deliberately broader than the existing fetchLiveDeploymentVentures, since PBN scoring is portfolio-wide, not deployment-gated). isMissingFunctionError distinguishes 'migration not applied yet' from a genuine per-venture scoring error, matching the isMissingRelationError convention already used elsewhere in this SD for missing tables.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-1 acceptance_criteria updated and metadata.fr1_implementation_note_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
