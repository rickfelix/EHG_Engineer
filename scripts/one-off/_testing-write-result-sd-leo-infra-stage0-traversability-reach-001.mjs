#!/usr/bin/env node
/**
 * Write TESTING sub-agent EXEC-phase verdict for
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001
 * (CH-6: traversability gate reach — required_capabilities prompted in all 5
 * discovery strategies and the gate invoked on all 4 Stage-0 entry paths)
 * ahead of its EXEC-TO-PLAN handoff.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + the canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) rather than a
 * hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '537227ac-8954-4e53-b9c4-67e4d13858f3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001';

const findings = [
  {
    id: 'F1-full-stagezero-suite-green',
    severity: 'INFO',
    summary: 'npx vitest run tests/unit/eva/stage-zero/ tests/unit/stage-zero.test.js tests/unit/discovery-mode.test.js -> 46 test files, 706/706 tests pass, ~10s. Zero regressions across the entire Stage-0 unit surface, which includes the new traversability-reach.test.js file, the extended discovery-mode/competitor-teardown/venture-reseeding/blueprint-browse path tests, and stage-zero.test.js. Re-run clean AGAIN after the mutation test restore (706/706).'
  },
  {
    id: 'F2-new-test-file-independently-verified',
    severity: 'INFO',
    summary: 'Read tests/unit/eva/stage-zero/paths/traversability-reach.test.js line by line and confirmed it tests what it claims per path: blueprint_browse (pass case: gate invoked, undeclared candidate takes the honest auto-pass, PathOutput returned + v_unified_capabilities queried; fail-closed: EnvelopeUnavailableError propagates); competitor_teardown (pass: required_capabilities matching envelope passes + gate invoked; fail/park: undelivered capability -> parked with source_ref.missing + path returns null; fail-closed: EnvelopeUnavailableError propagates); seeded_from_venture (pass: carried-forward required_capabilities from source metadata.stage_zero matches envelope + gate invoked; fail/park: source requires undelivered capability -> parked + null; fail-closed: EnvelopeUnavailableError propagates). blueprint_browse correctly has NO park case because opportunity_blueprints has no required_capabilities data source (TR-1) so an undeclared candidate auto-passes — consistent with the SD design.'
  },
  {
    id: 'F3-source-verified-4-paths-gated',
    severity: 'INFO',
    summary: 'Independently verified all 4 path source files invoke the gate: competitor-teardown.js Step 3.5 (loadCapabilityEnvelope -> checkTraversability -> parkFailedCandidate on failure -> return null) at lines 125-147, required_capabilities added to the deconstructToFirstPrinciples prompt (line 336) and carried into gateCandidate + createPathOutput (lines 136, 163); venture-reseeding.js Step 3.5 gate block at lines 74-94 with requiredCapabilities carried forward from source.metadata.stage_zero (line 72, best-effort not fabricated); blueprint-browse.js Step 4.5 gate block at lines 89-110 (gate only, no capability sourcing, honest auto-pass); discovery-mode.js already had the gate (this SD added required_capabilities prompting to the other 4 of 5 strategies + nursery carry-forward). All 4 mirror discovery-mode.js pattern and let EnvelopeUnavailableError propagate unhandled (fail-closed).'
  },
  {
    id: 'F4-mutation-test-proves-non-tautological',
    severity: 'INFO',
    summary: 'Independent mutation verification on a DIFFERENT path than the implementer-verified blueprint_browse: I neutered the Step-3.5 gate-invocation block in venture-reseeding.js (removed loadCapabilityEnvelope + checkTraversability + the park/return-null branch, so createPathOutput is reached unconditionally) and re-ran the seeded_from_venture tests. All 3 FAILED exactly as designed: (a) pass case failed because supabase._calledTables no longer contains v_unified_capabilities (the envelope query never fired); (b) fail/park case failed because the path returned a full PathOutput instead of null and parkedRow stayed null (no park occurred); (c) fail-closed case failed because executeVentureReseeding resolved with a PathOutput instead of rejecting with EnvelopeUnavailableError (confirmed by the diff dump showing the full seeded_from_venture PathOutput object). The 3 tests are therefore genuinely coupled to the gate, not tautological.'
  },
  {
    id: 'F5-mutation-restore-clean',
    severity: 'INFO',
    summary: 'IMPORTANT recovery note: the SD changes are uncommitted working-tree edits (git status M, not commits), so the initial `git checkout -- venture-reseeding.js` reverted to the pre-SD committed HEAD (stripping the implementer gate work) rather than restoring the working-tree SD version. Detected immediately from the still-failing re-run + editor reminder, and restored byte-for-byte from the in-context original Read. Post-restore: git diff --stat shows exactly `venture-reseeding.js | 31 insertions(+)` (matching the originally-reported +31, all additions, zero deletions), the 3 seeded_from_venture tests are GREEN again, and the full 706-test suite is GREEN again. No residue.'
  },
  {
    id: 'F6-eslint-clean-and-no-stray-changes',
    severity: 'INFO',
    summary: 'npx eslint on all 10 changed files (4 path impls + 5 test files touched + the new traversability-reach.test.js) exits 0 with zero errors/warnings — includes the SD-noted one-line cleanup of the unused FALLBACK_STRATEGIES import in discovery-mode.js. git status confirms the change set is exactly: 4 modified path impls (blueprint-browse, competitor-teardown, discovery-mode, venture-reseeding), 4 modified path test files, modified stage-zero.test.js, and 1 new untracked traversability-reach.test.js. lib/eva/stage-zero/traversability-gate.js is UNTOUCHED (empty git status), confirming TR-2 (gate internal logic unchanged).'
  }
];

const warnings = [];

const recommendations = [
  'Allow EXEC-TO-PLAN handoff to proceed: full-suite green (706/706), new test file independently read-verified per path, mutation-proven non-tautological on the seeded_from_venture path, eslint clean, and the gate file itself untouched (TR-2 honored).',
  'No E2E coverage required: this is a server-side selection-path invariant (traversability gate reach on 3 previously-ungated Stage-0 entry paths). It is fully exercised at the unit level against the REAL traversability-gate.js imports (loadCapabilityEnvelope/checkTraversability/parkFailedCandidate are not mocked — only the Supabase query surface and LLM client are). No new UI/route surface is introduced by this reach-not-mechanism change.',
];

const summary = 'PASS (confidence 95). Stage-0 traversability gate REACH fix verified. Full suite: 46 files / 706 tests pass, zero regressions (green pre- and post-mutation-restore). The new traversability-reach.test.js was read line-by-line and independently confirmed to test pass / fail-park / fail-closed-propagation for each of the 3 newly-gated paths (blueprint_browse pass+fail-closed only, correctly no park because opportunity_blueprints has no capability source; competitor_teardown and seeded_from_venture full pass+park+fail-closed triads). All 3 gate blocks verified at source (competitor-teardown Step 3.5, venture-reseeding Step 3.5, blueprint-browse Step 4.5) mirroring discovery-mode.js, with EnvelopeUnavailableError propagating fail-closed. Independent mutation test on the seeded_from_venture path (DIFFERENT from the implementer-verified blueprint_browse): neutering the gate block makes all 3 seeded tests FAIL — pass case (v_unified_capabilities never queried), fail/park case (returns PathOutput not null, no park), fail-closed case (resolves instead of rejecting) — proving non-tautology. A git-checkout misstep during mutation-revert (SD edits are uncommitted working-tree changes, so checkout reverted to pre-SD HEAD) was caught immediately and the file restored byte-for-byte from the in-context original; git diff --stat confirms exactly +31 insertions (all additions) and the suite is green again. eslint on all 10 changed files exits 0. traversability-gate.js is UNTOUCHED (TR-2 satisfied). No blocking or code-level gaps found.';

const justification = [
  'PASS (confidence 95) - SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 EXEC-phase test evidence is sufficient for EXEC-TO-PLAN handoff.',
  '',
  'EVIDENCE:',
  '1. Full suite: npx vitest run tests/unit/eva/stage-zero/ tests/unit/stage-zero.test.js tests/unit/discovery-mode.test.js -> 46 files, 706/706 pass. Zero regressions. Re-run clean AGAIN after the mutation-test restore.',
  '2. New test file independently read-verified: traversability-reach.test.js proves, per newly-gated path, gate-invoked pass / parked-and-null fail / EnvelopeUnavailableError fail-closed propagation. blueprint_browse correctly omits a park case (no capability source -> honest auto-pass).',
  '3. Source verified: competitor-teardown.js (Step 3.5, lines 125-147, +required_capabilities in prompt line 336), venture-reseeding.js (Step 3.5, lines 74-94, +carry-forward line 72), blueprint-browse.js (Step 4.5, lines 89-110, gate-only). All mirror discovery-mode.js; all let EnvelopeUnavailableError propagate.',
  '4. Non-tautology proof (mutation test, seeded_from_venture path — DIFFERENT from implementer-verified blueprint_browse): neutered the gate block -> all 3 seeded tests FAIL (v_unified_capabilities not queried / returns PathOutput not null with no park / resolves instead of rejecting). Restored byte-for-byte from in-context original after catching a checkout-to-HEAD misstep; git diff --stat = +31 insertions only, full suite green post-restore.',
  '5. eslint on all 10 changed files -> exit 0, zero errors/warnings. traversability-gate.js UNTOUCHED (TR-2). Change set is exactly the expected 4 impls + 5 test files + 1 new test file, no stray edits.',
  '',
  'RATIONALE FOR PASS:',
  'The reach fix is confirmed at source level (4 paths now invoke the gate; required_capabilities sourced or carried where a source exists, honest auto-pass where none exists) and by real behavior against the un-mocked traversability-gate.js. The new test file is genuinely coupled to the gate, proven by direct mutation on a path independent of the implementer\'s own manual verification. No blocking gaps; no warnings raised.'
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      test_files: [
        'tests/unit/eva/stage-zero/paths/traversability-reach.test.js',
        'tests/unit/eva/stage-zero/paths/discovery-mode.test.js',
        'tests/unit/eva/stage-zero/paths/competitor-teardown.test.js',
        'tests/unit/eva/stage-zero/paths/venture-reseeding.test.js',
        'tests/unit/eva/stage-zero/paths/blueprint-browse.test.js',
        'tests/unit/stage-zero.test.js',
      ],
      full_suite_scope: 'tests/unit/eva/stage-zero/ + tests/unit/stage-zero.test.js + tests/unit/discovery-mode.test.js',
      full_suite_files: 46,
      full_suite_tests_total: 706,
      full_suite_tests_passed: 706,
      full_suite_tests_failed: 0,
      changed_source_files: [
        'lib/eva/stage-zero/paths/blueprint-browse.js',
        'lib/eva/stage-zero/paths/competitor-teardown.js',
        'lib/eva/stage-zero/paths/discovery-mode.js',
        'lib/eva/stage-zero/paths/venture-reseeding.js',
      ],
      gate_file_untouched: 'lib/eva/stage-zero/traversability-gate.js (empty git status; TR-2 satisfied)',
      paths_now_gated: {
        'competitor_teardown': 'Step 3.5 gate block (lines 125-147); required_capabilities in deconstructToFirstPrinciples prompt (line 336)',
        'seeded_from_venture': 'Step 3.5 gate block (lines 74-94); required_capabilities carried forward from source.metadata.stage_zero (line 72)',
        'blueprint_browse': 'Step 4.5 gate block (lines 89-110); no capability source -> honest no_requirements_declared auto-pass (TR-1)',
        'discovery_mode': 'gate pre-existing; this SD added required_capabilities prompting to 4 of 5 strategies + nursery carry-forward',
      },
      mutation_non_tautology: 'venture-reseeding.js gate block neutered -> all 3 seeded_from_venture tests FAIL (pass: v_unified_capabilities not queried; fail/park: PathOutput not null + no park; fail-closed: resolves not rejects). Restored byte-for-byte from in-context original; git diff --stat = +31 insertions (all additions, zero deletions); full 706-test suite green post-restore',
      mutation_path_selected: 'seeded_from_venture (venture-reseeding.js) — deliberately DIFFERENT from the implementer-verified blueprint_browse',
      eslint_status: 'npx eslint on all 10 changed files -> exit 0, zero errors/warnings',
      e2e_applicable: false,
      e2e_exemption_reason: 'server-side selection-path invariant (traversability gate reach on 3 previously-ungated Stage-0 entry paths); fully exercised at unit level against the REAL traversability-gate.js imports (gate not mocked, only Supabase query surface + LLM client). No new UI/route surface (reach-not-mechanism change).',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        full_suite: '706/706 pass across 46 files (green pre- and post-mutation-restore)',
        new_test_file_read_verified: 'traversability-reach.test.js: pass/fail-park/fail-closed per newly-gated path; blueprint_browse correctly no park (no capability source)',
        source_gate_trace: '4 paths invoke loadCapabilityEnvelope->checkTraversability->park/return-null, mirroring discovery-mode.js; EnvelopeUnavailableError propagates',
        mutation_non_tautology: 'seeded_from_venture gate neutered -> 3 tests FAIL; restored clean (+31 ins only)',
        eslint: 'exit 0 on all 10 changed files',
        no_stray_changes: 'traversability-gate.js untouched; change set = 4 impls + 5 test files + 1 new test file',
      },
    },
    phase: 'EXEC',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
