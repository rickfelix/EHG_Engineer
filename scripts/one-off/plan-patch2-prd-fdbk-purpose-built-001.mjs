// PLAN-phase patch #2: resolve the 2nd-round PRE_PLAN_ADVERSARIAL_CRITIQUE block finding
// (plan_critiques 948423af-e645-4e97-ac98-ae13f3fd0870) -- deployment-ordering needs its own
// FR/AC naming a concrete artifact + verification step, not just prose inside TR-6.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const prdId = 'PRD-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const { data: current, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, acceptance_criteria')
  .eq('id', prdId)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const functional_requirements = [
  ...current.functional_requirements,
  {
    id: 'FR-8',
    title: 'Deployment-ordering verification step (resolves 2nd-round BLOCK finding, plan_critiques 948423af)',
    priority: 'high',
    description: 'TR-6 documents the required ordering (DB migration applied before the frontend PR ships; reverse order for rollback) in prose, which the critic correctly flagged as unverifiable as written. Concrete artifact + verification: (1) database/chairman-gated/20260817_fdbk_internal_feedback_rpc.sql\'s own header states the required apply-before-frontend-deploy ordering explicitly (already true -- this FR makes it a checked requirement, not just documentation). (2) The PR that lands the FeedbackWidget.tsx/feedbackDataAccess.ts change (FR-4) MUST include, in its description, an explicit line: "Requires database/chairman-gated/20260817_fdbk_internal_feedback_rpc.sql applied first (fn_submit_internal_feedback must exist before this PR is deployed)." (3) Verification step: before merging the frontend PR, run `node database/chairman-gated/20260817_fdbk_internal_feedback_rpc_dry_run.mjs` against the target environment (or confirm via a live pg_proc query) that fn_submit_internal_feedback already exists -- this is a pre-merge check, not a post-hoc audit.',
    acceptance_criteria: [
      'AC-8.1: The frontend PR description contains the exact ordering-requirement sentence specified above (grep-verifiable in the PR body).',
      'AC-8.2: A live pg_proc check (or the dry-run script) confirming fn_submit_internal_feedback exists is run and its result recorded (e.g. in the PR description or EXEC-phase evidence) before the frontend PR merges.',
      'AC-8.3: Rollback ordering is the exact reverse, stated in TR-6 and cross-referenced here: revert the frontend PR first, then apply the DOWN migration.',
    ],
  },
];

const acceptance_criteria = [
  ...current.acceptance_criteria,
  { requirement_id: 'FR-8', criterion: 'AC-8.1/8.2/8.3: deployment-ordering has a named artifact (PR description sentence) and a named verification step (pre-merge pg_proc/dry-run check), not just prose in TR-6.' },
];

const { error } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, acceptance_criteria })
  .eq('id', prdId);

if (error) { console.error('UPDATE_ERR:', error); process.exit(1); }
console.log('PRD_PATCHED_2:', prdId);
