import dotenv from 'dotenv'; dotenv.config({ quiet: true });
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001';

const findings = [
  {
    id: 'F-1', severity: 'HIGH', scenario: 'TS-1 / FR-1',
    title: 'preflightUpstream carries no payload -- FR-1 is a mechanism change, not a repoint',
    detail: 'preflightUpstream() selects only (lifecycle_stage, artifact_type, is_current) and reduces to present = new Set(artifact_type): a set of type NAMES with zero artifact payload. FR-1 tells EXEC to reuse the SAME artifact-type-keyed lookup mechanism preflightUpstream already uses in order to obtain verdicts and counts, which that mechanism structurally cannot supply. EXEC must widen the select to include artifact_data and change present from Set<string> to Map<string,row>. Scope and LOC estimate should be revised accordingly.',
    file: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js'
  },
  {
    id: 'F-2', severity: 'HIGH', scenario: 'TS-2 / FR-1 AC#3',
    title: 'No distribution artifact carries countable channel data -- FR-1 AC#3 is unsatisfiable as written',
    detail: 'Measured live on AltifyAI: distribution_channel_config.artifact_data keys are files, opt_in, record, status, opt_out, deployed, page_type, hero_proof, pricing_shown, outward_facing, target_segment, capture_endpoint, privacy_html_len, hands_to_chairman, impersonation_check, privacy_note_included. There is no active_channels, no channels, and no countable channel list on any distribution artifact. FR-1 AC#3 (reads a real count from the distribution artifact actual channel data) cannot be met. PLAN must decide now: score distribution on presence/deployed/status semantics, or name a producer that emits a channel count.',
    file: 'venture_artifacts (live data)'
  },
  {
    id: 'F-3', severity: 'HIGH', scenario: 'TS-5 / FR-5',
    title: 'CROSS_STAGE_DEPS in contract-validator.js is function-local and unexported -- TS-5 not executable by import',
    detail: 'lib/eva/contract-validator.js:132 declares const CROSS_STAGE_DEPS INSIDE validateContracts(). Only validateSchemaShape, validateContracts and getVentureProgression are exported, so TS-5 cannot import it. Separately, FR-5 AC#1 offers imports-from-stage-contracts OR the-two-are-asserted-equal: that is a false choice. The maps disagree on roughly 24 of 27 stages today (validator carries entries only for 3,5,8,9,13,16,22,25 and falls back to [N-1] for everything else; of those 8, six differ -- stage 8 is [1,2,3,4,5,6,7] vs canonical [1,4,5,6,7], stage 22 is [17,18,19,20,21] vs [10,11,17], stage 25 is [22,23,24] vs [23,24]). An assert-only test is permanently red. The import refactor is mandatory, not optional.',
    file: 'lib/eva/contract-validator.js:132'
  },
  {
    id: 'F-4', severity: 'MEDIUM', scenario: 'TS-5',
    title: 'TS-5 stage range 1-27 exceeds the canonical map domain',
    detail: 'stage-contracts.js CROSS_STAGE_DEPS spans keys 1..26 (with 1:[0]). Stage 27 is undefined in canonical while contract-validator would resolve [26]. The test needs an explicit domain decision (1-26) or it fails on an out-of-range key.',
    file: 'lib/eva/contracts/stage-contracts.js:575-628'
  },
  {
    id: 'F-5', severity: 'HIGH', scenario: 'TS-1 / TS-2 / TS-6 / FR-7',
    title: 'No dry-mode path and no CLI exist for the stage-24 evaluation',
    detail: 'analyzeStage23LaunchReadiness(params) accepts only stage20Data, stage21Data, stage22Data, ventureName, supabase, ventureId, logger -- there is no dryRun or dryMode flag. No script under scripts/ evaluates stage-24 launch readiness for a single venture. FR-7 AC#1 requires a dry-mode run of AltifyAI stage-24 evaluation captured with command and output: that command must be BUILT by EXEC. Mitigating: the analyzer only write is emitStageSkippedEvent (an eva_orchestration_events insert) and only on preflight failure; AltifyAI preflight passes because all three upstream types are present, so a direct call behind a read-only supabase wrapper is a safe dry mode. Recommend a small scripts/eval-stage-24-readiness.mjs --venture <id> --dry rather than adding a dryRun param to the analyzer.',
    file: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js:190'
  },
  {
    id: 'F-6', severity: 'MEDIUM', scenario: 'TS-4 / FR-4',
    title: 'No producer-registry discriminator exists -- TS-4 cannot be written until its shape is decided',
    detail: 'routeGateOutcome() receives only reasons, fromStage, toStage and mints the chairman_decisions row at lib/eva/gate-failure-recovery.js:230. Nothing in the codebase currently answers does-this-artifact_type-have-zero-automatic-producers, which is FR-4 entire discriminator. Reason codes originate at lib/eva/reality-gates.js:382 (REASON_CODES.ARTIFACT_MISSING) and carry artifact_type but no producer metadata. EXEC must add the producer lookup before TS-4 is writable.',
    file: 'lib/eva/gate-failure-recovery.js:216-230'
  },
  {
    id: 'F-7', severity: 'LOW', scenario: 'TS-4',
    title: 'Assertion template for TS-4 already exists -- reuse it',
    detail: 'tests/unit/eva/gate-failure-recovery.test.js:223-226 already builds a per-table mock of the shape { chairman_decisions: { insert: vi.fn() } }. TS-4 no-new-chairman_decisions-row half is expect(insertFn).not.toHaveBeenCalled(); the harness_backlog half is a second table spy asserting category equals harness_backlog. No new test infrastructure is needed.',
    file: 'tests/unit/eva/gate-failure-recovery.test.js:223'
  },
  {
    id: 'F-8', severity: 'MEDIUM', scenario: 'TS-3 / TS-6 / TS-7',
    title: 'skipIf(!HAS_REAL_DB) is the concrete vacuous-pass mechanism',
    detail: 'tests/integration/legal-doc-producer-activation.test.js uses describe.skipIf(!HAS_REAL_DB): it SILENTLY SKIPS without real credentials and reports green. Any TS-3/TS-6/TS-7 test built on that template inherits the same silent skip. EXEC must confirm the CI job carries DB credentials, or these scenarios are worthless as gates. Separately TS-7 must assert the row was FOUND (expect(row).toBeTruthy()) before asserting toContain(launch_usage_signal): a null from an errored select is not absence, and an optional-chained assertion would pass on a read failure.',
    file: 'tests/integration/legal-doc-producer-activation.test.js:43'
  },
  {
    id: 'F-9', severity: 'MEDIUM', scenario: 'TS-7 / FR-3',
    title: 'TS-7 guards the data row only -- FR-3 forbids more than that',
    detail: 'Confirmed live: venture_stages is a GLOBAL stage-definition table with no venture_id column, and the stage_number=24 row has required_artifacts = [launch_readiness_checklist, launch_usage_signal]. TS-7 single-row assertion is sound but under-scoped: FR-3 AC also forbids any stage-25-entry-condition mechanism. Code implementing such a mechanism would leave required_artifacts untouched and TS-7 would still pass. Add a static/grep guard that no stage-25-entry-condition code path shipped, otherwise TS-7 is a partial guard presented as a complete one.',
    file: 'venture_stages stage_number=24 (live)'
  },
  {
    id: 'F-10', severity: 'LOW', scenario: 'TS-6',
    title: 'TS-6 is the highest-value scenario -- make it mandatory and extend the existing mock',
    detail: 'TS-6 is the only anti-false-READY guard: it is what stops FR-1 laundering a genuine failure into READY. tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js already provides buildMockSupabase with a legalDocsPresent toggle. Caveat: that mock returns rows carrying only lifecycle_stage, artifact_type, is_current; once FR-1 widens the select per F-1, the mock must gain artifact_data or TS-6 will silently exercise the OLD shape and pass.',
    file: 'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js:41'
  },
  {
    id: 'F-11', severity: 'MEDIUM', scenario: 'FR-6 (no scenario)',
    title: 'No test scenario covers FR-6 -- recommend adding TS-8',
    detail: 'FR-6 divergence confirmed live: venture_stages[24].required_artifacts is [launch_readiness_checklist, launch_usage_signal] while stage_artifact_requirements id=159 lists only launch_readiness_checklist. No test scenario asserts the two tables agree, so FR-6 would ship unverified. Note that row 159 own description already declares it was synced from venture_stages.required_artifacts (SSOT), so FR-6 requirement to state which table is the source of truth has a documented in-row answer already.',
    file: 'stage_artifact_requirements id=159 (live)'
  },
  {
    id: 'F-12', severity: 'LOW', scenario: 'FR-1 AC#4',
    title: 'PRD line references are stale against the current file',
    detail: 'FR-1 AC#4 cites the analyzer stage-number map at stage-23-launch-readiness.js:16-26. Lines 16-26 of the current file are the SD-FDBK legal comment block and the FR-4 preflight comment, not a stage-number map; UPSTREAM_REQUIREMENTS sits near line 58. EXEC should locate targets by symbol, not by the PRD line numbers.',
    file: 'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js:16-26'
  },
  {
    id: 'F-13', severity: 'LOW', scenario: 'TS-1 / TS-2',
    title: 'Payload lives in artifact_data, not content',
    detail: 'Measured on AltifyAI: code_quality_report.artifact_data.verdict is WARN while its content column is a JSON STRING rather than a jsonb object; visual_device_screenshots.artifact_data.total_screenshots and visual_social_graphics.artifact_data.total_socials both exist, and BOTH visual rows have content = NULL. Any FR-1 read targeting content returns nothing. TS-1 and TS-2 fixtures must be built on artifact_data.',
    file: 'venture_artifacts (live data)'
  }
];

const recommendations = [
  'PLAN: rescope FR-1 from "repoint the reads" to "widen preflightUpstream to carry artifact_data and return a Map" -- the current wording understates the change (F-1).',
  'PLAN: resolve FR-1 AC#3 before EXEC starts -- no distribution artifact carries a channel count; pick presence/deployed semantics or name a new producer (F-2).',
  'PLAN: drop the "OR assert equal" branch of FR-5 AC#1; the import refactor is mandatory or TS-5 is permanently red (F-3). Fix the TS-5 domain to stages 1-26 (F-4).',
  'PLAN: add TS-8 covering FR-6 table agreement -- FR-6 currently ships with zero test coverage (F-11).',
  'EXEC: build scripts/eval-stage-24-readiness.mjs --venture <id> --dry FIRST; TS-1, TS-2, TS-6 and FR-7 AC#1 all depend on a command that does not exist yet (F-5).',
  'EXEC: decide the producer-registry discriminator shape before writing TS-4 (F-6); reuse the mock-spy template at gate-failure-recovery.test.js:223 (F-7).',
  'EXEC: extend buildMockSupabase with artifact_data when FR-1 lands, or TS-6 will exercise the stale shape and pass (F-10).',
  'EXEC: verify CI carries DB credentials for any skipIf(!HAS_REAL_DB) test, and make TS-7 assert row-found before row-contains (F-8).',
  'EXEC: broaden TS-7 with a static guard against any stage-25-entry-condition code path (F-9).'
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  findings,
  message: 'Prospective testability review of PRD test_scenarios TS-1..TS-7 for SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001. 4 of 7 scenarios executable as written; TS-2 rests on a false data premise, TS-5 is not executable (its target map is function-local and unexported), TS-1 requires a mechanism change FR-1 does not describe. No dry-mode path or CLI exists for the stage-24 evaluation that TS-1/TS-2/TS-6 and FR-7 AC#1 all require.',
  metadata: {
    validation_mode: 'prospective',
    // Prospective review runs BEFORE EXEC writes code: there is genuinely nothing to
    // measure yet. Declared honestly per the testing-verdict-guard exemption rather than
    // fabricating a measured run.
    measured: false,
    test_execution: buildTestExecution({
      executed: 0, passed: 0, failed: 0, skipped: 0,
      runner: 'none-prospective-review',
      source: 'prospective_testability_assessment'
    }),
    sd_type: 'infrastructure',
    e2e_required: false,
    github_required: false,
    scenarios_assessed: 7,
    scenarios_executable_as_written: 4,
    scenarios_blocked: ['TS-2', 'TS-5'],
    scenarios_needing_rescope: ['TS-1', 'TS-7'],
    scenarios_ready: ['TS-3', 'TS-4', 'TS-6'],
    frs_without_scenario_coverage: ['FR-6'],
    dry_mode_exists: false,
    dry_mode_cli_exists: false,
    altify_venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
    altify_current_lifecycle_stage: 24,
    reusable_test_harnesses: [
      'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js (buildMockSupabase, legalDocsPresent toggle) -> TS-1, TS-2, TS-6',
      'tests/integration/legal-doc-producer-activation.test.js (real-DB fixture venture via insertGuarded/CLASSIFICATION) -> TS-3',
      'tests/unit/eva/gate-failure-recovery.test.js:223 (per-table insert spy) -> TS-4',
      'tests/unit/eva/contract-validator-shape.test.js + tests/unit/eva/stage-contracts.test.js -> TS-5'
    ],
    recommendations,
    evidence_method: 'static read of target modules plus live read-only queries against venture_artifacts, venture_stages, stage_artifact_requirements and product_requirements_v2; no writes to venture state'
  }
};

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sdRow } = await sb.from('strategic_directives_v2')
  .select('target_application').eq('sd_key', SD).maybeSingle();

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  subAgentCode: 'TESTING',
  targetApplication: sdRow?.target_application
});
applySubAgentRepoVerdict(results, resolution);

await storeSubAgentResults('TESTING', SD, { name: 'QA Engineering Director' }, results, {
  phase: 'PLAN',
  sdKey: SD
});

console.log('FINAL VERDICT:', results.verdict);
console.log('repo_path:', results.metadata.repo_path);
console.log('findings:', findings.length, '| recommendations:', recommendations.length);
