import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001';

const SUCCESS_CRITERIA = [
  {
    criterion: "The rerun runner supplies real fence_two_sidedness evidence (canExerciseApp from the live deploy's signed-in CI probe, exclusionPredicateDeclared/exclusionPredicateAssertedInVentureCi from AltifyAI's ventures.metadata.synthetic_actor.exclusion_predicate_ref + its own CI test run)",
    measure: "a live re-run of the stage-23 walk records control_pack_status.fence_two_sidedness='evaluated' with a PASS verdict",
  },
  {
    criterion: "The rerun runner performs a REAL live nonce write+readback round-trip against the AltifyAI deploy (not a self-consistent fabrication) using its own Clerk-based UAT session-token minting mechanism",
    measure: "a live re-run records control_pack_status.live_deployment_binding='evaluated', and the recorded nonceWriteResult.echoedNonce genuinely differs run-to-run (proving a real write occurred, not a hardcoded literal)",
  },
  {
    criterion: 'canary_mutation_control is explicitly WAIVED (not silently omitted) with an honest, evidence-based reason, since no canary journey step exists yet and seeding one is a product/design decision outside this SD\'s authority',
    measure: "control_pack_status.canary_mutation_control='waived: <reason>' appears in the run's metadata, and control_pack_evaluated=true overall despite the waiver (buildControlPackStatus treats waived !== not_attempted)",
  },
  {
    criterion: 'The rerun runner refuses (fails loud) to execute against the live deploy if it cannot assemble the control pack, so the pre-fix default-evidence path can never again masquerade as an acceptance run',
    measure: "unit test: calling the runner's pack-assembly step with a missing required input (e.g. no Clerk secret) throws/exits non-zero before invoking runVentureJourneyWalk",
  },
];

const SMOKE_TEST_STEPS = [
  {
    step_number: 1,
    instruction: 'Run the new signed-in control-pack runner against the live AltifyAI deploy',
    expected_outcome: 'A uat_test_runs row is created with metadata.control_pack_evaluated=true and metadata.control_pack_status naming all 4 controls as evaluated or waived (never not_attempted)',
  },
  {
    step_number: 2,
    instruction: "Inspect the run's control_pack_status.canary_mutation_control value",
    expected_outcome: "Reads 'waived: <specific reason>', not 'evaluated' or 'not_attempted' -- an honest, visible waiver",
  },
  {
    step_number: 3,
    instruction: "Run the runner a second time and diff the two runs' nonceWriteResult.echoedNonce values",
    expected_outcome: 'The two echoed nonces differ (each run mints its own fresh nonce via generateProbeNonce), proving the binding evidence is not a hardcoded/faked literal',
  },
];

const KEY_CHANGES = [
  {
    change: 'New signed-in control-pack runner (scripts/one-off or lib/apa) assembles real fence_two_sidedness + live_deployment_binding evidence and an explicit canary_mutation_control waiver, then calls runVentureJourneyWalk with deps.controlPackEvidence set to that pack instead of letting the orchestrator\'s partial default synthesize it',
    impact: "Closes Solomon's acceptance fence (control_pack_evaluated=true) for the AltifyAI stage-23 walk for the first time -- the current default-evidence path can never produce true regardless of pass rate",
  },
  {
    change: "Port/adapt the altifyai repo's own Clerk-based UAT session-token minting (scripts/ci/mint-venture-uat-session-token.mjs) so EHG_Engineer's runner can perform a REAL signed-in nonce write+readback round-trip against the live deploy, using the already-provisioned VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI credential",
    impact: 'Corrects the QF\'s original stale premise (LEO_ALTIFYAI_UAT_READ_TOKEN, which does not exist) and produces the FIRST real (non-fabricated) live_deployment_binding evidence producer in the codebase',
  },
  {
    change: 'canary_mutation_control is explicitly waived via controlPackEvidence.waivedControls with a documented, honest reason (no canary journey step exists; seeding one is a product decision on live-app safety, out of this SD\'s scope) rather than left silently unaddressed',
    impact: 'Makes the gap visible and durable in every run\'s evidence record instead of either faking a canary or leaving the control permanently not_attempted',
  },
];

const RISKS = [
  {
    risk: "Porting the Clerk-auth token-minting flow cross-repo could silently drift from altifyai's own implementation if that script changes later",
    impact: 'medium',
    likelihood: 'low',
    mitigation: "Cite the exact source file/commit ported from in a code comment; add a lightweight contract test asserting the minted token's shape",
    rollback_plan: 'Revert to the pre-SD default-evidence behavior (control_pack_evaluated stays false, no regression to the walk itself, only to the evidence quality)',
  },
  {
    risk: 'A live write probe against the production AltifyAI deploy could have side effects if the probe endpoint is not properly scoped to the test identity',
    impact: 'medium',
    likelihood: 'low',
    mitigation: "Use only the pre-provisioned VENTURE_UAT_TEST_ACCOUNT_ALTIFYAI_EXISTING/_FRESH test identities (already used elsewhere for UAT), never a real user account; the altifyai deploy.yml's own existing probe step is the precedent this mirrors",
    rollback_plan: "N/A -- read/write is scoped to the dedicated UAT test identity's own event data",
  },
  {
    risk: "The canary waiver could be mistaken later as 'the control was evaluated and passed' if a reader doesn't check the exact status string",
    impact: 'low',
    likelihood: 'low',
    mitigation: "control_pack_status carries the literal string 'waived: <reason>', distinct from 'evaluated' -- any consumer reading it correctly cannot conflate the two",
    rollback_plan: 'N/A',
  },
];

const MECHANISM_VERIFICATION = {
  verified_by: 'Bravo worker session 45924f8d (fork investigation of the altifyai repo + live DB/journey-artifact checks)',
  verified_at: 'lib/eva/uat-control-pack.js:206',
  claim: 'CONTROL_PACK_CONTROLS has exactly 4 REQUIRED entries (minimum_assertion_manifest, live_deployment_binding, canary_mutation_control, fence_two_sidedness) -- NOT 5 as the QF/SD title implies ("nonce/deployment binding, canary, fence and evidence-hash controls"); the evidence hash (computeSubstantiveEvidenceHash) is a real, separate check but is NOT part of CONTROL_PACK_CONTROLS/allRequiredEvaluated. Of the 4, fence_two_sidedness is confirmed buildable now (all 3 sub-facts already true in the altifyai repo/DB, verified via gh api and a direct ventures-row read); live_deployment_binding is buildable but requires porting altifyai\'s own scripts/ci/mint-venture-uat-session-token.mjs Clerk-auth flow (confirmed present in altifyai\'s deploy.yml via gh api); canary_mutation_control has zero existing infrastructure (confirmed via a direct read of the live blueprint_user_journey artifact and lib/apa/venture-step-executors.js\'s ALTIFYAI registry -- no "canary" reference anywhere) and requires a product design decision, not a code change.',
};

const { data: current, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ_FAILED', readErr.message); process.exit(1); }

const existingVerifications = Array.isArray(current.metadata?.mechanism_verifications) ? current.metadata.mechanism_verifications : [];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    success_criteria: SUCCESS_CRITERIA,
    smoke_test_steps: SMOKE_TEST_STEPS,
    key_changes: KEY_CHANGES,
    risks: RISKS,
    metadata: { ...current.metadata, mechanism_verifications: [...existingVerifications, MECHANISM_VERIFICATION] },
  })
  .eq('sd_key', SD_KEY);
if (error) { console.error('UPDATE_FAILED', error.message); process.exit(1); }
console.log('SD fields populated: success_criteria/smoke_test_steps/key_changes/risks/mechanism_verifications');
