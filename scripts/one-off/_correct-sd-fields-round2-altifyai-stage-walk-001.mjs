import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001';

const APPENDUM = `

CRITICAL UPDATE (2026-09-13T01:2xZ, Bravo worker session 45924f8d, VALIDATION sub-agent finding, independently re-confirmed by direct DB read): the stage-23 walk's generation-flow defect (stp-e3e6) is NO LONGER BROKEN. The latest run (id 84d310e1-cb76-48b8-8abb-a5a4603f6102, created 2026-09-13T00:17:38Z, commit b48b40bd) is 14/14 (100%), quality_gate=GREEN, control_pack_status all four controls "not_attempted", control_pack_evaluated=false. This SD's fix is now the LAST blocker to closing Solomon's stage-23 acceptance fence for a real venture -- raising the stakes on the canary-control waiver from "nice to have" to "the one thing standing between AltifyAI and stage advance."

SECOND REAL BUG FOUND (independently verified against lib/eva/uat-robustness-gate.js:45-102's checkUatRobustnessGate, which is the ACTUAL consumer Solomon's fence reads, not control_pack_evaluated directly): it queries uat_test_runs by BOTH venture_id AND metadata->>stage_number. The rerun script never passes stageNumber to runVentureJourneyWalk() (an existing, already-documented optional param at journey-walk-orchestrator.js:49-51, "for exactly this lookup" per its own JSDoc) -- so metadata.stage_number is null on every run to date (confirmed: run 84d310e1's own metadata.stage_number=null). Even a PERFECT control pack would not close the fence without this fix. Added as FR-0 / a required key_change -- this SD's true acceptance measure is checkUatRobustnessGate(supabase, ventureId, 23).satisfied === true, NOT control_pack_evaluated===true in isolation (the latter is necessary but not sufficient).

CORRECTIONS to the runner's build (per VALIDATION sub-agent review, all independently spot-checked): (1) exclusionPredicateAssertedInVentureCi must be DERIVED from a real GitHub API pull of altifyai's ci.yml test-job conclusion at the deployed sha (reusing the pullNamedStepConclusion pattern already used for the deploy.yml probe), never hardcoded true -- a literal true would be fabricated evidence of the exact class the codebase's own S4 finding warns against. (2) The Clerk secret must never be threaded into uat_test_runs.metadata, walk artifacts, or console output -- port SEC-43's redaction alongside the minting logic, not one without the other; pin the upstream altifyai commit sha (130192b7fb84723c1b46c017f23cb79f93e62a2a) in a code comment since two copies of this logic can drift (the upstream copy itself exists because of a prior drift incident, QF-20260912-162). (3) File a follow-up ticket for the canary-journey design decision BEFORE this SD completes, and cite that ticket's key inside the waiver's reason string -- turns "we skipped it" into "we scheduled it," auditable. (4) The waiver reason text must be authored/approved via the coordinator/chairman channel, not self-authored by EXEC -- /signal already sent (8414d91c) flagging this; a follow-up signal with the raised stakes (walk now GREEN) has also been sent.`;

const SUCCESS_CRITERIA = [
  {
    criterion: 'runVentureJourneyWalk() is called with stageNumber:23 so uat_test_runs.metadata.stage_number is populated -- the exact field checkUatRobustnessGate (lib/eva/uat-robustness-gate.js:45-102) filters on',
    measure: 'a live re-run records metadata.stage_number=23; checkUatRobustnessGate(supabase, ventureId, 23) no longer returns the "no UAT run recorded" indeterminate-false verdict',
  },
  {
    criterion: 'The rerun runner supplies real fence_two_sidedness evidence, with exclusionPredicateAssertedInVentureCi DERIVED from a live GitHub API pull of altifyai ci.yml\'s test-job conclusion (never a hardcoded true)',
    measure: "a live re-run of the stage-23 walk records control_pack_status.fence_two_sidedness='evaluated' with a PASS verdict, and the evidence object's exclusionPredicateAssertedInVentureCi traces to a specific gh api call/response captured in the runner's own logs",
  },
  {
    criterion: 'The rerun runner performs a REAL live nonce write+readback round-trip against the AltifyAI deploy using its own Clerk-based UAT session-token minting mechanism (ported from altifyai commit 130192b7), with the secret never appearing in run metadata/artifacts/console',
    measure: "a live re-run records control_pack_status.live_deployment_binding='evaluated'; nonceWriteResult.echoedNonce differs run-to-run; a grep of the run's stored metadata for the Clerk secret value returns zero matches",
  },
  {
    criterion: 'canary_mutation_control is explicitly WAIVED with a coordinator/chairman-authored reason citing a filed follow-up ticket for the canary-journey design decision -- never silently omitted, never self-authored by EXEC',
    measure: "control_pack_status.canary_mutation_control='waived: <reason citing the follow-up ticket key>'; control_pack_evaluated=true overall despite the waiver",
  },
  {
    criterion: 'checkUatRobustnessGate(supabase, ventureId, 23) returns satisfied:true after this SD ships -- the actual mechanism Solomon\'s fence reads, not control_pack_evaluated in isolation',
    measure: 'direct post-ship verification: calling checkUatRobustnessGate against the new run returns {applies:true, satisfied:true}',
  },
];

const KEY_CHANGES = [
  {
    change: "FR-0: add stageNumber:23 to the rerun script's runVentureJourneyWalk() call",
    impact: "Without this, uat_test_runs.metadata.stage_number stays null forever and checkUatRobustnessGate can never find the run regardless of control-pack quality -- this was independently discovered as a second, previously-unknown blocker",
  },
  {
    change: "New signed-in control-pack runner assembles real fence_two_sidedness + live_deployment_binding evidence (deriving, never hardcoding, each sub-fact) and an explicit, coordinator-authored canary_mutation_control waiver, then calls runVentureJourneyWalk with deps.controlPackEvidence set to that pack",
    impact: "Closes Solomon's acceptance fence (checkUatRobustnessGate satisfied=true) for the AltifyAI stage-23 walk for the first time -- confirmed this SD is now the LAST blocker since the walk itself is already GREEN (14/14, run 84d310e1)",
  },
  {
    change: "Port altifyai's own Clerk-based UAT session-token minting (scripts/ci/mint-venture-uat-session-token.mjs, pinned at commit 130192b7) plus its SEC-43 secret-redaction handling, using the already-provisioned VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI credential",
    impact: 'Produces the FIRST real (non-fabricated) live_deployment_binding evidence producer in the codebase, with the secret-handling discipline ported alongside the minting logic, not bolted on after',
  },
  {
    change: 'File a follow-up ticket for the canary-journey design decision and cite it in the waiver reason; route the waiver text itself through the coordinator/chairman, not self-authored',
    impact: 'Makes the one unaddressed control auditable and scheduled rather than silently or unilaterally dismissed, given this waiver is now the actual last decision gating a real venture\'s stage advance',
  },
];

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ_FAILED', readErr.message); process.exit(1); }

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: current.description + APPENDUM,
    success_criteria: SUCCESS_CRITERIA,
    key_changes: KEY_CHANGES,
  })
  .eq('sd_key', SD_KEY);
if (error) { console.error('UPDATE_FAILED', error.message); process.exit(1); }
console.log('SD updated with round-2 corrections (stageNumber bug, real acceptance measure, waiver process).');
