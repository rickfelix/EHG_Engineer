// SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 — LEAD Q9 (30-second demo) + SMOKE_TEST_SPECIFICATION gate.
// Written to the top-level strategic_directives_v2.smoke_test_steps column (not metadata), per the
// gate's own remediation instruction. Dry-run by default; pass --apply to write.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const APPLY = process.argv.includes('--apply');
const SD_KEY = 'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001';

const SMOKE_TEST_STEPS = [
  {
    step_number: 1,
    instruction: "Call getLaunchStatus()/getChecklist() (lib/eva/launch-workflow/index.js) for a venture with real eva_stage_gate_results rows.",
    expected_outcome: "Returns a real computed status derived from that venture's actual gate rows, with no 42703 (undefined_column) error swallowed in the process — pre-fix this silently returned an empty gate set for every venture.",
  },
  {
    step_number: 2,
    instruction: "Run two evaluation attempts for the same (stage_number, gate_type) within one traversal run: interrupt/fail the first attempt, then run a second attempt to completion.",
    expected_outcome: "Both attempts persist as distinct rows (not upserted over each other); the first attempt stays visible with resolved_outcome=NULL; the authoritative result is the highest-numbered finalized attempt.",
  },
  {
    step_number: 3,
    instruction: "Attempt to INSERT a second row with the same (run_id, stage_number, gate_type, attempt_number) as an existing row.",
    expected_outcome: "The insert is rejected by a real unique constraint (live duplicate-rejection proof), not silently upserted.",
  },
  {
    step_number: 4,
    instruction: "After a row's resolved_outcome is finalized (non-NULL), attempt to UPDATE that same row's evidence/evaluator fields.",
    expected_outcome: "The update is rejected by the finalize-immutability trigger — a finalized attempt's evidence cannot be silently overwritten.",
  },
  {
    step_number: 5,
    instruction: "Query a finalized row's resolved_outcome column.",
    expected_outcome: "Value is one of the 7 canonical terms (machine_pass|machine_fail|override|chairman_adjudicated|skip|cannot_evaluate|not_exercised), distinct from the pre-existing venture-outcome-calibration enum this SD's FR-3 does not repurpose without an explicit LEAD decision.",
  },
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  console.log(`[OK] Prepared ${SMOKE_TEST_STEPS.length} smoke_test_steps.`);

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to write these changes.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps: SMOKE_TEST_STEPS })
    .eq('sd_key', SD_KEY);

  if (updateErr) {
    console.error('[UPDATE FAILED]', updateErr.message);
    process.exit(1);
  }

  console.log('[APPLIED] smoke_test_steps written.');
}

if (isMainModule(import.meta.url)) main();
