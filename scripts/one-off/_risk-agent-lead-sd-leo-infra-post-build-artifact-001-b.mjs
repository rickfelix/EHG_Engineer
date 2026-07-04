#!/usr/bin/env node
/**
 * RISK sub-agent LEAD-phase evidence row for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B ("Artifact Walk + Verdict Table Engine").
 *
 * Answers Q6 (Risk Assessment) of the canonical 9-question LEAD Pre-Approval
 * Gate ahead of this child's LEAD-TO-PLAN handoff. Child B is the second of
 * four children under orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001;
 * depends only on Child A (rubric registry + deviation ledger, merged/completed).
 *
 * Executed from the child's own worktree per task instruction; repo evidence
 * written via the canonical lib/sub-agents/resolve-repo.js helper (never
 * hand-rolled path columns) per CLAUDE.md prologue item 11.
 *
 * Idempotent: deletes any prior LEAD/RISK row for this SD before inserting.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const SD_ID = 'a64c62bd-b42d-406d-8688-9fca3ec154ab';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B';

const overall_risk = 'MEDIUM';
const overall_verdict = 'WARNING';

const critical_issues = [
  'R-1 (verdict-table re-run idempotency): Child A shipped recordDeviation() with is_current:true, colliding with the live partial unique index idx_unique_current_artifact(venture_id, lifecycle_stage, artifact_type, COALESCE(metadata->>\'screenId\',\'__no_screen__\')) WHERE is_current=true -- caught only by adversarial /ship review, fixed same-day (commit f14eceadcd7). Child B\'s verdict table faces the identical failure class: Child D fires the walk at every S19->S20 boundary and Child C\'s convergence loop implies re-runs. PLAN must explicitly decide append-only-history vs. single-current-row for the verdict table BEFORE EXEC, and if single-current, prove any partial-unique-index shape against a REAL second-run insert in a real-DB test (mirroring tests/integration/eva/deviation-ledger-realdb.test.js) -- not discover it adversarially after merge like Child A did.',
  'R-2 (cross-repo scan blast radius / sensitive-data exposure): the engine filesystem-scans an arbitrary, chairman-external venture repo. Verified empirically against MarketLens (applications.local_path=C:/Users/rickf/Projects/_EHG/marketlens, status=active): today only .env.example is present and .gitignore correctly excludes .env/node_modules/dist. But gitignored files still exist on-disk when present, and this engine runs generically across ALL ventures, indefinitely. A naive recursive filesystem walk (unlike a git-tracked-only listing) would traverse any live .env/secrets that exist locally in some other venture. PRD FRs must scope scanning to an explicit directory allowlist (mirroring the DESIGN sub-agent\'s existing precedent: grep -r "style={{" src/components / find src/components -name "*.tsx", i.e. scoped subtrees, not a full-repo walk) plus an explicit denylist (.env*, node_modules, .git, dist, build, .worktrees), and must persist ONLY file-path + line-number evidence references in the durable verdict/evidence rows -- never raw file-content snippets -- so an accidental read of a sensitive file can never leak into a durably-stored, chairman-visible table.',
  'R-3 (evidence-linking false-positive direction): fuzzy keyword/path matching is an acceptable v1 approach (deterministic, auditable, reproducible -- desirable for a durable chairman-facing verdict trail) ONLY IF tuned to fail toward MISSING/PARTIAL on ambiguous matches, never toward BUILT. This engine exists to catch the MarketLens zero-UI-despite-planned-surfaces incident; an over-permissive matcher (e.g. naive keyword-overlap counting unrelated files as "evidence") silently reproduces the same failure class in the opposite direction (false BUILT instead of false silence), defeating the SD\'s entire purpose. The SD\'s own Success Criteria retrodiction test (pre-recovery commit must score ~0; current main must score high with linked evidence) is the correct calibration mechanism -- PLAN must treat it as a hard acceptance gate on matcher precision, not an optional smoke test.',
];

const warnings = [
  'W-1 (blueprint_quality_assessments is a poor fit): direct schema inspection (mirroring Child A\'s own successful reuse-rejection methodology on leo_scoring_rubrics/leo_vetting_rubrics) shows blueprint_quality_assessments is SCORING-shaped -- assessment_scores jsonb, overall_score numeric(5,2), gate_decision CHECK IN (\'pass\',\'fail\',\'retry\'), assessor_model, template_id FK to blueprint_templates -- built for Stage-16 pre-build template scoring (lib/eva/blueprint-scoring/persistence.js) and semantically closer to future Child C (rubric scoring) than Child B (binary completeness + 5-way disposition + evidence links; this SD\'s own scope text says artifacts are "never scored" at this stage). Table currently has 0 live rows (low blast radius today if reused), but gate_decision\'s 3-state enum does not natively fit the 5-way disposition vocabulary (BUILT/PARTIAL/MISSING/DEVIATED-WITH-DOCUMENTED-REASON/DEVIATED-UNDOCUMENTED) and its grain (one row per artifact_type per venture) is coarser than Child B\'s need (one row per enumerated item/claim). Recommend a new purpose-built table, following exactly Child A\'s own precedent for adherence_rubrics.',
  'W-2 (test portability): any test depending on a real venture clone at a hardcoded local path (e.g. MarketLens at C:/Users/rickf/Projects/_EHG/marketlens) cannot run in CI, which will not have that directory. Recommend a small synthetic fixture-repo tree under tests/fixtures/ for deterministic matcher unit tests, plus a describeDb-style availability guard (mirroring tests/helpers/db-available.js) for any real-venture-clone integration test so it skips cleanly rather than failing hard when the path is absent.',
  'W-3 (LLM-judgment alternative, if considered later): introduces non-determinism (the same venture could score differently run-to-run, undermining a "durable verdict table") and a prompt-injection surface (venture repo content is external, lower-trust input flowing into a prompt). Not recommended for this child. The SD\'s own scope text already appropriately defers exact-matching-strategy to PLAN without mandating an LLM -- this warning is a guardrail against scope creep toward LLM-judgment in Child B specifically, not a recommendation to add it.',
  'W-4 (novel cross-repo call-site shape): existing precedent (lib/sub-agents/resolve-repo.js registry) resolves a repo for the EXECUTING SD\'s OWN target_application (SD-scoped: e.g. DESIGN sub-agent scans the repo of the SD it is evaluating). Child B is EHG_Engineer-targeted infrastructure code that must additionally resolve an ARBITRARY VENTURE\'s repo at RUNTIME, per the venture being walked (data-scoped, not SD-scoped) -- a valid reuse of resolveRepoPathDbFirst(ventureName, supabase)\'s existing signature, but a new call-site pattern that should explicitly adopt resolveGateRepoContext\'s documented fail-closed contract (resolved:false -> caller MUST fail closed) for the per-venture path, since an unresolvable venture must block/flag that venture\'s walk, never silently skip it or scan the wrong tree.',
];

const recommendations = [
  'PRD FRs must name the artifact-repo scan allowlist (src/, routes/, components/, schema/migrations, tests/) and denylist (.env*, node_modules, .git, dist, build, .worktrees) explicitly -- see R-2.',
  'PRD must specify verdict-table re-run semantics (append-only-history vs. single-current-row) explicitly, and require a real-DB regression test proving the chosen index/constraint shape survives a second run BEFORE EXEC ships it -- see R-1.',
  'Adopt the SD\'s own retrodiction Success Criteria (pre-recovery commit scores ~0; current main scores high with linked evidence) as a hard acceptance gate on matcher precision, not merely a smoke test -- see R-3.',
  'Use resolveRepoPathDbFirst(ventureName, supabase) for per-venture resolution (DB-first via applications.local_path, registry.json fallback) and adopt resolveGateRepoContext\'s fail-closed contract: an unresolvable venture repo must block/flag that venture, never silently pass or fall back to cwd/EHG_Engineer -- see W-4.',
  'Prefer a new purpose-built verdict table over reusing blueprint_quality_assessments, following Child A\'s own adherence_rubrics precedent methodology (inspect real constraints, do not assume column-list similarity implies fit) -- see W-1. If PLAN still opts to reuse it, require an additive discriminator column so Stage-16 consumers are never confused by Child B\'s rows.',
  'Add a tests/fixtures/ synthetic repo tree for deterministic, CI-safe matcher unit tests; gate any test needing a real venture clone behind an availability guard mirroring tests/helpers/db-available.js -- see W-2.',
  'Any migration Child B introduces must be additive-only (CREATE TABLE IF NOT EXISTS, or additive CHECK-widen only) with RLS mirroring the service-role-full-access + scoped-authenticated-read pattern already established by adherence_rubrics and blueprint_quality_assessments.',
];

const detailed_analysis = `OVERALL RISK: ${overall_risk} / VERDICT: ${overall_verdict}

SCOPE ASSESSED: SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B ("Artifact Walk + Verdict Table Engine"), Child B of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001, ahead of LEAD-TO-PLAN handoff (Q6 of the canonical 9-question LEAD gate).

1) DEPENDENCY CORRECTNESS -- CONFIRMED CORRECT (direct DB query, not inferred):
   strategic_directives_v2.dependencies for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B = exactly
   [{"sd_id":"SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A"}] -- lists ONLY Child A, never C or D.
   Child A (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A) status='completed', current_phase='COMPLETED'
   (id=3d65737b-62e0-4179-b613-0b7eb3e5ed52), merged via PR #5552. Child C correctly depends on
   [A,B]; Child D correctly depends on [A,B,C]. No circular or forward dependency. Zero risk here.

2) CROSS-REPO FILE ACCESS -- PRECEDENT EXISTS, LOW-RISK PATH IDENTIFIED:
   Canonical resolver is lib/repo-paths.js (resolveRepoPathDbFirst: DB-first via applications.local_path,
   registry.json fallback), generalized fleet-wide via lib/sub-agents/resolve-repo.js
   (resolveSubAgentRepo/applySubAgentRepoVerdict, SD-LEO-INFRA-FLEET-WIDE-SUB-001), proven live by the
   DESIGN sub-agent (SD-LEO-INFRA-CROSS-REPO-AWARE-001, PR #3971) and SECURITY/API/PERFORMANCE/DEPENDENCY.
   MarketLens is a registered applications row: local_path=C:/Users/rickf/Projects/_EHG/marketlens,
   status=active -- confirmed via direct query, a durable local clone already exists. RECOMMENDATION:
   local-path lookup via applications.local_path (what the whole fleet already standardizes on). Do
   NOT clone fresh (adds network dependency, staleness ambiguity, disk churn) and do NOT use the GitHub
   API (rate limits, auth complexity, and reads a remote ref that may not match the working tree). One
   genuine novelty: existing precedent resolves the EXECUTING SD's own target_application; Child B must
   resolve an ARBITRARY VENTURE's repo at runtime, per venture being walked -- same helper signature,
   new call-site shape (see W-4). Fail-closed contract (resolveGateRepoContext) should be reused for this
   path.

3) EVIDENCE-LINKING AMBIGUITY -- HEURISTIC ACCEPTABLE FOR V1, DIRECTION-SENSITIVE:
   The SD's own scope text already defers exact-matching-strategy to PLAN ("git grep / AST-level or
   path-level matching ... PLAN decides exact matching strategy, doc it, keep it evidence-linked not
   narrative"). Assessment: a deterministic keyword/path heuristic (same style as the DESIGN sub-agent's
   existing grep-based checks) is appropriate for v1 -- it is auditable and reproducible, both desirable
   for a durable, chairman-facing verdict table. The critical constraint is FAILURE DIRECTION: ambiguous/
   no-match must disposition toward MISSING or PARTIAL, never BUILT, per the chairman's own explicit
   honesty rule ("could-not-verify is never conflated with built"). An LLM-judgment alternative is not
   recommended for this child (non-determinism undermines durability; prompt-injection surface from
   external repo content) -- see W-3. The SD's Success Criteria retrodiction test (near-zero score against
   the pre-recovery commit fixture) is the right empirical calibration and should be a hard gate, not a
   nice-to-have -- see R-3.

4) VERDICT TABLE STORAGE -- REAL PRECEDENT RISK, MITIGATION IDENTIFIED:
   Two candidates per SD scope text: reuse blueprint_quality_assessments, or a new table. Direct
   inspection: blueprint_quality_assessments has 0 live rows today (low immediate blast radius) but is
   scoring-shaped (assessment_scores/overall_score/gate_decision CHECK IN ('pass','fail','retry')/
   assessor_model/template_id FK) -- built for Stage-16 pre-build template scoring, not Child B's binary-
   completeness-plus-disposition job (see W-1). Separately, and more urgently: Child A's OWN migration
   pair (20260704_create_adherence_rubrics.sql, 20260704_add_build_deviation_record_artifact_type.sql)
   were both clean additive changes (CREATE TABLE IF NOT EXISTS / additive CHECK-widen, zero rows
   touched), but the ACCOMPANYING CODE (lib/eva/deviation-ledger.js recordDeviation()) shipped with a
   live bug -- inserting is_current:true collided with the pre-existing partial unique index
   idx_unique_current_artifact(venture_id, lifecycle_stage, artifact_type, COALESCE(metadata->>'screenId',
   '__no_screen__')) WHERE is_current=true, added migration 20260416_unique_current_artifact.sql. Every
   second call for the same venture+stage+type threw a unique-violation. Caught only by adversarial /ship
   review same-day (commit f14eceadcd7), fixed via is_current:false + a new real-DB regression test
   (tests/integration/eva/deviation-ledger-realdb.test.js) because the existing MOCKED unit test could not
   catch a real uniqueness collision by construction. Child B's verdict table will face the SAME failure
   class: it will be written to repeatedly (once per S19->S20 gate firing via Child D, likely re-run
   through Child C's convergence loop) -- see R-1. Migration safety verdict: WHICHEVER table PLAN
   chooses, the migration itself must be additive-only (same standard Child A met), but the code-level
   idempotency/re-run behavior needs a REAL-DB test proving it BEFORE EXEC ships, not an adversarial catch
   after.

5) STANDARD RISK CHECKLIST:
   - Rollback: favorable. Child B is net-new code + additive-only migration (if any) + READ-ONLY
     consumption of Child A's readDeviations() and of venture_stages/venture_artifacts. Zero writes to
     shared state. S19/S20 gate wiring is explicitly Child D's job (out of scope here), so Child B ships
     INERT until Child D wires it in -- single-PR revert, zero consumer coupling pre-Child-D.
   - Blast radius / sensitive data: see R-2. Verified empirically (not hypothetically) against MarketLens:
     .gitignore correctly excludes .env/node_modules/dist, and only .env.example is present today. Real
     residual risk is that this engine is GENERIC across all ventures indefinitely, and gitignored files
     still exist on-disk when present in some other venture. Directory allowlist/denylist + path-only
     (never content) evidence storage closes this.
   - Test coverage for inherent fuzziness: the SD's own Smoke Test Steps (MarketLens live run against
     current main; pre-recovery-commit fixture; deliberately-descoped-without-reason rejection) are the
     right level of test for a fuzzy matcher -- behavioral/golden-master style against known repo states,
     not exhaustive unit enumeration. Supplement with deterministic unit tests against a small synthetic
     fixture tree (not a live venture path, which is not CI-portable) -- see W-2.

CONCLUSION: No blocking issues. VERDICT: WARNING (proceed to PLAN, not BLOCK) -- three risks (R-1, R-2,
R-3) require explicit PRD-level FR/TR language and pre-EXEC test design, not scope changes. Dependency
chain is confirmed correct. Existing fleet-wide cross-repo infrastructure (lib/repo-paths.js +
lib/sub-agents/resolve-repo.js) is directly reusable and de-risks Q1 substantially.
`;

const summary = `LEAD Q6 risk for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B: MEDIUM/WARNING. Dependencies CONFIRMED correct (lists only Child A; Child A status=completed). Cross-repo access has strong existing precedent (lib/repo-paths.js + lib/sub-agents/resolve-repo.js; MarketLens local_path verified active) -- recommend local-path lookup, not fresh clone/GitHub API. 3 critical watch-items for PLAN: (R-1) verdict-table re-run idempotency given Child A's own same-day idx_unique_current_artifact collision fix; (R-2) cross-repo scan must allowlist/denylist directories and store path-only evidence (never raw content) to prevent secrets exposure; (R-3) fuzzy matcher must fail toward MISSING not BUILT, calibrated by the SD's own retrodiction test. blueprint_quality_assessments is a poor schema fit (scoring-shaped, 0 rows) -- recommend a new table, mirroring Child A's own adherence_rubrics precedent. No blocking issues; proceed to PLAN with these as required FR/TR language.`;

const supabase = createSupabaseServiceClient();

// Canonical repo-evidence pattern (CLAUDE.md prologue #11): resolve via
// lib/sub-agents/resolve-repo.js, never hand-roll repo_path/local_path columns.
// SD-B's own target_application is EHG_Engineer (the engine's code lives here;
// the venture repo it will read at RUNTIME is a data-scoped, per-venture
// resolution -- see W-4 above).
const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RISK',
  supabase,
});

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'RISK',
  sub_agent_name: 'risk-agent',
  phase: 'LEAD',
  verdict: overall_verdict,
  confidence: 85,
  validation_mode: 'prospective',
  source: 'risk-agent',
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis,
  summary,
  metadata: {
    sd_key: SD_KEY,
    overall_risk,
    gate_context: 'LEAD 9-question gate Q6 (Risk Assessment), ahead of LEAD-TO-PLAN handoff',
    parent_orchestrator: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
    child_position: 'B of A/B/C/D',
    dependency_check: {
      declared_dependencies: ['SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A'],
      verified_via: 'direct query of strategic_directives_v2.dependencies + status',
      child_a_id: '3d65737b-62e0-4179-b613-0b7eb3e5ed52',
      child_a_status: 'completed',
      child_a_current_phase: 'COMPLETED',
      lists_c_or_d: false,
      verdict: 'CORRECT',
    },
    cross_repo_access: {
      precedent_exists: true,
      canonical_resolver: 'lib/repo-paths.js resolveRepoPathDbFirst (DB-first via applications.local_path, registry.json fallback)',
      fleet_generalization: 'lib/sub-agents/resolve-repo.js resolveSubAgentRepo/applySubAgentRepoVerdict (SD-LEO-INFRA-FLEET-WIDE-SUB-001)',
      proven_by: 'DESIGN sub-agent, SD-LEO-INFRA-CROSS-REPO-AWARE-001 (PR #3971)',
      marketlens_verified: { name: 'MarketLens', local_path: 'C:/Users/rickf/Projects/_EHG/marketlens', status: 'active' },
      recommended_approach: 'local path lookup via applications.local_path; NOT fresh clone; NOT GitHub API',
      novel_pattern_note: 'per-venture RUNTIME resolution (data-scoped) vs existing SD-scoped resolution -- same helper signature, new call-site shape',
    },
    evidence_linking_approach: {
      recommended_v1: 'deterministic keyword/path heuristic, precision-biased (ambiguous => MISSING/PARTIAL, never BUILT)',
      llm_alternative_risk: 'non-determinism + prompt-injection surface; not recommended for this child',
      calibration_test: 'SD Success Criteria retrodiction (pre-recovery commit ~0, current main high) should be a hard gate',
    },
    verdict_table_storage: {
      candidates_assessed: ['blueprint_quality_assessments (0 rows, scoring-shaped, poor fit)', 'new purpose-built table (recommended)'],
      collision_precedent: 'Child A recordDeviation() idx_unique_current_artifact collision, fixed same-day via commit f14eceadcd7',
      migration_safety_requirement: 'additive-only (CREATE TABLE IF NOT EXISTS or additive CHECK-widen only); RLS mirroring adherence_rubrics/blueprint_quality_assessments service-role-full + scoped-authenticated-read pattern',
    },
    blast_radius: {
      sensitive_data_exposure_risk: 'real but mitigable; MarketLens verified .env-clean today (only .env.example; .gitignore correct) but engine is generic across all ventures over time',
      mitigation: 'directory allowlist/denylist scan scope + path+line-only evidence storage (no raw content snippets) in durable rows',
      rollback_shape: 'net-new + additive-only; read-only against Child A ledger and venture_stages/venture_artifacts; inert until Child D wires S19/S20 gate',
    },
    test_coverage_expectations: {
      behavioral: 'SD Smoke Test Steps (MarketLens live run, pre-recovery-commit fixture, descope-without-reason rejection) are the primary fuzzy-matching test surface',
      unit: 'deterministic matcher core tested against a small synthetic fixture repo tree (tests/fixtures/), not a live venture path',
      ci_portability_gap: 'no test may hardcode a real venture local_path; gate any real-clone test behind a describeDb-style availability guard',
    },
    sources_consulted: [
      'lib/repo-paths.js', 'lib/sub-agents/resolve-repo.js', 'lib/sub-agents/registry.json', 'lib/sub-agents/design/checks.js',
      'lib/eva/deviation-ledger.js', 'docs/reference/post-build-adherence-rubric-and-deviation-ledger.md',
      'docs/reference/schema/engineer/tables/blueprint_quality_assessments.md', 'lib/eva/blueprint-scoring/persistence.js',
      'database/migrations/20260416_unique_current_artifact.sql', 'database/migrations/20260704_create_adherence_rubrics.sql',
      'database/migrations/20260704_add_build_deviation_record_artifact_type.sql', 'git show f14eceadcd7',
      'direct DB query: strategic_directives_v2, applications, information_schema.columns, pg_constraint',
      'direct filesystem check: C:/Users/rickf/Projects/_EHG/marketlens (.gitignore, env files)',
    ],
  },
};

applySubAgentRepoVerdict(row, resolution);

// Idempotent: remove any prior LEAD/RISK row for this SD before inserting fresh.
const { error: delErr } = await supabase
  .from('sub_agent_execution_results')
  .delete()
  .eq('sd_id', SD_ID)
  .eq('sub_agent_code', 'RISK')
  .eq('phase', 'LEAD');

if (delErr) {
  console.error('[risk-agent] DELETE failed:', delErr);
  process.exit(1);
}

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, validation_mode, source, metadata, created_at')
  .single();

if (error) {
  console.error('[risk-agent] INSERT FAILED:', error);
  process.exit(1);
}

console.log('[risk-agent] LEAD-phase evidence row written:');
console.log(JSON.stringify(data, null, 2));
console.log('\n[risk-agent] SUMMARY:', summary);
