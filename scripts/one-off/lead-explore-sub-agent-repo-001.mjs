import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '4e010f6a-f5a5-437c-ac2c-e1ffb8185a95';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = process.cwd();

const analysis = `Three confirmed, independently-verified defects (Explore agent, file:line citations):

1. lib/sub-agents/resolve-repo.js:227-273 applySubAgentRepoVerdict() downgrades PASS->CONDITIONAL_PASS
   (lines 257-270) without ever setting results.conditions or results.justification. DB constraints
   check_conditions_required and check_justification_required (database/migrations/20251115114444_add_validation_modes_to_sub_agent_results.sql
   lines 103-108, 149-154) both require these fields non-empty whenever verdict='CONDITIONAL_PASS' ->
   INSERT violates 23514 for ANY caller that does not separately synthesize them. Already mitigated for
   callers routed through lib/sub-agent-executor/results-storage.js's deriveConditionalPassEvidence
   (QF-20260603-485, lines 320-376) -- NOT mitigated for callers that bypass that canonical writer.

2. lib/sub-agents/regression.js:748-792 storeResults() hand-rolls its own
   supabase.from('sub_agent_execution_results').insert({...}) (lines 776-788) that omits metadata,
   conditions, AND justification entirely. regression.js never routes through
   lib/sub-agent-executor/executor.js (confirmed: zero references), so it never benefits from the
   QF-20260603-485 synthesis fix. This is the exact site that produced the Golf-5 specimen (1df1a3f5):
   even a correctly-shaped results object from applySubAgentRepoVerdict would have its metadata/
   conditions/justification silently dropped before the INSERT.

3. lib/sub-agents/regression.js:83-88 calls resolveSubAgentRepo() with targetApplication:
   options.target_application BEFORE getSDDetails(sdId) is called (line 97) -- but getSDDetails
   (lines 285-300) doesn't even SELECT the target_application column, and the CLI entry point
   (lines 795-814) never populates options.target_application. So for ANY CLI invocation
   (node lib/sub-agents/regression.js <sdId> --full-validation), resolveSubAgentRepo's candidate
   (resolve-repo.js:165) is always undefined, and the function returns the hardcoded defaults
   {repoPath:null, repoResolved:false, registrySource:'fallback'} (resolve-repo.js:166-167,192-193)
   UNCONDITIONALLY -- this is structurally blind, not dependent on whether the actual worktree/
   registry would resolve correctly. This is the true root cause of the Golf-5 specimen shape,
   distinct from Golf-5's own hypothesis ("likely applications.local_path registry lookup miss for
   this worktree path pattern") -- the registry/DB lookup is never even attempted for CLI-invoked
   REGRESSION runs.

PIVOT FROM SD DESCRIPTION'S FIX SHAPE ITEM (2): investigated "on registry miss, DO NOT clobber
metadata.repo_path with a canonicalized null -- preserve the measured executed_from_cwd" and found
this would be HARMFUL if implemented literally. database/migrations/20260604_fix_v_sub_agent_repo_compliance_case_insensitive.sql
lines 29-37 (v_sub_agent_repo_compliance view CASE statement) classifies a row as 'cwd_leak' (a
BLOCKING status per scripts/modules/handoff/executors/plan-to-exec/gates/sub-agent-repo-resolution.js:40
BLOCKING_STATUSES) whenever metadata->>'repo_path' = executed_from_cwd (non-null). Setting repo_path
to executed_from_cwd on every registry-miss would make EVERY such row false-classify as cwd_leak
(a MORE severe block than today's 'explicit_null'/'explicit_null_intra', which the view already
computes correctly and deliberately from a null repo_path -- see CASE lines 32 and the gate's
intra/cross-repo carve-out at explicit_null_intra). PRD revised to NOT alias repo_path to
executed_from_cwd; instead adds an explicit metadata.repo_resolution_failed:true marker (satisfying
the SD's own "(or explicit resolution-failed marker)" alternative in success criterion 2) while
leaving repo_path as null (the gate-compatible, already-correct signal).

OUT OF SCOPE (flagged, not fixed here): lib/sub-agents/vision-fidelity/index.js:344-383 finalizeResult()
has the SAME hand-rolled-insert-missing-conditions/justification pattern (lines 361-377) and can
independently produce verdict='CONDITIONAL_PASS' -- a parallel occurrence of the same defect class,
but NOT triggered via resolveSubAgentRepo/applySubAgentRepoVerdict (vision-fidelity imports neither).
This SD's title and evidence are scoped to the repo-writer mechanism; vision-fidelity's instance is a
separate, same-class follow-up candidate.`;

const { data, error } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: 'EXPLORE',
  sub_agent_name: 'Explore Sub-Agent',
  verdict: 'PASS',
  confidence: 92,
  phase: 'LEAD',
  source: 'agent',
  detailed_analysis: analysis,
  warnings: [],
  recommendations: [
    { action: 'Add results.conditions/justification in applySubAgentRepoVerdict on downgrade', priority: 'high' },
    { action: 'Fix regression.js storeResults() to forward metadata/conditions/justification', priority: 'high' },
    { action: 'Fix regression.js execute() target_application plumbing (getSDDetails select + call order)', priority: 'medium' },
    { action: 'Do NOT alias metadata.repo_path to executed_from_cwd -- would cause false cwd_leak blocks', priority: 'high' },
  ],
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    mechanism_verifications: [
      { verified_at: 'lib/sub-agents/resolve-repo.js:227-273', verified_by: 'Explore agent (Task tool), confirmed via direct file read' },
      { verified_at: 'lib/sub-agents/regression.js:776-788', verified_by: 'Explore agent (Task tool), confirmed via direct file read' },
      { verified_at: 'lib/sub-agents/regression.js:83-97,285-300,795-814', verified_by: 'Explore agent (Task tool), confirmed via direct file read' },
      { verified_at: 'database/migrations/20260604_fix_v_sub_agent_repo_compliance_case_insensitive.sql:29-37', verified_by: 'Direct file read (session), cwd_leak CASE branch confirmed' },
    ],
  },
  executed_from_cwd: CWD,
}).select('id');

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('Explore evidence recorded:', data[0].id);
