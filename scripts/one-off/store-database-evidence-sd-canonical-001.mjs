// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — DATABASE sub-agent evidence writer (PLAN phase, FR-5 + FR-2).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'PLAN';
const EVIDENCE = 'database/evidence/SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001-writer-inventory.md';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary: [
    'FR-5 exhaustive catalog-derived writer inventory + FR-2 live trigger-estate check for strategic_directives_v2',
    '(status/current_phase/completion_date). Evidence file: ' + EVIDENCE + '.',
    'COUNTS: 95 pg_proc functions reference the table; 29 issue an UPDATE; 12 write a protected column (all disposition=allowlist,',
    'incl. 4 cascade trigger-functions on OTHER tables and update_sd_progress_from_phases which is the only DB-side writer of',
    'completion_date). 17 further pg_proc functions write the table but NO protected column (no_action_needed) -- this includes the',
    'entire fleet claim machinery (claim_sd, release_sd, switch_sd_claim, release_session, set_working_sd, create_or_replace_session,',
    'cleanup_stale_sessions), all confirmed to touch only claiming_session_id/active_session_id/is_working_on.',
    'REPO: 46 live files issue their own UPDATE of a protected column (27 allowlist, 19 expected_reject), 4 indirect_caller,',
    '3 no_action_needed (ANON/RLS-dead), plus 162 archived one-shots and 10 real-table test writers.',
    'TRIGGER ESTATE: 54 triggers total, 35 BEFORE ROW (confirms the SD prior count), 31 BEFORE ROW UPDATE, all tgenabled=O.',
    'FIRING ORDER CONFIRMED: aaa_enforce_canonical_lifecycle_write sorts FIRST -- 0 of 35 BEFORE ROW triggers sort earlier under',
    'strcmp / COLLATE "C" (the correct instrument; PostgreSQL orders triggers via strcmp in relcache.c, NOT the DB default collation).',
    'MATERIAL NEW FINDINGS that change LEAD design assumptions: (1) status_auto_transition (BEFORE ROW position 6) ASSIGNS',
    'NEW.status = pending_approval AFTER the aaa_ guard runs, so a client writing only progress+current_phase reaches status with',
    'no stamp -- aaa_ is necessary but NOT sufficient; a companion late-firing (zzz_) check or a fold-in is required, and',
    'lib/sd-park.js is a live load-bearing caller of exactly this path. (2) scripts/leo-orchestrator-enforced.js,',
    'scripts/update-directive-status.js and templates/create-handoff.js all write via the ANON key, which RLS silently drops',
    '(anon holds the UPDATE grant but its only policy is anon_read_strategic_directives_v2 cmd=SELECT; anon rolbypassrls=false)',
    '-- their writes are ALREADY silent no-ops independent of this SD, so allowlisting them would be a privilege EXPANSION,',
    'not a compatibility shim.',
  ].join(' '),
  findings: [
    {
      id: 'firing-order-hole-status-auto-transition',
      severity: 'critical',
      note: 'status_auto_transition (BEFORE ROW UPDATE, C-collation position 6 of 35) assigns NEW.status = pending_approval when current_phase IN (EXEC,PLAN) AND progress >= 100. It fires AFTER the aaa_ guard, which therefore cannot observe the mutation. A client can set status with zero stamp by writing only progress/current_phase. lib/sd-park.js documents a deliberate dependency on this exact path. The FR-2 single-trigger design must add a companion zzz_-prefixed late check, fold auto_transition_status into the guard, or stamp it. It is the ONLY trigger on the table that assigns a protected column -- verified by scanning trigger fns BY ATTACHMENT, not by body text, because trigger fns reference NEW/OLD and never name the table, so a prosrc ILIKE scan misses all of them.',
    },
    {
      id: 'aaa-prefix-sorts-first-confirmed',
      severity: 'info',
      note: 'Confirmed via ORDER BY tgname COLLATE "C": 0 of 35 BEFORE ROW triggers sort before aaa_enforce_canonical_lifecycle_write. Earliest existing is auto_assign_sequence_rank; aaa_ < auto at byte 1. No trigger name starts with a digit or uppercase letter (either would sort earlier under C collation). CAUTION: trg_aaa_sync_type_change_reason already carries an aaa infix but is prefixed trg_, so it sorts at position 11 -- a prior attempt at this ordering trick that did not take effect. The aaa_ must be the LEADING characters of the trigger name.',
    },
    {
      id: 'anon-writers-already-dead-do-not-allowlist',
      severity: 'critical',
      note: 'RLS measured live: relrowsecurity=true; 7 policies; the only policy covering role anon is anon_read_strategic_directives_v2 (cmd=SELECT, USING true); no policy targets PUBLIC; anon rolbypassrls=false. anon DOES hold the table-level UPDATE grant, which is a red herring -- the statement parses, then RLS filters every row, returning success with 0 rows and no error. Therefore scripts/leo-orchestrator-enforced.js (npm run leo:execute, writes all 3 protected columns), scripts/update-directive-status.js (npm run update-status) and templates/create-handoff.js are ALREADY silent no-ops. The LEAD phase recorded leo-orchestrator-enforced.js as a live confirmed writer -- that assumption is CORRECTED. Corroborated independently by tests/unit/supabase-anon-governance-guard.test.js (SD-FDBK-FIX-GUARD-ANON-SUPABASE-001). server/websocket.js and scripts/modules/prd-database-service.mjs are CONDITIONALLY dead (silent ANON fallback when SUPABASE_SERVICE_ROLE_KEY is unset) -- an unstable disposition EXEC must pin down.',
    },
    {
      id: 'cascade-class-has-no-stamp-story',
      severity: 'warning',
      note: 'Four trigger functions on OTHER tables cascade an UPDATE into strategic_directives_v2: update_sd_after_exec_completion, update_sd_after_lead_evaluation, update_sd_after_plan_validation, update_sd_progress_from_phases. The last is the ONLY surface in the whole estate that writes completion_date from the DB side (SET status=completed, completion_date=NOW()). They run inside the originating statement transaction, so the guard sees ordinary un-stamped UPDATEs. A session-scoped GUC stamp covers them only if the originating write was itself stamped; a statement-scoped stamp will not. This is the largest allowlisting design decision in the SD.',
    },
    {
      id: 'ad-hoc-enumeration-premise-confirmed-3x-undercount',
      severity: 'warning',
      note: 'LEAD-phase ad-hoc searches found 15-20 hits across three passes that disagreed with each other. This catalog + 5-pass sweep found 46 live own-UPDATE repo writers + 12 protected-column pg_proc functions + 1 mutating trigger -- roughly 3x. Recall gaps that defeated the earlier passes: (a) multi-line Supabase chains, with .from and .update on different physical lines, giving ~0% same-line-regex recall -- the identical defect already documented in verifyHelperCoverage(), scripts/lib/lead-precheck-helpers.js:300-421; (b) .update(<variable>) payload-by-reference, which alone hid cancel-sd.js, reactivate-sd.js, SDRepository.js and lead-final-approval/cas-completion.js; (c) shorthand properties .update({ status }); (d) table-name indirection via const TABLE_NAME (6 such constants exist); (e) trigger fns never naming the table.',
    },
    {
      id: 'lead-findings-reconciled-two-corrections',
      severity: 'info',
      note: 'All 15 LEAD-phase findings reconciled in Section 4 of the evidence file. Two corrections: scripts/reactivate-sd.js writes status ONLY (it reads current_phase for audit but never writes it); scripts/handoff.js has NO own write despite carrying the @canonical-writer-for header (disposition=indirect_caller, the real writes are in scripts/modules/handoff/**). Also notable: complete_orchestrator_sd, complete_business_evaluation, request_business_evaluation, fn_rollback_sd_hierarchy and kill_venture have ZERO live JS call sites -- they are invoked from DB triggers only.',
    },
    {
      id: 'validation-harnesses-and-tests-will-break',
      severity: 'warning',
      note: 'scripts/validate-trigger-guard-pack.mjs (4 sites) and scripts/validate-capability-lifecycle-trigger.mjs (2 sites) execute raw SQL UPDATE strategic_directives_v2 SET status=completed, progress=100, completion_date=NOW(). Plus 10 test files write protected columns against the REAL table (tests/helpers/database-helpers.js, four tests/database/*.test.js fixture upserts, several tests/integration/*, tests/e2e/leo-protocol-journey.test.js, tests/ddl/*). EXEC needs a stamping story for test and validation fixtures or the guard lands red.',
    },
    {
      id: 'incidental-nonexistent-phase-column',
      severity: 'info',
      note: 'Out of scope but surfaced incidentally: scripts/verify-l2p/handoff-execution.js:207-213 writes { status: active, phase: PLAN, ... }. The column phase does not exist on strategic_directives_v2 -- verified via information_schema, only current_phase exists. Pre-existing latent bug, worth a separate QF.',
    },
  ],
  metadata: {
    evidence_file: EVIDENCE,
    fr_covered: ['FR-5', 'FR-2'],
    method: 'pg_proc + pg_trigger + pg_get_functiondef + pg_policies + pg_roles + information_schema (live, read-only) + 5-pass repo search',
    pg_proc_referencing_table: 95,
    pg_proc_issuing_update: 29,
    pg_proc_writing_protected_column: 12,
    pg_proc_writing_nonprotected_only: 17,
    trigger_fns_assigning_protected_column: 1,
    trigger_fn_assigning: 'auto_transition_status (trigger status_auto_transition)',
    triggers_total: 54,
    before_row_triggers: 35,
    before_row_update_triggers: 31,
    repo_own_update_writers_live: 46,
    repo_indirect_callers: 4,
    repo_anon_dead_writers: 3,
    repo_archived_writers: 162,
    real_table_test_writers: 10,
    disposition_allowlist: 27,
    disposition_expected_reject: 21,
    disposition_indirect_caller: 4,
    disposition_no_action_needed: 11,
    aaa_prefix_sorts_first: true,
    aaa_candidate_name: 'aaa_enforce_canonical_lifecycle_write',
    earlier_sorting_before_row_triggers: 0,
    earliest_existing_before_row_trigger: 'auto_assign_sequence_rank',
    firing_order_instrument: 'ORDER BY tgname COLLATE "C" (strcmp, matches PostgreSQL relcache.c trigger ordering)',
    aaa_prefix_sufficient: false,
    aaa_insufficiency_reason: 'status_auto_transition at BEFORE ROW position 6 assigns NEW.status after the guard runs',
    anon_rls_writes_are_noops: true,
    anon_policies_on_table: ['anon_read_strategic_directives_v2 (SELECT)'],
    anon_rolbypassrls: false,
    protected_columns_verified: ['status', 'current_phase', 'completion_date'],
    read_only: true,
    ddl_executed: false,
  },
  execution_time_ms: 1500000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'DATABASE',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DATABASE', SD_ID, { name: 'Principal Database Architect' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
