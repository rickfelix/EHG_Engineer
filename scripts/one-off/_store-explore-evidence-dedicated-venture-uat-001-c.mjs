// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- EXPLORE evidence writer (LEAD phase).
// Persists the LEAD-phase integration-surface recon (call sites, gate-dispatch mechanism,
// deviation-ledger, stage-20/21 UAT resolution) to sub_agent_execution_results, required by
// GATE_SUBAGENT_EVIDENCE. Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';
const PHASE = 'LEAD';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Confirmed checkSyntheticActorFencing() (lib/eva/synthetic-actor-guard.js:142) has exactly one BINDING ' +
    'production call site -- lib/eva/stage-execution-worker.js:3134-3135, inside _advanceStage(), hardcoded to ' +
    'fromStage===19 && toStage===20, gated behind leo_feature_flags.LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE (default ' +
    'observe-only) -- and one non-blocking defense-in-depth call at lib/eva/lifecycle/exit-gate-verifiers.js:721 ' +
    '(exit_observe verifier, cannot affect `allowed`). lib/uat/index.js is a pure re-export barrel plus ' +
    'processIntelligentFeedback() -- no lifecycle/hook/gating concept exists in it, and it is already stale: ' +
    'generateJourneyScenarios (the function the venture pipeline actually calls) is not even exported from it. ' +
    'The generic gate-dispatch machinery (checkExitGates() + GATE_VERIFIERS registry, exit-gate-enforcer.js:141 / ' +
    'exit-gate-verifiers.js:737,781) IS stage-agnostic and extensible by design (header at :11 says new stages ' +
    'extend by appending to GATE_VERIFIERS) -- but the synthetic-actor-guard BINDING enforcement bypasses that ' +
    'generic machinery entirely, by deliberate design (comments at stage-execution-worker.js:3126-3129 and ' +
    'synthetic-actor-guard.js:29-34: per-venture opt-in semantics do not fit the generic per-stage gate model). ' +
    'Registering a NEW UAT stage as a checkExitGates()-routed gate is straightforward; replicating the actual ' +
    'BINDING enforcement requires a new bespoke fromStage/toStage block, not a drop-in registration. ' +
    'deviation-ledger.js is real and load-bearing elsewhere (stage-artifact-precondition.js, adherence-scorer.js, ' +
    'convergence-loop.js, post-build-verdict-engine.js) but synthetic-actor-guard.js deliberately excludes it as ' +
    'an escape valve on security-posture grounds, not because it is a stale/rejected concept. Resolved the ' +
    'stage-20/21 UAT discrepancy independently (corroborating validation-agent row ca90aaba): the venture-lifecycle ' +
    'stage named "UAT" in the original design spec is Stage 21 ("QA & UAT"), implemented today as Build Review ' +
    '(slug integration-testing); Stage 20 is Security & Performance. SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 is real, ' +
    'shipped code (runVentureJourneyWalk / deriveJourneySteps / venture-step-executors.js), but it is scoped to ' +
    'SD-orchestrator journey validation (stamps strategic_directives_v2.metadata.journey_walk_result, consumed by ' +
    'a PLAN-TO-LEAD prerequisite gate) and separately folds into Stage 20 code-quality as one input finding -- it ' +
    'is not a venture-lifecycle-stage-advancement UAT gate in the checkSyntheticActorFencing sense. No dedicated ' +
    'venture-stage-level UAT gate exists at either stage 20 or 21 today, confirming this SD\'s target (a dedicated, ' +
    'fenced, venture-agnostic UAT execution engine wired as a stage-advancement gate) is genuinely new work.',
  recommendations: [
    'PLAN must design a NEW bespoke fromStage/toStage-style binding block (mirroring stage-execution-worker.js:3122-3178) for the new UAT stage, not assume registering a checkExitGates()/GATE_VERIFIERS entry alone reproduces blocking enforcement.',
    'Reuse the 6 existing control-pack implementations identified by validation-agent (manifest-generator.js, canary-gauge-liveness.mjs, control-seed-test.mjs, quality-analyzer.js assertion-density, factory-defect-recorder.js/gap-class.js, venture-smoke.template.ts) rather than re-authoring the Solomon-C 4-part control pack from scratch.',
    'Explicitly design signed-out journey coverage -- persona today is existing|fresh, both signed-in, and fallbackExecutor forces a sign-in as step 1 of every walked step.',
    'Descope or redesign fence two-sidedness criterion (v) "cannot reach real users" -- exclusion_predicate_ref is validated only by isPlaceholder(), never dereferenced; no mechanism anywhere asserts non-reachability of a venture\'s real end-user surfaces (analytics/billing/email). Recommend scoping to declared-and-asserted-in-the-venture\'s-own-CI rather than a factory-side guarantee.',
    'Do not cite SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 as "not real" or "no landed code" -- it is real and shipped; the correct framing is that its Stage-20 wiring is zero-yield by construction (see validation-agent row ca90aaba, findings H1/H2), which is the stronger argument for replace-or-repair.',
  ],
  metadata: {
    exploration_mode: 'call_site_and_gate_dispatch_recon',
    call_sites_found: {
      checkSyntheticActorFencing: [
        { file: 'lib/eva/stage-execution-worker.js', line: '3134-3135', binding: true, scope: 'fromStage===19 && toStage===20, gated by LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE flag' },
        { file: 'lib/eva/lifecycle/exit-gate-verifiers.js', line: 721, binding: false, scope: 'exit_observe defense-in-depth, cannot affect allowed' },
      ],
    },
    gate_dispatch_generic_but_binding_bespoke: true,
    lib_uat_index_has_hook_point: false,
    lib_uat_index_stale: 'generateJourneyScenarios not exported from index.js; journey-walk-orchestrator.js imports directly from scenario-generator.js',
    deviation_ledger_status: 'real, load-bearing elsewhere; deliberately excluded from synthetic-actor-guard as a security-posture decision, not a rejected concept',
    stage_named_uat_in_design_spec: 21,
    stage_21_implemented_as: 'Build Review (slug: integration-testing)',
    stage_20_implemented_as: 'Security & Performance',
    venture_journey_uat_001_scope: 'SD-orchestrator journey validation + Stage-20 code-quality finding contributor, NOT a venture-stage-advancement gate',
    dedicated_venture_stage_uat_gate_exists_today: false,
    corroborates_sub_agent_row: 'ca90aaba-884f-4455-9103-f5082410edc6',
  },
  execution_time_ms: 420000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'EXPLORE',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('EXPLORE', SD_ID, { name: 'Explore (Claude Code built-in)' }, results, { phase: PHASE, source: 'manual' });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
