#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E — VALIDATION at LEAD-TO-PLAN.
 *
 * Scope: per-field audit triggers on 4 currently-unaudited tables (quick_fixes,
 * claude_sessions, feedback, chairman_ratifications) writing to governance_audit_log,
 * plus 3 CHECK constraints on quick_fixes pairing a disposition with its target/status.
 *
 * Independently re-verified (not trusted from the SD description) against live Postgres:
 *   - column existence (created_by/updated_by) on all 4 target tables
 *   - governance_audit_log row counts for the 4 tables (0, confirming no existing coverage)
 *   - existing triggers on the 4 tables (none write to governance_audit_log)
 *   - existing quick_fixes CHECK constraints (only the 5-value disposition enum exists;
 *     no target-pairing or status-closed-requires-disposition constraint exists yet)
 *   - the 3 empirical counts cited in the SD's success_criteria (duplicate_of/null=5,
 *     promoted/no-target=0, closed/disposition-null=16)
 *   - duplicate/overlap search across scripts/, lib/, database/migrations/ and
 *     strategic_directives_v2/quick_fixes for prior or competing implementations
 *   - sibling children (002-A..F) for scope overlap
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'VAL-1',
      severity: 'LOW',
      issue: 'Internal inconsistency between the SD description and its own success_criteria measure text on the closed/disposition-null count',
      evidence:
        "The description's LEAD-PHASE INVESTIGATION FINDINGS block explicitly corrects the count to 16 ('16 (not 15 as originally cited) -- re-measure at PLAN time, this count moves'). But success_criteria[2].measure still reads 'MEASURED 2026-09-03: 15 of 108 closed rows'. Independently re-queried live: SELECT count(*) FROM quick_fixes WHERE status='closed' AND disposition IS NULL = 16, confirming the description's correction and NOT the stale success_criteria text. The success_criteria field was not updated when the description was corrected.",
      location: "strategic_directives_v2.success_criteria[2] for SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E",
      recommendation:
        'PLAN should re-measure this count at PRD-creation time per the SD\'s own instruction and correct the success_criteria measure text to match (or note both were superseded by a fresh count), rather than carrying two disagreeing numbers into the PRD. Non-blocking for LEAD-TO-PLAN -- the description already flags the drift and instructs re-measurement.',
    },
  ],
  recommendations: [
    'Proceed to PLAN. Scope is well-specified, empirically grounded, and independently re-verified with no material discrepancy against live database state.',
    'PLAN should re-measure the closed/disposition-null count (16 as of this review) immediately before drafting the backfill/grandfather list, since the SD itself documents the count moves.',
    'PLAN should specify the jsonb-extraction-based trigger variant per the description\'s own design note (to_jsonb(NEW)->>col rather than NEW.col direct reference) given the confirmed column gaps on 3 of the 4 tables.',
    'PLAN should decide the grandfather disposition value (e.g. legacy_closed_pre_enforcement) and the backfill mechanism for the 16 historical closed/null rows before the CHECK constraint can be added without breaking existing data.',
  ],
  detailed_analysis: [
    'VALIDATION at LEAD-TO-PLAN for SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E (child E of SD-LEO-ORCH-CAPA-RECORD-TRUTH-002, W4 of the Foundation CAPA plan).',
    '',
    'STEP 1 -- SD state read directly from strategic_directives_v2 (not assumed): title/description/success_criteria confirmed current as of this review. Title: "W4 child E: per-field audit triggers on the four unaudited tables plus the CHECK constraints pairing a disposition with its target and status." Status=draft, parent_sd_id resolves to SD-LEO-ORCH-CAPA-RECORD-TRUTH-002 (status=active).',
    '',
    'STEP 2 -- Duplicate/overlap search. Grepped scripts/, lib/, database/migrations/ for governance_audit_log, governance_audit_trigger, quick_fixes_disposition_check, duplicate_of_id, escalated_to_sd_id, and per-table audit-trigger names (audit_quick_fixes, audit_claude_sessions, audit_feedback, audit_chairman_ratifications) -- zero hits for any migration or script implementing per-field audit triggers on these 4 tables or the target-pairing/status CHECK constraints. Queried strategic_directives_v2 and quick_fixes by title/description keyword for competing SDs/QFs -- the 10 candidate SDs returned are all unrelated (retention/bloat management, RLS tightening, phantom-column fixes, index cleanup, a different table\'s audit gap) or already completed and out of scope; one candidate QF (QF-20260729-681, closed) is about a ledger-write bug unrelated to this scope. No duplicate or competing implementation found.',
    '',
    'STEP 3 -- Independent empirical re-verification against live Postgres (not trusted from the SD text):',
    '  (a) Column existence: quick_fixes has created_by, no updated_by. claude_sessions, feedback, chairman_ratifications have NEITHER created_by nor updated_by. This exactly matches the description\'s claim and confirms the generic governance_audit_trigger() function (which references NEW.created_by/NEW.updated_by directly) cannot be reused verbatim -- it would runtime-error on the first UPDATE against any of these 4 tables.',
    '  (b) governance_audit_log currently holds 0 rows for table_name in (quick_fixes, claude_sessions, feedback, chairman_ratifications) -- confirms the "four unaudited tables" premise.',
    '  (c) Existing triggers on the 4 tables were enumerated via pg_trigger: chairman_ratifications has 3 immutability/no-delete/no-truncate triggers, claude_sessions has 1 (sync_is_working_on), feedback has 2 (resolution-violation logging + updated_at sync), quick_fixes has 3 (status restamp, auto-close-feedback, target-app validation). None of these 9 triggers write to governance_audit_log -- confirms no existing audit coverage is being duplicated.',
    '  (d) quick_fixes CHECK constraints enumerated via pg_get_constraintdef: 11 exist, including quick_fixes_disposition_check (5-value enum only, no target-pairing clause) and quick_fixes_status_check (6-value enum, no disposition-pairing clause). No CHECK constraint of the kind this SD proposes exists yet -- confirms the constraints are net-new, not a duplicate of an existing guard.',
    '  (e) The three empirical counts cited in success_criteria were independently re-run: duplicate_of with duplicate_of_id IS NULL = 5 (matches "5 of 9" cited); promoted with escalated_to_sd_id IS NULL AND resolution_sd_id IS NULL = 0 (matches "0 of 53" cited, already a clean invariant by convention); closed with disposition IS NULL = 16 (matches the description\'s corrected figure, NOT the stale success_criteria text of 15 -- see VAL-1).',
    '',
    'STEP 4 -- Sibling scope check. Parent SD-LEO-ORCH-CAPA-RECORD-TRUTH-002 has 6 children (A-F). A=template success-criteria gate at approval/plan gates. B=completion-writer refusal on unreleased chairman holds + Tier-3 QF SD-link requirement. C=stranded/completed escalation-row reconciliation. D=belt census extension to deferred/held/human-action rows (completed). E=this SD (audit triggers + disposition/status CHECK constraints). F=parent-lead/dependency claim-surface census. No title, description, or scope-statement overlap found between E and any sibling -- each child owns a structurally distinct corrective from the parent\'s measured-specimen list.',
    '',
    'STEP 5 -- Feasibility assessment. The scope is concrete, the underlying defect (0 audit coverage on 4 tables; 2 missing CHECK constraints; 16 pre-existing violating rows) is independently confirmed live, and the description already anticipates the two hardest design decisions PLAN will face (actor-column fallback per table given missing created_by/updated_by; grandfather disposition value + backfill mechanism for the 16 historical rows) rather than leaving them undiscovered. The one flaw found is a stale number in success_criteria (15 vs the corrected/re-verified 16) that the SD\'s own description already flags as needing re-measurement -- not a scope or duplication defect, and non-blocking for LEAD-TO-PLAN.',
  ].join('\n'),
  metadata: {
    parent_sd: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002',
    sibling_children_checked: [
      'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A',
      'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B',
      'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-C',
      'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D',
      'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F',
    ],
    sibling_overlap_found: false,
    duplicate_implementation_found: false,
    live_verification: {
      columns_created_by_updated_by: {
        quick_fixes: ['created_by'],
        claude_sessions: [],
        feedback: [],
        chairman_ratifications: [],
      },
      governance_audit_log_rows_for_4_tables: 0,
      existing_triggers_on_4_tables_count: 9,
      existing_triggers_write_to_audit_log: false,
      quick_fixes_check_constraints_count: 11,
      target_pairing_or_status_check_constraint_exists: false,
      quick_fixes_duplicate_of_null_count: 5,
      quick_fixes_promoted_no_target_count: 0,
      quick_fixes_closed_disposition_null_count: 16,
      success_criteria_stale_count_flagged: true,
    },
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD,
    { name: 'Principal Systems Analyst', code: 'VALIDATION' },
    results,
    { phase: 'LEAD-TO-PLAN', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
