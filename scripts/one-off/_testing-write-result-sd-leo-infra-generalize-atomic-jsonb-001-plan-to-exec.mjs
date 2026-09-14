#!/usr/bin/env node
/**
 * Persist TESTING evidence for SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001's PLAN-TO-EXEC handoff.
 *
 * The verification was performed by the TESTING sub-agent (Task tool) in the worktree
 * .worktrees/SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001, INDEPENDENTLY of the SD's own claims:
 * a full read of the refactored module and both test files, a byte-parity probe proving the
 * three legacy wrappers emit SQL and param arrays byte-identical to the pre-refactor literals,
 * four independently applied-and-reverted production mutations, an independent consumer sweep
 * (git grep, then a derived indirect-consumer sweep the brief did not ask for), a full
 * `--project unit` tier run, and an independent re-derivation of the SD's own "pre-existing
 * WHERE-clause coverage gap" claim from the parent commit's test file.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts written to
 * metadata.test_execution are NOT hand-typed here. They are read at write time out of the
 * vitest-written JSON reports, and each file's sha256 is computed here, so the verdict points
 * at runner-produced artifacts rather than at a claim. Regenerate with:
 *
 *   npx vitest run --project unit <the 18 files listed in metadata.test_files_executed> \
 *     --reporter=json --outputFile=.artifacts/testing/jsonb-001-plan-to-exec-consumers.json
 *   npx vitest run --project unit tests/unit/coordinator/safe-metadata-merge.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/jsonb-001-plan-to-exec-safe-merge.json
 *   npx vitest run --project unit tests/unit/coordinator/generic-jsonb-merge.test.js \
 *     --reporter=json --outputFile=.artifacts/testing/jsonb-001-plan-to-exec-generic-core.json
 *   npx vitest run --project unit \
 *     --reporter=json --outputFile=.artifacts/testing/jsonb-001-plan-to-exec-full-unit.json
 *
 * The last of those four is a ~20MB runner file and is deliberately NOT committed. A
 * programmatically-derived condensate (…-full-unit-summary.json) IS committed and carries the
 * 20MB file's sha256 inside it, so the derivation stays verifiable against the runner output.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001';

// PRIMARY artifact: every test file that references lib/coordinator/safe-metadata-merge.mjs
// (directly or via vi.mock), independently enumerated with `git grep -l`. Its counts are what
// metadata.test_execution reports, so artifact_sha and the counters describe the same run.
const ARTIFACT_CONSUMERS = '.artifacts/testing/jsonb-001-plan-to-exec-consumers.json';
// Corroborating artifacts, hashed and recorded but not the counter source.
const ARTIFACT_SAFE_MERGE = '.artifacts/testing/jsonb-001-plan-to-exec-safe-merge.json';
const ARTIFACT_GENERIC = '.artifacts/testing/jsonb-001-plan-to-exec-generic-core.json';
// Condensate of the full `unit` tier run (its own `derived_from.sha256` names the 20MB source).
const ARTIFACT_FULL_UNIT_SUMMARY = '.artifacts/testing/jsonb-001-plan-to-exec-full-unit-summary.json';

// Production file under test; hashes taken pre-mutation and again post-restore.
const GUARDED_FILE = 'lib/coordinator/safe-metadata-merge.mjs';
const GUARDED_FILE_SHA256 = '34dcbfb671991ae5f7ada208d37fb00b0fade61b5230af40e8da544c2726c647';
const GUARDED_FILE_GIT_BLOB = 'f0b705d0a875a38c00f7c629ba0929c76e74b498';

const TEST_FILES_EXECUTED = [
  'tests/unit/apa/journey-walk-orchestrator.test.js',
  'tests/unit/chairman/chairman-gated-decision-row-guard-batch-escalation.test.js',
  'tests/unit/chairman/chairman-gated-decision-row-guard.test.js',
  'tests/unit/checkin/directed-assignment-marker-write.test.js',
  'tests/unit/coordinator/generic-jsonb-merge.test.js',
  'tests/unit/coordinator/safe-metadata-merge.test.js',
  'tests/unit/eva/bridge/venture-build-consumer.test.js',
  'tests/unit/eva/bridge/venture-build-merge-witness.test.js',
  'tests/unit/fleet/attention-flag-writer.test.js',
  'tests/unit/fleet/claim-eligibility-release-hold.test.js',
  'tests/unit/fleet/claim-eligibility-set-hold.test.js',
  'tests/unit/fleet/hold-writer.test.js',
  'tests/unit/fleet/qf-metadata-merge.test.js',
  'tests/unit/fleet/release-request.test.js',
  'tests/unit/fleet/stamp-model-recommendation.test.js',
  'tests/unit/governance/human-action-decider.test.js',
  'tests/unit/scripts/reconcile-stale-chairman-holds.test.js',
  'tests/unit/sd/amend-sd.test.js',
];

/** Read a vitest JSON report and derive both the counts and the artifact hash from it. */
function readRunnerArtifact(p) {
  const raw = readFileSync(p);
  const sha = createHash('sha256').update(raw).digest('hex');
  const report = JSON.parse(raw.toString('utf8'));
  return {
    path: p,
    sha,
    executed: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests ?? 0,
    files: report.testResults?.length ?? 0,
    success: report.success,
  };
}

/** Read the derived full-tier condensate (same counter key names, plus derived_from). */
function readFullUnitSummary(p) {
  const raw = readFileSync(p);
  const sha = createHash('sha256').update(raw).digest('hex');
  const s = JSON.parse(raw.toString('utf8'));
  return {
    path: p,
    sha,
    executed: s.numTotalTests,
    passed: s.numPassedTests,
    failed: s.numFailedTests,
    skipped: s.numPendingTests ?? 0,
    files: s.numFiles,
    success: s.success,
    derivedFrom: s.derived_from,
    failedFiles: s.failedFiles || [],
  };
}

function buildSummary(consumers, safeMerge, generic, fullUnit) {
  return 'PASS -- the refactor is exactly what it claims and the new tests are non-vacuous. ' +
    'VERIFIED BY DIRECT EXECUTION, BYTE-PARITY PROBE AND MUTATION, not by reading the SD\'s ' +
    'own claims. ' +
    '(1) SIGNATURE/BEHAVIOR PARITY PROVEN MECHANICALLY, not asserted: the diff of ' +
    GUARDED_FILE + ' at 5afccc8019d leaves all three original export declaration lines ' +
    'untouched (mergeMetadataKeys(sdKey, patch, opts = {}), removeMetadataKey(sdKey, key, ' +
    'opts = {}), removeMetadataKeyIfClaimedBy(id, key, claimingSessionId, opts = {})) and ' +
    'changes only their SQL-issuing bodies. A probe then drove the new generic core with each ' +
    'wrapper\'s exact arguments and compared the emitted SQL string and param array against ' +
    'the pre-refactor literals copied verbatim out of 5afccc8019d^: all 3 are BYTE-IDENTICAL ' +
    '(sql=true params=true for merge, remove, and the claim-CAS remove). The COALESCE ' +
    'NULL-guard, the $1/$2/$3 bind numbering and the "AND claiming_session_id = $3" tail all ' +
    'survive interpolation unchanged. ' +
    '(2) GREEN RUNS, counts read from vitest-written JSON, never hand-typed: ' +
    'safe-metadata-merge.test.js ' + safeMerge.passed + '/' + safeMerge.executed + ' ' +
    '(13 pre-existing + 11 new -- both figures independently re-derived by counting `it(` ' +
    'blocks in 5afccc8019d^ = 13 and in HEAD = 24); generic-jsonb-merge.test.js ' +
    generic.passed + '/' + generic.executed + '; the full independently-enumerated consumer ' +
    'set ' + consumers.passed + '/' + consumers.executed + ' across ' + consumers.files + ' ' +
    'files, 0 failed, 0 skipped; and the WHOLE `unit` tier ' + fullUnit.passed + '/' +
    fullUnit.executed + ' across ' + fullUnit.files + ' files, 0 failed, ' + fullUnit.skipped +
    ' pre-existing skips, success=true. Zero regressions anywhere. ' +
    '(3) NON-VACUITY PROVEN BY 4 MUTATIONS of the real production module, each applied, run, ' +
    'and reverted; each killed by EXACTLY its intended test with no collateral failure: ' +
    '(a) :192 keyColumn \'sd_key\'->\'id\' in the mergeMetadataKeys delegation -> 1 failure, ' +
    'the newly-added `WHERE sd_key = $1` assertion (23/24); (b) :129 the extraGuardSql append ' +
    'dropped from removeJsonbColumnKey\'s WHERE -> 1 failure, the new claim-CAS test (23/24), ' +
    'and re-run across ALL 269 consumer tests it was still the ONLY failure; (c) :77 the ' +
    'keyColumn allowlist check short-circuited with `if (false && ...)` -> 1 failure, the new ' +
    '"refuses a keyColumn not listed for that table" allowlist test (8/9); (d) :130 bind-param ' +
    'order swapped to [keyValue, ...extraGuardParams, key] -> 1 failure, the new claim-CAS ' +
    'params assertion (23/24). 4 applied, 4 killed, 0 survived. ' +
    '(4) CLEAN RESTORE VERIFIED BY HASH after every mutation: post-restore sha256 ' +
    GUARDED_FILE_SHA256 + ' and git blob ' + GUARDED_FILE_GIT_BLOB + ' match the pre-mutation ' +
    'values exactly; git diff on that path empty; git status --porcelain ' +
    '--untracked-files=no empty. No mutant is left in the tree. ' +
    '(5) THE "PRE-EXISTING GAP" CLAIM IS GENUINE, re-derived independently rather than read ' +
    'from the commit message. In 5afccc8019d^ the test file made exactly three SQL assertions ' +
    '(/\\|\\|/, /^\\s*UPDATE strategic_directives_v2/i, /COALESCE\\(metadata/i) -- not one of ' +
    'them constrains the key column, so a sd_key->id swap left the whole 13-test suite green. ' +
    'Mutation (a) above reproduces this empirically: under the mutant, all 23 OTHER tests in ' +
    'the file pass and the single failure is the new `WHERE sd_key = $1` line. The assertion ' +
    'is therefore load-bearing, not decoration. ' +
    '(6) TWO COUNT CORRECTIONS TO THE COMMIT MESSAGE (substance holds, arithmetic does not): ' +
    'the message claims "277 tests across 19 files"; the independently-enumerated set is 18 ' +
    'TEST files (the 19th git-grep hit, tests/fixtures/retro-handoff-classification-snapshot' +
    '.json, is a fixture that merely mentions the filename in prose) and the measured total is ' +
    consumers.executed + ', not 277 -- identical with and without --project unit, so it is not ' +
    'a project-filter artifact. Cosmetic; "all green, zero call-site changes" is confirmed.';
}

async function main() {
  const consumers = readRunnerArtifact(ARTIFACT_CONSUMERS);
  const safeMerge = readRunnerArtifact(ARTIFACT_SAFE_MERGE);
  const generic = readRunnerArtifact(ARTIFACT_GENERIC);
  const fullUnit = readFullUnitSummary(ARTIFACT_FULL_UNIT_SUMMARY);

  for (const a of [consumers, safeMerge, generic, fullUnit]) {
    if (!a.success || a.failed > 0 || a.executed <= 0) {
      console.error(
        `REFUSING to write PASS: runner artifact ${a.path} reports success=${a.success}, ` +
        `executed=${a.executed}, failed=${a.failed}.`
      );
      process.exit(1);
    }
  }
  // Guard the two headline per-file counts the summary quotes, so a stale artifact cannot
  // silently publish the wrong "13 pre-existing + 11 new = 24" / "9" arithmetic.
  if (safeMerge.executed !== 24 || generic.executed !== 9) {
    console.error(
      `REFUSING to write: expected 24 tests in safe-metadata-merge.test.js and 9 in ` +
      `generic-jsonb-merge.test.js; artifacts report ${safeMerge.executed} and ${generic.executed}.`
    );
    process.exit(1);
  }

  const summary = buildSummary(consumers, safeMerge, generic, fullUnit);
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings: [
      {
        id: 'T1-sql-byte-parity-proven',
        severity: 'INFO',
        summary: `Zero-behavior-change is PROVEN, not claimed. The generic core was driven with each legacy wrapper's exact arguments and its emitted SQL + param array compared against the pre-refactor literals taken verbatim from 5afccc8019d^: all 3 byte-identical (mergeMetadataKeys, removeMetadataKey, removeMetadataKeyIfClaimedBy incl. the "AND claiming_session_id = $3" tail and $1/$2/$3 bind numbering). All 3 export declaration lines are untouched by the diff, so signatures and return shapes ({merged,sdKey}/{removed,sdKey}/{removed,id}) are unchanged by construction.`,
      },
      {
        id: 'T2-green-across-four-scopes',
        severity: 'INFO',
        summary: `safe-metadata-merge.test.js ${safeMerge.passed}/${safeMerge.executed} (13 pre-existing + 11 new; 13 and 24 both re-derived by counting it( blocks at 5afccc8019d^ and HEAD). generic-jsonb-merge.test.js ${generic.passed}/${generic.executed}. Independently enumerated consumer set ${consumers.passed}/${consumers.executed} across ${consumers.files} files, 0 failed, 0 skipped (artifact ${ARTIFACT_CONSUMERS}, sha256 ${consumers.sha}). FULL unit tier ${fullUnit.passed}/${fullUnit.executed} across ${fullUnit.files} files, 0 failed, ${fullUnit.skipped} pre-existing skips (condensate ${ARTIFACT_FULL_UNIT_SUMMARY}, sha256 ${fullUnit.sha}, derived from a ${fullUnit.derivedFrom?.bytes}-byte runner file sha256 ${fullUnit.derivedFrom?.sha256}).`,
      },
      {
        id: 'T3-four-mutants-killed-zero-survived',
        severity: 'INFO',
        summary: 'Four mutations of the real production module, each applied/run/reverted, each killed by exactly its intended test with no collateral failure: :192 keyColumn sd_key->id (killed by the new WHERE assertion); :129 extraGuardSql append dropped (killed by the new claim-CAS test -- and it was the ONLY failure across all 269 consumer tests, so nothing else in the repo guards that CAS clause); :77 keyColumn allowlist check short-circuited (killed by the new allowlist test); :130 bind-param order swapped (killed by the new claim-CAS params assertion). 4 applied / 4 killed / 0 survived.',
      },
      {
        id: 'T4-preexisting-gap-claim-is-genuine',
        severity: 'INFO',
        summary: 'CONFIRMED GENUINE and independently re-derived. At 5afccc8019d^ the test file asserted only /\\|\\|/, /^\\s*UPDATE strategic_directives_v2/i and /COALESCE\\(metadata/i on the SQL -- none constrains the key column, so the sd_key->id mutant left all 13 pre-existing tests green. Under the mutant today, 23 of 24 tests still pass and the sole failure is the newly-added `WHERE sd_key = $1` assertion, which also pins end-of-string (\\s*$) so it cannot be satisfied by the CAS variant\'s longer WHERE. The assertion distinguishes real behavior; it is not decoration.',
      },
      {
        id: 'T5-new-coverage-closes-a-security-relevant-blind-spot',
        severity: 'LOW',
        summary: 'Beyond the documented gap: removeMetadataKeyIfClaimedBy\'s claim compare-and-swap guard had NO test anywhere in the repo before this SD. Mutation (b) -- deleting the "AND claiming_session_id = $3" clause, which would let any caller drop a metadata key regardless of who holds the claim -- was caught by exactly one test out of 269, and that test is new in this SD. Real coverage gain on a guard whose failure mode is silent cross-session key deletion.',
      },
      {
        id: 'T6-commit-message-counts-are-wrong-substance-is-not',
        severity: 'LOW',
        summary: `The commit message claims "277 tests across 19 files". Independent enumeration gives 18 TEST files (the 19th git-grep hit is tests/fixtures/retro-handoff-classification-snapshot.json, a fixture whose prose merely mentions the filename) and ${consumers.executed} tests -- measured identically with and without --project unit, so the gap is not a project-filter artifact. Cosmetic over-count; the substantive claim (all green, zero call-site changes) is confirmed. Worth correcting if the number is quoted downstream.`,
      },
      {
        id: 'T7-blast-radius-wider-than-the-grep-list',
        severity: 'LOW',
        summary: 'A derived sweep (test files importing any of the 35 lib/scripts modules that import safe-metadata-merge, but not naming safe-metadata-merge themselves) found ~213 additional indirect-consumer test files -- e.g. tests/unit/eva/clone-tree-exclusion-fail-open.test.js, which injects removeMetadataKeyFn as a seam. The grep-scoped 18-file list would not have covered them. Rather than sample, the WHOLE unit tier was run instead: 0 failures across 4,239 files, so the wider radius is covered by measurement, not by argument.',
      },
      {
        id: 'T8-allowlist-is-a-real-guard-not-a-comment',
        severity: 'INFO',
        summary: 'JSONB_MERGE_ALLOWLIST is enforced by assertAllowedTarget() BEFORE any string interpolation, on all three axes (table, keyColumn, jsonbColumn), in both generic entry points. The tests prove refusal happens before the client is touched (client.queries stays length 0), including for a literal "DROP TABLE strategic_directives_v2; --" table name. Mutation (c) confirms the keyColumn limb is load-bearing. The identifier-injection surface a table-parameterized API would otherwise open is genuinely closed.',
      },
    ],
    warnings: [
      'product_requirements_v2 is in the allowlist with NO production caller yet (the consumer lives on SD-LEARN-FIX-ADDRESS-PAT-LES-012\'s unmerged branch). Its correctness is proven only against the fake pg client in generic-jsonb-merge.test.js plus the live information_schema shape check done at LEAD phase -- no query has ever been executed against that table through this core. The first real caller should verify against a live row before trusting it blindly.',
      'FR-5 (widening the unsafe-sd-metadata-full-blob-write-lint table gate) was attempted and reverted; the lint still gates on strategic_directives_v2 only. Nothing in this SD stops a future product_requirements_v2 full-blob write from passing the lint, so the generic core\'s existence does not yet imply enforcement. Tracked at harness_backlog f4f8bac3.',
      'The full-tier runner artifact (.artifacts/testing/jsonb-001-plan-to-exec-full-unit.json, ~20MB) is intentionally NOT committed. Only the programmatically-derived condensate is, and it embeds the 20MB file\'s sha256. If that local file is discarded the 52,351-test claim becomes re-runnable but not re-verifiable against the original bytes.',
    ],
    recommendations: [
      'Proceed to EXEC. The refactor is behavior-preserving at the SQL-byte level, the new tests are mutation-proven non-vacuous, and the whole unit tier is green.',
      'Correct the "277 tests across 19 files" figure to the measured 269 across 18 test files wherever it is quoted downstream (PRD, retrospective, handoff summary).',
      'Before the first real product_requirements_v2 caller lands, run one live-DB smoke of mergeJsonbColumn against a throwaway PRD row -- the table is currently proven only against a fake client.',
      'Follow up harness_backlog f4f8bac3 (call-proximate lint) so the second allowlisted table is actually protected by the lint, not merely served by the safe primitive.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING',
      review_method:
        'full read of the refactored module and both test files; a byte-parity probe comparing the generic core\'s emitted SQL/params against the pre-refactor literals from 5afccc8019d^; independent git-grep enumeration of the referencing test files plus a derived indirect-consumer sweep; four applied-and-reverted production mutations; a whole-unit-tier vitest run; and an independent re-derivation of the "pre-existing WHERE-clause gap" claim by counting and reading the parent commit\'s assertions. Counts read from vitest-written JSON reports, not hand-entered.',
      measured: true,
      test_execution: buildTestExecution({
        executed: consumers.executed,
        passed: consumers.passed,
        failed: consumers.failed,
        skipped: consumers.skipped,
        artifactSha: consumers.sha,
        runner: 'vitest (npx vitest run --project unit, JSON reporter)',
        artifactPath: ARTIFACT_CONSUMERS,
        source: 'fresh',
        mappedCandidates: 18,
        foundFiles: consumers.files,
      }),
      runner_artifacts: [
        { path: consumers.path, sha256: consumers.sha, scope: 'all 18 test files referencing safe-metadata-merge (PRIMARY -- counter source)', executed: consumers.executed, passed: consumers.passed, failed: consumers.failed },
        { path: safeMerge.path, sha256: safeMerge.sha, scope: 'tests/unit/coordinator/safe-metadata-merge.test.js (13 pre-existing + 11 new)', executed: safeMerge.executed, passed: safeMerge.passed, failed: safeMerge.failed },
        { path: generic.path, sha256: generic.sha, scope: 'tests/unit/coordinator/generic-jsonb-merge.test.js (new file)', executed: generic.executed, passed: generic.passed, failed: generic.failed },
        { path: fullUnit.path, sha256: fullUnit.sha, scope: 'FULL vitest `unit` project (condensate; derived_from names the uncommitted 20MB runner file and its sha256)', executed: fullUnit.executed, passed: fullUnit.passed, failed: fullUnit.failed, derived_from: fullUnit.derivedFrom },
      ],
      test_files_executed: TEST_FILES_EXECUTED,
      files_reviewed: [
        GUARDED_FILE,
        'tests/unit/coordinator/safe-metadata-merge.test.js',
        'tests/unit/coordinator/generic-jsonb-merge.test.js',
      ],
      per_file_results: {
        'tests/unit/coordinator/safe-metadata-merge.test.js': `${safeMerge.passed}/${safeMerge.executed} pass (13 pre-existing, re-counted at 5afccc8019d^ + 11 new)`,
        'tests/unit/coordinator/generic-jsonb-merge.test.js': `${generic.passed}/${generic.executed} pass (new file: 2 allowlist-shape + 2 merge + 1 remove + 4 refusal)`,
        'the other 16 referencing test files': `${consumers.passed - safeMerge.passed - generic.passed}/${consumers.executed - safeMerge.executed - generic.executed} pass (pre-existing consumers, no regression, zero call-site changes)`,
        'FULL vitest unit project': `${fullUnit.passed}/${fullUnit.executed} pass across ${fullUnit.files} files, 0 failed, ${fullUnit.skipped} pre-existing skips`,
      },
      signature_parity_check: {
        method: 'drove the generic core with each legacy wrapper\'s exact arguments through a capturing fake pg client, then string-compared the emitted SQL and JSON.stringify\'d param array against literals copied verbatim out of `git show 5afccc8019d^:lib/coordinator/safe-metadata-merge.mjs`',
        mergeMetadataKeys: { sql_byte_identical: true, params_byte_identical: true },
        removeMetadataKey: { sql_byte_identical: true, params_byte_identical: true },
        removeMetadataKeyIfClaimedBy: { sql_byte_identical: true, params_byte_identical: true },
        declaration_lines_unchanged: [
          'export async function mergeMetadataKeys(sdKey, patch, opts = {})',
          'export async function removeMetadataKey(sdKey, key, opts = {})',
          'export async function removeMetadataKeyIfClaimedBy(id, key, claimingSessionId, opts = {})',
        ],
        return_shapes_unchanged: ['{merged, sdKey, error?}', '{removed, sdKey, error?}', '{removed, id, error?}'],
        conclusion: 'Zero external signature or behavior change is verified mechanically, not accepted on the SD\'s word.',
      },
      mutation_test: {
        performed: true,
        target_file: GUARDED_FILE,
        mutants_applied: 4,
        mutants_killed: 4,
        mutants_survived: 0,
        mutations: [
          {
            line: 192,
            mutation: "mergeMetadataKeys delegation: keyColumn 'sd_key' -> 'id' (replicates the SD's own documented mutation, re-run independently to test claim #4)",
            killed_by: 'mergeMetadataKeys > issues ONE atomic || merge touching only the given keys, and closes the connection -- at the NEW `WHERE sd_key = $1` assertion',
            run: '32 passed / 1 failed (safe-metadata-merge 23/24, generic-jsonb-merge 9/9)',
          },
          {
            line: 129,
            mutation: "removeJsonbColumnKey WHERE: dropped the `${extraGuardSql ? ` ${extraGuardSql}` : ''}` append, silently discarding the claim compare-and-swap guard",
            killed_by: 'removeMetadataKeyIfClaimedBy (real implementation, first direct coverage) > issues ONE atomic jsonb `-` remove guarded by id AND claiming_session_id (CAS)',
            run: '32 passed / 1 failed; re-run across the full 18-file consumer set: 268 passed / 1 failed -- the SAME single test, so nothing else in the repo guards this clause',
          },
          {
            line: 77,
            mutation: 'assertAllowedTarget: keyColumn check short-circuited with `if (false && !spec.keyColumns.includes(keyColumn))`',
            killed_by: 'identifier allowlist refuses anything not declared > refuses a keyColumn not listed for that table (e.g. sd_key against product_requirements_v2) -- "promise resolved { rowCount: 1 } instead of rejecting"',
            run: '32 passed / 1 failed (generic-jsonb-merge 8/9, safe-metadata-merge 24/24)',
          },
          {
            line: 130,
            mutation: 'removeJsonbColumnKey bind order: [keyValue, key, ...extraGuardParams] -> [keyValue, ...extraGuardParams, key] (a real bug shape: $2/$3 swap deletes the wrong key and compares the wrong session)',
            killed_by: 'removeMetadataKeyIfClaimedBy (real implementation, first direct coverage) > issues ONE atomic jsonb `-` remove guarded by id AND claiming_session_id (CAS) -- at the params deep-equal assertion',
            run: '32 passed / 1 failed (safe-metadata-merge 23/24, generic-jsonb-merge 9/9)',
          },
        ],
        independence_note: 'Mutations (b), (c) and (d) were chosen by this sub-agent and target lines the SD documents no mutation for; (a) deliberately replicates the SD\'s own documented mutation so its "pre-existing gap" claim could be tested rather than accepted.',
        restored_cleanly: true,
        pre_mutation_git_blob: GUARDED_FILE_GIT_BLOB,
        post_restore_git_blob: GUARDED_FILE_GIT_BLOB,
        pre_mutation_sha256: GUARDED_FILE_SHA256,
        post_restore_sha256: GUARDED_FILE_SHA256,
      },
      preexisting_gap_verification: {
        claim: 'A mutation test during development found a REAL pre-existing gap -- no test previously pinned the WHERE clause for mergeMetadataKeys.',
        verdict: 'GENUINE',
        method: 'read every SQL assertion in the test file at 5afccc8019d^ (the parent commit), then reproduced the mutation empirically against HEAD',
        preexisting_sql_assertions: ['/\\|\\|/', '/^\\s*UPDATE strategic_directives_v2/i', '/COALESCE\\(metadata/i'],
        preexisting_it_block_count: 13,
        current_it_block_count: 24,
        why_not_vacuous: 'None of the 3 pre-existing SQL assertions constrains the key column, so `WHERE id = $1` satisfies all of them. Under the sd_key->id mutant, 23 of 24 tests pass and the ONLY failure is the added assertion. The regex also anchors end-of-string (/WHERE sd_key = \\$1\\s*$/), so it additionally rejects a silently-appended extra WHERE condition -- it is strictly stronger than a substring check.',
        added_assertion: 'expect(client.queries[0].sql).toMatch(/WHERE sd_key = \\$1\\s*$/)',
      },
      consumer_sweep: {
        method: 'git grep -l "safe-metadata-merge" tests/ for the direct set; then a derived sweep of every test file referencing any of the 35 lib/scripts modules that import the merge module, for the indirect set',
        direct_test_files: 18,
        non_test_grep_hit: 'tests/fixtures/retro-handoff-classification-snapshot.json -- a fixture whose prose mentions the filename; counted as a "file" in the commit message\'s 19, but it executes nothing',
        production_consumers: 35,
        indirect_test_files_found: 213,
        indirect_coverage_strategy: 'ran the ENTIRE vitest `unit` project rather than sampling the indirect set: 4,239 files, 0 failures',
        call_site_changes_required: 0,
      },
      count_discrepancies_found: {
        commit_message_claim: '277 tests across 19 files',
        measured: `${consumers.executed} tests across ${consumers.files} test files`,
        project_filter_ruled_out: 'identical totals with and without --project unit, so the gap is not a discovery-scope artifact',
        severity: 'cosmetic -- the substantive "all green / zero call-site changes" claim is confirmed',
      },
      e2e_applicable: false,
      e2e_exemption_reason:
        'Node-side library refactor of a SQL-emitting helper. No UI surface, no route and no user-facing journey exist for this change, so E2E is not applicable per the sd-classification rule for infrastructure SDs.',
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001',
      branch: 'feat/SD-LEO-INFRA-GENERALIZE-ATOMIC-JSONB-001',
      head_commit_at_verification: '5afccc8019dba1e9e411f442d067169e61102e49',
      runner_artifacts: [
        { path: consumers.path, sha256: consumers.sha, success: consumers.success },
        { path: safeMerge.path, sha256: safeMerge.sha, success: safeMerge.success },
        { path: generic.path, sha256: generic.sha, success: generic.success },
        { path: fullUnit.path, sha256: fullUnit.sha, success: fullUnit.success, derived_from: fullUnit.derivedFrom },
      ],
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (TESTING)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
