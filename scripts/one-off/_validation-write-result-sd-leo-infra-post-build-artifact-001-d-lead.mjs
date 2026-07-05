#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent LEAD-phase verdict for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D ("S19->S20 Gate Wiring + Chairman Packet
 * Attachment + MarketLens Live-run") ahead of its LEAD-TO-PLAN handoff.
 *
 * Child D of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001. Depends on:
 *   - Child A (completed) — adherence_rubrics + post_build_adherence_v1 seed.
 *   - Child B (completed) — post-build-verdict-engine.js + post_build_verdicts table.
 *   - Child C (completed) — adherence-scorer.js (scoreVerdictTable) + convergence-loop.js
 *     (runConvergenceLoop) — the callable this SD must wire into the real pipeline.
 *
 * Uses the canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ee07a103-dfcc-4cc9-9b3c-fece6534cf4c';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D';

const findings = [
  {
    id: 'F1-three-mechanism-inventory-confirmed-complete',
    severity: 'INFO',
    summary: 'MECHANISM INVENTORY CONFIRMED — exactly THREE existing S19->S20-adjacent gate mechanisms, no fourth found. (1) lib/eva/stage-execution-worker.js: the S19 hard-gate + S20 pause path — _isLeoBridgeBuildComplete(ventureId) (line ~4045, the single "is the leo_bridge build tree complete" evaluator shared with the S20 pause controller) and _checkBuildPending(ventureId) (line ~4451, Stage-20 block-until-linked-SDs-complete). S19 hold/advance decided via classifyBridgeOutcome/shouldHoldAtS19 (bridge/s19-advance-decision.js) at multiple choke points (sync gate ~L1500, hard gate ~L692, _advanceStage backstop ~L2538). (2) lib/eva/reality-gates.js: evaluateRealityGate(params,deps) (line 197) resolving transitionKey against the public.gate_boundary_config DB table (canonical reader _loadBoundaryFromDB, line ~84) with a BOUNDARY_CONFIG code fallback. (3) lib/eva/lifecycle/exit-gate-verifiers.js: GATE_VERIFIERS map + resolveVerifier(gateString), consumed by lib/eva/lifecycle/exit-gate-enforcer.js checkExitGates({supabase,ventureId,fromStage}) (line 64), which is invoked from lib/eva/stage-execution-engine.js line 61. A codebase-wide sweep for S19/S20/exit-gate/reality-gate boundary logic surfaced NO other mechanism at this boundary — the SD scope text\'s claim of a third pre-existing mechanism is ACCURATE and the set of three is COMPLETE.'
  },
  {
    id: 'F2-exit-gate-verifiers-replit-scoping-claim-verified',
    severity: 'INFO',
    summary: 'THIRD-MECHANISM (exit-gate-verifiers.js) SCOPING CLAIM VERIFIED with nuance. File header reads "Exit-gate verifier map for the Stage 19->20 enforcer" (SD-LEO-FEAT-STAGE-BUILD-REPLIT-001), confirming it is wired at exactly this boundary. Its S19-exit verifiers (verifyBuildMvpBuildPresent for gate string "application deployed"; verifyVentureResourceUrlsPopulated for "github repo url") were authored for the Replit registration flow — they check venture_artifacts(build_mvp_build) + ventures.repo_url/deployment_url, which the Replit path populates. HOWEVER the enforcer (checkExitGates) is NOT hard-coded to build_method===replit_agent: it is gated only by the LEO_S19_EXIT_GATE_ENFORCER env flag (default ON) and dispatches whatever prose strings are declared in venture_stages.metadata.gates.exit for the fromStage. Its EFFECTIVE Replit-scoping comes from (a) which gate strings a stage declares and (b) that the S20PauseController short-circuits build_method===\'replit_agent\' with status \'replit_path\' (s20-pause-controller.js line 65-66) while leo_bridge ventures take the SD-completion path. NET: the claim "wired at S19->20 but effectively Replit-path-scoped" is correct; PLAN should note the enforcer itself is method-agnostic and flag-gated, so extending it (option 3) would touch all ventures unless a new gate string / method guard is added.'
  },
  {
    id: 'F3-child-c-callable-confirmed',
    severity: 'INFO',
    summary: 'CHILD C CALLABLE CONFIRMED. lib/eva/convergence-loop.js exports async runConvergenceLoop(supabase, opts) (line 199; also on the default export, line 267-271). Signature: opts = {ventureId (required), rubricKey=\'post_build_adherence_v1\', maxCycles=3, perCycleCap=5, backfillFn, createQuickFixFn, createSdFn, isArtifactChairmanApproved=false}. Returns {status:\'PASS\'|\'ESCALATED\', cycles, scoreResult, escalationPacket?, remediationHistory}. scoreResult is the shape produced by scoreVerdictTable() (lib/eva/adherence-scorer.js line 178) — {dimensionScores, unscoredDimensions, mean, rubric, pass}. The module ALSO exports the atoms Child D may want directly: computeDeficit, classifyGaps, buildEscalationPacket, ESCALATION_DISPOSITIONS (frozen: descope-as-known-gap / pivot-the-artifact / hold-launch). CRITICAL WIRING NOTE: convergence-loop.js carries a @wire-check-exempt banner (lines 13-17) stating "Today\'s only consumer is tests/unit/eva/convergence-loop.test.js" and naming THIS SD (Child D) as the SD that "wires this loop into the real S19-exit boundary." Child D MUST remove/satisfy that exemption by adding the real caller. Remediation callbacks (backfillFn/createQuickFixFn/createSdFn) are INJECTED — Child D must supply them (wiring to scripts/leo-create-sd.js + scripts/create-quick-fix.js per Child C\'s design) or the loop\'s remediation branch throws.'
  },
  {
    id: 'F4-generatereviewpacket-structure-confirmed',
    severity: 'INFO',
    summary: 'generateReviewPacket() EXISTS and its structure is confirmed for extension. lib/eva/chairman-product-review.js line 154: async generateReviewPacket(supabase, ventureId, logger=console). Returns either {skipped:true, reason:\'fixture_venture\'} (fixture-guarded via isFixtureVenture) OR {skipped:false, ventureName, access:{mode,instructions}, guidedTour:[{stop,note}], surfacesInventory:[{surface,present,detail}]}. It reads venture_artifacts(is_current, artifact_type IN SURFACE_ARTIFACT_TYPES). PRODUCT_REVIEW_STAGE=23, PRODUCT_REVIEW_DECISION_TYPE=\'product_review\'. Sibling exports Child D interacts with: requestProductReview() (line 242, calls generateReviewPacket then mints the chairman decision), recordProductReviewVerdict() (line 294), buildReviewDiff() (line 189, pure packet-diff — will need a matching field for the new verdict-table/adherence-score so diffs surface changes). EXTENSION POINT: add a verdictTable + adherenceScore (+ escalation disposition when ESCALATED) key to the returned packet object at line 173-179, sourced from post_build_verdicts (Child B rows) + runConvergenceLoop/scoreVerdictTable (Child C). PLAN must also extend buildReviewDiff to report score/verdict changes and keep the fixture-venture skip guard intact.'
  },
  {
    id: 'F5-no-existing-partial-wiring-clean-greenfield-integration',
    severity: 'INFO',
    summary: 'NO existing/partial wiring of the convergence engine into the pipeline. Grep of lib/eva/chairman-product-review.js, lib/eva/s20-pause-controller.js, lib/eva/stage-execution-worker.js, lib/eva/lifecycle/exit-gate-verifiers.js for runConvergenceLoop / convergence-loop / adherence-scorer / scoreVerdictTable returned ZERO hits — none of the three boundary mechanisms nor the product-review packet reference Child C today. Codebase-wide, the ONLY consumers of runConvergenceLoop/convergence-loop are the module itself, adherence-scorer.js (sibling), tests/unit/eva/convergence-loop.test.js, and three Child-C one-off scripts. So Child D is a genuine greenfield integration with NO half-built wiring to reconcile or collide with. The verdict-table persistence substrate ALSO already exists: Child B shipped the post_build_verdicts table (database/migrations/20260704_create_post_build_verdicts.sql, current-snapshot-only, uq_post_build_verdicts_item UNIQUE(venture_id,artifact_type,claim_ref)) and post-build-verdict-engine.js writes it — so "persist verdict table" is largely a READ+surface task, not a new schema, though an adherence_score persistence location (packet field vs a new column/row) is a PLAN decision.'
  },
  {
    id: 'F6-choose-one-of-three-do-not-build-a-fourth',
    severity: 'WARNING',
    summary: 'SCOPE GUARDRAIL (advisory to PLAN): the SD mandates extending ONE existing mechanism, not building a fourth. Given the three: (a) stage-execution-worker _isLeoBridgeBuildComplete/_checkBuildPending is the S20-pause / build-complete path that BOTH S20PauseController AND the chairman packet already sit near — wiring runConvergenceLoop here (as the S20 build-complete determination is made, before the product-review packet at S23) aligns with "S20PauseController and the chairman product-review packet can both read it." (b) exit-gate-verifiers is a per-gate-string boolean-verifier registry — a 1-5 adherence SCORE + convergence LOOP does not fit its satisfied:boolean contract cleanly and would strain it. (c) reality-gates/gate_boundary_config is transition-boundary config resolution — a natural place to DECLARE the S19->20 reconciliation gate but not to run a multi-cycle remediation loop. PLAN should most likely wire the loop invocation into the worker\'s S19->S20 path (near _isLeoBridgeBuildComplete / the S20 pause decision) and persist verdictTable+adherenceScore where both S20PauseController and generateReviewPacket read, rather than overloading the boolean exit-gate-verifier registry. Confirm the exact seam in PLAN; do NOT introduce a new gate module.'
  },
  {
    id: 'F7-marketlens-smoke-test-fixtures-must-be-verified-at-plan',
    severity: 'WARNING',
    summary: 'LIVE-RUN SMOKE TEST — verify fixtures at PLAN/EXEC, not assumed. The SD prescribes running against MarketLens at two commits (87c72ad current-main => expect high score; 35353c5 pre-recovery => expect near-zero user-story/persona coverage). Because scoreVerdictTable reads post_build_verdicts rows (Child B walk output) NOT the git tree directly, the two-commit contrast only materializes if the artifact walk / verdict rows reflect each commit\'s state. PLAN must specify HOW the two commits are reduced to two distinct post_build_verdicts snapshots (re-run runArtifactWalk against each checked-out tree, or seed fixture verdict rows) — otherwise the "high vs near-zero" contrast cannot be produced by a pure DB read. Also confirm MarketLens\'s ventureId and that it is NOT fixture-guarded out of generateReviewPacket (isFixtureVenture) for the packet-attachment leg of the smoke test.'
  }
];

const warnings = [
  'Extend exactly ONE of the three existing mechanisms — the worker S19->S20 path (_isLeoBridgeBuildComplete / S20 pause decision) is the best-fit seam because both S20PauseController and generateReviewPacket sit adjacent to it; do NOT overload exit-gate-verifiers\' satisfied:boolean contract with a 1-5 score+loop, and do NOT add a fourth gate module.',
  'convergence-loop.js runConvergenceLoop requires INJECTED remediation callbacks (backfillFn/createQuickFixFn/createSdFn) and a ventureId; supply them (wired to scripts/leo-create-sd.js + scripts/create-quick-fix.js) or the remediation branch throws. Remove/satisfy the @wire-check-exempt banner (lines 13-17) by adding the real caller.',
  'Extend generateReviewPacket() return object (line 173-179) with verdictTable + adherenceScore (+ ESCALATED disposition), keep the fixture-venture skip guard, and add a matching field to buildReviewDiff() so packet diffs surface score/verdict changes.',
  'Verdict-table persistence already exists (post_build_verdicts, Child B) — this is a READ+surface task, not new schema; decide adherence_score persistence location (packet field vs a durable column/row S20PauseController can also read) explicitly in PLAN.',
  'MarketLens two-commit contrast (87c72ad high / 35353c5 near-zero) only appears if each commit is reduced to a distinct post_build_verdicts snapshot (scoreVerdictTable reads DB rows, not the git tree). Specify the walk/seed mechanism per commit, and confirm MarketLens is not fixture-guarded out of the packet.',
  'Loud below-threshold flagging must reuse existing completion-flag / chairman_decisions mechanisms (buildEscalationPacket already yields the frozen 3 dispositions descope-as-known-gap / pivot-the-artifact / hold-launch) — do not invent a new escalation surface.'
];

const recommendations = [
  'PLAN: wire runConvergenceLoop(supabase,{ventureId,...}) into the worker\'s S19->S20 build-complete path (near _isLeoBridgeBuildComplete / the S20 pause decision) as the single integration seam; treat status===ESCALATED as a below-threshold hold signal routed through the existing chairman_decisions/completion-flag path.',
  'PLAN: extend lib/eva/chairman-product-review.js generateReviewPacket() to attach {verdictTable (from post_build_verdicts), adherenceScore (from scoreVerdictTable/runConvergenceLoop.scoreResult.mean + per-dim), escalationDispositions when ESCALATED}, and extend buildReviewDiff() to diff those; preserve the fixture-venture skip.',
  'PLAN: define the adherenceScore persistence location so BOTH S20PauseController and generateReviewPacket can read it (a durable field/row is preferable to recomputing in two places); reuse post_build_verdicts for the verdict table rather than a new table.',
  'PLAN: specify the MarketLens smoke-test procedure — how commits 87c72ad and 35353c5 each become a distinct post_build_verdicts snapshot (re-run runArtifactWalk per checked-out tree, or seeded fixtures) — and the expected assertions (high vs near-zero user_story_coverage + persona_surface_coverage).',
  'EXEC: supply the injected remediation callbacks (backfillFn / createQuickFixFn / createSdFn) wired to scripts/leo-create-sd.js + scripts/create-quick-fix.js per Child C\'s design, and remove the convergence-loop.js @wire-check-exempt banner once the real caller lands so the wire-check gate covers it.'
];

const summary = 'LEAD-phase VALIDATION PASS (confidence 90) for Child D (S19->S20 Gate Wiring + Chairman Packet + MarketLens Live-run). All requested checks confirmed. MECHANISM INVENTORY: exactly THREE existing S19->S20-adjacent mechanisms exist and the set is COMPLETE (no fourth) — (1) stage-execution-worker.js _isLeoBridgeBuildComplete()/_checkBuildPending() [S19 hard-gate + S20 pause]; (2) reality-gates.js evaluateRealityGate() + gate_boundary_config table; (3) lifecycle/exit-gate-verifiers.js GATE_VERIFIERS/resolveVerifier consumed by exit-gate-enforcer.js checkExitGates (invoked from stage-execution-engine.js:61). The SD\'s claim of a third mechanism (exit-gate-verifiers, headered "Exit-gate verifier map for the Stage 19->20 enforcer", authored under SD-LEO-FEAT-STAGE-BUILD-REPLIT-001) is ACCURATE; nuance — the enforcer is method-agnostic + LEO_S19_EXIT_GATE_ENFORCER-flag-gated, its Replit-effective scoping arises from declared gate strings + the S20PauseController replit_agent short-circuit (s20-pause-controller.js:65-66). CHILD C CALLABLE CONFIRMED: lib/eva/convergence-loop.js exports async runConvergenceLoop(supabase,{ventureId,rubricKey,maxCycles=3,perCycleCap=5,backfillFn,createQuickFixFn,createSdFn,isArtifactChairmanApproved}) -> {status:PASS|ESCALATED,cycles,scoreResult,escalationPacket?,remediationHistory}; it carries a @wire-check-exempt banner naming THIS SD as its intended real caller and requires INJECTED remediation callbacks. generateReviewPacket() CONFIRMED (chairman-product-review.js:154) returning {skipped,ventureName,access,guidedTour,surfacesInventory} — extend with verdictTable+adherenceScore and mirror in buildReviewDiff(); keep fixture-venture guard. NO existing/partial wiring (convergence engine referenced by NONE of the three mechanisms or the packet today) and NO duplicate/overlapping SD (only parent + siblings A/B/C/E). Verdict-table substrate already exists (post_build_verdicts, Child B) so persistence is READ+surface, not new schema. Six guardrails routed to PLAN (extend-one-not-four seam choice; injected callbacks + remove wire-exempt; packet+diff extension; adherence_score persistence location; MarketLens per-commit snapshot mechanism; reuse existing escalation surface). None block LEAD-TO-PLAN.';

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
    confidence: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
      dependency_sd_keys: [
        'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A (completed)',
        'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B (completed)',
        'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C (completed)'
      ],
      mechanism_inventory: {
        count: 3,
        complete_no_fourth: true,
        mechanisms: [
          { file: 'lib/eva/stage-execution-worker.js', entrypoints: ['_isLeoBridgeBuildComplete (line ~4045)', '_checkBuildPending (line ~4451)'], role: 'S19 hard-gate (via shouldHoldAtS19/classifyBridgeOutcome) + S20 build-pending pause; adjacent to S20PauseController + chairman packet — BEST-FIT wiring seam' },
          { file: 'lib/eva/reality-gates.js', entrypoints: ['evaluateRealityGate (line 197)', '_loadBoundaryFromDB (line ~84)'], role: 'transition-boundary config resolution against public.gate_boundary_config (BOUNDARY_CONFIG fallback)' },
          { file: 'lib/eva/lifecycle/exit-gate-verifiers.js', entrypoints: ['GATE_VERIFIERS', 'resolveVerifier'], consumer: 'lib/eva/lifecycle/exit-gate-enforcer.js checkExitGates (line 64), invoked by lib/eva/stage-execution-engine.js:61', role: 'per-gate-string satisfied:boolean verifier registry; headered "Stage 19->20 enforcer" (SD-LEO-FEAT-STAGE-BUILD-REPLIT-001); flag-gated LEO_S19_EXIT_GATE_ENFORCER, method-agnostic; Replit-effective via declared gate strings + S20PauseController replit short-circuit' }
        ]
      },
      exit_gate_verifiers_replit_claim: 'VERIFIED ACCURATE with nuance — file IS wired at S19->20 boundary and authored for the Replit flow, but enforcer is env-flag-gated + build_method-agnostic; effective Replit-scoping comes from stage gate-string declarations + S20PauseController build_method===replit_agent short-circuit (s20-pause-controller.js line 65-66, status "replit_path")',
      child_c_callable: {
        export: 'runConvergenceLoop',
        location: 'lib/eva/convergence-loop.js line 199 (also default export)',
        signature: 'async runConvergenceLoop(supabase, {ventureId, rubricKey=\'post_build_adherence_v1\', maxCycles=3, perCycleCap=5, backfillFn, createQuickFixFn, createSdFn, isArtifactChairmanApproved=false})',
        returns: '{status:\'PASS\'|\'ESCALATED\', cycles, scoreResult, escalationPacket?, remediationHistory}',
        also_exports: ['computeDeficit', 'classifyGaps', 'backfillCompletenessGap', 'classifyRemediationTier', 'fileAdherenceFix', 'routeRemediation', 'buildEscalationPacket', 'ESCALATION_DISPOSITIONS', 'DEFAULT_MAX_CYCLES', 'DEFAULT_PER_CYCLE_CAP'],
        wire_check_exempt_banner: 'lines 13-17 — names THIS SD (Child D) as intended real caller; Child D must add caller + remove/satisfy exemption',
        injected_callbacks_required: ['backfillFn (completeness backfill, circularity-guarded)', 'createQuickFixFn (tier1/2 adherence fixes)', 'createSdFn (tier3 adherence fixes)']
      },
      generate_review_packet: {
        location: 'lib/eva/chairman-product-review.js line 154',
        signature: 'async generateReviewPacket(supabase, ventureId, logger=console)',
        returns_skipped: '{skipped:true, reason:\'fixture_venture\'} when isFixtureVenture',
        returns_packet: '{skipped:false, ventureName, access:{mode,instructions}, guidedTour:[{stop,note}], surfacesInventory:[{surface,present,detail}]}',
        siblings: ['requestProductReview (line 242)', 'recordProductReviewVerdict (line 294)', 'buildReviewDiff (line 189, pure diff — extend for score/verdict)'],
        constants: { PRODUCT_REVIEW_STAGE: 23, PRODUCT_REVIEW_DECISION_TYPE: 'product_review' },
        extension_point: 'add verdictTable + adherenceScore (+ escalation disposition when ESCALATED) to return object at line 173-179; mirror in buildReviewDiff; preserve fixture guard'
      },
      existing_partial_wiring: 'NONE — convergence engine referenced by none of the 3 mechanisms nor the packet; only consumers are convergence-loop.js itself, adherence-scorer.js, tests/unit/eva/convergence-loop.test.js, and 3 Child-C one-off scripts. Greenfield integration.',
      duplicate_sd_check: 'NONE — only parent SD-LEO-INFRA-POST-BUILD-ARTIFACT-001 (in_progress) + siblings A/B/C (completed) + E (draft, Synthetic-Persona Journey Walk). No overlapping in-flight SD for the S19->S20 wiring.',
      verdict_table_persistence: {
        table: 'post_build_verdicts (Child B — database/migrations/20260704_create_post_build_verdicts.sql)',
        note: 'current-snapshot-only; uq_post_build_verdicts_item UNIQUE(venture_id,artifact_type,claim_ref); already written by post-build-verdict-engine.js. Persisting the verdict table is READ+surface, not new schema. adherence_score persistence location is a PLAN decision (packet field vs durable column both S20PauseController + packet read).'
      },
      marketlens_smoke_test: {
        commits: { high_expected: '87c72ad (current-main)', near_zero_expected: '35353c5 (pre-recovery)' },
        caveat: 'scoreVerdictTable reads post_build_verdicts (DB rows), not the git tree — PLAN must reduce each commit to a distinct verdict snapshot (re-run runArtifactWalk per checked-out tree or seed fixtures). Confirm MarketLens ventureId + that it is not fixture-guarded out of generateReviewPacket.'
      }
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
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
