#!/usr/bin/env node
/**
 * One-off insert: SD_COMPLETION retrospective for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C ("Adherence Rubric Scoring +
 * Convergence Loop"), required evidence for the PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY gate.
 *
 * Run from repo root: node <this-file>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SD_UUID = '18129ef6-5615-468e-b8da-d99f9833b213';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C';

async function main() {
  // Dedup check (retro_type-scoped, mirrors generate-comprehensive-retrospective.js)
  const { data: existing } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists (ID: ${existing[0].id}, created ${existing[0].created_at}) — not inserting a duplicate.`);
    process.exit(0);
  }

  const retrospective = {
    sd_id: SD_UUID,
    project_name: 'Adherence Rubric Scoring + Convergence Loop',
    retro_type: 'SD_COMPLETION',
    title: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C: Adherence Rubric Scoring + Convergence Loop',
    description: 'Child C of the Post-Build Artifact Reconciliation Gate orchestrator (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001). Applies Child A\'s adherence_rubrics registry to Child B\'s post_build_verdicts rows via lib/eva/adherence-scorer.js (scoreVerdictTable, scoreDimension, classifyDeviationReason, buildDeviationLedger, DIMENSION_ARTIFACT_MAP), producing a behaviorally-anchored 1-5 score per dimension (user-story coverage, persona-surface coverage, data-model fidelity, architecture conformance) plus a weighted deviation ledger. lib/eva/convergence-loop.js (runConvergenceLoop, classifyGaps, backfillCompletenessGap, classifyRemediationTier, routeRemediation, buildEscalationPacket) orchestrates score->remediate->rescore, bounded to 3 cycles with monotone-convergence early termination, a per-cycle remediation cap of 5 with overflow deferral, and a 3-disposition escalation packet on exhaustion. Single commit 0dfd3c7575 on branch feat/SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C, PR #5585 (open at retrospective time, all 27 required CI checks green). 28/28 new unit tests pass (adherence-scorer.test.js: 12, convergence-loop.test.js: 16); 51/51 sibling Child A/B regression tests pass (deviation-ledger.test.js, post-build-verdict-engine.test.js, rubric-generator.test.js), 0 regressions; ESLint clean on all 4 touched files. TESTING sub-agent issued CONDITIONAL_PASS (confidence 90, 0 critical issues) at EXEC-TO-PLAN, with E2E correctly marked not-applicable (pure backend/data-layer child, no UI/route/HTTP surface) and 2 non-blocking test-coverage gaps flagged. During its own LEAD phase, this SD assessed and declined absorbing the chairman\'s mid-flight synthetic-persona live-UI journey-walk requirement upgrade (neither this child\'s pure scoring/convergence scope nor Child D\'s gate-wiring/static-live-run scope was a natural fit for persona generation + browser automation), filing it instead as a new fifth child, SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E.',
    conducted_date: new Date().toISOString(),
    agents_involved: ['LEAD', 'PLAN', 'EXEC'],
    sub_agents_involved: ['RISK', 'VALIDATION', 'DESIGN', 'DATABASE', 'STORIES', 'TESTING'],
    human_participants: ['LEAD'],

    what_went_well: [
      'Role separation across the orchestrator held up under test: adherence-scorer.js owns the reason-quality judgment (classifyDeviationReason) that Child A/B deliberately do NOT own, and is a pure read against post_build_verdicts/adherence_rubrics/venture_artifacts — it never mutates a Child A/B table (verified by the TESTING sub-agent as structural, not just documented, per its F6 finding on "fresh rescore, no shared mutable state").',
      'scoreVerdictTable() reads dimension_floor/mean_floor/zero_unscored_fails live from the published adherence_rubrics row on every call rather than hardcoding the pass bar — directly closing the LEAD-phase validation-agent finding that the chairman-ratified pass bar must stay live, not baked into the scorer.',
      'convergence-loop.js reused isTrendingDown() from lib/coordinator/convergence-ledger.js for monotone-convergence early exit instead of inventing a new comparator, per the LEAD-phase validation-agent finding cited directly in the commit message.',
      'routeRemediation()\'s per-cycle cap (DEFAULT_PER_CYCLE_CAP=5) defers overflow items rather than silently dropping them, and surfaces filing failures into `deferred`+`errors` instead of miscounting a rejected createQuickFixFn/createSdFn call as a routed success.',
      'Shipped clean on the first PR iteration: single commit (0dfd3c7575), all 27 required CI checks green, no adversarial-review fix round needed — unlike sibling Child B, which needed 3 follow-up fix commits after its own adversarial review.',
      'TESTING sub-agent (EXEC-TO-PLAN) issued CONDITIONAL_PASS at 90 confidence with 0 critical issues, and explicitly traced *why* each of the four core behaviors (reason-quality heuristic, circularity guard, per-cycle cap/overflow, monotone early-exit) was genuinely exercised rather than tautologically passing — a stronger evidentiary bar than a bare test-count pass.'
    ],

    what_needs_improvement: [
      'The first-pass classifyDeviationReason() heuristic would have let a trivial 2-word phrase ("because reasons") classify as SENSIBLE purely because it contains the causal-marker word "because" — a defect in the exact anti-drift rubric FR-2 exists to enforce. This was caught by the implementer\'s own self-review before the single commit landed, not by a test written first; a minimum-word-count floor (SENSIBLE_MIN_WORDS=6) had to be added on top of the length+causal-marker checks.',
      'A related design bug in buildDeviationLedger()\'s "critical-tier first" sort: naively sorting by DEVIATION_WEIGHTS\' array-index declaration order (\'minor\',\'moderate\',\'critical\',\'declared-descope\') would have put the already-accepted, least-urgent \'declared-descope\' gap FIRST (highest index) instead of last — also caught only in self-review, requiring a dedicated URGENCY_RANK map rather than reusing that array\'s order.',
      'scoreDimension()\'s mid-gradient scores (2, 3, 4) have no direct unit assertion — only the two extremes (goodFraction===1 => 5, goodFraction===0 => 1) are tested; the undocumentedOrThin===0 && >=0.5 => 4 rule (adherence-scorer.js:158) and the plain >=0.5 => 3 / else => 2 branches are exercised only incidentally through other tests, not asserted directly (TESTING sub-agent finding F7).',
      'fileAdherenceFix()\'s tier-3 (createSdFn) branch is entirely unexercised — every routeRemediation()/runConvergenceLoop() test uses an empty deviation ledger, so classifyRemediationTier() always resolves to tier 2 and the SD-filing path (convergence-loop.js:115-120) never actually runs in a test, even though classifyRemediationTier() itself is separately unit-tested to return 3 in isolation (TESTING sub-agent finding F7).',
      'The chairman\'s mid-flight requirement upgrade (synthetic-persona live-UI journey walks) was not anticipated at the orchestrator\'s original 4-child decomposition, so a 5th child (Child E) had to be filed reactively during this child\'s own LEAD phase rather than at parent-orchestrator planning time.'
    ],

    action_items: [
      {
        owner: 'EXEC/PLAN (next touch on lib/eva/adherence-scorer.js)',
        action: 'Add a scoreDimension() test case with a mixed BUILT/DEVIATED fraction strictly between 0 and 1 (e.g. 2 of 4 claims passing) to lock in the 2/3/4 behavioral-anchor mapping.',
        status: 'proposed',
        deadline: 'Before any future change to the goodFraction branch logic in scoreDimension()',
        verification: 'New test asserts dimensionScores for a fraction in (0,1) resolves to the exact expected 2/3/4 value per adherence-scorer.js:156-160'
      },
      {
        owner: 'EXEC/PLAN (next touch on lib/eva/convergence-loop.js)',
        action: 'Add a routeRemediation()/runConvergenceLoop() test with a critical-weight ledger entry so a tier-3 gap actually routes through createSdFn and returns filed:"sd".',
        status: 'proposed',
        deadline: 'Before Child D wires runConvergenceLoop() into the live S19->S20 gate',
        verification: 'New test asserts createSdFn is invoked and routed[].result.filed === "sd" for a gap whose dimension has a critical-weight ledger entry'
      },
      {
        owner: 'PLAN (Child D integration check)',
        action: 'Confirm Child D\'s S19->S20 gate-wiring calls runConvergenceLoop() with real createSdFn/createQuickFixFn/backfillFn implementations (not test vi.fn() stand-ins) before any live venture reaches the gate.',
        status: 'proposed',
        deadline: 'Child D EXEC phase',
        verification: 'Child D PRD/EXEC evidence shows non-mock function references wired into runConvergenceLoop() opts'
      },
      {
        owner: 'LEAD (Child E scope check)',
        action: 'Verify Child E\'s persona-generation + browser-automation evidence feeds into this same adherence_rubrics/post_build_verdicts pipeline (not a parallel scoring path), so this scorer does not need a second consumer.',
        status: 'proposed',
        deadline: 'Child E PLAN phase',
        verification: 'Child E PRD explicitly references DIMENSION_ARTIFACT_MAP / post_build_verdicts as its evidence sink'
      }
    ],

    key_learnings: [
      {
        lesson: 'A reason-quality heuristic combining a length floor with a causal-marker regex is not sufficient alone — a trivial phrase can satisfy both independently (e.g. "because reasons" is exactly 15 characters and contains "because") without saying anything substantive. A minimum-word-count floor (SENSIBLE_MIN_WORDS=6) layered on top of both checks was required to make the anti-drift classifier actually work as FR-2 intends.',
        category: 'architecture',
        applicability: 'Any future free-text quality/sense-making classifier (not just deviation reasons) should treat length and content-marker checks as necessary-but-not-sufficient and add a structural/word-count floor.'
      },
      {
        lesson: 'Reusing an existing constant array\'s declaration order as an implicit sort/priority comparator is a latent bug generator: DEVIATION_WEIGHTS\' array order was designed for lookup, not urgency ranking, and naively sorting buildDeviationLedger() by that index would have silently inverted urgency (already-accepted "declared-descope" gaps ranked above "critical" ones).',
        category: 'architecture',
        applicability: 'Never reuse an enum/constant array\'s declaration order as an implicit priority/sort order without first checking whether the array was ever designed to encode ranking.'
      },
      {
        lesson: 'Cross-child role separation (Child A owns the registry, Child B owns the verdict walk, Child C owns scoring + reason-quality judgment) held up under independent test verification — Child C never mutates a Child A/B table, and the TESTING sub-agent confirmed the "fresh rescore, no shared mutable state" FR-3 boundary was structural rather than merely documented in a comment.',
        category: 'architecture',
        applicability: 'Orchestrator children sharing schema (adherence_rubrics/post_build_verdicts/venture_artifacts) should preserve this one-mutator/many-readers pattern as the pipeline grows, to avoid circular dependencies between children.'
      },
      {
        lesson: 'A mid-flight chairman requirement upgrade is not automatically absorbed into whichever child sounds topically closest. Both this child\'s pure scoring/convergence scope and Child D\'s gate-wiring/static-live-run scope were explicitly evaluated and declined for the synthetic-persona live-UI walk requirement before filing a new Child E, per the chairman\'s own fallback clause for exactly this situation.',
        category: 'process',
        applicability: 'When a requirement is upgraded mid-orchestrator, evaluate absorption against each child\'s actual FR-ownership boundary (not just topical proximity) before deciding a new child is needed.'
      },
      {
        lesson: 'TESTING sub-agent verdicts that explicitly trace *why* a given test is non-tautological (e.g. "the because-reasons case is exactly 15 chars and trips the causal-marker regex, so it can only be classified THIN via the word-count floor, not the length floor") are meaningfully stronger evidence than a bare pass/fail count and are worth preserving verbatim in retrospectives rather than summarizing away.',
        category: 'testing',
        applicability: 'Future TESTING sub-agent invocations on judgment-heavy modules (heuristics, classifiers, scoring rules) should be asked to trace why each test exercises its intended branch, not just confirm it passes.'
      }
    ],

    quality_score: 88,
    team_satisfaction: 9,
    business_value_delivered: 'Closes the scoring layer of the Post-Build Artifact Reconciliation Gate: turns Child A\'s rubric registry + Child B\'s per-artifact verdicts into an actual pass/fail signal (dimension floors + mean floor + zero-unscored-fails) with a bounded remediation loop, unblocking Child D\'s S19->S20 gate wiring.',
    customer_impact: 'No direct end-user surface (backend/data-layer only); indirect impact is a chairman-facing adherence score + deviation ledger + escalation packet once Child D wires this into the live gate.',
    technical_debt_addressed: false,
    technical_debt_created: true,
    bugs_found: 2,
    bugs_resolved: 2,
    tests_added: 28,
    code_coverage_delta: null,
    performance_impact: 'Standard — bounded 3-cycle loop with early exit, no perf-sensitive path introduced',
    objectives_met: true,
    on_schedule: true,
    within_scope: true,

    success_patterns: [
      'Backend-only orchestrator child shipped clean on first PR iteration — 0 adversarial-review fix commits, unlike sibling Child B\'s 3-commit fix cycle',
      'Chairman-ratified pass-bar constants (dimension_floor/mean_floor/zero_unscored_fails) read live from the rubric row every call, never hardcoded',
      'Existing convergence comparator (isTrendingDown) reused rather than reinvented, per an explicit LEAD-phase validation-agent finding',
      'TESTING sub-agent CONDITIONAL_PASS at 90 confidence, 0 critical issues, with an explicit non-tautological trace of all 4 core behaviors'
    ],
    failure_patterns: [
      'Two logic bugs (SENSIBLE reason-quality word-count-floor gap; declared-descope sort-order inversion) were caught only by the implementer\'s own self-review before the single commit landed — no failing test existed first for either fix',
      'Two branches (scoreDimension mid-gradient 2/3/4; fileAdherenceFix tier-3/createSdFn) shipped without direct unit coverage, accepted via the TESTING sub-agent\'s non-blocking-gap classification rather than a red test forcing coverage before merge'
    ],
    improvement_areas: [
      'Add a scoreDimension() mid-gradient test case (fraction strictly between 0 and 1) to lock in the 2/3/4 anchor mapping',
      'Add a routeRemediation()/runConvergenceLoop() test with a critical-weight ledger entry to exercise the tier-3 createSdFn path',
      'File Child E\'s persona/browser-automation scope split earlier in future orchestrator decompositions when a requirement upgrade is anticipated'
    ],

    generated_by: 'MANUAL',
    trigger_event: 'PLAN_TO_LEAD_HANDOFF_PREP',
    status: 'PUBLISHED',
    target_application: 'EHG_Engineer',
    learning_category: 'APPLICATION_ISSUE',
    related_files: [
      'lib/eva/adherence-scorer.js',
      'lib/eva/convergence-loop.js',
      'tests/unit/eva/adherence-scorer.test.js',
      'tests/unit/eva/convergence-loop.test.js'
    ],
    related_commits: ['0dfd3c7575'],
    related_prs: ['#5585'],
    affected_components: [
      'lib/eva/adherence-scorer.js (scoreVerdictTable, scoreDimension, classifyDeviationReason, buildDeviationLedger, DIMENSION_ARTIFACT_MAP)',
      'lib/eva/convergence-loop.js (runConvergenceLoop, classifyGaps, backfillCompletenessGap, classifyRemediationTier, routeRemediation, buildEscalationPacket)',
      'adherence_rubrics (Child A, read-only consumer)',
      'post_build_verdicts (Child B, read-only consumer)'
    ],
    tags: ['adherence-scoring', 'convergence-loop', 'post-build-artifact-gate', 'orchestrator-child', 'rubric-scoring']
  };

  const { data: inserted, error } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select();

  if (error) {
    console.error('INSERT FAILED:', error);
    process.exit(1);
  }

  console.log('Retrospective persisted.');
  console.log('  id:', inserted[0].id);
  console.log('  sd_id:', inserted[0].sd_id);
  console.log('  retro_type:', inserted[0].retro_type);
  console.log('  status:', inserted[0].status);
  console.log('  quality_score:', inserted[0].quality_score);
  console.log('  created_at:', inserted[0].created_at);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
