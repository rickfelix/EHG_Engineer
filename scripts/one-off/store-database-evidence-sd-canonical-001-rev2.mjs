// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — DATABASE sub-agent evidence writer, REV 2 (PLAN phase).
// Supersedes eadd5e30-93dd-4680-82d0-84cb212f5210: adds the FR-4 scope correction (Section 6 of the evidence file).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'PLAN';
const EVIDENCE = 'database/evidence/SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001-writer-inventory.md';

const results = {
  verdict: 'PASS',
  confidence: 93,
  summary: [
    'REV 2 (supersedes sub_agent_execution_results.id=eadd5e30-93dd-4680-82d0-84cb212f5210). FR-5 exhaustive catalog-derived',
    'writer inventory + FR-2 live trigger-estate check + FR-4 scope correction for strategic_directives_v2',
    '(status/current_phase/completion_date). Evidence file: ' + EVIDENCE + ' (7 sections).',
    'COUNTS: 95 pg_proc functions reference the table; 29 issue an UPDATE; 12 write a protected column (allowlist), incl. 4 cascade',
    'trigger-functions on OTHER tables and update_sd_progress_from_phases, the only DB-side writer of completion_date.',
    '17 further pg_proc functions write the table but NO protected column -- including the entire fleet claim machinery',
    '(claim_sd, release_sd, switch_sd_claim, release_session, set_working_sd, create_or_replace_session, cleanup_stale_sessions),',
    'all confirmed to touch only claiming_session_id/active_session_id/is_working_on. REPO: 46 live files contain an own-UPDATE of',
    'a protected column, 45 reachable (SDRepository.updateStatus is dead), 4 indirect_caller, 3 no_action_needed (ANON/RLS-dead),',
    '162 archived, 10 real-table test writers. Dispositions: allowlist 26, expected_reject 21, indirect_caller 4, no_action_needed 12.',
    'TRIGGER ESTATE: 54 triggers, 35 BEFORE ROW (confirms prior count), 31 BEFORE ROW UPDATE, all tgenabled=O.',
    'aaa_enforce_canonical_lifecycle_write CONFIRMED to sort FIRST -- 0 of 35 sort earlier under strcmp / COLLATE "C" (the correct',
    'instrument; PostgreSQL orders triggers via strcmp in relcache.c, not the DB default collation).',
    'FOUR MATERIAL FINDINGS: (1) aaa_ is necessary but NOT sufficient -- status_auto_transition at BEFORE ROW position 6 assigns',
    'NEW.status after the guard runs, so writing only progress+current_phase reaches status un-stamped; lib/sd-park.js is a live',
    'load-bearing caller of that path. (2) leo-orchestrator-enforced.js, update-directive-status.js and templates/create-handoff.js',
    'write via ANON, whose only policy on this table is SELECT -- already silent no-ops, so allowlisting them is privilege EXPANSION.',
    '(3) FR-4 SCOPE IS WRONG: SDRepository.updateStatus() is DEAD CODE (zero call sites, verified via git grep + sdRepo.<method>',
    'census showing only getById x8 and verifyExists x3), and the real handoff-internal surface is 13 own-UPDATE sites across 11',
    'files plus 2 RPC entry points = 15 distinct stamp-wiring points, not the 2 FR-4 names. If EXEC wires only the FR-4 sites,',
    'every handoff transition except the two atomic RPC paths will be REJECTED, breaking the pipeline. (4) Three files cited as',
    'required allowlist rows do NOT write protected columns: exec-boundary-hold.js writes only metadata,',
    'orchestrator-completion-guardian.js is read-only on strategic_directives_v2 (its .update()s target retrospectives /',
    'sd_scope_deliverables / issue_patterns), and exec-to-plan/state-transitions.js:103-111 targets product_requirements_v2.',
  ].join(' '),
  findings: [
    {
      id: 'fr4-scope-wrong-sdrepository-updatestatus-is-dead-code',
      severity: 'critical',
      note: 'FR-4 scopes EXEC stamp-wiring as two sites: SDRepository.js::updateStatus() plus the two fn_atomic_*_transition RPC bodies. SDRepository.updateStatus() is DEAD CODE with zero call sites -- verified three ways: git grep for updateStatus across the repo returns only the definition at SDRepository.js:158 and two console.log strings inside it (:173, :205); an sdRepo.<method> census returns only getById (8 sites) and verifyExists (3 sites); no dynamic/computed dispatch exists. The SDRepository class itself IS live (instantiated at HandoffOrchestrator.js:80) but this one method is never invoked. Disposition changed allowlist -> no_action_needed. Wiring the stamp into it accomplishes nothing.',
    },
    {
      id: 'fr4-real-surface-is-15-stamp-points-not-2',
      severity: 'critical',
      note: 'Exhaustive scan of all 345 files under scripts/modules/handoff/ (40 write sites found) gives the real canonical-writer surface: 13 own-UPDATE sites across 11 files plus 2 RPC entry points = 15 distinct stamp-wiring points (12 reachable own-UPDATE sites + 1 dead + 2 RPC bodies). Every one issues its OWN separate .update() -> its own separate SQL UPDATE statement; none share a statement. Sites: lead-to-plan/state-transitions.js:39 (rollback) and :101 (legacy non-atomic fallback when the RPC is unavailable); plan-to-exec/state-transitions.js:35 (rollback) and :130; exec-to-plan/state-transitions.js:141; plan-to-lead/index.js:497; plan-to-lead/state-transitions.js:522; lead-final-approval/cas-completion.js:29 (CAS-guarded, caller supplies all 3 protected columns); lead-to-plan/gates/transition-readiness.js:60 (a GATE that auto-reactivates status to draft); lib/orchestrator-terminal-guard.js:72; skip-and-continue.js:137 (optimistic lock); cli/execution-helpers.js:81 (post-handoff drift reconciliation). Plus RPC entry points lead-to-plan/atomic-transitions.js:44,:93 and exec-to-plan/atomic-transitions.js:160,:240 (the :93/:240 pair are availability probes). If EXEC wires only the 2 FR-4-named sites, every handoff transition except the two atomic RPC paths will be REJECTED by the new trigger, breaking the entire pipeline.',
    },
    {
      id: 'fr4-three-cited-files-do-not-write-protected-columns',
      severity: 'warning',
      note: 'Three files named as required allowlist rows were verified by full read and do NOT write a protected column, so they must NOT consume allowlist slots. (a) plan-to-exec/gates/exec-boundary-hold.js:97 writes ONLY metadata (exec_boundary_hold, exec_boundary_hold_cleared_by, exec_boundary_hold_cleared_at, exec_boundary_hold_auto_clear_evidence) keyed on sd_key. (b) orchestrator-completion-guardian.js is READ-ONLY on strategic_directives_v2 -- all three touches (:69, :90, :128) are .select(); its .update() calls at :697/:720/:775 target retrospectives, sd_scope_deliverables and issue_patterns, and the status=completed at :586 is on product_requirements_v2. Its own comment at :741-743 (SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001) confirms it delegates SD staging to routeOrchestratorToLeadFinal(), i.e. lib/orchestrator-terminal-guard.js:72. (c) exec-to-plan/state-transitions.js:103-111 is .from(product_requirements_v2).update({status:verification, phase:verification}) -- a different table; the only SDv2 write in that file is :141. Separately, orchestrator-completion-hook.js:696 (a DIFFERENT file from the guardian) writes metadata only.',
    },
    {
      id: 'cas-predicate-masks-trigger-rejection-as-lost-race',
      severity: 'critical',
      note: 'New risk for FR-4 atomicity acceptance criteria. Three of the 12 reachable handoff sites carry a row-level concurrency predicate: cas-completion.js:29 .eq(status, pending_approval) compare-and-swap; orchestrator-terminal-guard.js:72 .neq(status, completed); skip-and-continue.js:137 .eq(updated_at, currentSD.updated_at) optimistic lock. A BEFORE UPDATE trigger fires per QUALIFYING row, so when the predicate filters the row out the statement affects 0 rows and the trigger never fires -- making a trigger rejection and a lost CAS race indistinguishable at the call site, since both surface as 0 rows. cas-completion.js already collapses this: it returns { won: Array.isArray(data) && data.length > 0 }, so a stamp rejection would be silently reported as won:false, i.e. "another session won the race" rather than "your write was rejected for lack of a stamp". EXEC must raise a distinguishable SQLSTATE AND ensure these three call sites propagate it instead of folding it into their existing 0-row branch.',
    },
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
    revision: 2,
    supersedes_row_id: 'eadd5e30-93dd-4680-82d0-84cb212f5210',
    fr_covered: ['FR-5', 'FR-2', 'FR-4'],
    method: 'pg_proc + pg_trigger + pg_get_functiondef + pg_policies + pg_roles + information_schema (live, read-only) + 5-pass repo search + exhaustive 345-file handoff-module scan',
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
    repo_own_update_writers_reachable: 45,
    repo_indirect_callers: 4,
    repo_anon_dead_writers: 3,
    repo_archived_writers: 162,
    real_table_test_writers: 10,
    disposition_allowlist: 26,
    disposition_expected_reject: 21,
    disposition_indirect_caller: 4,
    disposition_no_action_needed: 12,
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
    fr4_scoped_sites: 2,
    fr4_actual_stamp_wiring_points: 15,
    fr4_handoff_own_update_sites: 13,
    fr4_handoff_own_update_sites_reachable: 12,
    fr4_handoff_files: 11,
    fr4_handoff_rpc_entry_points: 2,
    fr4_handoff_module_files_scanned: 345,
    fr4_handoff_module_write_sites_found: 40,
    sdrepository_updatestatus_call_sites: 0,
    sdrepository_live_methods: ['getById (8 call sites)', 'verifyExists (3 call sites)'],
    cited_files_not_actually_writers: [
      'scripts/modules/handoff/executors/plan-to-exec/gates/exec-boundary-hold.js (metadata only)',
      'scripts/modules/handoff/orchestrator-completion-guardian.js (read-only on SDv2)',
      'scripts/modules/handoff/executors/exec-to-plan/state-transitions.js:103-111 (product_requirements_v2)',
    ],
    cas_predicate_sites_masking_rejection: [
      'executors/lead-final-approval/cas-completion.js:29 .eq(status,pending_approval)',
      'lib/orchestrator-terminal-guard.js:72 .neq(status,completed)',
      'skip-and-continue.js:137 .eq(updated_at,...)',
    ],
    read_only: true,
    ddl_executed: false,
  },
  execution_time_ms: 2100000,
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
console.log('REPO_PATH=' + results.metadata.repo_path);
