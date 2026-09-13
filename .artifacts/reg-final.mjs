import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const warnings = [
  'F1 GATING ASYMMETRY: lib/eva/chairman-product-review.js:322,328-331 calls readScreenReconciliation, precheckCapabilities, readCapabilityOverrides and readStackScanConclusion UNCONDITIONALLY. Unlike stage-23-launch-readiness.js:327-331 these are NOT gated by LEO_S24_CAPABILITY_CHECKLIST_REQUIRED, so with the migration unapplied every chairman product-review packet issues reads against 3 nonexistent tables. Verified non-breaking: each reader fail-closes on the PostgREST error object (readCapabilityOverrides returns new Map(), readScreenReconciliation returns [], verifyCapabilityWired returns wired:false), so sections render empty rather than throwing. Cost is +7 verifyCapabilityWired queries, +1 reconciliation query and +1 GitHub API call per packet.',
  'F2 INTENTIONAL BEHAVIOR WIDENING (not a pure refactor): legal-doc-producer.js:94 FR-1 fallback means a venture with companies.website NULL but metadata.live_url set now resolves COMPANY_DOMAIN where it previously reported the field missing, so it will now generate legal docs it previously refused to generate. Documented and intended, but it changes outcomes for existing ventures.',
  'F3 TEST HARNESS EDIT: stage-23-growth-categories.test.js is +21/-1; the single deleted line is the leo_feature_flags mock being made flag-key-aware now that the module reads two flags through one table. No assertion was weakened or removed.'
];

const recommendations = [
  'Consider gating the chairman-product-review.js capability/reconciliation reads behind the same LEO_S24_CAPABILITY_CHECKLIST_REQUIRED flag that protects stage-23, or document why the chairman packet is deliberately ungated.',
  'Track the unapplied migration (20260913_venture_screen_disposition_reconciliation.sql) as the activation blocker it already is; the code is correct and fail-closed without it.'
];

const conditions = [
  'F1 is accepted as non-breaking on the strength of per-reader fail-closed error handling, NOT on the migration being applied. If any of those three readers is ever changed to throw or to treat a missing table as fatal, the chairman product-review packet breaks for every venture.',
  'F2 is accepted as in-scope FR-1 intent, not a regression. If the CAPA programme intended legal-doc generation eligibility to stay unchanged, this is a scope finding to re-open.'
];

const justification = [
  'No regression found. Full tests/unit/eva suite at b41994adeda: 616 test files passed, 7855 tests passed, 34 skipped, ZERO test-level failures.',
  'The single failing suite file (tests/unit/eva/path-integrity-flags-live-defaults.db.test.js) is a pre-existing environment gate, not a regression: the file is byte-untouched by this branch (git diff --stat main...HEAD returns empty for it) and its error is DB_TIER_BLOCKED / no_designated_target, requiring VITEST_DB_ALLOW_REF.',
  'Backward compatibility verified caller-by-caller rather than by source-reading:',
  '(1) buildGuidedTour second param defaults to empty object and the old 1-arg call shape is exercised by UNTOUCHED pre-existing tests (chairman-product-review.test.js:152,165,176); the sole production caller at line 337 passes both args.',
  '(2) readVentureContext gained NO new Supabase query - the pre-existing ventures select was extended by one column (metadata), with call signature and return shape unchanged.',
  '(3) The extractBareDomain typeof guard is only reachable for truthy non-string input, and the one pre-existing caller is companies.website, a text column, so the old coercion path was unreachable in practice.',
  '(4) The readGrowthPlaybookRequiredFlag refactor is diff-confirmed behavior-identical (same select of is_enabled, eq on flag_key, maybeSingle, error to false, Boolean coercion) with only the key parameterized.',
  '(5) The validateOverrideReason extraction is proven byte-identical by the untouched pre-existing suites validate-venture-default-capabilities.test.js, verify-capability-wired.test.js and verify-capability-wired-telemetry-analytics.test.js all passing unchanged.',
  'Capability-checklist regression fix CONFIRMED HOLDING against the live DB, not taken on faith: leo_feature_flags has NO row for LEO_S24_CAPABILITY_CHECKLIST_REQUIRED (query returned zero rows), readFeatureFlag returns false on absence, and with the flag OFF the CAPABILITY_CATEGORIES set is excluded from allCategories AND precheckCapabilities/readCapabilityOverrides are never invoked, so existing stage-24 verdicts, counts and REQUIRED set are unchanged.',
  'Migration DDL is purely additive: 3 CREATE TABLE IF NOT EXISTS plus their own indexes, RLS enable and policies, with zero ALTER, DROP or TRUNCATE against any pre-existing table. All 11 changed test files are additions-only except one flag-mock line.',
  'CONDITIONAL_PASS rather than PASS solely to attach the two conditions: the chairman-packet gating asymmetry (F1) and the intentional legal-doc eligibility widening (F2) are real behavior deltas on existing production paths that a bare PASS would understate.'
].join(' ');

const metadata = {
  phase: 'PLAN',
  provisional: false,
  repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
  executed_from_cwd: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I',
  repo_resolved: true,
  branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I',
  head_commit: 'b41994adeda',
  session_id: '689a1237-33b7-406f-9772-668958b289d6',
  test_run: {
    runner: 'vitest',
    command: 'npx vitest run tests/unit/eva/',
    test_files_passed: 616,
    test_files_failed: 1,
    test_files_skipped: 6,
    tests_passed: 7855,
    tests_failed: 0,
    tests_skipped: 34,
    new_failures: 0,
    pre_existing_failures: [
      'tests/unit/eva/path-integrity-flags-live-defaults.db.test.js - DB_TIER_BLOCKED env gate, file untouched by branch'
    ]
  },
  api_comparison: {
    breaking_changes: 0,
    documented_changes: 1,
    changed_signatures: [
      'buildGuidedTour(artifactsByType) to buildGuidedTour(artifactsByType, reconciliationByScreen = {}) - additive optional param, old call shape covered by untouched pre-existing tests'
    ]
  },
  flag_state_verified_live: {
    flag_key: 'LEO_S24_CAPABILITY_CHECKLIST_REQUIRED',
    rows_found: 0,
    effective: 'OFF (default)',
    consequence: 'stage-24 checklist, counts and verdict byte-identical to baseline'
  },
  migration_ddl: {
    file: 'database/migrations/20260913_venture_screen_disposition_reconciliation.sql',
    create_table: 3,
    alter_existing_tables: 0,
    drop: 0,
    purely_additive: true,
    applied_to_prod: false
  }
};

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .update({
    verdict: 'CONDITIONAL_PASS',
    confidence: 93,
    critical_issues: [],
    warnings,
    recommendations,
    conditions,
    justification,
    metadata
  })
  .eq('id', '47629374-e1a6-4262-b0ba-80117185bb92')
  .select('id,verdict,confidence,phase')
  .single();

console.log('UPDATED:', JSON.stringify(data), 'err:', error?.message);
