// risk-agent execution result writer for SD-FDBK-ENH-PAT-LEO-INFRA-001 LEAD phase
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});

const SD_ID = '670b1f01-95c2-4695-b7a9-979f9db2c598';
const SD_KEY = 'SD-FDBK-ENH-PAT-LEO-INFRA-001';
const PHASE = 'LEAD';
const SUB_AGENT_CODE = 'RISK';

// ----- DOMAIN SCORES (1-10 BMAD scale) -----
const domain_scores = {
  technical_complexity: 3,
  security_risk: 2,
  performance_risk: 2,
  integration_risk: 5,
  data_migration_risk: 4,
  ui_ux_risk: 1,
};
const overall_score = Math.max(...Object.values(domain_scores));
const overall_risk =
  overall_score >= 9 ? "CRITICAL" :
  overall_score >= 7 ? "HIGH" :
  overall_score >= 5 ? "MEDIUM" : "LOW";

const critical_issues = [];

const warnings = [
  "Blast radius is fleet-wide: every future LEAD evaluation routes through update_sd_after_lead_evaluation(). A typo or partial-overload coverage breaks every subsequent APPROVE until rollback. Mitigation: static-pin regression test asserting APPROVE writes the in_progress literal AND does NOT write the active literal, run BEFORE merge. Idempotent CREATE OR REPLACE means rollback is one re-execution.",
  "Function-overload coverage class (database-agent W1 from SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001). Migration MUST enumerate pg_proc first to discover ALL signatures of update_sd_after_lead_evaluation() and CREATE OR REPLACE every overload in the same migration block. SD.metadata.empirical_verification does not yet list the overload set; database-agent at PLAN must produce that enumeration as a hard deliverable.",
  "PostgREST schema-cache risk (database-agent W2 from same SD). Migration MUST end with NOTIFY pgrst, reload schema so subsequent supabase-js callers do not see stale function source. LEAD enrichment includes this as key_change #3; verify it is preserved into the PRD and the migration file.",
  "Sandbox-blocked migration application empirically confirmed: exec_sql RPC is not exposed to the service-role key on this Supabase project (probed during this assessment). EXEC must ship the migration in the PR and apply via Supabase dashboard SQL editor or direct pg connection post-merge. Memory pattern: SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001 used this approach successfully.",
  "Validator-drift risk: the static-pin test should anchor BOTH (a) the trigger source contains in_progress on APPROVE, AND (b) the L:sdTransitionReadiness allowlist at additional-validators.js:29 contains in_progress. Anchoring only the trigger leaves the consumer half un-pinned; future drift on the validator side would silently re-introduce the asymmetry.",
  "Cascade-trigger-overreach exposure (memory: filed harness 18c57c39; addressed defensively via QF-20260511-016 reaffirmClaimColumns helper). The change here is to the function body of update_sd_after_lead_evaluation, NOT to any column directly written by sd-start.js. No new claim-stomping risk is introduced. Concurrent-claim safety is preserved.",
];

const mitigation_recommendations = [
  "PLAN: invoke database-agent and require ENUMERATION of all overloads of update_sd_after_lead_evaluation() in pg_proc as a hard deliverable. Migration must CREATE OR REPLACE every overload found, not just the presumed singular one.",
  "PLAN: PRD must specify a dual-anchor static-pin test (trigger source AND validator allowlist literal) so any future drift on either side fails CI. The test must read pg_proc.prosrc via a direct pg client (since exec_sql RPC is unavailable to supabase-js) OR fall back to filesystem parse of the migration file as the canonical source.",
  "EXEC: migration file must end with the literal: NOTIFY pgrst, reload schema; immediately after the final CREATE OR REPLACE FUNCTION block.",
  "EXEC: migration must include a RAISE NOTICE / DO block that re-introspects pg_proc.prosrc AFTER the CREATE OR REPLACE and emits empirical confirmation that the in_progress literal is now present in every overload. Treat this as an in-migration post-condition check.",
  "POST-MERGE: ship migration in the PR; apply via Supabase dashboard SQL editor (sandbox-blocked-apply pattern). Canary verification = simulate one LEAD evaluation APPROVE on a throwaway draft SD and assert resulting status=in_progress. Document the apply-and-canary step in the retrospective.",
  "OUT-OF-SCOPE GUARD: LEAD's no-backfill decision (existing status=active SDs) is empirically validated. strategic_directives_v2 currently contains ZERO SDs at status=active (probed during this assessment). Risk #4 in SD.risks should be re-scored likelihood=none post-fix. The intentional out-of-scope is correct.",
  "WITNESS-COUNT DISCREPANCY: SD claims 21st-witness but issue_patterns.occurrence_count for PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 is 5 in the database. The 21 likely counts session-memory recurrences plus surface-variant witnesses across the writer/consumer pattern. Not a blocker; PLAN should reconcile in the PRD or update issue_patterns.occurrence_count at /learn to match the canonical surface tally.",
];

const empirical_findings = {
  sd_record_exists: true,
  sd_type: "infrastructure",
  sd_status_at_assessment: "draft",
  sd_current_phase_at_assessment: "LEAD",
  existing_active_status_sd_count: 0,
  existing_in_progress_status_sd_count: 1,
  validator_file_line_verified: "scripts/modules/handoff/validation/validator-registry/gates/additional-validators.js:29",
  validator_allowlist_verified: ["approved", "planning", "in_progress", "draft"],
  in_progress_in_validator_allowlist: true,
  active_in_validator_allowlist: false,
  exec_sql_rpc_available_to_service_role: false,
  issue_pattern_occurrence_count_in_db: 5,
  sd_claimed_witness_number: 21,
  witness_count_reconciliation_note: "SD claims 21st-witness; issue_patterns.occurrence_count=5. Likely 21 aggregates session-memory recurrences across surface variants vs formally-registered witnesses in the table. Recommend PLAN reconcile.",
  related_completed_sds_for_same_pattern: 14,
  prior_pattern_proven_solutions: ["QF-20260506-552", "QF-20260506-836", "QF-20260506-295"],
  cancelled_related_sd: "SD-FDBK-INFRA-TRIGGER-SIDE-GATE-001 (option-C variant; intentionally cancelled per scope-reduction in this SD)",
  rollback_complexity: "trivial — CREATE OR REPLACE FUNCTION update_sd_after_lead_evaluation() with prior active literal",
};

const confidence = 88;
const verdict = "PASS";
const blocking_criteria_assessment = {
  is_high_risk: false,
  is_critical_risk: false,
  high_risk_mitigation_plan_documented: "N/A (overall risk is MEDIUM, not HIGH)",
  critical_risk_blocker_present: false,
};
const recommendation = `LEAD-TO-PLAN handoff: PASS at confidence ${confidence}%. Domain max=${overall_score} (integration blast radius). All risks have executable mitigations already documented in SD.risks and SD.key_changes. Required PLAN-phase deliverable from database-agent: empirical pg_proc enumeration of all update_sd_after_lead_evaluation() overloads BEFORE the migration is written.`;

const raw_output = {
  overall_risk,
  domain_scores,
  critical_issues,
  warnings,
  mitigation_recommendations,
  empirical_findings,
  recommendation,
  confidence,
  blocking_criteria_assessment,
};

// Map to the actual sub_agent_execution_results column set.
// Observed columns: id, sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
//   critical_issues, warnings, recommendations, detailed_analysis, execution_time, metadata,
//   created_at, updated_at, risk_assessment_id, validation_mode, justification, conditions,
//   retro_contribution, invocation_id, summary, raw_output, source, phase
const insertPayload = {
  sd_id: SD_ID,
  sub_agent_code: SUB_AGENT_CODE,
  sub_agent_name: "Risk Assessment Sub-Agent",
  phase: PHASE,
  verdict,
  confidence,
  critical_issues,
  warnings,
  recommendations: mitigation_recommendations,
  detailed_analysis: {
    overall_risk,
    domain_scores,
    empirical_findings,
    blocking_criteria_assessment,
  },
  summary: `MEDIUM overall (domain max=${overall_score} integration blast radius). PASS at ${confidence}% confidence. ZERO critical issues, ${warnings.length} warnings with executable mitigations already documented in SD. Single-literal trigger swap (active to in_progress); rollback is one CREATE OR REPLACE.`,
  justification: recommendation,
  raw_output,
  source: "risk-agent-lead-bmad-v1.0.0",
  validation_mode: "prospective",
  metadata: {
    sd_key: SD_KEY,
    invoked_at: new Date().toISOString(),
    sub_agent_version: "1.0.0",
    bmad_domains_assessed: 6,
    bmad_methodology: "multi-domain risk scoring 1-10 per domain; overall = max(domain_scores)",
    empirical_probes_run: 4,
    probes_summary: "SD record / status distribution / validator file content / issue_patterns recurrence",
    model: "Opus 4.7 (1M context)",
    model_id: "claude-opus-4-7[1m]",
  },
};

console.log("\n--- Insert payload (summary) ---");
console.log(JSON.stringify({
  sd_id: insertPayload.sd_id,
  sub_agent_code: insertPayload.sub_agent_code,
  phase: insertPayload.phase,
  verdict: insertPayload.verdict,
  confidence: insertPayload.confidence,
  overall_risk,
  domain_scores,
  warnings_count: warnings.length,
  critical_count: critical_issues.length,
  mitigations_count: mitigation_recommendations.length,
}, null, 2));

const { data: ins, error: insErr } = await sb
  .from("sub_agent_execution_results")
  .insert(insertPayload)
  .select("id,sub_agent_code,phase,verdict,confidence,created_at")
  .maybeSingle();

if (insErr) {
  console.error("\nINSERT FAILED:", insErr);
  if (insErr.details) console.error("Details:", insErr.details);
  if (insErr.hint) console.error("Hint:", insErr.hint);
  process.exit(1);
}

console.log("\n--- INSERT OK ---");
console.log(JSON.stringify(ins, null, 2));
