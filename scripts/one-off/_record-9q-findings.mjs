// One-off: Record full 9-question gate findings for SD-C reopen approval
// Updates metadata.lead_decision with verdict=approved (with conditions) + Q1..Q9 evidence-grounded answers.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '6696db72-d1b1-4a07-8281-3bd7eb922251';

const { data: existing } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', SD_ID).single();

const priorReopen = existing.metadata?.lead_decision;

const finalDecision = {
  verdict: 'approved',
  approval_type: 'CONDITIONAL_PASS',
  decided_at: new Date().toISOString(),
  decided_in_phase: 'LEAD',
  decided_by_session: 'ea257a69-f0ec-40fb-8818-ce66e2767b28',
  reopen_chain: [priorReopen?.prior_decision, priorReopen].filter(Boolean),
  sub_agent_evidence: {
    validation: { row_id: 'fa9db31f-aba3-4467-afe4-819a5e2fef3c', verdict: 'PASS', confidence: 92 },
    risk:       { row_id: 'ca719680-ca0f-47af-929f-f31f52b728d7', verdict: 'CONDITIONAL_PASS', confidence: 88 },
  },
  nine_question_gate: {
    Q1_need_validation: 'YES. Real chairman friction: Todoist + strategic_directives_v2 are separate work surfaces today, forcing manual correlation. Phase 1+2 shipped 2026-05-11 and chairman confirmed value 2026-05-27 — the unlock_gate value-proof signal is satisfied.',
    Q2_solution_assessment: 'YES. Cross-references existing chairman surfaces (Todoist intake already segments by target_application = ehg_engineer/ehg_app/new_venture per validation-agent finding: 304 rows present). Aligns with orchestrator strategic objective ("opinionated co-pilot for chairman critical-path execution").',
    Q3_feasibility_review: 'YES. Phase 1 + Phase 2 infrastructure is in place: 6-flow dispatcher, decision-log schema, Friday-outcome bridge, Todoist client. No new tables required (column-extension of eva_todoist_intake.target_aspects, already JSONB). All extension points identified by validation-agent.',
    Q4_value_analysis: 'YES. Phase 2 value-proof (decision log + Friday integration) confirmed by chairman 2026-05-27. Phase 3 closes the work-surface unification loop. Recommendation precision target ≥70% chairman approval; cross-ref accuracy ≥80%. Both measurable via decision-log post-launch.',
    Q5_existing_tools: 'YES (extensively). Reuse Phase 1 6-flow dispatcher (no new flow); Phase 2 decision-log schema + Override-token contract; Todoist MCP tooling already available; /leo create canonical writer path; eva_todoist_intake.target_aspects existing JSONB column. Validation-agent confirms zero overlap with prior SDs/QFs.',
    Q6_risk_assessment: 'HIGH-CONFIDENCE MITIGATED. CRO board 2026-04-27 flagged blast-radius materially higher than Phase 1/2. Risk-agent identified 7 risks (R1-R7) totaling overall risk=HIGH (blast_radius score 9). The 4 invariants encoded as PRD acceptance criteria reduce residual to acceptable: (1) emit-only contract enforced by static-import test banning child_process/execa/spawn; (2) read-only DB access enforced by supabase-write allowlist test; (3) chairman approval gate enforced by mandatory override_reason ≥12 chars + counterfactual + decline-prominent UI; (4) feature-flag killswitch EVA_SD_READER_ENABLED for ≤60s blast-cut. R4 (drift to write-path, score 9) is the highest residual but is fully test-enforced — drift would require deleting CI tests + CODEOWNERS bypass simultaneously.',
    Q7_ui_inspectability: 'YES. Chairman sees SDs in the existing 6-flow reply envelope ("Related SDs:" prefix); SD blockers surfaced with blocker reason; recommendations include confidence score (0-100) + counterfactual + dup-candidate links. Every recommendation outcome (approve/decline/reader_disabled) appears in eva_support_decision_log (chairman can query). target_application=EHG_Engineer (no UI parity backend-only concern; CLI surface IS the UI).',
    Q8_deletion_audit: 'COMPLETED. scope_reduction_percentage=28%. Seven explicit deletions from naive Phase 3: (1) no auto-creation (chairman runs /leo create manually); (2) no child_process exec; (3) no SD↔subtask join table (column-extension only); (4) no new 7th sub-flow (extend existing 6-flow); (5) no leo-create-sd preflight scoring re-implementation; (6) no real-time push notifications; (7) no dynamic RLS retrofit (single-reader-module + write-allowlist test cover the same ground). Documented in scope IN/OUT.',
    Q9_human_verifiable_outcome: 'YES. 4 smoke_test_steps populated, each with concrete chairman-observable expected outcome: (step 1) "Related SDs:" prefix visible in reply envelope; (step 2) blocker reason surfaced for ≥1 SD; (step 3) /leo create command preview + confidence + counterfactual + Override: token approval flow; (step 4) feature flag flip silently disables SD surfacing with decision-log audit row. All four are 30-second-demo-able.',
  },
  approval_conditions: [
    'PLAN MUST encode NFR-R1..NFR-R7 + NFR-AUDIT as explicit PRD acceptance criteria with failing-test names (from risk-agent evidence row ca719680-ca0f-47af-929f-f31f52b728d7).',
    'PLAN MUST call DATABASE sub-agent for RLS review of the new strategic_directives_v2 reader path (validation-agent warning NEW_SD_READER_PATH).',
    '3 CI tests (T1 static-import ban, T2 supabase-write allowlist, T3 ESLint no-restricted-imports) MUST pass before EXEC handoff. EXEC blocks if any fails.',
    'lib/sd/active-sd-predicate.js MUST be shared with ≥1 existing consumer (resolve-feedback.js or generate-retrospective.js) — parity test required (R6 mitigation).',
    'Feature flag EVA_SD_READER_ENABLED with documented one-line revert in runbook (R7 mitigation).',
    'Decision-log row written BEFORE render for EVERY SD recommendation regardless of outcome (audit invariant).',
    'Cross-ref defaults to column-extension (eva_todoist_intake.target_aspects.sd_refs[]); join table deferred to follow-up SD only on demonstrated need (validation-agent warning CROSS_REF_SCHEMA_DECISION).',
    'Chairman-approval-for-SD-creation safeguard spec\'d explicitly in PRD as testable requirement (validation-agent warning NEW_SAFEGUARD_NOT_INVARIANT — this is a NEW constraint, not pre-existing).',
  ],
  scope_reduction_summary: {
    percentage: 28,
    deletions: [
      'No auto-creation (chairman runs /leo create manually)',
      'No child_process exec',
      'No SD↔subtask join table (column-extension only)',
      'No new 7th sub-flow (extend existing 6-flow)',
      'No leo-create-sd preflight scoring re-implementation',
      'No real-time push notifications (chairman-pull only)',
      'No dynamic RLS retrofit (single-module + allowlist test instead)',
    ],
  },
  blast_radius_assessment: {
    pre_mitigation: 'HIGH (CRO board 2026-04-27 flagged: EVA recommendations affect production code via SDs)',
    post_mitigation: 'MEDIUM (4 testable invariants + killswitch contain the risk; chairman approval gate adds high-friction approval step)',
    residual_top_risk: 'R4 drift to write-path (score 9 pre-mitigation) — fully test-enforced, would require deleting CI tests + CODEOWNERS bypass simultaneously to fail.',
  },
};

const newMetadata = {
  ...(existing.metadata || {}),
  lead_decision: finalDecision,
};

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('id', SD_ID);

if (error) { console.error('UPDATE FAILED:', error.message); process.exit(1); }

console.log('=== LEAD DECISION RECORDED ===');
console.log('verdict:', finalDecision.verdict, '(' + finalDecision.approval_type + ')');
console.log('approval_conditions:', finalDecision.approval_conditions.length);
console.log('reopen_chain entries:', finalDecision.reopen_chain.length);
console.log('blast_radius post-mitigation:', finalDecision.blast_radius_assessment.post_mitigation);
console.log('scope_reduction:', finalDecision.scope_reduction_summary.percentage + '%');
console.log('9-question gate: all 9 answered with evidence');
