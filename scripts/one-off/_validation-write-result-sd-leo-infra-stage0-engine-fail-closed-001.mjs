#!/usr/bin/env node
/**
 * Write VALIDATION (Principal Systems Analyst) PLAN_VERIFICATION-phase verdict
 * for SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 ahead of its PLAN-TO-LEAD handoff.
 *
 * GATE 4 (PLAN Verification): independent implementation validation against the
 * PRD's 6 FRs + independent duplicate/overlap check of the fix. Corroborates the
 * LEAD OVERLAPPING_SCOPE_DETECTION gate and the TESTING PASS (row
 * d881838f-5b7c-445a-aa87-738eced4f2e4).
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) rather than a hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11. The PLAN-TO-LEAD subagent-evidence-gate matches
 * on sd_id + created_at + sub_agent_code (NOT the `phase` column), so `phase` is
 * informational and set to the SD's current_phase = 'PLAN_VERIFICATION'.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ece35968-e155-4b25-bbda-c438ff783cb3';
const SD_KEY = 'SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001';

const findings = [
  {
    id: 'V1-fr-source-verification',
    severity: 'INFO',
    summary: 'Read lib/eva/stage-zero/synthesis/index.js directly (not from summary). FR-2: components_total = allComponentResults.length (a derived constant that evaluates to 15, index.js:218) — strictly BETTER than a literal, and grep confirms zero remaining hardcoded "components_run: 15"/"components_total: 15" assignments. componentsRun = componentsTotal - failedCount (index.js:220). FR-3: maturity derivation (index.js:226-229) is exactly constraints.verdict===fail -> blocked (unchanged) : anyComponentFailed -> blocked (NEW weakest-link branch) : park_and_build_later -> nursery (unchanged) : ready. failedCount filter (index.js:219) = (c === null || c?._failed === true), so the null-returning mentalModelAnalysis IS counted. This closes the exact bravo-ledger finding-1 bug: a failed chairman_constraints returns {verdict:"review", _failed:true}, which previously did not match "fail" and fell through to ready; it now trips anyComponentFailed -> blocked.'
  },
  {
    id: 'V2-test-source-verification',
    severity: 'INFO',
    summary: 'Read tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js directly. FR-4 canary: forces all 14 Promise.all mocks + applyChairmanConstraints to reject, asserts result resolves (no throw), maturity !== ready, components_run === 0, components_total === 15 — against the REAL runSynthesis import, not a mock of it. FR-5 partial: rejects exactly 5 of 15, asserts components_run === 10, maturity !== ready, AND asserts chairman_constraints.verdict !== fail and time_horizon.position !== park_and_build_later (proving the NEW branch is what blocks, not a pre-existing one). FR-6 baseline: all succeed, asserts components_run === components_total === 15 and maturity === ready. All three FR acceptance criteria are met at the assertion level. Note: the test file lives at .../stage-zero/synthesis/synthesis-fail-closed.test.js (nested /synthesis/ dir) vs the PRD FR-4/5/6 stated path .../stage-zero/synthesis-fail-closed.test.js — a trivial path variance co-located with the code under test; file exists and is runnable.'
  },
  {
    id: 'V3-duplicate-overlap-independent-check',
    severity: 'INFO',
    summary: 'Independent duplicate/overlap scan (own check, not relying on the LEAD OVERLAPPING_SCOPE_DETECTION PASS): (a) exactly ONE runSynthesis definition exists in the codebase — lib/eva/stage-zero/synthesis/index.js:76 — no competing/forked synthesis engine. (b) grep across lib/ + scripts/ for components_run|components_total returns ZERO other producers outside the target file and its tests — the gauge is stamped in exactly one place. (c) the only other stage-zero "maturity =" site is lib/eva/stage-zero/chairman-review.js, which is a downstream CONSUMER of brief.maturity (maps blocked/nursery -> park), not a duplicate producer. Conclusion: the fix touches a single production function in a single file; it introduces no duplicate or overlapping implementation. LEAD gate corroborated.'
  },
  {
    id: 'V4-fr1-ac-wording-deviation',
    severity: 'LOW',
    summary: 'Non-blocking spec-vs-implementation note (independently reached; matches TESTING finding F5). FR-1 AC says grep "_failed: true" should return exactly 15 matches. Actual = 14 (verified: index.js lines 93,97,101,105,109,113,117,121,125,129,133,137,142 + 159), because the 15th component, mentalModelAnalysis, fails-to-null at index.js:152 (its pre-existing advisory contract, documented in the in-code comment at index.js:213-216) rather than returning a zeroed _failed object. This is SEMANTICALLY correct and safer: the failedCount filter counts null-or-_failed, so the null 15th IS treated as a failure (empirically confirmed by the FR-4 canary asserting components_run === 0 when all 15 fail). Recommend PLAN correct the FR-1 AC wording to "14 _failed:true markers + mentalModelAnalysis fail-to-null, all 15 incorporated by the failedCount filter". No code change required.'
  },
  {
    id: 'V5-out-of-scope-observation-chairman-review-default',
    severity: 'INFO',
    summary: 'Out-of-scope observation (NOT a blocker for this SD): lib/eva/stage-zero/chairman-review.js:55 reads const maturity = brief.maturity || "ready". That || "ready" default is a fail-OPEN fallback, but it only fires if brief.maturity is entirely absent — which runSynthesis never produces (it always assigns blocked/nursery/ready). So it is not a live fail-open path given this engine\'s output contract, and it is outside this SD\'s scope (which is the synthesis engine\'s derivation, not the review consumer). Flagged only for the record; if a future SD hardens consumer-side defaults, this is the site.'
  }
];

const warnings = [
  'FR-1 acceptance-criterion literal wording (exactly 15 "_failed: true" matches) does not match the implementation (14 markers + 1 fail-to-null). Semantically correct and intentional (documented in-code at index.js:213-216); recommend AC wording correction at PLAN, not a code change. (Independently reached; corroborates TESTING F5.)',
  'FR-4/5/6 test file path in the PRD (tests/unit/eva/stage-zero/synthesis-fail-closed.test.js) differs from the actual co-located path (tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js). Trivial; file exists and is exercised. Recommend PLAN align the PRD path text for the record.'
];

const recommendations = [
  'Allow PLAN-TO-LEAD handoff to proceed: the implementation satisfies all 6 FRs at source + behavior level, introduces no duplicate/overlapping implementation, and is corroborated by the TESTING PASS (mutation-proven non-tautological canary).',
  'PLAN record correction (no code change): (1) FR-1 AC wording -> "14 _failed:true markers + mentalModelAnalysis fail-to-null, all 15 counted by the null-or-_failed failedCount filter"; (2) FR-4/5/6 test path -> tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js.',
  'No new sub-agents required beyond the PLAN-TO-LEAD blocking set (RETRO). VALIDATION here is supplementary GATE-4 implementation-validation evidence, independently confirming scope integrity.'
];

const summary = 'PASS (confidence 94). GATE 4 (PLAN Verification) implementation validation for the Stage-0 synthesis fail-closed fix. Read lib/eva/stage-zero/synthesis/index.js and the fail-closed test file directly. FR-1: 14 _failed:true markers + mentalModelAnalysis fail-to-null (all 15 counted via the null-or-_failed filter). FR-2: hardcoded components_run:15 removed; components_total is derived (.length === 15), components_run = total - failedCount. FR-3: weakest-link maturity branch (anyComponentFailed -> blocked) inserted with correct precedence, closing the bravo finding-1 chairman_constraints fall-through-to-ready bug. FR-4/5/6: seeded-defect canary (0), partial (10), and baseline (15) tests present and asserting against the real runSynthesis import. Independent duplicate/overlap check: exactly one runSynthesis definition, one components_run/total stamper, chairman-review.js is a consumer not a duplicate -> no overlapping implementation, LEAD OVERLAPPING_SCOPE_DETECTION corroborated. Delivered scope == approved scope (one production file + tests + audit ledger), no scope creep. One LOW non-blocking note (FR-1 AC literal wording, already flagged by TESTING F5) plus a trivial PRD test-path variance; both are PRD-record corrections, no code change.';

const justification = [
  'PASS (confidence 94) - SD-LEO-INFRA-STAGE0-ENGINE-FAIL-CLOSED-001 implementation is validated for PLAN-TO-LEAD.',
  '',
  'GATE 4 (PLAN Verification) checklist:',
  '- Implementation Validation: code matches approved PRD scope. All 6 FRs verified at source (read index.js directly) + behavior (fail-closed test triad). VERIFIED.',
  '- No Scope Creep: git diff --stat main...HEAD = synthesis/index.js (+47), the fail-closed test (+173), a synthesis-engine.test.js baseline touch (+11), the one-off TESTING evidence writer, and the audit ledger delta doc. Delivered == approved (single production function change). VERIFIED.',
  '- Integration Validation: chairman-review.js (the downstream consumer) already maps maturity blocked/nursery -> park, so a fail-closed "blocked" correctly routes away from direct use. No consumer breakage; fallback shapes unchanged per FR-1. VERIFIED.',
  '- Duplicate/Overlap (independent): one runSynthesis definition, one gauge stamper, no forked engine. VERIFIED.',
  '',
  'EVIDENCE:',
  '1. FR-1 source: 14 "_failed: true" markers (index.js:93,97,101,105,109,113,117,121,125,129,133,137,142,159) + mentalModelAnalysis fail-to-null (index.js:152). All 15 counted by the failedCount filter (index.js:219).',
  '2. FR-2 source: grep confirms NO hardcoded components_run:15/components_total:15 assignment remains; componentsTotal = allComponentResults.length (index.js:218), componentsRun = total - failedCount (index.js:220).',
  '3. FR-3 source: maturity branch (index.js:226-229) constraints-fail -> blocked : anyComponentFailed -> blocked (NEW) : park_and_build_later -> nursery : ready. Correct precedence; closes the finding-1 bug.',
  '4. FR-4/5/6 tests: synthesis-fail-closed.test.js asserts components_run 0/10/15 and maturity!=ready (0,10) / ==ready (15) against the real runSynthesis; FR-5 additionally asserts pre-existing branches are NOT the cause. TESTING mutation-proved non-tautology (row d881838f).',
  '5. Duplicate/overlap: single runSynthesis (index.js:76), single components_run/total producer, chairman-review.js is a consumer.',
  '',
  'RATIONALE FOR PASS:',
  'The fix is minimal, single-file, correct at source and behavior, mutation-proven, and free of duplicate/overlapping implementation. The two open items (FR-1 AC literal wording; PRD test-path text) are PRD-record corrections with no code impact and do not block the handoff. Confidence 94 reflects full functional confidence with two non-blocking PRD-text deviations noted for the completed record.'
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
    confidence: 94,
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
        'lib/eva/stage-zero/synthesis/index.js',
        'tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js',
        'lib/eva/stage-zero/chairman-review.js (consumer context)',
      ],
      fr_coverage: {
        'FR-1': 'PASS (source-verified) — 14 _failed:true markers + mentalModelAnalysis fail-to-null; all 15 counted. AC literal-15 wording deviation noted (V4/LOW), no code change.',
        'FR-2': 'PASS — no hardcoded components_run:15; componentsTotal=.length(=15), componentsRun=total-failedCount (index.js:218-220).',
        'FR-3': 'PASS — weakest-link branch anyComponentFailed->blocked with correct precedence (index.js:226-229); closes bravo finding-1.',
        'FR-4': 'PASS — seeded-defect canary asserts components_run 0 / components_total 15 / maturity!=ready vs real runSynthesis; TESTING mutation-proved non-tautological.',
        'FR-5': 'PASS — partial 5/15 -> components_run 10, maturity!=ready, pre-existing branches asserted NOT the cause.',
        'FR-6': 'PASS — baseline -> components_run==components_total==15, maturity==ready.',
      },
      duplicate_overlap_check: {
        runsynthesis_definitions: 1,
        runsynthesis_location: 'lib/eva/stage-zero/synthesis/index.js:76',
        components_run_total_producers_outside_target: 0,
        other_maturity_sites: 'lib/eva/stage-zero/chairman-review.js (consumer, not duplicate)',
        verdict: 'NO_DUPLICATE_OR_OVERLAP',
        lead_gate_corroborated: 'OVERLAPPING_SCOPE_DETECTION',
      },
      scope_creep_check: {
        branch_diffstat: 'index.js +47, synthesis-fail-closed.test.js +173, synthesis-engine.test.js +11, one-off TESTING writer, audit ledger delta doc',
        delivered_equals_approved: true,
      },
      pr: 'https://github.com/rickfelix/EHG/pull/5804 (open)',
      corroborates_testing_row: 'd881838f-5b7c-445a-aa87-738eced4f2e4 (TESTING PASS, 95, EXEC)',
      non_blocking_prd_record_corrections: [
        'FR-1 AC literal "15 matches" -> "14 markers + 1 fail-to-null, all 15 counted"',
        'FR-4/5/6 test path -> tests/unit/eva/stage-zero/synthesis/synthesis-fail-closed.test.js',
      ],
      e2e_applicable: false,
      e2e_exemption_reason: 'server-side engine invariant (fail-closed maturity derivation); no UI/route surface. Fully exercised at unit level against real runSynthesis.',
      model: 'Opus 4.8',
      model_id: 'claude-opus-4-8[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      checks_performed: {
        fr1_source_grep: '14 _failed:true markers + 1 fail-to-null; failedCount filter counts null',
        fr2_source_grep: 'no hardcoded components_run:15 literal; derived length + computed run',
        fr3_maturity_trace: 'weakest-link branch present, correct precedence, closes finding-1',
        fr4_5_6_test_read: 'triad asserts 0/10/15 against real runSynthesis; partial proves NEW branch fires',
        duplicate_overlap_scan: 'single runSynthesis, single gauge stamper, consumer-only chairman-review',
        scope_creep_diffstat: 'single production file + tests + audit doc; no creep',
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
