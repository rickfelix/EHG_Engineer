#!/usr/bin/env node
/**
 * One-off: Write TESTING sub-agent EXEC-TO-PLAN evidence for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurement provenance: stamp
 * perishability onto the existing premise-liveness path").
 *
 * EXEC is COMPLETE and committed (16adbbd210a on
 * feat/SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E). This is a VERIFICATION run —
 * all suites below were executed live via `npx vitest run --project unit <files>`
 * in this worktree, not inferred. Canonical repo-evidence + storage pattern copied
 * from the sibling PLAN-TO-EXEC script in this directory.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e74cd20f-02b7-4142-aee7-e443421efb7d';
const SD_KEY = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E';

const findings = [
  {
    id: 'F1-full-suite-run-83-of-83-green',
    severity: 'INFO',
    summary: 'Executed `npx vitest run --project unit` against the two new suites plus the full regression surface named in the PLAN-TO-EXEC assessment: tests/unit/governance/measurement-provenance.test.js (8), tests/unit/eva/feedback-premise-adapter-provenance.test.js (15), tests/unit/premise-liveness.test.js (17), tests/unit/eva/feedback-premise-adapter.test.js (7), tests/unit/eva/feedback-premise-adapter-identity.test.js (2), tests/unit/feedback/create-quick-fix-liveness-gate.test.js (4), tests/unit/governance/emit-feedback.test.js (13), tests/unit/governance/emit-feedback-auto-fill.test.js (8), tests/unit/governance/emit-feedback-telemetry-audience.test.js (9). Result: 9 files, 83/83 tests PASS, 14.02s wall. Also ran tests/unit/emit-feedback-extensions.test.js (15/15 pass, covers emitFeedbackBatch happy-path/shared-fields/PA-5 paths) as an additional regression check on the _buildRowObject signature change (new 4th provenanceDeps param, default {}). tests/unit/emit-feedback-bypass-static-guard.test.js is excluded from the "unit" vitest project by pre-existing config (confirmed via `vitest run --reporter=verbose`, not caused by this change) so it was not run.'
  },
  {
    id: 'F2-ac1-ac4-confirmed-inert-verdict',
    severity: 'INFO',
    summary: 'AC-1/AC-4 (STALE-with-provenance / fresh-LIVE-with-provenance) confirmed in tests/unit/eva/feedback-premise-adapter-provenance.test.js:76-114. Notably the suite goes beyond the two literal scenarios and adds a direct TR-3 inertness proof at :102-113 ("verdicts are IDENTICAL with and without provenance"): the SAME descriptor is checked with and without a metadata.provenance block and both status/recommendation are asserted equal. This is stronger evidence than AC-1/AC-4 alone ask for.'
  },
  {
    id: 'F3-ac2-verified-against-pre-change-source-independently',
    severity: 'INFO',
    summary: 'AC-2 (STALE refusal surfaces provenance; assertion must fail pre-change) independently re-verified by reading `git show HEAD~1:scripts/create-quick-fix.js` directly (not by trusting the test file\'s own claim): pre-change line ~243 selects `id, title, description, category, severity` (no metadata) and the STALE_PREMISE console.error block (pre-change ~248-249) prints only fb.id, fb.title, and verdict.evidence entries -- zero occurrences of measured_at/git_sha/git_ref/timezone. Post-change (git diff HEAD~1 -- scripts/create-quick-fix.js) widens the select to `..., metadata` and adds a guarded block printing measured_at + age, "measured against <ref> @ <sha>", and timezone, sourced from fb.metadata. The new test tests/unit/eva/feedback-premise-adapter-provenance.test.js:127-176 (TS-2) asserts this by static source-text regex over scripts/create-quick-fix.js (fs.readFileSync + anchored slices around "freshFb" and "[STALE_PREMISE]"), matching the pre-existing idiom already used by tests/unit/feedback/create-quick-fix-liveness-gate.test.js for the same non-injectable-CLI-entrypoint reason (documented in that file\'s own header). This is a legitimate, repo-consistent choice, not a shortcut -- see gap G1 below for what it does NOT prove.'
  },
  {
    id: 'F4-ac3-timezone-independence-confirmed-repo-idiom',
    severity: 'INFO',
    summary: 'AC-3 verified via measurement-provenance.test.js:34-57. measured_at is always Date#toISOString() (explicit Z), asserted against the regex /Z$|[+-]\\d{2}:\\d{2}$/. Age-computation identity is proven by parsing the same instant three ways (viaNormalizer using the reused normalizeToUTC, viaDirect using bare Date.parse, and a naive de-Z\'d spelling of the same instant through normalizeToUTC) and asserting all three equal. This follows the established repo idiom (tests/unit/handoff/wait-verdict.test.js:148-152, naive-vs-explicit-offset equivalence) rather than the PRD\'s literal but ICU-unreliable process.env.TZ-toggle wording -- a deviation the PLAN-TO-EXEC assessment (finding T5) explicitly recommended and flagged as an open interpretation call; EXEC followed that recommendation.'
  },
  {
    id: 'F5-binding-constraints-verified-in-actual-diff',
    severity: 'INFO',
    summary: 'Verified via `git diff HEAD~1 --stat`/`--name-only` (9 files: 4 source, 1 new module, 3 one-off evidence scripts, 2 new test files -- zero migration files). TR-1 (no new DB table/column): confirmed -- no SQL/migration file in the diff; provenance rides entirely inside the existing feedback.metadata jsonb column (widened SELECT list only). TR-2 (no other feedback writer instrumented): confirmed -- lib/coordinator/signal-router.cjs is absent from the changed-files list, and only lib/governance/emit-feedback.js\'s shared _buildRowObject() was touched (both emitFeedback and emitFeedbackBatch route through it, so both got the stamp for free -- see gap G2 on batch test coverage). TR-3 (recentRecount/findShippedFix untouched): confirmed -- lib/eva/premise-liveness.js is absent from the changed-files list entirely; the provenance carry-through lives in feedback-premise-adapter.js\'s feedbackToPremiseDescriptor (a different, explicitly-named-as-legal-in-the-PRD extension point) via a new private _extractProvenance() helper. TR-4 (git capture injectable + fail-soft): confirmed by direct code read of lib/governance/measurement-provenance.js:38-47 (defaultGit, execSync + try/catch -> \'\') and :70-76 (safeGit wraps the INJECTED git fn too, so even a caller-supplied throwing git cannot escape) -- both paths are exercised by measurement-provenance.test.js:65-78.'
  },
  {
    id: 'F6-legacy-and-partial-provenance-rows-covered',
    severity: 'INFO',
    summary: 'feedback-premise-adapter-provenance.test.js:61-73 covers both a row with no metadata at all (legacy) and a row whose metadata exists but carries none of the four provenance keys -- both return null, matching _extractProvenance\'s early-return guard at feedback-premise-adapter.js (`if (!measured_at && !git_sha && !git_ref) return null`). Note the guard does not check `timezone` in that OR -- a row with ONLY `metadata.timezone` set (no measured_at/git_sha/git_ref) would fall through and return a mostly-null provenance object rather than null; this exact shape is untested (minor, see G3).'
  }
];

const gaps = [
  {
    id: 'G1-ts2-is-static-text-inspection-not-live-execution',
    severity: 'WARNING',
    summary: 'AC-2/TS-2 coverage (feedback-premise-adapter-provenance.test.js:127-176) is entirely regex-over-source-text, not an executed run of createQuickFix() with a mocked Supabase client. It proves the SHAPE of the change (select includes metadata; the STALE block prints measured_at/measured-against/git token; normalizeToUTC is used, not a raw Date.parse) but does NOT prove that scripts/create-quick-fix.js actually RUNS without throwing when a real STALE row with a provenance-bearing metadata object flows through it end-to-end (e.g. a malformed prov.measured_at reaching normalizeToUTC, or Number.isFinite(ageMs) branching correctly when normalizeToUTC returns null). This is the SAME limitation the PRD\'s own PLAN-TO-EXEC assessment flagged (finding T2/T3) and accepted as the repo\'s established convention for this non-injectable CLI file (create-quick-fix-liveness-gate.test.js uses the identical static-regex idiom for the pre-existing STALE gate) -- not a new shortcut introduced by EXEC. Residual risk is low (the printed block is a console.error side-effect wrapped in the existing try/catch that already fails open on ANY liveness-check error, scripts/create-quick-fix.js:258-261) but it is real: a bug in the provenance-print block specifically would surface as a fail-open warning, not a test failure, until observed live.'
  },
  {
    id: 'G2-emitfeedbackbatch-path-untested-for-provenance',
    severity: 'WARNING',
    summary: 'lib/governance/emit-feedback.js:443 threads `shared?.provenanceDeps || {}` into _buildRowObject() for the emitFeedbackBatch() path, so batch-inserted feedback rows get the SAME provenance stamping and anti-spoof ordering as single emitFeedback() calls -- by construction, since both share _buildRowObject. But no test exercises this: tests/unit/emit-feedback-extensions.test.js (the batch suite, 15/15 passing) contains zero references to measured_at/git_sha/provenanceDeps (confirmed via grep). The batch happy-path test does pass, meaning the code does not throw, but nothing asserts that a batch item\'s metadata actually contains a measured_at, nor that a batch item attempting to spoof metadata.measured_at is overridden the same way TS-6 proves for the single-item path. Recommend PLAN either accept this as low-risk (identical code path, single-item spoof-resistance already proven) or ask EXEC for one follow-up assertion in emit-feedback-extensions.test.js or the new measurement-provenance.test.js.'
  },
  {
    id: 'G3-timezone-only-partial-metadata-shape-untested',
    severity: 'INFO',
    summary: '_extractProvenance\'s null-guard (feedback-premise-adapter.js) only tests measured_at/git_sha/git_ref for presence, not timezone. A feedback row with `metadata: { timezone: "UTC" }` and nothing else would produce `{ measured_at: null, git_sha: null, git_ref: null, timezone: "UTC" }` rather than null. This shape cannot occur through the actual writer (buildMeasurementProvenance always sets measured_at when it sets timezone, per measurement-provenance.js:57-66), so it is not reachable in practice -- flagging only because the test suite does not assert the guard\'s literal boundary, and a future caller hand-writing metadata could hit it.'
  },
  {
    id: 'G4-normalizeToUTC-null-branch-in-create-quick-fix-not-directly-unit-tested',
    severity: 'INFO',
    summary: 'scripts/create-quick-fix.js\'s new block computes `ageMs = measuredAtUTC ? Date.now() - measuredAtUTC.getTime() : null` and guards the printed age with `Number.isFinite(ageMs)`, correctly handling normalizeToUTC returning null for an unparseable measured_at. This branch is sound by inspection but -- consistent with G1 -- is not exercised by an executed test (only by static regex confirming normalizeToUTC is called at all, not that its null path is handled). Low risk given the surrounding try/catch fail-open.'
  }
];

const warnings = gaps.filter(g => g.severity === 'WARNING').map(g => g.summary);

const recommendations = [
  'PLAN: accept G1/G4 (static-source-inspection coverage for the non-injectable create-quick-fix.js CLI entrypoint) as consistent with pre-existing repo convention for this exact file -- do not require EXEC to refactor create-quick-fix.js into an injectable form solely for this SD; that would exceed TR-1..TR-4 scope.',
  'Optional low-cost follow-up (not a blocker): add one assertion to tests/unit/emit-feedback-extensions.test.js or tests/unit/governance/measurement-provenance.test.js proving emitFeedbackBatch stamps/protects provenance the same way single emitFeedback does (G2) -- e.g. pass shared.provenanceDeps with a fixed clock and assert insertCall[0].metadata.measured_at on a batch item.',
  'No action needed for G3 -- the unreachable timezone-only shape is not producible by the canonical writer.',
];

const summary = 'TESTING verification (EXEC complete, commit 16adbbd210a) for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E EXEC-TO-PLAN. Live-executed `npx vitest run --project unit` against the two new suites (measurement-provenance.test.js: 8 tests, feedback-premise-adapter-provenance.test.js: 15 tests) plus the full regression surface named in the PLAN-TO-EXEC assessment (premise-liveness.test.js, feedback-premise-adapter.test.js, feedback-premise-adapter-identity.test.js, create-quick-fix-liveness-gate.test.js, emit-feedback.test.js, emit-feedback-auto-fill.test.js, emit-feedback-telemetry-audience.test.js) plus emit-feedback-extensions.test.js (batch-path regression) as an additional check. RESULT: 10 files, 98/98 tests PASS (83 in the primary named set + 15 in the batch-regression add-on), zero failures. AC-1/AC-4 (STALE/LIVE with provenance, TR-3 inertness) proven with an extra direct "verdicts identical with/without provenance" assertion beyond what the ACs literally require. AC-2 (STALE refusal surfaces provenance, fails pre-change) independently re-verified against `git show HEAD~1:scripts/create-quick-fix.js` -- confirmed the pre-change source neither selects metadata nor prints any provenance token, so the new regex assertions genuinely fail red pre-change and pass green post-change; coverage method is static source-text inspection (fs.readFileSync + regex), matching the pre-existing idiom for this one non-injectable CLI file, not a new shortcut. AC-3 (timezone-independent age) proven via the repo\'s established naive-vs-explicit-offset equivalence idiom, per the PLAN-TO-EXEC assessment\'s own recommendation. All four binding constraints (TR-1 no new DB column/table, TR-2 no other writer instrumented + signal-router.cjs untouched, TR-3 premise-liveness.js entirely untouched in the diff, TR-4 git capture injectable+fail-soft, double-wrapped even against an injected throwing git) verified directly against `git diff HEAD~1 --stat/--name-only` and the module source, not inferred. GAPS found and reported honestly: (G1/G4) the create-quick-fix.js provenance-print block is covered by static regex, not live execution -- an accepted, pre-existing repo convention for this file, low residual risk given the enclosing fail-open try/catch; (G2) the emitFeedbackBatch path receives the same provenance stamping by construction (shared _buildRowObject) but has zero dedicated test coverage proving it -- a real, low-cost-to-close gap PLAN should note; (G3) a theoretical timezone-only-metadata shape is unreachable through the canonical writer and needs no action. None of these gaps touch a TR-3-protected file, none weaken the anti-spoof or fail-soft guarantees that ARE tested, and none block EXEC-TO-PLAN. GO for EXEC-TO-PLAN.';

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
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'verification of committed implementation (no build performed)',
      go_no_go: 'GO',
      commit_under_test: '16adbbd210a',
      test_runner: 'vitest run --project unit (npm run test:unit)',
      suites_executed: {
        'tests/unit/governance/measurement-provenance.test.js': { tests: 8, result: 'PASS' },
        'tests/unit/eva/feedback-premise-adapter-provenance.test.js': { tests: 15, result: 'PASS' },
        'tests/unit/premise-liveness.test.js': { tests: 17, result: 'PASS' },
        'tests/unit/eva/feedback-premise-adapter.test.js': { tests: 7, result: 'PASS' },
        'tests/unit/eva/feedback-premise-adapter-identity.test.js': { tests: 2, result: 'PASS' },
        'tests/unit/feedback/create-quick-fix-liveness-gate.test.js': { tests: 4, result: 'PASS' },
        'tests/unit/governance/emit-feedback.test.js': { tests: 13, result: 'PASS' },
        'tests/unit/governance/emit-feedback-auto-fill.test.js': { tests: 8, result: 'PASS' },
        'tests/unit/governance/emit-feedback-telemetry-audience.test.js': { tests: 9, result: 'PASS' },
        'tests/unit/emit-feedback-extensions.test.js': { tests: 15, result: 'PASS', note: 'batch-path (emitFeedbackBatch) regression, run as an additional check beyond the PLAN-TO-EXEC named set' },
      },
      totals: { files: 10, tests: 98, pass: 98, fail: 0 },
      acceptance_criteria: {
        'AC-1': { desc: 'STALE for advanced-state provenance row', status: 'PASS', evidence: 'tests/unit/eva/feedback-premise-adapter-provenance.test.js:77-88' },
        'AC-2': { desc: 'STALE refusal surfaces provenance; fails pre-change', status: 'PASS', evidence: 'tests/unit/eva/feedback-premise-adapter-provenance.test.js:127-176; independently re-checked against git show HEAD~1:scripts/create-quick-fix.js', method: 'static source-text regex (repo convention for this non-injectable CLI file)' },
        'AC-3': { desc: 'Timezone-independent age', status: 'PASS', evidence: 'tests/unit/governance/measurement-provenance.test.js:34-57', note: 'follows repo naive-vs-explicit-offset idiom, not literal TZ-env-toggle wording, per PLAN-TO-EXEC recommendation' },
        'AC-4': { desc: 'Fresh measurement still LIVE', status: 'PASS', evidence: 'tests/unit/eva/feedback-premise-adapter-provenance.test.js:90-113' },
      },
      binding_constraints: {
        'TR-1': { desc: 'No new DB table/column', status: 'VERIFIED', evidence: 'git diff HEAD~1 --name-only: zero migration files; provenance rides in existing feedback.metadata jsonb' },
        'TR-2': { desc: 'No other feedback writer instrumented; signal-router.cjs untouched', status: 'VERIFIED', evidence: 'git diff HEAD~1 --name-only: lib/coordinator/signal-router.cjs absent' },
        'TR-3': { desc: 'lib/eva/premise-liveness.js untouched', status: 'VERIFIED', evidence: 'git diff HEAD~1 --name-only: lib/eva/premise-liveness.js absent' },
        'TR-4': { desc: 'git capture injectable + fail-soft', status: 'VERIFIED', evidence: 'lib/governance/measurement-provenance.js:38-47,70-76; tests/unit/governance/measurement-provenance.test.js:65-78' },
      },
      gaps_reported: gaps.map(g => ({ id: g.id, severity: g.severity })),
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
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
