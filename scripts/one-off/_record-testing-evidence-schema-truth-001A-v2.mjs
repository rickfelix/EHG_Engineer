import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { buildTestExecution } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A/lib/sub-agents/testing/test-execution-record.js';

const WT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';
const SD_ID = '00b8482a-de45-4f70-82c3-4fead8f71ee9';
const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A';

// Provenance: hash of the RUNNER-WRITTEN vitest json results file (not hand-authored prose).
const artifactPath = `${WT}/.artifacts/testing-schema-truth-001A-v2.json`;
const buf = fs.readFileSync(artifactPath);
const contentHash = crypto.createHash('sha256').update(buf).digest('hex');
const runnerJson = JSON.parse(buf);
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WT, encoding: 'utf8' }).trim();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'PASS',
  confidence: 91,
  phase: 'PLAN',
  summary:
    'Criterion #1 — the blocking gap on my prior row e748f481 — is NOW MET, verified by my OWN independently '
    + 'authored probe harness rather than by the author\'s tests. 14/14 targeted tests pass; the 9-file regression '
    + 'sample is byte-identical to its pre-change baseline (34 passed / 49 skipped BOTH before and after a stash '
    + 'of the change), so regression is measured differentially, not merely asserted green. Criterion #2 met as a '
    + 'regression guard and correctly framed as NOT the corrective. Criterion #3 satisfied by supersession '
    + '(factory-level default enforcement). Criterion #4 correctly deferred, but its deferral is NOT yet tracked '
    + 'anywhere — that is my one blocking condition.',
  critical_issues: [],
  warnings: [
    {
      severity: 'MEDIUM',
      issue:
        'CRITERION #4 DEFERRAL IS NOT ACTUALLY TRACKED. The handoff states criterion #4 is "explicitly '
        + 'deferred/tracked, not silently dropped". I checked: there is NO feedback/harness_backlog row and no '
        + 'open SD carrying the 228-finding burn-down. The upstream SD-LEO-INFRA-SWALLOWED-POSTGREST-ERROR-001 '
        + 'that documented it as "a TRACKED MIGRATION" is status=completed, so nothing active carries it. Sibling '
        + 'child C is a DIFFERENT lint (schema-reference-lint, 358 violations) and is not its home either. As of '
        + 'now the deferral is a claim, not a landed row.',
      recommendation:
        'File a tracking row (feedback category=harness_backlog, or a W1 child D) for '
        + 'swallowed-query-error-lint enforce + SCAN_PREFIXES widen, citing the measured 228/exit-0 baseline, '
        + 'BEFORE PLAN-TO-EXEC closes.',
    },
    {
      severity: 'LOW',
      issue:
        'The throwOnSchemaDrift:false escape hatch is COARSE — it disables BOTH halves (the error-code guard AND '
        + 'the new count-unmeasurable discriminant). All 4 opt-out sites justify their opt-out solely on the '
        + 'error-code half (they inspect error.code to degrade). 2 of the 4 (lib/utils/validation-automation.js, '
        + 'scripts/solomon-advisory.cjs) DO issue count-mode queries, so they silently forfeit the genuinely-new '
        + 'protection they never needed to give up.',
      recommendation:
        'Consider a granular opt-out (e.g. throwOnSchemaDrift:"error-code-only") so a site degrading on 42703 '
        + 'does not also lose the count===null discriminant.',
    },
    {
      severity: 'LOW',
      issue:
        'Criterion #3\'s MEASURE ("record before/after safeQuery/safeCount counts on this row") is a cheap '
        + 'obligation that is still unmet even under the supersession argument. Also, the handoff\'s figure of '
        + '"4 non-test call sites" is an OVERCOUNT: only 1 non-test file imports lib/db/safe-query.mjs '
        + '(scripts/modules/handoff/executors/exec-to-plan/gates/wiring-validation.js, 2 safeQuery call sites). '
        + 'The other grep hits are false positives — scripts/adam-self-assessment-writer.cjs defines its OWN local '
        + 'safeCount helper, and scripts/continuity/cloud-cap-feeder.mjs uses safeCount as a clamped-number '
        + 'variable name.',
      recommendation: 'Record before=2, after=2 (unchanged by this PR) on the SD row, with the supersession rationale.',
    },
  ],
  conditions: [
    {
      action:
        'Before PLAN-TO-EXEC closes: file a durable tracking row for SD criterion #4 (swallowed-query-error-lint '
        + 'enforce + widen), citing the measured baseline 228 ungoverned / exit 0 / 218 data-only + 10 count-only.',
      priority: 'high',
      blocking: true,
    },
    {
      action: 'Record criterion #3 before/after safeQuery-safeCount counts (measured: 1 file / 2 call sites, unchanged) on the SD row.',
      priority: 'medium',
      blocking: false,
    },
    {
      action: 'Consider narrowing the throwOnSchemaDrift opt-out so it does not disable the count discriminant along with the error-code guard.',
      priority: 'low',
      blocking: false,
    },
  ],
  recommendations: [
    'The #3 supersession argument is SOUND and I endorse it more strongly than the handoff states: criterion #3\'s '
    + 'measure (migrate call sites to safeQuery/safeCount) is internally INCONSISTENT with its own criterion name '
    + '("the shared client factory is the enforcement point RATHER THAN an opt-in primitive"). Migrating call sites '
    + 'to an opt-in primitive is literally the thing the criterion says it does not want. The factory default '
    + 'satisfies the criterion by a strictly stronger mechanism, covering ~946 importers (849 ESM + 97 CJS) with no '
    + 'per-call-site migration.',
    'The #4 deferral is SUBSTANTIVELY CORRECT and I do NOT think more should be attempted in this PR. The factory '
    + 'guard does not subsume the lint: it covers only the schema-drift subclass (PGRST205/42703/count-null), while '
    + '218 of the 228 findings are data-only destructures that also swallow RLS 42501, timeouts and constraint '
    + 'violations. Burning those down safely is far beyond a <=100 LOC child PR. Defer — but track it.',
  ],
  justification:
    'PASS at PLAN-TO-EXEC, superseding my prior CONDITIONAL_PASS row e748f481. The single blocking gap on that row '
    + '(criterion #1, the missing-RELATION head+count silent shape) is now genuinely closed, and I confirmed it '
    + 'WITHOUT relying on the author\'s test file: I wrote an 11-case probe harness against '
    + 'lib/supabase-client-schema-drift.cjs covering four cases the shipped suite does not test (ctx isolation '
    + 'across two queries on ONE client, count:NaN, count requested deep in a 4-link chain, and .insert().select() '
    + 'post-mutation) — all 11 behaved correctly. I also read the implementation directly and confirmed the '
    + 'discriminant is correctly gated: ctx.countRequested is set ONLY when .select() receives a truthy args[1].count, '
    + 'a fresh ctx is minted per .from()/.rpc()/.schema() call so state cannot leak between queries, and '
    + 'isCountUnavailable is byte-equivalent to fetch-all-paginated.mjs::renderCount\'s definition and to the '
    + 'COUNT_UNMEASURABLE code safeCount throws. The false-positive path is genuinely closed: an ordinary non-count '
    + 'query whose result carries count:null resolves normally (probes D/E/K), and I scanned all 423 count-mode call '
    + 'sites in the tree for the .single()/.csv() combination that could have produced a false positive — zero hits. '
    + 'Regression is measured differentially: I stashed the change and re-ran the same 9 files, getting an IDENTICAL '
    + '34 passed / 49 skipped, proving the 49 skips are pre-existing environmental gating and the change induces '
    + 'zero regression. Criteria #3/#4 are correctly NOT attempted here; #3 is superseded on the merits and #4 is a '
    + 'legitimate deferral. The verdict is PASS rather than CONDITIONAL because the corrective itself is complete '
    + 'and correct; the one blocking condition is a bookkeeping act (file the #4 tracking row), not a code defect.',
  detailed_analysis: {
    commands_executed: [
      'npx vitest run --project unit tests/unit/client-factory-schema-drift-throw.test.js -> 14 passed / 0 failed',
      'npx vitest run --project unit <9 regression files> -> 34 passed / 49 skipped / 0 failed',
      'git stash push -u <4 changed files> && re-run same 9 files -> 34 passed / 49 skipped (IDENTICAL baseline)',
      'node <own 11-case probe harness> requiring lib/supabase-client-schema-drift.cjs -> 11/11 correct',
      'node scripts/lint/swallowed-query-error-lint.mjs --list -> 228 ungoverned (218 data-only, 10 count-only), exit 0',
      'grep count-mode call sites tree-wide -> 423; combined with .single()/.csv() -> 0 (no false-positive exposure)',
    ],
    criterion1_now_met_probe: {
      missing_relation_head_count: '{error:null, count:null, status:204} -> REJECTED with code COUNT_UNMEASURABLE',
      real_table_count_1155: 'RESOLVED (correct)',
      real_table_count_0: 'RESOLVED (correct — 0 is a measured answer, not an absence)',
      ordinary_non_count_query_count_null: 'RESOLVED (correct — no false positive)',
      count_requested_deep_in_chain: 'REJECTED (correct — ctx threads through .eq().order().limit())',
      ctx_isolation_two_queries_one_client: 'second ordinary query RESOLVED (correct — no state leak)',
      genuine_error_on_count_query: 'REJECTED with PGRST205 (error-code half still fires first)',
    },
    criteria_disposition_assessment: {
      criterion_1: 'MET — verified independently, was the blocking gap on row e748f481',
      criterion_2: 'MET — 42703 control present and correctly framed as regression-guard-only, not the corrective',
      criterion_3: 'SUPERSEDED ON THE MERITS — factory default enforcement covers ~946 importers; the criterion measure contradicts its own criterion name. Endorsed.',
      criterion_4: 'CORRECTLY DEFERRED — factory does not subsume the lint (218/228 findings are non-schema-drift classes). Deferral endorsed; TRACKING is the open condition.',
    },
    claims_verified: {
      'claim_14_tests_pass': 'TRUE — 14/14, independently executed',
      'claim_count_logic_real': 'TRUE — read implementation + 11 own probes, incl. 4 cases the suite omits',
      'claim_no_false_positive_on_ordinary_query': 'TRUE — ctx.countRequested gates on args[1].count only',
      'claim_renderCount_parity': 'TRUE — isCountUnavailable is the exact negation of renderCount\'s measured-number test',
      'claim_no_regressions': 'TRUE — differential baseline identical (stash/re-run), stronger than the asserted claim',
      'claim_cjs_gap_closed': 'TRUE — tests 13/14 assert one shared implementation; my probe exercised the CJS module behaviorally via require()',
      'claim_4_safeQuery_call_sites': 'OVERCOUNT — true figure is 1 file / 2 call sites; other hits are local same-named helpers',
      'claim_228_lint_findings': 'TRUE — exactly 228, exit 0 (advisory)',
      'claim_criterion4_is_tracked': 'FALSE — no tracking row exists; see MEDIUM warning',
    },
    e2e_applicability: 'NOT APPLICABLE — backend library seam, no UI surface; SD criteria specify unit probes.',
  },
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: runnerJson.numTotalTests,
      passed: runnerJson.numPassedTests,
      failed: runnerJson.numFailedTests,
      skipped: runnerJson.numPendingTests,
      artifactSha: contentHash,
      runner: 'vitest@4.1.4 --project unit --reporter=json',
      artifactPath: '.artifacts/testing-schema-truth-001A-v2.json',
      source: 'fresh',
    }),
    independent_probe: {
      note: 'authored by this agent, NOT the SD author; covers 4 cases the shipped suite omits',
      cases: 11,
      passed: 11,
      omitted_cases_covered: ['ctx isolation across queries', 'count:NaN', 'deep-chain count', 'insert().select() post-mutation'],
    },
    regression_baseline_differential: {
      method: 'git stash push -u of the 4 changed files, re-run identical 9-file set, then stash pop',
      before: { passed: 34, skipped: 49, failed: 0 },
      after: { passed: 34, skipped: 49, failed: 0 },
      conclusion: 'identical — 49 skips are pre-existing environmental gating, zero regression induced',
    },
    criterion_measurements: {
      safeQuery_safeCount_adoption_before: 2,
      safeQuery_safeCount_adoption_after: 2,
      safeQuery_adoption_files: 1,
      lint_findings: 228,
      lint_data_only: 218,
      lint_count_only: 10,
      lint_exit_code: 0,
      count_mode_call_sites_tree_wide: 423,
    },
    evidence_provenance: {
      producer: 'vitest v4.1.4 --reporter=json (runner-written, not hand-authored)',
      artifact_path: '.artifacts/testing-schema-truth-001A-v2.json',
      content_sha256: contentHash,
      run_commit_sha: headSha,
      num_total_tests: runnerJson.numTotalTests,
      num_passed_tests: runnerJson.numPassedTests,
      num_failed_tests: runnerJson.numFailedTests,
      runner_success: runnerJson.success,
    },
    supersedes_row: 'e748f481-19d9-4b50-8a63-d8a9c8574644',
    supersede_reason:
      'prior row blocked on SD criterion #1 (missing-RELATION head+count silent shape) being unmet by construction; '
      + 'that gap is now closed and independently re-verified, so the CONDITIONAL_PASS is stale',
    e2e_applicable: false,
    unit_tests_passed: true,
  },
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'tests/unit/client-factory-schema-drift-throw.test.js',
  supabase,
});
console.log('resolution:', JSON.stringify(resolution));

applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('TESTING', SD_ID, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
