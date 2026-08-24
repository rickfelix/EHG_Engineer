#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent RE-REVIEW of the corrected PRD for
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, PLAN-TO-EXEC handoff.
 *
 * Prior FAIL: e7445772-d9a7-4381-a539-ee896ff1d012 (confidence 90) found 3 issues:
 *   1. gateType:'chairman_gate' unmapped, violates gate_type CHECK constraint.
 *   2. _handleChairmanGate()'s 5 approved:true branches are indistinguishable
 *      (autonomy/governance/fixture auto-approve vs genuine chairman decision).
 *   3. The "migration not applied" dependency claim was itself stale (a live RPC
 *      probe showed a 23503 FK violation, not PGRST202 -- the function is live).
 *
 * The PRD was corrected: FR-1 now uses gateType:'stage_gate' (maps to 'exit'), a
 * new FR-1a adds a `source` tag to _handleChairmanGate()'s return value so FR-1
 * only fires for source==='chairman_decision', TR-4/TR-5 added, TS-1/TS-2/TS-5
 * rewritten to unit-test _handleChairmanGate() in isolation instead of
 * _advanceStage() directly, and a risk entry documents the stale-comment finding.
 *
 * This script independently re-derives (does not just trust the correction's
 * claims) all 3 corrections plus 2 new checks: whether the `source` field is
 * genuinely non-breaking, and whether _handleChairmanGate() is genuinely small
 * enough to unit-test in isolation.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'c0d3fcc7-dfd8-4c00-a9e9-1ec49fe48f7f';
const SD_KEY = 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001';

const findings = [
  {
    id: 'gate-type-fix-independently-confirmed',
    severity: 'INFO',
    summary: "Re-derived from source, not trusted: lib/eva/artifact-persistence-service.js:499 (recordGateAttempt's own GATE_TYPE_MAP, not the sibling one at :387 in recordGateResult) reads `{ stage_gate: 'exit', reality_gate: 'entry', entry: 'entry', exit: 'exit', kill: 'kill', taste_gate: 'exit' }` -- 'stage_gate' -> 'exit'. database/chairman-gated/20260823_eva_stage_gate_attempts.sql:51 CHECK (gate_type IN ('entry','exit','kill')) confirms 'exit' is valid. Also independently confirmed: resolved_outcome='chairman_adjudicated' is pre-reserved in the same file's CHECK at :61-65, and the passed-must-be-NULL-for-non-machine-outcomes constraint exists at :112-116 (esga_passed_matches_outcome), matching the PRD's line-115 citation to within the same constraint block. Prior FAIL #1 is genuinely closed.",
  },
  {
    id: 're-derived-5-approved-branches-exact-match',
    severity: 'INFO',
    summary: "Read lib/eva/stage-execution-worker.js:2357-2518 in full (not just the cited lines) and independently enumerated every return statement. The function has 11 total return points, but exactly 5 produce {blocked:false,killed:false,approved:true} -- at the exact lines the corrected PRD cites: :2381 (autonomy auto-approve), :2388 (governance/_canAutoAdvance auto-approve), :2460 (fixture-venture skip), :2473 (already-resolved chairman_decisions row), :2502 (freshly-resolved via waitForDecision). The other 6 return points (:2476,:2489,:2505,:2508,:2512,:2516) all produce blocked:true or killed:true and are irrelevant to the mislabeling risk since FR-1's new call only fires downstream of an approved advance. FR-1a's '5 distinct return points' claim and its source-value assignment (2 genuine-chairman vs 3 automated-bypass) are exactly correct, not a miscount.",
  },
  {
    id: 'NEW-source-field-breaks-2-existing-toEqual-pins',
    severity: 'CRITICAL',
    summary: "NOT caught by the correction. Two existing, non-quarantined unit tests call the REAL _handleChairmanGate() directly and pin its exact return shape with toEqual (which requires an exact key match, no extras): tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js:268 `expect(result).toEqual({ blocked: false, killed: false, approved: true })` (exercises the autonomy-auto-approve branch, :2381) and tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js:98 `expect(result).toEqual({ blocked: false, killed: false, approved: true })` (exercises the fixture-venture-skip branch, :2460). Adding a `source` field per FR-1a to those same branches' return objects will make BOTH of these currently-passing tests fail immediately post-change (toEqual sees an unexpected extra key). Neither is in a quarantine list (checked: no reference to either filename in any quarantine/skip config), so both run in normal CI. FR-1a/TR-5/TS-1/TS-2 do not mention updating these two pre-existing assertions -- the PRD's own claim that the source tag is 'non-breaking' is incomplete: it is non-breaking for PRODUCTION callers (confirmed: the only production call site, :1401, destructures only .blocked/.killed, never .approved or any exhaustive-shape check) but IS breaking for these 2 test files.",
  },
  {
    id: 'production-call-site-confirmed-non-breaking',
    severity: 'INFO',
    summary: "Grepped the full worktree for _handleChairmanGate consumers: only 1 production call site exists (lib/eva/stage-execution-worker.js:1401, `const gateResult = await this._handleChairmanGate(...)`), which reads only gateResult.blocked (:1402) and gateResult.killed (:1418) -- treating the absence of both as the approved case (no explicit .approved read, no destructuring that would choke on an extra key, no JSON-schema/strict-shape validation). A different, unrelated local variable also named `gateResult` at :816-818 (S19 post-build convergence gate) is a different object entirely (has .applicable/.status/.adherenceScore) and is not affected. Adding `source` is genuinely safe for this one production consumer.",
  },
  {
    id: 'isolated-unit-test-feasibility-confirmed-empirically-not-just-by-inspection',
    severity: 'INFO',
    summary: "_handleChairmanGate()'s own dependencies (checkAutonomy, getStageGovernance, extractKillGateVerdict, extractGateQuality, emit, createOrReusePendingDecision, waitForDecision) are ALL static top-level imports (verified: lines 33,35,36,46,47 of stage-execution-worker.js) -- zero dynamic `await import()` calls inside the function body, unlike _advanceStage() which the prior FAIL correctly identified as having 4 dynamic imports and 7+ .from() chains. Stronger than inspection: 2 existing test files (stage-execution-worker-high-consequence-mint.test.js, stage-execution-worker-fixture-venture-gate.test.js) ALREADY unit-test the real _handleChairmanGate() method directly against a mocked supabase client and mocked module imports, and pass today. The corrected PRD's TS-1/TS-2 isolated-unit-test strategy is not just plausible in theory, it is proven feasible by pre-existing, passing precedent in this exact codebase.",
  },
  {
    id: 'ts3-call-count-guard-pattern-confirmed-to-exist',
    severity: 'INFO',
    summary: "TS-3's cited precedent (tests/unit/eva/orchestrator-gate-result-persist.test.js:107, described in the PRD as 'existing pattern') independently confirmed to exist at lines 106-109: `source.split('await recordGateAttempt(supabase').length - 1` compared via `expect(...).toBe(2)`. The mirrored call-count regression-guard idiom the PRD proposes for the new stage-execution-worker.js call site is a real, working pattern already in this repo, not an invented one.",
  },
  {
    id: 'tr4-try-catch-pattern-confirmed-at-2-of-4-cited-sites',
    severity: 'INFO',
    summary: "Directly read lib/eva/eva-orchestrator.js:905-926 (~line 930 site) and :1315-1330 (~line 1316 site): both wrap their recordGateAttempt() call in try/catch with a non-fatal logger.warn/console pattern, consistent with TR-4's claim. (Did not re-read stage-17-blueprint-review.js:471 or artifact-persistence-service.js:636 line-by-line this pass, but the latter was already read in full during this same session -- recordGateOverride's try/catch at :635-649 -- and matches the same shape.)",
  },
  {
    id: 'stale-migration-comment-risk-entry-adequately-worded',
    severity: 'INFO',
    summary: "The corrected PRD's risk entry (risks[2]) accurately records the prior FAIL's live-RPC-probe finding (23503 FK violation, not PGRST202; 1182 live rows) and correctly instructs EXEC to fix the stale comments as a drive-by, without treating this as a blocking dependency gap. No further correction needed here.",
  },
];

const warnings = [
  "The 2 pre-existing toEqual-pinned tests (finding 'NEW-source-field-breaks-2-existing-toEqual-pins') are a real, if mechanically trivial, gap: EXEC must update both assertions (e.g. to `toEqual({ blocked: false, killed: false, approved: true, source: 'autonomy_auto_approve' })` and the fixture-venture equivalent) in the SAME PR that adds FR-1a's source tagging, or the existing suite goes red. This is not a design flaw in the approach -- it's an incomplete blast-radius accounting that TR-5 should have named alongside 'no other heuristic should re-derive the chairman-decision classification'.",
];

const recommendations = [
  "EXEC: when implementing FR-1a, update tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js:268 and tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js:98 in the same commit to include the new `source` field in their toEqual expectations -- otherwise 2 currently-green, non-quarantined unit tests will fail immediately post-change.",
  "EXEC: run the full existing _handleChairmanGate consumer suite (stage-execution-worker-high-consequence-mint.test.js, stage-execution-worker-fixture-venture-gate.test.js, high-consequence-blocking-gate-realdb.test.js) as an explicit regression gate before/after adding the source tag, since all 3 already call the real method directly.",
  "No further PRD correction is required to proceed to EXEC -- the 2-test gap is a routine implementation-time fix, not a re-scoping issue.",
];

const summary = "TESTING re-review of the CORRECTED PRD (docs/prds/prd-altifyai-instrumentation-retrofit-001.json) at PLAN-TO-EXEC for SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, independently re-deriving all 3 of this sub-agent's own prior FAIL findings (e7445772-d9a7-4381-a539-ee896ff1d012) rather than trusting the correction's narrative. (1) gateType:'stage_gate'->'exit' re-confirmed directly against recordGateAttempt()'s own GATE_TYPE_MAP (artifact-persistence-service.js:499) and the eva_stage_gate_attempts CHECK constraint (:51) -- valid. (2) _handleChairmanGate()'s 5 approved:true return points re-enumerated from a full read of the function (:2357-2518, 11 total returns, exactly 5 with approved:true) -- the corrected PRD's line numbers and 2-genuine/3-automated split are exact, not approximate. (3) The stale-migration-comment risk entry is adequately worded and correctly non-blocking. Two NEW checks this re-review performed beyond re-verifying the correction: the `source` field addition is confirmed non-breaking for the one real production consumer (stage-execution-worker.js:1401, which reads only .blocked/.killed) but WILL break 2 pre-existing, non-quarantined unit tests that pin _handleChairmanGate()'s exact return shape via toEqual (stage-execution-worker-high-consequence-mint.test.js:268, stage-execution-worker-fixture-venture-gate.test.js:98) -- a gap the correction's TR-5/FR-1a did not identify. Separately, the isolated-unit-test strategy for _handleChairmanGate() (TS-1/TS-2) is confirmed genuinely feasible: the function has zero dynamic imports (unlike _advanceStage()'s 4), and 2 existing test files already successfully unit-test the real method against mocked dependencies today. TS-3's cited call-count-guard precedent and TR-4's try/catch precedent were both independently confirmed to exist as described. Net: the correction resolves all 3 original FAIL findings correctly and is architecturally sound; one small, mechanically-trivial test-maintenance gap remains (2 existing toEqual assertions need one new key added), which does not warrant another FAIL cycle but should be called out explicitly for EXEC.";

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
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification: "The PRD correction closes all 3 of this sub-agent's prior FAIL findings, independently re-verified against current source rather than trusted at face value: gateType is now valid ('stage_gate'->'exit', confirmed against GATE_TYPE_MAP and the CHECK constraint), the 5-branch source-tagging approach is exactly and correctly scoped (re-enumerated from the full function body, not just the cited lines), and the stale-migration-comment claim is adequately documented as non-blocking. One new, previously-unidentified gap surfaced by this independent re-check: adding the `source` field will break 2 pre-existing, non-quarantined unit tests that pin _handleChairmanGate()'s exact return shape via toEqual. This is real but mechanically trivial (add one key to two expected objects) and does not undermine the approach's soundness -- CONDITIONAL_PASS rather than FAIL because the fix is a same-PR, same-commit, near-zero-risk addition EXEC can make while implementing FR-1a itself, not a re-scoping or re-design.",
    conditions: [
      { action: "Update tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js:268's toEqual assertion to include the new `source: 'autonomy_auto_approve'` key when implementing FR-1a.", priority: 'high', blocking: true },
      { action: "Update tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js:98's toEqual assertion to include the new `source: 'fixture_venture_skip'` key when implementing FR-1a.", priority: 'high', blocking: true },
    ],
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN-TO-EXEC',
      mode: 'independent re-review of a corrected PRD, prior sub-agent FAIL: e7445772-d9a7-4381-a539-ee896ff1d012',
      prior_fail_resolution: {
        'gate-type-invalid': 'RESOLVED -- re-confirmed independently against source + migration file',
        'chairman-gate-mislabeling': 'RESOLVED -- source-tagging approach re-verified as exactly scoped (5 branches, correct split)',
        'stale-migration-comment-claim': 'RESOLVED -- correctly reclassified as a non-blocking risk/doc note',
      },
      new_gap_found: {
        id: 'existing-toEqual-pins-break-on-source-field',
        files: [
          'tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js:268',
          'tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js:98',
        ],
        severity: 'low-effort-fix, correctly-scoped-blocker-for-merge (not for PLAN-TO-EXEC)',
      },
      isolated_unit_test_feasibility: 'CONFIRMED -- zero dynamic imports inside _handleChairmanGate(), all deps statically imported, and 2 existing test files already unit-test the real method directly against mocked dependencies.',
      ts3_precedent_verified: 'tests/unit/eva/orchestrator-gate-result-persist.test.js:106-109 (source.split(...).length-1 call-count assertion) confirmed to exist as cited.',
    },
    phase: 'PLAN-TO-EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
