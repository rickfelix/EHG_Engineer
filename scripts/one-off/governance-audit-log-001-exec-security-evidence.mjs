#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001,
 * EXEC-TO-PLAN phase.
 *
 * Single-line fix escalated from QF-20260908-544 because the touched path
 * (database/chairman-gated/**) is refused by the QF completion preflight per
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5.
 *
 * READ PROVENANCE: all git/file reads taken from the SD's own worktree
 * C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001
 * at HEAD 73bd638b0ab58193cfdfe53c9f64a4a06c61f398 (origin/main + 2 commits), after an
 * explicit `git fetch origin`. Live-DB and CI facts are NOT re-asserted from the SD text --
 * they are read out of the runner-produced artifact
 * .artifacts/test-results/govauditlog001-exec-dryrun.json (producer:
 * scripts/one-off/govauditlog001-exec-dryrun-runner.mjs, BEGIN/ROLLBACK harness, commit_issued=false).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001';

const findings = [
  {
    id: 'scope-containment-diff-is-exactly-one-sql-literal',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 1 -- CLEAN. After `git fetch origin`, `git diff origin/main...HEAD -- database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql` is exactly one hunk, one line: VALUES ('probe_table', gen_random_uuid()::text, 'probe') -> VALUES ('probe_table', gen_random_uuid()::text, 'STATE_CHANGE') at line 109. numstat 1 added / 1 deleted, file length 165 lines on BOTH sides. No new GRANT, no REVOKE, no CREATE/DROP POLICY, no ENABLE ROW LEVEL SECURITY, no CREATE/DROP TRIGGER, no ALTER TABLE, no ENABLE ALWAYS line, no SECURITY DEFINER, no search_path change. The verify block was not widened: it still probes exactly the same three guards (UPDATE at 117, DELETE at 124, TRUNCATE at 139) with the same handlers. The companion _DOWN.sql is untouched (0 hits in --name-only).",
  },
  {
    id: 'chairman-approval-gate-header-byte-identical-to-origin-main',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 2 -- CLEAN, and verified three independent ways rather than by grepping the diff alone. (a) sha256 of `git show origin/main:<file> | sed -n '1,10p'` == sha256 of the same slice at HEAD: 21614caa6ebedc3a22192a0883a284c5bd074e67d113d5239cde1072cb5b5022 on both. (b) Line 4 reads, on BOTH refs, `-- @approved-by: <PENDING -- chairman must add this line + a token before apply>`. (c) The token 'approved-by' does not appear on any +/- line of the SQL file's branch diff. This PR therefore does NOT apply, pre-approve, or weaken the chairman-gated migration -- it stays staged and unapplied, and the apply ceremony (scripts/apply-migration.js --issue-token, lines 156-160) remains the chairman's to run. Independently corroborated against the LIVE database by the runner artifact: pg_trigger reports ZERO non-internal triggers on public.governance_audit_log both before and after the dry run (triggers_before=[], triggers_after=[]), i.e. the migration is genuinely unapplied and nothing in this SD reached production DDL (ddl_verbs_issued=[], commit_issued=false).",
  },
  {
    id: 'probe-row-tagged-state-change-cannot-be-misread-by-any-audit-consumer',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 3 -- NO SECURITY EXPOSURE. The question asked was whether a probe row tagged 'STATE_CHANGE' could be misread by a downstream audit consumer as a genuine state-change event. Two independent reasons it cannot, the first MEASURED rather than assumed. (i) THE ROW NEVER PERSISTS. The INSERT at 108-110 sits inside the plpgsql block opened at 107 whose EXCEPTION clause at 131-132 catches the deliberate P0100 raised at 130; a plpgsql block with an EXCEPTION clause runs in an implicit subtransaction, so catching the error rolls back every persistent change made inside it. Confirmed empirically, not by reading the manual: the runner harness (govauditlog001-exec-dryrun-runner.mjs, live DB, BEGIN/ROLLBACK) measured `SELECT count(*) FROM public.governance_audit_log WHERE table_name='probe_table'` at 0 BEFORE and 0 AFTER, with committed=false -- zero probe rows leak. (ii) EVEN IF ONE LEAKED, NOTHING READS THE COLUMN. A repo-wide sweep of .sql/.js/.mjs/.cjs/.ts for the table found ZERO production consumers that read or branch on governance_audit_log.operation: no .eq('operation'), no .in('operation'), no GROUP BY operation (the one GROUP BY operation in the repo, ops/runbooks/prod_promotion_housekeeping.md:186, is against a DIFFERENT table, audit.change_log). The only real analytics consumer -- queryBypassPatterns()/generateBypassAnalytics() at scripts/lib/governance-bypass-logger.js:190-270 -- scopes on .eq('table_name','governance_bypass') plus changed_at and aggregates out of new_values/changed_by, so a table_name='probe_table' row is filtered out before `operation` is ever touched. Retention (lib/retention/policies.js:45) is operation-agnostic (changed_at only). AegisViolationRecorder.getBypassCompleteness (lib/governance/aegis/AegisViolationRecorder.js:445) reads only phantom columns and error-degrades. And table_name='probe_table' is itself a self-evident discriminator for a human reading raw rows -- 'probe_table' is not a real relation.",
  },
  {
    id: 'budget-exceeded-and-audit-trigger-generic-write-paths-read-directly',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 3, corroborating detail -- both named write paths read at source rather than inferred. (a) lib/eva/event-bus/handlers/budget-exceeded.js:70-85 is a DEAD write path: it inserts event_type/severity/gate_name/sd_key/details, none of which exist on governance_audit_log, and supplies NO `operation` value at all against a NOT NULL varchar(20) column -- so it fails 42703/23502 every time and the bare `catch {}` at 86 swallows it. It can therefore neither write nor read the operation column, and is not a consumer that could misinterpret anything. (Same phantom-column shape at lib/governance/aegis/AegisViolationRecorder.js:415.) (b) audit_trigger_generic(), defined SECURITY DEFINER at database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql:117-211, INSERTs `operation = TG_OP` at :195-204 -- i.e. only ever 'INSERT'/'UPDATE'/'DELETE', never 'STATE_CHANGE'. It is attached to quick_fixes, claude_sessions, feedback and chairman_ratifications. This diff does not touch that function, its triggers, or its search_path, exactly as the migration's own scope note at lines 20-25 claims.",
  },
  {
    id: 'no-grants-no-rls-no-guard-function-bodies-touched',
    severity: 'INFO',
    summary:
      "REVIEW ITEM 4 -- CLEAN. Grepping every +/- line of the FULL branch diff (both files) for GRANT|REVOKE|POLICY|ROW LEVEL|ENABLE ALWAYS|CREATE TRIGGER|DROP TRIGGER|_freeze|_no_delete|_no_truncate|SECURITY DEFINER|search_path|ALTER TABLE|approved-by returns hits ONLY inside JavaScript string literals in the LEAD evidence script's prose -- zero hits in the .sql file. The bodies of governance_audit_log_freeze() (35-44), governance_audit_log_no_delete() (51-60) and governance_audit_log_no_truncate() (68-75), their CREATE TRIGGER statements (47-49, 63-65, 78-80), and the three ALTER TABLE ... ENABLE ALWAYS TRIGGER lines (86-88) that close the replica-mode suppression hole are all byte-identical to origin/main. The existing grants/RLS on the table (2025-11-07_add_anon_insert..., 20251217_rls_security_hardening.sql:98-113, 20260317_rls_policy_tightening_phase1.sql:147-155) are untouched by this SD.",
  },
  {
    id: 'fail-closed-property-preserved-line-117-diagnostic-unreachable',
    severity: 'MEDIUM',
    summary:
      "THE ONE REAL DEFECT I FOUND, and it is a DIAGNOSABILITY defect, not a security hole -- but I checked the security-critical half rather than assuming it. The sibling UPDATE probe at line 117 sets operation='tampered', which is ALSO outside the admitted set, so the same defect class this SD exists to fix survives eight lines below the fix. Measured live by the runner's step-3 diagnostic probe against the real table with the guard absent: the UPDATE raises SQLSTATE 23514 (check_violation on governance_audit_log_operation_check), with caught_by_migrations_raise_exception_handler=false. THE SECURITY QUESTION IS WHETHER THAT FAILS OPEN OR CLOSED. It fails CLOSED: 23514 is not P0001, so the inner `WHEN raise_exception` handler at 119-120 does not catch it; it is not P0100, so the outer handler at 131-132 does not catch it either; it propagates out of the DO block and aborts the transaction before COMMIT at 151. A migration run with a MISSING update-guard therefore cannot report success -- it dies, just with a confusing constraint error instead of the purpose-written P0101 'GUARD DID NOT FIRE -- an UPDATE was ACCEPTED' message, which is unreachable by construction. On the healthy path this is inert: all three triggers are BEFORE triggers (47-49, 63-65, 78-80) and PostgreSQL fires BEFORE ROW triggers ahead of constraint evaluation, so the guard's P0001 pre-empts the CHECK and handler 120 absorbs it. NOT a blocker for this SD -- it is pre-existing, unchanged by this diff, and fails safe -- but it deserves an explicit fix-or-defer call precisely because this SD exists only because its predecessor QF-20260907-688 left a sibling failure in this same block.",
  },
  {
    id: 'escalation-rail-control-bypass-risk-now-closed-pr-8632',
    severity: 'INFO',
    summary:
      "GOVERNANCE CONTROL VERIFIED AT EXEC, not inherited from LEAD. The LEAD VALIDATION row raised a HIGH: PR #8632 was OPEN on branch qf/QF-20260908-544 carrying the IDENTICAL commit c78458898e6 and the identical single file, which would have landed a database/chairman-gated/** change through the very completion path SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5 withheld -- a real control bypass, since the escalation to this SD exists precisely so the change gets full-workflow review. I re-measured rather than trusting the earlier row: `gh pr view 8632` now reports state=CLOSED. The rail is intact and PR #8636 (state=OPEN, mergeStateStatus=CLEAN) is the sole delivery path. No bypass remains.",
  },
  {
    id: 'second-file-on-branch-lead-evidence-script-reviewed-for-secrets-and-side-effects',
    severity: 'LOW',
    summary:
      "SCOPE OBSERVATION the task framing did not mention, surfaced because 'single-line fix' was the stated premise and the branch is not that. The branch carries TWO commits and TWO files: c78458898e6 (the 1-line SQL fix) and 73bd638b0ab, which adds scripts/one-off/governance-audit-log-001-lead-validation-evidence.mjs (+224 lines, the LEAD-phase VALIDATION evidence writer). I reviewed it as changed code rather than waving it through as documentation: it imports only resolve-repo.js / results-storage.js / supabase-client.js / is-main-module.js, contains NO hardcoded credentials or tokens (grep for eyJ|sbp_|sk-|SUPABASE_SERVICE|password|secret|token returns only prose matches inside finding strings), performs no filesystem writes, no network calls, no execFile/execSync, and no DML beyond the single storeSubAgentResults() evidence write through the canonical writer. It is inert with respect to the migration and to production data. No security objection -- recorded so the reviewer knows the PR is 2 files, not 1.",
  },
  {
    id: 'literal-choice-state-change-vs-insert-vocabulary-collision',
    severity: 'LOW',
    summary:
      "ADVISORY ONLY, no action required for this SD to ship. The CHECK admits four values {INSERT, UPDATE, DELETE, STATE_CHANGE} and the fix picked STATE_CHANGE. In current production vocabulary, 'STATE_CHANGE' has exactly one writer -- scripts/lib/governance-bypass-logger.js:118, table_name='governance_bypass' -- so it de-facto means 'a governance control was bypassed'. 'INSERT' would have been the semantically honest pick: the probe IS an insert, and it matches the TG_OP convention that audit_trigger_generic() and the other two live writers (lib/eva/gate-bars.js:246, lib/eva/venture-intake-gates.js:269) already follow. This is cosmetic and NOT a security finding because (a) the row is subtransaction-rolled-back and measured never to persist, and (b) zero consumers branch on the column, so no vocabulary collision can reach an automated decision. Raising it only so the choice is deliberate on the record rather than incidental.",
  },
];

const warnings = [
  {
    severity: 'MEDIUM',
    issue:
      "Line 117 of the same verify block uses a second non-admitted literal (operation='tampered'). Measured live: on the guard-did-not-fire path it raises 23514, not P0001, so the purpose-written P0101 'GUARD DID NOT FIRE -- an UPDATE was ACCEPTED' diagnostic at line 118 is unreachable by construction.",
    recommendation:
      "Non-blocking for this SD -- it fails CLOSED (23514 escapes both handlers and aborts the migration before COMMIT, so no false 'verified' pass is possible). Make an explicit fix-or-defer call: either change 'tampered' to an admitted literal (e.g. 'DELETE') so the diagnostic is reachable, or record a deliberate defer. This is the same defect class the predecessor QF left behind once already.",
  },
  {
    severity: 'LOW',
    issue:
      'The branch is 2 files / 2 commits, not the single-line change described in the review request; the second file is a 224-line one-off evidence writer.',
    recommendation:
      'No security objection -- it holds no secrets, makes no network/filesystem/DDL calls, and its only DML is the canonical sub-agent evidence write. Noted so PR review scope matches reality.',
  },
];

const recommendations = [
  'APPROVE from a security standpoint. The change is the minimum sufficient one: a single string literal moved into the set the live CHECK constraint already admits, verified against the live constraint definition rather than against the SD text.',
  "Keep PR #8636 as the sole delivery path. #8632 is confirmed CLOSED; do not reopen or merge it -- doing so would land a database/chairman-gated/** change through the completion path FR-5 deliberately withheld.",
  "Do NOT treat green CI or this PASS as authorisation to apply the migration. The @approved-by header is still <PENDING> and pg_trigger confirms zero guards live on the table; the apply ceremony remains the chairman's.",
  "Make an explicit fix-or-defer call on line 117's operation='tampered' before this SD closes, so the second instance of this defect class is a recorded decision rather than another silent inheritance.",
];

const summary =
  "SECURITY for SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001 at EXEC-TO-PLAN: PASS. All four requested review items are clean, and I measured the ones that could have been assumed. (1) SCOPE: after git fetch, the SQL diff is exactly one hunk, one line -- operation='probe' -> operation='STATE_CHANGE' at line 109, numstat 1/1, file 165 lines on both refs. No grants, no REVOKE, no RLS policy, no CREATE/DROP TRIGGER, no ALTER TABLE, no ENABLE ALWAYS, no SECURITY DEFINER or search_path change, and the verify block is not widened -- it probes the same three guards with the same handlers. The companion _DOWN.sql is untouched. (2) CHAIRMAN GATE: byte-identical to origin/main, verified three ways -- sha256 of the first ten lines matches on both refs (21614caa6ebe...), line 4 reads '@approved-by: <PENDING -- chairman must add this line + a token before apply>' on both, and 'approved-by' appears on zero +/- lines. Corroborated against the LIVE database: pg_trigger shows ZERO non-internal triggers on public.governance_audit_log before AND after (ddl_verbs_issued=[], commit_issued=false), so the migration is genuinely unapplied and this PR neither applies nor pre-approves it. (3) THE 'STATE_CHANGE' QUESTION -- NO EXPOSURE, and I confirmed the reading rather than assuming it. The probe row never persists: the INSERT sits in a plpgsql block whose EXCEPTION clause catches the deliberate P0100 raised at line 130, and such a block runs in an implicit subtransaction, so the catch rolls it back. Measured, not inferred -- the runner harness read count(*) WHERE table_name='probe_table' as 0 before and 0 after with committed=false. And even a leaked row would be inert: a repo-wide sweep found ZERO production consumers that read or branch on governance_audit_log.operation. The only analytics reader (governance-bypass-logger queryBypassPatterns/generateBypassAnalytics) scopes on table_name='governance_bypass' + changed_at and aggregates from new_values/changed_by, filtering a 'probe_table' row out before operation is touched; retention is changed_at-only; budget-exceeded.js:70 is a DEAD write path (phantom columns, no operation supplied against a NOT NULL column, exception swallowed by a bare catch) so it neither writes nor reads this column; and audit_trigger_generic() writes TG_OP only, never STATE_CHANGE. No audit consumer can mistake a probe row for a genuine state-change event. (4) GUARD FUNCTIONS: the _freeze/_no_delete/_no_truncate bodies, their triggers and the three ENABLE ALWAYS lines are byte-identical. Two things worth the reviewer's attention, neither blocking. MEDIUM: the sibling UPDATE at line 117 still uses a non-admitted literal ('tampered'), and the runner's live diagnostic measured that on the guard-did-not-fire path it raises 23514, not P0001 -- caught by neither handler, so it escapes the DO block and aborts before COMMIT. That is FAIL-CLOSED (no false 'verified' pass is possible), but it renders the purpose-written P0101 'GUARD DID NOT FIRE' diagnostic unreachable; it deserves an explicit fix-or-defer call given this SD exists only because its predecessor left a sibling failure in this same block. LOW: the branch is 2 files / 2 commits, not the single line described -- the second is a 224-line LEAD evidence writer, which I reviewed for secrets and side effects (none: no credentials, no network, no filesystem writes, no exec, no DML beyond the canonical evidence write). I also re-verified the governance control the LEAD row raised as HIGH rather than inheriting it: PR #8632, which would have landed this chairman-gated change through the very QF completion path FR-5 withheld, is now CLOSED, so the escalation rail is intact and #8636 (OPEN, CLEAN, 54 SUCCESS / 1 SKIPPED / 0 non-green) is the sole delivery path.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC_TO_PLAN',
      review_type: 'SECURITY_REVIEW_OF_CHAIRMAN_GATED_MIGRATION_EDIT',
      escalation_context: {
        source_qf: 'QF-20260908-544',
        escalation_rail: 'SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5',
        reason:
          'touched path database/chairman-gated/** is refused by the QF completion preflight, so the change must go through the full SD workflow to get real review',
      },
      read_provenance: {
        read_from:
          'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001',
        worktree_head: '73bd638b0ab58193cfdfe53c9f64a4a06c61f398',
        relation_to_origin_main: 'origin/main + 2 commits (origin fetched immediately before measuring)',
        live_db_and_ci_facts_source:
          '.artifacts/test-results/govauditlog001-exec-dryrun.json (runner-produced by scripts/one-off/govauditlog001-exec-dryrun-runner.mjs; BEGIN/ROLLBACK harness, commit_issued=false) -- NOT re-asserted from the SD text',
      },
      item_1_scope_containment: {
        verdict: 'CLEAN',
        sql_file: 'database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql',
        line: 109,
        before: "VALUES ('probe_table', gen_random_uuid()::text, 'probe')",
        after: "VALUES ('probe_table', gen_random_uuid()::text, 'STATE_CHANGE')",
        sql_numstat: { added: 1, deleted: 1 },
        file_line_count_both_refs: 165,
        grants_changed: false,
        rls_changed: false,
        triggers_changed: false,
        alter_table_present_in_diff: false,
        verify_block_widened: false,
        down_sql_touched: false,
      },
      item_2_chairman_gate_preservation: {
        verdict: 'CLEAN',
        line_4_both_refs:
          '-- @approved-by: <PENDING -- chairman must add this line + a token before apply>',
        sha256_first_10_lines_origin_main:
          '21614caa6ebedc3a22192a0883a284c5bd074e67d113d5239cde1072cb5b5022',
        sha256_first_10_lines_head:
          '21614caa6ebedc3a22192a0883a284c5bd074e67d113d5239cde1072cb5b5022',
        approved_by_hits_in_sql_diff: 0,
        live_corroboration: {
          source: 'runner artifact, pg_trigger on public.governance_audit_log',
          triggers_before: [],
          triggers_after: [],
          ddl_verbs_issued: [],
          commit_issued: false,
          conclusion: 'migration is genuinely UNAPPLIED; this PR applies/pre-approves nothing',
        },
      },
      item_3_operation_value_security_analysis: {
        verdict: 'NO_SECURITY_EXPOSURE',
        question:
          "Could a real audit consumer misinterpret a probe row tagged operation='STATE_CHANGE' as a genuine state-change event?",
        answer: 'No -- for two independent reasons, the first of which is measured rather than assumed.',
        reason_1_row_never_persists: {
          mechanism:
            'INSERT at 108-110 is inside the plpgsql block opened at 107; its EXCEPTION clause at 131-132 catches the deliberate P0100 raised at 130. A plpgsql block with an EXCEPTION clause executes in an implicit subtransaction, so catching the error rolls back every persistent change made inside it.',
          measured_not_assumed: true,
          probe_rows_before: 0,
          probe_rows_after: 0,
          committed: false,
          evidence_source: '.artifacts/test-results/govauditlog001-exec-dryrun.json (live DB)',
        },
        reason_2_no_consumer_reads_the_column: {
          consumers_reading_operation: 0,
          searched_for: [
            ".eq('operation'",
            ".in('operation'",
            'operation ===',
            'GROUP BY operation',
            "'STATE_CHANGE' literals",
          ],
          only_group_by_operation_in_repo:
            'ops/runbooks/prod_promotion_housekeeping.md:186 -- against a DIFFERENT table (audit.change_log)',
          analytics_consumer:
            "scripts/lib/governance-bypass-logger.js:190-270 queryBypassPatterns/generateBypassAnalytics -- scopes on .eq('table_name','governance_bypass') + changed_at, aggregates from new_values/changed_by; NEVER reads operation. A table_name='probe_table' row is filtered out before operation is touched.",
          retention_consumer:
            'lib/retention/policies.js:14,45 -- archives by changed_at only, operation-agnostic',
          aegis_consumer:
            'lib/governance/aegis/AegisViolationRecorder.js:445 getBypassCompleteness -- reads only phantom columns, error-degrades to completeness:0; does not read operation',
          dashboards_or_routes: 'none -- no src/, client/, or server route references this table',
        },
        named_write_paths_read_at_source: {
          'lib/eva/event-bus/handlers/budget-exceeded.js:70-85':
            'DEAD write path. Inserts event_type/severity/gate_name/sd_key/details (none exist on the table) and supplies NO operation value against a NOT NULL varchar(20) column, so it fails 42703/23502 every time; the bare catch at :86 swallows it. It can neither write nor read operation.',
          'lib/governance/aegis/AegisViolationRecorder.js:415-419':
            'same phantom-column shape, same dead-write outcome',
          'audit_trigger_generic()':
            'database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql:117-211, SECURITY DEFINER, INSERTs operation = TG_OP at :195-204 -- only INSERT/UPDATE/DELETE, never STATE_CHANGE. UNCHANGED by this diff.',
          'scripts/lib/governance-bypass-logger.js:118':
            "the ONLY production STATE_CHANGE writer, table_name='governance_bypass'",
        },
        human_discriminator:
          "table_name='probe_table' is not a real relation, so a probe row is self-evidently a probe to a human reading raw rows regardless of its operation value",
      },
      item_4_guard_functions_and_access_control_untouched: {
        verdict: 'CLEAN',
        unchanged: [
          'governance_audit_log_freeze() body (lines 35-44)',
          'governance_audit_log_no_delete() body (lines 51-60)',
          'governance_audit_log_no_truncate() body (lines 68-75)',
          'all three CREATE TRIGGER statements (47-49, 63-65, 78-80)',
          'all three ALTER TABLE ... ENABLE ALWAYS TRIGGER lines (86-88)',
          'every existing GRANT and RLS policy on the table',
        ],
        method:
          'grep of every +/- line of the FULL branch diff for GRANT|REVOKE|POLICY|ROW LEVEL|ENABLE ALWAYS|CREATE TRIGGER|DROP TRIGGER|_freeze|_no_delete|_no_truncate|SECURITY DEFINER|search_path|ALTER TABLE|approved-by -- all hits are inside JavaScript string literals in the evidence script prose, ZERO hits in the .sql file',
      },
      fail_closed_analysis_line_117: {
        severity: 'MEDIUM',
        blocking: false,
        defect: "line 117 UPDATE ... SET operation = 'tampered' is also a non-admitted literal",
        measured_sqlstate_on_guard_absent_path: '23514',
        constraint: 'governance_audit_log_operation_check',
        caught_by_migrations_raise_exception_handler: false,
        security_conclusion:
          'FAILS CLOSED. 23514 is neither P0001 (inner handler at 119-120) nor P0100 (outer handler at 131-132), so it escapes the DO block and aborts the transaction before COMMIT at 151. A missing update-guard therefore CANNOT produce a false "verified" pass.',
        cost: 'the purpose-written P0101 "GUARD DID NOT FIRE -- an UPDATE was ACCEPTED" diagnostic at line 118 is unreachable by construction',
        healthy_path:
          'inert -- all three triggers are BEFORE triggers and PostgreSQL fires BEFORE ROW triggers ahead of constraint evaluation, so the guard raises P0001 before \'tampered\' is constraint-checked and handler 120 absorbs it',
        evidence_class: 'LIVE MEASUREMENT (runner step-3 diagnostic probe), not static reading',
      },
      escalation_rail_integrity: {
        lead_finding: 'HIGH -- PR #8632 OPEN on qf/QF-20260908-544 with the identical commit',
        risk_if_unresolved:
          'the chairman-gated change would land through the very QF completion path SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5 withheld, satisfying the rail only nominally',
        re_measured_at_exec: true,
        qf_pr_8632_state: 'CLOSED',
        sd_pr_8636_state: 'OPEN',
        sd_pr_8636_merge_state: 'CLEAN',
        conclusion: 'rail intact; #8636 is the sole delivery path; no control bypass remains',
      },
      constraint_verification: {
        source:
          'LIVE pg_constraint via the runner artifact (not the schema snapshot, not the SD text)',
        constraint: 'governance_audit_log_operation_check',
        admitted_operations: ['INSERT', 'UPDATE', 'DELETE', 'STATE_CHANGE'],
        probe_literal_outcome: 'REJECTED_AS_EXPECTED (23514)',
        state_change_literal_outcome: 'ACCEPTED_AS_EXPECTED (row_visible_in_tx=true)',
        column_type: 'character varying(20) NOT NULL',
        state_change_length: 12,
        width_safe: true,
      },
      branch_scope_observation: {
        commits: 2,
        files: 2,
        second_file: 'scripts/one-off/governance-audit-log-001-lead-validation-evidence.mjs (+224)',
        second_file_security_review: {
          hardcoded_secrets: 'none',
          network_calls: 'none',
          filesystem_writes: 'none',
          exec_or_execsync: 'none',
          dml: 'single storeSubAgentResults() evidence write via the canonical writer',
          verdict: 'no security objection',
        },
      },
      ci: {
        pr: 8636,
        checks_total: 55,
        success: 54,
        skipped: 1,
        non_green: 0,
        source: 'runner-produced gh statusCheckRollup in the dry-run artifact, read independently',
      },
      checks_run: [
        'git fetch origin, then git diff origin/main...HEAD --stat and --name-only (full branch delta, both files)',
        'git diff origin/main...HEAD on the SQL file (exact one-hunk confirmation)',
        'sha256 of git show origin/main:<file> and HEAD:<file> first-10-line slices (gate-header byte-identity)',
        'grep approved-by on both refs and across the SQL diff',
        'grep of every +/- diff line for GRANT|REVOKE|POLICY|ROW LEVEL|ENABLE ALWAYS|CREATE/DROP TRIGGER|_freeze|_no_delete|_no_truncate|SECURITY DEFINER|search_path|ALTER TABLE',
        'full read of the migration (all 165 lines) incl. trigger bodies and the verify block handler chain',
        'read lib/eva/event-bus/handlers/budget-exceeded.js:55-90 at source',
        'repo-wide sweep for governance_audit_log and audit_trigger_generic consumers across .sql/.js/.mjs/.cjs/.ts',
        'targeted sweep for readers of the operation column (.eq/.in/=== /GROUP BY) and for STATE_CHANGE literals',
        'read the live constraint + probe-leak counts + trigger census out of the runner-produced dry-run artifact',
        'gh pr view 8632 and 8636 (delivery-path / escalation-rail integrity)',
        'secret + side-effect scan of the second file on the branch',
      ],
      blocking_conditions: [],
      non_blocking_followups: [
        "Explicit fix-or-defer call on line 117's operation = 'tampered' (fails closed today, but the P0101 diagnostic is unreachable)",
        "Optional: prefer 'INSERT' over 'STATE_CHANGE' for the probe literal to avoid colliding with the governance-bypass vocabulary (cosmetic; no consumer branches on the column)",
      ],
    },
    phase: 'EXEC_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'SECURITY' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN', source: 'manual' },
  );

  console.log('SECURITY EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? 'EXEC_TO_PLAN');
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
