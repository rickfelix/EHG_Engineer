import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
import { execSync } from 'node:child_process';

const SD_KEY = 'SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001';
const SD_UUID = '4520716b-0603-46b5-bf7e-19fe4271fe3b';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const critical_issues = [
  "BLOCKING-1 (TS-3, TS-7 unimplementable as written): shouldEnforceBlock() is `export function shouldEnforceBlock(result)` at lib/governance/stage-gate-predicate.js:309 -- a PURE SYNCHRONOUS function over a checkStageGate() result object. It never reads a venture and never reads a feature flag. TS-7's Given ('leo_feature_flags has no STAGE_GATE_PREDICATE_ARMED row') plus When ('shouldEnforceBlock() is called for any venture') describes a function that does not exist. The flag read happens in checkStageGate() at line 243 (typeof armed === 'boolean' ? armed : await isEnabled(...)). Both scenarios must be restated as checkStageGate({...}) -> shouldEnforceBlock(result). EXEC will otherwise write a test against the wrong seam.",
  "BLOCKING-2 (TS-2 contradicts the existing wiring -- MOCK vs DENY is undecided): shouldEnforceBlock() returns ONE boolean, but the PRD requires a 3-way contract. TS-2 expects 'publish forced to mock, ledger row written with the mock discriminator'. The EXISTING chain produces a DENY, not a mock: autonomy-gate.js:308 'if (shouldEnforceBlock(stageGate)) return { allowed:false, reason:STAGE_GATE_BLOCKED... }' -> publisher/index.js:63 'return { success:false, error:authCheck.reason, blockedBy:autonomy-gate }' -- success:false, NO adapter call, and NO ledger row. TS-2 as written is unsatisfiable against the current call chain. FR-3 asks for mode:real|mock|deny while FR-6 mandates the single boolean as the SOLE discriminator; both cannot hold. PLAN must decide whether shouldEnforceBlock()===true means 'take the mock path and write a discriminated ledger row' (TS-2) or 'refuse' (TS-6's SEND_REFUSAL). Today it means refuse at every wired site.",
  "BLOCKING-3 (TS-6 unimplementable, and the obvious fix FAILS OPEN): lib/marketing/ai/email-campaigns.js:60 is 'async sendEmail(params)' destructuring { to, subject, html, from, tags } -- there is NO ventureId in the signature, and the enclosing factory's deps are { supabase, logger, resendClient, resendApiKey } (line 46), also no ventureId. sendEmail() cannot resolve a venture, so FR-5/US-005 step 1 ('add a shouldEnforceBlock() check inside sendEmail() itself') requires a signature change that no FR states. Worse: if ventureId is added as OPTIONAL, a caller omitting it hits checkStageGate rule (a) (line 239-241: no ventureId -> { inScope:false, blocked:false, verdict:OUT_OF_SCOPE, armed:false }), so shouldEnforceBlock()===false and the send PROCEEDS. The new gate fails open on exactly the bypass TS-6 exists to close. Needs an explicit AC: a send site with an absent/unresolvable ventureId REFUSES, never delegates to the predicate's OUT_OF_SCOPE default.",
  "BLOCKING-4 (TS-5 cannot discriminate the two candidate implementations, and the laundering vector is the untested one): evaluateGraduation() (autonomy-gate.js:473-487) queries .neq('outcome','unknown').order('created_at', descending).limit(requiredStreak) then breaks on the first non-clean row. 'Exclude discriminated rows' has two implementations: (a) a DB-level .neq('is_synthetic', true) makes mock rows INVISIBLE, so the .limit() window SLIDES PAST them onto OLDER real clean rows -- N mock rows plus 5 older real clean rows GRADUATES; or (b) treat a mock row as a streak-BREAKER. TS-5's fixture is homogeneous ('N consecutive rows ALL marked mock') and yields cleanStreak=0 under BOTH, so it passes either way. The dangerous interleaved case (mock rows newest, real clean rows older) is the actual streak-laundering vector and is the PRD's own CRITICAL-impact risk. Needs a mixed fixture plus a stated skip-vs-break decision."
];

const warnings = [
  "HIGH-5 (one FR-5 mirror site has ZERO test coverage): there is no test scenario for the outbound-ledger DB trigger. Acceptance criterion #3 says the 5 sites are 'verified by grep/test' -- grep is not a test, and this repo already recorded that exact finding: tests/unit/marketing/altifyai-no-send-capability.test.js header cites TESTING finding G2 (sub_agent_execution_results de22862f), 'a bare case-insensitive substring grep is red-by-construction'. Also, CI has no local Postgres, so a trigger test must be designated to the `db` vitest project (see MEDIUM-12).",
  "HIGH-6 (no regression scenario for the 141-venture is_demo cohort, and an existing test WILL go red): FR-2 flips is_demo from OUT_OF_SCOPE to enforced. Measured live: 141/171 ventures are is_demo=true, so this changes behavior for 82% of the fleet -- while PRD risk #5's mitigation claims the change is 'behavior-preserving for already-cleared ventures; only below-go-live sends change behavior'. Demo ventures at ANY stage change behavior. Concretely, tests/unit/governance/stage-gate-predicate.test.js:122-127 ('TS-5: is_demo=true venture is out of scope even at stage 1', asserting r.verdict===VERDICT.OUT_OF_SCOPE) will FAIL. lib/creative/asset-view-gate.js:23-24 carries a comment explicitly documenting that it avoids shouldEnforceBlock() BECAUSE of this is_demo divergence, and lib/creative/asset-view-gate.test.js:119 encodes it in a test name. No scenario acknowledges the breakage or asserts what a demo venture's publish path should now RETURN (hard failure vs mock result).",
  "HIGH-7 (no scenarios for the predicate's other fail-open/edge paths): checkStageGate has 5 rules; the scenarios cover only the stage comparison. Uncovered: rule (a) ventureId absent -> OUT_OF_SCOPE/armed:false (line 239-241), meaning ANY publish without venture linkage is completely ungated -- a live bypass of the whole SD; rule (b) invalid requiredStage -> BLOCK (line 255); rule (d) unresolvable stage -> BLOCK (line 281); rule (e) chairman override consumption, which is armed-gated per SECURITY H4 and interacts with the new launch_mode leg (does an active override also override launch_mode='simulated'? undefined in the PRD).",
  "HIGH-8 (TS-4 misses two consumers and omits return-path completeness): FR-3/TS-4 name totalPublished, recordSpend, and status='posted'. Two further consumers of the same result are untested: (i) lib/marketing/owned-audience-content-loop.js:174 recordWrite({ ventureId, operationType:'publish', ... }) fires immediately after the status update on the same success path -- a mock publish recorded as a real 'publish' write operation is the same fabricated-activity harm class; (ii) lib/marketing/content-pipeline.js:131-134 spreads ...pubResult into channelResult.publishResults, surfacing it to any downstream reader. Separately, publish() has roughly 7 return paths including { success:true, postId, deduplicated:true } (line 49) which carries no mode; if the new mode field is not set on EVERY return path, a caller branching on mode==='real' silently stops counting dedup hits, while a caller branching on mode!=='mock' counts them. No scenario pins return-path completeness.",
  "HIGH-9 (ledger backfill / NULL semantics untested -- mechanism real, extent currently ZERO): in PostgREST, .neq('is_synthetic', true) emits is_synthetic <> true, which is NULL for NULL rows and therefore EXCLUDES every legacy row, resetting every channel's streak to 0. MEASURED EXTENT: venture_channel_publish_ledger holds 3 rows total, 0 rows with decision='accepted' AND outcome='shipped_clean', and 0 channels are currently autonomy_state='autonomous' -- blast radius TODAY is zero, so this is advisory rather than blocking. But the column default/backfill decision is permanent, so a test should pin it (NOT NULL DEFAULT false, plus a case asserting a backfilled legacy row still counts toward a streak)."
];

const recommendations = [
  "MEDIUM-10 (TS-1 is unreachable against real data AND is the SD's own harm class if run as a true integration test): MEASURED -- 0 of 171 ventures have launch_mode='live', and 0 non-demo ventures at stage>=24 have launch_mode='live'. TS-1's happy path cannot be instantiated from production data; it MUST be fixture-based. Compounding: TS-1 is labelled test_type='integration' with 'real-shaped channel credentials' and expects the call to 'fall through to adapter.publish' -- an unmocked run of that is a real outbound post, precisely what this SD exists to prevent. Mandate mocked adapters. The seam already exists: tests/unit/marketing/publisher.test.js:9-17 vi.mock()s both adapters/x.js and adapters/bluesky.js, and line 365 re-imports XAdapter to inspect calls, which also makes TS-2's 'zero adapter.publish calls' directly assertable.",
  "MEDIUM-11 (pinning CI to live venture rows turns a legitimate chairman decision into a red build): FR-6 AC and acceptance_criteria #4 require the negative matrix to cover 'AltifyAI (S23) and ApexNiche AI (S21)'. Verified live: AltifyAI=50763b6a (is_demo=false, launch_mode='simulated', stage 23), ApexNiche AI=809ec7e7 (is_demo=false, simulated, stage 21) -- the PRD's premises are accurate. But the day the chairman sets AltifyAI launch_mode='live' (the entire point of PRD risk #1), a CI test asserting shouldEnforceBlock()===true for AltifyAI goes RED on a correct business action. Recommend asserting on FIXTURES that replicate those two ventures' shapes, and keeping the live-row probe as a separate non-gating observability check -- which also satisfies FR-1's 'live-probed before/after arming' AC without gating CI on it.",
  "MEDIUM-12 (no test file paths, no vitest project designation, and this repo punishes that): package.json maps test:unit -> 'vitest run --project unit', whose config excludes DB_INCLUDE and QUARANTINE_EXCLUDE, and test:db -> 'vitest run --project db'. A live-DB test dropped into tests/unit/ without DB_INCLUDE registration either fails with no DB or is silently excluded (vitest.config.js:151-160 documents a prior silent-vanish incident of exactly this kind). TS-1/TS-2/TS-6 are labelled 'integration' but FR-6 wants them in CI. PLAN should name the target file and project per scenario. Suggested reuse (all exist): tests/unit/governance/stage-gate-predicate.test.js (TS-1/2/3/7), tests/unit/marketing/publisher.test.js (TS-2 and the TS-4 publisher leg), tests/unit/marketing/autonomy-gate.test.js describe('evaluateGraduation') at line 65 (TS-5), tests/unit/marketing/owned-audience-content-loop.test.js and content-pipeline-budget.test.js (TS-4 caller legs), tests/unit/marketing/venture-consent.test.js (FR-5 consent leg). TS-6 is unit-testable without a DB because resendClient is injectable via deps (email-campaigns.js:40, '@param {object} [deps.resendClient] - Resend SDK client (for testing injection)').",
  "MEDIUM-13 (PRD activation fields are NULL and this SD looks like an activation-invariant trigger): product_requirements_v2.smoke_test_cmd IS NULL and activation_test_id IS NULL. This SD ships a schema change (venture_channel_publish_ledger discriminator plus a DB trigger) AND consumers (evaluateGraduation, publisher, the 5 mirror sites) -- the dual-scan trigger heuristic in scripts/modules/activation-invariant/trigger-evaluator.js will very likely fire at LEAD-FINAL-APPROVAL. Set activation_test_id now, pointing at the end-to-end test that drives schema -> mock-forced publish -> discriminated ledger row -> evaluateGraduation exclusion against a migration-applied DB, rather than discovering the gate at final approval.",
  "MEDIUM-14 (TS-6's 'returns/throws' is ambiguous): sendEmail() returns { success, messageId?, error?, attempts } and wraps its body in a for-retry loop with try/catch (lines 64-80). A thrown SEND_REFUSAL would be caught by that loop and retried or reshaped. TS-6 must specify the RETURN form { success:false, error:<SEND_REFUSAL token> }, assert the refusal happens BEFORE the retry loop is entered, and assert zero calls on the injected resendClient.",
  "STRENGTHS (credit where due): (1) Every factual premise in the PRD independently verified against the live DB -- 171 ventures, 141 is_demo, 30 non-demo, 2 non-demo past S24, 0 launch_mode='live'; ventures.launch_mode exists; STAGE_GATE_PREDICATE_ARMED absent from leo_feature_flags; HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED and LEO_HIGH_CONSEQUENCE_GATES_ENABLED both is_enabled=true (FR-7's premise holds); venture_channel_publish_ledger has 12 columns and no discriminator. Zero premise drift -- unusually strong PLAN work. (2) FR-6's insistence on shouldEnforceBlock() over checkStageGate().blocked is EXACTLY right: .blocked is already true today against inert code, so a .blocked assertion is green-by-construction and proves nothing. (3) TS-3 targets a genuine, previously documented trap -- stage-gate-predicate.js:272-274 hardcodes armed:false on the is_demo branch even when armed:true is passed, recorded in prior TESTING/VALIDATION evidence for SD-...-MEDIA-PRODUCTION-CAPABILITY-001-B. Recommend TS-3 assert result.armed explicitly, not just the shouldEnforceBlock() boolean, per that prior finding's own recommendation."
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary: "PLAN-phase TESTING review of PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 (7 scenarios TS-1..TS-7, 7 FRs, 5 acceptance criteria, 7 user stories). All PRD factual premises independently verified accurate against the live DB, and the test harness for 5 of 7 scenarios already exists and is reusable. CONDITIONAL_PASS: 4 blocking-class scenario defects must be resolved before EXEC builds -- TS-3/TS-7 mis-describe shouldEnforceBlock()'s signature (a pure sync function over a result object, neither venture- nor flag-aware); TS-2 contradicts the existing DENY wiring and the mock-vs-deny semantics of a single boolean are undecided; TS-6 is unimplementable because sendEmail() has no ventureId in scope, and the obvious optional-param fix FAILS OPEN via the predicate's no_venture_id OUT_OF_SCOPE branch; TS-5's homogeneous fixture cannot distinguish a DB-filter skip (which lets the limit window slide onto older real rows and launder a graduation) from a streak break. Plus 5 HIGH coverage gaps and 5 MEDIUM test-design items.",
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis: [
    'SCOPE: PLAN-phase testability and coverage review in preparation for PLAN-TO-EXEC. No implementation performed. No tests executed -- none exist yet for this SD; this is a prospective review of PRD test_scenarios and acceptance_criteria.',
    'METHOD: read the PRD row from product_requirements_v2; read all 7 user stories; read the source of every file named in the FRs (lib/governance/stage-gate-predicate.js, lib/marketing/publisher/index.js, lib/marketing/content-pipeline.js, lib/marketing/owned-audience-content-loop.js, lib/marketing/autonomy-gate.js, lib/marketing/ai/email-campaigns.js, lib/marketing/venture-consent.js); inventoried the existing test harness (tests/unit/marketing/*, tests/unit/governance/*, lib/creative/asset-view-gate.test.js); measured live DB state for every quantitative claim in the PRD.',
    'COVERAGE MAP, FR to scenario: FR-1 -> TS-7 (defective, BLOCKING-1). FR-2 -> TS-1/TS-2/TS-3 (TS-3 defective; no demo-cohort regression case, HIGH-6). FR-3 -> TS-4 (incomplete consumers and return-path completeness, HIGH-8). FR-4 -> TS-5 (non-discriminating fixture, BLOCKING-4; backfill untested, HIGH-9). FR-5 -> TS-6 (unimplementable, BLOCKING-3) and the DB trigger has NO scenario (HIGH-5). FR-6 -> a meta-requirement on the suite itself, correct in principle (STRENGTHS 2) but fragile in its live-row matrix (MEDIUM-11). FR-7 -> governance; no test scenario needed and none expected.',
    'TESTABILITY VERDICT PER SCENARIO: TS-1 testable only as a fixture (0/171 live ventures qualify) and only with mocked adapters. TS-2 not satisfiable as written against the current DENY chain. TS-3 testable but must assert result.armed, not just the boolean. TS-4 testable but incomplete. TS-5 testable but non-discriminating. TS-6 not implementable without a sendEmail() signature decision. TS-7 testable once restated against checkStageGate().',
    'HARNESS READINESS: GOOD. The vi.mock adapter seam (publisher.test.js:9-17), the injectable resendClient (email-campaigns.js:40), mock-supabase builders in stage-gate-predicate.test.js and autonomy-gate.test.js, and a describe(evaluateGraduation) block at autonomy-gate.test.js:65 all already exist. No new infrastructure is needed for TS-1 through TS-5 and TS-7. Only the DB trigger (HIGH-5) needs a harness decision.',
    'NOT A DEFECT, EXPLICITLY CHECKED: the sovereign-alert.js exclusion from the 5 mirror sites is correctly reasoned in FR-5 and correctly carries its own AC requiring a test that documents the exclusion as intentional. Keep that AC.'
  ].join('\n\n'),
  metadata: {
    phase: 'PLAN',
    // Honest-unmeasured row (testing-verdict-guard.js EXEMPTION path): this is a PROSPECTIVE
    // PLAN-phase review of PRD test_scenarios before any test for this SD exists. Zero tests
    // were run because zero tests exist to run; nothing was measured and nothing is claimed.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0, passed: 0, failed: 0, skipped: 0,
      runner: 'none',
      source: 'prospective_prd_review_no_tests_exist'
    }),
    applicability_rule: 'PLAN-phase prospective PRD testability review: test_scenarios are evaluated as specifications, not executed. Execution evidence is owed at EXEC-TO-PLAN, not here.',
    prd_id: 'PRD-SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001',
    sd_key: SD_KEY,
    review_type: 'prospective_prd_testability',
    handoff: 'PLAN-TO-EXEC',
    target_application: 'EHG_Engineer',
    evaluated_commit_sha: sha,
    no_implementation_performed: true,
    tests_executed: 0,
    test_scenarios_reviewed: 7,
    acceptance_criteria_reviewed: 5,
    user_stories_reviewed: 7,
    functional_requirements_reviewed: 7,
    blocking_findings: 4,
    high_findings: 5,
    medium_findings: 5,
    findings_count: 14,
    // NB: `measured` (boolean) is the guard's contract -- do NOT reuse that key for data.
    measured_facts: {
      ventures_total: 171,
      ventures_is_demo_true: 141,
      ventures_is_demo_false: 30,
      ventures_launch_mode_live: 0,
      ventures_nondemo_stage_gte24: 2,
      ventures_nondemo_stage_gte24_live: 0,
      altifyai: { id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9', is_demo: false, launch_mode: 'simulated', stage: 23 },
      apexniche: { id: '809ec7e7-f688-4a0c-b9f8-c8a8291cf94d', is_demo: false, launch_mode: 'simulated', stage: 21 },
      ledger_rows_total: 3,
      ledger_accepted_shipped_clean: 0,
      channels_autonomous: 0,
      ledger_has_discriminator_column: false,
      flag_STAGE_GATE_PREDICATE_ARMED_exists: false,
      flag_HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED: true,
      flag_LEO_HIGH_CONSEQUENCE_GATES_ENABLED: true,
      prd_smoke_test_cmd: null,
      prd_activation_test_id: null
    },
    existing_harness_reusable: [
      'tests/unit/governance/stage-gate-predicate.test.js',
      'tests/unit/governance/stage-gate-predicate-paired-controls.test.js',
      'tests/unit/marketing/publisher.test.js',
      'tests/unit/marketing/autonomy-gate.test.js',
      'tests/unit/marketing/owned-audience-content-loop.test.js',
      'tests/unit/marketing/content-pipeline-budget.test.js',
      'tests/unit/marketing/venture-consent.test.js',
      'lib/creative/asset-view-gate.test.js'
    ],
    existing_tests_at_risk: [
      'tests/unit/governance/stage-gate-predicate.test.js:122 (asserts is_demo -> OUT_OF_SCOPE; FR-2 makes this red)',
      'lib/creative/asset-view-gate.test.js:119 (test name encodes the is_demo OUT_OF_SCOPE semantics FR-2 changes)'
    ],
    sub_agent_version: '2.4.0',
    model_usage_log_id: '4cb2c68e-29a3-451b-a05f-087383232dcd'
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  supabase
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD_UUID,
  { name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { sdKey: SD_KEY, phase: 'PLAN' }
);
console.log('\nSTORE RESULT:', JSON.stringify(stored, null, 1));
console.log('FINAL VERDICT FIELD:', results.verdict);
console.log('REPO META:', JSON.stringify({ repo_path: results.metadata.repo_path, repo_resolved: results.metadata.repo_resolved, executed_from_cwd: results.metadata.executed_from_cwd }));
