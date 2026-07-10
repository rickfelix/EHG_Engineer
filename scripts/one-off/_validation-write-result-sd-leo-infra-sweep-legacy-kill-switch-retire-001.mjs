#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN_VERIFICATION-phase verdict
 * for SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 ahead of its PLAN-TO-LEAD handoff.
 *
 * GATE 4 (PLAN Verification): independent implementation validation against the
 * PRD's 3 FRs (FR-1 retirement record, FR-2 CI parity test, FR-3 corrected exemption
 * count) + 2 TRs (TR-1 no core/ordering/gating change, TR-2 new file + not HAS_REAL_DB
 * gated) + TS-1..TS-5. Corroborates the EXEC TESTING evidence
 * (_testing-write-result-sd-leo-infra-sweep-legacy-kill-switch-retire-001.mjs).
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) rather than a hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '18343fb6-b637-466b-8c8c-e5eef0fa69da';
const SD_KEY = 'SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001';

const findings = [
  {
    id: 'V1-fr1-retirement-record-source-verified',
    severity: 'INFO',
    summary: 'FR-1 PASS (source + runtime verified). Read scripts/stale-session-sweep.cjs directly: SWEEP_PASS_REGISTRY_RETIREMENT is declared next to SWEEP_PASS_REGISTRY_ENABLED with owner="coordinator (fleet-infra on-call)", a concrete checkable condition (30 consecutive prod days with SWEEP_PASS_REGISTRY never set to off AND the CI parity test green for that window), and an enumerated retirement_action (remove the SWEEP_PASS_REGISTRY_ENABLED branch at all 7 gated call sites, delete lib/sweep/legacy-fallback.cjs, delete the parity test, delete the record). Exported via module.exports.SWEEP_PASS_REGISTRY_RETIREMENT. Runtime check (require both modules) confirms owner/condition/retirement_action are all typeof string && length>0. lib/sweep/legacy-fallback.cjs header comment was updated: the old unowned "if SWEEP_PASS_REGISTRY_ENABLED is ever removed ... this whole file can be deleted" prose is replaced with a RETIREMENT block that references SWEEP_PASS_REGISTRY_RETIREMENT by name and points at the parity test. Metadata-only: nothing reads the const at runtime (grep confirms the only other reference is the export line and the test).'
  },
  {
    id: 'V2-fr2-parity-test-covers-all-three-twins',
    severity: 'INFO',
    summary: 'FR-2 PASS (source-verified). tests/ci/sweep-legacy-twin-parity.test.js drives real fixtures through all THREE duplicated pairs: (TS-1) runIntentCollisionLegacy vs passes/intent-collision-detection.cjs run() -> identical ctx.warnings + ctx.collisionsDetected (plus an error-path no-op parity case); (TS-2) runDeadLetterLegacy vs passes/dead-letter-planning.cjs run() -> identical ctx.actions + identical supabase.update() call args, with the SAME fixed instant (FIXED_NOW_MS=1_800_000_000_000) injected to BOTH ctx.now and the legacy nowMs override per the PRD AC; (TS-3) runCoordinationDetectorsLegacy vs passes/coordination-detectors.cjs run() -> same 4 underlying lib functions called the same number of times with the same supabase arg (via require-cache monkey-patch of signal-router/coordination-events, no vi.mock needed). A makeSupabaseSpy() stub stands in for all I/O so it is deterministic. The dead-letter nowMs source difference (legacy Date.now() at call site vs pass ctx.now.getTime()) is explicitly documented as a KNOWN NUANCE, TR-1 out-of-scope, not fixed.'
  },
  {
    id: 'V3-fr2-non-tautology-mutation-empirically-proven',
    severity: 'INFO',
    summary: 'FR-2 / TS-4 non-tautology INDEPENDENTLY re-proven by me (not just trusting the in-test simulated .push mutation-check its). I injected a REAL one-sided source divergence into lib/sweep/passes/intent-collision-detection.cjs (warnings.push(line) -> warnings.push(line + " MUTATED_DIVERGENCE")) and ran `npx vitest run ... -t intent-collision`: the PRIMARY parity assertion ("legacy and pass produce identical warnings + collisionsDetected") FAILED with AssertionError, proving the parity test catches a genuine source-level twin divergence, not merely an in-test array push. Restored via `git checkout` — git status confirms clean (no residual mutation). The three built-in MUTATION CHECK its (one per pair) additionally assert the comparators throw on divergence.'
  },
  {
    id: 'V4-fr3-exactly-three-delegating-sites-exempted',
    severity: 'INFO',
    summary: 'FR-3 PASS. grep -c "exempt from" scripts/stale-session-sweep.cjs = 3 (not 4). The three dispatch-level delegating call sites are marked with the correct shared-function-delegation rationale: EARLY_PASSES[0]/clearStaleQfClaims, MAIN_PASSES[0]/identity-collision-split (splitCollidingSessions), MAIN_PASSES[1]/claim-boundary-probe (runClaimBoundaryProbe) — each comment states both branches call the SAME function directly so they cannot diverge, hence no parity test applies. planDeadLetters is correctly NOT among the exemptions: it is folded into FR-2 (its own orchestration wrappers differ on nowMs and are parity-tested via runDeadLetterLegacy/dead-letter-planning). The sourcing proposal\'s stated count of four is corrected to three, exactly as FR-3 requires.'
  },
  {
    id: 'V5-tr1-core-untouched',
    severity: 'INFO',
    summary: 'TR-1 PASS. `git diff --name-only` shows lib/sweep/pass-registry.cjs is NOT modified. The git diff of scripts/stale-session-sweep.cjs shows the SWEEP_PASS_REGISTRY_ENABLED declaration line and every `if (SWEEP_PASS_REGISTRY_ENABLED)` branch appear as unchanged context lines — only additive comments were inserted ABOVE them; the read/branch/gating logic itself is untouched. No MAIN_PASSES/EARLY_PASSES reordering. Only two tracked source files changed (legacy-fallback.cjs header + stale-session-sweep.cjs additive record/comments/export) plus the new test file. No production runtime behavior change.'
  },
  {
    id: 'V6-tr2-test-location-and-not-db-gated',
    severity: 'INFO',
    summary: 'TR-2 PASS. New file lives under tests/ci/ (matching the decision-creating-set-parity.db.test.js precedent) and uses vitest (describe/it/expect/vi). It is NOT HAS_REAL_DB-gated: the single "HAS_REAL_DB" string in the file is a comment explicitly stating the test is NOT gated and runs unconditionally in CI (all I/O mocked). Verified by running it with no DB env — 30/30 tests pass.'
  },
  {
    id: 'V7-full-suite-green',
    severity: 'INFO',
    summary: 'Ran `npx vitest run tests/ci/sweep-legacy-twin-parity.test.js tests/unit/lib/sweep` twice (before and after my mutation experiment): 3 test files, 30/30 passing both times. Confirms current green state and that my temporary mutation was fully reverted.'
  }
];

const warnings = [
  'Non-blocking (documented in FR-2/TR-1, not a defect): the dead-letter twin has a genuine nowMs SOURCE divergence — legacy derives nowMs from a fresh Date.now() at its call site, the pass derives it from ctx.now.getTime(). The parity test intentionally supplies the SAME fixed instant to both sides so it stays green; the divergence is behaviorally inert given the 7-day dead-letter TTL granularity and is intentionally left unfixed per TR-1. If a future SD tightens dead-letter timing, this is the site to reconcile.'
];

const recommendations = [
  'Allow PLAN-TO-LEAD handoff to proceed: FR-1, FR-2, FR-3, TR-1, TR-2 and TS-1..TS-5 are all satisfied at source + behavior level, the parity test is empirically non-tautological (real source-mutation proven), and the delivered scope == approved scope (metadata record + additive comments + one new CI test, no production behavior change).',
  'No code changes required. The single open item (dead-letter nowMs source difference) is explicitly in-PRD and out-of-scope for this SD (TR-1); no PRD-text correction needed.',
  'Fast-follow candidate (record only, do NOT block this SD): reconcile the dead-letter nowMs derivation so the two twins share one clock source, removing the need for the parity test to hand-inject an identical instant.'
];

const summary = 'PASS (confidence 96). GATE 4 (PLAN Verification) implementation validation for SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001. Read the delivered code directly (scripts/stale-session-sweep.cjs, lib/sweep/legacy-fallback.cjs, tests/ci/sweep-legacy-twin-parity.test.js) and verified at runtime. FR-1: SWEEP_PASS_REGISTRY_RETIREMENT exists with non-empty owner/condition/retirement_action and is exported; legacy-fallback header updated to reference it; metadata-only, nothing reads it at runtime. FR-2: parity test covers all 3 twins (intent-collision, dead-letter with shared fixed nowMs, coordination-detectors) with fixture-based assertions, is NOT HAS_REAL_DB-gated, and I independently re-proved non-tautology by injecting a REAL source divergence into intent-collision-detection.cjs and watching the primary parity assertion fail, then git-restoring clean. FR-3: exactly 3 (not 4) dispatch-level delegating sites exempted (clearStaleQfClaims, splitCollidingSessions, runClaimBoundaryProbe) with correct shared-function reasoning; planDeadLetters correctly folded into FR-2 instead of exempted. TR-1: pass-registry.cjs untouched, no MAIN_PASSES/EARLY_PASSES reorder, SWEEP_PASS_REGISTRY_ENABLED read/branch logic unchanged (additive comments only). TR-2: new tests/ci/ vitest file, runs unconditionally. Full suite `vitest run tests/ci/sweep-legacy-twin-parity.test.js tests/unit/lib/sweep` = 30/30 green. One non-blocking, in-PRD-documented nuance (dead-letter nowMs source difference, TR-1 out-of-scope). No scope creep. No rubber-stamp: every FR/AC was checked against actual code + a live run.';

const justification = [
  'PASS (confidence 96) - SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001 implementation is validated for PLAN-TO-LEAD.',
  '',
  'GATE 4 (PLAN Verification) checklist:',
  '- Implementation Validation: delivered code matches approved PRD scope. All 3 FRs + 2 TRs + TS-1..TS-5 verified at source and runtime. VERIFIED.',
  '- No Scope Creep: only lib/sweep/legacy-fallback.cjs (header) + scripts/stale-session-sweep.cjs (record + 3 exemption comments + export) changed, plus the new CI parity test. No production behavior change. Delivered == approved. VERIFIED.',
  '- Integration Validation: retirement const is metadata-only (nothing reads it at runtime); legacy-fallback header now cross-references it and the parity test. No consumer breakage. VERIFIED.',
  '- No core change (TR-1): pass-registry.cjs untouched, no pass reordering, gating logic unchanged. VERIFIED.',
  '',
  'EVIDENCE:',
  '1. FR-1 (runtime): require() confirms SWEEP_PASS_REGISTRY_RETIREMENT.owner/condition/retirement_action are all non-empty strings; module.exports.SWEEP_PASS_REGISTRY_RETIREMENT present; legacy-fallback header rewritten to reference it.',
  '2. FR-2 (source + run): all three twin pairs asserted for parity; dead-letter injects one shared fixed instant to both sides; NOT HAS_REAL_DB-gated; 30/30 green.',
  '3. FR-2 non-tautology (my own mutation): injected warnings.push(line + " MUTATED_DIVERGENCE") into passes/intent-collision-detection.cjs -> primary parity assertion FAILED (AssertionError) -> git checkout restored clean. Proves the test catches real source divergence.',
  '4. FR-3: grep -c "exempt from" = 3; the three sites are clearStaleQfClaims / splitCollidingSessions / runClaimBoundaryProbe; planDeadLetters is NOT exempted (folded into FR-2). Count corrected from 4 to 3 as required.',
  '5. TR-1: git diff --name-only shows pass-registry.cjs absent; SWEEP_PASS_REGISTRY_ENABLED branch lines are unchanged context (comments added above only).',
  '',
  'RATIONALE FOR PASS:',
  'The change is minimal, additive, metadata-only at runtime, and every acceptance criterion was verified against actual source and a live test run — including an independent real-source mutation proving the parity test is load-bearing. The single open nuance (dead-letter nowMs source difference) is explicitly in-scope-of-the-PRD-as-a-known-nuance and out-of-scope-to-fix per TR-1, so it does not block. Confidence 96 reflects full functional confidence with that one intentionally-deferred nuance on record.'
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      gate: 'GATE_4_PLAN_VERIFICATION',
      validation_type: 'implementation_validation_and_duplicate_check',
      files_read_directly: [
        'scripts/stale-session-sweep.cjs (SWEEP_PASS_REGISTRY_RETIREMENT block + 3 exemption comments + export)',
        'lib/sweep/legacy-fallback.cjs (updated RETIREMENT header + 3 twin exports)',
        'tests/ci/sweep-legacy-twin-parity.test.js (TS-1..TS-5)',
        'lib/sweep/passes/intent-collision-detection.cjs (mutation target, restored)',
      ],
      fr_coverage: {
        'FR-1': 'PASS — SWEEP_PASS_REGISTRY_RETIREMENT with non-empty owner/condition/retirement_action, exported; legacy-fallback header updated to reference it; metadata-only (nothing reads at runtime). Runtime-verified.',
        'FR-2': 'PASS — parity test covers all 3 twins (intent-collision/dead-letter/coordination-detectors) with fixture assertions; dead-letter injects a shared fixed nowMs to both sides; NOT HAS_REAL_DB-gated; non-tautology re-proven by real source mutation.',
        'FR-3': 'PASS — exactly 3 dispatch-level delegating sites exempted (clearStaleQfClaims/splitCollidingSessions/runClaimBoundaryProbe) with shared-function rationale; planDeadLetters folded into FR-2, not exempted; count corrected 4->3.',
      },
      tr_coverage: {
        'TR-1': 'PASS — pass-registry.cjs untouched, no MAIN_PASSES/EARLY_PASSES reorder, SWEEP_PASS_REGISTRY_ENABLED read/branch logic unchanged (additive comments only).',
        'TR-2': 'PASS — new tests/ci/ vitest file, runs unconditionally (single HAS_REAL_DB string is a comment stating it is NOT gated).',
      },
      test_scenarios: {
        'TS-1': 'PASS — intent-collision twin parity (warnings + collisionsDetected).',
        'TS-2': 'PASS — dead-letter twin parity (actions + supabase.update args) with shared fixed nowMs.',
        'TS-3': 'PASS — coordination-detectors twin parity (same 4 fns, same counts, same supabase arg).',
        'TS-4': 'PASS — 3 in-test mutation-check its + my own real source-mutation on intent-collision confirmed primary parity assertion fails on divergence (non-tautological).',
        'TS-5': 'PASS — retirement record presence/shape test.',
      },
      independent_mutation_check: {
        target_file: 'lib/sweep/passes/intent-collision-detection.cjs',
        mutation: 'warnings.push(line) -> warnings.push(line + " MUTATED_DIVERGENCE")',
        primary_assertion_result: 'FAILED (AssertionError) — parity test caught real source divergence',
        restored_clean: true,
      },
      full_suite_result: '30/30 passing (3 files) — vitest run tests/ci/sweep-legacy-twin-parity.test.js tests/unit/lib/sweep',
      exemption_comment_count: 3,
      pass_registry_modified: false,
      corroborates_testing_writer: '_testing-write-result-sd-leo-infra-sweep-legacy-kill-switch-retire-001.mjs (EXEC)',
      known_nonblocking_nuance: 'dead-letter nowMs source difference (legacy Date.now() vs pass ctx.now.getTime()) — behaviorally inert per 7-day TTL, TR-1 out-of-scope, documented in-test.',
      e2e_applicable: false,
      e2e_exemption_reason: 'Server-side session-sweep kill-switch metadata + CI parity harness; no UI/route surface. Fully exercised at CI/unit level with mocked I/O.',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        fr1_source_and_runtime: 'const present with non-empty fields, exported, header updated, metadata-only',
        fr2_source_and_run: 'all 3 twins parity-asserted, not DB-gated, 30/30 green',
        fr2_real_mutation: 'injected divergence into pass module -> primary assertion failed -> git-restored clean',
        fr3_exemption_count: 'grep -c "exempt from" = 3; correct sites; planDeadLetters not exempted',
        tr1_core_untouched: 'pass-registry.cjs absent from diff; gating logic unchanged; no reorder',
        tr2_location_and_gating: 'tests/ci/ vitest, unconditional',
      },
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
