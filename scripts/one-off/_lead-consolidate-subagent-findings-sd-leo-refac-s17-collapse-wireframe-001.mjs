// Consolidates LEAD-phase sub-agent findings (RISK PASS@86, VALIDATION WARNING@92,
// TESTING WARNING@88, DESIGN WARNING@88) into SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001
// metadata.lead_decision.prd_conditions[] and extends risks[] with the new risks
// surfaced empirically by RISK + DESIGN sub-agents.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const sdKey = 'SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001';

const { data: sd, error: selErr } = await sb
  .from('strategic_directives_v2')
  .select('id, sd_key, metadata, risks')
  .eq('sd_key', sdKey)
  .single();
if (selErr) { console.error('SELECT FAILED:', selErr); process.exit(1); }

const md = sd.metadata || {};
const ld = md.lead_decision || {};

// PRD conditions consolidated from all 4 sub-agent verdicts.
// PLAN PRD must address each before LEAD-FINAL-APPROVAL.
const prd_conditions = [
  // SCHEMA RECONCILIATIONS (from RISK + VALIDATION — both flagged)
  { id: 'PRD-1', source: 'RISK+VALIDATION', severity: 'critical', condition: 'PRD must resolve artifact_type enum mismatch. design_mockups is NOT in the production venture_artifacts.artifact_type CHECK constraint (~150 EHG-specific values exist). RECOMMENDED: pick existing s17_approved for naming parity OR extend the CHECK in this SD migration. Explicit ADR required.' },
  { id: 'PRD-2', source: 'RISK+VALIDATION', severity: 'high', condition: 'PRD must use the wider unique index reality: (venture_id, lifecycle_stage, artifact_type, COALESCE(metadata->>screenId, __no_screen__)) WHERE is_current=true. Venture-level row keys on __no_screen__ sentinel. lifecycle_stage=17 must be set on the row.' },
  { id: 'PRD-3', source: 'RISK+VALIDATION+DESIGN', severity: 'high', condition: 'PRD must pick approval-flag location with explicit ADR. RECOMMENDED: venture_artifacts.metadata.approval_status (pattern reuse; no new table; leverages existing is_current versioning). Alternative: venture_artifacts.validation_status (already exists per RISK probe) — RISK agent recommendation.' },
  { id: 'PRD-4', source: 'VALIDATION', severity: 'medium', condition: 'PRD must address the pre-existing writer-consumer asymmetry empirically observed: useCaptureArtifact writes to venture_wireframe_artifact (table ABSENT on prod) and resolveArtifact reads venture_gvos_profile.lovable_artifact (different table). Both legacy paths are effectively dead code on prod. Document deletion-vs-deprecate stance for the abandoned legacy code surfaces.' },
  { id: 'PRD-5', source: 'RISK', severity: 'medium', condition: 'PRD must specify GitHub token policy and 60/hr rate-limit handling UX (cliff for chairmen). The github_sync mode requires either a personal-access token per chairman or a venture-scoped service token; both have UX trade-offs.' },
  { id: 'PRD-6', source: 'RISK', severity: 'medium', condition: 'PRD must decide whether to retire wireframe-fidelity scorer (src/lib/gvos/wireframe-fidelity.ts) in same SD. The scorer is orphaned after refactor (fidelity badges removed; gate predicate drops fidelity check). Keep for other consumers OR retire to reduce dead-code surface.' },
  { id: 'PRD-7', source: 'RISK', severity: 'medium', condition: 'PRD must handle sandbox-blocked migration apply (exec_sql RPC unavailable to service-role per RISK probe). Migration ships in PR; applied via Supabase dashboard or direct pg post-merge. Pattern precedent: SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001.' },

  // RESOLVER STRATEGY (TESTING vs VALIDATION recommend different things)
  { id: 'PRD-8', source: 'TESTING+VALIDATION', severity: 'high', condition: 'PRD must decide cutover vs shadow-write for resolveArtifact. TESTING recommends SHADOW-WRITE both during this SD (keeps blast radius ≤100 LOC). VALIDATION recommends CUTOVER (consumer count is empirically zero; cutover blast-radius contained to this SD). Both views valid — PLAN picks with reasoning.' },

  // TESTING-PHASE CONDITIONS
  { id: 'PRD-9', source: 'TESTING', severity: 'high', condition: 'PRD must include all 8 acceptance criteria verbatim (AC-1 through AC-8 in TESTING sub_agent_execution_results row 950f2ae8-f2f6-49e0-abc9-19002a487f3b). Critical: AC-3 (github_sync pending-sha gate), AC-7 (legacy deletion grep verification), AC-8 (sub-flag retirement dormancy chain).' },
  { id: 'PRD-10', source: 'TESTING', severity: 'high', condition: 'PRD must enumerate canContinueStage17 breaking signature change. Current signature (wireframes, approvalState, fidelityState) → new (ventureApprovalFlag, artifactReadyState). Currently exported; all callers (likely only WireframeSectionList.tsx) must be updated in same PR.' },
  { id: 'PRD-11', source: 'TESTING', severity: 'high', condition: 'PRD must replace activation_test_id before LEAD-FINAL-APPROVAL. Currently points at tests/e2e/stage17/per-wireframe-activation-invariant.spec.ts (being deleted). New venture-level spec path required; OR accept ACTIV-CHAIN-DEFERRED bypass per S11 precedent.' },
  { id: 'PRD-12', source: 'TESTING', severity: 'medium', condition: 'EXEC must capture baseline test snapshot to docs/baselines/SD-LEO-REFAC-S17-COLLAPSE-WIREFRAME-001/ before edits (PAT-RECURSION-001/005).' },

  // DESIGN-PHASE CONDITIONS (UI/UX/a11y)
  { id: 'PRD-13', source: 'DESIGN', severity: 'medium', condition: 'PRD documents the per-wireframe quality badge removal rationale: user-directed scope cut per LEAD scope-lock (badges removed to align with venture-level approval mental model). Fidelity badge removal is approved (becomes vacuous at venture level).' },
  { id: 'PRD-14', source: 'DESIGN', severity: 'high', condition: 'Artifact-readiness state machine MUST gate the venture-level Switch. States: empty | pending_webhook | ready | error. Switch enabled IFF state===ready. NO pre-approve path — prevents downstream ArtifactNotReadyError ghost-approved state.' },
  { id: 'PRD-15', source: 'DESIGN', severity: 'medium', condition: 'PRD specifies shadcn Tabs (not RadioGroup, not single smart-detect input) for file/URL mutual exclusion. TabsList needs aria-label="Capture method".' },
  { id: 'PRD-16', source: 'DESIGN', severity: 'medium', condition: 'Stripped per-wireframe sections MUST remain in <Card> (do NOT flatten to <ul><li>). Keep CardHeader with name + role Badge. Add "Prompt N of M" counter for navigational scent.' },
  { id: 'PRD-17', source: 'DESIGN', severity: 'high', condition: 'Venture-level Switch MUST have explicit <Label htmlFor> + aria-describedby pointing to helper text. shadcn (Radix) Switch does NOT auto-associate — SR a11y fails without this.' },
  { id: 'PRD-18', source: 'DESIGN', severity: 'high', condition: 'Continue gate disabled tooltip MUST include actionable guidance ("Capture and approve venture artifact at bottom of page"), not just state. Consider sticky-bottom approval bar OR top-of-page aria-live aggregate header for skim affordance on long-scroll pages (12+ wireframes).' }
];

// Extend risks[] with new ones surfaced by RISK + DESIGN sub-agents.
// Existing 7 risks (R-01..R-07) remain. Some re-scoped per empirical findings.
const newRisks = [
  // RISK-agent newly empirical
  { id: 'R-NEW-1', category: 'security', description: 'New useVentureArtifactCapture mutation runs under chairman session — RLS policy on venture_artifacts checks INSERT for that role. Probe RLS execution context before EXEC writes a row from the app.', likelihood: 'low', impact: 'high', priority: 9, mitigation: 'PLAN includes RLS probe as an acceptance criterion. EXEC verifies via test that an authenticated chairman session can INSERT/UPDATE venture_artifacts rows.' },
  { id: 'R-NEW-2', category: 'data', description: 'Unique-index-shape misread in SD — actual partial-unique is wider (4 columns + screenId sentinel + lifecycle_stage). Naive INSERT without lifecycle_stage=17 + screenId-absence will fail.', likelihood: 'medium', impact: 'high', priority: 12, mitigation: 'PRD locks the exact row shape (metadata without screenId key, lifecycle_stage=17). EXEC integration test asserts UPSERT idempotency.' },
  { id: 'R-NEW-3', category: 'data', description: 'artifact_type=design_mockups NOT in production venture_artifacts.artifact_type CHECK enum. Naive INSERT will fail constraint check.', likelihood: 'high', impact: 'high', priority: 16, mitigation: 'PRD picks existing enum value (s17_approved recommended) OR ships ADD CONSTRAINT migration in this SD. PRD-1 PRD condition.' },
  { id: 'R-NEW-4', category: 'operational', description: 'exec_sql RPC unavailable to service-role on this Supabase project (empirically probed). Schema migration cannot be applied via supabase-js — needs Supabase dashboard or direct pg apply post-merge.', likelihood: 'high', impact: 'medium', priority: 12, mitigation: 'PRD specifies migration ships in PR; applied via Supabase dashboard SQL editor or direct pg post-merge. Document the apply-and-canary step in retrospective.' },
  { id: 'R-NEW-5', category: 'ux', description: 'GitHub API rate limit is 60/hr unauthenticated, 5000/hr authenticated. github_sync mode without a token will hit cliff on any venture with >60 chairman page-loads/hr.', likelihood: 'medium', impact: 'medium', priority: 9, mitigation: 'PRD specifies token policy (per-chairman PAT OR venture-scoped service token); UI shows rate-limit warning when approaching cliff.' },
  { id: 'R-NEW-6', category: 'dead-code', description: 'wireframe-fidelity scorer (src/lib/gvos/wireframe-fidelity.ts) is orphaned after refactor — fidelity badges removed, gate predicate drops fidelity check. Becomes dead code unless other consumers exist.', likelihood: 'high', impact: 'low', priority: 6, mitigation: 'PRD decides retire-in-same-SD vs keep-for-other-consumers. Grep verifies all consumers before deletion if chosen.' },
  // DESIGN-agent risks beyond what's already in PRD conditions
  { id: 'D-R-04', category: 'accessibility', description: 'Radix Switch without explicit <Label htmlFor> fails screen-reader association — chairman using SR cannot identify the venture-level Switch purpose.', likelihood: 'high', impact: 'medium', priority: 12, mitigation: 'PRD-17 PRD condition enforces the Label + aria-describedby. EXEC unit test asserts the relationship.' },
  { id: 'D-R-05', category: 'ux', description: 'Bottom-of-page approval block invisible on long-scroll pages (12+ wireframes). Chairmen may not find the approval control on first load.', likelihood: 'medium', impact: 'medium', priority: 9, mitigation: 'PRD-18 specifies sticky-bottom approval bar OR top-of-page aria-live aggregate header. PLAN picks one or both.' }
];

const updatedRisks = [...(sd.risks || []), ...newRisks];

// Re-score R-01 (downstream consumer migration) — RISK + VALIDATION both confirmed
// consumer count is empirically ZERO. Update mitigation to recommend CUTOVER.
const existingRisksUpdated = updatedRisks.map(r => {
  if (r.id === 'R-01') {
    return { ...r, likelihood: 'low', impact: 'low', priority: 4, mitigation: 'EMPIRICALLY DE-RISKED: VALIDATION + RISK probes confirm S19 prompt regen, adherence validator do NOT exist in EHG codebase; resolveArtifact has zero production callers. CUTOVER recommended (TESTING dissents — recommends shadow-write for safety). PLAN picks via PRD-8.' };
  }
  if (r.id === 'R-02') {
    return { ...r, likelihood: 'low', impact: 'low', priority: 2, mitigation: 'EMPIRICALLY DE-RISKED: only 1 venture exists in EHG DB (Cron Canary); venture_gvos_profile.lovable_artifact has 0 non-null rows. No chairman to lose state.' };
  }
  if (r.id === 'R-05') {
    return { ...r, likelihood: 'low', impact: 'low', priority: 2, mitigation: 'EMPIRICALLY DE-RISKED: venture_wireframe_artifact table ABSENT on prod (0 rows). Nothing to preserve for inline_html mode.' };
  }
  if (r.id === 'R-07') {
    return { ...r, mitigation: 'Sub-flag lives in leo_feature_flags (NOT feature_flags) as row c37fac15-a8c4-4104-a98a-328b30263b6e. Use soft-retire pattern: set is_enabled=false, lifecycle_state=retired. PLAN includes the retire-migration.' };
  }
  return r;
});

// Re-write metadata.lead_decision with prd_conditions + correction notes
ld.prd_conditions = prd_conditions;
ld.sub_agent_evidence = {
  RISK: { row_id: '90c62cfa-6091-472e-8613-20a947e61c4e', verdict: 'PASS', confidence: 86, overall_risk: 'MEDIUM (domain max=5)' },
  VALIDATION: { row_id: '699ded3b-624a-4d20-a8c9-75ece15e43e1', verdict: 'WARNING', confidence: 92, summary: '4 claims FALSE/NEEDS-FIX; cutover risk over-stated; artifact_type mismatch is hard PRD-blocker' },
  TESTING: { row_id: '950f2ae8-f2f6-49e0-abc9-19002a487f3b', verdict: 'WARNING', confidence: 88, summary: '3 PRD-level decisions required; 8 ACs documented; 7 regression risks ranked' },
  DESIGN: { row_id: '04110e06-837d-4ab2-af86-6f97a785972d', verdict: 'WARNING', confidence: 88, summary: '6 design conditions; 2 HIGH-severity (artifact-readiness state machine + Switch a11y label)' }
};
ld.empirical_corrections = [
  'artifact_type=design_mockups NOT in production CHECK enum — picking from s17_approved/etc. is PLAN decision (PRD-1)',
  'venture_wireframe_artifact table ABSENT on prod — was always dead code',
  'resolveArtifact reads venture_gvos_profile.lovable_artifact (NOT venture_wireframe_artifact)',
  'leo_feature_flags is the table name (NOT feature_flags); flag row id c37fac15-a8c4-4104-a98a-328b30263b6e',
  'Only 1 venture exists in EHG DB (Cron Canary) — in-flight state loss empirically de-risked',
  'venture_artifacts unique index is wider than originally claimed — includes lifecycle_stage + screenId sentinel'
];
ld.handoff_recommendation = 'LEAD-TO-PLAN PROCEED with 18 PRD conditions inheriting to PLAN. All 4 sub-agents non-blocking (RISK PASS, 3× WARNING). No critical-risk blockers. PLAN must address PRD-1 (artifact_type) + PRD-2 (unique index shape) + PRD-3 (approval-flag location) FIRST as schema foundation.';
md.lead_decision = ld;

// Also fix the files_affected count typo (was 13 in plan, 14 in metadata — keep 14, correct)

const { error: updErr } = await sb
  .from('strategic_directives_v2')
  .update({ risks: existingRisksUpdated, metadata: md })
  .eq('sd_key', sdKey);

if (updErr) { console.error('UPDATE FAILED:', updErr); process.exit(1); }

console.log('OK:');
console.log({
  risks_count: existingRisksUpdated.length,
  prd_conditions_count: prd_conditions.length,
  sub_agent_evidence_count: Object.keys(ld.sub_agent_evidence).length,
  empirical_corrections_count: ld.empirical_corrections.length
});
