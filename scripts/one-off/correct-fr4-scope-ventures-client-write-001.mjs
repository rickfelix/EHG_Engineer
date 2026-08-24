// Correct FR-4's stated scope in the PRD after an EXEC-phase finding: the
// advance_venture_stage RPC only models a stage transition (p_from_stage/p_to_stage/
// p_transition_type) -- it has no parameter path for status, orchestrator_state,
// launched_at, workflow_status, or recursion_state. Guarding all six columns behind
// that one RPC (as originally drafted) would have broken every legitimate write of
// the other five. The migration was narrowed to guard only current_lifecycle_stage;
// this brings the PRD's FR-4 text back in sync with what was actually built.

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

async function run() {
  const dotenv = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const PRD_ID = 'PRD-SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001';

  const { data: prd, error: readErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, risks')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (readErr) throw readErr;

  const frs = prd.functional_requirements.map((fr) => {
    if (fr.id !== 'FR-4') return fr;
    return {
      ...fr,
      description:
        'CORRECTED during EXEC (advance_venture_stage only models a stage transition -- it has no ' +
        'parameter path for status/orchestrator_state/launched_at/workflow_status/recursion_state). ' +
        'The guard trigger is narrowed to current_lifecycle_stage only, the ONE column with a real, ' +
        'existing, matching RPC route. That column cannot be written directly by a client-role UPDATE ' +
        '(authenticated/anon) -- it must route through advance_venture_stage. Every other ventures ' +
        'column, including the other five originally-classified-governance columns, remains directly ' +
        'client-writable, scoped by has_venture_access(id). Routing the other five through a governed ' +
        'path is legitimate follow-up work (each needs its own RPC or equivalent -- none exists today ' +
        'and TR-4 forbids inventing one inline) and is explicitly NOT this SD\'s scope.',
      acceptance_criteria: [
        'A client-role UPDATE that changes current_lifecycle_stage directly (not via the RPC) is REFUSED (a real error, not a silent no-op) post-apply',
        'A client-role UPDATE that changes any content-class column, OR any of status/orchestrator_state/launched_at/workflow_status/recursion_state, on a venture the caller has access to succeeds post-apply',
        'The advance_venture_stage RPC path still succeeds unchanged for current_lifecycle_stage transitions',
      ],
    };
  });

  const risks = [
    ...prd.risks,
    {
      risk: 'status/orchestrator_state/launched_at/workflow_status/recursion_state remain directly client-writable after this SD -- the original architecture eval\'s broader concern (client can write governance-adjacent state) is only partially closed',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Documented explicitly in the migration header and table comment as an intentional, scoped narrowing (not an oversight); flagged as follow-up SD scope once each column has an actual governed RPC path to route through',
      rollback_plan: 'N/A -- this is a scope boundary, not a code path that can fail and need rollback',
    },
  ];

  const { error: updErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: frs, risks })
    .eq('id', PRD_ID);
  if (updErr) throw updErr;

  console.log('Corrected FR-4 scope in', PRD_ID);
}
