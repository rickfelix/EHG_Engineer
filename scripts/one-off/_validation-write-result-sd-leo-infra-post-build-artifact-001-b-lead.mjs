#!/usr/bin/env node
/**
 * One-off: Write VALIDATION sub-agent LEAD-phase verdict for
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B ("Artifact Walk + Verdict Table Engine")
 * ahead of its LEAD-TO-PLAN handoff.
 *
 * Child B of orchestrator SD-LEO-INFRA-POST-BUILD-ARTIFACT-001; depends on Child A
 * (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A, completed/merged — shipped adherence_rubrics
 * + lib/eva/deviation-ledger.js).
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + the canonical storage path
 * (lib/sub-agent-executor/results-storage.js storeSubAgentResults) rather than a
 * hand-rolled INSERT, per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'a64c62bd-b42d-406d-8688-9fca3ec154ab';
const SD_KEY = 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B';

const findings = [
  {
    id: 'F1-required-artifacts-ssot-confirmed',
    severity: 'INFO',
    summary: 'venture_stages.required_artifacts is queryable and populated for all 26 stages (stage 1 "truth_idea_brief" through stage 26 "growth_playbook"). Spot-check against MarketLens (ecbba50e-3c98-4493-9e77-1719cf6b6f00) venture_artifacts shows artifact_type values line up with the required_artifacts keys per stage_number<->lifecycle_stage almost exactly (e.g. stage 14 requires 5 blueprint_* keys and MarketLens has exactly those 5 present at lifecycle_stage=14). Confirms the enumerate-then-match design is viable against real data, and confirms the SD text\'s own correction (required_artifacts is the live SSOT, NOT the deprecated stage_artifact_requirements mirror).'
  },
  {
    id: 'F2-is_current-filter-required-for-presence-check',
    severity: 'WARNING',
    summary: 'venture_artifacts can carry more than one row for the same (venture, lifecycle_stage, artifact_type) with mixed is_current — confirmed live: MarketLens lifecycle_stage=10 artifact_type=identity_persona_brand has one row is_current=true and one is_current=false. Child B\'s completeness precondition (present/absent) MUST filter to is_current=true (or take latest) when checking presence against venture_artifacts, which is the OPPOSITE convention from reading Child A\'s deviation ledger (readDeviations() intentionally returns ALL rows regardless of is_current, since every deviation record is written with is_current:false and would vanish under a naive is_current=true filter, per Child A\'s adversarial-review fix for the idx_unique_current_artifact collision). PLAN should state both filter conventions explicitly so EXEC does not conflate them.'
  },
  {
    id: 'F3-readDeviations-signature-confirmed-exact-match',
    severity: 'INFO',
    summary: 'lib/eva/deviation-ledger.js readDeviations(supabase, {ventureId, artifactRef}) reads directly (no is_current filter, per F2) and returns Promise<Array<{id, createdAt, artifact_ref, what, instead, why, decided_by, weight}>> — an empty array (never null) when no deviation exists. This is an EXACT match to the shape Child B\'s prompt/spec expects; no adapter or shape-translation layer is needed. Child B can call it as-is to distinguish DEVIATED-WITH-DOCUMENTED-REASON (non-empty array, non-thin why) from DEVIATED-UNDOCUMENTED (empty array, or a thin/nonsensical why — reason-quality judgment is explicitly out of Child B\'s scope per its own text, deferred to Child C).'
  },
  {
    id: 'F4-no-duplicate-inflight-sd',
    severity: 'INFO',
    summary: 'Searched strategic_directives_v2 for title/description matches on artifact-walk, verdict-table, evidence-link, and disposition-engine terminology. Only hits are the parent orchestrator (SD-LEO-INFRA-POST-BUILD-ARTIFACT-001, in_progress at PLAN_VERIFICATION) and Child B itself. No other in-flight SD builds an overlapping artifact-walk/verdict-table/evidence-linking engine.'
  },
  {
    id: 'F5-CRITICAL-blueprint_quality_assessments-no-trigger-but-real-check-and-grain-mismatch',
    severity: 'WARNING',
    summary: 'Read blueprint_quality_assessments\' trigger bodies and CHECK constraints directly via raw SQL (pg_trigger/pg_constraint/pg_indexes), not just its column list — the exact step Child A\'s LEAD-phase research initially skipped for leo_scoring_rubrics/leo_vetting_rubrics. RESULT: blueprint_quality_assessments has NO hidden validation trigger analogous to leo_scoring_rubrics_validate (that trigger hard-codes 6 specific dimension keys and rejects any other dimension set — the landmine Child A hit and routed around during EXEC). blueprint_quality_assessments\' only trigger is the benign, universal trg_blueprint_quality_assessments_updated_at (sets updated_at=now(), nothing else). HOWEVER two real, non-trigger incompatibilities exist: (1) CHECK blueprint_quality_assessments_gate_decision_check restricts gate_decision to exactly {\'pass\',\'fail\',\'retry\'} (lowercase, 3 values) — incompatible with Child B\'s 5-value disposition taxonomy (BUILT/PARTIAL/MISSING/DEVIATED-WITH-DOCUMENTED-REASON/DEVIATED-UNDOCUMENTED) if that column were reused for disposition; (2) the table\'s grain is one row per (venture_id[, template_id]) assessment carrying a single overall_score + one assessment_scores jsonb blob — it is not shaped for Child B\'s own success-criteria requirement of "one row per enumerated item...verified by row-count reconciliation against the registry." Reuse is technically possible only by stuffing an array of per-item dispositions into the unconstrained assessment_scores/metadata jsonb columns and bypassing gate_decision entirely, which is a materially different pattern than blueprint_quality_assessments\' apparent original one-assessment-per-venture design intent.'
  }
];

const warnings = [
  'blueprint_quality_assessments.gate_decision CHECK constraint (pass/fail/retry only) cannot store Child B\'s 5-value disposition taxonomy as-is; do not target that column for per-item disposition.',
  'blueprint_quality_assessments\' one-row-per-assessment grain does not natively fit Child B\'s one-row-per-enumerated-item verdict-table requirement; PLAN must either design a dedicated table (mirroring Child A\'s adherence_rubrics precedent of building fresh once the reuse candidate\'s real constraints were read) or explicitly document a jsonb-array-inside-one-row encoding and how row-count reconciliation would work against it.',
  'venture_artifacts presence checks must filter on is_current=true; deviation-ledger reads via readDeviations() must NOT filter on is_current. PLAN should state both conventions explicitly to prevent conflation during EXEC.'
];

const recommendations = [
  'PLAN: treat "reuse blueprint_quality_assessments" as unlikely to fit cleanly given the gate_decision CHECK and grain mismatch; default to a new dedicated table for the verdict-table row set unless PLAN designs an explicit, documented jsonb-encoding workaround.',
  'PLAN: specify the is_current=true filter for venture_artifacts completeness/evidence-linking checks explicitly in the PRD, distinct from the deliberately-unfiltered readDeviations() read path.',
  'PLAN: confirm the stage_number (venture_stages) <-> lifecycle_stage (venture_artifacts) join key explicitly in the PRD — empirically confirmed correct via the MarketLens spot-check but not yet documented as a formal contract.',
  'EXEC: when building the evidence-linking layer, note MarketLens already carries artifact_type values beyond what required_artifacts lists at several stages (e.g. stage 11 identity_brand_name/identity_logo_image alongside required identity_naming_visual) — these are benign extras and must not be misread as required-but-unlisted.'
];

const summary = 'LEAD-phase VALIDATION PASS (confidence 85) for Child B (Artifact Walk + Verdict Table Engine). All 4 requested checks confirmed: (1) venture_stages.required_artifacts is a live, populated SSOT, spot-checked against MarketLens with good alignment; (2) lib/eva/deviation-ledger.js readDeviations() signature/return-shape is an exact match to what Child B needs, no adapter required; (3) no duplicate/overlapping in-flight SD builds an artifact-walk/verdict-table engine; (4) blueprint_quality_assessments has NO hidden validation TRIGGER like leo_scoring_rubrics did, but DOES have a real, concrete CHECK-constraint incompatibility (gate_decision restricted to pass/fail/retry) plus a grain mismatch (one row per assessment vs Child B\'s required one row per enumerated item) — PLAN should default to a new dedicated table rather than reusing blueprint_quality_assessments as-is. A secondary, non-blocking nuance was surfaced: venture_artifacts presence checks need an explicit is_current=true filter, the opposite convention from the deliberately-unfiltered deviation-ledger reads. None of these findings block LEAD-TO-PLAN; Child B\'s own scope text already anticipates the reuse-vs-new-table decision as a PLAN-phase call.';

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
    confidence: 85,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      parent_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001',
      dependency_sd_key: 'SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-A',
      dependency_status: 'completed_and_merged',
      checks: {
        required_artifacts_ssot: 'CONFIRMED — 26/26 stages populated, MarketLens spot-check aligned',
        readDeviations_shape_match: 'CONFIRMED — exact match to spec, no adapter needed',
        duplicate_inflight_sd: 'NONE FOUND',
        blueprint_quality_assessments_fit: 'NOT RECOMMENDED — CHECK constraint + grain mismatch; no hidden trigger (unlike leo_scoring_rubrics)'
      },
      blueprint_quality_assessments_schema: {
        columns: ['id','venture_id','template_id','artifact_type','assessment_scores','overall_score','gate_decision','assessor_model','created_at','updated_at','metadata','notes'],
        triggers: ['trg_blueprint_quality_assessments_updated_at (BEFORE UPDATE, benign updated_at bookkeeping)'],
        check_constraints: ["blueprint_quality_assessments_gate_decision_check: gate_decision = ANY(['pass','fail','retry'])"],
        indexes: ['pkey (unique, id)', 'idx_bqa_venture_id (non-unique)', 'idx_bqa_template_id (non-unique)']
      },
      leo_scoring_rubrics_precedent: 'BEFORE INSERT trigger leo_scoring_rubrics_validate hard-codes 6 exact dimension keys and rejects any other dimension set — Child A hit this during EXEC after its LEAD-phase plan named leo_scoring_rubrics as a reuse candidate based on column list alone, then built adherence_rubrics instead once the trigger body was read.'
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
