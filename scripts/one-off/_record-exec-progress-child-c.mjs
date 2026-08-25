// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- EXEC progress record after implementing FR-1
// through FR-4's buildable-without-live-credentials scope. Honest status: what's built + unit
// tested vs. what's genuinely blocked pending credential provisioning (a human/chairman action,
// not something this session can perform -- entering credentials is a prohibited action).
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('FETCH_ERR', fetchErr.message); process.exit(1); }

const updatedMetadata = {
  ...sd.metadata,
  exec_progress: {
    recorded_at: new Date().toISOString(),
    commits: ['81d46208eee', 'f4c73388072', '48fa00f7f31', 'fe59df05644', 'a5ec02d1e75'],
    built_and_unit_tested: [
      'FR-4: VENTURE_DEFECT_CLASS taxonomy + venture-defect-recorder.js + uat-failure-triage.js (classify + record + failure-ceiling detection)',
      'FR-2: lib/eva/uat-control-pack.js (manifest check, deployment-binding liveness proof, run-unique substantive hash excluding volatile fields, canary mutation control incl. UNEXPLAINED_RED guard, fence two-sidedness) + result-recorder.js completeSession() control-pack wiring (backward compatible)',
      'FR-3: signed-out journey coverage via getSignedOutJourneySteps/buildSignedOutStepExecutor, reusing only already-verified preflightChecks (no fabricated selectors)',
      'FR-1: lib/eva/uat-robustness-gate.js + new stage-agnostic binding choke-point in stage-execution-worker.js, gated by LEO_UAT_ROBUSTNESS_GATE_ENFORCE (migration landed, default OFF)',
    ],
    genuinely_blocked_pending_credentials: [
      'Live e2e demo (TS-1, TS-2, TS-4 e2e variants; the 2 PRD smoke_test_steps): require LEO_ALTIFYAI_UAT_READ_TOKEN and VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_* to be provisioned against the real AltifyAI venture. Entering credentials is a prohibited action for this session (system-level rule) -- provisioning is a human/chairman action per venture-hosting-standard.md, not something EXEC can do itself.',
      'FR-1 AC#1 live proof (a real failing UAT run actually setting advanced:false against AltifyAI): same credential dependency -- until provisioned, only the unit-level mechanism (uat-robustness-gate.test.js) is verified, not the live end-to-end path.',
    ],
    architectural_dependency_on_child_b: 'The new binding gate is a true no-op until child B (stage-key SSOT migration) sets venture_stages.metadata.gates.uat_robustness_required=true on the new dedicated UAT stage -- by design (TR-1), not a gap in this child.',
    test_summary: '267 unit tests passing across 11 new/changed test files (104 new-module tests + 163 pre-existing stage-execution-worker*.test.js suite confirmed non-regressed after a placement fix)',
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: updatedMetadata })
  .eq('id', sd.id);
if (updateErr) { console.error('UPDATE_ERR', updateErr.message); process.exit(1); }
console.log('EXEC_PROGRESS_RECORDED=true');
