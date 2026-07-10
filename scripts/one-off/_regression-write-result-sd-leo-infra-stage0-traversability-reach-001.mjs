#!/usr/bin/env node
/**
 * REGRESSION sub-agent PLAN_VERIFICATION verdict for
 * SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001.
 * Canonical repo-evidence pattern (applySubAgentRepoVerdict) + storeSubAgentResults.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '537227ac-8954-4e53-b9c4-67e4d13858f3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001';

const findings = [
  {
    id: 'F1-prod-diffs-additive-only',
    severity: 'INFO',
    summary: 'Read all 4 production path diffs line-by-line (blueprint-browse.js, competitor-teardown.js, venture-reseeding.js, discovery-mode.js). Every change is additive: (1) new import of {loadCapabilityEnvelope,checkTraversability,parkFailedCandidate} from ../traversability-gate.js in 3 files; (2) a gate-invocation block (Step 3.5/4.5) that wraps the single candidate in a 1-element array, awaits loadCapabilityEnvelope, runs checkTraversability, and on gate.failed.length>0 parks + returns null; (3) required_capabilities prompt-field additions (3 discovery strategies + competitor teardown prompt/JSON schema) and a carry-forward for nursery_reeval + seeded_from_venture. NO pre-existing line was deleted or logically altered. The competitor-teardown createPathOutput gained `required_capabilities: deconstruction.required_capabilities` and venture-reseeding gained a conditional `...(requiredCapabilities ? {required_capabilities} : {})` spread — both purely additive output fields.'
  },
  {
    id: 'F2-nursery-reeval-map-logically-equivalent',
    severity: 'INFO',
    summary: 'The one rewritten block (discovery-mode.js nursery_reeval .map) is logically equivalent for all pre-existing fields: it still spreads ...c, sets source:\'nursery_reeval\' and automation_feasibility:(c.automation_feasibility||c.new_score||5). The only added behavior is an optional carry-forward of required_capabilities from the original parked record (byId Map keyed on nurseryItems item.id -> c.nursery_id), spread conditionally so it is OMITTED (never fabricated) when the original had none. Both branches are covered by two new tests (carry-forward present + omitted), which pass.'
  },
  {
    id: 'F3-fallback-strategies-cleanup-is-noop',
    severity: 'INFO',
    summary: 'The unrelated one-line cleanup — removing the unused FALLBACK_STRATEGIES named import from strategy-loader in discovery-mode.js — is confirmed a genuine no-op. `grep -n FALLBACK_STRATEGIES lib/eva/stage-zero/paths/discovery-mode.js` returns exit=1 (zero matches), so the symbol was never referenced anywhere in the file after the import line. No behavior change.'
  },
  {
    id: 'F4-test-diffs-honest-extensions',
    severity: 'INFO',
    summary: 'Read all 5 test-file diffs. blueprint-browse.test.js, competitor-teardown.test.js, venture-reseeding.test.js, stage-zero.test.js: pure ADDITIONS — a v_unified_capabilities mock branch (returns {data:[],error:null}) and/or a deterministic llmClient injection (mockCompetitorTeardownLlm). The competitor-teardown `supabase: {}` -> `supabase: makeGateSupabase()` edits are honest: an empty object could not answer the now-required envelope query. discovery-mode.test.js adds a whole new 67-line describe block (no deletions). The ONLY modified (vs added) assertion is venture-reseeding.test.js `_tables` expectation, changed from toEqual([\'ventures\']) to toEqual([\'ventures\',\'v_unified_capabilities\']) — this is a TIGHTENED, exact-equality assertion reflecting genuinely new behavior (the path now legitimately queries 2 tables), NOT a weakened/deleted assertion hiding a regression. No assertion anywhere was loosened, removed, or converted to a no-op.'
  },
  {
    id: 'F5-null-return-contract-already-handled',
    severity: 'INFO',
    summary: 'The new park-triggered `return null` is NOT a new unhandled contract. The sole production caller of all 3 executors is lib/eva/stage-zero/path-router.js (executeBlueprintBrowse:78, executeCompetitorTeardown:74, executeVentureReseeding:86); routePath already contains `if (!result) { return null; // Path returned null (e.g., no blueprints available) }`. All 3 paths already had pre-existing null-return cases (e.g. blueprint_browse returned null when no blueprints exist) before this SD, so the null contract predates it and every caller already tolerates it. No UI/API caller invokes the executors directly (grep of lib/ src/ shows only path-router.js + a comment in clean-clone/launch.js).'
  },
  {
    id: 'F6-regression-sweep-706-independent-reconfirm',
    severity: 'INFO',
    summary: 'Independently ran `npx vitest run tests/unit/eva/stage-zero/ tests/unit/stage-zero.test.js tests/unit/discovery-mode.test.js` in this worktree: Test Files 46 passed (46), Tests 706 passed (706), 0 failures, duration 9.85s. This independently re-confirms (not merely trusts) the 706/706 figure reported by the 2 prior sub-agents. git diff --stat shows exactly 9 files: 4 prod path files + 5 test files (blueprint-browse, competitor-teardown, discovery-mode, venture-reseeding, stage-zero.test.js), 256 insertions / 29 deletions, with NO stray changes elsewhere in the repo.'
  },
  {
    id: 'F7-minor-output-field-inconsistency',
    severity: 'LOW',
    summary: 'Cosmetic, non-regression note: competitor-teardown.js emits `required_capabilities: deconstruction.required_capabilities` UNCONDITIONALLY in createPathOutput (so the field is present-but-undefined when the LLM omitted it), whereas venture-reseeding.js and nursery_reeval spread it CONDITIONALLY (field absent when undeclared). Both are harmless — validatePathOutput only warns, and downstream gating treats undefined/absent identically as the honest no_requirements_declared auto-pass. Not a backward-compatibility break; flagged only for consistency. No action required to pass PLAN_VERIFICATION.'
  }
];

const warnings = [
  'Minor output-field inconsistency (F7): competitor_teardown emits required_capabilities present-but-undefined vs the conditional-spread pattern used by venture-reseeding/nursery_reeval. Behaviorally equivalent (undefined === absent for the gate), non-blocking, cosmetic only.'
];

const recommendations = [
  'Allow PLAN_VERIFICATION to proceed: no backward-compatibility break. All 4 production changes are strictly additive (gate invocation + required_capabilities prompting/carry-forward); no pre-existing line deleted or logically altered; the FALLBACK_STRATEGIES import removal is a verified no-op.',
  'Test-file changes are honest extensions (new v_unified_capabilities mock branches, deterministic llmClient injection) plus ONE tightened (not weakened) assertion (ventures -> ventures+v_unified_capabilities). No assertion was loosened to hide a regression.',
  'Optional (non-blocking, F7): align competitor-teardown createPathOutput to the conditional-spread pattern for required_capabilities for consistency with the other paths.'
];

const summary = 'PASS (confidence 93). No backward-compatibility break from SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001. (a) Production code is correctly additive: all 4 path files (blueprint-browse, competitor-teardown, venture-reseeding, discovery-mode) only ADD a traversability-gate invocation block (wrap single candidate -> loadCapabilityEnvelope -> checkTraversability -> park+return null on fail), required_capabilities prompt fields (3 discovery strategies + competitor teardown), and carry-forward blocks (nursery_reeval + seeded_from_venture). NO pre-existing line was deleted or logically changed; the sole rewritten block (nursery_reeval .map) is logically equivalent for all existing fields plus an optional, non-fabricating carry-forward. The unrelated FALLBACK_STRATEGIES import removal is a verified no-op (grep exit=1, zero references). (b) Test-file changes are honest: pure ADDITIONS (v_unified_capabilities mock branches serving an honestly-empty {data:[]} envelope, deterministic mockCompetitorTeardownLlm removing a latent network/LLM flakiness dependency, and a new 67-line discovery-mode describe block) plus exactly ONE modified assertion — venture-reseeding _tables tightened from [ventures] to [ventures,v_unified_capabilities], reflecting genuinely new behavior, still exact toEqual, NOT weakened/deleted. Null-return contract: the new park-triggered return null is already handled by path-router.js (`if (!result) return null`) and predates this SD in all 3 paths; no UI/API caller invokes the executors directly. Regression sweep independently re-run in this worktree: 706/706 tests pass across 46 files (0 failures), matching the 2 prior sub-agent reports. git diff --stat = exactly 9 files (4 prod + 5 test), no strays. One LOW cosmetic note (F7, competitor-teardown emits required_capabilities present-but-undefined vs conditional spread) — behaviorally equivalent, non-blocking.';

const justification = [
  'PASS (confidence 93) — SD-LEO-INFRA-STAGE0-TRAVERSABILITY-REACH-001 is backward-compatible; PLAN_VERIFICATION regression check clean with one LOW cosmetic non-blocking note.',
  '',
  'PRODUCTION CODE (additive, no behavior change to out-of-scope logic):',
  '- blueprint-browse.js / competitor-teardown.js / venture-reseeding.js: new import of the traversability gate + a Step 3.5/4.5 gate block (wrap single candidate in 1-elem array, await loadCapabilityEnvelope, checkTraversability, on failure park + return null). Fails closed (EnvelopeUnavailableError propagates unhandled). No pre-existing line deleted/altered.',
  '- discovery-mode.js: required_capabilities prompt field added to 3 strategies (democratization_finder, capability_overhang, simple_venture); nursery_reeval .map rewritten to carry-forward required_capabilities from the original parked record — logically equivalent for source/automation_feasibility, carry-forward is optional and never fabricated. FALLBACK_STRATEGIES import removed = verified no-op (grep exit=1).',
  '',
  'TEST FILES (honest extensions, no weakened assertions):',
  '- blueprint-browse / competitor-teardown / venture-reseeding / stage-zero.test.js: added v_unified_capabilities mock branches (honestly-empty envelope) and deterministic llmClient injection (mockCompetitorTeardownLlm removes latent real-LLM network dependency). discovery-mode.test.js: +67 new lines (new describe block), zero deletions.',
  '- Only ONE modified assertion: venture-reseeding _tables toEqual([ventures]) -> toEqual([ventures,v_unified_capabilities]). This is a TIGHTENED exact-equality assertion reflecting genuinely new behavior (2 tables now legitimately queried), not a loosened/removed assertion. Nothing was converted to a no-op or deleted.',
  '',
  'NULL-RETURN CONTRACT:',
  'path-router.js is the sole production caller of all 3 executors and already has `if (!result) { return null; // Path returned null (e.g., no blueprints available) }`. All 3 paths already returned null pre-SD, so the new park-triggered null adds no new unhandled contract. No UI/API layer calls the executors directly.',
  '',
  'REGRESSION SWEEP (independent re-run in this worktree):',
  'npx vitest run tests/unit/eva/stage-zero/ tests/unit/stage-zero.test.js tests/unit/discovery-mode.test.js -> Test Files 46 passed (46), Tests 706 passed (706), 0 failures. git diff --stat = exactly 9 files (4 prod + 5 test), 256 insertions/29 deletions, no strays.',
  '',
  'FINDING F7 (LOW, non-blocking):',
  'competitor-teardown createPathOutput emits required_capabilities present-but-undefined (unconditional) vs the conditional-spread pattern in venture-reseeding/nursery_reeval. Behaviorally equivalent for the gate (undefined === absent -> honest no_requirements_declared auto-pass); cosmetic only.'
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
    confidence: 93,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [],
    metadata: {
      target_source_files: [
        'lib/eva/stage-zero/paths/blueprint-browse.js',
        'lib/eva/stage-zero/paths/competitor-teardown.js',
        'lib/eva/stage-zero/paths/venture-reseeding.js',
        'lib/eva/stage-zero/paths/discovery-mode.js',
      ],
      diff_stat: '9 files (4 prod path + 5 test), 256 insertions / 29 deletions, no stray changes',
      prod_change_class: 'ADDITIVE — gate invocation blocks + required_capabilities prompting/carry-forward; no pre-existing line deleted or logically altered',
      fallback_strategies_cleanup: 'no-op — grep -n FALLBACK_STRATEGIES discovery-mode.js exit=1 (zero references)',
      test_change_class: 'ADDITIONS (v_unified_capabilities mock branch + deterministic llmClient) + ONE tightened assertion (ventures -> ventures,v_unified_capabilities). No weakened/deleted assertions.',
      null_return_contract: 'already handled — path-router.js `if (!result) return null`; all 3 paths returned null pre-SD; no direct UI/API caller of executors',
      regression_sweep: 'npx vitest run tests/unit/eva/stage-zero/ tests/unit/stage-zero.test.js tests/unit/discovery-mode.test.js -> 46 files, 706/706 pass, 0 failures (independently re-confirmed)',
      prior_subagent_corroboration: '2 prior sub-agents reported 706/706; independently re-run here matches exactly',
      regression_finding_F7: 'LOW/cosmetic — competitor-teardown emits required_capabilities present-but-undefined vs conditional spread; behaviorally equivalent; non-blocking',
      regression_verdict: 'PASS — no backward-compatibility break; one LOW cosmetic non-blocking note (F7)',
      model: 'Opus 4.8 (1M context)',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        prod_diff_line_by_line: '4 path files read fully — additive only, no deleted/altered pre-existing lines',
        fallback_strategies_noop: 'grep exit=1 — zero references, no-op confirmed',
        test_diff_review: '5 test files — additions + 1 tightened assertion; no weakened/deleted assertions',
        null_caller_handling: 'path-router.js already returns null on falsy result; contract predates SD',
        regression_sweep: '46 files, 706/706 pass, independently re-run in worktree',
        diff_stat_scope: 'exactly 9 files (4 prod + 5 test), no strays',
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
