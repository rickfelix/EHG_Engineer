#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent EXEC-TO-PLAN evidence for SD-FDBK-ENH-RETRO-SUB-AGENT-001.
 *
 * Independent verification of the SHIPPED implementation (commit af0e13b6eec), not the design.
 * Every claim below was established by RUNNING code -- a live sub-agent run, a self-restoring
 * source mutation, fs-level spies, and own reproduction scripts -- never by reading source alone.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'c379f18b-c5e6-4fdc-9f92-7f23758d8146';
const SD_KEY = 'SD-FDBK-ENH-RETRO-SUB-AGENT-001';

const findings = [
  {
    severity: 'medium',
    type: 'test_false_confidence',
    title: 'TS-6 does not pin the once-per-call walk invariant it claims to (proven by mutation)',
    summary: "Mutation test: reverting BOTH threading call sites in hallucination-check.js -- checkFileExists(filePath, baseDir, branchContext, basenameIndex) back to (..., branchContext), and findBasenameMatches(filePath, baseDir, basenameIndex) back to (..., baseDir) -- leaves ALL 17 tests GREEN. Root cause: the vi.mock targets lib/validation/hallucination/index.js, which only intercepts the binding hallucination-check.js imports; file-checks.js's internal fallback calls its own module-local buildBasenameIndex, which the spy never observes (proven directly: spy call count 0 after 4 forced internal walks). TS-6's toHaveBeenCalledTimes(1) therefore measures 'hallucination-check.js called the re-export once', NOT 'one filesystem walk per call'. The real signature was present but unasserted: suite duration went 5.24s -> 10.36s under the mutation. This is precisely the defect class (a mechanism that looks pinned but is not) that TR-1/FR-2 were added by round-2 PLAN review to guarantee.",
  },
  {
    severity: 'medium',
    type: 'test_can_silently_noop',
    title: 'TS-5, the ONLY end-to-end assertion of the ambiguous_basename_match warning, self-skips on repo drift',
    summary: "TS-5 and the sibling 'result.file_references carries no ambiguity data' test both hardcode registry.json and early-return with expect(true).toBe(true) when findBasenameMatches('registry.json') has <= 1 match. It is live today (measured: 3 matches -- applications/registry.json, golden-references/registry.json, lib/sub-agents/registry.json), but FR-3's core acceptance evaporates silently if that ever changes. TS-4's node_modules fixture has the same shape. The index holds 545 ambiguous basenames (measured), so a fixture can be selected dynamically and never no-op.",
  },
  {
    severity: 'low',
    type: 'tautological_assertion',
    title: 'TS-8 asserts only not.toThrow(), which extractFileReferences on a string cannot do',
    summary: 'The doubled-backslash test wraps extractFileReferences in expect(...).not.toThrow(), pinning no behavior at all. If the intent is to document the accepted naive-normalization tradeoff, it should assert the actual returned references.',
  },
  {
    severity: 'low',
    type: 'latent_perf',
    title: 'quickHallucinationCheck would pay one full filesystem walk PER bare-basename reference',
    summary: 'hallucination-check.js:281 calls checkFileExists(f, baseDir) with no index inside a .filter(), so each bare basename triggers its own ~200ms walk. Confirmed dead code today (git grep: zero production callers; only the module itself and the new test reference it), so latent rather than live -- but any future caller silently inherits an O(N)-walk cost.',
  },
  {
    severity: 'low',
    type: 'unconditional_cost',
    title: 'buildBasenameIndex runs even when zero references (or zero bare basenames) need it',
    summary: 'Measured on this repo: 207ms for a validateSubAgentOutput() call with file_references.total=0, and 188ms for a full-paths-only call where the fallback is unreachable. Negligible against sub-agent runtimes, but guardable with a single condition.',
  },
];

const warnings = [
  {
    type: 'accepted_risk_confirmed',
    message: 'The fallback widens L1 false-negatives for BARE basenames only. Measured: index.js resolves against 176 real files, README.md against 188, config.js against 15 -- all now counted valid. Correctly bounded: verified that lib/validation/hallucination/totally-fake-dir/extractors.js still returns false, so any reference containing a separator is unaffected, and every ambiguity emits a warning. Strictly better than the false-positive it replaces.',
  },
  {
    type: 'accepted_risk_confirmed',
    message: 'Windows edge case: the naive escape normalization mangles JSON-escaped Windows paths (a doubled backslash followed by n becomes a space). Documented tradeoff with measured zero incidence; the failure mode is a missed extraction (false negative), never a false flag.',
  },
];

const recommendations = [
  'RECOMMENDED BEFORE MERGE: replace or supplement TS-6 with an fs-level assertion. Verified working remedy (~12 LOC): vi.spyOn(fs, "readdirSync"), run validateSubAgentOutput with 1 bare-basename reference then with 4, and assert the 4-reference count is < 1.5x the 1-reference count. Measured: passes on the real code, FAILS on the mutation at 11704 vs ~4389 readdirSync calls. This closes the exact gap TS-6 leaves open.',
  'RECOMMENDED: select the TS-4 and TS-5 fixtures dynamically from buildBasenameIndex (for TS-5, the first entry whose paths.length > 1) so the only end-to-end FR-3 assertion can never vacuously skip.',
  'OPTIONAL: make TS-8 assert the actual extracted references instead of not.toThrow().',
  'OPTIONAL: guard buildBasenameIndex behind fileRefs.some(f => f === path.basename(f)) to skip the ~200ms walk when no reference can use the fallback.',
  'OPTIONAL: thread the index into quickHallucinationCheck, or comment the O(N)-walk hazard at its call site.',
];

const summary = "TESTING EXEC-TO-PLAN verification of the SHIPPED implementation (af0e13b6eec, PR #7276). CONDITIONAL_PASS: the production code is correct and the bug is genuinely fixed -- confirmed by running it, not by reading it -- but the test suite contains a proven false-confidence gap. VERIFIED BY EXECUTION: (1) The bug is fixed end-to-end; an own reproduction through the real prepareOutputForAnalysis -> extractFileReferences chain returns lib/eva/bridge/stage-execution-worker.js and lib/eva/bridge/venture-build-consumer.js with zero mangled 'nlib/...' captures. (2) A LIVE run of execute-subagent.js --code RETRO against SD d5b56ce2 printed 'Hallucination check: PASS (Score: 100/100)' IMMEDIATELY FOLLOWED BY 'Hallucination check warnings: Bare basename pipeline.js matches 2 real files: lib/data-plane/pipeline.js, lib/sd-creation/pipeline.js' -- behavioral proof, as opposed to the test's static string-index check, that the executor.js log line fires on a PASSING-but-ambiguous result, meaning the else-branch nesting bug PLAN review caught in the original design was genuinely avoided. (3) buildBasenameIndex measured independently: 227ms, 16522 basenames across 18284 files, ZERO node_modules and ZERO .git leaks; symlinks are not followed because the walk uses isDirectory(), which is false for symlinks, so there is no infinite-walk risk. (4) checkFileExists's boolean contract holds on both branches, and git grep confirms quickHallucinationCheck's negated call site is the only negation consumer and has zero production callers. (5) No regressions: git grep enumerated every caller of checkFileExists, extractFileReferences and validateSubAgentOutput (the only non-module checkFileExists hit is an archived script defining its own local function of the same name), and 183 tests across 12 adjacent suites pass. THE GAP: a mutation removing the ENTIRE index-threading mechanism -- the one thing round-2 PLAN review added TR-1/FR-2 to guarantee -- leaves all 17 tests green, because the vi.mock on index.js cannot observe file-checks.js's module-local buildBasenameIndex calls (proven: spy count 0 after 4 forced internal walks). A verified 12-line fs.readdirSync-spy alternative fails that mutation at 11704 vs ~4389 calls and passes on the real code. Separately, TS-5 -- the only end-to-end assertion that FR-3's ambiguous_basename_match warning is produced at all -- silently no-ops via expect(true).toBe(true) if registry.json ever stops being ambiguous. Both are test-assurance defects rather than code defects; the shipped behavior is correct today.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'independent verification of shipped implementation (execution-based, not review-based)',
      go_no_go: 'GO with one recommended test fix',
      commit_verified: 'af0e13b6eec',
      pr: 7276,
      test_run: {
        command: 'npx vitest run tests/unit/validation/hallucination-check.test.js',
        result: '17/17 passed',
        reproduced_independently: true,
      },
      regression_run: {
        command: 'npx vitest run tests/unit/validation/ tests/unit/prd-grounding-validator.test.js tests/unit/prd-pipeline-subagent-fix.test.js tests/unit/sub-agent-executor/',
        result: '183/183 passed across 12 files',
      },
      live_verification: {
        command: 'node scripts/execute-subagent.js --code RETRO --sd-id d5b56ce2-f702-4a2a-97a8-355c2f079d4d',
        score: '100/100',
        passed: true,
        warning_logged_on_passing_result: true,
        observed_line: "Hallucination check warnings: Bare basename 'pipeline.js' matches 2 real files: lib/data-plane/pipeline.js, lib/sd-creation/pipeline.js",
      },
      mutation_test: {
        mutation: 'removed the basenameIndex threading from both call sites in validateFileReferences',
        suite_result: '17/17 STILL PASSED (gap proven)',
        duration_signature: '5.24s -> 10.36s',
        fs_spy_alternative: 'FAILED the mutation at 11704 vs ~4389 readdirSync calls (remedy verified working)',
      },
      measurements: {
        index_build_ms: 227,
        basenames: 16522,
        files: 18284,
        node_modules_leaks: 0,
        git_leaks: 0,
        ambiguous_basenames: 545,
        ambiguous_pct: 3.3,
        zero_ref_call_ms: 207,
        full_path_only_call_ms: 188,
      },
      ci: {
        checks_success: 45,
        pending: ['coverage', 'Run Unit Tier (quarantine-aware)'],
        mergeable: 'MERGEABLE',
      },
      verification_method: 'Execution over reading: own reproduction scripts against the real functions, a self-restoring source mutation to test the tests, an fs.readdirSync spy to prove a working remedy, a full live sub-agent run to observe the executor log line in production, and git grep for the complete caller set. All probe files and source mutations were removed and the worktree confirmed clean (git status --porcelain on lib/ and tests/ returned empty).',
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id, '| verdict:', stored.verdict, '@', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path, '| resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
