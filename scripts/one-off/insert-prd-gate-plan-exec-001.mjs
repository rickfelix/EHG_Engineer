#!/usr/bin/env node
// Inline-mode PRD insertion for SD-LEO-FIX-GATE-PLAN-EXEC-001 (per CLAUDE_PLAN.md's
// "PRD Creation - Inline Mode is the Default for Claude Code" workflow: the CLI
// (scripts/add-prd-to-database.js) printed the generation prompt; this inserts the
// Claude-generated PRD JSON directly, matching the schema in that prompt.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';
const SD_UUID = '37ec760d-256a-4ad3-bf4d-6d59be31b8da';
const PRD_ID = `PRD-${SD_KEY}`;

const content = {
  executive_summary:
    "Fixes gate-1's prdQualityValidation: explicit passed/max_score mapping, heuristic-only leniency scoping, and a category-aware threshold -- zero regressions on 1698 live PRDs, AI-rubric path untouched.",

  functional_requirements: [
    {
      id: 'FR-1',
      requirement: 'Map the wrapper result to an explicit {passed, max_score:100} object before calling registry.normalizeResult -- never rely on the native validatePRDQuality/validatePRDForHandoff shape falling through normalizeResult\'s fallback chain.',
      description: 'gate-1-plan-to-exec.js:25 currently does `return registry.normalizeResult(result)` where `result` is validatePRDQuality\'s own return value. validatePRDQuality already sets an explicit `passed` field on every return path, so this half is already correct. The defect this FR closes is upstream: the NEW leniency-reclassification logic (FR-2/FR-3) must itself compute and set an explicit `passed` boolean and `max_score: 100` before the object reaches normalizeResult -- so the fixed gate never depends on normalizeResult\'s `result.score >= (result.max_score || 100)` fallback, which was measured (VALIDATION c84eda3c-0670-406e-80a6-d7c42b650f02) to silently invert leniency into a stricter check when a wrapper\'s native shape (no `passed`/`max_score`) is passed through unchanged.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: A heuristic-path PRD scoring 85 with exactly 1 flagged issue yields `passed === true` from the gate after registry.normalizeResult (Test TS-1).',
        'AC-2: The gate\'s returned object always includes an explicit `max_score: 100` field, regardless of which code path (heuristic reclassified, heuristic still-failing, or AI-rubric) produced it.',
        'AC-3: Unit test asserts the object passed into registry.normalizeResult never omits `passed` when score >= the applicable threshold.'
      ]
    },
    {
      id: 'FR-2',
      requirement: 'Apply the score-based leniency reclassification (score >= threshold => issues become non-blocking warnings) INLINE against the single validatePRDQuality result, guarded by `result.details?.method === \'heuristic\'` -- do NOT route through validatePRDForHandoff.',
      description: 'validation-agent measured that validatePRDForHandoff has no method-awareness (it decides heuristic vs AI-rubric internally inside validatePRDQuality, which it also calls), so routing gate-1 through validatePRDForHandoff would ALSO relax the AI-rubric path\'s 2979 PRDs, discarding the rubric\'s own computed `passed` value -- directly contradicting this SD\'s stated scope (AI-rubric path is out of scope, not proven to share this defect). The fix instead calls validatePRDQuality exactly once (as gate-1 already does), inspects `result.details?.method`, and ONLY when it equals \'heuristic\' AND score meets the threshold (FR-3), reclassifies `result.issues` into `result.warnings` and sets `passed = true` locally -- before constructing the FR-1 object. An AI-rubric result (`details.method` undefined/absent, confirmed at prd-quality-rubric.js:733-751) passes through completely unmodified.',
      priority: 'CRITICAL',
      acceptance_criteria: [
        'AC-1: An AI-rubric-path PRD\'s `passed` value from the rubric is bit-for-bit unchanged by gate-1 -- the reclassification branch is never entered when details.method !== \'heuristic\' (Test TS-3).',
        'AC-2: A heuristic-path PRD below the applicable threshold retains issues as blocking (passed stays false) -- reclassification only fires when score >= threshold.',
        'AC-3: The reclassification logic reads `result.details?.method` with optional chaining (never a bare `.method` access) so a details-less result cannot throw (shared implementation with FR-5).'
      ]
    },
    {
      id: 'FR-3',
      requirement: 'Determine the pass threshold via getStoryMinimumScoreByCategory(sd.category, sd.sd_type) (scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js) -- never a bare literal like minimumScore=50.',
      description: 'VALIDATION measured that a flat minimumScore=50 accepts a COMPLETELY EMPTY PRD for reduced-penalty SD types (bugfix/infrastructure/refactor/fix/documentation score 53 with zero content) and, separately, makes the required:true gate incapable of blocking ANY of the 1698 live heuristic PRDs (observed minimum score 60). Reusing getStoryMinimumScoreByCategory -- the SAME function the live legacy PlanToExecVerifier.js:339 check already uses (55 for category=Fix, 50 for infrastructure/documentation, 70 default) -- fixes the quality-floor hole AND satisfies FR-4\'s reconciliation requirement in one function call, since both checks then derive their threshold from the identical source rather than two independently-chosen numbers that happen to differ.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: A totally-empty reduced-penalty-type PRD (score 53, per VALIDATION\'s measurement) still FAILS the gate under the category-derived threshold (Test TS-4).',
        'AC-2: gate-1-plan-to-exec.js imports getStoryMinimumScoreByCategory from story-quality.js rather than hardcoding a numeric threshold.',
        'AC-3: The insufficient-functional-requirements and insufficient-acceptance-criteria issue classes (prd-quality-validation.js:178, :202) remain UNCONDITIONALLY blocking regardless of score, per VALIDATION\'s recommendation -- an empty PRD can never pass purely by clearing the score floor.'
      ]
    },
    {
      id: 'FR-4',
      requirement: 'Document (do not merge) the coexistence of gate-1\'s registry check and the legacy PlanToExecVerifier.js:339 PRD_BOILERPLATE check for the same PLAN-TO-EXEC handoff, now sharing the same threshold source (FR-3).',
      description: 'Both checks run live for the same handoff (confirmed: executors/plan-to-exec/index.js:389-392 instantiates PlanToExecVerifier unless options.bypassValidation is set). Merging or removing either check is a larger consolidation explicitly out of scope for this bugfix -- the stated decision is: both checks stay, both now derive their threshold from getStoryMinimumScoreByCategory (FR-3), so they can no longer silently disagree on the SAME PRD\'s category/type. A code comment at both call sites cross-references the other.',
      priority: 'MEDIUM',
      acceptance_criteria: [
        'AC-1: gate-1-plan-to-exec.js carries a comment naming PlanToExecVerifier.js:339 as the parallel check now sharing its threshold source.',
        'AC-2: PlanToExecVerifier.js\'s existing getStoryMinimumScoreByCategory call site carries a comment naming gate-1-plan-to-exec.js as the newly-aligned registry check.',
        'AC-3: The `leo_validation_rules.validator_function` column for the prdQualityValidation row is updated (still `validatePRDQuality`, since gate-1 still calls it -- but the row\'s `criteria.min_score` stale value, confirmed inert per ValidationOrchestrator.js:1062, is annotated as non-authoritative in a migration comment rather than silently left to mislead a future reader).'
      ]
    },
    {
      id: 'FR-5',
      requirement: 'Guard every access to the quality result\'s `details.method` (and any other optional nested field introduced by this fix) with optional chaining, so a truthy-but-empty ({}) PRD input never throws.',
      description: 'gate-1-plan-to-exec.js:20 guards only `if (!prd)`, so a truthy `{}` reaches validatePRDQuality\'s empty-PRD fast-fail (prd-quality-validation.js:281-295), which returns an object with NO `details` key at all. VALIDATION confirmed a bare `result.details.method` access on that return value throws `TypeError: Cannot read properties of undefined (reading \'method\')`. The reclassification logic (FR-2) and the empty-PRD path must both be exercised by a dedicated test.',
      priority: 'HIGH',
      acceptance_criteria: [
        'AC-1: Calling the fixed gate validator with `context.prd = {}` returns a normal {passed:false,...} result and does not throw (Test TS-2).',
        'AC-2: Every new `.details.method`-shaped access in the modified code uses `?.`, verified by a targeted grep/lint check in the PR.',
        'AC-3: The existing `if (!prd)` early-return guard is left untouched (still correctly handles the null/undefined case) -- FR-5 only closes the truthy-empty-object gap.'
      ]
    }
  ],

  technical_requirements: [
    {
      id: 'TR-1',
      requirement: 'validatePRDQuality (prd-quality-validation.js) and validatePRDForHandoff must NOT be modified by this fix -- all new logic lives in gate-1-plan-to-exec.js\'s prdQualityValidation registration, calling validatePRDQuality exactly once as it already does today.',
      rationale: 'validatePRDForHandoff is a separate, already-live consumer (PlanToExecVerifier.js:339) with its own default minimumScore=70 semantics; modifying its behavior would change that call site too, which is untested by this SD and explicitly out of scope. Keeping the change additive-only inside gate-1 bounds the blast radius to exactly the mechanism this SD is scoped to fix.'
    },
    {
      id: 'TR-2',
      requirement: 'The fix must be provably zero-regression against the live population before merge: re-run the same full-population measurement methodology VALIDATION used (4677 PRDs paginated from product_requirements_v2, joined to strategic_directives_v2 for sd_type/category) comparing current-gate-verdict vs fixed-gate-verdict per PRD, and the regression count for the CORRECTLY-WIRED implementation must be 0.',
      rationale: 'The QF\'s own literal proposal was independently measured to regress 447 of 1698 PRDs; the SD exists specifically to avoid shipping an unverified "fix" that is actually worse than the current defect. A repeatable, scriptable measurement (not a spot-check) is the only way to close this out with confidence.'
    },
    {
      id: 'TR-3',
      requirement: 'No changes to registry.normalizeResult (validator-registry/core.js) or to the ValidationOrchestrator dispatch logic -- the fix is entirely contained in what object shape gate-1\'s prdQualityValidation registration constructs before calling the existing, unmodified normalizeResult.',
      rationale: 'normalizeResult and the orchestrator are shared infrastructure consumed by every other registered gate (Gate 1 through Gate 4). Modifying shared infrastructure to fix one gate\'s call-site defect would risk unrelated regressions across the entire validator-registry system -- confirmed via the Explore pass that no other gate file touches prdQualityValidation-related functions, so a call-site-local fix is sufficient and correctly scoped.'
    }
  ],

  system_architecture: {
    overview:
      'The fix is entirely local to the prdQualityValidation validator function registered in gate-1-plan-to-exec.js. It calls the existing validatePRDQuality() once (unchanged), then -- only for a heuristic-path result whose score meets a category-derived threshold -- reclassifies issues into warnings and marks the result explicitly passed before handing it to the existing, unmodified registry.normalizeResult(). No other gate, no shared library function, and no database schema is touched.',
    components: [
      {
        name: 'prdQualityValidation validator (gate-1-plan-to-exec.js)',
        responsibility: 'MODIFIED. Calls validatePRDQuality once; applies the new inline heuristic-only leniency reclassification guarded by result.details?.method===\'heuristic\' and a category-derived threshold; constructs an explicit {passed, score, max_score:100, issues, warnings, details} object; calls the existing registry.normalizeResult unchanged.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'validatePRDQuality / validatePRDHeuristic (prd-quality-validation.js)',
        responsibility: 'UNCHANGED. Continues to internally dispatch heuristic vs AI-rubric validation and return its own passed/score/issues/warnings/details shape exactly as today.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'getStoryMinimumScoreByCategory (story-quality.js)',
        responsibility: 'REUSED (newly imported by gate-1-plan-to-exec.js). Already-live category-to-threshold mapping (fix/bugfix=55, infrastructure/documentation=50, default=70) previously consumed only by the legacy PlanToExecVerifier check; now the single source of truth for both checks.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'ValidatorRegistry.normalizeResult (validator-registry/core.js)',
        responsibility: 'UNCHANGED. Continues to compute passed = result.passed ?? result.pass ?? (score>=max_score) over whatever explicit object the gate constructs.',
        technology: 'Node.js / ES modules'
      },
      {
        name: 'PlanToExecVerifier (verifiers/plan-to-exec/PlanToExecVerifier.js)',
        responsibility: 'UNCHANGED CODE, newly-aligned THRESHOLD SOURCE. Continues to run its own independent validatePRDForHandoff-based PRD_BOILERPLATE check for the same handoff; a code comment documents that it now shares getStoryMinimumScoreByCategory with gate-1 (FR-4) rather than the two checks coincidentally differing.',
        technology: 'Node.js / ES modules'
      }
    ],
    data_flow:
      'PLAN-TO-EXEC handoff -> ValidationOrchestrator dispatches the prdQualityValidation rule -> gate-1\'s registered validator receives {prd, sd, options} -> calls validatePRDQuality(prd, {sdType, sdCategory}) ONCE -> result.details?.method inspected -> IF heuristic AND score >= getStoryMinimumScoreByCategory(sd.category, sd.sd_type): issues moved to warnings, passed forced true, locally, on a copy of the result -> explicit {passed, score, max_score:100, issues, warnings, details} object constructed -> registry.normalizeResult(that object) -> ValidationOrchestrator reads .passed to decide whether the required gate blocks the handoff.',
    integration_points: [
      'ValidationOrchestrator.js (dispatches the DB-defined prdQualityValidation rule into this gate; reads back .passed to gate the handoff)',
      'leo_validation_rules DB table (the prdQualityValidation row; criteria.min_score remains inert/unused by design -- documented, not wired, per FR-4 AC-3)',
      'PlanToExecVerifier.js (parallel, unmerged PRD_BOILERPLATE check for the same handoff; now threshold-aligned per FR-4)'
    ]
  },

  test_scenarios: [
    {
      id: 'TS-1',
      scenario: 'Heuristic-path PRD scoring 85 with exactly 1 flagged issue passes the fixed gate (the exact regression VALIDATION measured against the naive literal-swap fix).',
      test_type: 'unit',
      given: 'A PRD object classified to the heuristic path (sdType=bugfix) whose validatePRDQuality result is {passed:false, score:85, issues:["one flagged item"], details:{method:"heuristic"}}',
      when: 'The fixed prdQualityValidation validator processes this context and its result is passed through registry.normalizeResult',
      then: 'The final normalized result has passed===true, the flagged item is present in warnings (not issues), and max_score===100'
    },
    {
      id: 'TS-2',
      scenario: 'A truthy-but-empty {} PRD does not throw a TypeError.',
      test_type: 'unit',
      given: 'context.prd = {} (passes the existing `if (!prd)` guard since {} is truthy)',
      when: 'The fixed prdQualityValidation validator processes this context',
      then: 'It returns a normal {passed:false, score:0, issues:["...PRD is empty or missing"]} result without throwing, and max_score===100 is still present'
    },
    {
      id: 'TS-3',
      scenario: 'An AI-rubric-path PRD\'s own passed verdict is preserved unchanged (proves the leniency scoping does not leak into the AI path).',
      test_type: 'unit',
      given: 'A PRD object classified to the AI-rubric path (sdType=feature is deliberately excluded from heuristicTypes in this scenario, forcing the rubric path) whose validatePRDQuality result is {passed:false, score:72, issues:["semantic gap flagged by rubric"], details: undefined (no method key)}',
      when: 'The fixed prdQualityValidation validator processes this context',
      then: 'The final normalized result has passed===false (unchanged from the rubric\'s own verdict) -- the reclassification branch is never entered because details?.method !== "heuristic"'
    },
    {
      id: 'TS-4',
      scenario: 'A totally-empty PRD for a reduced-penalty SD type still fails the gate (closes the quality-floor hole a flat minimumScore=50 would have opened).',
      test_type: 'unit',
      given: 'A PRD with no functional_requirements, no acceptance_criteria, no test_scenarios, no system_architecture, no implementation_approach, no risks, and an empty executive_summary, for sdType=bugfix (score 53 per VALIDATION\'s measurement, category=Fix so getStoryMinimumScoreByCategory returns 55)',
      when: 'The fixed prdQualityValidation validator processes this context',
      then: 'The final normalized result has passed===false, because 53 < 55 (the category-derived threshold) -- NOT because of the unconditional-block issue classes alone, proving the threshold itself is the binding constraint here'
    },
    {
      id: 'TS-5',
      scenario: 'Boundary test: a heuristic PRD scoring exactly at getStoryMinimumScoreByCategory\'s threshold for its category, with 1 issue, passes; scoring one point below, fails.',
      test_type: 'unit',
      given: 'Two heuristic-path PRDs for sd.category="Fix" (threshold 55) with 1 flagged issue each: one scoring exactly 55, one scoring 54',
      when: 'Both are processed by the fixed prdQualityValidation validator',
      then: 'The score-55 PRD normalizes to passed===true (issue reclassified to warning); the score-54 PRD normalizes to passed===false (issue remains blocking) -- proving the category-derived threshold binds precisely, not the invalidated flat 50'
    }
  ],

  acceptance_criteria: [
    'A full-population re-measurement (4677 PRDs, same methodology as VALIDATION c84eda3c-0670-406e-80a6-d7c42b650f02) shows 0 regressions from the fixed implementation vs the current gate, and the newly-passing count is documented (VALIDATION measured 109 for the correctly-wired design; the PR must state the actual measured count, not the QF\'s unreproduced 216).',
    'All 5 test scenarios (TS-1 through TS-5) exist as passing unit tests in the PR.',
    'gate-1-plan-to-exec.js imports getStoryMinimumScoreByCategory and no longer contains any bare numeric PRD-quality threshold literal.',
    'No changes to prd-quality-validation.js (validatePRDQuality/validatePRDHeuristic/validatePRDForHandoff) or validator-registry/core.js (normalizeResult) -- verified via the PR diff touching only gate-1-plan-to-exec.js, its test file, and the FR-4 documentation comments in PlanToExecVerifier.js.',
    'The AI-rubric path\'s existing behavior for all 2979 currently-classified AI-path PRDs is provably unchanged (TS-3 plus the full-population re-measurement\'s AI-path subset shows 0 deltas).'
  ],

  risks: [
    {
      risk: 'A literal implementation of the escalating QF\'s originally-proposed fix (swap to validatePRDForHandoff, minimumScore=50) would regress 447 of 1698 heuristic-path PRDs -- independently measured live by VALIDATION (c84eda3c-0670-406e-80a6-d7c42b650f02) -- because that wrapper returns {valid,...} with no passed/max_score, which falls through ValidatorRegistry.normalizeResult\'s nullish-coalesce chain to score>=100.',
      probability: 'LOW',
      impact: 'HIGH',
      mitigation: 'This PRD explicitly forbids routing through validatePRDForHandoff (FR-2) and mandates an inline reclassification with an explicit passed/max_score object (FR-1) instead. EXEC must implement exactly this design, not the QF\'s original literal description.',
      rollback_plan: 'Pure function change in one file, no data migration -- revert the single commit/PR if the full-population re-measurement (TR-2) shows any regression.'
    },
    {
      risk: 'A flat minimumScore=50 threshold would make the required:true gate incapable of blocking any of the 1698 live heuristic PRDs (observed minimum score 60) and would accept a completely empty PRD scoring 53 for reduced-penalty SD types.',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'FR-3 mandates deriving the threshold from getStoryMinimumScoreByCategory(sd.category, sd.sd_type) instead of a fixed number, closing the quality-floor hole and reusing an already-validated live function rather than inventing a new policy value.',
      rollback_plan: 'Same as above -- single-file revert; TS-4 is a dedicated regression test guarding this specific hole.'
    },
    {
      risk: 'The gate\'s new logic could leak into the AI-rubric path (2979 PRDs) if the heuristic-only scoping guard is implemented incorrectly (e.g. checking a post-wrapper field that does not survive, as the QF\'s own analysis initially assumed).',
      probability: 'LOW',
      impact: 'MEDIUM',
      mitigation: 'FR-2 mandates guarding on result.details?.method===\'heuristic\' read directly off the single validatePRDQuality call (never a post-validatePRDForHandoff-wrapped field), and TS-3 is a dedicated regression test asserting the AI-rubric path\'s own passed verdict is untouched.',
      rollback_plan: 'Single-file revert; the full-population re-measurement\'s AI-path subset (TR-2) is checked before merge specifically to catch this before it ships.'
    },
    {
      risk: 'Implementation may not fully address the root cause if a future change re-introduces a direct validatePRDQuality call elsewhere without the leniency wrapper this SD adds.',
      probability: 'LOW',
      impact: 'LOW',
      mitigation: 'Verify against this PRD\'s acceptance criteria and re-queue via /learn if the pattern recurs; the Explore pass confirmed gate-1-plan-to-exec.js is the ONLY call site today, so recurrence would require a genuinely new call site, not a missed existing one.',
      rollback_plan: 'N/A -- this is a future-recurrence risk, not a rollback scenario for this SD\'s own change.'
    }
  ],

  implementation_approach: {
    phases: [
      {
        phase: 'Phase 1: Threshold + reclassification helper',
        description: 'Import getStoryMinimumScoreByCategory into gate-1-plan-to-exec.js. Add the inline reclassification logic (FR-2/FR-3) operating on a single validatePRDQuality call, guarded by result.details?.method===\'heuristic\' and optional chaining throughout (FR-5).',
        deliverables: ['Modified prdQualityValidation registration in gate-1-plan-to-exec.js', 'Explicit {passed, score, max_score:100, issues, warnings, details} construction (FR-1)']
      },
      {
        phase: 'Phase 2: Regression tests',
        description: 'Add the 5 unit tests (TS-1 through TS-5) directly exercising the modified validator function in isolation (mocking/stubbing validatePRDQuality\'s return shape per scenario, not requiring a live DB).',
        deliverables: ['New test file covering TS-1..TS-5', 'Dual-check documentation comments (FR-4) in both gate-1-plan-to-exec.js and PlanToExecVerifier.js']
      },
      {
        phase: 'Phase 3: Full-population verification',
        description: 'Run a one-off measurement script (paginated over product_requirements_v2, joined to strategic_directives_v2) comparing the current gate verdict vs the fixed gate verdict for every live PRD, confirming 0 regressions and recording the actual newly-passing count (TR-2).',
        deliverables: ['Measurement output attached to the PR description', 'PR description states the measured newly-passing count, correcting the QF\'s unreproduced 216 to the actual figure']
      }
    ],
    technical_decisions: [
      'Inline reclassification inside gate-1-plan-to-exec.js, NOT routing through validatePRDForHandoff -- chosen because the wrapper has no heuristic/AI-rubric method-awareness and would leak leniency into the out-of-scope AI-rubric path (FR-2 rationale).',
      'Reuse getStoryMinimumScoreByCategory rather than a new/independent threshold constant -- chosen because it is the SAME function the parallel live PlanToExecVerifier check already uses, so this fix aligns rather than adds a second, divergent threshold policy (FR-3/FR-4 rationale).',
      'Document, do not merge, the dual PRD-quality checks (gate-1 registry + PlanToExecVerifier legacy) -- a full consolidation is a larger, separate refactor explicitly out of this bugfix\'s scope.'
    ]
  },

  integration_operationalization: {
    consumers: [
      {
        name: 'PLAN-TO-EXEC handoff callers (worker/coordinator sessions running node scripts/handoff.js execute PLAN-TO-EXEC <SD-KEY>)',
        interaction: 'Their PRD is scored by the fixed prdQualityValidation gate as one of ~30 gates evaluated during the handoff; a passing score no longer requires a zero-issue PRD when the score clears the category-derived threshold.',
        frequency: 'Every PLAN-TO-EXEC handoff attempt for every SD (dozens per day fleet-wide).'
      },
      {
        name: 'ValidationOrchestrator (internal dispatcher)',
        interaction: 'Reads the gate\'s normalized .passed field to decide whether the required prdQualityValidation gate blocks the overall handoff verdict.',
        frequency: 'Once per PLAN-TO-EXEC precheck/execute invocation.'
      },
      {
        name: 'SD authors whose PRD is heuristic-path-classified (sd_type/category in bugfix, infrastructure, database, quality_assurance, orchestrator, documentation, refactor, theming, ux, design, ui, layout, state-management, or feature)',
        interaction: 'Their PRD can now legitimately pass with a well-scoring-but-imperfect PRD, matching the leniency already available to PRDs checked via the legacy PlanToExecVerifier path.',
        frequency: 'Once per PRD, at PLAN-TO-EXEC time.'
      }
    ],
    dependencies: [
      {
        name: 'validatePRDQuality / validatePRDHeuristic (scripts/modules/prd-quality-validation.js)',
        type: 'upstream',
        contract: 'Called exactly once per gate invocation, unchanged signature and return shape; the fix only reads result.score/result.issues/result.warnings/result.details?.method from its return value.',
        failure_handling: 'If validatePRDQuality throws or returns a malformed shape, the existing try/catch and the FR-5 optional-chaining guards prevent an unhandled exception from crashing the whole handoff precheck.'
      },
      {
        name: 'getStoryMinimumScoreByCategory (scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js)',
        type: 'upstream',
        contract: 'Called with (sd.category, sd.sd_type); returns a numeric threshold (55/50/70 per its own CATEGORY_THRESHOLDS table). This SD adds a second call site to an already-live function -- no signature change.',
        failure_handling: 'If the function is unavailable/throws (should not happen -- it is a pure lookup), the gate falls back to failing closed (treat as not-yet-passed) rather than silently defaulting to a permissive number.'
      },
      {
        name: 'ValidationOrchestrator.js (downstream)',
        type: 'downstream',
        contract: 'Consumes the gate\'s normalized {passed, score, max_score, issues, warnings} object exactly as it does for every other registered gate -- no orchestrator-side change required.',
        failure_handling: 'Unaffected by this fix; existing required:true blocking behavior is preserved, just now correctly gated on score-with-leniency instead of zero-issues.'
      },
      {
        name: 'PlanToExecVerifier.js (parallel downstream, same handoff)',
        type: 'downstream',
        contract: 'Continues to run its own independent PRD_BOILERPLATE check via validatePRDForHandoff; now documented (FR-4) as sharing the same threshold-derivation function as gate-1, though the two remain separate call sites/checks.',
        failure_handling: 'Unaffected by this fix -- no code change to this file beyond an added cross-reference comment.'
      }
    ],
    data_contracts: [
      {
        contract_name: 'prdQualityValidation gate result shape',
        schema: '{ passed: boolean, score: number, max_score: 100, issues: string[], warnings: string[], details?: { method: "heuristic"|undefined, sdType, useReducedPenalty } }',
        validation: 'Enforced by the 5 new unit tests (TS-1..TS-5) asserting the shape and passed/warnings/issues placement for each scenario class.',
        versioning: 'No external versioning needed -- this is an internal function contract between gate-1-plan-to-exec.js and registry.normalizeResult, not a public/persisted schema.'
      },
      {
        contract_name: 'leo_validation_rules.prdQualityValidation row (criteria.min_score, validator_function)',
        schema: 'Existing DB row: { gate: "prdQualityValidation", criteria: {"uses_ai":true,"min_score":50,...}, validator_function: "validatePRDQuality", required: true, weight: 0.172 }',
        validation: 'criteria.min_score remains INERT (confirmed: ValidationOrchestrator.js never spreads rule.criteria into the validator context) -- this SD documents that fact (FR-4 AC-3) rather than wiring it live, which is a separate, larger change out of scope.',
        versioning: 'No schema change to this table; only a documentation-comment addition, no migration required.'
      }
    ],
    runtime_config: {
      environment_variables: [],
      feature_flags: [],
      deployment_considerations: 'No new env vars or feature flags. This is a pure, additive JS-module logic change with no data migration -- deploys via a normal PR merge to main; any running LEO worker/coordinator process picks up the new code on its next fresh process start (per this repo\'s existing DEPLOY_GAP detector convention), no special sequencing required.'
    },
    observability_rollout: {
      monitoring: [
        'Existing per-handoff console output already prints this gate\'s score and threshold in the "GATE SCORES (Precheck)" block -- no new instrumentation needed to observe the fixed behavior in normal operation.',
        'The Phase 3 full-population measurement script (TR-2) doubles as a one-time observability artifact attached to the PR, showing before/after pass counts.'
      ],
      alerts: [],
      rollout_strategy: 'Standard PR merge to main -- no phased rollout or feature flag, given the full-population zero-regression proof required before merge (TR-2/acceptance criterion 1) already substitutes for a canary.',
      rollback_trigger: 'Any regression found in the pre-merge full-population re-measurement (TR-2), or a post-merge report of a previously-passing PRD newly failing the gate.',
      rollback_procedure: 'git revert the single merge commit -- pure function change, no data migration, so a plain revert fully restores prior behavior with no cleanup steps.'
    }
  },

  exploration_summary: {
    files_read: [
      'scripts/modules/handoff/validation/validator-registry/gates/gate-1-plan-to-exec.js',
      'scripts/modules/prd-quality-validation.js',
      'scripts/modules/handoff/validation/validator-registry/core.js',
      'scripts/modules/handoff/validation/ValidationOrchestrator.js',
      'scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js',
      'scripts/modules/handoff/executors/plan-to-exec/index.js',
      'scripts/modules/handoff/verifiers/plan-to-exec/story-quality.js',
      'database/migrations/20260112_validation_rules_complete.sql'
    ],
    patterns_identified: [
      'ValidatorRegistry gate-registration pattern: register(ruleName, asyncFn) -> asyncFn returns a raw result -> registry.normalizeResult(result) computes the final passed/score/max_score shape.',
      'Category-aware threshold lookup pattern already live in story-quality.js (getStoryMinimumScoreByCategory) and consumed by the legacy PlanToExecVerifier check -- reused rather than reinvented.',
      'reducedPenaltyTypes list inside validatePRDHeuristic (prd-quality-validation.js:167-173) applies a lighter per-field penalty for infra/bugfix/doc/refactor SDs, which is what produces the 53-point empty-PRD floor this SD\'s FR-3 must clear.'
    ],
    key_decisions: [
      'Chose an inline, gate-1-local reclassification over routing through validatePRDForHandoff, after VALIDATION measured the latter would leak leniency into the out-of-scope AI-rubric path and, if wired naively, regress 447 PRDs via the passed/max_score schema mismatch.',
      'Chose to reuse getStoryMinimumScoreByCategory over a new numeric constant, so the two live PRD-quality checks for the same handoff derive their threshold from one shared source instead of two independently-chosen numbers.',
      'Chose to document rather than merge the dual-check (gate-1 + PlanToExecVerifier) situation, keeping this SD\'s blast radius to the single defective call site it was filed to fix.'
    ],
    exploration_date: new Date().toISOString().slice(0, 10)
  }
};

const { data: existingPrd } = await supabase
  .from('product_requirements_v2')
  .select('id')
  .eq('id', PRD_ID)
  .maybeSingle();

const row = {
  id: PRD_ID,
  sd_id: SD_UUID,
  title: 'Fix prdQualityValidation gate leniency mismatch',
  status: 'approved',
  category: 'Fix',
  priority: 'high',
  executive_summary: content.executive_summary,
  functional_requirements: content.functional_requirements,
  technical_requirements: content.technical_requirements,
  system_architecture: content.system_architecture,
  test_scenarios: content.test_scenarios,
  acceptance_criteria: content.acceptance_criteria,
  risks: content.risks,
  implementation_approach: content.implementation_approach,
  integration_operationalization: content.integration_operationalization,
  exploration_summary: content.exploration_summary,
  metadata: {
    generated_via: 'inline_claude_code',
    source_qf_id: 'QF-20260903-239',
    lead_validation_evidence_id: 'c84eda3c-0670-406e-80a6-d7c42b650f02',
    lead_explore_evidence_id: '4d14abef-9899-4f79-a846-1aa43f54796f',
  },
};

let result;
if (existingPrd) {
  result = await supabase.from('product_requirements_v2').update(row).eq('id', PRD_ID).select().single();
} else {
  result = await supabase.from('product_requirements_v2').insert(row).select().single();
}

if (result.error) {
  console.error('❌ PRD insert/update failed:', result.error.message);
  process.exit(1);
}

console.log('✅ PRD', existingPrd ? 'updated' : 'inserted', ':', result.data.id);
console.log('   executive_summary length:', content.executive_summary.length, 'chars');
console.log('   functional_requirements:', content.functional_requirements.length);
console.log('   technical_requirements:', content.technical_requirements.length);
console.log('   test_scenarios:', content.test_scenarios.length);
console.log('   risks:', content.risks.length);
