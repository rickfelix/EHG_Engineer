#!/usr/bin/env node
// PLAN phase: insert the PRD for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 (inline-mode PRD generation,
// per CLAUDE_PLAN.md "PRD Creation — Inline Mode is the Default for Claude Code"). Scoped to
// pieces (c) and (d) only -- piece (b) is LEAD-deferred (see sd-clock-skew-sweep-001-lead-scope-
// reduction.mjs), following the real, MEASURED codebase state rather than the ticket's as-authored
// text (VALIDATION evidence da990b0f corrected two dead identifiers before this PRD was written).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
if (sdErr) { console.error('SD_LOOKUP_FAILED', sdErr); process.exit(1); }

const prd = {
  id: `PRD-${SD_KEY}`,
  directive_id: SD_KEY,
  sd_id: sd.id,
  title: 'Absolute clock pin + wall-clock-test lint (pieces c/d of QF-20260912-364)',
  status: 'approved',
  category: 'technical',
  priority: 'high',
  document_type: 'prd',
  phase: 'PLAN_PRD',
  progress: 60,

  executive_summary: 'Adds an absolute TEST_CLOCK_PIN_ISO pin to the clock-skew test harness (closing a DST/quiet-window blind spot the existing offset pin cannot reach) and a diff-mode lint catching future time-sensitive tests shipped without a fake-clock token. Piece (b) is deferred (live file collision).',

  functional_requirements: [
    {
      id: 'FR-1',
      title: 'Absolute TEST_CLOCK_PIN_ISO pin, reapplied per-test',
      priority: 'critical',
      description: 'tests/setup.clock-skew.js gains parsePinMs(raw) (Date.parse, fail-safe to null on invalid input, mirroring the existing parseOffsetMs) and an ACTIVE_MODE derivation (pin wins over offset when both are set). The beforeEach hook pins vi.setSystemTime to the exact PIN_MS instant on every test (not once at module load), matching the existing per-test-reapplication contract the offset pin already proves is necessary (a sibling test\'s vi.useRealTimers() must never leave a later test in the same file unpinned).',
      acceptance_criteria: [
        'parsePinMs returns null for undefined/empty/malformed input, never throws (tests/setup.clock-skew.js)',
        'When TEST_CLOCK_PIN_ISO is set, every test in the file observes Date.now() within 5000ms of the pinned instant, proven by a JSONL ledger entry per test (mode:"pin", pinned_iso, observed_offset_ms)',
        'When both TEST_CLOCK_PIN_ISO and TEST_CLOCK_OFFSET_MS are set, PIN wins and a loud stdout line names the ignored offset',
      ],
    },
    {
      id: 'FR-2',
      title: 'Sweep matrix covers a +45d-class instant AND an SMS-quiet-window instant',
      priority: 'high',
      description: 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js (the real filename; the ticket text and tests/setup.clock-skew.js\'s own header comment both carried the stale non-.spawn. name, now fixed) gains new nested-vitest test cases: a general +45d-class absolute pin, and a specific pin at 2027-01-15T04:00:00.000Z (2027-01-14 23:00 ET, unambiguously EST/winter) verified via Intl timezone conversion to actually fall inside the 22:00-06:00 ET window this SD closes coverage for.',
      acceptance_criteria: [
        'A dedicated test asserts the chosen quiet-window pin, converted to America/New_York, has hour >= 22 or hour < 6 -- the fixture premise is verified, not assumed',
        'Both new pin-mode test cases assert ledger.length === 2 (G1 and G2) with mode:"pin" and near-zero observed_offset_ms, mirroring the existing offset-mode assertions',
        'A malformed TEST_CLOCK_PIN_ISO test confirms fail-safe behavior (no activation line, no ledger file) exactly like the existing malformed-offset test',
      ],
    },
    {
      id: 'FR-3',
      title: 'wall-clock-test-lint.mjs: file-level diff-mode detector',
      priority: 'critical',
      description: 'scripts/lint/wall-clock-test-lint.mjs flags a test file that references one of TIME_SENSITIVE_ENTRY_POINTS (reconcileOutboundSms, isInQuietHours, resolveChairmanZone, smsQuietWindowReleaseIso -- corrected from the ticket\'s non-existent reconcileSentRows, per VALIDATION evidence da990b0f) with no now:/DAY_NOW/FAKE_NOW/useFakeTimers token anywhere in the same file. Mirrors scripts/lint/shell-injection-argv-lint.mjs\'s structure: a hardened-git-runner diff scoped to mergeBase..HEAD, a merge-base-blob baseline partition (pre-existing violations reported, never blocking), and an inline pragma escape hatch (wall-clock-test-lint-disable-file).',
      acceptance_criteria: [
        'isViolation(source) is a pure function: true iff an entry-point name appears AND no fake-clock token appears, false if the pragma is present',
        'Diff mode partitions violations into newViolations (blocks) and preExisting (reported only) by comparing current file content against the merge-base blob\'s own violation status',
        '--all mode census against the current tree measures the REAL baseline (11 files / 4173 test files scanned, not the ticket\'s estimated 13) -- this SD\'s own tests pin the corrected number',
      ],
    },
    {
      id: 'FR-4',
      title: 'retryOrAlert coverage is transitive, not direct',
      priority: 'medium',
      description: 'The ticket also names retryOrAlert as a time-sensitive entry point, but it is module-private in lib/chairman/sms-outbound-worker.js (never exported) -- no test file can import or call it directly. Every test exercising it does so through reconcileOutboundSms, which FR-3\'s entry-point list already covers, so omitting retryOrAlert from the direct-match list loses no real coverage. Documented inline in the tool rather than silently dropped.',
      acceptance_criteria: [
        'scripts/lint/wall-clock-test-lint.mjs\'s header comment states the retryOrAlert omission and why, so a future reader does not "fix" it back to a name that can never match',
      ],
    },
    {
      id: 'FR-5',
      title: 'Piece (b) explicitly deferred, not silently dropped',
      priority: 'high',
      description: 'The CI timeout-measurement piece (JSON reporter on .github/workflows/unit-tier-clock-skew.yml\'s existing run step + a triggered workflow_dispatch run) is deferred to a follow-up ticket: SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 (status active, phase EXEC, a DIFFERENT live session) independently plans its own new job on that same workflow file, and per CLAUDE_LEAD.md ("SDs touching same files should NOT run in parallel"), this SD does not touch it. The deferral is recorded in strategic_directives_v2.metadata.deferred_pieces with the blocking SD key.',
      acceptance_criteria: [
        '.github/workflows/unit-tier-clock-skew.yml is untouched by this SD\'s diff',
        'strategic_directives_v2.metadata.deferred_pieces names piece "b" and blocked_by_sd_key SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001',
      ],
    },
  ],

  technical_requirements: [
    { id: 'TR-1', title: 'Pin parsing fails safe, never throws', rationale: 'Matches the existing parseOffsetMs contract (QF-20260912-364 TR-2 / TS-9) -- a malformed env value must degrade to "unset behavior", never crash a CI run or a dev\'s local test.' },
    { id: 'TR-2', title: 'wall-clock-test-lint.mjs uses only the hardened git runner for git operations', rationale: 'lib/git/hardened-runner.cjs is the published, audited control for shell-injection/config-injection vectors in git subprocess calls (SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A) -- a new lint tool must not hand-roll a second git-exec path.' },
    { id: 'TR-3', title: 'Ledger schema gains an additive, backward-compatible `mode` field', rationale: 'Existing consumers of the JSONL ledger (the offset-mode spawn tests) read observed_offset_ms only; adding mode:"pin"|"offset" and pinned_iso is purely additive and does not change any existing assertion.' },
  ],

  system_architecture: {
    overview: 'Two independent, additive extensions to existing test infrastructure: (1) tests/setup.clock-skew.js gains a second, mutually-exclusive clock-control mode (absolute pin vs the existing relative offset), consumed transparently by any test file the setupFiles hook already covers. (2) scripts/lint/wall-clock-test-lint.mjs is a new, standalone static-analysis script following the repo\'s established diff-mode lint pattern (shell-injection-argv-lint.mjs), with no runtime coupling to (1) beyond sharing the same conceptual "fake-clock token" vocabulary.',
    components: [
      { name: 'tests/setup.clock-skew.js', responsibility: 'vitest setupFiles hook: parses TEST_CLOCK_OFFSET_MS / TEST_CLOCK_PIN_ISO, reapplies vi.setSystemTime per-test, writes a JSONL proof ledger', technology: 'vitest, node:fs' },
      { name: 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js', responsibility: 'out-of-process consumer: spawns a nested vitest run with the env vars set, reads the ledger from outside to prove the setup hook fired for every test', technology: 'vitest, node:child_process (spawnSync)' },
      { name: 'scripts/lint/wall-clock-test-lint.mjs', responsibility: 'standalone diff-mode + --all-census static analysis tool; no dependency on the setup hook at runtime', technology: 'node ESM, lib/git/hardened-runner.cjs' },
    ],
    data_flow: 'Setup hook: env var -> parse -> beforeEach sets system time -> ledger append -> spawn-test reads ledger from outside the child process. Lint tool: git diff (or full-tree walk) -> file content read -> pure isViolation() predicate -> stdout report + exit code.',
    integration_points: ['vitest setupFiles (vitest.config.js)', '.github/workflows/unit-tier-clock-skew.yml (READ-ONLY reference for FR-2\'s +45d-class instant; not modified by this SD)', 'lib/git/hardened-runner.cjs'],
  },

  test_scenarios: [
    { id: 'TS-1', scenario: 'Absolute pin reapplies for G2 after G1 resets to real timers', test_type: 'integration', given: 'TEST_CLOCK_PIN_ISO set to a future instant, a 2-test fixture where the first test\'s afterEach calls vi.useRealTimers()', when: 'the nested vitest run executes both tests', then: 'both ledger entries show mode:"pin" with observed_offset_ms within 5000ms of zero' },
    { id: 'TS-2', scenario: 'Pin instant is verified to actually fall inside the SMS quiet window', test_type: 'unit', given: 'the chosen quiet-window pin ISO string', when: 'converted to America/New_York via Intl', then: 'hour >= 22 or hour < 6' },
    { id: 'TS-3', scenario: 'PIN takes precedence when both env vars are set', test_type: 'integration', given: 'TEST_CLOCK_PIN_ISO and TEST_CLOCK_OFFSET_MS both set', when: 'the nested vitest run executes', then: 'the activation line names PIN active and the offset as ignored; the ledger shows mode:"pin" exclusively' },
    { id: 'TS-4', scenario: 'Malformed TEST_CLOCK_PIN_ISO fails safe', test_type: 'integration', given: "TEST_CLOCK_PIN_ISO='not-a-date'", when: 'the nested vitest run executes', then: 'no activation line is printed and no ledger file is created' },
    { id: 'TS-5', scenario: 'wall-clock-test-lint isViolation pure-function coverage', test_type: 'unit', given: 'synthetic file-content fixtures', when: 'isViolation(source) is called', then: 'true only when an entry-point name appears AND no fake-clock token appears AND no pragma is present' },
    { id: 'TS-6', scenario: 'wall-clock-test-lint diff-mode baseline partition', test_type: 'unit', given: 'an injected fake git runner returning a merge-base blob and a current file, both violating', when: 'runDiffMode executes', then: 'the file is classified preExisting, not newViolations; a file violating only at HEAD (not at merge-base) is classified newViolations' },
    { id: 'TS-7', scenario: 'wall-clock-test-lint --all census measures the real baseline', test_type: 'integration', given: 'the current repo tree', when: 'node scripts/lint/wall-clock-test-lint.mjs --all runs', then: 'reports exactly the measured count (11 as of 2026-09-13) -- a regression test pins this number so a future run that silently changes it is visible' },
  ],

  acceptance_criteria: [
    'npx vitest run tests/unit/hygiene/clock-skew-reapplication.spawn.test.js passes all 8 cases (4 existing offset-mode + 4 new pin-mode)',
    'node scripts/lint/wall-clock-test-lint.mjs --all reports the measured baseline with 0 script errors',
    'node scripts/lint/wall-clock-test-lint.mjs (diff mode) against this PR\'s own diff reports 0 new violations',
    '.github/workflows/unit-tier-clock-skew.yml has zero diff lines in this PR (piece b deferred)',
  ],

  risks: [
    { risk: 'A hand-computed UTC offset for the SMS-quiet-window test instant could be off by an hour if DST is misjudged', probability: 'LOW', impact: 'MEDIUM', mitigation: 'Picked an unambiguously-winter (January) date and verify the ET hour via Intl.DateTimeFormat / toLocaleString with timeZone America/New_York inside the test itself, rather than trusting a hand-computed UTC offset comment', rollback_plan: 'Revert the specific test case; the general pin mechanism (FR-1) is independently covered by TS-1 and unaffected' },
    { risk: 'wall-clock-test-lint.mjs could false-positive on a test that is time-sensitive but already safe via an indirect mocking path the static scanner cannot see', probability: 'MEDIUM', impact: 'LOW', mitigation: 'Ships advisory-first (--diff mode reported, not wired into a blocking CI job in this SD) with a documented inline pragma escape hatch, mirroring the shell-injection-argv-lint/schema-reference-lint rollout convention', rollback_plan: 'Add the pragma to the affected file, or revert the lint tool entirely -- it has no other consumer' },
    { risk: 'Piece (b)\'s deferral could be forgotten (no follow-up ticket ever filed)', probability: 'LOW', impact: 'MEDIUM', mitigation: 'strategic_directives_v2.metadata.deferred_pieces records the blocking condition machine-readably (blocked_by_sd_key), not just in prose, so a future sweep of deferred pieces can find it', rollback_plan: 'N/A -- this is a documentation/tracking risk, not a code risk' },
  ],

  implementation_approach: {
    phases: [
      { phase: 'Phase 1', description: 'Extend tests/setup.clock-skew.js with the absolute pin + precedence handling (FR-1)', deliverables: ['tests/setup.clock-skew.js updated', 'stale filename reference in its header comment fixed'] },
      { phase: 'Phase 2', description: 'Extend the spawn-test consumer with pin-mode coverage (FR-2)', deliverables: ['tests/unit/hygiene/clock-skew-reapplication.spawn.test.js: 4 new test cases'] },
      { phase: 'Phase 3', description: 'Build the lint tool with the corrected entry-point list and measured baseline (FR-3, FR-4)', deliverables: ['scripts/lint/wall-clock-test-lint.mjs', 'scripts/lint/wall-clock-test-lint.test.js'] },
    ],
    technical_decisions: [
      'PIN wins over OFFSET when both are set, rather than refusing to start or combining them -- the two express different intents (a moving window vs a frozen instant) and combining them has no sensible meaning',
      'The lint tool checks whole-file content, not per-added-line -- the call site and the fake-clock setup are commonly on different lines of the same file, so a per-line diff (like shell-injection-argv-lint) would miss the real predicate',
      'Piece (b) is deferred rather than force-fit around the quarantine SD\'s concurrent edit -- editing the same workflow file from two SDs the same day is a guaranteed collision CLAUDE_LEAD.md already names as prohibited',
    ],
  },

  integration_operationalization: {
    consumers: [
      { name: 'Any test file already covered by vitest setupFiles', interaction: 'Transparently gains the ability to opt into an absolute clock pin via TEST_CLOCK_PIN_ISO; no change for files that never set it', frequency: 'every unit-tier vitest run' },
      { name: 'CI / local developers running scripts/lint/wall-clock-test-lint.mjs', interaction: 'Diagnostic report on stdout, exit code 0/1; not yet wired into a blocking CI job in this SD', frequency: 'on-demand / future CI wiring' },
    ],
    dependencies: [
      { name: 'lib/git/hardened-runner.cjs', type: 'upstream', contract: 'makeHardenedGitRunner(cwd) factory, argv-array calls only', failure_handling: 'A degraded/unresolvable merge-base returns { mode: "diff (degraded)" } and scans nothing rather than crashing or fail-closing' },
      { name: '.github/workflows/unit-tier-clock-skew.yml', type: 'downstream (read-only reference)', contract: 'FR-2\'s +45d-class test instant mirrors this workflow\'s existing TEST_CLOCK_OFFSET_MS value; this SD does not modify the file', failure_handling: 'N/A -- no runtime coupling' },
    ],
    data_contracts: [
      { contract_name: 'clock-skew ledger JSONL', schema: '{file, test, mode: "pin"|"offset", observed_offset_ms, pinned_iso?} one line per test', validation: 'Read back and asserted by the spawn-test consumer within the same PR', versioning: 'Additive only -- existing offset-mode consumers read observed_offset_ms, unaffected by the new mode/pinned_iso fields' },
    ],
    runtime_config: {
      environment_variables: ['TEST_CLOCK_PIN_ISO (new, opt-in, unit tier only)', 'TEST_CLOCK_OFFSET_MS (existing, unchanged)', 'CLOCK_SKEW_LEDGER_PATH (existing, unchanged)'],
      feature_flags: [],
      deployment_considerations: 'No deployment -- test-infrastructure-only change. The lint tool is a standalone script, not wired into any build step by this SD.',
    },
    observability_rollout: {
      monitoring: ['[clock-skew] activation lines on stdout when either env var is set (unchanged convention)'],
      alerts: [],
      rollout_strategy: 'Direct merge -- test-infrastructure and a diagnostic-only lint tool carry no production rollout risk',
      rollback_trigger: 'New pin-mode tests fail in CI',
      rollback_procedure: 'Revert the PR; the offset-mode path is untouched in its own code paths and remains fully functional',
    },
  },

  exploration_summary: {
    files_read: [
      'tests/setup.clock-skew.js', 'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js', 'tests/unit/hygiene/clock-skew-fixture.test.js',
      '.github/workflows/unit-tier-clock-skew.yml', 'lib/chairman/sms-outbound-worker.js', 'lib/notifications/orchestrator.js',
      'lib/comms/adam-outbound/quiet-hours-extension.js', 'lib/time/chairman-et-wall-clock.js', 'scripts/lint/shell-injection-argv-lint.mjs', 'lib/git/hardened-runner.cjs',
    ],
    patterns_identified: [
      'Per-test reapplication (beforeEach, not module-load) is required because any test\'s vi.useRealTimers() cancels the skew for later tests in the same file',
      'Diff-mode lint with a merge-base baseline partition (shell-injection-argv-lint.mjs) is the established rollout pattern for a new static check: advisory on pre-existing debt, blocking only on new introductions',
    ],
    key_decisions: [
      'Corrected two dead identifiers from the ticket text (reconcileSentRows -> reconcileOutboundSms; clock-skew-reapplication.test.js -> .spawn.test.js) before authoring FR content, per VALIDATION sub-agent evidence da990b0f',
      'Deferred piece (b) after discovering a live, same-day file-ownership collision with SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001',
    ],
    exploration_date: new Date().toISOString(),
  },
};

const { error: insertErr } = await supabase.from('product_requirements_v2').upsert(prd, { onConflict: 'id' });
if (insertErr) { console.error('PRD_INSERT_FAILED', insertErr); process.exit(1); }
console.log('PRD inserted:', prd.id);
