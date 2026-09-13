import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I';
const ARTIFACT_PATH = '.artifacts/testing-capa001i-postimpl.json';
const raw = readFileSync(ARTIFACT_PATH);
const report = JSON.parse(raw.toString('utf8'));
const artifactSha = createHash('sha256').update(raw).digest('hex');

const testExecution = buildTestExecution({
  executed: report.numTotalTests,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  skipped: report.numPendingTests,
  artifactSha,
  runner: 'vitest',
  artifactPath: ARTIFACT_PATH,
  source: 'sub_agent_code_path',
  mappedCandidates: report.testResults.length,
  foundFiles: report.testResults.length,
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 92,
  execution_time_ms: 0,
  summary:
    'SUPERSEDES evidence row 89e17f51-bb52-496e-86ee-c38a200700c1. The PRD test-plan question is now ' +
    'RESOLVED (all 3 blocking defects and all 5 coverage gaps closed; verified by readback, not by ' +
    'claim) and all 146 tests across the 11 changed test files PASS. Remaining CONDITIONAL solely on ' +
    'three measured ACTIVATION gaps: the FR-2/FR-3/FR-4 migration is unapplied, the FR-3 feature-flag ' +
    'row does not exist (so the gate is dormant), and activation_test_id is still NULL.',
  metadata: {
    test_execution: testExecution,
    supersedes: '89e17f51-bb52-496e-86ee-c38a200700c1',
    validation_mode: 'post-implementation re-validation of a prospective PLAN-phase review',

    prd_fixes_verified_by_readback: {
      method: 'read live product_requirements_v2 row (updated_at 2026-09-13T17:16:42), never trusted the claim',
      duplicate_ac_ids: 'FIXED — 0 duplicate acceptance-criterion ids across all 6 FRs (FR-3 was AC-1..AC-4,AC-4,AC-5)',
      test_scenarios: 'FIXED — now 11 (TS-1..TS-11); TS-9 whitespace-reason rejection, TS-10 signal-backed ' +
        'override ignored, TS-11 domain-fallback precedence',
      fr1_b1_closed:
        'FR-1 went 3 ACs -> 4: AC-1 now requires readVentureContext ok:true with an explicit ' +
        'metadata.live_url fallback plus a unit test on that path; AC-2 now requires a real invocation, ' +
        '"not a mocked/simulated one"',
    },

    end_state_verified_live: {
      fr1_legal_docs:
        'GENUINELY CLOSED, verified against the live DB not a mock: AltifyAI now has exactly 2 ' +
        'venture_legal_overrides rows (template d7166803 terms_of_service, 6fc6347f privacy_policy), ' +
        'both generated_at 2026-09-13T16:22:50Z, is_active=true. At my PLAN review this was 0 rows and ' +
        'readVentureContext returned {ok:false, missingFields:["COMPANY_DOMAIN"]}.',
      ts10_coverage_location_correction:
        'TS-10 coverage is real but lives in tests/unit/eva/stage-templates/' +
        'stage-23-launch-readiness-fr3-capability-checklist.test.js:116 ("a signal-backed capability ' +
        '(feedback-widget) reads pass only via a genuine wired:true, never via override"), NOT in ' +
        'capability-override.test.js as cited. Same file also covers the AltifyAI-shaped baseline at :108. ' +
        'Attribution only — the coverage exists.',
    },

    activation_gaps: [
      {
        id: 'A1', severity: 'BLOCKING_FOR_LEAD_FINAL', fr: 'FR-2 / FR-3 / FR-4',
        finding:
          'The migration database/migrations/20260913_venture_screen_disposition_reconciliation.sql is ' +
          'NOT APPLIED. All three tables it creates are absent from the live database: ' +
          'venture_screen_dispositions, venture_screen_reconciliation, venture_capability_overrides ' +
          '(each returns "Could not find the table in the schema cache").',
        impact:
          'FR-2 has nowhere to persist dispositions (0 for AltifyAI). FR-4 AC-2 ("exactly 9 rows") is ' +
          'unverified against real persistence. FR-3 recordCapabilityOverride cannot write, so the 4 ' +
          'no-signal capabilities can never reach pass-overridden against the live DB. All 146 tests ' +
          'still pass because they exercise the code, not the applied schema.',
        note:
          'The branch has a commit adding an approval header to this migration. Per the standing rule, a ' +
          'migration file header is a CEREMONY MARKER, never apply state — measured here as unapplied, ' +
          'consistent with that rule. Choosing dedicated tables over a new artifact_type correctly ' +
          'sidesteps the chairman-gated venture_artifacts_artifact_type_check problem I raised as B3.',
      },
      {
        id: 'A2', severity: 'BLOCKING_FOR_LEAD_FINAL', fr: 'FR-3',
        finding:
          'The FR-3 capability checklist is DORMANT in production. readCapabilityChecklistRequiredFlag ' +
          'reads CAPABILITY_CHECKLIST_FLAG_KEY from leo_feature_flags, and readFeatureFlag defaults OFF ' +
          'on a missing row or read error. Measured: leo_feature_flags has ZERO rows matching %CAPABIL%. ' +
          'No flag row exists at all, so the 7 REQUIRED capability rows are never added to any venture ' +
          'checklist, AltifyAI included.',
        impact:
          'FR-3 AC-3 claims the stage-24 verdict treats all 7 rows as REQUIRED "verified end-to-end ' +
          'against AltifyAI reaching a real pass or a recorded override on all 7". That is not true in ' +
          'production. The unit tests force the flag ON in-test, which is why they pass. This is a ' +
          'printed discriminator, not an enforced gate.',
        not_a_criticism_of_the_flag:
          'Default-OFF is CORRECT rollout safety and deliberately mirrors readGrowthPlaybookRequiredFlag ' +
          '(an unflagged REQUIRED gate would retroactively HOLD every in-flight venture). The defect is ' +
          'the gap between that posture and AC-3\'s end-to-end claim. Resolve by either enabling the flag ' +
          'and genuinely verifying AltifyAI, or restating AC-3 to name the flag-gated rollout and who ' +
          'flips it. Note leo_feature_flags is governed data — I did not create or flip the row.',
      },
      {
        id: 'A3', severity: 'MEDIUM', fr: 'cross-cutting',
        finding:
          'product_requirements_v2.activation_test_id and smoke_test_cmd are both still NULL (unchanged ' +
          'since my PLAN review). This SD now demonstrably ships the schema+worker+consumer chain the ' +
          'LEAD-FINAL-APPROVAL activation-invariant gate exists to catch: a real migration (3 tables), ' +
          'workers (stage-15 disposition reader, stage-24 checklist, reconciliation builder), and a ' +
          'consumer (the FR-5 sitting packet).',
        impact:
          'A1 and A2 together ARE the writer-consumer asymmetry the invariant targets — 146 passing tests ' +
          'with an unapplied migration and a dormant flag is exactly the shape that reads as shipped and ' +
          'is not activated. Declaring an activation test that asserts the chain against the applied DB ' +
          'would have caught both.',
      },
    ],

    test_run: {
      scope: 'all 11 test files changed on feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I vs main',
      result: '146/146 PASS, 0 failed, 0 skipped, across 11 suites',
      suites:
        'capability-override(9), chairman-product-review-competitive-baseline(5), ' +
        'chairman-product-review-fr5-sitting-packet(11), chairman-product-review(50), ' +
        'legal-doc-producer(19), stack-scan-reader(11), screen-reconciliation-builder(9), ' +
        'stage-23-launch-readiness-fr3-capability-checklist(8), ' +
        'stage-15-coverage-disposition-reader(10), stage-23-dedicated-venture-uat(7), ' +
        'stage-23-growth-categories(7)',
      caveat:
        'These are unit tests over code. They do NOT and cannot establish A1/A2, because they supply ' +
        'their own fixtures and force the flag ON. Passing tests are not activation evidence.',
    },

    original_findings_disposition: {
      B1_fr1_company_domain: 'CLOSED — verified in live data, 2 real rows generated',
      B2_fr6_stale_premise_and_tautological_ac: 'CLOSED — dedicated stack-scan-reader built (11 tests) rather than relying on the caller-less fetchLatestWorkflowRun',
      B3_fr4_artifact_type_check_constraint: 'CLOSED by design change — dedicated table instead of a new artifact_type, avoiding the chairman-gated constraint entirely',
      G1_whitespace_override_scenario: 'CLOSED — TS-9 added AND real code coverage at capability-override.test.js:54,:67',
      G2_capability_baseline_and_feedback_widget_circularity: 'CLOSED at criterion level — AC restated against the measured 1-of-7 baseline; circularity documented, not silently resolved, and escalated via /signal 949ba5e9',
      G3_entry_point_swallowing: 'CLOSED — screen-7/8 kept OPEN/PROVISIONAL rather than pre-resolved',
      G4_fr5_specs_only_binding: 'CLOSED — FR-5 now requires a real non-specs_only artifact',
      G5_duplicate_ac_id: 'CLOSED — FR-3 renumbered to AC-4/AC-5/AC-6, 0 duplicates repo-wide',
    },

    verdict_rationale:
      'CONDITIONAL_PASS, upgraded from the prior row on confidence (88 -> 92) but not to PASS. Everything ' +
      'I was asked to validate at PLAN is genuinely resolved and I verified each fix by reading the live ' +
      'row rather than accepting the report. Withholding PASS solely because A1 and A2 are measured, ' +
      'current, and would let a green 146/146 test run stand in for an inactive feature. Neither is a ' +
      'design error — the migration simply has not been applied yet and default-OFF is the right rollout ' +
      'posture — but both must close before LEAD-FINAL-APPROVAL, and A3 is the mechanism that should ' +
      'have surfaced them automatically.',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'TESTING',
  SD,
  { name: 'QA Engineering Director', code: 'TESTING' },
  results,
  { phase: 'PLAN', sdKey: SD, sdId: SD, subAgentCode: 'TESTING' }
);

console.log('STORED_ID=' + (stored?.id || JSON.stringify(stored)));
