#!/usr/bin/env node
/**
 * One-off: Write RISK sub-agent LEAD-phase verdict (Q6 of the 9-question strategic
 * gate) for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D ("S19->S20 Gate Wiring +
 * Chairman Packet Attachment + MarketLens Live-run") ahead of LEAD-TO-PLAN.
 *
 * Child D of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001.
 * Grounded against the live tree in the worktree (stage-execution-worker.js seams,
 * convergence-loop.js callback semantics, chairman-product-review.js insert path)
 * and a live ventures-table query for the MarketLens rows.
 *
 * Canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'ee07a103-dfcc-4cc9-9b3c-fece6534cf4c';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D';

const findings = [
  {
    id: 'R1-blast-radius-shared-worker-seam',
    domain: 'integration_risk',
    score: 6,
    severity: 'MEDIUM',
    summary: 'BLAST RADIUS — wiring a below-threshold HOLD into the shared S19->S20 seam (stage-execution-worker.js _isLeoBridgeBuildComplete, ~6 call sites: L692 hard-gate, L705 recheck, L735/L1536/L1557 sync gates, L2538 _advanceStage backstop) could over-block unrelated in-flight ventures. PARTIALLY SELF-CONTAINED ALREADY: _isLeoBridgeBuildComplete returns null (skip) for build_model!==\'leo_bridge\' (L4055), and the S19 non-clone auto-approve path is further gated on isConvergenceSubject() (L3638-3641). So non-leo_bridge ventures and leo_bridge non-convergence-subjects already fall through. RESIDUAL RISK: if the new adherence-score gate is applied to ALL leo_bridge ventures rather than ONLY convergence-subjects, a false below-threshold score would hold a venture at S19->S20 that should have proceeded. The worker also already WRITES stage_status=\'blocked\' to venture_stage_work in _checkBuildPending (L4491 upsert), so a new blocking condition here has real durable side effects on the venture pipeline, not just an in-memory decision.'
  },
  {
    id: 'R2-marketlens-wrong-uuid-live-mutation',
    domain: 'data_migration_risk',
    score: 6,
    severity: 'MEDIUM-HIGH',
    summary: 'WRONG-VENTURE / LIVE-MUTATION HAZARD CONFIRMED EMPIRICALLY. A live ventures query on name ILIKE \'%MarketLens%\' returns TWO rows sharing seeded_from_venture_id 849cd2bd: (1) ecbba50e-3c98-4493-9e77-1719cf6b6f00 orchestrator_state=\'failed\', build_model=\'leo_bridge\' (the INTENDED target), and (2) 4e710bb2-d521-4154-85f4-37300761b090 orchestrator_state=\'blocked\', build_model=null (the stale/other MarketLens). A NAME-based lookup in the smoke script would be non-deterministic and could operate on the wrong row. Because the worker path mutates real venture_stage_work rows and orchestrator_state, a live proof-run that writes could corrupt a real venture pipeline. The near-zero 35353c5 leg is the dangerous one (it exercises the HOLD/escalation/remediation branches).'
  },
  {
    id: 'R3-alert-fatigue-false-positive-chairman-decisions',
    domain: 'ui_ux_risk',
    score: 4,
    severity: 'MEDIUM',
    summary: 'ALERT-FATIGUE / TRUST-EROSION RISK. chairman-product-review.js requestProductReview()/recordProductReviewVerdict() insert into chairman_decisions (L326/L304). A false-positive low-adherence score on a genuinely-fine venture would mint a spurious chairman decision and erode trust in the escalation channel. MITIGATING STRUCTURE ALREADY PRESENT: the convergence loop only ESCALATES after maxCycles(=3) fail to converge AND monotone-trend early-exit (runConvergenceLoop L221-233), so a transient dip does not immediately escalate; and the design routes through the SAME existing chairman_decisions review surface (no separate/new alert channel). RESIDUAL: a systematically mis-tuned rubric threshold would produce steady false escalations; the live smoke run itself must NOT write chairman_decisions rows for a test venture.'
  },
  {
    id: 'R4-remediation-callbacks-autofile-real-sd-qf',
    domain: 'technical_complexity',
    score: 5,
    severity: 'MEDIUM',
    summary: 'AUTO-FILE-DURING-SMOKE RISK — real but naturally mitigable. runConvergenceLoop -> routeRemediation -> fileAdherenceFix will call createSdFn (tier-3) / createQuickFixFn (tier-1/2) / backfillFn for each below-threshold gap. VERIFIED SEMANTICS: fileAdherenceFix THROWS if the required callback is absent (convergence-loop.js L121-130); routeRemediation wraps each gap in try/catch (L150-164) and on throw pushes to errors+deferred and FILES NOTHING. Therefore a smoke run that OMITS the callbacks (or injects no-ops returning sentinel ids) cannot auto-file SDs/QFs. THE DANGER IS SPECIFIC: if EXEC runs the live proof-run against the near-zero 35353c5 fixture WITH the REAL production callbacks wired (createSdFn->scripts/leo-create-sd.js, createQuickFixFn->scripts/create-quick-fix.js), the below-threshold gaps WOULD auto-file spurious SDs/QFs into the live backlog (perCycleCap default 5 x up to maxCycles 3). This is entirely a smoke-harness discipline issue, not a defect in Child C.'
  },
  {
    id: 'R5-mitigations',
    domain: 'meta',
    score: 0,
    severity: 'INFO',
    summary: 'MITIGATIONS (one per risk, all low-effort, all consistent with existing patterns) — see the recommendations[] array. Net: feature-flag + convergence_subject scoping (R1), UUID-pin + read-only dry-run + build_model assertion (R2), no-write smoke + reuse-single-surface + threshold review (R3), explicit no-op/dry-run callbacks + zero-write assertion (R4).'
  }
];

const warnings = [
  'R1: scope the new below-threshold HOLD to build_model===\'leo_bridge\' AND isConvergenceSubject() ONLY (the natural predicate already used at L3638) — do NOT apply the adherence gate to all leo_bridge ventures, or unrelated in-flight builds can be wrongly held at S19->S20.',
  'R2: the live MarketLens smoke MUST pin ventureId ecbba50e-3c98-4493-9e77-1719cf6b6f00 by UUID literal (never name ILIKE — two MarketLens rows exist) and assert build_model===\'leo_bridge\' before running.',
  'R2/R3: run the MarketLens proof in read-only/dry-run mode — no writes to venture_stage_work, orchestrator_state, or chairman_decisions for the test venture.',
  'R4: the smoke harness MUST inject no-op/dry-run remediation callbacks (or omit them so fileAdherenceFix throws->deferred) and assert ZERO new rows in strategic_directives_v2 / quick_fixes across the run; belt-and-suspenders perCycleCap=0 or maxCycles=1 for the near-zero leg.',
  'Introduce the new gate behind an env feature-flag defaulting fail-OPEN, matching the existing LEO_S19_EXIT_GATE_ENFORCER / VISION_*_STRICT flag pattern, so it can be disabled instantly if it over-blocks the shared pipeline in production.'
];

const recommendations = [
  'R1 (blast radius): gate the new adherence HOLD on (build_model===\'leo_bridge\' && convergence_subject) and put it behind a fail-OPEN env feature-flag (e.g. LEO_S19_ADHERENCE_GATE, default OFF/open); default to advance (fail-open) on any scorer error or absent verdict so a scoring failure never blocks an unrelated venture.',
  'R2 (wrong UUID / live mutation): hard-code ventureId=ecbba50e-3c98-4493-9e77-1719cf6b6f00 in the smoke script, assert name===\'MarketLens\' && build_model===\'leo_bridge\' as a guard, and run the proof-run in a READ-ONLY / dry-run mode that computes score+packet WITHOUT writing venture_stage_work / orchestrator_state / chairman_decisions.',
  'R3 (alert fatigue): keep escalation on the SINGLE existing chairman_decisions review surface (no new channel), only escalate on status===ESCALATED after the loop\'s own maxCycles convergence check, dedupe via post_build_verdicts uniqueness, and ensure the live smoke run does NOT mint a chairman decision for the test venture; review the post_build_adherence_v1 threshold against the 87c72ad high-score baseline before enabling in production.',
  'R4 (auto-file): the MarketLens smoke MUST pass explicit no-op/dry-run remediation callbacks (backfillFn/createQuickFixFn/createSdFn returning a sentinel id and writing nothing) — the near-zero 35353c5 leg would otherwise auto-file spurious SDs/QFs; add a pre/post assertion that COUNT(strategic_directives_v2)+COUNT(quick_fixes) is unchanged, and reserve the REAL callbacks for the production wiring path only.',
  'PLAN/EXEC: add a regression assertion that a normal (non-convergence-subject) leo_bridge venture and a non-leo_bridge venture BOTH still advance S19->S20 unchanged after the wiring, proving the blast radius is contained.'
];

const summary = 'LEAD-phase RISK verdict (Q6 of 9) for Child D — OVERALL MEDIUM, PASS (does NOT block LEAD-TO-PLAN; mitigations carried to PLAN/EXEC as requirements). Domain scores: technical_complexity 5, security 2 (no auth/creds/RLS/schema-change — post_build_verdicts already exists), performance 3 (bounded loop maxCycles=3 + a few DB reads per venture at the S19 boundary), integration 6, data_migration 4 (no DDL; live venture-row mutation hazard), ui_ux 4. NO CRITICAL/HIGH domain. (1) BLAST RADIUS (MEDIUM/6): the shared _isLeoBridgeBuildComplete seam has ~6 worker call sites and _checkBuildPending already durably writes stage_status=blocked, but is partly self-contained — it returns null for non-leo_bridge ventures (L4055) and the auto-approve path is convergence_subject-gated (L3638); residual over-block risk only if the score gate is applied to ALL leo_bridge ventures. (2) WRONG-UUID/LIVE-MUTATION (MEDIUM-HIGH): CONFIRMED two live MarketLens rows — target ecbba50e (failed, leo_bridge) vs stale 4e710bb2 (blocked, build_model=null) — name lookup is ambiguous; must UUID-pin + dry-run. (3) ALERT FATIGUE (MEDIUM/4): chairman_decisions insert path is real but escalation only fires post-convergence-failure on the single existing surface. (4) AUTO-FILE (MEDIUM/5): VERIFIED routeRemediation try/catches a missing-callback throw and files NOTHING, so omitting/no-op-ing callbacks is safe; danger is only if EXEC runs the near-zero 35353c5 leg with REAL createSdFn/createQuickFixFn wired. Five concrete mitigations recorded: feature-flag + convergence_subject scoping; UUID-pin + read-only dry-run; single-surface + threshold review + no test-venture decision write; explicit no-op/dry-run callbacks + zero-write assertion; plus a blast-radius regression assertion. All grounded against the live worktree tree and a live ventures query.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RISK',
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
      gate_question: 'Q6 of 9 — RISK (LEAD strategic validation)',
      overall_risk: 'MEDIUM',
      domain_scores: {
        technical_complexity: 5,
        security_risk: 2,
        performance_risk: 3,
        integration_risk: 6,
        data_migration_risk: 4,
        ui_ux_risk: 4,
      },
      grounding: {
        seam_file: 'lib/eva/stage-execution-worker.js',
        seam_entrypoints: {
          _isLeoBridgeBuildComplete: 'L4045; returns null for build_model!==leo_bridge (L4055); call sites L692,705,735,1536,1557,2538',
          _checkBuildPending: 'L4450; durably upserts venture_stage_work stage_status=blocked (L4491)',
          convergence_subject_gate: 'isConvergenceSubject() at L3638-3641 (auto-approve eligibility predicate)'
        },
        convergence_callbacks: {
          file: 'lib/eva/convergence-loop.js',
          semantics: 'fileAdherenceFix THROWS on missing createSdFn/createQuickFixFn (L121-130); routeRemediation try/catch (L150-164) -> throw becomes errors+deferred, files nothing; runConvergenceLoop maxCycles default 3, perCycleCap default 5, monotone early-exit L221-233',
          safe_smoke_path: 'omit callbacks OR inject no-ops -> zero SD/QF filed'
        },
        chairman_decisions_insert: 'lib/eva/chairman-product-review.js requestProductReview L242 / recordProductReviewVerdict L294 -> chairman_decisions insert L304/L326',
        marketlens_live_rows: [
          { id: 'ecbba50e-3c98-4493-9e77-1719cf6b6f00', name: 'MarketLens', orchestrator_state: 'failed', build_model: 'leo_bridge', role: 'INTENDED smoke target — pin by UUID' },
          { id: '4e710bb2-d521-4154-85f4-37300761b090', name: 'MarketLens', orchestrator_state: 'blocked', build_model: null, role: 'STALE duplicate — name lookup ambiguity hazard' }
        ]
      },
      blocking_criteria: 'MEDIUM overall — does NOT block LEAD-TO-PLAN; five mitigations become PLAN/EXEC requirements. No HIGH/CRITICAL domain present.'
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RISK',
    SD_ID,
    { name: 'Risk Assessment Sub-Agent (risk-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('RISK VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
