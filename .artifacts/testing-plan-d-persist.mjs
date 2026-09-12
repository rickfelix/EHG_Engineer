import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution, isMeasuredExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD_UUID = '3f128d5c-8168-4415-86cc-ab5da4663d11';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D';
const SESSION_ID = '85c82b18-0984-4948-bd86-1992cdf5170d';
const COMMIT = 'daf75d6dfd76de465642187810c460ac767f4680';
const SCRATCH = 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/85c82b18-0984-4948-bd86-1992cdf5170d/scratchpad';
const ARTIFACT = SCRATCH + '/testing-plan-d-baseline.json';
const REPORT = SCRATCH + '/testing-plan-d-report.md';

// Runner-written artifact -> hash it. Every number below is read from it, never hand-written.
const artifactBuf = fs.readFileSync(ARTIFACT);
const artifactSha = crypto.createHash('sha256').update(artifactBuf).digest('hex');
const j = JSON.parse(artifactBuf.toString('utf8'));
const contentHash = crypto.createHash('sha256').update(fs.readFileSync(REPORT)).digest('hex');

const test_execution = buildTestExecution({
  executed: j.numTotalTests,
  passed: j.numPassedTests,
  failed: j.numFailedTests,
  skipped: j.numPendingTests || 0,
  artifactSha,
  runner: 'vitest 4.1.4 --project unit --reporter=json (win32-x64, node v24.12.0)',
  artifactPath: ARTIFACT,
  source: 'fresh'
});
if (!isMeasuredExecution(test_execution)) throw new Error('test_execution not measured - refusing to write');

const acceptance_criteria_coverage = {
  criteria_total: 8, criteria_covered: 5, criteria_partial: 2, criteria_uncovered: 1,
  fr_total: 10, fr_covered: 6, fr_partial: 3, fr_uncovered: 1,
  scenarios_total: 15,
  by_ac: [
    { ac: 'AC-1 feeder harness contract', scenarios: ['TS-1', 'TS-2', 'TS-3', 'TS-4'], status: 'covered', note: 'main() exit-code mapping uncovered (G-5)' },
    { ac: 'AC-2 gmail record-then-act bounded', scenarios: ['TS-5', 'TS-6', 'TS-7'], status: 'covered', note: 'bodies-never-fetched has no TS id (G-6)' },
    { ac: 'AC-3 GHA refusal via getAuthenticatedClient', scenarios: ['TS-11'], status: 'partial', note: 'never-reads-a-credential-itself uncovered (G-7)' },
    { ac: 'AC-4 todoist auto_apply + workflow secrets + DST crons', scenarios: ['TS-10', 'TS-12'], status: 'covered' },
    { ac: 'AC-5 assembleReadiness exported for child E', scenarios: ['TS-3'], status: 'covered', note: 'add explicit named-export assertion (G-8)' },
    { ac: 'AC-6 host registrar three tasks + OS-XML verify + measured unelevated /Create', scenarios: ['TS-13'], status: 'partial', note: 'CLI branches and the manual PowerShell measurement uncovered (G-4)' },
    { ac: 'AC-7 classify-apply provenance', scenarios: ['TS-14'], status: 'covered' },
    { ac: 'AC-8 no database/ change; EXEC SECURITY+TESTING rows', scenarios: [], status: 'uncovered', note: 'G-3 - no scenario, no automated check' }
  ],
  by_fr: [
    { fr: 'FR-1', scenarios: ['TS-1', 'TS-2', 'TS-3', 'TS-4'], status: 'covered' },
    { fr: 'FR-2', scenarios: [], status: 'uncovered', note: 'G-1 largest gap: google-clients.test.js, constants.test.js and the gmail-client.test.js extension serve an FR with zero scenarios' },
    { fr: 'FR-3', scenarios: ['TS-8', 'TS-11', 'TS-1'], status: 'partial', note: 'natural key and single-calendar-degraded legs unscenarioed' },
    { fr: 'FR-4', scenarios: ['TS-7'], status: 'partial', note: 'APPLY_NOT_LANDED refusal and source-level no-modify assertion unscenarioed' },
    { fr: 'FR-5', scenarios: ['TS-5', 'TS-6'], status: 'covered' },
    { fr: 'FR-6', scenarios: ['TS-9', 'TS-11'], status: 'covered' },
    { fr: 'FR-7', scenarios: ['TS-10', 'TS-12'], status: 'covered' },
    { fr: 'FR-8', scenarios: ['TS-13'], status: 'partial', note: 'G-4' },
    { fr: 'FR-9', scenarios: ['TS-14'], status: 'partial', note: 'G-2 queue-read has no scenario' },
    { fr: 'FR-10', scenarios: [], status: 'uncovered', note: 'G-3' }
  ],
  gaps: [
    'G-1 FR-2 unscenarioed (3 planned test files)',
    'G-2 queue-read unscenarioed',
    'G-3 AC-8/FR-10 no automated check',
    'G-4 FR-8 CLI branches + manual schtasks measurement',
    'G-5 main() exit-code mapping / gracefulExit',
    'G-6 bodies-never-fetched has no TS id',
    'G-7 never-reads-a-credential negative source assertion',
    'G-8 assembleReadiness named-export assertion for child E'
  ]
};

const exec_test_checklist = [
  "1. Correct FR-1's '62 existing tests' claim to the measured 11 tests / 26 assertions in scripts/michael-quiet-tick.test.js.",
  '2. Keep inWindow INCLUSIVE when moving it to lib/michael/feeder.mjs; give runFeeder its own half-open gate. FR-1(b) half-open contradicts the helper at scripts/michael-quiet-tick.mjs:42 and would break the tick test at line 29 (07:30 === true).',
  '3. Fix SD smoke step 4: split the && (a parser error in Windows PowerShell 5.1, the only shell on this host) and add -E to the credential grep (BRE alternation is a literal - measured inert on a control where both tokens were present). Fix step 2 expected outcome to include /RU and /NP.',
  '4. Settle the wiring-test path on tests/unit/cron/michael-todoist-brief-wiring.test.js; SD smoke step 1 names a different path and a zero-match vitest filter exits 1.',
  '5. Every test file uses .test.js - a .test.mjs outside tests/unit/org/ and tests/unit/venture-email/ is silently uncollected by the unit project.',
  '6. Pass an explicit env object in EVERY test; never rely on process.env. assertHostVenue refuses on CI===true, which unit-tier.yml always sets in GitHub Actions, so happy-path scenarios TS-3/5/8/9 would diverge CI-vs-local.',
  '7. Lazy-import createTodoistClient inside the private main(); lib/integrations/todoist/todoist-sync.js calls dotenv.config() at module scope and would repopulate TODOIST_API_TOKEN into the unit tier.',
  '8. Mirror, do not reuse, buildCreateArgs: scripts/setup-alarm-cron-tasks.mjs:125 emits no /RU or /NP, and editing it in place breaks the 24 green tests in tests/unit/fleet/setup-alarm-cron-tasks.test.js. Take runAs as an explicit parameter; assert a fixed literal, never DEFAULT_RUN_AS (which reads process.env.USERNAME at module load).',
  "9. Write status='skipped' with counts.phase='started' on start. michael_feeder_runs has no 'running' status, and status='failed' on start would inflate the chairman-facing QUIET_TICK_FEEDER_FAILED gauge (scripts/michael-quiet-tick.mjs:112,152) for every in-flight run.",
  '10. Inject now into every temporal assertion (window edges, the 10-minute staleness edge, the 05:45 cutover, the 36h Drive staleness, the 7-day Todoist dedupe); assert both sides of each boundary.',
  '11. The 23505 stub fails exactly once; assert the insert call count is exactly 2 and attempt is max+1. Add a fail-twice exhaustion case.',
  '12. The ceiling test counts modifyThread INVOCATIONS (exactly 60), never rows with action_taken_at set.',
  '13. PII test injects a capturing logger with seeded address, subject and content literals; assert their absence and the counts/ids presence, across log_md and counts as well as stdout.',
  '14. Wiring test uses the positive exact-set assertion for {SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TODOIST_API_TOKEN}; drop TODOIST from the precedent negative regex at tests/unit/cron/michael-retention-wiring.test.js:20 and keep GOOGLE|OAUTH|ENCRYPTION|CLIENT_SECRET|REFRESH_TOKEN.',
  '15. TS-15 asserts reason in {outside_et_window, tables_absent}, exit 0, and that no API factory was constructed. Do not pin a single reason literal.',
  '16. Close G-1: add google-clients.test.js, constants.test.js and the gmail-client.test.js metadata-only extension (argument mapping, rejecting factory, import-time purity, CONSTANT_MISSING by name, ceiling default 60).',
  '17. Close G-2: queue-read.test.js with the literal limit, class-null / effort_grade-null selection for the ET date, and tables_absent yielding empty lists at exit 0.',
  '18. Close G-3: git diff --stat shows no file under database/migrations/ or database/chairman-gated/; SECURITY and TESTING EXEC rows exist with provenance before EXEC-TO-PLAN.',
  '19. Close G-4: cover --status, --remove, --verify, the missing run-hidden.vbs refusal and the non-win32 exit-2 guard. Measure the unelevated schtasks /Create FROM POWERSHELL (never Git Bash, which mangles flags and reads as zero tasks) and paste the transcript line in the PR body.',
  '20. Close G-5..G-8: main() exit-code mapping and gracefulExit; a TS id for bodies-never-fetched; negative source assertions that no feeder reads readHostKey/getStoredTokens/MICHAEL_ENCRYPTION_KEY; an explicit assembleReadiness named-export assertion for child E.',
  "21. Fixtures use michael_rules.status='active' (not {active:true}); any ON CONFLICT (domain, rule_key) repeats the WHERE status='active' partial-index predicate.",
  '22. Reclassify TS-15 test_type from e2e to smoke - it is a CLI process smoke, not a browser test.',
  '23. Regression floor: all 159 baseline tests stay green; re-run the baseline command at EXEC and record measured counts.'
];

let results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  summary: 'PLAN test-strategy review for child D. Collection verified empirically for all 12 planned test files (13/13 probes collected by the vitest unit project; none excluded by tests/collection-contract.json or tests/quarantine-manifest.json). Measured baseline: 12 files, 159 tests, 159 passed, 0 failed, 0 skipped, exit 0. Three blocking plan defects and eight named coverage gaps. E2E/Playwright does not apply - the child ships no UI surface.',
  conditions: [
    { action: "Correct FR-1's '62 existing tests' claim to the measured 11 tests / 26 assertions", priority: 'high', blocking: true },
    { action: 'Resolve the FR-1(a)/FR-1(b) window-semantics collision: inWindow is inclusive of the end and the tick test pins 07:30 === true, but FR-1(b) demands a half-open window', priority: 'high', blocking: true },
    { action: 'Repair SD smoke step 4: the && does not parse in Windows PowerShell 5.1 and the BRE alternation makes the credential guard structurally incapable of matching', priority: 'high', blocking: true },
    { action: 'Close G-1: FR-2 has zero test scenarios while owning three planned test files', priority: 'high', blocking: false },
    { action: 'Close G-2, G-3 and G-4: queue-read, the no-database-diff check, and FR-8 CLI branches plus the manual PowerShell schtasks measurement', priority: 'medium', blocking: false },
    { action: 'Settle the three-way wiring-test path naming discrepancy between the SD smoke step, the FR-7 acceptance criterion and the assignment', priority: 'medium', blocking: false }
  ],
  justification: 'CONDITIONAL_PASS: the 15 scenarios cover every high-risk leg and all 12 planned test files are collected by the vitest unit project (measured, 13 of 13 probes), with a green 159-test baseline as the regression floor. Three plan defects are blocking because each would make EXEC write a test that is wrong, dead, or self-contradictory: a test count that does not exist, a window-boundary requirement that contradicts the helper it reuses, and a smoke guard that cannot match. The eight coverage gaps are each assignable to an already-planned test file, so none requires new test infrastructure.',
  findings: [
    { severity: 'high', type: 'plan_defect', title: 'FR-1 cites 62 quiet-tick tests; the measured count is 11 tests / 26 assertions' },
    { severity: 'high', type: 'plan_defect', title: 'FR-1(b) half-open window contradicts the inclusive inWindow at scripts/michael-quiet-tick.mjs:42 that FR-1(a) tells EXEC to move; the tick test pins 07:30 === true' },
    { severity: 'high', type: 'dead_guard', title: 'SD smoke step 4: BRE alternation is literal (measured inert on a control where both tokens were present) and && is a parser error in Windows PowerShell 5.1.26100.9278 (pwsh absent)' },
    { severity: 'high', type: 'coverage_gap', title: 'G-1: FR-2 has zero test scenarios while owning google-clients.test.js, constants.test.js and the gmail-client.test.js extension' },
    { severity: 'high', type: 'ci_divergence', title: 'assertHostVenue refuses on CI===true, always set by unit-tier.yml in GitHub Actions; happy-path scenarios TS-3/5/8/9 must inject env explicitly or diverge CI-vs-local' },
    { severity: 'high', type: 'chairman_facing', title: "michael_feeder_runs.status has no 'running' value; a start-write of status='failed' would inflate QUIET_TICK_FEEDER_FAILED, which reaches the chairman via the 6am SMS" },
    { severity: 'medium', type: 'test_collision', title: 'scripts/setup-alarm-cron-tasks.mjs buildCreateArgs emits no /RU or /NP; reusing it fails TS-13, editing it in place breaks 24 green tests' },
    { severity: 'medium', type: 'env_leak', title: 'lib/integrations/todoist/todoist-sync.js calls dotenv.config() at module scope and createTodoistClient throws on a missing TODOIST_API_TOKEN, which the unit tier env block does not fence' },
    { severity: 'medium', type: 'coverage_gap', title: 'G-2 queue-read, G-3 AC-8/FR-10 with no automated check, G-4 FR-8 CLI branches plus the manual schtasks measurement, and G-5 through G-8' },
    { severity: 'low', type: 'naming', title: 'The wiring test has three different paths across the SD smoke step, the FR-7 acceptance criterion and the assignment' },
    { severity: 'low', type: 'classification', title: 'TS-15 is labelled test_type e2e but is a CLI process smoke; no UI exists so Playwright does not apply' }
  ],
  recommendations: exec_test_checklist,
  metadata: {
    session_id: SESSION_ID,
    evaluated_commit_sha: COMMIT,
    content_hash: contentHash,
    report_path: REPORT,
    phase_reviewed: 'PLAN',
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D',
    sd_key: SD_KEY,
    test_execution,
    acceptance_criteria_coverage,
    exec_test_checklist,
    collection_verification: {
      method: 'one-assertion probe file written at each planned path, npx vitest list --project unit, probes then removed and the tree verified restored',
      probes_written: 13,
      probes_collected_by_unit_project: 13,
      excluded_by_collection_contract: 0,
      excluded_by_quarantine_manifest: 0,
      collection_contract_patterns: 21,
      quarantine_entries: 150,
      quarantine_entries_matching_michael: 0,
      note: '**/.worktrees/** in the collection contract is inert because the vitest root IS the worktree; after merge the suites run from the repo root in unit-tier.yml where it is equally inert. Only .test.js collects - a .test.mjs outside tests/unit/org and tests/unit/venture-email is silently uncollected.'
    },
    baseline_per_file: {
      'scripts/michael-quiet-tick.test.js': 11,
      'lib/michael/db.test.js': 11,
      'lib/michael/gmail-client.test.js': 3,
      'lib/michael/rules.test.js': 21,
      'scripts/michael/act.test.js': 14,
      'scripts/michael/autonomy-read.test.js': 18,
      'scripts/michael/google-consent.test.js': 5,
      'scripts/michael/retention.test.js': 7,
      'scripts/michael/verbs.test.js': 18,
      'scripts/__tests__/eva-host-and-arm.test.js': 23,
      'tests/unit/cron/michael-retention-wiring.test.js': 4,
      'tests/unit/fleet/setup-alarm-cron-tasks.test.js': 24
    },
    e2e_applicability: {
      applies: false,
      reason: 'No UI surface. PRD ui_ux_requirements is an empty array; deliverables are lib modules, Node CLI scripts, one GitHub Actions workflow and a Windows Task Scheduler registrar. No route, component or page. TS-15 is a CLI process smoke mislabelled test_type=e2e.'
    },
    schema_conformance: {
      verified_against: 'database/migrations/20260906_michael_tables.sql at ' + COMMIT,
      all_written_columns_exist: true,
      hazards: [
        "michael_feeder_runs.status CHECK has no 'running' value - the start-write literal is unspecified in FR-1 and the wrong choice is chairman-facing",
        "michael_rules marks activity with status='active', not an active boolean; the active unique index is PARTIAL so ON CONFLICT must repeat WHERE status='active'"
      ]
    },
    powershell_safety: {
      host_powershell: '5.1.26100.9278',
      pwsh_present: false,
      steps_safe: [1, 2, 3],
      steps_unsafe: [4],
      step4_defects: [
        '&& is a parser error in Windows PowerShell 5.1',
        'grep BRE alternation is treated as a literal so the credential guard cannot match'
      ],
      grep_resolves_from_powershell: true
    }
  }
};

const resolution = await resolveSubAgentRepo({ sdId: SD_UUID, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING' });
results = applySubAgentRepoVerdict(results, resolution);
console.log('repo_path=', results.metadata.repo_path);
console.log('executed_from_cwd=', results.metadata.executed_from_cwd);
console.log('repo_resolved=', results.metadata.repo_resolved, 'registry_source=', results.metadata.registry_source);
console.log('verdict_after_writer=', results.verdict);
console.log('test_execution=', JSON.stringify(test_execution));

const stored = await storeSubAgentResults(
  'TESTING',
  SD_UUID,
  { id: null, name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { phase: 'PLAN', sdKey: SD_KEY, source: 'sub_agent_executor' }
);
console.log('STORED=', JSON.stringify(stored));
