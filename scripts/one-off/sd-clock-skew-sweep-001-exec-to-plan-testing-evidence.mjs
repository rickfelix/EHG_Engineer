#!/usr/bin/env node
/**
 * TESTING sub-agent evidence for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001, EXEC-TO-PLAN phase.
 *
 * Standard (not prospective) review of the SHIPPED commit 76af9188fdd: pieces (c) absolute clock
 * pin and (d) wall-clock-test lint. Every claim below was taken by execution, not by reading:
 * the suites were run (24/24 pass, runner-written JSON results file hashed below), both lint
 * modes were run, the two --all violations were independently confirmed genuine, the regexes
 * were probed against 27 hand-built edge cases, and the PIN-vs-OFFSET precedence was verified
 * end-to-end against the real on-disk ledger rather than inferred from the source.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

// Provenance per the gate-evidence rule: these counters are TRANSCRIBED from the runner-written
// JSON artifact whose sha256 is recorded beside them, not asserted by this reviewer.
const RESULTS_ARTIFACT = 'C:/Users/rickf/AppData/Local/Temp/claude/C--Users-rickf-Projects--EHG-EHG-Engineer/81425e08-c5b5-4fde-bafc-f0b9d5e9c349/scratchpad/results.json';
const RESULTS_SHA256 = '4aea059d2d08b003cf36c8e51c0e8a329d60bf7c54587a983c0c94768054b969';

const findings = [
  {
    id: 'spawn-harness-inherits-parent-clock-env-negative-controls-invert',
    severity: 'MEDIUM',
    summary: "tests/unit/hygiene/clock-skew-reapplication.spawn.test.js:30 runChildVitest builds the child env as `{ ...process.env, ...extraEnv }`, so a child inherits TEST_CLOCK_OFFSET_MS / TEST_CLOCK_PIN_ISO from the PARENT run. MEASURED, not reasoned: with only TEST_CLOCK_OFFSET_MS set in the parent, 2 of 8 tests fail (the two negative controls at :87 'unset writes no ledger' and :103 'malformed fails safe', which both require the var to be ABSENT from the child); with TEST_CLOCK_PIN_ISO + TEST_CLOCK_OFFSET_MS both set, 4 of 8 fail. The env-inheritance line is PRE-EXISTING (confirmed present at 76af9188fdd^:31), but piece (c) WIDENS it two ways: it adds a second leaking variable with its own two negative controls (:197), and the new PIN-wins precedence creates a NEW inversion class in which an inherited PIN silently overrides an OFFSET the test passed EXPLICITLY, breaking even the positive assertion at :67. BLAST RADIUS IS BOUNDED: the suite self-skips under CI (:53 NESTED_VITEST_AVAILABLE = !process.env.CI), so the real FR-2 weekly skew job never runs it, and a clean-env local run is fully green (24/24). The exposed case is a developer who exported the very variable this feature introduces -- i.e. someone debugging this feature. FIX IS TWO LINES AND VERIFIED SOUND: neutralize both vars in the child env baseline before spreading extraEnv (`TEST_CLOCK_OFFSET_MS: '', TEST_CLOCK_PIN_ISO: ''`); both parsers already treat '' as not-set (setup.clock-skew.js:41, :48), and a child spawned with both set to '' was confirmed by execution to emit no [clock-skew] line and pass 2/2.",
  },
  {
    id: 'all-mode-exits-1-on-the-documented-diagnostic-baseline',
    severity: 'LOW',
    summary: "scripts/lint/wall-clock-test-lint.mjs:191 `process.exit(violating.length === 0 ? 0 : 1)` makes --all exit 1 on the 2 known pre-existing baseline violations, even though :189's own output string and the :27 header both declare --all 'diagnostic only, never the CI entry point'. A mode documented as non-blocking that returns a failing exit code cannot be placed in any pipeline without `|| true`. Not a correctness bug in the predicate -- the 2 reported files are genuine (independently confirmed below) -- but the exit contract contradicts the stated intent. Diff mode's exit code is correct and is the CI-facing one.",
  },
  {
    id: 'parsePinMs-uses-global-Date-parse-not-the-captured-RealDate',
    severity: 'LOW',
    summary: "setup.clock-skew.js:49 calls `Date.parse(raw)` via the global rather than the RealDate captured at :38, which is the discipline the file's own :34-37 comment establishes for exactly this hazard. NOT a live defect: parsePinMs runs at module-load time (:56), setupFiles re-evaluate per test FILE, and no test body (hence no vi.useFakeTimers) has run at that point, so the global Date is still real. Cosmetic consistency only -- flagged because the surrounding code is otherwise scrupulous about it and a future reader may copy the looser pattern into a context where it does bite.",
  },
];

const verified = [
  "SUITES PASS: `npx vitest run scripts/lint/wall-clock-test-lint.test.js tests/unit/hygiene/clock-skew-reapplication.spawn.test.js` -> Test Files 2 passed (2), Tests 24 passed (24), 0 failed. Re-run with --reporter=json to a runner-written results file; numTotalTests=24 numPassedTests=24 numFailedTests=0, sha256 4aea059d2d08b003cf36c8e51c0e8a329d60bf7c54587a983c0c94768054b969.",
  "LINT --all: exit 1, '4173 test file(s) scanned, 2 violation(s)' -> tests/unit/chairman/sms-outbound-missing-prior-sid-column.test.js and tests/unit/chairman/sms-outbound-mms-media-url.test.js. BOTH INDEPENDENTLY CONFIRMED GENUINE, not tolerated false positives: each calls reconcileOutboundSms(...) (:90 / :71,:93) and each contains only bare `new Date()` with NO argument -- a REAL-clock construction -- which FAKE_CLOCK_TOKEN_RE correctly declines to accept as a clearing token. The 2-violation figure matches the commit message's re-measured baseline (not the ticket's estimated 13, nor the session's own first buggy 11).",
  "LINT diff mode: exit 0, '2 test file(s) touched, 0 new violation(s), 0 pre-existing'. Cross-checked the scoping by hand -- `git diff --name-status -M --diff-filter=ACMR <merge-base>..HEAD` lists 4 paths, of which exactly 2 match TEST_FILE_RE (wall-clock-test-lint.test.js, clock-skew-reapplication.spawn.test.js); tests/setup.clock-skew.js is correctly excluded as a non-test filename. merge-base 78f6c1ac4c3.",
  "REGEX PROBES (the revised detection, i.e. the CURRENT committed version, not the earlier draft): the prospective review's two reported false-positive classes are genuinely closed -- `resolveChairmanZone: stub` -> false and `vi.fn(resolveChairmanZone)` -> false (no trailing paren on the name), while `reconcileOutboundSms(a)`, `reconcileOutboundSms (a)` and `x.isInQuietHours(d)` -> true. The new-Date clearing token discriminates correctly by ARGUMENT: `new Date()` -> false (real clock, stays a violation) but `new Date(0)`, `new Date('2026-01-01')` and `new  Date( `2026` )` -> true. No substring bleed: `snow:`, `knowledge:`, `tomorrow:`, `const nowIso` all -> false; `mockReconcileOutboundSms(` -> false.",
  "PIN MECHANISM END-TO-END against the REAL on-disk ledger (not inferred from source): parent env TEST_CLOCK_PIN_ISO=2026-03-04T04:30:00Z + TEST_CLOCK_OFFSET_MS=99999999 -> stdout carried both the pin-active line and the 'ignored, PIN takes precedence' line; all 8 ledger rows recorded mode='pin', the correct pinned_iso, and observed_offset_ms=0 for every one -- i.e. the pin actually HELD per-test, it did not merely get announced.",
  "PARSER FAIL-SAFE confirmed by execution: a child spawned with TEST_CLOCK_PIN_ISO='' and TEST_CLOCK_OFFSET_MS='' emits no [clock-skew] activation line and passes 2/2, proving empty-string reads as not-set (this doubles as the proof that the finding-1 fix is sound).",
  "LEDGER SCHEMA / CONSUMER COMPATIBILITY: the added `mode` and `pinned_iso` keys are purely ADDITIVE to the existing {file,test,observed_offset_ms} shape. Searched every ledger consumer in the repo (clock-skew-ledger|CLOCK_SKEW_LEDGER_PATH|observed_offset_ms) -- only setup.clock-skew.js, the spawn test, and two one-off PRD scripts. The spawn test's pre-existing offset assertions read observed_offset_ms positionally and are unaffected; no consumer does strict key validation, so no reader breaks.",
  "DOGFOOD: both newly-added test files pass the tool's own isViolation() predicate (false / false) -- the SD does not introduce a violation of the rule it ships.",
  "DOCUMENTED LIMITS CHECKED AND ACCURATELY STATED (not overclaimed): comment-blindness is real in both directions ('// calls isInQuietHours(d)' registers as a call; '// now: nothing' clears a file) and TEST_FILE_RE genuinely excludes .test.ts/.spec.js/.spec.ts/.test.tsx. Both are disclosed verbatim in the file header's KNOWN LIMITATION and SCOPE NOTE, so these are declared scope boundaries rather than undisclosed defects. parseRenameMap parses 'R100\\told\\tnew' -> new->old and ignores M entries, so the rename-aware baseline works as claimed.",
];

const recommendations = [
  "Land the two-line env neutralization in runChildVitest before this suite is relied on for any locally-reproduced clock investigation: add `TEST_CLOCK_OFFSET_MS: ''` and `TEST_CLOCK_PIN_ISO: ''` between `...process.env` and `...extraEnv` at clock-skew-reapplication.spawn.test.js:30-35. Verified sound by execution; it is strictly a hardening of an already-green default path.",
  "Decide the --all exit contract: either exit 0 always (matching its documented diagnostic-only status) or drop the 'diagnostic only' wording. Leaving both is what turns a census into an accidental blocker the first time someone pipelines it.",
  "Before promoting diff mode from advisory to a required CI check (the header already flags this as a separate later decision), close the SCOPE NOTE gap first -- .test.ts/.spec.* are invisible to both modes today, so a required check would give false assurance over the 472 tracked *.test.js outside tests/ plus the untouched TS/spec population.",
];

const summary = "Standard EXEC-TO-PLAN review of the SHIPPED commit 76af9188fdd (pieces (c) absolute clock pin + (d) wall-clock-test lint) for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001. The implementation is substantially correct and the suites genuinely pass: 24/24 across both files, 0 failed, captured to a runner-written JSON results file (sha256 4aea059d...). Both lint modes were RUN, not assumed: --all reports 2 violations over 4173 scanned files (matching the commit's re-measured baseline, and both files independently confirmed to be genuine violations rather than tolerated false positives -- each calls reconcileOutboundSms with only a bare argument-less `new Date()`), and diff mode reports 0 new / 0 pre-existing over the 2 touched test files, with the file scoping cross-checked by hand against git diff. The revised ENTRY_POINT_RE / FAKE_CLOCK_TOKEN_RE were probed against 27 edge cases and the earlier prospective review's two false-positive classes (`name: stub` DI keys, vi.mock factory keys) are genuinely closed in the CURRENT committed version, with correct discrimination between real-clock `new Date()` and pinned `new Date('...')`. PIN-over-OFFSET precedence was verified end-to-end against the real on-disk ledger: all 8 rows carried mode='pin' with observed_offset_ms=0, proving the pin HELD per test rather than merely being announced; the new mode/pinned_iso keys are additive and no ledger consumer in the repo breaks. ONE REAL DEFECT FOUND, by execution rather than inspection: runChildVitest (:30) spreads ...process.env into the child, so a parent run that exports TEST_CLOCK_OFFSET_MS fails 2 of 8 tests and one exporting both vars fails 4 of 8 -- the negative controls invert because they require the vars to be ABSENT. The env-inheritance line is pre-existing (present at 76af9188fdd^), but piece (c) widens it by adding a second leaking variable and by making an inherited PIN silently override an EXPLICITLY passed OFFSET. Blast radius is bounded (the suite self-skips under CI, so the real weekly skew job is unaffected, and a clean-env run is fully green), and the fix is two lines, already verified sound by execution. Two LOW items also noted: --all exits 1 on its own documented diagnostic-only baseline, and parsePinMs uses global Date.parse rather than the RealDate the file's own comment mandates (not live-exploitable at module-load time).";

const justification = "CONDITIONAL_PASS, not PASS, because a measured defect exists: the spawn harness's env inheritance inverts its own negative controls (2/8 failing with OFFSET set, 4/8 with both set), and piece (c)'s PIN precedence actively widened that pre-existing hole rather than leaving it neutral -- an inherited PIN now overrides an offset the test passed explicitly, which is a silent inversion of the test's stated intent, the same 'green run that proves nothing' failure class this entire SD lineage exists to eliminate. CONDITIONAL_PASS rather than FAIL because nothing here blocks shipping: the default path is fully green (24/24), CI never executes the affected suite (it self-skips on process.env.CI), the two lint modes both behave exactly as documented with an independently re-confirmed baseline, the pin mechanism was proven to hold per-test against the real ledger, and the single defect has a two-line fix already verified by execution. Confidence 93 rather than higher because the lint is an admittedly coarse, comment-blind, whole-file substring scan whose blind spots (.test.ts/.spec.* invisibility, comments counting as calls) I confirmed are real -- they are honestly disclosed in the source and acceptable while the tool is advisory, but they cap how much assurance the tool itself can carry, and that ceiling is a property of the design rather than something this review could resolve.";

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
    confidence_score: 93,
    findings,
    recommendations,
    summary,
    justification,
    metadata: {
      test_execution: buildTestExecution({
        executed: 24,
        passed: 24,
        failed: 0,
        skipped: 0,
        artifactSha: RESULTS_SHA256,
        artifactPath: RESULTS_ARTIFACT,
        runner: 'vitest@4.1.4 (npx vitest run --reporter=json)',
        source: 'fresh',
        mappedCandidates: 2,
        foundFiles: 2,
      }),
      measured: true,
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      validation_mode: 'standard',
      review_type: 'standard (shipped code review, NOT prospective)',
      reviewed_commit: '76af9188fddb702d5476867740dbf96f21dfbe69',
      reviewed_branch: 'feat/SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001',
      merge_base: '78f6c1ac4c3475496678464ef6664878fe90467c',
      test_results: {
        suites_run: [
          'scripts/lint/wall-clock-test-lint.test.js',
          'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js',
        ],
        test_files_passed: 2,
        test_files_failed: 0,
        tests_passed: 24,
        tests_failed: 0,
        tests_total: 24,
        runner: 'vitest 4.1.4',
        results_file_sha256: '4aea059d2d08b003cf36c8e51c0e8a329d60bf7c54587a983c0c94768054b969',
        results_file_producer: 'npx vitest run --reporter=json --outputFile=<scratchpad>/results.json',
      },
      lint_measurements: {
        all_mode: { scanned: 4173, violations: 2, exit_code: 1, files: ['tests/unit/chairman/sms-outbound-missing-prior-sid-column.test.js', 'tests/unit/chairman/sms-outbound-mms-media-url.test.js'], both_confirmed_genuine: true },
        diff_mode: { touched: 2, new_violations: 0, pre_existing: 0, exit_code: 0 },
      },
      verified_by_execution: verified,
      verification_commands: [
        'git show --stat 76af9188fdd',
        'npx vitest run scripts/lint/wall-clock-test-lint.test.js tests/unit/hygiene/clock-skew-reapplication.spawn.test.js',
        'npx vitest run <both suites> --reporter=json --outputFile=<scratchpad>/results.json  (runner-written evidence, sha256 above)',
        'node scripts/lint/wall-clock-test-lint.mjs --all',
        'node scripts/lint/wall-clock-test-lint.mjs   (diff mode)',
        'git diff --name-status -M --diff-filter=ACMR $(git merge-base origin/main HEAD)..HEAD  (cross-check of diff-mode scoping)',
        'TEST_CLOCK_PIN_ISO=2026-03-04T04:30:00.000Z TEST_CLOCK_OFFSET_MS=99999999 CLOCK_SKEW_LEDGER_PATH=<scratch> npx vitest run tests/unit/hygiene/clock-skew-reapplication.spawn.test.js  (PIN-wins + ledger inspection; also surfaced finding 1)',
        'TEST_CLOCK_OFFSET_MS=3888000000 npx vitest run tests/unit/hygiene/clock-skew-reapplication.spawn.test.js  (severity measurement for finding 1: 2/8 fail)',
        "TEST_CLOCK_PIN_ISO='' TEST_CLOCK_OFFSET_MS='' npx vitest run --project unit tests/unit/hygiene/clock-skew-fixture.test.js  (proof the finding-1 fix is sound)",
        'git show 76af9188fdd^:tests/unit/hygiene/clock-skew-reapplication.spawn.test.js  (confirmed finding 1 is pre-existing in class)',
        'scratchpad probe.mjs — 27 regex/API edge-case assertions against the exported isViolation / TEST_FILE_RE / parseRenameMap / TIME_SENSITIVE_ENTRY_POINTS',
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'TESTING' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('TESTING EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? 'EXEC_TO_PLAN');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
