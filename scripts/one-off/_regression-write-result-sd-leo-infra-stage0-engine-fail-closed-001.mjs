#!/usr/bin/env node
/**
 * REGRESSION sub-agent PLAN_VERIFICATION verdict for
 * SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001.
 * Canonical repo-evidence pattern (applySubAgentRepoVerdict) + storeSubAgentResults.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ece35968-e155-4b25-bbda-c438ff783cb3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001';

const findings = [
  {
    id: 'F1-runsynthesis-consumer-inventory',
    severity: 'INFO',
    summary: 'Public contract / consumer map of runSynthesis(pathOutput, deps). Callers (git grep): (1) lib/eva/stage-zero/index.js:33 pure re-export; (2) lib/eva/stage-zero/stage-zero-orchestrator.js:86 the ONLY production consumer, invoked as `synthesizeFn = synthesize || runSynthesis` and awaited to a `brief`; (3) tests (orchestrator test mocks it; synthesis-engine.test.js and synthesis-fail-closed.test.js call the REAL impl). Return shape is additive-only: all pre-existing top-level brief fields (name, problem_statement, maturity, metadata.synthesis.*) remain; the only changes are (a) additive `_failed:true` markers inside catch-block fallback objects and (b) newly-computed components_run/components_total. No field removed or renamed; signature unchanged.'
  },
  {
    id: 'F2-components_run-no-production-consumer',
    severity: 'INFO',
    summary: 'Backward-compat (a): components_run can now be < components_total. git grep for components_run|components_total across all *.js/*.ts/*.mjs/*.cjs (node_modules excluded) shows references ONLY in the producer lib/eva/stage-zero/synthesis/index.js and in test files — NO production consumer reads either field, and none branches on ===15. The field is chairman-explainability metadata inside metadata.synthesis. TYPE is unchanged (number); only VALUE range widened (0..15 instead of always 15), and only when real component failures occur. Zero downstream code can break on the widened range. SAFE.'
  },
  {
    id: 'F3-maturity-blocked-fully-handled',
    severity: 'INFO',
    summary: 'Backward-compat (b): maturity can now be \'blocked\' where a run previously silently emitted \'ready\'. All maturity consumers already treat \'blocked\' as a first-class, pre-existing enum value: interfaces.js:109 validMaturities=[ready,seed,sprout,blocked,nursery] (validation passes); chairman-review.js:55-56 maps blocked->park (safer than proceeding); :244 blocked->30d review; :303/:307/:311 explicit blocked/nursery handling; venture-nursery.js:50 passthrough default. \'blocked\' was ALREADY producible pre-change via constraints.verdict===\'fail\', so no new enum value is introduced. chairman-review.test.js:161 already asserts \'blocked\'. NO consumer anywhere assumes maturity is always \'ready\'. The new anyComponentFailed->blocked branch emits an already-fully-handled value; downstream effect is a safer park + tighter review — exactly the fix intent, not a contract break. SAFE.'
  },
  {
    id: 'F4-no-unconditional-components15-or-ready-assumption',
    severity: 'INFO',
    summary: 'Repo-wide search for code assuming components_run===15 unconditionally or maturity always non-blocked: NONE in production. synthesis-engine.test.js:134-135 asserts components_run/total===15 but ONLY on the all-components-succeed baseline path, which still yields 15/15 post-change (not a violation). Other repo `maturity` hits (lib/uat/*, portfolio-optimizer, nav_routes scripts) are unrelated domains (nav-route draft/development/complete; numeric portfolio score) and are not touched by this brief.maturity change.'
  },
  {
    id: 'F5-maturity-precedence-new-branch-outranks-nursery',
    severity: 'LOW',
    summary: 'Precedence note (regression-relevant, non-blocking). The task brief states park_and_build_later->nursery "takes priority over the new branch", but the actual code (index.js:226-229) orders the NEW anyComponentFailed->blocked branch ABOVE the park_and_build_later->nursery branch: constraints-fail(blocked) > anyComponentFailed(blocked) > park_and_build_later(nursery) > ready. Consequence: a run that has BOTH a failed component AND time_horizon===park_and_build_later, which pre-change resolved to \'nursery\', now resolves to \'blocked\' (park+30d review instead of park+90d review). This is NOT a consumer break — both blocked and nursery park the venture and both are validated enum values, and the direction is strictly more conservative (fail-closed weakest-link dominating park-classification is defensible). But it IS a deviation from the brief\'s stated precedence, and the TESTING FR-5 test deliberately sets time_horizon!=park_and_build_later, so the fail+park interaction is not directly covered by a test. Recommend PLAN confirm the intended precedence (fail-closed dominating nursery is the likely correct intent) and, if so, correct the brief wording; optionally add a fail+park test case. Does not block the handoff.'
  }
];

const warnings = [
  'Brief-vs-code precedence discrepancy (F5): the new fail-closed branch outranks park_and_build_later->nursery in code, whereas the brief says nursery takes priority. Behaviorally safe (both park; blocked is stricter with a 30d vs 90d review) and no consumer breaks, but the fail+park interaction lacks a dedicated test and the brief wording is inaccurate. Recommend PLAN confirm intent + correct wording.'
];

const recommendations = [
  'Allow PLAN_VERIFICATION to proceed: no backward-compatibility break. runSynthesis signature and brief shape are additive-only; the sole production consumer (stage-zero-orchestrator.js) and every maturity consumer already handle \'blocked\' and do not read components_run.',
  'PLAN: reconcile F5 — confirm the fail-closed branch is intended to outrank park_and_build_later->nursery (likely yes); if so, correct the brief\'s "nursery takes priority over the new branch" wording. Consider adding a fail+park_and_build_later test to lock the chosen precedence.'
];

const summary = 'PASS (confidence 88). No backward-compatibility break from the Stage-0 fail-closed change. Consumer inventory: runSynthesis has ONE production consumer (stage-zero-orchestrator.js:86); its signature and brief return-shape are additive-only (new _failed markers + computed counts; nothing removed/renamed). (a) components_run<components_total is safe: git grep confirms NO production code reads components_run/components_total or branches on ===15 — the fields are chairman-explainability metadata (type number unchanged, value range merely widened to 0..15 on real failure). (b) maturity=\'blocked\' where previously silently \'ready\' is safe: \'blocked\' is a pre-existing first-class enum (interfaces validMaturities, chairman-review park+30d, venture-nursery passthrough) already producible via constraints.verdict===fail; every consumer handles it and none assumes always-\'ready\'. One LOW non-blocking finding (F5): code orders the new anyComponentFailed->blocked branch ABOVE park_and_build_later->nursery, contradicting the brief\'s stated precedence — a fail+park run now emits blocked (park+30d) instead of nursery (park+90d). Strictly more conservative, no consumer break, but the brief wording is inaccurate and that specific interaction is untested (TESTING FR-5 sets time_horizon!=park_and_build_later). Complements TESTING (95%) and VALIDATION (94%): 569/569 stage-zero tests pass, zero regressions, non-tautology mutation-proven.';

const justification = [
  'PASS (confidence 88) — SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 is backward-compatible; PLAN_VERIFICATION regression check clean with one documented non-blocking precedence note.',
  '',
  'BASELINE / CONTRACT:',
  'runSynthesis(pathOutput, deps={}) signature unchanged. Return brief is additive-only: pre-existing fields intact; new = _failed:true markers inside catch fallbacks + computed metadata.synthesis.components_run/components_total. Sole production consumer = stage-zero-orchestrator.js:86 (synthesizeFn = synthesize || runSynthesis).',
  '',
  'BACKWARD-COMPAT (a) components_run < components_total:',
  'git grep proves NO production consumer reads components_run/components_total (only the producer + tests). Type unchanged (number); value range widened 0..15, only on real failure. No ===15 branch anywhere in prod. SAFE.',
  '',
  'BACKWARD-COMPAT (b) maturity \'blocked\' vs previously silent \'ready\':',
  '\'blocked\' is a pre-existing enum value (interfaces.js:109 validMaturities includes it; already producible via constraints.verdict===fail). Consumers: chairman-review.js parks blocked (:56) + 30d review (:244) + explicit messaging (:303/307); venture-nursery.js:50 passthrough. NO consumer assumes always-ready. Effect of the new branch is a safer park, i.e. the intended fail-closed outcome — not a contract violation. SAFE.',
  '',
  'REPO-WIDE ASSUMPTION SCAN:',
  'No production code assumes components_run===15 unconditionally or maturity always non-blocked. synthesis-engine.test.js:134 asserts 15 only on the all-success baseline (still 15). Unrelated `maturity` hits (uat, portfolio-optimizer, nav_routes) are different domains.',
  '',
  'FINDING F5 (LOW, non-blocking):',
  'Code (index.js:226-229) orders anyComponentFailed->blocked ABOVE park_and_build_later->nursery, contradicting the brief\'s claim that nursery takes priority. A fail+park run therefore now emits blocked (park+30d) instead of nursery (park+90d). Strictly more conservative and no consumer breaks (both park; both valid enums), but the brief wording is inaccurate and TESTING FR-5 deliberately excludes the fail+park interaction (time_horizon!=park_and_build_later), so it is untested. Recommend PLAN confirm intent + fix wording; does not block.'
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      target_source_file: 'lib/eva/stage-zero/synthesis/index.js',
      public_api: 'runSynthesis(pathOutput, deps={}) — signature unchanged, return shape additive-only',
      production_consumers_of_runSynthesis: ['lib/eva/stage-zero/stage-zero-orchestrator.js:86 (only)', 'lib/eva/stage-zero/index.js:33 (re-export)'],
      production_consumers_of_components_run: 'NONE (git grep: only producer index.js + tests)',
      production_consumers_of_maturity: [
        'lib/eva/stage-zero/chairman-review.js (park on blocked/nursery :56; 30d review :244; messaging :303/307/311; :287 default)',
        'lib/eva/stage-zero/interfaces.js:109 (validMaturities includes blocked)',
        'lib/eva/stage-zero/venture-nursery.js:50 (passthrough default)'
      ],
      backward_compat_components_run: 'SAFE — no prod consumer reads it, type number unchanged, value widened 0..15 only on real failure',
      backward_compat_maturity_blocked: 'SAFE — blocked is a pre-existing first-class enum (validMaturities, chairman-review, venture-nursery), already producible via constraints.verdict===fail; no consumer assumes always-ready',
      regression_finding_F5: 'new anyComponentFailed->blocked branch outranks park_and_build_later->nursery (index.js:226-229), contradicting brief; fail+park now blocked(park+30d) not nursery(park+90d); no consumer break; untested interaction (TESTING FR-5 excludes park). LOW/non-blocking.',
      maturity_precedence_actual: 'constraints.verdict===fail (blocked) > anyComponentFailed (blocked) > park_and_build_later (nursery) > ready',
      corroborating_agents: 'TESTING PASS@95 (569/569 stage-zero tests, mutation-proven non-tautology), VALIDATION PASS@94',
      regression_verdict: 'PASS — no backward-compatibility break; one documented non-blocking precedence note (F5)',
      model: 'Opus 4.8 (1M context)',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        runSynthesis_caller_grep: 'git grep — 1 prod consumer (orchestrator:86) + re-export + tests',
        components_run_consumer_grep: 'git grep — NO prod consumer; only producer + tests',
        maturity_consumer_grep: 'chairman-review + interfaces(validMaturities) + venture-nursery all handle blocked',
        unconditional_assumption_scan: 'no prod code assumes components_run===15 or maturity always non-blocked',
        precedence_trace: 'index.js:226-229 — new branch above nursery; F5 note raised',
      },
    },
    phase: 'PLAN_VERIFICATION',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_ID,
    { name: 'Regression Validation Specialist (regression-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
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
