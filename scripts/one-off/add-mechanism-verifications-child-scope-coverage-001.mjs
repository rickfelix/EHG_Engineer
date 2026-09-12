#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001's spine, which names a specific mechanism in
 * parent-orchestrator-handler.js. The Explore + VALIDATION sub-agents' own genuine,
 * live-verified investigation (row ids below) is the verifier, mirroring the precedent
 * in add-mechanism-verifications-comms-lane-ttls-001.mjs.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('Fetch failed:', fetchErr.message); process.exit(1); }

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:c886e65e-e9bb-487f-96af-41a96a539a9e (Explore, phase=LEAD_TO_PLAN)',
      verified_at: 'scripts/modules/parent-orchestrator-handler.js:105 (generateParentPRD), :163 (functional_requirements array with the 3 hard-coded FR titles)',
      claim: 'generateParentPRD emits 3 hard-coded FR titles ("Child SD Orchestration"/"Work Decomposition Structure"/"Progress Tracking") for every auto-generated orchestrator PRD; grep confirms these exact titles occur nowhere else in the codebase.',
      reproduction: 'Explore agent read parent-orchestrator-handler.js:105-197 directly and grepped the repo for the 3 exact FR titles, confirming single-origin.'
    },
    {
      verified_by: 'sub_agent_execution_results:c886e65e-e9bb-487f-96af-41a96a539a9e (Explore, phase=LEAD_TO_PLAN)',
      verified_at: 'scripts/modules/parent-orchestrator-handler.js:478 (getNextAction command string), :578 (main() CLI invocation of generateParentPRD)',
      claim: 'generateParentPRD is invoked only via its own CLI or a suggested (not auto-run) command string -- not called from any handoff executor -- yet a live DB query found 30 sd_scope_deliverables rows across 10 real orchestrator SDs carrying its exact 3 titles, confirming the function is genuinely exercised in production via manual invocation, not dead code.',
      reproduction: 'Explore agent grepped scripts/ and lib/ for ParentOrchestratorHandler/generateParentPRD (no automatic caller found), then queried strategic_directives_v2 + sd_scope_deliverables live and found 30 matching rows across 10 orchestrator SDs, including one (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001) actively rejected at PLAN-TO-LEAD on CHILD_SCOPE_COVERAGE ~1h before this fix.'
    },
    {
      verified_by: 'sub_agent_execution_results:6807b6c6-e149-4e0b-a48d-f3c9f360e7cf (VALIDATION, phase=LEAD_TO_PLAN)',
      verified_at: 'scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js:68 (parentDeliverables select projection)',
      claim: "A prior version of this fix selected id/deliverable_name/deliverable_type only (no metadata) in the parentDeliverables query, making the new coordination_only exclusion read undefined for every real row -- a complete no-op in production. Corrected by projecting metadata explicitly; a regression test asserting the exact select string (which fails without the fix, passes with it) was added and independently re-verified by reverting and restoring the fix.",
      reproduction: "VALIDATION sub-agent ran the gate's exact select string against a live row with known non-null metadata, confirming pd.metadata read undefined under the old projection and populated under the corrected one; independently reverted/restored the projection fix and confirmed the new regression test fails/passes accordingly both ways."
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);
if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }

console.log('✅ mechanism_verifications written:', metadata.mechanism_verifications.length, 'record(s)');
