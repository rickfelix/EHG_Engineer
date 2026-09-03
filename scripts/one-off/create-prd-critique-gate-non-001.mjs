#!/usr/bin/env node
import 'dotenv/config';
import { addPRDToDatabase } from '../prd/index.js';

const content = {
  executive_summary:
    'Fix PRE_PLAN_ADVERSARIAL_CRITIQUE (0 PASS in 375 runs, 96% block) via a sufficiency threshold and decision-authority anchoring, validated by discrimination (known-good passes, known-bad still blocks), not pass rate.',
  functional_requirements: [
    {
      id: 'FR-1',
      requirement: "deriveCombinedSeverity() implements a sufficiency threshold: a solo block-severity finding downgrades to 'warn' unless its category is decision-authority-worthy or there are >=2 distinct block findings.",
      description: "Extracted as a pure, exported function in pre-plan-critique.js. Uses a deny-by-default LOW_AUTHORITY_CATEGORIES set ({'missing_criteria','scope_incoherence','reuse_opportunity'}) rather than an allowlist -- anything NOT explicitly low-authority (contradiction, missing_rollback, a deterministic invariant-library finding, an off-vocabulary/missing/malformed category, or the LLM's 'other' catch-all) stays block-eligible by default. Preserves the existing PR #6927 anti-laundering fix (a block verdict with EMPTY findings never downgrades) untouched -- the downgrade applies only when findings.length > 0.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        "deriveCombinedSeverity({llmOverall:'block', findings:[{severity:'block',category:'missing_criteria'}]}) returns 'warn'.",
        "deriveCombinedSeverity({llmOverall:'block', findings:[{severity:'block',category:'contradiction'}]}) returns 'block'.",
        "deriveCombinedSeverity({llmOverall:'block', findings:[]}) returns 'block' (PR #6927 anti-laundering preserved).",
        "A block finding with category 'invariant', 'other', null, undefined, or any off-vocabulary value stays 'block' when solo (fail-closed, not fail-open)."
      ]
    },
    {
      id: 'FR-2',
      requirement: "The LLM's own severity rubric (buildCritiqueSystemPrompt) is rewritten to anchor 'block' to decision-authority cost, not to whether any gap exists.",
      description: "Block is now defined as: would a competent PLAN/EXEC agent need to escalate this to LEAD or the chairman, or could they just fix it and keep going? A missing/thin acceptance criterion PLAN/EXEC could simply add is 'warn', not 'block'. Block-severity findings must be categorized 'contradiction' or 'missing_rollback'; the prompt explicitly forbids 'other' for a block-severity finding, closing the ambiguity gap at the source (defense in depth alongside FR-1's aggregator-side fix).",
      priority: 'CRITICAL',
      acceptance_criteria: [
        "The system prompt text matches /DECISION-AUTHORITY COST/i and /PLAN\\/EXEC cannot resolve unilaterally/i.",
        'The prompt explicitly states a block-severity finding’s category MUST be contradiction or missing_rollback, and forbids ‘other’ for block.',
        'A source-pin contract test (lib/eva/devils-advocate.critique.test.js) asserts this text is present and the old, unanchored rubric text is genuinely gone.'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'The replay/retry-guard path (QF-20260902-181) re-derives severity under the current aggregation rules instead of hardcoding overall_severity=\'block\'.',
      description: "A prospective TESTING pass caught this before it shipped: the retry guard used to persist and return a HARDCODED 'block' regardless of what the SAME findings would earn under the new rules -- meaning this SD's own fix could never reach any of the 358+ SDs already sitting blocked on unchanged content. Now re-derives via deriveCombinedSeverity using the LLM's original raw seed (metadata.llm_result.overall_severity) and the historical findings, persisting the corrected verdict with NO new LLM call (content is unchanged; only the aggregation logic changed).",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'A historical block row whose findings no longer earn block under the current rules is re-derived and persisted as the corrected (lower) severity, with critiquePlanProposal (the LLM call) never invoked.',
        'A historical block row whose findings still earn block under the current rules continues to refuse re-execute exactly as before.',
        'The invariant-library half of the check is re-run FRESH on every replay (moved ahead of the retry-guard in the function), never reusing a stale snapshot from the original run -- so a newly-added invariant fires even on unchanged content.'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Near-identical (byte-identical severity+category+message) findings are deduped before counting toward the sufficiency threshold.',
      description: "Without dedup, an LLM restating one gap across its own 'maximum 5 findings' allowance could manufacture the >=2-finding sufficiency bar via repetition rather than genuinely independent evidence.",
      priority: 'HIGH',
      acceptance_criteria: [
        'Two byte-identical block findings do NOT satisfy the sufficiency count (still downgrades to warn).',
        'Two genuinely distinct (different message) block findings DO satisfy the sufficiency count (stays block).'
      ]
    },
    {
      id: 'FR-5',
      requirement: "Validation follows the SD's own HARD CONSTRAINT (Solomon, accepted by Adam, carried by the coordinator's review-clear): the success criterion is DISCRIMINATION -- a known-good plan passes, a known-bad plan still blocks -- never the pass rate improving.",
      description: "Validated at two scales: (1) 3 live LLM critique runs -- a real, independently-verified-clean SD's PRD stays warn; a PRD modeled on a real cited incident (lib/eva/invariant-library.js INV-002: the semantic-indexer 289-day silent failure) with a genuine contradiction correctly reaches block; a 4-genuine-gap plan with no contradiction stays warn, confirming the count-threshold is a rare backstop, not the primary mechanism. (2) Production-scale: the VALIDATION sub-agent replayed ALL 359 historical block rows through the new logic -- 219 (61%) still block, 140 (39%) downgrade. Neither number is claimed as a target; both are reported as the measured, principled outcome of applying the same rule uniformly.",
      priority: 'CRITICAL',
      acceptance_criteria: [
        'The PRD, retrospective, and any completion summary explicitly cite DISCRIMINATION (not pass-rate-improved) as the success criterion, quoting the SD’s own metadata.success_criterion verbatim.',
        'At least one live LLM-run pin exists for each direction (known-good stays non-block, known-bad still blocks), plus one exercising the count-based sufficiency branch specifically.',
        'The full-corpus replay result (219 block / 140 downgrade) is recorded as evidence, not hidden or reframed as a pass-rate claim.'
      ]
    }
  ],
  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'findLastBlockingCritique now selects metadata (previously omitted) so the replay path can access metadata.llm_result.overall_severity and metadata.llm_result.findings (the raw pre-merge LLM output) for correct re-derivation.',
      rationale: 'Without the raw LLM-only findings, re-merging fresh invariant findings on replay would double-count any invariant findings already baked into the historical merged findings column.'
    },
    {
      id: 'TR-2',
      requirement: 'runInvariantChecks() is called BEFORE the replay-guard block, not after.',
      rationale: 'Invariant checks are free (no LLM, no network) -- there is no reason the replay-pass path should ever be allowed to skip re-running them, since a previous implementation could only refuse (return early), making the omission harmless; once replay can also pass, omitting the fresh invariant run becomes a real staleness bug.'
    },
    {
      id: 'TR-3',
      requirement: 'SUFFICIENCY_THRESHOLD is set to 2, acknowledged as a secondary, less-validated constant relative to the decision-authority category anchoring.',
      rationale: 'Live replay of all 359 historical block rows shows 112 of 219 retained blocks are retained SOLELY via the count branch (not the category branch) -- this constant is load-bearing on real data, not merely theoretical, and should be revisited with dedicated calibration in a follow-up if the post-ship monitoring (FR-5-adjacent) shows it under- or over-blocking.'
    }
  ],
  system_architecture: {
    overview: 'A pure aggregation function (deriveCombinedSeverity) sits between the LLM adversarial critic and the invariant library on one side, and the gate’s pass/fail verdict on the other. The LLM’s own prompt is independently anchored to the same decision-authority principle, so the fix applies at both the source (prompt) and the aggregator (defense in depth).',
    components: [
      { name: 'deriveCombinedSeverity()', responsibility: 'Pure aggregation core: seed from LLM overall_severity, raise via findings, apply sufficiency-threshold downgrade.', technology: 'Node.js (ESM), no I/O' },
      { name: 'buildCritiqueSystemPrompt()', responsibility: 'LLM system prompt anchoring severity to decision-authority cost.', technology: 'Node.js (ESM), prompt text' },
      { name: 'validatePrePlanCritique() replay/retry-guard', responsibility: 'Re-derive stale block verdicts on unchanged content without a new LLM call; re-run invariants fresh.', technology: 'Node.js (ESM), Supabase' }
    ],
    data_flow: 'PRD/arch content -> content_hash computed -> if unchanged since last block, re-derive from historical LLM findings + FRESH invariant findings (no LLM call) -> else call the LLM live -> merge with invariant findings -> deriveCombinedSeverity() -> persist -> pass/fail verdict.',
    integration_points: ['plan_critiques table (findings, overall_severity, metadata.llm_result, content_hash)', 'lib/eva/invariant-library.js (deterministic findings, unaffected by this SD)', 'scripts/critique-override.js (unaffected -- reads final overall_severity/content_hash only)']
  },
  test_scenarios: [
    { id: 'TS-1', scenario: 'A solo missing_criteria block finding downgrades to warn.', test_type: 'unit', given: 'llmOverall=block, one finding {severity:block, category:missing_criteria}', when: 'deriveCombinedSeverity is called', then: "Returns 'warn'" },
    { id: 'TS-2', scenario: 'A solo contradiction block finding still blocks.', test_type: 'unit', given: 'llmOverall=block, one finding {severity:block, category:contradiction}', when: 'deriveCombinedSeverity is called', then: "Returns 'block'" },
    { id: 'TS-3', scenario: 'An empty-findings block verdict never downgrades (PR #6927 regression guard).', test_type: 'unit', given: 'llmOverall=block, findings=[]', when: 'deriveCombinedSeverity is called', then: "Returns 'block'" },
    { id: 'TS-4', scenario: 'A malformed/unrecognized category on a solo block finding stays block (fail-closed).', test_type: 'unit', given: "category in {null, undefined, 'other', 'invariant', 42, {}}", when: 'deriveCombinedSeverity is called', then: "Returns 'block' in every case" },
    { id: 'TS-5', scenario: 'Duplicate findings do not satisfy the sufficiency count; distinct ones do.', test_type: 'unit', given: 'two byte-identical vs. two distinct low-authority block findings', when: 'deriveCombinedSeverity is called', then: "Identical -> 'warn'; distinct -> 'block'" },
    { id: 'TS-6', scenario: 'Live LLM run against a real, independently-verified-clean SD PRD stays non-block.', test_type: 'integration (recorded pin)', given: 'The real product_requirements_v2 row for SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001', when: 'critiquePlanProposal runs live against the rewritten prompt', then: "overall_severity='warn', never block" },
    { id: 'TS-7', scenario: 'Live LLM run against a PRD modeled on a real cited incident (INV-002) still blocks.', test_type: 'integration (recorded pin)', given: 'A PRD with acceptance criteria contradicting its own risk section', when: 'critiquePlanProposal runs live', then: "overall_severity='block', category='contradiction'" },
    { id: 'TS-8', scenario: 'The replay path re-derives a stale block instead of hardcoding it, with no new LLM call.', test_type: 'unit', given: 'A historical block row whose findings no longer earn block under current rules, unchanged content_hash', when: 'validatePrePlanCritique runs', then: 'critiquePlanProposal is never called; the gate returns pass:true at the re-derived score' },
    { id: 'TS-9', scenario: 'The replay-pass path re-runs invariant checks fresh, not a stale snapshot.', test_type: 'unit', given: 'A historical block row missing an invariant finding that the CURRENT invariant library would now add for the same (unchanged) content', when: 'validatePrePlanCritique runs on the replay path', then: 'The freshly-computed invariant finding is present in the persisted findings' }
  ],
  acceptance_criteria: [
    '48 tests in pre-plan-critique.test.js pass (mutation-tested: 5 specific reverts independently confirmed to break the suite).',
    '10 tests in lib/eva/devils-advocate.critique.test.js pass, including a new prompt-contract source-pin test.',
    'Both stale reference docs (docs/reference/completeness-critic-system.md, docs/reference/pre-plan-adversarial-critique-gate.md) are updated to describe the new aggregation logic.',
    'VALIDATION sub-agent’s full-corpus replay (219 block / 140 downgrade of 359 historical rows) is recorded as the production-scale discrimination evidence.'
  ],
  risks: [
    {
      risk: 'SUFFICIENCY_THRESHOLD=2 is load-bearing on real data (112 of 219 retained blocks depend on it) but was not independently calibrated against a live corpus the way the decision-authority category anchoring was.',
      probability: 'MEDIUM',
      impact: 'MEDIUM',
      mitigation: 'Documented explicitly in code comments and this PRD as a secondary, less-validated constant. Flagged as a completion-flag finding for a follow-up calibration pass once post-ship monitoring (override rate, catch-rate monitor) provides real signal.',
      rollback_plan: 'SUFFICIENCY_THRESHOLD is a single named constant; reverting to 1 (no count-based sufficiency, only decision-authority category matters) or raising it is a one-line change with no other code path affected.'
    },
    {
      risk: 'The 3 live-LLM-run discrimination pins are recorded snapshots, not live CI calls -- a future regression to the prompt’s decision-authority rubric would leave the pinned aggregation tests green.',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'Closed via a dedicated source-pin contract test (lib/eva/devils-advocate.critique.test.js) asserting the prompt text itself contains the decision-authority anchoring and the block-category restriction, independent of any live LLM call.',
      rollback_plan: 'N/A -- this is a test-coverage mitigation already shipped in this SD, not a runtime behavior with a rollback path.'
    },
    {
      risk: 'The known-bad corpus item (TS-7) is a textually explicit, adjacent contradiction -- a real INV-002-class incident was bad by omission and false confidence with no single document admitting the failure, which is a HARDER case than the corpus currently tests.',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Acknowledged explicitly in code comments as a known limitation, not silently claimed as resolved. Flagged as a completion-flag finding for future corpus expansion (a subtler hard-negative: false-confidence acceptance criteria with no self-contradicting text).',
      rollback_plan: 'N/A -- this is a corpus-completeness gap, not a shipped defect; addressing it is additive (more corpus items), never a revert.'
    }
  ],
  implementation_approach: {
    phases: [
      { phase: 'Phase 1 (shipped, this SD)', description: 'Sufficiency threshold + decision-authority anchoring in both the aggregator and the LLM prompt; replay-path re-derivation fix; invariant-freshness fix; dedup; discrimination validation at both hand-picked and full-corpus scale.', deliverables: ['pre-plan-critique.js deriveCombinedSeverity() + replay-path fixes', 'lib/eva/devils-advocate.js rewritten severity rubric', '48+10 tests', '2 updated reference docs'] }
    ],
    technical_decisions: [
      'Deny-by-default (LOW_AUTHORITY_CATEGORIES allowlist for DOWNGRADING) rather than allow-by-default (HIGH_AUTHORITY_CATEGORIES allowlist for BLOCKING) -- fail-closed on any malformed/off-vocabulary/unexpected category, including a future deterministic invariant that might emit block severity.',
      'Re-derive on replay rather than force a fresh LLM call -- the content is unchanged (that is the entire premise of the retry-guard), so only the aggregation logic changed; re-calling the LLM would be wasteful and reintroduce the exact rate-limiting problem QF-20260902-181 fixed.',
      'Validate via discrimination (known-good passes, known-bad blocks) at both a small hand-picked scale AND full historical-corpus replay, per the SD’s own hard constraint against justifying a fix by pass-rate improvement alone.'
    ]
  },
  integration_operationalization: {
    consumers: [
      { name: 'Every SD/QF passing through LEAD-TO-PLAN', interaction: 'The gate runs automatically on every LEAD-TO-PLAN handoff with an existing PRD.', frequency: 'Every LEAD-TO-PLAN handoff attempt.' },
      { name: 'scripts/critique-catch-rate-monitor.js', interaction: 'Counts plan_critiques rows by overall_severity to report catch/blind rates.', frequency: 'Periodic monitoring run (out of this SD’s scope to schedule, but its output distribution is expected to shift post-fix).' }
    ],
    dependencies: [
      { name: 'lib/eva/invariant-library.js', type: 'upstream', contract: 'runInvariantChecks() returns {findings, checked_classes}; findings capped at warn severity by the library’s own design.', failure_handling: 'Deterministic, no network -- cannot fail at runtime beyond a thrown JS error, which the surrounding try/catch in validatePrePlanCritique degrades to COULD_NOT_CHECK.' },
      { name: 'OpenAI/LLM adapter (critiquePlanProposal)', type: 'downstream', contract: 'Returns {findings, overall_severity, model_used, token_usage} or COULD_NOT_CHECK on any failure/timeout.', failure_handling: 'Unchanged by this SD -- COULD_NOT_CHECK still degrades the gate to score 50, never a silent pass.' }
    ],
    data_contracts: [
      { contract_name: 'plan_critiques.findings[].category', schema: 'text, one of contradiction|missing_criteria|scope_incoherence|missing_rollback|reuse_opportunity|other|invariant (free-text, not DB-enforced)', validation: 'The gate’s own deriveCombinedSeverity() now validates this at read time via the LOW_AUTHORITY_CATEGORIES check, trimmed and lowercased.', versioning: 'Adding a new low-authority category requires only extending the LOW_AUTHORITY_CATEGORIES set (with a documented rationale, matching this SD’s own discipline).' },
      { contract_name: 'plan_critiques.metadata.llm_result', schema: '{findings, overall_severity} -- the RAW pre-merge LLM output', validation: 'Now also consumed (not just written) by the replay path to reconstruct pre-merge findings for correct fresh-invariant re-merging.', versioning: 'No schema change; this SD is a new reader, not a new writer, of this existing shape.' }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'No deployment step beyond merged code -- the gate logic activates immediately on merge to main for every subsequent LEAD-TO-PLAN handoff. No migration required (no schema changes).'
    },
    observability_rollout: {
      monitoring: ['plan_critiques.overall_severity distribution (expected to shift from ~96% block toward a mix of block/warn/note/pass)', 'scripts/critique-catch-rate-monitor.js output', 'plan_critiques.override_reason/override_by usage rate (expected to decrease as fewer false-positive blocks require manual override)'],
      alerts: ['If the block rate drops to near-0% post-fix (over-correction, the gate never catching anything), that would be the inverse of the original defect and warrants immediate review.'],
      rollout_strategy: 'Direct merge to main; no phased rollout or feature flag -- the fix is a pure logic change to an existing gate already running on every handoff.',
      rollback_trigger: 'The block rate drops to near-0% (over-correction) OR a genuinely bad plan (contradiction/missing_rollback) is observed passing through undetected.',
      rollback_procedure: 'Revert the two changed source files (lib/eva/devils-advocate.js, pre-plan-critique.js) via git revert; the gate returns to its pre-fix (over-blocking) behavior, which is the known-safe prior state.'
    }
  },
  exploration_summary: {
    files_read: [
      'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.js',
      'lib/eva/devils-advocate.js',
      'lib/eva/invariant-library.js',
      'scripts/modules/handoff/executors/lead-to-plan/gates/pre-plan-critique.test.js',
      'lib/eva/devils-advocate.critique.test.js',
      'scripts/critique-override.js',
      'scripts/critique-catch-rate-monitor.js',
      'docs/reference/completeness-critic-system.md',
      'docs/reference/pre-plan-adversarial-critique-gate.md',
      'docs/guides/workflow/cli-venture-lifecycle/07-devils-advocate.md'
    ],
    patterns_identified: [
      'Deny-by-default (denylist for the exception, not allowlist for the exception) is the correct posture for downgrading a security/gate-relevant severity level -- an allowlist-for-blocking fails open on anything unrecognized; a denylist-for-downgrading fails closed.',
      'A retry/replay-guard designed only to REFUSE is safe to skip expensive recomputation ahead of it; once it can also PASS, every computation it skipped becomes a potential staleness bug (the invariant-freshness defect found by TESTING).',
      'Discrimination (known-good passes, known-bad blocks), not pass-rate, is the correct success criterion for fixing an over-triggering gate -- validating with a full-corpus replay (not just hand-picked examples) is achievable even without live LLM calls when historical findings are already persisted.'
    ],
    key_decisions: [
      'Corrected course mid-implementation after discovering the SD’s own hard-constraint metadata (Solomon’s discrimination-not-pass-rate ruling) post-first-draft -- reframed all code comments, tests, and validation approach around discrimination before shipping, and signaled the coordinator transparently about the correction.',
      'Ran a prospective TESTING pass BEFORE committing, per CLAUDE_LEAD.md’s mandatory cadence for gate/detector-touching SDs -- it caught 3 must-fix defects (fail-open category matching, a replay-path bypass, dedup) that would otherwise have shipped.',
      'Added a second TESTING re-verification pass after applying the fixes, which used mutation testing to prove the new tests actually pin the fixes (not merely describe them) -- caught 2 more defects (a stale-invariant-snapshot bug on the replay-pass path, and missing edge-case test coverage) before this PRD was written.'
    ],
    exploration_date: new Date().toISOString()
  }
};

const result = await addPRDToDatabase('SD-LEO-INFRA-CRITIQUE-GATE-NON-001', 'Fix Non-Convergent PRE_PLAN_ADVERSARIAL_CRITIQUE Gate', content);
console.log('RESULT:', JSON.stringify(result, null, 2));
