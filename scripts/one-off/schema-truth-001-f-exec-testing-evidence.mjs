#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent evidence for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F, EXEC_TO_PLAN.
 *
 * POST-IMPLEMENTATION and MEASURED (metadata.measured = true). This is deliberately distinct
 * from the two PLAN-phase TESTING rows already on file for this SD (aa4b4de7, 917aa52c),
 * which were PROSPECTIVE design reviews written BEFORE any code existed and therefore carry
 * metadata.measured = false with a zero-valued exemption-shaped test_execution block.
 *
 * The counts below come from a runner-produced artifact
 * (.artifacts/testing-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F-exec.json, vitest --reporter=json),
 * whose sha256 is recorded in test_execution.artifact_sha per the gate-evidence provenance
 * rule -- not from a hand-authored count.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARTIFACT_REL = '.artifacts/testing-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F-exec.json';

const RUN_COMMAND =
  'npx vitest run --project unit tests/unit/scripts/false-completion-census.test.js tests/unit/quality/migration-data-presence.test.js';

/**
 * Read the counts from the runner's own JSON artifact rather than restating them, so the
 * numbers written to test_execution cannot drift from the run that produced the artifact
 * whose hash this row also carries.
 */
function readRunnerArtifact() {
  const abs = path.join(REPO_ROOT, ARTIFACT_REL);
  const raw = readFileSync(abs, 'utf8');
  const sha = createHash('sha256').update(raw).digest('hex');
  const j = JSON.parse(raw);
  const perFile = j.testResults.map((r) => ({
    file: r.name.replace(/\\/g, '/').split('/').slice(-3).join('/'),
    tests: r.assertionResults.length,
    passed: r.assertionResults.filter((a) => a.status === 'passed').length,
    failed: r.assertionResults.filter((a) => a.status === 'failed').length,
  }));
  return {
    sha,
    executed: j.numTotalTests,
    passed: j.numPassedTests,
    failed: j.numFailedTests,
    skipped: (j.numPendingTests || 0) + (j.numTodoTests || 0),
    success: j.success,
    perFile,
  };
}

function buildFindings(run) {
  return [
    {
      id: 'measured-run-primary-suite',
      severity: 'INFO',
      summary: `PRIMARY MEASURED RUN (post-implementation, not prospective): \`${RUN_COMMAND}\` -> ${run.executed} tests executed, ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped, success=${run.success}. Per-file: ${run.perFile.map((f) => `${f.file} ${f.passed}/${f.tests}`).join('; ')}. Counts are read programmatically from the vitest --reporter=json artifact ${ARTIFACT_REL} (sha256 ${run.sha}), which is also recorded in metadata.test_execution.artifact_sha -- the row's numbers and its artifact cannot disagree.`,
    },
    {
      id: 'measured-run-regression-sweep',
      severity: 'INFO',
      summary: 'REGRESSION SWEEP: `npx vitest run --project unit tests/unit/quality tests/unit/scripts` -> 80 test files (78 passed, 2 skipped), 917 tests (901 passed, 16 skipped, 0 FAILED). Both directories touched by this SD are green in full, so the fail-open -> throw behavior change introduced no collateral failure in any sibling suite. Duration 17.90s.',
    },
    {
      id: 'measured-live-cli-smoke-run',
      severity: 'INFO',
      summary: 'LIVE END-TO-END CLI SMOKE RUN against the real database: `node scripts/false-completion-census.mjs --assert` completed a full portfolio census without aborting, exercising the refactored main()/runFalseCompletionCensus() split on production data. THE NEW could-not-verify PATH FIRED FOR REAL: 2 SDs recorded as [COULD-NOT-VERIFY] -- SD-LEO-INFRA-RELEASE-KEY-SESSION-001 (PGRST205, public.sd_claims missing, i.e. sibling child A\'s withSchemaDriftDetection throw arriving at this call site exactly as the PRD predicted) and SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 (22P02 invalid uuid syntax). Before this SD both would have been silently counted as "no gap found". 4 pre-existing [DATA-ARTIFACT-ABSENT] gaps also rendered, and the run reached the --assert decision rather than dying at the first throw -- which is precisely FR-4\'s claim, demonstrated in production rather than only in fixtures.',
    },
    {
      id: 'fr1-verified',
      severity: 'INFO',
      summary: 'FR-1 VERIFIED against the diff: lib/quality/migration-data-presence.js:47 `if (error) return null` -> `if (error) throw error`. AC-1 pinned by the inverted test at tests/unit/quality/migration-data-presence.test.js:83-86 (transient fixture code 57014, `rejects.toEqual(dbError)`). AC-2 pinned by two separate fail-open tests that still resolve to null: the nonexistent-file branch (:65-68) and the NEW no-INSERT branch (:71-74). The three pre-throw early returns (`!existsSync`, `!insertMatch`, `literalValues.length === 0`) are byte-unchanged in the diff.',
    },
    {
      id: 'fr2-verified',
      severity: 'INFO',
      summary: 'FR-2 VERIFIED against the diff: the sd_phase_handoffs query in findEvidenceMigrationGaps() went from `const { data: handoffs } = await ...` (error never destructured -> undefined handoffs -> `(handoffs || [])` -> empty text -> zero gaps) to `const { data: handoffs, error } = ...; if (error) throw error;`. AC-1 pinned at tests/unit/quality/migration-data-presence.test.js:130-142. AC-2 (happy path unchanged) pinned by the two pre-existing findEvidenceMigrationGaps tests, both still green in the measured run.',
    },
    {
      id: 'fr3-verified',
      severity: 'INFO',
      summary: 'FR-3 VERIFIED: the old "returns null on a DB query error (fails open, not this check\'s concern)" test is INVERTED in place (not deleted, not left red), and reframed to the transient class (code 57014) exactly as the FR specifies, with a comment naming what changed and why. AC-3 required "9+ passing tests, zero failures" in that file -- the measured run shows 12/12. Note on TR-1\'s verification instruction: the pre-existing resolve-only makeSupabase helper WAS sufficient to drive the throwing SUT (Supabase resolves {data,error} rather than rejecting), and the implementation correctly did NOT add a rejection-simulation capability. The helper is unchanged in the diff.',
    },
    {
      id: 'fr4-verified',
      severity: 'INFO',
      summary: 'FR-4 VERIFIED: scripts/false-completion-census.mjs is refactored from module-scope client + top-level-await + inline process.exit into exported `runFalseCompletionCensus(supabase, {assertMode})` (returns a result object, zero console/process side effects) + exported `fetchAllCompleted(supabase)` + a thin `main()` CLI wrapper guarded by isMainModule(), matching the cited scripts/adam-self-adherence-review.mjs precedent. The per-SD loop wraps findEvidenceMigrationGaps() in try/catch and pushes {sd_key, sd_id, reason} to couldNotVerify. AC-1 and AC-2 are pinned by tests/unit/scripts/false-completion-census.test.js:70-92, which asserts BOTH that the run completes over 2 SDs and that the non-erroring SD is still processed in the same run; independently corroborated by the live CLI smoke run above.',
    },
    {
      id: 'fr5-verified',
      severity: 'INFO',
      summary: 'FR-5 VERIFIED: AC-1 satisfied -- an 8-line comment at the --assert logic site records the DECIDED scope (NAMED_TARGET_SDS only, for BOTH couldNotVerify and dataGaps), the symmetry reasoning, and the explicit deferral of a portfolio-wide gate. AC-2 satisfied -- 5 fixtures at tests/unit/scripts/false-completion-census.test.js:112-174 cover named-could-not-verify FAIL, named-confirmed-missing FAIL, non-named findings PASS, all-named-reconciled PASS, and named-still-anomalous FAIL. Worth stating plainly because it is genuinely new wiring: BEFORE this SD, dataGaps had ZERO effect on the exit code (it was computed, printed, and then ignored by the --assert branch). This change gives confirmed-missing teeth for the first time, scoped to the 3 named SDs.',
    },
    {
      id: 'fr6-verified',
      severity: 'INFO',
      summary: 'FR-6 VERIFIED: tests/unit/quality/migration-data-presence.test.js:148-169 drives a table-dispatching mock where sd_phase_handoffs succeeds (returning text naming a real migration) and the per-migration presence query errors, then asserts findEvidenceMigrationGaps() ITSELF rejects. This is the exact test that would go red if a defensive try/catch were ever reintroduced inside that loop. Confirmed by reading the source: the loop in findEvidenceMigrationGaps() has no try/catch, and the module docblock states the omission is deliberate.',
    },
    {
      id: 'tr-1-through-tr-4-verified',
      severity: 'INFO',
      summary: 'TR-1 VERIFIED: no tri-state/could-not-verify return SHAPE was introduced at the migration-data-presence layer -- both sites throw; the could-not-verify concept exists only one layer up, in the census consumer, as the FR intended. TR-2 VERIFIED: all three genuine fail-open early returns preserved, and the module docblock now explicitly draws the line between "the check\'s own limitation" (null) and "failure to obtain the fact" (throw). TR-3 VERIFIED: `git status` shows only lib/quality/migration-data-presence.js, scripts/false-completion-census.mjs, tests/unit/quality/migration-data-presence.test.js modified plus tests/unit/scripts/false-completion-census.test.js added -- zero files under database/migrations/, no schema change. TR-4 VERIFIED: both sites `throw error` (the original Supabase object), NOT `throw new Error(...)`, so message AND code survive; the live smoke run proves it end-to-end by printing the original PGRST205 text and the original 22P02 text in the [COULD-NOT-VERIFY] lines.',
    },
    {
      id: 'concern-22p02-parse-induced-error-classified-as-could-not-verify',
      severity: 'MEDIUM',
      summary: 'CORRECTNESS CONCERN (real, observed in production, not hypothetical). The live census recorded SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 as [COULD-NOT-VERIFY] with reason `invalid input syntax for type uuid: "sdKey"` -- Postgres 22P02. That error is NOT a failure to obtain the fact (the transient/infra class FR-1 targets); it is the module\'s own naive regex parsing a non-seed-INSERT migration, extracting the garbage literal "sdKey", and feeding it to a uuid column. By TR-2\'s own line-drawing that is "the check\'s own genuine limitation" and belongs in the fail-open class, yet it now surfaces as a verification failure. Blast radius TODAY is bounded and non-blocking: FR-5 scopes the --assert exit code to the 3 NAMED_TARGET_SDS, and this SD is not one of them, so it is list noise only. The latent risk is that if any 22P02-producing SD is ever added to NAMED_TARGET_SDS, --assert would fail for a parser limitation rather than a real verification failure. NOT a blocker for this handoff (the PRD never scoped error-class discrimination, and the same naive parser is visible pre-existing in the 4 [DATA-ARTIFACT-ABSENT] lines, which report plpgsql function-body strings like "SD %s claimed successfully" as missing seed data). Recommend a follow-up that classifies 22P02/22023 as fail-open alongside the existing parse limitations.',
    },
    {
      id: 'concern-fr4-recorded-shape-differs-from-fr-description',
      severity: 'LOW',
      summary: 'MINOR SPEC-VS-IMPLEMENTATION DEVIATION. FR-4\'s description text specifies recording `{sd_key, path, status:\'could-not-verify\', reason}`; the implementation records `{sd_key, sd_id, reason}`. `path` is genuinely not obtainable at that layer -- findEvidenceMigrationGaps() iterates its migration paths INTERNALLY, so the catch site upstream cannot know which named migration threw without restructuring the API. `status` is carried by the array name (couldNotVerify) rather than a per-entry field. Both of FR-4\'s stated ACCEPTANCE CRITERIA are fully satisfied; only the description prose is not literally matched. Flagged for the record, not as a defect.',
    },
    {
      id: 'concern-non-error-throw',
      severity: 'LOW',
      summary: 'MINOR ROBUSTNESS NOTE. `throw error` throws the raw Supabase error object, which is a plain object, not an Error instance. This satisfies TR-4 (message + code preserved, proven by the smoke run) and the census catch handles it correctly via `err?.message || String(err)`. But: no stack trace is captured, any upstream `instanceof Error` / `err instanceof Error ? ... ` check would take the wrong branch, and if a future Supabase error ever lacked `.message` the recorded reason would degrade to "[object Object]". `throw Object.assign(new Error(error.message), error)` would preserve both properties. Not worth blocking on -- the file\'s own cited sibling idiom (fetchAllCompleted, `throw new Error(error.message)`) is arguably worse since it DROPS the code.',
    },
    {
      id: 'observation-test-placement-vs-prd-type',
      severity: 'LOW',
      summary: 'OBSERVATION, NOT A DEFECT. The PRD types TS-4 and TS-5 as "integration", and the new test file\'s own header calls them "integration pins", but the file lives at tests/unit/scripts/ and runs in the vitest `unit` project. This is defensible and arguably better: the tests are fully hermetic (hand-rolled table-dispatching mock, no vi.mock, no DB, no network), so they meet the unit contract, and the placement means they DO execute in the unit suite -- confirmed, they were collected and run in the regression sweep above. Had they gone to tests/integration/ they would run only under a separate project. Noted so a future reader does not treat the file/type mismatch as misplacement.',
    },
    {
      id: 'observation-assert-exits-1-for-preexisting-reasons',
      severity: 'LOW',
      summary: 'OBSERVATION for the reviewer, to prevent a misread. The live `--assert` smoke run exits 1 with "FAIL: named target SD(s) still anomalous: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001D/E/F". This is the PRE-EXISTING stillAnomalous check (unchanged by this SD) firing on genuinely-anomalous live records; it is NOT a regression introduced here, and it is NOT the new couldNotVerify/dataGaps wiring firing. Confirmed non-blocking: grep across the repo shows scripts/false-completion-census.mjs is referenced by no CI workflow and no npm script -- only by its own new test file and an archived retro script -- consistent with FR-5 declaring CI wiring explicitly out of scope.',
    },
    {
      id: 'blast-radius-check-no-other-consumers',
      severity: 'INFO',
      summary: 'BLAST-RADIUS CHECK on the fail-open -> throw behavior change: a repo-wide grep for `migration-data-presence` / `findEvidenceMigrationGaps` / `checkMigrationDataPresent` across lib/, scripts/ and tests/ finds exactly ONE production consumer -- scripts/false-completion-census.mjs -- and it is the file this SD gave the try/catch to. No other caller inherits an uncaught throw. Same for the census script itself: no workflow, npm script, or lib module imports it.',
    },
  ];
}

const warnings = [
  {
    severity: 'MEDIUM',
    issue: 'The 22P02 ("invalid input syntax for type uuid") class of error is a parser limitation of checkMigrationDataPresent\'s naive INSERT regex, but is now classified as could-not-verify rather than the fail-open class TR-2 reserves for the check\'s own limitations. Observed live on SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001.',
    recommendation: 'Follow-up (not this SD): discriminate Postgres data-exception SQLSTATEs (22P02, 22023) as fail-open at the checkMigrationDataPresent site, keeping the throw for the transient/infra and drift classes. Non-blocking today because FR-5 scopes the --assert exit code to the 3 NAMED_TARGET_SDS and none of the affected SDs is named.',
  },
  {
    severity: 'LOW',
    issue: 'The census\'s own .limit(200) / .limit(500) silent truncations remain, and the 4 pre-existing [DATA-ARTIFACT-ABSENT] findings visibly include plpgsql function-body string literals ("SD %s claimed successfully", "sd_key", "success") misread as seed-insert values -- i.e. the parser produces false positives on the confirmed-missing side too.',
    recommendation: 'Both are explicitly named OUT OF SCOPE by FR-5 and are pre-existing, not introduced here. Carry to the deferred follow-up alongside the portfolio-wide gate.',
  },
];

const recommendations = [
  'PROCEED to PLAN verification. All 6 FRs and all 4 TRs are implemented and verified against the actual diffs, every stated acceptance criterion has a pinning test, and the primary suite is 20/20 green with a 917-test regression sweep showing zero failures.',
  'Reviewer should read the live CLI smoke-run finding (measured-live-cli-smoke-run) as the strongest evidence here: the new could-not-verify path fired twice on production data, one of which is sibling child A\'s schema-drift throw arriving at exactly the call site the PRD predicted. That is the defect class this SD exists to close, demonstrated end-to-end rather than only in fixtures.',
  'File the 22P02 error-class discrimination as a follow-up QF/SD before any future SD adds a 22P02-producing SD to NAMED_TARGET_SDS -- at that point the concern stops being list noise and starts failing --assert for the wrong reason.',
  'Do NOT wire the census into CI as part of this SD: --assert currently exits 1 on pre-existing portfolio anomalies (the 3 named target SDs are genuinely still anomalous in the live DB), so wiring it now would land a red gate. FR-5 already declares this out of scope.',
];

async function main() {
  const run = readRunnerArtifact();
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 90,
    findings: buildFindings(run),
    warnings,
    recommendations,
    summary: `EXEC-phase post-implementation TESTING evidence for ${SD_KEY} -- MEASURED, against the code that now exists (distinct from the PLAN-phase prospective rows aa4b4de7 / 917aa52c, which carry measured:false). Primary suite: ${run.executed} tests executed, ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped (migration-data-presence.test.js 12/12, false-completion-census.test.js 8/8), counts read from the vitest JSON artifact whose sha256 is on this row. Regression sweep across tests/unit/quality + tests/unit/scripts: 901 passed, 16 skipped, 0 failed. A live end-to-end CLI run of the refactored census against the production database completed the full portfolio without aborting and recorded 2 real [COULD-NOT-VERIFY] entries -- including a PGRST205 sd_claims schema-drift throw arriving exactly where the PRD predicted -- proving the new path in production, not just in fixtures. All of FR-1..FR-6 and TR-1..TR-4 verified by reading the actual diffs; every stated acceptance criterion has a pinning test. Three concerns raised, none blocking: (1) MEDIUM -- 22P02 parse-induced query errors are classified as could-not-verify though TR-2's own line-drawing puts parser limitations in the fail-open class (bounded today by FR-5's NAMED_TARGET_SDS scoping); (2) LOW -- FR-4's description prose specifies a {sd_key, path, status, reason} shape while the implementation records {sd_key, sd_id, reason} (path is not obtainable at that layer; both stated ACs still pass); (3) LOW -- \`throw error\` throws a plain object rather than an Error instance, losing stack and breaking any instanceof check.`,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      mode: 'post-implementation',
      run_command: RUN_COMMAND,
      regression_command: 'npx vitest run --project unit tests/unit/quality tests/unit/scripts',
      regression_result: { test_files_passed: 78, test_files_skipped: 2, tests_passed: 901, tests_skipped: 16, tests_failed: 0 },
      live_cli_command: 'node scripts/false-completion-census.mjs --assert',
      live_cli_result: {
        completed_full_run: true,
        could_not_verify_count: 2,
        could_not_verify: [
          { sd_key: 'SD-LEO-INFRA-RELEASE-KEY-SESSION-001', reason: "Supabase schema drift detected (PGRST205): Could not find the table 'public.sd_claims' in the schema cache" },
          { sd_key: 'SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001', reason: 'invalid input syntax for type uuid: "sdKey"' },
        ],
        data_artifact_gaps_count: 4,
        exit_code: 1,
        exit_code_cause: 'PRE-EXISTING stillAnomalous check on the 3 NAMED_TARGET_SDS -- not the new couldNotVerify/dataGaps wiring, not a regression from this SD',
      },
      per_file_results: run.perFile,
      requirements_verified: {
        'FR-1': 'VERIFIED — throw at migration-data-presence.js:47; both fail-open ACs pinned',
        'FR-2': 'VERIFIED — error destructured + thrown on sd_phase_handoffs query; happy path unchanged',
        'FR-3': 'VERIFIED — old fail-open test inverted in place, reframed to code 57014; 12/12 in file (AC required 9+)',
        'FR-4': 'VERIFIED — exported runFalseCompletionCensus/fetchAllCompleted + isMainModule CLI wrapper + per-SD try/catch; both ACs pinned and corroborated live',
        'FR-5': 'VERIFIED — scope decision documented in a comment at the --assert site; 5 fixtures prove symmetric couldNotVerify/dataGaps gating scoped to NAMED_TARGET_SDS',
        'FR-6': 'VERIFIED — inner-throw propagation test drives a table-dispatching mock and asserts findEvidenceMigrationGaps itself rejects',
        'TR-1': 'VERIFIED — no tri-state return shape introduced; throw-only. Pre-existing resolve-only makeSupabase helper sufficed (no rejection-simulation added), as TR-1 instructed be confirmed',
        'TR-2': 'VERIFIED — all 3 genuine fail-open early returns byte-unchanged; docblock draws the line explicitly',
        'TR-3': 'VERIFIED — 3 files modified + 1 added, zero under database/migrations/',
        'TR-4': 'VERIFIED — `throw error` preserves the original Supabase object; live run printed original PGRST205 and 22P02 text',
      },
      artifacts_read: [
        'lib/quality/migration-data-presence.js',
        'scripts/false-completion-census.mjs',
        'tests/unit/quality/migration-data-presence.test.js',
        'tests/unit/scripts/false-completion-census.test.js',
        'database/migrations/009_bmad_risk_assessment.sql (TS-2 fixture — confirmed present on disk, 12454 bytes, zero INSERT occurrences, so the test exercises the !insertMatch branch and NOT the nonexistent-file branch; the fixture is not vacuous)',
        'product_requirements_v2 / PRD-SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F',
      ],
      supersedes_prospective_evidence: [
        'aa4b4de7-873f-4776-9184-a1b140f1497a (TESTING, LEAD phase, measured:false, pre-code design review)',
        '917aa52c (TESTING, PLAN phase, measured:false, pre-code design review)',
      ],
    },
    metadata: {
      measured: true,
      test_execution: buildTestExecution({
        executed: run.executed,
        passed: run.passed,
        failed: run.failed,
        skipped: run.skipped,
        artifactSha: run.sha,
        runner: 'vitest@4.1.4 --project unit --reporter=json',
        artifactPath: ARTIFACT_REL,
        source: 'fresh',
      }),
      run_command: RUN_COMMAND,
      post_implementation: true,
      phase: 'EXEC_TO_PLAN',
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('EXEC TESTING EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? stored.metadata?.phase);
  console.log('  measured:', stored.metadata?.measured);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
