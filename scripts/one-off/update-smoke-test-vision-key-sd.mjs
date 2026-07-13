import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Create a new SD via the standard direct-args creation path, without supplying any explicit vision-key override.',
    expected_outcome: 'The new strategic_directives_v2 row has metadata.vision_key = "VISION-EHG-L1-001" (the canonical default), not absent/null.',
  },
  {
    step_number: 2,
    instruction: 'Query eva_vision_documents with .eq("vision_key", "VISION-EHG-L1-001") directly against the live DB.',
    expected_outcome: 'Returns a real row (status=active, chairman_approved=true) -- proves the FK column-name fix in loadVisionDocument() is correct, not the nonexistent "key" column.',
  },
  {
    step_number: 3,
    instruction: 'Call executeVisionFidelity({sdId, supabase, dryRun:true}) for the SD from step 1 (or any SD carrying vision_key), with an injected llmClient stub returning a canned comparison JSON.',
    expected_outcome: 'result.details.skipped_reason is NOT "no_vision_key" and NOT missing_artifact=eva_vision_documents; the stub LLM client IS invoked; result.verdict is a real PASS/FAIL/WARNING/CONDITIONAL_PASS, not a skip.',
  },
  {
    step_number: 4,
    instruction: 'Run the vision-key backfill writer against the recent-open-SD cohort, then query strategic_directives_v2 for one of the reported sd_keys.',
    expected_outcome: 'error is null for every row in the output AND the queried row now genuinely has metadata.vision_key/arch_key set in the database (not just a reported success with no actual write, which was the pre-fix behavior).',
  },
  {
    step_number: 5,
    instruction: 'Query strategic_directives_v2 for a legacy SD with no vision_key and call executeVisionFidelity for it.',
    expected_outcome: 'result.details.skipped_reason === "no_vision_key" -- confirms the un-stamped-legacy-SD baseline is UNCHANGED (this fix is additive, not a behavior change for pre-existing un-backfilled SDs).',
  },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps })
  .eq('sd_key', 'SD-LEO-INFRA-VISION-KEY-STAMP-AT-SD-CREATION-001');
console.log(error ? 'ERROR: ' + error.message : `smoke_test_steps updated, ${smoke_test_steps.length} steps`);
