require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '0531815c-ac79-44b3-86d2-b6a21f642d3f';
const SD_KEY = 'SD-FDBK-ENH-LEARN-AUTO-APPROVE-001';
const PRD_ID = 'PRD-SD-FDBK-ENH-LEARN-AUTO-APPROVE-001';

const sharedImplContext = (filesToModify, technicalApproach, dependencies, effort) => ({
  technical_approach: technicalApproach,
  files_to_create: filesToModify.creates,
  files_to_modify: filesToModify.modifies,
  dependencies: dependencies,
  estimated_effort: effort
});

const stories = [
  {
    story_key: `${SD_KEY}:US-001`,
    title: 'Wire pattern-alert-sd-creator.js through the existing filter chain',
    user_role: 'LEO Operator',
    user_want: 'pattern-alert-sd-creator.js to apply filterPatternsForLearning before its severity/trend thresholds',
    user_benefit: 'noise patterns matching the existing FR-6/7/8 filters are suppressed in the alert path the same way they are in the /learn auto-approve path, eliminating duplicate cancellation cycles',
    priority: 'high',
    story_points: 3,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-1-1',
        scenario: 'Closed-source single-SD pattern is suppressed before threshold check',
        given: 'issue_patterns contains a pattern with severity=critical, occurrence_count=10, first_seen_sd_id=last_seen_sd_id=SD-X (status=completed)',
        when: 'pattern-alert-sd-creator.getAlertablePatterns() is called',
        then: 'the pattern is not returned and no SD is created; suppression reason "fr6" is emitted on stdout as JSON',
        is_boilerplate: false
      },
      {
        id: 'AC-1-2',
        scenario: 'Multi-SD pattern with proven solutions is admitted',
        given: 'issue_patterns contains a pattern with severity=critical, occurrence_count=10, first_seen_sd_id != last_seen_sd_id, proven_solutions.length=2',
        when: 'pattern-alert-sd-creator.getAlertablePatterns() is called',
        then: 'the pattern IS returned and proceeds to existing severity-threshold logic',
        is_boilerplate: false
      },
      {
        id: 'AC-1-3',
        scenario: 'Filter wiring matches context-builder.js call shape',
        given: 'pattern-alert-sd-creator.js source after this story',
        when: 'reading the import block and getAlertablePatterns body',
        then: 'imports filterPatternsForLearning, fetchPatternSourceSDStatuses, fetchAssignedSdStatuses from scripts/modules/learning/filter.mjs and calls them in the same order as scripts/modules/learning/context-builder.js:443-471',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given a closed-source single-SD noise pattern, when getAlertablePatterns runs, then the pattern is filtered out before the severity/trend threshold and a structured suppression line is emitted.',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-1']
    }),
    implementation_approach: 'Import filterPatternsForLearning + helper fetchers from scripts/modules/learning/filter.mjs. Inside getAlertablePatterns, after fetching patterns from issue_patterns, build the source-SD-status map via fetchPatternSourceSDStatuses, run filterPatternsForLearning(patterns, { sourceSdStatusMap }), then apply the existing severity/trend filter on the surviving array.',
    implementation_context: sharedImplContext(
      { creates: [], modifies: ['scripts/pattern-alert-sd-creator.js'] },
      'Mirror the filter wiring pattern at scripts/modules/learning/context-builder.js:443-471. Add ~15 LOC import block + ~20 LOC inside getAlertablePatterns.',
      ['scripts/modules/learning/filter.mjs (existing exports)'],
      '1-2 hours'
    ),
    architecture_references: 'scripts/modules/learning/context-builder.js:443-471 (reference wiring), scripts/modules/learning/filter.mjs:158 (filterPatternsForLearning signature)',
    test_scenarios: [
      { id: 'TS-1-1', description: 'Stub issue_patterns with one closed-source single-SD pattern + one multi-SD pattern with proven_solutions; assert getAlertablePatterns returns only the multi-SD one' },
      { id: 'TS-1-2', description: 'Assert the closed-source pattern triggers a stdout JSON line with reason="fr6" and pattern_id matching' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-002`,
    title: 'Add checkEmptyProvenSolutions filter for unproven low-occurrence patterns',
    user_role: 'LEO Operator',
    user_want: 'patterns with empty proven_solutions, no related_sub_agents, and occurrence_count below a configurable threshold to be suppressed by /learn',
    user_benefit: 'patterns that have not recurred enough to demonstrate a recurring root cause stop generating phantom SD-LEARN-FIX-* directives that get cancelled within hours',
    priority: 'high',
    story_points: 3,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-2-1',
        scenario: 'Default threshold rejects pattern with occurrence_count=2',
        given: 'a pattern with proven_solutions=[], related_sub_agents=null, occurrence_count=2',
        when: 'filterPatternsForLearning is invoked without LEO_LEARN_NOISE_MIN_OCCURRENCE set',
        then: 'the pattern is rejected and the suppression line carries reason="empty_proven"',
        is_boilerplate: false
      },
      {
        id: 'AC-2-2',
        scenario: 'Threshold env override raises the bar',
        given: 'process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE = "10"',
        when: 'filterPatternsForLearning evaluates a pattern with occurrence_count=8 + empty proven_solutions',
        then: 'the pattern is rejected (8 < 10)',
        is_boilerplate: false
      },
      {
        id: 'AC-2-3',
        scenario: 'Pattern with proven_solutions is admitted regardless of occurrence_count',
        given: 'a pattern with proven_solutions=[{title:"X"}], occurrence_count=1',
        when: 'filterPatternsForLearning evaluates it',
        then: 'the checkEmptyProvenSolutions filter does not reject it (other filters may still apply)',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given a pattern with empty proven_solutions / related_sub_agents and low occurrence_count, when filterPatternsForLearning runs, then it is suppressed with reason="empty_proven".',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-2'],
      env_var: 'LEO_LEARN_NOISE_MIN_OCCURRENCE',
      env_default: 3
    }),
    implementation_approach: 'Add export function checkEmptyProvenSolutions(pattern, threshold) returning boolean (true means reject) inside scripts/modules/learning/filter.mjs. Read threshold from options (passed via filterPatternsForLearning options.minOccurrenceForUnproven), default to Number.parseInt(process.env.LEO_LEARN_NOISE_MIN_OCCURRENCE, 10) || 3. Add to OR chain at line 192-194 of filter.mjs.',
    implementation_context: sharedImplContext(
      { creates: [], modifies: ['scripts/modules/learning/filter.mjs'] },
      'New helper ~25 LOC + 1 line in filterPatternsForLearning OR chain + JSDoc on options field. Threshold injection mirrors existing staleOpenAgeDays pattern in the same file.',
      [],
      '1 hour'
    ),
    architecture_references: 'scripts/modules/learning/filter.mjs:158-198 (filterPatternsForLearning core)',
    test_scenarios: [
      { id: 'TS-2-1', description: 'Default threshold (3): pattern occurrence_count=2 + empty proven_solutions -> rejected' },
      { id: 'TS-2-2', description: 'Env override LEO_LEARN_NOISE_MIN_OCCURRENCE=10: pattern occurrence_count=8 + empty proven_solutions -> rejected' },
      { id: 'TS-2-3', description: 'Pattern with proven_solutions.length=1 -> not rejected by this filter even at occurrence_count=1' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-003`,
    title: 'Extend single-SD multi-source requirement to handoff_failure category',
    user_role: 'LEO Operator',
    user_want: 'single-SD patterns with category=handoff_failure to be rejected the same way single-SD patterns with category=session_retrospective are',
    user_benefit: 'gate-failure patterns from one bad handoff stop graduating into auto-approved /learn fixes when they have no cross-SD evidence',
    priority: 'high',
    story_points: 2,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-3-1',
        scenario: 'handoff_failure single-SD pattern is rejected',
        given: 'a pattern with category=handoff_failure, first_seen_sd_id===last_seen_sd_id, occurrence_count=5',
        when: 'filterPatternsForLearning evaluates it',
        then: 'the pattern is rejected and the suppression line carries reason="handoff_failure_single_sd"',
        is_boilerplate: false
      },
      {
        id: 'AC-3-2',
        scenario: 'handoff_failure multi-SD pattern is admitted',
        given: 'a pattern with category=handoff_failure, first_seen_sd_id !== last_seen_sd_id',
        when: 'filterPatternsForLearning evaluates it',
        then: 'the pattern is NOT rejected by this filter (other filters may still apply)',
        is_boilerplate: false
      },
      {
        id: 'AC-3-3',
        scenario: 'Existing session_retrospective behaviour preserved',
        given: 'a pattern with category=session_retrospective, first_seen_sd_id===last_seen_sd_id (the FR-8 case)',
        when: 'filterPatternsForLearning evaluates it',
        then: 'the pattern is still rejected (regression test passes)',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given a single-SD handoff_failure pattern, when filterPatternsForLearning runs, then it is suppressed with reason="handoff_failure_single_sd"; existing session_retrospective rejection is unchanged.',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-3']
    }),
    implementation_approach: 'In filter.mjs, generalize checkSessionRetroRequiresMultiSD into a single check that accepts a Set of categories requiring multi-SD evidence (defaults to {session_retrospective, handoff_failure}). Update the OR chain at line 194. Keep export name backward-compatible OR add an alias. Update JSDoc.',
    implementation_context: sharedImplContext(
      { creates: [], modifies: ['scripts/modules/learning/filter.mjs'] },
      'Refactor existing checkSessionRetroRequiresMultiSD to take a category set. ~10 LOC delta. No new files.',
      [],
      '30 minutes'
    ),
    architecture_references: 'scripts/modules/learning/filter.mjs:136-150 (current checkSessionRetroRequiresMultiSD)',
    test_scenarios: [
      { id: 'TS-3-1', description: 'category=handoff_failure + single-SD -> rejected with reason handoff_failure_single_sd' },
      { id: 'TS-3-2', description: 'category=handoff_failure + multi-SD -> not rejected by this filter' },
      { id: 'TS-3-3', description: 'category=session_retrospective + single-SD -> still rejected (regression)' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-004`,
    title: 'Add intra-batch fingerprint-stem dedup pass to filter chain',
    user_role: 'LEO Operator',
    user_want: 'two patterns sharing the same canonical fingerprint stem (8-char prefix) and the same first_seen_sd_id to collapse into one before the per-pattern filter chain runs',
    user_benefit: 'cross-source duplicates like PAT-HF-PLANTOEXEC-211b3c47 + PAT-RETRO-PLANTOEXEC-211b3c47 stop double-counting the same incident in /learn',
    priority: 'medium',
    story_points: 3,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-4-1',
        scenario: 'Same stem + same first_seen_sd_id collapses to one',
        given: 'two patterns: pattern_id=PAT-HF-PLANTOEXEC-211b3c47 (fingerprint=211b3c47abc, first_seen_sd_id=SD-X) and pattern_id=PAT-RETRO-PLANTOEXEC-211b3c47 (fingerprint=211b3c47def, first_seen_sd_id=SD-X)',
        when: 'filterPatternsForLearning runs',
        then: 'only one of the two survives the dedup pre-pass; the dropped one carries suppression reason="fingerprint_stem_dup"',
        is_boilerplate: false
      },
      {
        id: 'AC-4-2',
        scenario: 'Same stem + different first_seen_sd_id are both retained',
        given: 'two patterns sharing 8-char stem but with different first_seen_sd_id',
        when: 'filterPatternsForLearning runs the dedup pre-pass',
        then: 'both patterns proceed to the per-pattern filter chain',
        is_boilerplate: false
      },
      {
        id: 'AC-4-3',
        scenario: 'Stable selection: highest occurrence_count survives',
        given: 'two duplicates with occurrence_count=3 and occurrence_count=7',
        when: 'dedup pre-pass runs',
        then: 'the occurrence_count=7 row survives; tiebreaker uses pattern_id ascending',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given two patterns sharing fingerprint stem and SD, when filterPatternsForLearning runs, then the lower-occurrence row is dropped with reason="fingerprint_stem_dup".',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-4']
    }),
    implementation_approach: 'Add export function extractFingerprintStem(pattern) returning pattern.fingerprint?.slice(0, 8) || null. Add a dedup pre-pass at the start of filterPatternsForLearning that builds a Map<stem+sdId, pattern>, picking the winner via (occurrence_count desc, pattern_id asc). Suppressed dupes are emitted via the existing suppression-log helper (FR-5).',
    implementation_context: sharedImplContext(
      { creates: [], modifies: ['scripts/modules/learning/filter.mjs'] },
      'Add ~30 LOC: extractFingerprintStem helper + dedup pre-pass loop. Runs before the existing per-pattern filter loop. Pure-function purity preserved.',
      [],
      '1-2 hours'
    ),
    architecture_references: 'scripts/modules/learning/filter.mjs:158-198 (filterPatternsForLearning main loop)',
    test_scenarios: [
      { id: 'TS-4-1', description: 'Two patterns same stem + same SD -> 1 retained, 1 dropped with fingerprint_stem_dup reason' },
      { id: 'TS-4-2', description: 'Two patterns same stem + different SD -> both retained' },
      { id: 'TS-4-3', description: 'Tiebreaker: occurrence_count=7 beats 3; pattern_id ascending breaks further ties' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-005`,
    title: 'Emit structured suppression-reason JSON line per rejected pattern',
    user_role: 'LEO Operator',
    user_want: 'each pattern suppression to emit a single-line JSON record on stdout with pattern_id, reason code, and details',
    user_benefit: 'I can audit which patterns were filtered and why via log forwarders or grep, and a future inbox/learn dashboard surface gets a stable contract to render',
    priority: 'medium',
    story_points: 2,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-5-1',
        scenario: 'JSON shape per suppression',
        given: 'a pattern is suppressed for any reason',
        when: 'emitSuppressionLog is called',
        then: 'exactly one stdout line is written: {event:"learn.filter.suppressed", pattern_id, reason, details: object, ts: ISO-string}',
        is_boilerplate: false
      },
      {
        id: 'AC-5-2',
        scenario: 'Reason enum is closed',
        given: 'all six suppression vectors',
        when: 'each is exercised',
        then: 'reason values are exactly one of {fr6, fr7, fr8, empty_proven, handoff_failure_single_sd, fingerprint_stem_dup}',
        is_boilerplate: false
      },
      {
        id: 'AC-5-3',
        scenario: 'Injectable writer for testability',
        given: 'a unit test passes a custom writer function',
        when: 'emitSuppressionLog runs',
        then: 'the writer receives the JSON string instead of process.stdout being touched, allowing assertion in vitest',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given a suppression event, when emitSuppressionLog fires, then a single JSON line with the closed reason enum is written.',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-5']
    }),
    implementation_approach: 'Add export function emitSuppressionLog(pattern, reason, details, writer = process.stdout) inside filter.mjs. Writer.write(JSON.stringify({event, pattern_id, reason, details, ts}) + "\\n"). Wire into every suppression site (the OR chain branches and the dedup pre-pass).',
    implementation_context: sharedImplContext(
      { creates: [], modifies: ['scripts/modules/learning/filter.mjs'] },
      '~15 LOC for the helper + ~5 LOC of call sites. Default writer = process.stdout; tests inject a sink array.',
      [],
      '45 minutes'
    ),
    architecture_references: 'scripts/modules/learning/filter.mjs (entire file is the surface)',
    test_scenarios: [
      { id: 'TS-5-1', description: 'Each of the 6 reason codes produces a JSON line with the expected shape' },
      { id: 'TS-5-2', description: 'Injectable writer captures all calls in vitest without touching real stdout' }
    ]
  },
  {
    story_key: `${SD_KEY}:US-006`,
    title: 'LEARN-139 fixture replay golden test (5 in -> 0 out)',
    user_role: 'LEO Operator',
    user_want: 'a golden test that replays the 5 patterns from the LEARN-139 cancellation bundle through the filter chain',
    user_benefit: 'I have a regression guard that catches future filter weakening or wiring drift before it ships another phantom SD-LEARN-FIX-*',
    priority: 'high',
    story_points: 3,
    status: 'ready',
    acceptance_criteria: [
      {
        id: 'AC-6-1',
        scenario: 'All 5 LEARN-139 bundle patterns are suppressed',
        given: 'tests/fixtures/learn-139-bundle.json with 2 closed-source single-SD + 2 empty-proven_solutions + 1 fingerprint-stem duplicate (representative of the 2026-05-01 cancellation)',
        when: 'the test feeds the bundle through filterPatternsForLearning + the alert-path call site',
        then: 'admitted.length === 0 and suppressed.length === 5',
        is_boilerplate: false
      },
      {
        id: 'AC-6-2',
        scenario: 'Each suppression reason appears exactly once',
        given: 'the same fixture',
        when: 'the suppression log is asserted',
        then: 'the 5 lines collectively cover {fr6, empty_proven, fingerprint_stem_dup} with each used at least once and no NULL reasons',
        is_boilerplate: false
      },
      {
        id: 'AC-6-3',
        scenario: 'Test runs as part of npm test -- learn/',
        given: 'the test file at tests/learn/filter-single-sd-noise.test.js',
        when: 'npm test -- learn/filter-single-sd-noise is invoked',
        then: 'the suite exits 0 with at least 8 assertions including this golden test',
        is_boilerplate: false
      }
    ],
    given_when_then: 'Given the LEARN-139 5-pattern fixture, when the filter chain processes it, then 0 SDs are produced and the 5 suppressions cover the expected reason mix.',
    technical_notes: JSON.stringify({
      hand_authored: true,
      replaces_boilerplate: true,
      fr_traceability: ['FR-6']
    }),
    implementation_approach: 'Build tests/fixtures/learn-139-bundle.json from the actual issue_patterns rows in the LEARN-139 cancellation (PAT-HF-PLANTOEXEC-211b3c47, PAT-RETRO-PLANTOEXEC-211b3c47, plus 3 representative single-SD-closed-source / empty-proven cousins). Author tests/learn/filter-single-sd-noise.test.js using vitest. Inject a writer array, call filterPatternsForLearning(fixture, opts), assert admitted=0 and suppression reasons.',
    implementation_context: sharedImplContext(
      { creates: ['tests/fixtures/learn-139-bundle.json', 'tests/learn/filter-single-sd-noise.test.js'], modifies: [] },
      'Fixture ~80 LOC JSON; test ~120 LOC vitest. No mocks of DB; the fixture provides everything the pure filter needs.',
      ['vitest 3.x (existing)', 'tests/fixtures directory pattern (existing)'],
      '2 hours'
    ),
    architecture_references: 'tests/learning/filter.test.js if present; otherwise scripts/modules/learning/filter.mjs as the test target',
    test_scenarios: [
      { id: 'TS-6-1', description: 'Bundle replay: 5 in -> 0 out (admitted), 5 in -> 5 out (suppressed)' },
      { id: 'TS-6-2', description: 'Suppression reason coverage: fr6 + empty_proven + fingerprint_stem_dup all observed' },
      { id: 'TS-6-3', description: 'npm test -- learn/filter-single-sd-noise exits 0' }
    ]
  }
];

(async () => {
  // Delete existing boilerplate stories
  const { error: delErr, count } = await supabase
    .from('user_stories')
    .delete({ count: 'exact' })
    .eq('sd_id', SD_UUID);
  if (delErr) { console.error('DEL_ERR:', delErr); process.exit(1); }
  console.log(`Deleted ${count ?? '?'} boilerplate stories`);

  // Insert new ones
  const rows = stories.map(s => ({
    story_key: s.story_key,
    prd_id: PRD_ID,
    sd_id: SD_UUID,
    title: s.title,
    user_role: s.user_role,
    user_want: s.user_want,
    user_benefit: s.user_benefit,
    story_points: s.story_points,
    priority: s.priority,
    status: s.status,
    acceptance_criteria: s.acceptance_criteria,
    given_when_then: s.given_when_then,
    technical_notes: s.technical_notes,
    implementation_approach: s.implementation_approach,
    implementation_context: s.implementation_context,
    architecture_references: s.architecture_references,
    test_scenarios: s.test_scenarios,
    created_by: 'PLAN_HAND_AUTHORED',
    metadata: { hand_authored: true, replaces_boilerplate: true, sd_key: SD_KEY }
  }));
  const { data, error } = await supabase
    .from('user_stories')
    .insert(rows)
    .select('id, story_key, title');
  if (error) { console.error('INS_ERR:', error); process.exit(1); }
  console.log(`Inserted ${data.length} hand-authored stories:`);
  data.forEach(d => console.log(`  ${d.story_key}: ${d.title}`));
})();
