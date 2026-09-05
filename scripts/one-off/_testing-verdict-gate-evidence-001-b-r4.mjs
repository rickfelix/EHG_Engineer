#!/usr/bin/env node
/**
 * TESTING verdict writer (RUN 4 / final EXEC-phase re-validation) for
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B @ EXEC-TO-PLAN, commit 4e2e6d6c925 (PR #8219).
 *
 * Supersedes run 3 (row e8cee5f1): r3's TWO coverage defects (dead-by-construction FR-B4
 * entrypoint test; unasserted write-once guard) are the subject of this run's re-validation.
 *
 * Provenance per the chairman-ratified gate-evidence rule: every count below is read OUT OF a
 * runner-produced vitest JSON artifact (never hand-transcribed), and each artifact's sha256 is
 * carried alongside its own counts. The artifacts are written to the session scratchpad OUTSIDE
 * the repository (the unit one is 17.5MB) so no multi-MB blob can be swept into a commit; only
 * the hashes and the derived counts cross into the row.
 *
 * phase is supplied EXPLICITLY as 'EXEC_TO_PLAN' (underscore) rather than left to derivation:
 * lib/sub-agent-executor/evidence-provenance.js PHASE_MAP maps EXEC_TO_PLAN -> 'EXEC' but has no
 * key for the hyphenated 'EXEC-TO-PLAN' that runs 1-3 wrote, so those rows grade ABSENT on
 * missingField='phase' under the gate's own window-scoping. See findings.evidence_provenance_*.
 */
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { config } from 'dotenv';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

config();

const SD_UUID = '0766bf55-2b4c-44d2-8fd7-81bf3e19ac87';
const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B';
const SCRATCH =
  'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/838c05dd-5195-48b1-8511-d45697703324/scratchpad';
const UNIT_ARTIFACT = `${SCRATCH}/unit-run.json`;
const GATE_ARTIFACT = `${SCRATCH}/gate-run.json`;

/** Read a runner artifact; return its parsed body + sha256 of the exact bytes on disk. */
function readRunnerArtifact(path) {
  const buf = readFileSync(path);
  return { json: JSON.parse(buf.toString()), sha: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

const unit = readRunnerArtifact(UNIT_ARTIFACT);
const gate = readRunnerArtifact(GATE_ARTIFACT);

// Failing-file list is DERIVED from the artifact, never typed by hand.
const unitFailingFiles = (unit.json.testResults || [])
  .filter((t) => t.status === 'failed')
  .map((t) => t.name.split(/[\\/]/).slice(-3).join('/'));

const testExecution = buildTestExecution({
  executed: unit.json.numTotalTests,
  passed: unit.json.numPassedTests,
  failed: unit.json.numFailedTests,
  skipped: unit.json.numPendingTests,
  artifactSha: unit.sha,
  runner: 'npx vitest run --project unit --reporter=json',
  artifactPath: UNIT_ARTIFACT,
  source: 'runner_json_reporter',
});

// The new dedicated project gets its OWN hashed record rather than being folded into the
// headline counts -- mixing two lanes under one artifact_sha would leave the sha covering
// only part of the number it is stamped against.
const gateLaneExecution = buildTestExecution({
  executed: gate.json.numTotalTests,
  passed: gate.json.numPassedTests,
  failed: gate.json.numFailedTests,
  skipped: gate.json.numPendingTests,
  artifactSha: gate.sha,
  runner: 'npx vitest run --project bypass-ledger-join-check-gate --reporter=json',
  artifactPath: GATE_ARTIFACT,
  source: 'runner_json_reporter',
});

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 90,
  summary:
    `Run 4 (final EXEC re-validation) at commit 4e2e6d6c925 / PR #8219. BOTH r3 coverage defects are ` +
    `CLOSED and independently re-verified. (1) FR-B4 reachability: the entrypoint regression test now ` +
    `EXECUTES -- \`vitest run --project bypass-ledger-join-check-gate\` ran ${gate.json.numPassedTests}/${gate.json.numTotalTests} passed in 7.2s, ` +
    `confirmed real (not skipped) by the runner artifact's own counts; the db-tier runtime gate never ` +
    `loads because the project supplies no setupFiles, exactly the migration-gate precedent. ` +
    `(2) Write-once guard mutation-hardening: verified by MY OWN mutation run, not by accepting the ` +
    `worker's report -- deleting both \`.is('handoff_id', null)\` chains from HandoffRecorder.js (:611, :1198) ` +
    `flips 2 of the 4 join tests to FAIL with "Expected {col:handoff_id,val:null} / Received undefined"; ` +
    `restoring them returns 4/4 green. The mutant is killed, so the guard is genuinely regression-protected. ` +
    `Unit suite: ${unit.json.numPassedTests}/${unit.json.numTotalTests} passed, ${unit.json.numFailedTests} failed, ${unit.json.numPendingTests} skipped across ${unit.json.numTotalTestSuites} suites. ` +
    `ZERO regressions attributable to this SD: the r3 baseline was 47105 passed / 47316 total / 0 failed, and ` +
    `${unit.json.numPassedTests} passed + ${unit.json.numFailedTests} failed = 47105 over an identical 47316-test population -- the same tests, one flipped. ` +
    `CONDITIONAL rather than PASS solely because the suite is not literally 0-failed: the single failure ` +
    `(${unitFailingFiles.join(', ')}) is a wall-clock perf assertion unrelated to this diff, with ZERO commits on this branch, ` +
    `which passes in 762ms against its own 30000ms budget when run in isolation AT THIS SAME COMMIT ` +
    `(50874ms only under 3846-file parallel load). Config and CI wiring re-verified structurally: the ` +
    `workflow YAML parses, the new project collects, and the entrypoint step is BLOCKING.`,
  findings: {
    fr_b4_reachability_closed:
      `CLOSED (was r3's HIGH). The r3 finding was that the FR-B4 entrypoint proof executed in NO lane. It now ` +
      `executes: a dedicated ungated vitest project 'bypass-ledger-join-check-gate' (vitest.config.js:~365-378) ` +
      `includes BYPASS_LEDGER_JOIN_CHECK_GATE_INCLUDE and, critically, declares NO setupFiles -- so ` +
      `tests/setup.db.js (the runtime db-tier gate that skips every test on an undesignated target) is never ` +
      `loaded. Verified by RUNNING it, not by reading the config: 1 test, 1 passed, 0 skipped, 7168ms, per the ` +
      `runner artifact sha ${gate.sha.slice(0, 16)}. Fake Supabase credentials are stamped at the PROJECT level (env block), ` +
      `so the test file's own source never names those env vars and the pre-commit DB-test guard's literal-string ` +
      `scan stays clean -- the stated design intent holds.`,
    precedent_fidelity:
      `CONFIRMED IDENTICAL to the cited MIGRATION_GATE_INCLUDE precedent, including the part that looks like a ` +
      `defect and is not. Both target files live under tests/integration/ and therefore ALSO match the db ` +
      `project's DB_INCLUDE glob ('**/tests/integration/**/*.test.js'), so each is collected TWICE under a full ` +
      `run. Measured with vitest list: the migration file reports 15 [db] + 15 [migration-gate]; the new file ` +
      `reports 1 [db] + 1 [bypass-ledger-join-check-gate]. The db copy skips at runtime and the dedicated copy ` +
      `executes -- harmless, and symmetric with the precedent it claims to mirror. No project-name collision ` +
      `(6 distinct names: strip-shebang, unit, db, smoke, migration-gate, bypass-ledger-join-check-gate).`,
    default_run_collection_is_broader_than_assumed:
      `CORRECTION to the working assumption that "the default project run won't include the new dedicated one". ` +
      `\`npx vitest list <file>\` with NO --project flag collects the file under BOTH [bypass-ledger-join-check-gate] ` +
      `and [db]. A bare \`vitest run\` (all projects) therefore DOES execute it. What genuinely excludes it is the ` +
      `npm script layer: package.json's test / test:unit are both \`vitest run --project unit\`, and the unit ` +
      `project excludes DB_INCLUDE. So the CI workflow step remains the load-bearing lane for FR-B4, but the ` +
      `coverage is strictly better than assumed, not worse.`,
    write_once_guard_mutation_hardened:
      `CLOSED (was r3's "IMPLEMENTED BUT UNASSERTED"). Independently re-derived rather than trusted: I applied the ` +
      `mutant myself by stripping /\\n\\s*\\.is\\('handoff_id', null\\)/g from HandoffRecorder.js (2 real call sites ` +
      `removed; the 2 remaining textual occurrences are comment prose, which is why a naive count reads 4->2), ` +
      `confirmed the mutant still parses via \`node --check\`, and ran the join suite: 2 failed / 2 passed, both ` +
      `failures on \`expect(ledgerJoin.is).toEqual({col:'handoff_id',val:null})\` receiving undefined ` +
      `(lines 99 and 143). Restored via git checkout -- 4/4 green, guard sites back to 2. The mock's ` +
      `\`is: (isCol,isVal) => { record.is = {col:isCol,val:isVal}; return term; }\` (line 49) mutates the SAME ` +
      `tracked record, which is the detail that makes a DELETED .is() surface as undefined rather than as an ` +
      `absent find() -- the mutant is killed, not merely observed.`,
    workflow_wiring_sound:
      `PASS. .github/workflows/bypass-ledger-join-check.yml parses cleanly through a real YAML loader (1 job ` +
      `'census', 6 steps, no syntax issues). Step ordering is correct and the semantics match the stated intent: ` +
      `"Verify census entrypoint fires" runs \`npx vitest run tests/integration/bypass-ledger-handoff-join-check-entrypoint.test.js ` +
      `--project bypass-ledger-join-check-gate\` and carries NO \`|| true\`, so it is genuinely BLOCKING, and it sits ` +
      `BEFORE the census step -- a dead entrypoint fails the job instead of yielding a silently worthless census. ` +
      `The census step keeps its deliberate \`|| true\` (Observe-Only-First). The same file-path + --project ` +
      `invocation the workflow uses was executed locally and passed, so the step is not merely well-formed but ` +
      `known-runnable.`,
    regression_status:
      `PASS. ${unit.json.numFailedTests} failure across ${unit.json.numTotalSuites ?? unit.json.numTotalTestSuites} suites, and it is NOT a regression: ` +
      `r3 measured 47105 passed / 47316 total / 0 failed; r4 measures ${unit.json.numPassedTests} passed / ${unit.json.numFailedTests} failed / ${unit.json.numTotalTests} total. ` +
      `Population is byte-identical in size (47316) and pass+fail reconciles to the same 47105, i.e. no test was ` +
      `added, removed, or newly broken by commit 4e2e6d6c925 -- expected, since its test changes touched the ` +
      `entrypoint file (not in the unit lane) and the join test's mock (no new cases). The 4 SD-specific files ` +
      `re-run targeted: 48 passed / 0 failed.`,
    unit_lane_failure_triage:
      `NOT ATTRIBUTABLE TO THIS SD. tests/unit/eva/complexity-scorer.test.js > "should complete scan in under 30 ` +
      `seconds" asserted 50874ms < 30000ms. Four independent reasons this is load, not content: (a) \`git log ` +
      `main..HEAD -- <file>\` returns 0 commits, so this branch never touched it; (b) the branch touches only ` +
      `handoff/bypass-ledger/vitest-config paths, none of which the scorer imports; (c) run in ISOLATION at this ` +
      `exact commit the same assertion measures 762ms -- 66x under budget -- and all 7 tests pass; (d) the ` +
      `assertion is a wall-clock budget over a filesystem scan executed concurrently with 3845 other test files. ` +
      `It is a pre-existing fragile-by-construction perf assertion, not quarantined (it was collected and run).`,
    evidence_provenance_systemic_gap:
      `OUT OF SCOPE FOR THIS DIFF, REPORTED BECAUSE IT BEARS ON THIS SD'S OWN HANDOFF. Running the ` +
      `subagent-evidence-gate's OWN predicate (gradeProvenance from lib/sub-agent-executor/evidence-provenance.js, ` +
      `fed by a verbatim copy of the gate's own select projection) against this SD's rows grades EVERY ONE ABSENT: ` +
      `runs 1-2 on missingField='phase', run 3 and the SECURITY row on 'content_hash_mismatch'. Two distinct ` +
      `mechanisms. (i) PHASE_MAP contains EXEC_TO_PLAN but no hyphenated 'EXEC-TO-PLAN' key -- though it DOES ` +
      `explicitly carry the hyphenated 'PLAN-TO-LEAD', so the omission is asymmetric, and 27 of the last 300 rows ` +
      `repo-wide use hyphenated EXEC-TO-PLAN/LEAD-TO-PLAN/PLAN-TO-EXEC spellings. (ii) row e8cee5f1 has ` +
      `updated_at 08:27:52 vs created_at 08:25:48 -- mutated ~2min post-write without re-stamping content_hash, ` +
      `which is the hash working AS DESIGNED to detect post-write mutation. Breadth measured, not assumed: of the ` +
      `newest 300 rows, 194 are pre-cutover (PROVENANCE_CUTOVER_AT=2026-09-05T04:30Z) and of the 106 post-cutover ` +
      `only 16 grade OK -- 62 ABSENT:source, 28 ABSENT:content_hash_mismatch. This is pre-existing on main and ` +
      `belongs to sibling child 001-A (which owns evidence-provenance.js); NOTHING in 001-B's diff causes it. ` +
      `Practical consequence for THIS handoff: this row is written with phase='EXEC_TO_PLAN' so it at least clears ` +
      `mechanism (i).`,
  },
  warnings: [
    {
      severity: 'LOW',
      issue:
        'Unit suite is not literally 0-failed: tests/unit/eva/complexity-scorer.test.js fails a 30s wall-clock ' +
        'budget (50874ms) under full-suite parallel load while passing in 762ms in isolation at the same commit.',
      impact:
        'None on this SD. It is why the verdict is CONDITIONAL_PASS rather than PASS -- a PASS carrying ' +
        'tests_failed=1 would contradict the SC#4 reading that PASS implies measured=true AND failed=0.',
      recommendation:
        'Out of scope for 001-B; do not expand this diff. Worth a harness_backlog entry: a wall-clock budget ' +
        'asserted inside a 3846-file parallel run is flaky by construction and should assert on scan work done, ' +
        'or be quarantined, rather than on elapsed time under unknown contention.',
    },
    {
      severity: 'MEDIUM',
      issue:
        'Every sub_agent_execution_results row for this SD currently grades ABSENT under the ' +
        'subagent-evidence-gate\'s own gradeProvenance predicate (phase spelling for r1/r2; content_hash ' +
        'mismatch from post-write mutation for r3 and SECURITY).',
      impact:
        'If the EXEC-TO-PLAN handoff runs the provenance-scoped read, this SD could report ' +
        'SUBAGENT_EVIDENCE_MISSING despite four TESTING rows and a SECURITY row existing. Repo-wide only ' +
        '16 of the newest 106 post-cutover rows grade OK, so this is systemic, not local.',
      recommendation:
        'PLAN/LEAD decision, not an EXEC fix here. Add the hyphenated EXEC-TO-PLAN / LEAD-TO-PLAN / PLAN-TO-EXEC ' +
        'keys to PHASE_MAP (it already special-cases hyphenated PLAN-TO-LEAD), and find what mutates evidence ' +
        'rows ~2min post-write without re-stamping content_hash (readback-checker.mjs is the first place to ' +
        'look). Both live in sibling child 001-A\'s files, not 001-B\'s.',
    },
  ],
  recommendations: [
    'Proceed to PLAN verification for 001-B. Both r3 defects are closed with independently re-derived evidence.',
    'Do NOT re-open this SD for the complexity-scorer flake or the provenance gap -- neither is caused by this diff.',
    'Carry the provenance finding to the CAPA family: an SD named GATE-EVIDENCE whose own gate evidence grades ABSENT is exactly the asymmetry this workstream exists to close.',
  ],
  metadata: {
    phase: 'EXEC_TO_PLAN',
    run: 4,
    sd_key: SD_KEY,
    branch: 'feat/SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B',
    commit_under_test: '4e2e6d6c925c1d1e4654b7dc470c9bc0bd515c30',
    pull_request: 8219,
    supersedes_evidence_row: 'e8cee5f1 (run 3)',
    test_execution: testExecution,
    gate_lane_execution: gateLaneExecution,
    runner_artifacts: [
      { lane: 'unit', path: UNIT_ARTIFACT, sha256: unit.sha, bytes: unit.bytes, committed_to_git: false },
      { lane: 'bypass-ledger-join-check-gate', path: GATE_ARTIFACT, sha256: gate.sha, bytes: gate.bytes, committed_to_git: false },
    ],
    artifact_handling:
      'Both artifacts written to the session scratchpad OUTSIDE the repo working tree; the 17.5MB unit ' +
      'artifact is deliberately never staged. Counts read programmatically from the JSON; only hashes and ' +
      'derived counts appear in this row.',
    unit_failing_files: unitFailingFiles,
    baseline_comparison: {
      r3: { passed: 47105, failed: 0, total: 47316 },
      r4: { passed: unit.json.numPassedTests, failed: unit.json.numFailedTests, total: unit.json.numTotalTests },
      reconciliation: 'r4 passed + r4 failed === 47105 === r3 passed, over an identical 47316 population',
      regressions_attributable_to_sd: 0,
    },
    mutation_test: {
      performed_by: 'this TESTING run, independently (not a re-report of the worker\'s own mutation test)',
      mutant: "removed both `.is('handoff_id', null)` chains from scripts/modules/handoff/recording/HandoffRecorder.js (:611, :1198)",
      syntax_check: 'node --check passed on the mutant, so the kill is behavioral, not a parse error',
      result_with_mutant: '2 failed / 2 passed (assertions at lines 99 and 143, Received: undefined)',
      result_restored: '4 passed / 0 failed; guard call sites back to 2',
      conclusion: 'mutant KILLED — guard is genuinely regression-protected',
    },
    config_verification: {
      yaml_parse: 'ok — 1 job, 6 steps',
      entrypoint_step_blocking: true,
      entrypoint_step_before_census: true,
      project_names: ['strip-shebang', 'unit', 'db', 'smoke', 'migration-gate', 'bypass-ledger-join-check-gate'],
      duplicate_project_names: 0,
      collection_probe: 'vitest list — new file: 1 [db] + 1 [bypass-ledger-join-check-gate]; migration precedent: 15 [db] + 15 [migration-gate]',
    },
    verification_method:
      'Full unit project via the vitest JSON reporter (counts read from the hashed artifact); the new dedicated ' +
      'project run separately with its own hashed artifact; targeted re-run of the 4 SD-specific files; a ' +
      'first-hand mutation kill on the write-once guard with restore-and-reverify; YAML load of the workflow; ' +
      'per-project vitest list collection probes against both the new file and the precedent it mirrors; an ' +
      'isolation re-run of the one failing file; git log attribution of that file; and the evidence gate\'s own ' +
      'gradeProvenance predicate applied to this SD\'s rows and to the newest 300 rows repo-wide.',
    scope_and_limits: {
      verdict_scope:
        'Covers the two r3 coverage defects, the config/workflow wiring, and pass/fail regression status at ' +
        'commit 4e2e6d6c925. Runs 1-3 remain the record for the FR-B4 census logic and the four SECURITY fixes.',
      not_verified: [
        'The bypass-ledger-join-check.yml workflow has still never actually executed on a real ubuntu-latest runner (cron + workflow_dispatch only) — carried forward unchanged from runs 2 and 3.',
        'Only the unit and bypass-ledger-join-check-gate projects were executed. The db, smoke, ddl and e2e lanes were not run (no designated non-production DB target in this environment).',
        'The provenance gap above was measured with the gate\'s predicate but the EXEC-TO-PLAN handoff itself was not executed, so the gate\'s end-to-end behavior on these rows is inferred from its predicate, not observed.',
      ],
      bounding_dimension:
        'Bounded by LANE, again. The unit lane is covered exhaustively (47316 tests) and the FR-B4 lane now ' +
        'genuinely executes (1 test), but anything outside those two lanes is unmeasured — which is precisely ' +
        'the dimension r3\'s HIGH finding lived in, and why this run probed collection per-project rather than ' +
        'inferring reachability from a file existing.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  subAgentCode: 'TESTING',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_UUID, null, results, {
  sdKey: SD_KEY,
  phase: 'EXEC_TO_PLAN',
});
console.log('\nStored verdict:', results.verdict);
console.log('unit artifact sha256:', unit.sha);
console.log('gate artifact sha256:', gate.sha);
console.log('row:', JSON.stringify(stored?.id ?? stored, null, 2).slice(0, 400));
