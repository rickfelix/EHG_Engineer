// SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- EXPLORE evidence writer (LEAD phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001';
const PHASE = 'LEAD';

const exploreResults = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Traced each of the 4 REQUIRED control-pack controls (lib/eva/uat-control-pack.js ' +
    'CONTROL_PACK_CONTROLS) individually against live state, rather than treating the QF as one ' +
    'unit. fence_two_sidedness: buildable now -- altifyai repo\'s deploy.yml already has a ' +
    'post-deploy-signed-in-uat CI step proving canExerciseApp; ventures.metadata.synthetic_actor' +
    '.exclusion_predicate_ref="lib/synthetic-actor.js#isSyntheticActor" is set (non-placeholder, ' +
    'confirmed live in the DB row); tests/synthetic-actor.test.js exists in altifyai and runs on ' +
    'every push via its ci.yml unscoped "npm test" step. live_deployment_binding: buildable but ' +
    'moderate -- the QF\'s cited blocker (LEO_ALTIFYAI_UAT_READ_TOKEN) does not exist anywhere; ' +
    'the real mechanism altifyai\'s own deploy.yml already uses is scripts/ci/mint-venture-uat-' +
    'session-token.mjs (Clerk-based), keyed by VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI, which IS ' +
    'present in EHG_Engineer\'s own .env -- but the minting logic itself lives in the altifyai ' +
    'repo and must be ported/adapted. canary_mutation_control: NOT a code task -- zero "canary" ' +
    'references exist anywhere in AltifyAI\'s live blueprint_user_journey artifact (checked ' +
    'directly, 15.7KB) or in lib/apa/venture-step-executors.js\'s ALTIFYAI registry; requires a ' +
    'product/design decision (which step, whether a permanently-broken probe is safe on a live ' +
    'venture) before any code can satisfy checkCanaryMutationControl(). git log on ' +
    'lib/eva/uat-control-pack.js / lib/uat/result-recorder.js shows exactly 3 commits total, all ' +
    'pure-function/wiring layer -- no prior QF (20260830-666/20260902-206/20260902-884/' +
    '20260906-282/826/033/20260912-162) ever built a real evidence producer for controls 2-4, ' +
    'confirmed by a zero-result grep for nonceWriteResult/canaryJourneyId/uatProbePath across ' +
    'lib/ and scripts/ outside the definition files themselves.',
  recommendations: [
    'Scope this SD to fence_two_sidedness (real) + live_deployment_binding (real, ported Clerk-auth flow) + canary_mutation_control (explicit waiver via controlPackEvidence.waivedControls, not silently omitted).',
    'Correct the runner\'s stated dependency on LEO_ALTIFYAI_UAT_READ_TOKEN -- that variable does not exist; use VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI + the ported mint-venture-uat-session-token.mjs logic instead.',
    'A waived canary_mutation_control still allows control_pack_evaluated=true (buildControlPackStatus treats "waived" as accounted-for, distinct from "not_attempted") -- confirmed by reading uat-control-pack.js:208-227 directly.',
  ],
  metadata: {
    exploration_mode: 'altifyai_control_pack_per_control_buildability_recon',
    control_pack_controls_source: 'lib/eva/uat-control-pack.js:206 CONTROL_PACK_CONTROLS (4 entries, NOT 5 -- evidence_hash is separate and not in this list)',
    per_control_findings: {
      fence_two_sidedness: 'buildable now, ~10-20 LOC, all facts already true (altifyai deploy.yml CI step, ventures.metadata exclusion_predicate_ref, altifyai tests/synthetic-actor.test.js in ci.yml)',
      live_deployment_binding: 'buildable, ~50-100+ LOC, requires porting altifyai/scripts/ci/mint-venture-uat-session-token.mjs (Clerk-based); QF\'s cited blocker (LEO_ALTIFYAI_UAT_READ_TOKEN) is stale/nonexistent -- real credential VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI already provisioned',
      canary_mutation_control: 'not a code task -- zero existing infrastructure, needs a product/design decision first; to be WAIVED this SD',
    },
    prior_qf_coverage_checked: ['QF-20260830-666', 'QF-20260902-206', 'QF-20260902-884', 'QF-20260906-282', 'QF-20260906-826', 'QF-20260906-033', 'QF-20260912-162'],
    prior_qf_coverage_result: 'all touched fixtures/wiring/pure-functions only; none supplied real evidence for controls 2-4',
  },
  execution_time_ms: 223413,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'EXPLORE', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(exploreResults, resolution);
const stored = await storeSubAgentResults('EXPLORE', SD_ID, { name: 'Explore (Claude Code built-in)' }, exploreResults, { phase: PHASE, source: 'manual' });
console.log('EXPLORE_STORED_VERDICT=' + exploreResults.verdict);
console.log('EXPLORE_STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
