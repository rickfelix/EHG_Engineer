import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FEAT-S20-VERDICT-BLOCK-UI-001';

const success_criteria = [
  { criterion: 'Stage20VerdictPanel renders verdict + venture_quality_findings list with severity badges and remediation SD links', measure: 'Component visible in venture detail page when stage_number=20 has code_quality_report' },
  { criterion: 'advanceStage refuses S20->S21 transition when verdict=FAIL + high|critical findings AND LEO_S20_VERDICT_BLOCK_ENABLED=true', measure: 'E2E test: toggle flag on, FAIL+critical fixture, advance call returns refusal with structured reason' },
  { criterion: 'Manual override CTA writes audit_log row (action=stage_advance_override) with actor + reason + verdict_snapshot', measure: 'Integration test: override path inserts row matching schema; chairman dashboard surfaces it' },
  { criterion: 'verdict=BLOCKED (precondition) routes operator to S19 with no override option', measure: 'Unit + UI test: BLOCKED state renders Return-to-S19 CTA and hides override button' },
  { criterion: 'Feature flag default OFF: verdict + findings still surface informationally without enforcement', measure: 'E2E test: flag off, panel renders, advance succeeds, no audit_log override row written' }
];

const smoke_test_steps = [
  'Open EHG venture in Stage 20 -> Stage20VerdictPanel visible with verdict badge + findings list + severity colors',
  'Set LEO_S20_VERDICT_BLOCK_ENABLED=true in env -> reload -> attempt S20->S21 advance with seeded FAIL+critical fixture -> blocked with refusal reason rendered',
  'Click Manual override CTA -> enter reason -> advance succeeds -> verify audit_log row inserted with action=stage_advance_override',
  'Seed code_quality_report verdict=BLOCKED -> panel renders Return-to-S19 CTA + override button hidden'
];

const key_changes = [
  { change: 'Stage20VerdictPanel.tsx (NEW) - render verdict + venture_quality_findings + remediation SD links + override CTA', type: 'feature' },
  { change: 'src/lib/ventures/advanceStage.ts - verdict-read + S20 refusal logic gated by LEO_S20_VERDICT_BLOCK_ENABLED', type: 'feature' },
  { change: 'src/hooks/useStagePolicy.ts - wire artifact_type=code_quality_report into stage 20 policy', type: 'feature' },
  { change: 'src/hooks/useVentureArtifacts.ts - surface latest stage 20 verdict to consumers', type: 'feature' },
  { change: 'audit_log entry on manual override (actor + reason + verdict_snapshot)', type: 'feature' },
  { change: 'Feature flag wiring for LEO_S20_VERDICT_BLOCK_ENABLED (default OFF)', type: 'feature' }
];

const key_principles = [
  'Backend produces, frontend reflects (no quality logic in UI)',
  'Feature flag default OFF for safe phased rollout (off -> canary -> portfolio)',
  'BLOCKED is distinct from FAIL: BLOCKED routes back to upstream stage with no override; FAIL allows audited override',
  'Every advance refusal and override produces an inspectable audit trail',
  'UI parity: every backend verdict field has a visible representation'
];

const strategic_objectives = [
  'Close operator-facing half of SD-LEO-FEAT-STAGE-CODE-QUALITY-001 (parent ships backend; this ships UI)',
  'Make Stage 20 code quality verdict visible to chairman without requiring database query',
  'Enable enforcement of code quality gate via flag-controlled advance refusal',
  'Establish auditable manual-override pattern reusable for future stage gates'
];

const risks = [
  { risk: 'Analyzer false positives produce FAIL verdicts that block legitimate advances', mitigation: 'Flag default OFF + canary period before portfolio enable; manual override available for FAIL state' },
  { risk: 'Manual override abused to bypass legitimate quality issues', mitigation: 'audit_log row + chairman dashboard surfacing; reason field required + non-empty' },
  { risk: 'BLOCKED verdict confuses operators (looks like a FAIL)', mitigation: 'Distinct UI treatment + explicit Return-to-S19 CTA + different copy' },
  { risk: 'Component renders before backend produces code_quality_report row (race)', mitigation: 'Loading state + empty-state copy explaining S20 analyzer not yet run' }
];

const lead_evaluation = {
  evaluated_at: new Date().toISOString(),
  evaluated_by: 'LEAD',
  questions: {
    q1_need_validation: 'YES - parent SD shipped backend producing verdicts but verdicts are invisible to operators; gate has no enforcement surface. Documented in parent PRD.metadata.scope_amendment.deferred[0].',
    q2_solution_assessment: 'YES - aligns with EHG-2028 vision (Chairman orchestrating AI agents). Stage gate enforcement is core to LEO governance posture.',
    q3_feasibility: 'HIGH - all backend contracts exist (code_quality_report, venture_quality_findings, audit_log). Pure UI + RPC client work. ~200 LOC estimate.',
    q4_value: 'HIGH - converts dormant backend into active gate. Without UI, S20 analyzer is observability-only; with UI, it is enforceable.',
    q5_existing_tools: 'YES - reuses Stage<N>VerdictPanel pattern (S19 BUILD, S22 distribution); reuses audit_log infrastructure; reuses feature flag system.',
    q6_risk: 'LOW-MEDIUM - flag default OFF de-risks rollout; manual override de-risks false positives; audit trail de-risks abuse. Documented in risks array.',
    q7_ui_inspectability: 'YES - Stage20VerdictPanel makes verdict + findings + remediation SDs human-inspectable; severity badges; override audit visible on chairman dashboard.',
    q8_scope_reduction: 'EHG-side only (no EHG_Engineer changes). Backend FR-1, FR-2, FR-4, FR-7, FR-8 already shipped in parent SD - excluded from this scope. Net 0% reduction vs scope_amendment defined in parent PRD; the scope was already pre-bounded.',
    q9_human_demo: '4-step smoke test populated in smoke_test_steps - covers panel render, flag-on refusal, manual override + audit, BLOCKED + S19 return.'
  },
  approval: 'APPROVED',
  approval_rationale: 'Closes scope_amendment.deferred work from parent SD-LEO-FEAT-STAGE-CODE-QUALITY-001. Backend contracts exist, UI patterns established (S19/S22 panels), feature flag de-risks rollout. Standard EHG feature work.'
};

(async () => {
  // Fetch existing metadata to merge
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();

  const newMetadata = { ...(existing?.metadata || {}), lead_evaluation };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      success_criteria,
      smoke_test_steps,
      key_changes,
      key_principles,
      strategic_objectives,
      risks,
      metadata: newMetadata
    })
    .eq('sd_key', SD_KEY)
    .select('sd_key, success_criteria, smoke_test_steps, key_changes, key_principles, strategic_objectives, risks');

  if (error) {
    console.error('UPDATE FAILED:', error);
    process.exit(1);
  }
  console.log('UPDATED:');
  console.log(JSON.stringify(data, null, 2));
})();
