// risk-agent LEAD-phase evidence row v2 — schema-aligned (verdict/confidence/critical_issues/warnings/recommendations/detailed_analysis/summary/metadata/phase/sub_agent_code)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '9d966989-c8d8-47f4-9eba-ee8056a829d1';
const SD_KEY = 'SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001';
const overall_verdict = 'CONCERNS';
const overall_risk = 'MEDIUM';

const critical_issues = [
  'R-1: W-1 reframing risk — 2 empirical UPDATE probes DISPROVE cascade-trigger overreach hypothesis. Single-field and multi-field UPDATEs both preserved all 3 claim cols. Symptom must be attributed elsewhere.',
  'R-12: Scope creep risk — if PRD locks FR-2 to "modify cascade trigger" before root cause confirmed, EXEC will be locked into wrong fix surface. PRD MUST scope FR-2 as CONDITIONAL with three named alternatives.',
  'R-4: PG-side release_sd / release_session functions DO NULL claiming_session_id (across multiple overlapping migrations 20260213, 20260218, 20260306). Most-recent CREATE OR REPLACE wins — pg_proc query required at PLAN, not migration files.',
  'R-5: cleanup_stale_sessions race (W-1 candidate (a)) — 300s stale threshold can fire during long sub-agent execution, clearing is_working_on + active_session_id. If it ALSO calls release_sd, claiming_session_id cleared too.'
];

const warnings = [
  'R-2: sync_is_working_on_with_session AFTER UPDATE on claude_sessions cascades to strategic_directives_v2 SET is_working_on=false, active_session_id=NULL — but does NOT touch claiming_session_id. Does not match full reported symptom alone.',
  'R-3: App-side claiming_session_id NULL writers bounded to 7 sites (claim-lifecycle-release, claim-validity-gate, drain-orchestrator x2, cancel-sd, leo-create-sd) — all have CAS or intentional release patterns.',
  'R-6: Migration vs code split — sandbox-blocked migrations frequent (PR #3691, SD-WORKTREE-CLEANUP-WINDOWS); FR-3 must ship code-only without depending on FR-2 migration.',
  'R-7: Backward-compat — existing release/takeover callers explicitly name claim cols in SET; "do not clear unless explicitly named" semantic preserves their behavior.',
  'R-8: PostgREST schema-cache miss class — migration MUST end with NOTIFY pgrst, \'reload schema\'; (PR #3691 W-2).',
  'R-9: SECURITY DEFINER risk on sd_orphan_protection / pipeline_metrics / sd_workflow_templates functions — re-issue GRANT post-CREATE OR REPLACE.',
  'R-10: Static-pin false-positive class (5 SDs in a row) — body-scoped src.slice + (path,line) tuple allowlist required.',
  'R-11: Two-phase risk-agent cadence essential (PR #3691 PA-1 lesson) — re-run at PLAN with literal SQL evidence.',
  'R-13: Memory note may be misattributed; only one _restore-claim helper exists (this SD\'s). PLAN database-agent should produce a reproducer; if none, FR-2 deferred.',
  'R-14: PA-1-class BLOCKER on canonical writer interface — design contract to RETAIN claim cols if passed (no rejection); reject only NEW callers omitting them.',
  'R-15: PR_PRECHECK at LEAD-FINAL hard-blocks open PRs (PR #3684 retro witness)'
];

const recommendations = [
  'PRD MUST scope FR-2 (root cause fix) as CONDITIONAL with three named alternatives: (a) modify cascade trigger if confirmed by PLAN database-agent; (b) extend cleanup_stale_sessions threshold or add in-progress-handoff lock; (c) add session-active guard to PG-side release_sd. Decision deferred to PLAN database-agent + risk-agent v2.',
  'FR-3 (canonical writer lib/governance/safe-sd-update.js + static-pin test) is the GUARANTEED primary deliverable. Provides immunity REGARDLESS of root cause class via "explicit-write contract" (claim cols only touched if named in input). Backward-compat preserved.',
  'PLAN database-agent owns reproducer creation. If symptom cannot be reproduced, FR-2 deferred to follow-up SD; FR-3 ships alone as defense-in-depth.',
  'PLAN database-agent MUST query pg_proc for live release_sd / release_session / cleanup_stale_sessions / sync_is_working_on_with_session definitions — NOT trust migration files (multiple overlapping CREATE OR REPLACE).',
  'Risk-agent v2 invocation REQUIRED after PLAN database-agent surfaces actual root cause + proposed migration SQL. PRD success metrics must include this cadence.',
  'Migration (if any in FR-2) MUST end with NOTIFY pgrst, \'reload schema\'; in same transaction; static guard test asserts presence.',
  'Static-pin tests use body-scoped src.slice(funcStart, funcEnd) + (path,line) tuple allowlist (PR #3693 pattern), NOT file-wide regex.',
  'FR-3 should include heartbeat-lag observability instrumentation (e.g., warn when handoff in progress AND session age approaching 300s threshold) to detect candidate (a)/(b) at runtime — feeds back into root cause confirmation.',
  'EXEC plan: ensure PR is mergeable (CI green) BEFORE PLAN-TO-LEAD invocation. If migration sandbox-blocked, ensure FR-3 code-only path produces green CI without it.'
];

const detailed_analysis = `OVERALL RISK: ${overall_risk} / VERDICT: ${overall_verdict}

EMPIRICAL FINDINGS (LEAD-phase risk probes):

PROBE 1 — single-field UPDATE on strategic_directives_v2 (description-touch only):
  BEFORE: claiming_session_id=f039672c..., is_working_on=true, active_session_id=f039672c...
  AFTER:  claiming_session_id=f039672c... (PRESERVED), is_working_on=true (PRESERVED), active_session_id=f039672c... (PRESERVED)
  cascade_overreach_reproduced: false

PROBE 2 — multi-field UPDATE (status, current_phase, progress_percentage, metadata — handoff-style):
  BEFORE: claim cols all populated
  AFTER:  claim cols all PRESERVED
  cascade_overreach_reproduced: false

CONCLUSION: cascade-trigger-overreach hypothesis EMPIRICALLY DISPROVEN at LEAD via two independent UPDATE probes on the live SD. Symptom attribution requires PLAN database-agent reframing.

ROOT CAUSE LANDSCAPE (REFRAMED) — ranked by likelihood:
  (a) HIGH: cleanup_stale_sessions cron (300s) firing during long sub-agent execution — clears is_working_on + active_session_id; if cleanup_stale_sessions ALSO invokes release_sd, claiming_session_id cleared too. Empirically supported by migration evidence (20260201_intelligent_session_lifecycle.sql:347-351 + 20260213 release_sd).
  (b) HIGH: PG-side release_sd / release_session / claim_sd called by another concurrent worker (drain-orchestrator + multi-session-coordination). Multiple overlapping migration definitions — PLAN must query pg_proc for live version.
  (c) MEDIUM: sync_is_working_on_with_session AFTER UPDATE on claude_sessions cascading on session row changes (20260130_multi_session_pessimistic_locking.sql:39-69). NOTE: this trigger does NOT touch claiming_session_id, so cannot fully account for symptom alone.
  (d) LOW: actual BEFORE/UPDATE trigger on strategic_directives_v2 with claim col overreach (W-1 testing-agent finding: NONE found; risk-agent probes confirm).

ENUMERATED 16 BEFORE/AFTER UPDATE TRIGGERS ON strategic_directives_v2 (all candidates for FR-2 PATH A):
  20251227_refactor_intensity_levels.sql:205 (BEFORE UPDATE)
  20260124_relax_child_creation_timing.sql:124 (BEFORE UPDATE)
  20260201_pipeline_metrics.sql:146 (AFTER UPDATE)
  20260202_sd_type_change_governance_fixed.sql:219 (BEFORE UPDATE)
  20260207_feedback_auto_close_triggers.sql:52 (AFTER UPDATE)
  20260207_sync_type_change_reason_column_and_jsonb.sql:43 (BEFORE UPDATE)
  20260221_auto_close_deliverables_on_sd_completion.sql:55 (AFTER UPDATE)
  20260313_scope_governance.sql:37 (BEFORE UPDATE)
  20260314_quality_checked_enforcement_triggers.sql:126 (BEFORE UPDATE)
  20260412_deferred_sd_audit_trigger.sql:43 (BEFORE UPDATE)
  add_status_automation.sql:83 (BEFORE UPDATE)
  create-subagent-automation.sql:84 (AFTER UPDATE)
  sd_orphan_protection.sql:138 (BEFORE UPDATE)
  sd_type_change_risk_assessment.sql:408 (BEFORE UPDATE)
  sd_type_timing_restrictions.sql:124 (BEFORE UPDATE)
  + sync_is_working_on_trigger ON claude_sessions (cascades to SD; FR-2 PATH A candidate)

APP-SIDE claiming_session_id NULL WRITERS (bounded — only 7 sites):
  lib/claim-lifecycle-release.mjs:94 (CAS pattern, correct)
  lib/claim-validity-gate.js:353 (orphan auto-release with .eq, correct)
  lib/drain-orchestrator.mjs:358,507 (drain path, correct)
  scripts/cancel-sd.js:102 (explicit cancel, correct)
  scripts/leo-create-sd.js:524 (INSERT default, not relevant)

BLAST RADIUS MATRIX (per FR-2 path):
  PATH A (modify cascade trigger): HIGH blast radius — any SD UPDATE flows through trigger; fix-or-bypass changes touched-row scope. 16+ trigger candidates need enumeration via pg_trigger before scoping. Risk of breaking deferred_sd_audit_trigger / sd_type_change_governance / scope_governance / quality_checked_enforcement_triggers.
  PATH B (app-side fix — cleanup_stale_sessions threshold extension OR in-progress-handoff lock OR serialize cron): MEDIUM blast radius — only cleanup-cron callers affected; harder to test pre-merge but contained. Recommended if root cause confirmed as candidate (a).
  PATH C (PG-side release_sd guard — no-op when target SD has active heartbeat): MEDIUM blast radius — release_sd has multiple callers (drain, manual cancel, orchestrator); guard must be additive (default-allow when heartbeat absent for backward-compat). Recommended if root cause confirmed as candidate (b).
  FR-3 (canonical writer + static-pin): LOW blast radius — opt-in via env flag, backward-compatible (existing callers continue to pass claim cols inline; writer honors). Provides immunity REGARDLESS of root cause class.

NEW RISKS FLAGGED (8 beyond your existing 7 PRD risks):
  R-1: W-1 reframing (empirical disproof of cascade-trigger hypothesis) — HIGH/CERTAIN
  R-3: app-side NULL writers bounded (narrows surface) — LOW/CONFIRMED
  R-4: PG-side release_sd is most likely culprit — HIGH/PROBABLE
  R-5: cleanup_stale_sessions race (W-1 cand (a)) — HIGH/PROBABLE
  R-13: Memory note may be misattributed — MEDIUM/POSSIBLE
  R-14: PA-1-class BLOCKER on canonical writer interface — MEDIUM/MEDIUM
  R-15: PR_PRECHECK at LEAD-FINAL hard-blocks open PRs — LOW/MEDIUM
  (R-2 sync_is_working_on does NOT touch claiming_session_id — partial overlap with your existing trigger-break risk but distinct insight)

YOUR EXISTING 7 PRD RISKS — coverage map:
  trigger break        → R-2 (refined: only is_working_on+active_session_id, NOT claiming_session_id)
  schema cache         → R-8 (NOTIFY pgrst, 'reload schema' required)
  sandbox-block        → R-6 (FR-3 must ship code-only)
  static-pin FP        → R-10 (body-scoped src.slice + path,line tuples)
  scope-creep          → R-12 (PRD scopes FR-2 as CONDITIONAL)
  SECURITY DEFINER     → R-9 (re-issue GRANT post-CREATE OR REPLACE)
  two-phase risk-agent → R-11 (re-run at PLAN with literal SQL)

VERDICT: CONCERNS (NOT BLOCK). The SD's strategic intent (close 18-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 cascade-trigger overreach variant via canonical writer + opt-in adoption) remains sound. But the framing "cascade-trigger overreach" is empirically not supported at LEAD; PRD must reframe FR-2 as CONDITIONAL pending PLAN database-agent root cause confirmation, with FR-3 (canonical writer + static-pin) as the GUARANTEED primary deliverable.
`;

const summary = `LEAD risk: MEDIUM/CONCERNS. 2 empirical UPDATE probes DISPROVE cascade-trigger overreach. 4 critical issues + 11 warnings + 9 recommendations. Reframe FR-2 as CONDITIONAL (3 alternatives); FR-3 canonical writer is GUARANTEED primary deliverable. 8 new risks beyond PRD's 7.`;

const evidenceRow = {
  id: randomUUID(),
  sd_id: SD_ID,
  sub_agent_code: 'RISK',
  sub_agent_name: 'risk-agent',
  phase: 'LEAD',
  verdict: 'WARNING',
  confidence: 87,
  critical_issues,
  warnings,
  recommendations,
  detailed_analysis,
  summary,
  source: 'risk-agent',
  validation_mode: 'prospective',
  metadata: {
    sd_key: SD_KEY,
    overall_risk,
    cadence: 'phase-1-of-two (re-run at PLAN with literal evidence)',
    different_row_than_testing_agent: '1303d211-d755-4a58-a617-d6f569f01ef3',
    empirical_probes_run: 2,
    probes_disproved_hypothesis: true,
    reframing_recommended: true,
    invoked_by: 'LEAD',
    new_risks_beyond_prd: ['R-1', 'R-3', 'R-4', 'R-5', 'R-13', 'R-14', 'R-15'],
    risk_count: 15,
    blast_radius_summary: {
      FR2_path_A_trigger_modify: 'HIGH',
      FR2_path_B_cleanup_threshold: 'MEDIUM',
      FR2_path_C_release_sd_guard: 'MEDIUM',
      FR3_canonical_writer: 'LOW (opt-in, backward-compat)'
    }
  },
  created_at: new Date().toISOString()
};

const { data, error } = await sb.from('sub_agent_execution_results').insert(evidenceRow).select('id, sub_agent_code, phase, verdict, confidence').single();
if (error) {
  console.error('[risk-agent] INSERT FAILED:', error);
  process.exit(1);
}
console.log('[risk-agent] LEAD-phase evidence row written:');
console.log(JSON.stringify(data, null, 2));
console.log('\n[risk-agent] SUMMARY:', summary);
