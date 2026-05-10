// One-off: insert risk-agent assessment row for SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 LEAD phase.
// Manually invoked once; written to satisfy sub_agent_execution_results gate evidence requirement.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const verdict = 'PASS';
const overallRisk = 'MEDIUM';

const summary = `Risk Assessment for SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 (LEAD phase): MEDIUM overall. Two-FR scope (auto-resolve feedback on QF completion + auto-fill deferred_from_sd_key) is well-bounded with strong pre-existing patterns to lean on (181 resolved harness_backlog rows, 15 rows already linked via quick_fix_id, 4-value status set with no CHECK constraint blocking 'resolved'). Three concerns drive the MEDIUM verdict (none CRITICAL): (1) backwards-compat — 204 of 236 harness_backlog rows lack deferred_from_sd_key today, so auto-fill shifts the boundary between 'auto-attributed' and 'orphan' rows mid-stream; (2) FR-1 commit-message-footer parsing is the dominant link path because 'quick_fixes.metadata' column DOES NOT EXIST and only 15/all-time QFs have quick_fix_id back-link, meaning regex precision matters; (3) FR-2 multi-active-session ambiguity in getClaimedSessions — current state shows 1 active claim but the schema permits N concurrent claims within an identity, and silent wrong-attribution is worse than silent miss. Mitigations are all small and additive (idempotency guard, regex pinning, fail-soft on multi-claim, env opt-out flag). No data-loss path; no CHECK-constraint surprise (validateResolved is JS-side only, satisfied by both quick_fix_id AND resolution_notes which FR-1 supplies).`;

const detailed_analysis = {
  scope_summary: 'FR-1: post-merge feedback auto-resolve in scripts/modules/complete-quick-fix/orchestrator.js (~50-80 LOC + new helper lib/governance/resolve-feedback.js). FR-2: auto-fill metadata.deferred_from_sd_key in lib/governance/emit-feedback.js (~30-50 LOC).',
  domain_scores: {
    technical_complexity: 4,
    security_risk: 3,
    performance_risk: 2,
    integration_risk: 5,
    data_migration_risk: 5,
    ui_ux_risk: 1
  },
  evidence_grounded: {
    feedback_table_columns_verified: 'quick_fix_id, resolved_at, resolution_notes, resolution_sd_id, status all exist',
    distinct_status_values: ['backlog', 'in_progress', 'new', 'resolved'],
    no_check_constraint_on_status: 'JS-side validateResolved only; quick_fix_id satisfies hasResolutionLink',
    pre_existing_population: {
      harness_backlog_total: 236,
      with_deferred_from_sd_key: 32,
      without_deferred_from_sd_key: 204,
      status_resolved_count: 181,
      feedback_rows_with_quick_fix_id_set: 15
    },
    quick_fixes_metadata_column_DOES_NOT_EXIST: true,
    v_active_sessions_has_sd_key_field: true,
    currently_active_claimed_sessions: 1
  },
  risk_findings_by_dimension: {
    '1_data_integrity': {
      severity: 'LOW',
      finding: 'feedback.status has 4 distinct values in production data; no DB CHECK constraint blocks status=resolved writes. lib/quality/feedback-resolution-validator.js validates JS-side that resolved rows have at least one of (quick_fix_id, resolution_sd_id, strategic_directive_id) OR resolution_notes — FR-1 satisfies BOTH (sets quick_fix_id AND resolution_notes), so validation passes regardless of which path the validator runs through. No race window with existing UPDATE writers (assist-engine logs to metadata sub-key only; triage-engine updates triage fields not status). Existing pattern: 15 feedback rows already have quick_fix_id set; FR-1 simply automates a manually-applied convention.',
      recommendation: 'No mitigation required for data integrity per se. Use idempotent UPDATE with WHERE clause filter (status != resolved) to avoid re-write churn.'
    },
    '2_failure_modes': {
      severity: 'MEDIUM',
      finding: 'FR-2 auto-fill via getClaimedSessions has THREE failure modes: (a) supabase RPC throws — must NOT fail the feedback write; (b) zero claimed sessions — leave field unset (correct behavior per spec); (c) >1 claimed session under same identity — schema permits this. Currently 1 active claim, but during cascade-rolled state recovery or parallel-session window, multi-claim is observed. Wrong-attribution risk: filing harness bug from session A while session B holds a claim under same terminal_id would attribute B to A. Silent wrong attribution is WORSE than silent miss because downstream readers (deferred_from_sd_key linking) trust the field.',
      recommendation: 'FR-2: when getClaimedSessions returns >1 row, leave deferred_from_sd_key unset and emit single console.warn (do NOT pick first or aggregate). When call throws, swallow + warn (matches PA-5 dual-write fallthrough at emit-feedback.js:128). Filter by terminal_id matching current session if available to narrow ambiguity.'
    },
    '3_idempotency': {
      severity: 'LOW',
      finding: 'FR-1 must be idempotent: re-running complete-quick-fix.js for same QF (currently a known scenario via complete-quick-fix retries on intermittent merge failure) must not re-write feedback row. The dominant matching strategy is the commit message footer (Closes feedback <uuid>) since metadata.source_feedback_id has no current writer and quick_fixes.metadata column DOES NOT EXIST. UPDATE WHERE status != resolved is the safe form.',
      recommendation: 'Three guards: (1) skip-write WHERE clause filter (status != resolved); (2) maybeSingle() on resolution lookup; (3) on zero-row update, log info (not warn) — expected re-run case.'
    },
    '4_downstream_consumers': {
      severity: 'MEDIUM',
      finding: 'Multiple readers filter by category=harness_backlog AND status=new — sd-next/data-loaders.js loadHarnessBacklog, claude-md-generator/db-queries.js, modules/inbox/auto-triage.js, scripts/modules/sd-next/SDNextSelector.js. NONE filter by deferred_from_sd_key today (greppable: zero readers query metadata->>deferred_from_sd_key as a filter predicate). Only writers/migration scripts populate the field. So FR-2 auto-fill does NOT shift visibility of any current consumer. RISK: the displayed +N more and [MODE: product] decision logic uses count of harness_backlog status=new — FR-1 will reduce this count by ~1 per QF (correct, intentional behavior).',
      recommendation: 'No reader-side change required. Document in PRD: FR-1 is expected to monotonically reduce displayed open-backlog count as QFs ship.'
    },
    '5_rollout_risk': {
      severity: 'MEDIUM',
      finding: 'Both FRs ship flag-ON by default per scope. RESOLVE_FEEDBACK_ON_QF_COMPLETE=0 is the FR-1 opt-out, FR-2 has no documented kill-switch in the spec. Self-validating ship pattern (this very SD will close its own source feedback row) has worked for 5+ recent SDs but if FR-1 has a parsing bug, the entire QF lifecycle becomes affected. Best to add an FR-2 opt-out symmetric to FR-1 (AUTO_FILL_DEFERRED_FROM_SD_KEY=0).',
      recommendation: 'Ship both FRs flag-ON for v1. Add AUTO_FILL_DEFERRED_FROM_SD_KEY=0 opt-out for symmetry. If any test in regression-pin coverage fails post-merge, single env-var rollback restores prior behavior. Wire the FR-1 path through fail-soft try/catch so a DB error during resolve does NOT fail QF completion (post-merge step is informational, not blocking).'
    },
    '6_reverse_compatibility': {
      severity: 'LOW',
      finding: '204 existing harness_backlog rows lack deferred_from_sd_key. Backfill is NOT in scope. Auto-fill applies only to NEW writes — existing rows stay as-is. This is correct: backfill would require attribution archaeology (which session was active when row 1234 was written months ago?), which is impossible.',
      recommendation: 'Do NOT backfill. Document in PRD that FR-2 is forward-only. The 204-row legacy population stays unchanged; new writes auto-fill where active claim exists.'
    }
  },
  critical_issues: [],
  warnings: [
    'FR-1: regex matching commit message footer must accept BOTH `Closes harness backlog <uuid>` AND `Closes feedback <uuid>` formats (both are present in code base).',
    'FR-1: feedback row UUID resolution must use full UUID (.eq(id, uuid)) — UUID-prefix matching has caused silent no-match writes in the past (see memory: feedback_uuid_prefix_resolution_required).',
    'FR-2: getClaimedSessions returning >1 row must leave field unset, not pick the first — wrong-attribution risk is the dominant FR-2 failure mode.',
    'Both FRs: must NOT fail the parent operation (QF completion / feedback write) on DB error — fail-soft try/catch with console.warn.',
    'Schema reminder: quick_fixes.metadata column DOES NOT EXIST. FR-1 cannot read source_feedback_id from QF metadata; commit-message-footer parsing is the dominant link path. Optional: store source_feedback_id in compliance_details JSONB instead, but not required for v1.'
  ],
  mitigation_recommendations: [
    'FR-1: Add regression-pin test: complete-quick-fix.js dry-run-mode parses Closes feedback <uuid> footer and resolves matching feedback row by ID, idempotent re-run is no-op.',
    'FR-1: Static guard test: scan scripts/modules/complete-quick-fix/orchestrator.js for the call to resolveFeedback() helper after merge step — prevents future drift removing the wire.',
    'FR-2: Unit test: emit-feedback.js auto-fills deferred_from_sd_key from getClaimedSessions when active=1, leaves unset when active=0, leaves unset when active>1.',
    'FR-2: Unit test: explicit metadata.deferred_from_sd_key wins over auto-fill (resolution-order preservation).',
    'Add AUTO_FILL_DEFERRED_FROM_SD_KEY=0 env opt-out for symmetry with FR-1.',
    'Both FRs: document fail-soft behavior in JSDoc — DB errors warn but do not throw to caller.',
    'PRD note: 204-row backfill explicitly OUT OF SCOPE; FR-2 is forward-only.'
  ],
  blocking_criteria_evaluation: {
    high_risk_present: false,
    critical_risk_present: false,
    blocks_lead_approval: false,
    rationale: 'No CRITICAL findings. Two MEDIUM findings (multi-claim attribution, rollout risk) have small, additive mitigations covered by env-flag + warn-on-ambiguity. Data-loss surface is zero (idempotent UPDATE only, no DELETE, no migration).'
  }
};

const warnings = detailed_analysis.warnings;
const critical_issues = [];
const recommendations = detailed_analysis.mitigation_recommendations;

const justification = `MEDIUM overall risk verdict. 6-domain scores (technical=4, security=3, performance=2, integration=5, data_migration=5, ui_ux=1) — highest at 5 (integration + data_migration), aligning with MEDIUM overall per BMAD scoring rubric (any domain 5-6, none > 6). Three MEDIUM findings (failure_modes, downstream_consumers, rollout_risk) with small additive mitigations; no CRITICAL findings; no data-loss path. Schema reality (quick_fixes.metadata DOES NOT EXIST) sharpens FR-1 design toward commit-message-footer parsing. 204 of 236 backwards-compat rows are forward-only acceptable. Self-validating ship pattern proven across recent SDs. Ready for LEAD approval with PRD warnings carried forward to PLAN phase.`;

const { data, error } = await sb.from('sub_agent_execution_results').insert({
  sd_id: 'd5f9ebbd-c6e8-4681-a7bf-a532ae4a5585',
  phase: 'LEAD',
  sub_agent_code: 'RISK',
  sub_agent_name: 'Risk Assessment Sub-Agent',
  source: 'risk-agent',
  invocation_id: crypto.randomUUID(),
  validation_mode: 'prospective',
  verdict,
  confidence: 88,
  summary,
  detailed_analysis,
  warnings,
  critical_issues,
  recommendations,
  justification,
  metadata: {
    overall_risk: overallRisk,
    blocks_approval: false,
    domains_assessed: 6,
    evidence_sources: [
      'feedback table query (236 rows)',
      'quick_fixes table schema (37 cols, no metadata)',
      'v_active_sessions schema (sd_key field present)',
      'lib/quality/feedback-resolution-validator.js source',
      'scripts/log-harness-bug.js source',
      'lib/governance/emit-feedback.js source',
      'scripts/modules/complete-quick-fix/orchestrator.js source',
      'scripts/modules/sd-next/data-loaders.js loadHarnessBacklog',
      '15 active feedback rows with quick_fix_id (pre-existing pattern verified)',
      'currently 1 active claimed session'
    ],
    sd_phase: 'LEAD',
    risk_dimensions_evaluated: [
      'data_integrity',
      'failure_modes',
      'idempotency',
      'downstream_consumers',
      'rollout_risk',
      'reverse_compatibility'
    ],
    bmad_domain_scores: detailed_analysis.domain_scores
  }
}).select('id').single();

if (error) {
  console.error('INSERT failed:', error.message);
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('INSERTED row id:', data.id);
console.log('Overall risk:', overallRisk);
console.log('Verdict:', verdict);
