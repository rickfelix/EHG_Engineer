require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = {
  scope: [
    'Close /learn auto-approve scorer noise filter regression.',
    '(1) Wire scripts/pattern-alert-sd-creator.js through filterPatternsForLearning (mirror context-builder.js:443-471 pattern).',
    '(2) Extend filter.mjs: add checkEmptyProvenSolutions (proven_solutions empty AND related_sub_agents empty AND occurrence_count<3); extend session_retro multi-SD requirement to handoff_failure category; add intra-batch dedup by canonical fingerprint stem (suppress duplicate when 8-char fingerprint stem + first_seen_sd_id collide).',
    '(3) Tests: 4 vector fixtures + LEARN-139 bundle replay golden test (5 patterns in -> 0 SDs out).',
    'EXCLUDED (validated stale): orphan-pattern cleanup for LEARN-131/133/136 (issue_patterns query returned zero orphans).',
    'EXCLUDED: feedback row 7b469f0a status correction (separate harness-bug if needed).'
  ].join(' '),
  success_criteria: [
    { criterion: 'pattern-alert-sd-creator.js calls filterPatternsForLearning before threshold checks', measure: 'Filter import + call present at scripts/pattern-alert-sd-creator.js getAlertablePatterns() before line 125' },
    { criterion: 'LEARN-139 fixture bundle (5 patterns: 2 closed-source single-SD + 2 empty-proven_solutions + 1 cross-source dup) creates 0 SDs', measure: 'Golden test in tests/learn/filter-single-sd-noise.test.js passes; auto-approve dry-run reports 5 suppressed/0 created' },
    { criterion: 'Intra-batch fingerprint-stem dedup suppresses cross-source duplicates (handoff_failure + session_retrospective sharing 8-char stem on same SD)', measure: 'Unit test asserts only first instance survives; PAT-HF-PLANTOEXEC-211b3c47 + PAT-RETRO-PLANTOEXEC-211b3c47 collapse to one' },
    { criterion: 'checkEmptyProvenSolutions filter rejects single-SD patterns with empty proven_solutions and occurrence_count<3', measure: 'Unit test asserts rejection; threshold configurable via env LEO_LEARN_NOISE_MIN_OCCURRENCE (default 3)' },
    { criterion: 'No regression on legitimate multi-SD patterns', measure: 'Existing filter test suite passes; pattern with first_seen != last_seen and proven_solutions.length>=1 is admitted' }
  ],
  success_metrics: [
    { metric: 'Suppression coverage on LEARN-139 fixture', target: '5 of 5 noise patterns suppressed', actual: 'TBD post-EXEC' },
    { metric: 'False-positive auto-approve rate (next 14 days)', target: '0 cancellations attributable to vectors a/b/c/d', actual: 'TBD post-merge monitoring' },
    { metric: 'Code change size', target: '<=200 LOC source, <=150 LOC tests', actual: 'TBD' }
  ],
  key_changes: [
    { change: 'Wire scripts/pattern-alert-sd-creator.js through filterPatternsForLearning (uncovered path)', type: 'fix' },
    { change: 'Extend filter.mjs with checkEmptyProvenSolutions and handoff_failure multi-SD requirement', type: 'feature' },
    { change: 'Add intra-batch canonical-fingerprint-stem dedup pass', type: 'feature' },
    { change: 'Add LEARN-139 bundle replay golden test', type: 'test' }
  ],
  key_principles: [
    'Reuse the existing filterPatternsForLearning chain; do not fork a parallel filter.',
    'Filters run BEFORE severity-threshold checks (high-severity single-SD-closed-source is still noise).',
    'Defaults are conservative; thresholds configurable via env vars (LEO_LEARN_NOISE_MIN_OCCURRENCE).',
    'Each suppression emits a structured stdout line so the inbox/learn dashboard can show why a pattern was rejected.',
    'No silent regressions on multi-SD patterns with proven solutions.'
  ],
  strategic_objectives: [
    'Close the alert-path gap left by SD-LEO-INFRA-LEARN-NOISE-FILTER-001 (commit a7be966556) so /learn auto-approve uses the filter chain regardless of entry point.',
    'Eliminate the LEARN-130/131/133/136/139 + PAT-RETRO-005 cancellation pattern (6 identical noise SDs in 7 days) by attacking all four documented vectors: (a) closed-source single-SD, (b) empty proven_solutions, (c) null related_sub_agents, (d) cross-source fingerprint duplicate.'
  ],
  risks: [
    { risk: 'Overly strict filter suppresses legitimate single-SD patterns that genuinely need attention', impact: 'medium', likelihood: 'low', mitigation: 'Threshold via env var (LEO_LEARN_NOISE_MIN_OCCURRENCE=3 default); structured suppression log lets us audit suppressed patterns' },
    { risk: 'pattern-alert-sd-creator.js has additional callers not yet identified', impact: 'low', likelihood: 'low', mitigation: 'Filter wiring is at getAlertablePatterns() (single chokepoint for the module); validation-agent confirmed only one entry point' }
  ],
  smoke_test_steps: [
    { step_number: 1, instruction: 'Run /learn auto-approve in dry-run mode against the LEARN-139 fixture bundle (5 patterns, all noise vectors). Command: node scripts/modules/learning/index.js auto-approve --dry-run --fixture tests/fixtures/learn-139-bundle.json (or equivalent --replay flag added in EXEC).', expected_outcome: 'stdout reports: 5 patterns input, 0 SDs proposed, 5 suppression lines listing the matched filter (FR-6/7/8 + new dedup + new empty-proven). No SD inserted into strategic_directives_v2.' },
    { step_number: 2, instruction: 'Run targeted unit tests: npm test -- learn/filter-single-sd-noise', expected_outcome: 'All 4 vector fixtures + LEARN-139 golden test pass (>=8 assertions). Existing filter.mjs tests still green.' },
    { step_number: 3, instruction: 'Run /learn auto-approve against current live pattern population (dry-run): node scripts/modules/learning/index.js auto-approve --dry-run --max=50', expected_outcome: 'Output shows >=20 suppressions of active single-SD-closed-source patterns and at least 1 admitted multi-SD pattern with non-empty proven_solutions, demonstrating no over-suppression.' }
  ],
  scope_reduction_percentage: 15,
  metadata: {
    source: 'feedback',
    source_id: 'd919b0df-2cb0-482e-9d8e-249fd9d74c0f',
    created_at: '2026-05-02T21:11:13.004Z',
    created_via: 'leo-create-sd',
    feedback_type: 'enhancement',
    feedback_priority: null,
    lead_evaluation: {
      evaluated_at: new Date().toISOString(),
      evaluated_by: 'session_c510fd84',
      questions: {
        q1_need: { answer: 'YES', evidence: '6 identical /learn cancellations in 7 days (LEARN-130/131/133/136/139 + PAT-RETRO-005) all matching documented noise vectors' },
        q2_solution: { answer: 'YES', evidence: 'Aligns with /learn quality and reduces wasted EXEC cycles on phantom SDs' },
        q3_feasibility: { answer: 'YES', evidence: 'Bounded change in 2 files (filter.mjs + pattern-alert-sd-creator.js); validation-agent identified single chokepoint' },
        q4_value: { answer: 'YES', evidence: 'Each prevented false-positive saves ~30-60 min of LEAD review + DB writes; recurrence reservoir is ~96 active candidates' },
        q5_existing_tools: { answer: 'YES', evidence: 'Reuse filterPatternsForLearning chain; mirror context-builder.js:443-471 wiring pattern' },
        q6_risk: { answer: 'LOW', evidence: 'Filter additions are non-blocking on legitimate patterns; threshold env-configurable; structured suppression log allows audit' },
        q7_ui_inspectability: { answer: 'PARTIAL', evidence: 'Backend filter; user surface is /learn dashboard suppression log + inbox feedback row. Each suppression must emit a structured stdout line for visibility (added as principle).' },
        q8_scope_reduction: { answer: 'YES', evidence: 'Dropped orphan-pattern cleanup (LEARN-131/133/136 patterns) per validation-agent finding: zero orphans in issue_patterns. Dropped feedback row 7b469f0a status correction (separate harness concern). ~15% reduction.', percentage: 15 },
        q9_smoke_test: { answer: 'YES', evidence: 'smoke_test_steps populated with concrete fixture replay + test command + dry-run population check' }
      },
      open_questions_resolved: {
        scope_split: 'Unified - both alert-path wiring + filter extensions ship as one PR; same regression class.',
        filter_ordering: 'BEFORE severity thresholds (per validation recommendation); high-severity single-SD-closed-source patterns are still noise.',
        empty_proven_threshold: 'occurrence_count < 3 (default), env LEO_LEARN_NOISE_MIN_OCCURRENCE override.',
        orphan_cleanup: 'DROPPED - validation-agent found zero orphans in issue_patterns.',
        feedback_row_status_fix: 'DEFERRED - file separate harness-bug if relevant; out of scope here.'
      }
    }
  }
};

supabase.from('strategic_directives_v2')
  .update(updates)
  .eq('sd_key', 'SD-FDBK-ENH-LEARN-AUTO-APPROVE-001')
  .select('sd_key, status, current_phase, scope_reduction_percentage')
  .then(r => {
    if (r.error) { console.error('UPDATE_ERR:', r.error); process.exit(1); }
    console.log('UPDATED:', JSON.stringify(r.data, null, 2));
  });
