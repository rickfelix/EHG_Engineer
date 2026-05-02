require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-FDBK-ENH-LEARN-AUTO-APPROVE-001';
const SD_UUID = '0531815c-ac79-44b3-86d2-b6a21f642d3f';
const PRD_ID = `PRD-${SD_KEY}`;

const prd = {
  id: PRD_ID,
  sd_id: SD_UUID,
  title: 'PRD: /learn auto-approve scorer noise filter (alert-path coverage + 3 new vectors)',
  status: 'planning',
  phase: 'PLAN_PRD',
  document_type: 'prd',
  executive_summary: [
    'SD-LEO-INFRA-LEARN-NOISE-FILTER-001 (commit a7be966556) shipped FR-6/7/8 noise filters in scripts/modules/learning/filter.mjs, but only wired them through scripts/modules/learning/context-builder.js (the /learn auto-approve command path).',
    'A parallel SD-creation path — scripts/pattern-alert-sd-creator.js — also auto-creates SDs from issue_patterns and never imports filterPatternsForLearning. As a result, six identical noise SDs (LEARN-130/131/133/136/139 + PAT-RETRO-005) shipped and were cancelled within 7 days.',
    'This PRD wires the alert path through filterPatternsForLearning AND extends the filter chain with three additional checks targeting the four documented noise vectors: (a) closed-source single-SD, (b) empty proven_solutions, (c) null related_sub_agents, (d) cross-source fingerprint duplicate. A LEARN-139 fixture replay golden test prevents regression.',
    'Estimated change size: <=200 LOC source + <=150 LOC tests across 2 source files + 1 test file. No schema changes. No UI changes.'
  ].join('\n\n'),
  goal_summary: 'Eliminate the LEARN-130/131/133/136/139 + PAT-RETRO-005 cancellation pattern by closing the alert-path gap and extending the filter chain to cover all four documented noise vectors. Target: 0 false-positive auto-approve cancellations attributable to vectors a/b/c/d in the 14 days post-merge.',
  exploration_summary: [
    'Read 6 files in scripts/modules/learning/ (filter.mjs, context-builder.js, index.js, reviewer.js, session-retrospective.js, README.md) and scripts/pattern-alert-sd-creator.js.',
    'filter.mjs:92-150 implements three filters wired in filterPatternsForLearning at line 158: checkSingleSDClosedSource (FR-6), checkSingleSDStaleOpenSource (FR-7), checkSessionRetroRequiresMultiSD (FR-8). FR-8 only fires for category=session_retrospective, leaving handoff_failure category uncovered.',
    'context-builder.js:443-471 calls filterPatternsForLearning before scoring. This is the covered path.',
    'pattern-alert-sd-creator.js:110-143 (getAlertablePatterns) queries issue_patterns directly with severity/trend thresholds and never imports filterPatternsForLearning. This is the uncovered regression vector.',
    'PAT-HF-PLANTOEXEC-211b3c47 + PAT-RETRO-PLANTOEXEC-211b3c47 share fingerprint stem 211b3c47 across two pattern rows because dedup is scoped by category/source — same incident counted twice.',
    'feedback row 7b469f0a status=resolved with no resolution_sd_id — premature; no FK back to the prior fix.',
    'Validation-agent confirmed zero orphan rows in issue_patterns linking to cancelled SDs (LEARN-131/133/136), so sibling-cleanup is OUT OF SCOPE per scope_amendment.'
  ].join('\n'),
  functional_requirements: [
    {
      id: 'FR-1',
      priority: 'CRITICAL',
      status: 'PENDING',
      requirement: 'Wire pattern-alert-sd-creator.js through filterPatternsForLearning',
      description: 'In scripts/pattern-alert-sd-creator.js, import filterPatternsForLearning and the source-SD-status helpers from scripts/modules/learning/filter.mjs. In getAlertablePatterns() (line 110), apply the filter chain BEFORE the existing severity/trend threshold filter (line 125) so noise patterns are suppressed regardless of severity. Mirror the wiring pattern at scripts/modules/learning/context-builder.js:443-471.',
      acceptance_criteria: [
        'pattern-alert-sd-creator.js imports filterPatternsForLearning, fetchPatternSourceSDStatuses, and fetchAssignedSdStatuses from filter.mjs.',
        'getAlertablePatterns() invokes the filter chain on the patterns array before line 125 severity/trend thresholding.',
        'A unit test confirms patterns failing the filter chain are dropped before threshold checks.'
      ]
    },
    {
      id: 'FR-2',
      priority: 'CRITICAL',
      status: 'PENDING',
      requirement: 'Add checkEmptyProvenSolutions filter to filter.mjs',
      description: 'Add a new helper that rejects a pattern when proven_solutions is an empty array AND related_sub_agents is null/empty AND occurrence_count < N (default 3, env-overridable via LEO_LEARN_NOISE_MIN_OCCURRENCE). Insert into filterPatternsForLearning chain at line 192-194 alongside the existing FR-6/7/8 checks.',
      acceptance_criteria: [
        'New helper checkEmptyProvenSolutions added to filter.mjs with JSDoc and dependency-injectable threshold.',
        'Threshold reads process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE (parsed as int, default 3).',
        'Helper is invoked inside filterPatternsForLearning along the same OR chain as FR-6/7/8.',
        'Unit test: pattern with proven_solutions=[], related_sub_agents=null, occurrence_count=2 is rejected.',
        'Unit test: pattern with proven_solutions.length>=1 is admitted regardless of occurrence_count.'
      ]
    },
    {
      id: 'FR-3',
      priority: 'CRITICAL',
      status: 'PENDING',
      requirement: 'Extend session_retro multi-SD requirement to handoff_failure category',
      description: 'Either rename checkSessionRetroRequiresMultiSD to a generic checkRetroLikeRequiresMultiSD or add a sibling checkHandoffFailureRequiresMultiSD. Both paths must reject single-SD patterns whose category is in {session_retrospective, handoff_failure}. Wire the new check into filterPatternsForLearning.',
      acceptance_criteria: [
        'Filter chain rejects category=handoff_failure patterns where first_seen_sd_id == last_seen_sd_id.',
        'Existing session_retrospective behaviour preserved (regression test passes).',
        'Unit test for handoff_failure single-SD rejection.'
      ]
    },
    {
      id: 'FR-4',
      priority: 'HIGH',
      status: 'PENDING',
      requirement: 'Add intra-batch canonical-fingerprint-stem dedup pass',
      description: 'Add a pre-pass in filterPatternsForLearning that groups patterns sharing the leading 8-char stem of their fingerprint AND the same first_seen_sd_id. Keep the first occurrence (stable: by occurrence_count desc, then id asc); drop the rest. This collapses cross-source duplicates like PAT-HF-PLANTOEXEC-211b3c47 + PAT-RETRO-PLANTOEXEC-211b3c47.',
      acceptance_criteria: [
        'New helper extractFingerprintStem(pattern) returns the first 8 chars of the canonical fingerprint.',
        'Dedup pre-pass runs BEFORE the per-pattern filter chain.',
        'Unit test: 2 patterns with stem=211b3c47 + same first_seen_sd_id collapse to 1.',
        'Unit test: 2 patterns with same stem but different first_seen_sd_id are both retained.'
      ]
    },
    {
      id: 'FR-5',
      priority: 'HIGH',
      status: 'PENDING',
      requirement: 'Emit structured suppression reason on each rejected pattern',
      description: 'When filterPatternsForLearning suppresses a pattern, emit a structured stdout JSON line: {event: "learn.filter.suppressed", pattern_id, reason: "fr6|fr7|fr8|empty_proven|handoff_failure_single_sd|fingerprint_stem_dup", details: {...}}. This gives the inbox/learn dashboard a stable signal for displaying suppression reasons.',
      acceptance_criteria: [
        'Each suppression emits exactly one JSON line on stdout.',
        'Reason field uses the enumerated values above.',
        'Unit test asserts JSON shape for each suppression vector.'
      ]
    },
    {
      id: 'FR-6',
      priority: 'CRITICAL',
      status: 'PENDING',
      requirement: 'LEARN-139 bundle replay golden test',
      description: 'Build tests/fixtures/learn-139-bundle.json containing the 5 patterns from the LEARN-139 cancellation: 2 closed-source single-SD patterns, 2 patterns with empty proven_solutions, 1 cross-source fingerprint duplicate. Add a vitest case at tests/learn/filter-single-sd-noise.test.js that feeds the bundle through filterPatternsForLearning + the alert-path call site and asserts: 0 patterns admitted, 5 suppression JSON lines emitted with the expected reasons.',
      acceptance_criteria: [
        'tests/fixtures/learn-139-bundle.json exists with 5 representative patterns.',
        'Golden test in tests/learn/filter-single-sd-noise.test.js asserts 5 in -> 0 out.',
        'Test asserts each of the 5 suppression reason codes appears exactly once.',
        'npm test -- learn/filter-single-sd-noise exits 0.'
      ]
    }
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'Reuse filterPatternsForLearning purity contract',
      description: 'filterPatternsForLearning must remain a pure function (no DB calls inside; status maps are passed in via options). pattern-alert-sd-creator.js must call fetchPatternSourceSDStatuses + fetchAssignedSdStatuses before invoking the filter, mirroring context-builder.js.',
      dependencies: ['scripts/modules/learning/filter.mjs (existing)', '@supabase/supabase-js (existing)']
    },
    {
      id: 'TR-2',
      requirement: 'Threshold configurability via environment variable',
      description: 'LEO_LEARN_NOISE_MIN_OCCURRENCE env var overrides the default occurrence_count threshold (3) for checkEmptyProvenSolutions. Parsed via Number.parseInt with fallback to 3 on NaN/missing.',
      dependencies: ['Node.js process.env']
    },
    {
      id: 'TR-3',
      requirement: 'No schema changes',
      description: 'No changes to issue_patterns, strategic_directives_v2, or feedback table schemas. All data is read via existing columns.',
      dependencies: []
    },
    {
      id: 'TR-4',
      requirement: 'Vitest test infrastructure',
      description: 'Tests live under tests/learn/. Use existing vitest setup. Fixtures stored as JSON under tests/fixtures/. No new test framework dependencies.',
      dependencies: ['vitest 3.x (existing)']
    }
  ],
  system_architecture: [
    '## Architecture Overview',
    '',
    'Two SD-creation paths exist in the codebase, both consuming issue_patterns:',
    '',
    '1. **Auto-approve path** (covered by SD-LEO-INFRA-LEARN-NOISE-FILTER-001):',
    '   - Entry: scripts/modules/learning/index.js (autoApproveCommand)',
    '   - Filters via scripts/modules/learning/context-builder.js:443-471 -> filterPatternsForLearning',
    '',
    '2. **Alert path** (UNCOVERED — this PRD wires it):',
    '   - Entry: scripts/pattern-alert-sd-creator.js (CLI / scheduled)',
    '   - Currently filters only by severity/trend thresholds (line 110-143)',
    '   - Will be wired through the same filterPatternsForLearning chain',
    '',
    '## Filter Chain (after this PRD)',
    '',
    'filterPatternsForLearning input -> intra-batch fingerprint-stem dedup (NEW FR-4) ->',
    'per-pattern OR chain: checkSingleSDClosedSource(FR-6) || checkSingleSDStaleOpenSource(FR-7) || checkSessionRetroRequiresMultiSD(FR-8 EXTENDED to handoff_failure, FR-3) || checkEmptyProvenSolutions(NEW FR-2) -> ',
    'admitted patterns | rejected patterns -> stdout structured log (NEW FR-5)',
    '',
    '## Data Flow',
    '',
    'issue_patterns (DB) -> [auto-approve path] context-builder.js -> filterPatternsForLearning -> /learn auto-approve',
    'issue_patterns (DB) -> [alert path] pattern-alert-sd-creator.js -> filterPatternsForLearning(NEW) -> threshold filter -> SD creation',
    '',
    '## Integration Points',
    '',
    '- scripts/pattern-alert-sd-creator.js (modified)',
    '- scripts/modules/learning/filter.mjs (extended)',
    '- tests/learn/filter-single-sd-noise.test.js (new)',
    '- tests/fixtures/learn-139-bundle.json (new)',
    '',
    '## Key Functions Exported for Testing',
    '',
    '- filterPatternsForLearning (existing, signature unchanged)',
    '- checkEmptyProvenSolutions (new, exported)',
    '- extractFingerprintStem (new, exported)',
    '- emitSuppressionLog (new, exported, accepts injectable writer for testability)'
  ].join('\n'),
  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'LEARN-139 bundle replay golden test',
      test_type: 'integration',
      description: 'Feed tests/fixtures/learn-139-bundle.json (5 patterns: 2 closed-source single-SD, 2 empty proven_solutions, 1 fingerprint-stem duplicate) through filterPatternsForLearning. Assert: result.admitted.length === 0, result.suppressed.length === 5, suppression reasons match expected enum values.',
      status: 'PENDING'
    },
    {
      id: 'TS-2',
      scenario: 'Alert-path filter wiring',
      test_type: 'integration',
      description: 'Stub issue_patterns DB response with a noise pattern that would pass severity threshold but fails FR-6. Run pattern-alert-sd-creator.js getAlertablePatterns(). Assert: pattern is dropped before reaching threshold filter; no SD creation triggered.',
      status: 'PENDING'
    },
    {
      id: 'TS-3',
      scenario: 'checkEmptyProvenSolutions threshold env override',
      test_type: 'unit',
      description: 'With LEO_LEARN_NOISE_MIN_OCCURRENCE=10, pattern with occurrence_count=8 + proven_solutions=[] is rejected. Without env (default 3), same pattern at occurrence_count=4 is admitted.',
      status: 'PENDING'
    },
    {
      id: 'TS-4',
      scenario: 'handoff_failure single-SD rejection (FR-3)',
      test_type: 'unit',
      description: 'Pattern with category=handoff_failure, first_seen_sd_id===last_seen_sd_id is rejected. Pattern with category=handoff_failure, first_seen_sd_id!==last_seen_sd_id is admitted.',
      status: 'PENDING'
    },
    {
      id: 'TS-5',
      scenario: 'Fingerprint-stem dedup positive + negative (FR-4)',
      test_type: 'unit',
      description: 'Two patterns with stem=211b3c47 + same first_seen_sd_id -> collapse to 1. Two patterns with stem=211b3c47 + different first_seen_sd_id -> both retained.',
      status: 'PENDING'
    },
    {
      id: 'TS-6',
      scenario: 'Suppression log JSON shape (FR-5)',
      test_type: 'unit',
      description: 'For each suppression vector (fr6, fr7, fr8, empty_proven, handoff_failure_single_sd, fingerprint_stem_dup), emitSuppressionLog produces a single-line JSON object with required fields. Assert via injectable writer.',
      status: 'PENDING'
    },
    {
      id: 'TS-7',
      scenario: 'Existing filter regression check',
      test_type: 'regression',
      description: 'Run existing tests/learning/filter.test.js (or equivalent). Assert: no failures introduced by new code paths.',
      status: 'PENDING'
    },
    {
      id: 'TS-8',
      scenario: 'Live dry-run smoke',
      test_type: 'smoke',
      description: 'Run /learn auto-approve --dry-run --max=50 against current pattern population. Assert stdout shows >=20 suppressions of single-SD-closed-source patterns AND at least 1 admitted multi-SD pattern with non-empty proven_solutions (no over-suppression).',
      status: 'PENDING'
    }
  ],
  acceptance_criteria: [
    'All 6 functional requirements (FR-1..FR-6) marked DONE with their acceptance criteria met.',
    'All 8 test scenarios (TS-1..TS-8) PASS.',
    'LEARN-139 fixture bundle: 5 patterns in -> 0 SDs out.',
    'No regressions on existing filter.mjs tests.',
    'Code change size <= 200 LOC source + 150 LOC tests.',
    'PR merged to main with green CI (test-coverage, contract-smoke, db-verify).',
    'Post-merge 14-day monitoring: 0 cancellations attributable to vectors a/b/c/d.'
  ],
  risks: [
    { risk: 'Overly strict filter suppresses legitimate single-SD patterns that genuinely need attention', impact: 'medium', likelihood: 'low', mitigation: 'Threshold via env var (LEO_LEARN_NOISE_MIN_OCCURRENCE=3 default); structured suppression log lets us audit suppressed patterns and tune threshold post-merge.' },
    { risk: 'pattern-alert-sd-creator.js has additional callers not yet identified', impact: 'low', likelihood: 'low', mitigation: 'Filter wiring is at getAlertablePatterns() — single chokepoint; validation-agent confirmed only one entry point. Grep for other callers as part of EXEC pre-flight.' },
    { risk: 'Fingerprint-stem dedup collapses two distinct incidents that happen to share stem + SD by coincidence', impact: 'low', likelihood: 'very low', mitigation: '8-char stem provides 4 billion-way namespace; collision on the same first_seen_sd_id is extremely unlikely. Suppression log captures details for audit.' }
  ],
  integration_operationalization: {
    consumers: [
      'Operators running /learn auto-approve will see fewer false-positive SDs created.',
      'Operators running scheduled pattern-alert-sd-creator (cron / GitHub Action) will see matching suppression in stdout JSON log.',
      'Reviewers triaging /inbox will see fewer phantom SD-LEARN-FIX-* rows requiring cancellation.',
      'Dashboard consumers of suppression-reason logs (future): can attribute filter rejections to specific vectors.'
    ],
    dependencies: [
      { name: 'issue_patterns table', direction: 'upstream', failure_mode: 'Schema column rename (proven_solutions, related_sub_agents, first_seen_sd_id, last_seen_sd_id, fingerprint, category) would break filter; mitigated by integration tests that validate column reads.' },
      { name: 'strategic_directives_v2 table', direction: 'upstream', failure_mode: 'Source-SD status lookup uses sd_key + status. Column rename or new status enum value (e.g., "in_review") would change closed-source check; mitigated by closedSourceStatuses option on filterPatternsForLearning.' },
      { name: '/learn auto-approve command', direction: 'downstream', failure_mode: 'Behavior change: more patterns suppressed. Mitigated by --dry-run smoke at FR-6 + 14-day monitoring.' },
      { name: 'pattern-alert-sd-creator scheduled run', direction: 'downstream', failure_mode: 'Behavior change: more patterns suppressed. Same mitigation as above.' }
    ],
    data_contracts: {
      tables_read: ['issue_patterns', 'strategic_directives_v2'],
      tables_written: [],
      columns_touched: ['issue_patterns.proven_solutions', 'issue_patterns.related_sub_agents', 'issue_patterns.first_seen_sd_id', 'issue_patterns.last_seen_sd_id', 'issue_patterns.fingerprint', 'issue_patterns.category', 'issue_patterns.occurrence_count', 'strategic_directives_v2.sd_key', 'strategic_directives_v2.status'],
      api_contracts: 'No public API changes. Internal: filterPatternsForLearning option signature extended (additive only); existing callers unaffected.'
    },
    runtime_config: {
      env_vars: [
        { name: 'LEO_LEARN_NOISE_MIN_OCCURRENCE', default: '3', purpose: 'Override checkEmptyProvenSolutions occurrence-count threshold' }
      ],
      feature_flags: [],
      deployment_sequence: 'Single PR merge. No staged rollout required. Rollback by reverting the PR.'
    },
    observability_rollout: {
      metrics: [
        'Count of suppression events per reason code (stdout JSON; can be aggregated by log forwarder).',
        '14-day post-merge: count of /learn cancellations matching vectors a/b/c/d (target: 0).'
      ],
      rollout_plan: 'Merge to main; auto-deploy via existing CI. Verify smoke test (FR-6) on PR. No customer-facing feature flag.',
      rollback_procedure: 'git revert <PR commit>; redeploy. No data migration to undo.'
    }
  },
  exec_checklist: [
    { item: 'Read filter.mjs and pattern-alert-sd-creator.js completely before editing', done: false },
    { item: 'Add new helpers (checkEmptyProvenSolutions, extractFingerprintStem, emitSuppressionLog) with JSDoc', done: false },
    { item: 'Wire alert path through filterPatternsForLearning', done: false },
    { item: 'Add tests/fixtures/learn-139-bundle.json', done: false },
    { item: 'Add tests/learn/filter-single-sd-noise.test.js', done: false },
    { item: 'Run npm test -- learn/filter-single-sd-noise', done: false },
    { item: 'Run smoke test (FR-6) against live data with --dry-run', done: false },
    { item: 'Verify no regressions on existing filter tests', done: false },
    { item: 'Commit and push to feat/SD-FDBK-ENH-LEARN-AUTO-APPROVE-001 branch', done: false }
  ],
  validation_checklist: [
    { item: 'TESTING sub-agent run with PASS verdict', done: false },
    { item: 'No stubs/mocks/TODOs in production files', done: false },
    { item: 'PR size <= 200 LOC source + 150 LOC tests', done: false }
  ],
  smoke_test_cmd: 'node scripts/modules/learning/index.js auto-approve --dry-run --max=50',
  metadata: {
    created_via: 'one-off insert post-add-prd-inline',
    sd_uuid: SD_UUID,
    sd_key: SD_KEY,
    target_application: 'EHG_Engineer',
    sd_type: 'feature',
    based_on_validation_agent_findings: true,
    confidence_score: 8
  }
};

(async () => {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, sd_id, title, status, phase')
    .single();
  if (error) {
    console.error('INSERT_ERR:', error);
    process.exit(1);
  }
  console.log('INSERTED:', JSON.stringify(data, null, 2));
})();
