import dotenv from 'dotenv';
dotenv.config({ quiet: true });
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  validation_mode: 'prospective',
  phase: 'LEAD',
  summary: 'PROSPECTIVE pre-PRD structural review of the two-part fail-closed GO-LIVE gate + MOCK run design. 8 structural defects found, 3 CRITICAL. Both of the SD cited premises are factually wrong against current main, and the canonical predicate the SD asks to build ALREADY EXISTS but is provably inert.',
  justification: 'CONDITIONAL_PASS: the design is sound in intent and the choke point is correctly identified, but three CRITICAL structural defects would each produce a half-fix if the PRD is written against the SD text as-is. (1) The canonical go-live predicate already exists (lib/governance/stage-gate-predicate.js) and is already wired at 2 of the 4 named mirror sites, but its arming flag STAGE_GATE_PREDICATE_ARMED is ABSENT from leo_feature_flags, so shouldEnforceBlock() returns false for every venture in the fleet -- measured live, not inferred. (2) stage>=24 alone is NOT a safe predicate: the predicate treats is_demo=true as OUT_OF_SCOPE (141 of 171 ventures), and the only 2 non-demo ventures at/past S24 both carry launch_mode=simulated and return verdict=PASS. (3) publisher.publish() existing dry-run branch returns success:true and NO caller reads .dryRun, so a mock run would write status=posted, increment totalPublished and record spend -- synthetic results entering real bookkeeping, violating Part B own core requirement. Conditions below are blocking for the PRD.',
  conditions: [
    { action: 'PRD must correct two false premises: lib/marketing/publisher/autonomy-gate.js does not exist (real path lib/marketing/autonomy-gate.js), and autonomy-gate.js:251 is the crack-gate observe-only block, NOT the honesty invariants. The honesty invariants are already fail-closed ENFORCING (autonomy-gate.js:328-336) but only inside the autonomyState===autonomous branch; venture_channel_autonomy has ZERO rows, so they never execute for any venture today.', priority: 'critical', blocking: true },
    { action: 'PRD must reuse lib/governance/stage-gate-predicate.js checkStageGate() as the single source of truth for all 4 mirror sites rather than authoring a 5th predicate, and must specify that the DB trigger reads the SAME rule (stage-gate-predicate is JS-only; the trigger is the one site that structurally cannot import it -- name the duplication and how it is kept in sync).', priority: 'critical', blocking: true },
    { action: 'PRD must define the go-live predicate as stage>=24 AND launch_mode=live, and must convert is_demo=true from OUT_OF_SCOPE into FORCE-MOCK. As written (stage only), MarketLens S25 and DataDistill S27 -- both launch_mode=simulated -- get real-publish authorization, and 141 is_demo ventures stay completely ungated even after arming.', priority: 'critical', blocking: true },
    { action: 'PRD must change the mock return contract from the existing success:true/dryRun:true shape to a shape callers cannot mistake for a real publish, AND update both existing callers (content-pipeline.js:131, owned-audience-content-loop.js:169-174) in the same change. Otherwise Part B synthetic-never-enters-a-real-forecast requirement is violated by construction.', priority: 'critical', blocking: true },
    { action: 'PRD must add STAGE_GATE_PREDICATE_ARMED to leo_feature_flags and state the arming step as an explicit deliverable with a post-arm verification probe. Shipping code behind an absent flag is the exact PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 shape this SD is meant to close.', priority: 'high', blocking: true },
    { action: 'PRD must expand the mirror-site list from 4 to at least 6: lib/services/sovereign-alert.js:218 (Discord webhook) and :249 (raw Resend fetch) are reachable from production via src/services/CalibrationService.js:340 and bypass every gate. email-campaigns.js sendEmail() (:60) is publicly exported via lib/marketing/index.js and has ZERO gates -- processStep() has the consent+stage checks, sendEmail() has none, and sendEmail() is the callable surface.', priority: 'high', blocking: true },
    { action: 'PRD must specify how the mock run reaches the honesty-invariant ENFORCE path at all: it requires a venture_channel_autonomy row with autonomy_state=autonomous, and that table is empty. Seeding one for the mock venture is the side-effect risk the SD asks about -- an autonomous row is read by the REAL publish path too.', priority: 'high', blocking: true },
    { action: 'PRD must acknowledge that the D1/D2/D3 pipeline the mock is supposed to reuse largely does not exist as code: no audience/recipient-list producer exists anywhere in the repo, executePipeline() has zero production callers and no injectable seams (module-scope imports only), and the ADAPTERS map is a hardcoded const. Part B is a BUILD, not a REUSE.', priority: 'high', blocking: true },
  ],
  findings: {
    critical_count: 3,
    high_count: 5,
    premise_errors: 2,
    mirror_sites_named_by_sd: 4,
    mirror_sites_actually_required: 6,
  },
  recommendations: [
    'Split into two SDs: Part A (arm + correct the existing predicate, 4->6 mirror sites) is small and high-value; Part B (mock run) depends on building an audience loader and DI seams that do not exist, and is a much larger scope than 2-substitutions implies.',
    'Part A acceptance test should assert shouldEnforceBlock()===true for a below-go-live venture, not merely that checkStageGate returns BLOCK -- the current code returns blocked=true while permitting the publish.',
  ],
  metadata: {
    validation_mode: 'prospective',
    prospective_pre_prd: true,
    // HONEST UNMEASURED: this is a PRE-PRD prospective structural review. No implementation and
    // no acceptance test suite exists yet for this SD, so there is genuinely nothing to execute.
    // Per testing-verdict-guard.js, that must be declared explicitly rather than fabricated.
    // Structural probes WERE run (see live_measurements.probe_script) but a structural probe is
    // not a test-suite run and is deliberately not laundered into tests_executed.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0, passed: 0, failed: 0, skipped: 0,
      runner: 'none-prospective-pre-prd',
      source: 'fresh',
      artifactPath: '.artifacts/tst-gate-probe.mjs',
    }),
    sd_key: SD,
    files_read: [
      'lib/marketing/publisher/index.js',
      'lib/marketing/autonomy-gate.js',
      'lib/governance/stage-gate-predicate.js',
      'lib/marketing/ai/email-campaigns.js',
      'lib/marketing/venture-consent.js',
      'lib/marketing/content-pipeline.js',
      'lib/marketing/owned-audience-content-loop.js',
      'lib/feature-flags/evaluator.js',
    ],
    live_measurements: {
      probe_script: '.artifacts/tst-gate-probe.mjs',
      stage_gate_armed_flag: 'ABSENT from leo_feature_flags (25 flags enumerated, no STAGE_GATE_* key)',
      probe_non_demo_below_s24: 'WTP Insights S15 -> verdict=BLOCK blocked=true armed=false shouldEnforceBlock=FALSE (publish proceeds)',
      probe_is_demo_below_s24: 'Pipeline-Test S3 -> verdict=OUT_OF_SCOPE reason=is_demo shouldEnforceBlock=FALSE',
      probe_non_demo_at_s25_simulated: 'MarketLens S25 launch_mode=simulated -> verdict=PASS shouldEnforceBlock=FALSE',
      ventures_total: 171,
      ventures_is_demo_true: 141,
      ventures_stage_gte_24: 21,
      ventures_stage_gte_24_non_demo: 2,
      venture_channel_autonomy_rows: 0,
      venture_channel_publish_ledger_rows: 3,
    },
    premise_corrections: {
      'lib/marketing/publisher/autonomy-gate.js:26': 'FILE DOES NOT EXIST. Real path: lib/marketing/autonomy-gate.js (570 lines).',
      'autonomy-gate.js:251 honesty invariants ship observe-only': 'FALSE. Line 251 is checkCrackGateObserveOnly (the crack gate, which IS observe-only). Honesty invariants at :328-336 are fail-closed ENFORCING, but unreachable because they sit inside the autonomyState===autonomous branch and that table is empty.',
    },
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: SD });
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: true });

const stored = await storeSubAgentResults('TESTING', SD, { code: 'TESTING', name: 'QA Engineering Director' }, results, { phase: 'LEAD' });
console.log('\nSTORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase, 'validation_mode=', stored?.validation_mode);
console.log('repo_path=', stored?.metadata?.repo_path);
