#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent LEAD-phase verdict for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C ("Adherence Rubric Scoring + Convergence Loop")
 * ahead of its LEAD-TO-PLAN handoff.
 *
 * Child C of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001. Depends on:
 *   - Child A (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A, completed/merged) — shipped
 *     adherence_rubrics table + seeded post_build_adherence_v1 rubric row.
 *   - Child B (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B, completed/merged) — shipped
 *     lib/eva/post-build-verdict-engine.js (runArtifactWalk / computeDisposition /
 *     upsertVerdict) writing per-item rows to post_build_verdicts.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + the canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) rather than a
 * hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '18129ef6-5615-468e-b8da-d99f9833b213';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-C';

const findings = [
  {
    id: 'F1-child-a-rubric-input-present-and-usable',
    severity: 'INFO',
    summary: 'Child A input CONFIRMED usable. database/migrations/20260704_create_adherence_rubrics.sql creates adherence_rubrics and seeds row rubric_key=post_build_adherence_v1 (version 1, status=published) whose dimensions jsonb contains EXACTLY the 4 dimensions Child C scores — user_story_coverage, persona_surface_coverage, data_model_fidelity, architecture_conformance — each with scale "1-5", evidence_required=true, and a full behavioral_anchors map keyed "1".."5". dimension_floor=3, mean_floor=4, zero_unscored_fails=true match the chairman-ratified frozen pass bar in Child C\'s scope verbatim (every dim>=3 AND mean>=4 AND zero unscored). Table has NO dimension-name restriction (unlike leo_scoring_rubrics\' hard-coded 6-key trigger) so the 4-dim set is accepted. Immutable-via-trigger + supersedes chain means Child C reads a stable, versioned rubric — it should SELECT the published row by rubric_key and never mutate it.'
  },
  {
    id: 'F2-child-b-verdict-output-shape-present-and-usable',
    severity: 'INFO',
    summary: 'Child B input CONFIRMED usable. lib/eva/post-build-verdict-engine.js exports runArtifactWalk(supabase,{ventureId,throughStage}) returning Array<{artifactType, claimRef, disposition}> and upserting one row per enumerated item to post_build_verdicts with the frozen 5-value disposition taxonomy (BUILT / PARTIAL / MISSING / DEVIATED_WITH_DOCUMENTED_REASON / DEVIATED_UNDOCUMENTED, exported as DISPOSITIONS). computeDisposition() and upsertVerdict() are also exported and directly callable. This is a clean, stable per-item disposition feed for Child C\'s scorer: Child C maps a set of dispositions per dimension -> a 1-5 anchored score. No adapter/shape-translation is required; Child C consumes runArtifactWalk\'s return (or reads post_build_verdicts rows) directly.'
  },
  {
    id: 'F3-no-duplicate-adherence-scorer-or-convergence-executor',
    severity: 'INFO',
    summary: 'NO DUPLICATE exists. Swept lib/ + scripts/ for adherence/rubric dimension-scoring and convergence-loop logic. (a) adherence_rubrics has ZERO JS consumers today (only tests + Child-A one-off seeders reference it) — Child C is its first consumer. (b) post_build_verdicts is consumed only by Child B\'s own engine — Child C is its first downstream reader, no collision. (c) No existing code reads disposition rows (BUILT/PARTIAL/MISSING/DEVIATED_*) and emits behaviorally-anchored 1-5 per-dimension scores against a rubric. Closest adjacent code (lib/eva/blueprint-scoring/quality-scorer.js, lib/eva/taste-gate-scorer.js, lib/quickfix-compliance-rubric.js, lib/sub-agents/vetting/rubric-evaluator.js) scores DIFFERENT inputs on DIFFERENT scales (blueprint content 0-100 heuristics; taste 1-5 on pre-computed scores; QF 100-pt compliance; LLM-judged proposals 0-100) and none consume verdict rows. No in-flight duplicate SD found: only the parent orchestrator and siblings A/B match the terminology.'
  },
  {
    id: 'F4-remediation-routing-targets-present-and-usable',
    severity: 'INFO',
    summary: 'Both convergence-loop remediation-routing targets CONFIRMED present + usable. scripts/leo-create-sd.js (executable, shebang node) is invokable as a CLI AND exports many functions (mapProposalToCreateArgs, validateProposalShape, scoreSDAtConception, etc.) enabling clean programmatic invocation from the loop for adherence-gap fix SDs. scripts/create-quick-fix.js (executable, shebang node) is a documented CLI accepting --title/--type/--severity/--description/--estimated-loc for adherence-gap fix QFs. The convergence loop\'s adherence-gap branch (file fix SD/QF) has working targets; PLAN should pick programmatic-import vs child-process invocation and specify idempotency (do not re-file a fix SD/QF for the same unresolved gap across cycles).'
  },
  {
    id: 'F5-reusable-convergence-atoms-prefer-reuse-over-reinvent',
    severity: 'WARNING',
    summary: 'REUSE opportunity — do NOT reinvent trend/convergence math. No generic "iterate up to N cycles -> re-measure -> monotone/convergence early-exit -> escalate on exhaustion" executor exists (all candidates are domain-bound: lib/coordinator/convergence-breakers.js, convergence-ledger.js, lib/eva/clean-clone/convergence-sandbox.js, lib/vision/rung-health-convergence.mjs, lib/eva/experiments/auto-iteration.js), so Child C\'s loop BODY is legitimately new. BUT reusable pure atoms exist and should be reused: (1) isTrendingDown(series) from lib/coordinator/convergence-ledger.js — a DB-free monotone-non-improvement detector, ideal for the monotone-convergence early-termination; (2) computeCatchRateConvergence() from lib/vision/rung-health-convergence.mjs — least-squares slope trend detector; (3) withRetry() from lib/eva/stage-zero/data-pollers/retry.js — generic cap+backoff for transient DB/LLM resilience INSIDE a cycle (retries on thrown errors only, not a measure-driven loop). Additionally, per SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001, the loop SHOULD declare itself via lib/loops/loop-contract.js (goals/workflow/boundaries/budget) so the 3-cycle cap + escalation packet are self-describing and auditable rather than opaque inline constants. Pattern references for the scorer: taste-gate-scorer.js already does 1-5 mean-vs-threshold + per-dim floor (borrow shape, not code); rubric-evaluator.js has an LLM-judge + schema-validate + repair-retry skeleton if reason-quality judgment goes LLM-based.'
  },
  {
    id: 'F6-completeness-vs-adherence-remediation-split-guardrails',
    severity: 'WARNING',
    summary: 'Scope guardrails for the two-branch convergence loop (advisory to PLAN, non-blocking). Child C\'s spec routes completeness gaps (MISSING/PARTIAL) to upstream backfill (retroactive=true stamping + circularity guard) and adherence gaps to fix SD/QF filing. The circularity guard is essential: backfill "from upstream sources only" must not read from the very artifact/verdict rows the walk is scoring (see the codebase idempotency lesson: never read input from the row you are mutating). PLAN must specify (a) what counts as an "upstream source" per dimension, (b) that retroactive=true rows are excluded from the next rescore\'s could-not-verify accounting to avoid a self-satisfying loop, and (c) an idempotency key so re-running a cycle does not double-file fix SDs/QFs or double-stamp backfills.'
  }
];

const warnings = [
  'Do not reinvent trend/convergence math — reuse isTrendingDown() (lib/coordinator/convergence-ledger.js) and/or computeCatchRateConvergence() (lib/vision/rung-health-convergence.mjs) for the monotone-convergence early-termination; use withRetry() only for transient in-cycle DB/LLM resilience, not as the measure-driven loop.',
  'Declare the 3-cycle bounded loop via lib/loops/loop-contract.js (SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001) so cap + escalation-on-exhaustion are self-describing/auditable, not opaque inline constants.',
  'Circularity guard for completeness backfill must be explicit in PLAN: upstream-source-only reads, retroactive=true rows excluded from the next rescore accounting, and an idempotency key so re-running a cycle never double-files fix SDs/QFs or double-stamps backfills.',
  'adherence_rubrics rows are immutable and versioned; Child C must SELECT the published post_build_adherence_v1 row by rubric_key and treat thresholds as read-only data, never hard-code 3/4/true in the scorer (single source of truth = the seeded row).'
];

const recommendations = [
  'PLAN: build a small purpose-built convergence loop as thin glue over existing pure atoms (isTrendingDown / computeCatchRateConvergence / withRetry) + a loop-contract declaration, rather than a bespoke trend implementation.',
  'PLAN: consume Child B via runArtifactWalk() return value (or a direct post_build_verdicts read); map dispositions -> 1-5 per-dimension score; read floors from the seeded adherence_rubrics.post_build_adherence_v1 row rather than hard-coding.',
  'PLAN: choose programmatic-import vs child-process invocation for scripts/leo-create-sd.js and scripts/create-quick-fix.js, and specify the per-gap idempotency key that prevents duplicate fix SD/QF filing across the up-to-3 cycles.',
  'PLAN: specify per-dimension the legitimate "upstream sources" for completeness backfill, the circularity guard (no reading the row being scored / retroactive rows excluded from rescore accounting), and the exact 3-disposition escalation packet contract (descope-as-known-gap / pivot-the-artifact / hold-launch) emitted on exhaustion.',
  'EXEC: borrow the mean-vs-threshold + per-dimension-floor SHAPE from lib/eva/taste-gate-scorer.js (already 1-5) and, if reason-quality judgment goes LLM-based, the schema-validate + repair-retry skeleton from lib/sub-agents/vetting/rubric-evaluator.js — as pattern references, not copied code.'
];

const summary = 'LEAD-phase VALIDATION PASS (confidence 88) for Child C (Adherence Rubric Scoring + Convergence Loop). All 4 requested checks confirmed. (1) NO duplicate: no existing code scores post_build_verdicts dispositions on a 1-5 anchored rubric; adherence_rubrics and post_build_verdicts each have zero downstream JS consumers today, so Child C is the first consumer of both — no collision, no in-flight duplicate SD. (2) Inputs present + directly usable: Child A\'s adherence_rubrics seeds post_build_adherence_v1 with exactly the 4 dimensions (each 1-5 with behavioral_anchors) and the frozen floors (dim>=3, mean>=4, zero_unscored_fails=true); Child B\'s post-build-verdict-engine.js exports runArtifactWalk/computeDisposition/upsertVerdict with the 5-value disposition taxonomy — no adapter needed. (3) Remediation targets present + usable: scripts/leo-create-sd.js (CLI + exported functions) and scripts/create-quick-fix.js (documented --title/--type/--severity CLI) both exist and are invokable by the convergence loop. (4) Reuse-over-reinvent flagged: no generic cap+re-measure+monotone-early-exit executor exists (loop body is legitimately new) BUT the trend/convergence math should reuse isTrendingDown() (convergence-ledger.js) / computeCatchRateConvergence() (rung-health-convergence.mjs), withRetry() for transient in-cycle resilience, and a loop-contract declaration; taste-gate-scorer.js (1-5 mean+floor) and rubric-evaluator.js (schema-validate+repair-retry) are scorer pattern references. Two non-blocking guardrails routed to PLAN: (a) circularity guard + idempotency for the completeness-backfill vs adherence-fix split; (b) read floors from the seeded rubric row, never hard-code them. None of these block LEAD-TO-PLAN.';

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
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
      dependency_sd_keys: [
        'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A (completed_and_merged)',
        'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B (completed_and_merged)'
      ],
      checks: {
        duplicate_adherence_scorer: 'NONE FOUND — no code maps disposition rows to 1-5 anchored dimension scores',
        duplicate_convergence_executor: 'NONE FOUND — no generic cap+re-measure+monotone-early-exit+escalate loop exists',
        child_a_rubric_input: 'CONFIRMED — adherence_rubrics seeds post_build_adherence_v1 with 4 dims + floors matching frozen pass bar',
        child_b_verdict_output: 'CONFIRMED — post-build-verdict-engine.js exports runArtifactWalk/computeDisposition/upsertVerdict + 5-value DISPOSITIONS',
        remediation_targets: 'CONFIRMED usable — scripts/leo-create-sd.js (CLI + exports) + scripts/create-quick-fix.js (CLI)',
        reusable_infrastructure: 'REUSE isTrendingDown (convergence-ledger.js), computeCatchRateConvergence (rung-health-convergence.mjs), withRetry (data-pollers/retry.js), loop-contract.js; scorer pattern refs taste-gate-scorer.js + rubric-evaluator.js'
      },
      adherence_rubric_seeded_row: {
        rubric_key: 'post_build_adherence_v1',
        version: 1,
        status: 'published',
        dimensions: ['user_story_coverage', 'persona_surface_coverage', 'data_model_fidelity', 'architecture_conformance'],
        scale: '1-5 with behavioral_anchors keyed 1..5',
        dimension_floor: 3,
        mean_floor: 4,
        zero_unscored_fails: true,
        immutable: 'BEFORE UPDATE/DELETE trigger; version via supersedes_rubric_id chain'
      },
      child_b_engine_exports: ['DISPOSITIONS', 'enumerateRequiredArtifacts', 'checkCompleteness', 'resolveVentureRepoPath', 'extractUserStoryClaims', 'findEvidenceForClaim', 'computeDisposition', 'upsertVerdict', 'runArtifactWalk'],
      disposition_taxonomy: ['BUILT', 'PARTIAL', 'MISSING', 'DEVIATED_WITH_DOCUMENTED_REASON', 'DEVIATED_UNDOCUMENTED'],
      reusable_atoms: {
        monotone_early_exit: 'isTrendingDown(series) — lib/coordinator/convergence-ledger.js (DB-free, total)',
        trend_slope: 'computeCatchRateConvergence() — lib/vision/rung-health-convergence.mjs (least-squares slope)',
        transient_retry: 'withRetry(fn,{maxRetries,timeoutMs,baseDelayMs}) — lib/eva/stage-zero/data-pollers/retry.js (thrown-error retry only, NOT measure-driven)',
        loop_declaration: 'lib/loops/loop-contract.js — declare 3-cycle bounded loop (SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001)',
        scorer_pattern_refs: ['lib/eva/taste-gate-scorer.js (1-5 mean-vs-threshold + per-dim floor)', 'lib/sub-agents/vetting/rubric-evaluator.js (schema-validate + repair-retry LLM-judge skeleton)']
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
