import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '4e010f6a-f5a5-437c-ac2c-e1ffb8185a95';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = process.cwd();

const analysis = `Independent adversarial validation (VALIDATION agent) of the LEAD Explore findings and
proposed fix plan. All 3 root-cause claims CONFIRMED via independent file reads. Critical finding
the initial plan MISSED, which changed the implementation: storeResults() (regression.js) ran at
the (then) line 265, BEFORE applySubAgentRepoVerdict() at (then) line 278 -- so the proposed
insert-payload fix (forward metadata/conditions/justification) would have been A NO-OP, since those
fields were still undefined at insert time. Live data check: 452 REGRESSION rows in
sub_agent_execution_results, 408 with repo_path -- confirming those came from the canonical writer
path, not regression.js's own direct-insert path, which corroborates the ordering bug's real-world
impact (rows via THIS path silently classify 'legacy' at the gate -- full credit despite carrying
zero repo-resolution evidence).

Critique of the original "preserve executed_from_cwd" pivot rationale: correctly rejected aliasing,
but sharpened the reasoning -- QF-20260528-426's toplevel-compatibility check in
scripts/modules/handoff/executors/plan-to-exec/gates/sub-agent-repo-resolution.js:100-118
RECLASSIFIES cwd_leak to 'healthy' when the writer path is toplevel-compatible with the expected
repo. So aliasing repo_path to executed_from_cwd would not merely risk a false BLOCK (explicit_null
is itself already in BLOCKING_STATUSES for cross-repo targets) -- for the common intra-repo case it
would manufacture a FALSE GREEN, which is the stronger, more precise argument against it. Adopted
this framing in the PRD (FR-4) in place of the original cwd_leak-only framing.

Additional findings incorporated: (a) getSDDetails's .eq('id', sdId).single() needs sdId
normalization (normalizeSDId, already imported in regression.js) since sdId may be an sd_key, not a
UUID -- added to FR-3. (b) A must set conditions/justification ONLY on the actual downgrade branch,
not on skipVerdictAdjust/skipReason paths -- confirmed already scoped correctly in the implemented
fix. (c) Confirmed via direct read: tests/unit/resolve-sub-agent-repo.test.js's existing assertions
(lines 117-129 verdict/confidence/warnings-length-1; lines 144-150 metadata.repo_path null under
skipVerdictAdjust) are NOT broken by the fix plan -- no test uses toEqual on the whole metadata
object, so added conditions/justification keys are additive-safe. Flagged a real test gap (no
existing test asserted the CONDITIONAL_PASS row is actually insertable) -- addressed by the new
"Golf-5 specimen shape becomes insertable" test with a JS-mirrored CHECK-constraint assertion.

VERDICT: fix plan is sound AFTER incorporating the call-ordering correction (applySubAgentRepoVerdict
must run before storeResults, not after) and the sdId-normalization addition to getSDDetails. Both
were incorporated into the implementation before any code was written to fix this specific class of
issue live.`;

const { data, error } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_UUID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Validation Sub-Agent',
  verdict: 'CONDITIONAL_PASS',
  confidence: 82,
  phase: 'LEAD',
  source: 'agent',
  detailed_analysis: analysis,
  justification: 'CONDITIONAL_PASS: independent adversarial review confirmed all 3 LEAD root-cause claims but found a critical call-ordering defect (applySubAgentRepoVerdict ran after storeResults) that would have made the originally-proposed insert-payload fix a no-op; approved contingent on incorporating the ordering fix and the sdId-normalization addition, both of which were incorporated before EXEC implementation began.',
  conditions: [
    { action: 'Move applySubAgentRepoVerdict() call to before storeResults() in regression.js execute()', priority: 'high', blocking: true },
    { action: 'Normalize sdId (via normalizeSDId) inside getSDDetails before the id-column lookup', priority: 'medium', blocking: false },
  ],
  warnings: [],
  recommendations: [
    { action: 'Add a JS-mirrored CHECK-constraint assertion test for the CONDITIONAL_PASS insertability contract (no existing test covered this)', priority: 'high' },
  ],
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    mechanism_verifications: [
      { verified_at: 'lib/sub-agents/regression.js:265,278 (pre-fix line numbers)', verified_by: 'VALIDATION agent (Task tool), confirmed call-ordering defect via direct file read' },
      { verified_at: 'scripts/modules/handoff/executors/plan-to-exec/gates/sub-agent-repo-resolution.js:100-118', verified_by: 'VALIDATION agent (Task tool), confirmed cwd_leak-to-healthy reclassification via direct file read' },
      { verified_at: 'tests/unit/resolve-sub-agent-repo.test.js (full file read)', verified_by: 'VALIDATION agent (Task tool), confirmed no existing assertions break under the fix plan' },
    ],
  },
  executed_from_cwd: CWD,
}).select('id');

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('VALIDATION evidence recorded:', data[0].id);
