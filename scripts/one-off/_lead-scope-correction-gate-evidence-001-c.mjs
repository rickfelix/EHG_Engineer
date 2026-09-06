import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: "Run: node scripts/execute-subagent.js --code RCA --sd-id <fixture-SD> (the CLAUDE.md/rca-agent.md-documented invocation path).",
    expected_outcome: "A root_cause_reports row is created-or-resolved for the SD (not an SD-UUID-as-RCR-id lookup failure); the module runs the real 5-Whys analysis instead of failing with 'RCR not found'."
  },
  {
    step_number: 2,
    instruction: "Query the resulting sub_agent_execution_results row (sub_agent_code='RCA').",
    expected_outcome: "metadata.rcr_id is populated and resolves to the root_cause_reports row from step 1, which carries real root_cause/causal_chain/contributing_factors columns (not an empty/stub analysis)."
  },
  {
    step_number: 3,
    instruction: "Run the rca-required-after-retries-gate.js check against a hollow/failed-verdict RCA row (fixture with no real analysis content).",
    expected_outcome: "The gate no longer treats bare row-existence as sufficient -- a content-free row is distinguishable from a genuine analysis, closing the false-pass this SD exists to fix."
  }
];

const scopeNote = `LEAD scope correction (2026-09-05, validation-agent evidence 7b499187 + risk-agent evidence 0cae276e, both independently re-measuring against live DB/code rather than accepting the SD's original text):
- DROPPED: "results-storage.js only console.warn"s claim -- STALE, already throws (results-storage.js:917), shipped by sibling SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-H. Already satisfied, no work needed.
- DROPPED: FR-C2's "write unmapped RCA fields into sub_agent_execution_results metadata" -- this encodes RETRACTED guidance (feedback 1e4d6f6c, 13min after the SD's own originating feedback 314a3556: "do NOT store unmapped RCA fields in results metadata -- root_cause_reports is the canonical RCA surface"). Corrected direction: analysis fields belong in root_cause_reports' own dedicated columns (root_cause/causal_chain/contributing_factors/evidence_refs -- already exist, no new schema), referenced by id from the evidence row's metadata (metadata.rcr_id -- already an exempted/mapped field).
- DROPPED: sub_agent_code 'RCA-AGENT' vs 'RCA' casing normalization -- zero live rows of either the hook path or its miscasing (task-subagent-recorder.cjs's Agent-tool-invoked-evidence hook is dead fleet-wide for ALL 22 sub-agent codes, per unpromoted feedback 52a64020/7317fce3, 2026-08-07 -- a separate, larger, already-tracked defect; not absorbed into this SD per protocol).
- DROPPED: registering the dead/unregistered rca-feedback-loop-gate.js -- out of scope, a separate behavior-change decision.
- KEPT & SHARPENED: (1) fix executor.js's dispatch passing an SD UUID where rca.js::execute(rcrId,...) expects a root_cause_reports id -- the real, measured, safely-isolated defect (only rca.js differs among 27 dispatchable sub-agent modules per risk-agent's full survey); (2) the actually-live gate (rca-required-after-retries-gate.js) currently passes on ROW EXISTENCE ONLY regardless of verdict/content -- a hollow/failed RCA row satisfies it identically to a real one, which is the true false-pass this SD's stated intent ("a cited analysis always resolves to a provenanced row") requires closing; (3) build the shared recorder (following the existing scripts/record-explore-evidence.js precedent) so the CLI-dispatched path resolves-or-creates an RCR, writes real analysis into its native columns, and threads rcr_id back for citation resolution.
Net: 3 of the SD's original 4 stated FRs were stale, retracted, or out-of-scope-by-precedent; replaced with a corrected, evidence-grounded 3-item fix. Both gates are advisory-mode (app_config), so no regression-failure-wave risk on rollout; RLS permissiveness on root_cause_reports is pre-existing/orthogonal, documented not fixed here.`;

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    scope_reduction_percentage: 60,
    smoke_test_steps: smokeTestSteps,
  })
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C');

if (error) { console.error('update1 error:', error); process.exit(1); }

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C')
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const newMetadata = { ...(row.metadata || {}), lead_scope_correction: scopeNote };
const { error: metaErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('sd_key', 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C');
if (metaErr) { console.error('update2 error:', metaErr); process.exit(1); }

console.log('OK: scope_reduction_percentage=60, smoke_test_steps updated, metadata.lead_scope_correction recorded.');
