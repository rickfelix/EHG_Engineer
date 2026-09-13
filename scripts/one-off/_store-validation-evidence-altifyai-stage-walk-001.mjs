// SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- VALIDATION evidence writer (LEAD phase).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Independently re-verified all per-control buildability claims (gh api pulls against ' +
    'rickfelix/altifyai confirming deploy.yml\'s post-deploy-signed-in-uat step and ' +
    'scripts/ci/mint-venture-uat-session-token.mjs exist as described; zero canary references ' +
    'confirmed via grep). Found the proposed scope sound but INCOMPLETE: (1) the stage-23 walk\'s ' +
    'generation-flow defect is now FIXED -- latest run 84d310e1 is 14/14 100% GREEN, independently ' +
    're-confirmed via a direct uat_test_runs query -- making this SD the LAST blocker to a real ' +
    'launch-readiness gate, which raises the stakes on the canary waiver substantially. (2) A ' +
    'SECOND, previously unknown bug: lib/eva/uat-robustness-gate.js\'s checkUatRobustnessGate (the ' +
    'actual mechanism the fence reads) filters uat_test_runs by metadata->>stage_number, but the ' +
    'rerun script never passes stageNumber to runVentureJourneyWalk() -- confirmed live, run ' +
    '84d310e1\'s own metadata.stage_number=null. Even a perfect control pack would not close the ' +
    'fence without this fix. The waiver mechanism itself (controlPackEvidence.waivedControls) is ' +
    'legitimate by design -- buildControlPackStatus\'s own docblock frames it as chairman-approved, ' +
    'and an existing unit test (tests/unit/uat/result-recorder-control-pack.test.js:114-128) already ' +
    'exercises exactly this scenario -- but zero waivers have ever been used in production (0 of 26 ' +
    'sampled runs) and the field is honor-system (nothing verifies authorization), so the reason text ' +
    'must be coordinator/chairman-authored, not self-written by EXEC.',
  recommendations: [
    'Add stageNumber:23 to the runVentureJourneyWalk() call -- promoted to FR-0/key_change, the true acceptance measure is checkUatRobustnessGate(...).satisfied===true, not control_pack_evaluated in isolation.',
    'Derive exclusionPredicateAssertedInVentureCi from a real GitHub API pull of altifyai ci.yml\'s test-job conclusion, never hardcode true.',
    'Port SEC-43\'s secret-redaction handling alongside the Clerk token-minting logic (pin the source commit sha 130192b7fb84723c1b46c017f23cb79f93e62a2a in a comment to guard against cross-repo drift, the same failure class that caused QF-20260912-162).',
    'File a follow-up ticket for the canary-journey design decision before this SD completes and cite it in the waiver reason.',
    'Route the waiver reason text through the coordinator/chairman channel -- do not let EXEC author it, given the raised stakes (this is now a real launch-gate decision, not routine housekeeping).',
  ],
  metadata: {
    validation_mode: 'lead_phase_scope_and_stakes_verification',
    live_reprobe_performed: true,
    critical_finding_1: 'stage-23 walk is now GREEN (14/14, run 84d310e1) -- this SD is the LAST blocker to a real venture launch gate',
    critical_finding_2: 'checkUatRobustnessGate filters by stage_number, which the rerun script never sets -- a second, independent bug not in the original QF scope',
    waiver_mechanism_assessment: 'legitimate by design (buildControlPackStatus docblock + existing unit test precedent), never yet used in production, honor-system field requiring coordinator/chairman authorship of the reason text',
    duplicate_check: 'clean -- SD 668c68b6 built the pure functions/wiring only, this SD builds the evidence producers, complementary not duplicative',
  },
  execution_time_ms: 474986,
};

const resolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'VALIDATION', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst v3.0.0' }, results, { phase: PHASE, source: 'manual' });
console.log('VALIDATION_STORED_VERDICT=' + results.verdict);
console.log('VALIDATION_STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
