#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E — SECURITY at EXEC-TO-PLAN.
 *
 * STATIC review of the migration shipped in commit 3e39a5cb525. No database connection was opened
 * and no DDL/DML from this migration was executed — this LEO fleet worker session is not authorized
 * to write to production, including inside a rolled-back transaction. Every claim below is grounded
 * in a file in this worktree (migration text, prior RLS migrations, schema-reference-snapshot.json),
 * cited inline. Where a claim required a live read to settle, it is labelled UNVERIFIED rather than
 * asserted.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E';
const MIGRATION = 'database/migrations/20260904_capa_002e_audit_triggers_and_disposition_constraints.sql';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 84,
  execution_time_ms: 0,
  // Schema constraint check_validation_mode_values allows only 'prospective' | 'retrospective'.
  validation_mode: 'retrospective',
  summary:
    'No injection surface and no privilege-escalation surface: audit_trigger_generic() contains zero '
    + 'dynamic SQL, pins search_path, and is deliberately not SECURITY DEFINER. The 3 CHECK constraints are '
    + 'correctly non-bypassable by any writing path, which is the point. CONDITIONAL_PASS on three findings '
    + 'that must be settled against live grants/policies BEFORE apply: (SEC-1, HIGH) the AFTER-trigger writes '
    + 'into governance_audit_log inside the caller\'s transaction, so any role that can write these 4 tables '
    + 'but cannot INSERT into governance_audit_log will have EVERY write fail — a failure this repo has '
    + 'already had once (2025-11-07 migration) and then re-armed by dropping the anon policy in the 2025-12-17 '
    + 'hardening; (SEC-2, MEDIUM) full old+new row snapshots of feedback / claude_sessions / '
    + 'chairman_ratifications land in a log carrying an authenticated SELECT policy, a read-scope widening the '
    + 'existing SD/PRD precedent does not cover; (SEC-3, MEDIUM) full-snapshot auditing of the high-churn '
    + 'claude_sessions heartbeat table amplifies writes into the system\'s already-largest unbounded audit '
    + 'table. The chairman_ratifications INSERT-only decision is sound; its forward risk is real but LOW.',

  critical_issues: [],

  warnings: [
    {
      id: 'SEC-1',
      severity: 'HIGH',
      issue: 'The audit trigger couples write-availability of 4 tables to INSERT permission on governance_audit_log — a failure mode this repo has already experienced and then re-armed',
      evidence:
        'audit_trigger_generic() is AFTER ... FOR EACH ROW and INSERTs into public.governance_audit_log inside '
        + 'the caller\'s transaction (migration lines 113-117). It is NOT SECURITY DEFINER, so the INSERT runs with '
        + 'the WRITER\'s privileges and under the writer\'s RLS. If that role lacks INSERT on governance_audit_log, '
        + 'the audit INSERT fails and takes the originating statement down with it — quick_fixes, claude_sessions '
        + 'and feedback become unwritable for that role. This is documented history, not speculation: '
        + 'database/migrations/2025-11-07_add_anon_insert_governance_audit_log.sql exists precisely because that '
        + 'happened on product_requirements_v2 ("INSERT fails because anon has no INSERT policy on '
        + 'governance_audit_log"), and database/migrations/20251217_rls_security_hardening.sql:103 then DROPPED '
        + 'that anon policy as part of hardening. Post-hardening the known INSERT paths are service_role '
        + '(20260317_rls_policy_tightening_phase1.sql:154-155) and an fn_is_service_role()-gated authenticated '
        + 'policy (20251217:106-109). Of the 4 newly-triggered tables, `feedback` is the most plausible to receive '
        + 'writes from a non-service role (it carries user_id, page_url, source_application — user-submitted '
        + 'shape). UNVERIFIED here: the current live policy/grant set, which requires a DB read this session is '
        + 'not authorized to perform.',
      location: `${MIGRATION} lines 113-117, 131-151`,
      recommendation:
        'Before apply, enumerate every role that writes quick_fixes / claude_sessions / feedback / '
        + 'chairman_ratifications and confirm each holds INSERT on governance_audit_log under current RLS. If any '
        + 'does not, either grant it or make the audit INSERT non-fatal. Include a write-as-each-role smoke test in '
        + 'the apply\'s acceptance evidence — a green hermetic suite cannot see this class of failure at all.',
    },
    {
      id: 'SEC-2',
      severity: 'MEDIUM',
      issue: 'Full-row snapshots widen the read audience for three tables of a different sensitivity class than the existing SD/PRD precedent',
      evidence:
        'old_values/new_values are to_jsonb(OLD)/to_jsonb(NEW) — complete row snapshots, and on UPDATE BOTH are '
        + 'stored, so governance_audit_log becomes a full shadow copy of every version of every row. This IS '
        + 'consistent with the existing governance_audit_trigger() pattern already live on 3 tables, and that '
        + 'consistency is a fair defence of the SHAPE. It does not transfer to the CONTENT: the precedent tables '
        + 'are strategic_directives_v2 / product_requirements_v2 (governance documents), whereas per '
        + 'database/schema-reference-snapshot.json the new tables carry — feedback: error_message, stack_trace, '
        + 'page_url, user_id, description, metadata(jsonb); claude_sessions: hostname, tty, pid, machine_id, '
        + 'terminal_identity, worktree_path, metadata(jsonb); chairman_ratifications: quote, marker_text. Stack '
        + 'traces and user-submitted free text are a classic incidental-secret channel, and the session columns '
        + 'are host/operator fingerprinting. Read side: 20260317_rls_policy_tightening_phase1.sql:148 records '
        + 'governance_audit_log\'s state as "authenticated SELECT (OK), service_role ALL (tighten)" and the '
        + 'migration only narrowed the service_role side (:151-155), leaving the authenticated SELECT in place. So '
        + 'the copy is readable by `authenticated`. UNVERIFIED here: whether the 4 source tables\' own SELECT '
        + 'policies are narrower than that — if any is, this migration silently widens its effective read scope.',
      location: `${MIGRATION} lines 78-88, 113-117`,
      recommendation:
        'Before apply, compare governance_audit_log\'s SELECT audience against the NARROWEST of the 4 source '
        + 'tables. If the log is broader, either tighten its SELECT policy or capture a reduced column set for the '
        + 'sensitive tables (a jsonb minus-key projection, e.g. v_new - \'stack_trace\' - \'metadata\'), rather than '
        + 'the whole row. Cheap now; a data-exposure CAPA later.',
    },
    {
      id: 'SEC-3',
      severity: 'MEDIUM',
      issue: 'Full-snapshot UPDATE auditing of the high-churn claude_sessions heartbeat table amplifies writes into an already-unbounded audit table',
      evidence:
        'claude_sessions is the fleet heartbeat table — heartbeat_at, last_tool_at, process_alive_at, current_tool, '
        + 'current_tool_args_hash, commits_since_claim all mutate continuously per live session (columns per '
        + 'schema-reference-snapshot.json). The trigger is FOR EACH ROW on UPDATE with no WHEN clause and no '
        + 'UPDATE OF column list, so every heartbeat writes a governance_audit_log row containing TWO complete '
        + '~48-column snapshots. governance_audit_log is already the system\'s largest audit table: '
        + '20260317_rls_policy_tightening_phase1.sql:147 records 139,533 rows, and 20260610_retention_substrate.sql:7 '
        + 'records ~605,000 three months later while classifying it as unbounded — with enforcement being a '
        + 'separate chairman-gated CLI that is dry-run by default (:17-18), i.e. possibly not actually running. '
        + 'Beyond cost, this is a signal-dilution problem: the governance audit trail is the instrument used to '
        + 'answer "who changed this SD/QF", and burying it under heartbeat noise degrades that control. Availability '
        + 'and integrity-of-evidence, not confidentiality.',
      location: `${MIGRATION} lines 136-138`,
      recommendation:
        'Either scope the claude_sessions trigger to meaningful transitions (AFTER UPDATE OF status, sd_key, '
        + 'released_reason, current_phase ... or a WHEN clause excluding heartbeat-only diffs), or confirm '
        + 'retention enforcement is actively running against governance_audit_log before apply. Measure the '
        + 'projected row rate from observed claude_sessions UPDATE frequency and state it in the apply evidence.',
    },
    {
      id: 'SEC-4',
      severity: 'LOW',
      issue: 'The triggers are bypassable by session_replication_role, while the CHECK constraints are not — an asymmetry worth stating explicitly',
      evidence:
        'CHECK constraints (part c of the review) behave exactly as intended: they are evaluated by the table for '
        + 'EVERY writing path — application code, psql, PostgREST/RPC, a direct UPDATE — and are NOT disabled by '
        + 'session_replication_role = \'replica\'. Even a superuser cannot commit a violating row without first '
        + 'ALTER TABLE ... DROP CONSTRAINT, which is itself a DDL act. Because the migration adds them NOT VALID '
        + 'and then explicitly VALIDATEs (lines 233, 243, 253), they are enforced retroactively over existing rows '
        + 'too, not just new writes. No bypass. The TRIGGERS do not share that property: created with the default '
        + 'ENABLE ORIGIN, they are silently skipped by any session that sets session_replication_role=\'replica\' '
        + '(superuser/replication tooling, some pg_restore paths) — writes succeed with no audit row and no error. '
        + 'For an operational log that is acceptable; if the audit trail is meant as a tamper-evidence control, it '
        + 'is a gap. Noting also that quick_fixes_duplicate_of_pairing enforces PRESENCE of duplicate_of_id, not '
        + 'referential validity — the existing FK covers that separately.',
      location: `${MIGRATION} lines 131-151, 225-253`,
      recommendation:
        'If tamper-evidence is the intent, follow the apply with ALTER TABLE <t> ENABLE ALWAYS TRIGGER audit_<t> '
        + 'for the 4 tables. If an operational log is the intent, record that decision explicitly so a future '
        + 'reviewer does not mistake ENABLE ORIGIN for an oversight.',
    },
    {
      id: 'SEC-5',
      severity: 'LOW',
      issue: 'chairman_ratifications INSERT-only: sound decision, real but narrow forward risk',
      evidence:
        'Concur with the design. chairman_ratifications already carries _no_update/_no_delete/_no_truncate '
        + 'immutability guards, so an AFTER UPDATE OR DELETE audit clause would be structurally live and never '
        + 'fire — dead code presented as functioning, which is the exact failure mode this SD family exists to '
        + 'eliminate. The reasoning is documented in the migration header (lines 23-29) and locked by a test '
        + '(not.toMatch(/UPDATE OR DELETE/)). The forward risk is genuine but narrow: the coupling between "UPDATE '
        + 'is blocked" and "UPDATE is unaudited" lives only in a comment. A future migration that drops or weakens '
        + 'the guards without widening audit_chairman_ratifications yields a state strictly worse than today — '
        + 'mutations to an append-only governance table become both POSSIBLE and UNAUDITED, and nothing would fail. '
        + 'Note also that this migration\'s rollback block (lines 258-261) drops audit_chairman_ratifications '
        + 'without touching the guards, so rollback does not create the gap. Not a blocker.',
      location: `${MIGRATION} lines 23-29, 145-151`,
      recommendation:
        'Convert the comment into a test: assert in the hermetic suite that the three '
        + 'chairman_ratifications_no_* guard triggers still exist (or add a live pg_trigger assertion at apply '
        + 'time). Then the two changes are coupled by a failing test rather than by prose, and the risk closes for '
        + 'the cost of one assertion.',
    },
    {
      id: 'SEC-6',
      severity: 'LOW',
      issue: 'Attribution completeness: feedback.user_id is absent from the actor COALESCE chain',
      evidence:
        'The 9-candidate chain (lines 91-111) covers disposed_by, verified_by, triaged_by, assigned_to, '
        + 'promoted_by, scribe_seat, created_by, session_id, claiming_session_id. Per '
        + 'schema-reference-snapshot.json, feedback carries user_id — plausibly the actual submitting principal on '
        + 'an INSERT — and has no created_by. A feedback row inserted with user_id set but none of triaged_by / '
        + 'assigned_to / promoted_by / session_id populated therefore attributes to the literal \'SYSTEM\' despite '
        + 'a real identity being present on the row. An audit trail that records SYSTEM for a user-attributable '
        + 'action is weak evidence, and the failure is silent. Related and UNVERIFIED: record_id is v_new->>\'id\' '
        + 'cast to text; quick_fixes ids are TEXT (\'QF-*\'), so if governance_audit_log.record_id were uuid-typed '
        + 'the trigger would abort every quick_fixes write. Strong inference that it is text (the already-audited '
        + 'strategic_directives_v2/product_requirements_v2 carry TEXT SD-/PRD- ids), but not measured here.',
      location: `${MIGRATION} lines 80-111`,
      recommendation:
        'Add user_id to the COALESCE chain (after the explicit-actor columns, before session_id), and confirm '
        + 'governance_audit_log.record_id\'s column type at apply time. Both are one-line checks.',
    },
  ],

  recommendations: [
    'SQL INJECTION — CONFIRMED CLEAN, no residual risk. audit_trigger_generic() contains no EXECUTE, no format(), '
    + 'no quote_ident/quote_literal need, and no string concatenation into any SQL text. Every jsonb key access is '
    + 'a compile-time constant literal (->>\'disposed_by\' etc.), so attacker-controlled data is never part of a '
    + 'query\'s grammar — row contents flow only as VALUES expressions in a single static INSERT. TG_OP and '
    + 'TG_TABLE_NAME are supplied by the trigger machinery, not the client, and are likewise passed as values. '
    + 'Injection requires dynamic SQL; there is none.',
    'TWO POSITIVE CONTROLS WORTH PRESERVING: SET search_path TO \'public\', \'extensions\' (line 69) pins name '
    + 'resolution and blocks the search_path-hijack class that unqualified references in a trigger function would '
    + 'otherwise expose; and the function is deliberately NOT SECURITY DEFINER, so it confers no privilege '
    + 'escalation on any writer. Both are correct and neither is asserted by any test — see the companion TESTING '
    + 'row (TEST-5). Add both assertions so a future edit cannot quietly remove them.',
    'SEC-1 is the finding to act on first: it is the only one that can take production writes down, and it is '
    + 'invisible to every test currently shipped.',
    'SEC-2 and SEC-3 are both cheapest to fix BEFORE the triggers start writing — a reduced column projection or a '
    + 'scoped UPDATE OF list costs one line now and a data-migration later.',
    'Backfill content review: no security concern. The UPDATEs append to `reason` via COALESCE(reason,\'\') || '
    + 'and never overwrite verification_notes, so historical evidence text is preserved intact; the new '
    + 'legacy_grandfathered value reproduces the existing 5 enum values exactly (cross-checked against the live '
    + 'quick_fixes_disposition_check in schema-reference-snapshot.json), so no historical disposition is '
    + 'invalidated. Choosing an honest 6th value over guessing a specific one is the correct integrity call.',
    'Do not treat this row as a substitute for a live security check at apply time. Three of six findings are '
    + 'explicitly UNVERIFIED because settling them required DB reads this session is not authorized to perform.',
  ],

  detailed_analysis: [
    'SECURITY at EXEC-TO-PLAN for SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E. STATIC review only — no DB connection was',
    'opened and none of this migration\'s DDL/DML was executed. Sources: the migration text, the shipped hermetic',
    'suite, database/migrations/2025-11-07_add_anon_insert_governance_audit_log.sql,',
    '20251217_rls_security_hardening.sql, 20260317_rls_policy_tightening_phase1.sql,',
    '20260610_retention_substrate.sql, and database/schema-reference-snapshot.json.',
    '',
    '(a) INJECTION. Clean, and structurally so rather than incidentally. The function has no dynamic SQL at all:',
    'no EXECUTE, no format(), no concatenation into a query string. All jsonb key accesses are constant literals,',
    'so nothing an attacker controls ever enters SQL grammar — row data reaches the database only as VALUES',
    'expressions of one static INSERT. TG_OP/TG_TABLE_NAME come from the trigger machinery. There is no surface to',
    'defend. Two adjacent controls are also correct: search_path is pinned to public/extensions, which is what',
    'makes the unqualified references safe; and the absence of SECURITY DEFINER keeps the function running as the',
    'invoker, so it grants nobody any privilege they did not already hold. Both are unasserted by the test suite.',
    '',
    '(b) DATA IN THE AUDIT LOG. old_values/new_values are complete to_jsonb() row snapshots, both of them on every',
    'UPDATE. The "consistent with the existing governance_audit_trigger() pattern" defence is fair as to SHAPE and',
    'does not carry as to CONTENT. The precedent tables are governance documents; the new ones are not. feedback',
    'carries stack_trace, error_message, page_url, user_id and a free-form metadata jsonb — stack traces and',
    'user-submitted text are where secrets land by accident. claude_sessions carries hostname, tty, pid,',
    'machine_id, terminal_identity and worktree_path — host and operator fingerprinting. The read side is what',
    'turns this from housekeeping into a finding: the 2026-03-17 tightening migration records',
    'governance_audit_log\'s state as "authenticated SELECT (OK), service_role ALL (tighten)" and narrowed only',
    'the service_role side, so an authenticated SELECT policy remains. A complete versioned shadow copy of three',
    'sensitive tables therefore becomes readable at that scope. Whether that is a WIDENING depends on the source',
    'tables\' own SELECT policies, which I could not read here — hence MEDIUM and UNVERIFIED rather than HIGH.',
    '',
    '(c) CHECK CONSTRAINT BYPASS. None, and that is exactly the design intent. A CHECK is evaluated by the table',
    'for every writing path — ORM, psql, PostgREST, RPC, a hand-typed UPDATE — and, unlike triggers, it is not',
    'disabled by session_replication_role. A superuser has no bypass short of dropping the constraint, which is',
    'DDL and visible. The NOT VALID + explicit VALIDATE sequence means enforcement is retroactive over existing',
    'rows rather than new-writes-only, which is the stronger of the two available guarantees. The asymmetry worth',
    'naming (SEC-4) is that the TRIGGERS do not inherit this: default ENABLE ORIGIN means a replica-role session',
    'writes all four tables with no audit row and no error. Acceptable for an operational log, a gap for a',
    'tamper-evidence control — the migration does not say which it intends.',
    '',
    '(d) CHAIRMAN_RATIFICATIONS INSERT-ONLY. I concur with the decision and with its stated severity. Wiring an',
    'AFTER UPDATE OR DELETE clause onto a table whose own guards abort those statements first would ship dead code',
    'wearing the appearance of coverage — the precise pathology this SD family targets. The forward risk is real:',
    'the coupling between "UPDATE is blocked" and "UPDATE is unaudited" exists only in a header comment, so a',
    'future migration relaxing the guards without widening the audit trigger produces a state strictly worse than',
    'today, silently. It is narrow, it is not a blocker, and it closes for the price of one hermetic assertion',
    'that the three guard triggers still exist.',
    '',
    '(e) THE FINDING NOT IN THE BRIEF, AND THE MOST SERIOUS ONE. These are AFTER ... FOR EACH ROW triggers writing',
    'into governance_audit_log inside the caller\'s transaction, under the caller\'s privileges. Two consequences.',
    'Availability: any role that can write quick_fixes/claude_sessions/feedback but cannot INSERT into',
    'governance_audit_log will have EVERY such write fail. This repo has already lived this failure — the',
    '2025-11-07 migration exists solely because product_requirements_v2 writes broke when anon lacked that policy',
    '— and the 2025-12-17 hardening then dropped the policy that fixed it. feedback is the likeliest of the four',
    'to be written by a non-service role. Volume: governance_audit_log went 139.5k rows (2026-03-17) to ~605k',
    '(2026-06-10) and is classified as unbounded, with retention enforcement being a chairman-gated, dry-run-by-',
    'default CLI. Adding two full row snapshots per claude_sessions heartbeat to that is material write',
    'amplification and dilutes the very trail the log exists to provide.',
    '',
    'VERDICT RATIONALE. CONDITIONAL_PASS. The code itself is well-built — no injection surface, correct',
    'search_path pinning, no SECURITY DEFINER, non-bypassable constraints, a defensible INSERT-only decision, and',
    'a backfill that preserves rather than rewrites historical evidence. A clean PASS would nonetheless overstate',
    'what a static review can certify: SEC-1, SEC-2 and part of SEC-6 all turn on live grants, policies and column',
    'types that this session is not authorized to read, and SEC-1 in particular can break production writes while',
    'leaving all 14 hermetic tests green. Those are conditions on the apply, not defects in the commit.',
  ].join('\n'),

  conditions: [
    {
      action:
        'SEC-1 (BLOCKING ON APPLY): enumerate every role that writes quick_fixes / claude_sessions / feedback / '
        + 'chairman_ratifications and prove each holds INSERT on governance_audit_log under current RLS. A '
        + 'write-as-each-role smoke test must appear in the apply\'s acceptance evidence.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'SEC-2 (BLOCKING ON APPLY): compare governance_audit_log\'s SELECT audience to the narrowest of the 4 '
        + 'source tables. If the log is broader, tighten it or project a reduced column set for feedback and '
        + 'claude_sessions before the triggers begin writing.',
      priority: 'high',
      blocking: true,
    },
    {
      action:
        'SEC-3: scope the claude_sessions UPDATE trigger away from heartbeat-only churn (UPDATE OF <columns> or a '
        + 'WHEN clause), or confirm retention enforcement is actively running against governance_audit_log.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'SEC-5: add a hermetic assertion that the three chairman_ratifications_no_* guard triggers still exist, so '
        + 'relaxing them without widening the audit trigger fails a test rather than passing silently.',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'SEC-6: add feedback.user_id to the actor COALESCE chain, and confirm governance_audit_log.record_id is '
        + 'text-typed (quick_fixes ids are TEXT \'QF-*\'; a uuid column would abort every quick_fixes write).',
      priority: 'medium',
      blocking: false,
    },
    {
      action:
        'SEC-4: state explicitly whether this audit trail is an operational log or a tamper-evidence control. If '
        + 'the latter, ENABLE ALWAYS the 4 triggers after apply — default ENABLE ORIGIN is skipped under '
        + 'session_replication_role=\'replica\'.',
      priority: 'low',
      blocking: false,
    },
  ],

  justification:
    'CONDITIONAL_PASS recorded by SECURITY at EXEC-TO-PLAN, from a static review of commit 3e39a5cb525. The '
    + 'migration is soundly built on every point raised for review: audit_trigger_generic() has no dynamic SQL and '
    + 'therefore no injection surface, it pins search_path and is correctly not SECURITY DEFINER, the three CHECK '
    + 'constraints are non-bypassable by any writing path including superuser (and are VALIDATEd retroactively), '
    + 'and the chairman_ratifications INSERT-only choice correctly refuses to ship a never-firing trigger as '
    + 'coverage. It is conditional because three findings turn on live state this session is not authorized to '
    + 'read, and one of them can break production. The AFTER trigger writes into governance_audit_log inside the '
    + 'caller\'s transaction under the caller\'s privileges, so a writer lacking INSERT there loses the ability to '
    + 'write the source table entirely — a failure this repo already had on product_requirements_v2 in 2025-11 and '
    + 're-armed by dropping the fixing policy during the 2025-12 hardening. Alongside that, full old+new row '
    + 'snapshots of feedback, claude_sessions and chairman_ratifications land in a log carrying an authenticated '
    + 'SELECT policy, and heartbeat-rate auditing of claude_sessions amplifies the system\'s already-unbounded '
    + 'largest audit table. None are defects in the commit; all are conditions on the apply.',

  metadata: {
    review_type: 'static_source_review',
    live_db_verified: false,
    live_db_access_blocked:
      'LEO fleet worker session is not authorized to open a direct DB connection or execute this migration\'s '
      + 'DDL/DML against production, including inside a rolled-back transaction (denied by the Claude Code '
      + 'permission classifier). Findings requiring live reads are labelled UNVERIFIED, not asserted.',
    exec_commit: '3e39a5cb525',
    artifacts_reviewed: [
      MIGRATION,
      'tests/unit/database/capa-002e-audit-triggers-disposition-constraints.test.js',
      'database/migrations/2025-11-07_add_anon_insert_governance_audit_log.sql',
      'database/migrations/20251217_rls_security_hardening.sql',
      'database/migrations/20260317_rls_policy_tightening_phase1.sql',
      'database/migrations/20260610_retention_substrate.sql',
      'database/schema-reference-snapshot.json',
    ],
    briefed_questions: {
      'a_sql_injection': 'CLEAN — no dynamic SQL anywhere; jsonb keys are constant literals; row data flows only as VALUES in a static INSERT',
      'b_sensitive_data_leak': 'FINDING SEC-2 (MEDIUM) — full old+new row snapshots; shape matches existing governance_audit_trigger() precedent, but content sensitivity and the authenticated SELECT policy on governance_audit_log do not',
      'c_check_constraint_bypass': 'NO BYPASS — CHECKs bind every writing path incl. superuser and are unaffected by session_replication_role; VALIDATE makes them retroactive. Asymmetry noted at SEC-4: the TRIGGERS are bypassable that way, the constraints are not',
      'd_chairman_ratifications_insert_only': 'CONCUR — sound decision; forward risk real but LOW (SEC-5), closable with one hermetic assertion on the existing guard triggers',
    },
    additional_findings_beyond_brief: ['SEC-1 (HIGH, availability)', 'SEC-3 (MEDIUM, volume/signal-dilution)', 'SEC-6 (LOW, attribution completeness + record_id type)'],
    positive_controls_confirmed: [
      "SET search_path TO 'public', 'extensions' — blocks search_path hijack",
      'not SECURITY DEFINER — runs as invoker, no privilege escalation',
      'NOT VALID + VALIDATE — retroactive constraint enforcement over existing rows',
      "backfill appends to `reason` via COALESCE(reason,'') || and never overwrites verification_notes",
      'the 5 pre-existing disposition enum values are reproduced exactly; only legacy_grandfathered is added',
    ],
    unverified_requiring_live_read: [
      'current RLS policies and grants on governance_audit_log for every role writing the 4 tables (SEC-1)',
      'SELECT audience of the 4 source tables vs governance_audit_log (SEC-2)',
      'observed claude_sessions UPDATE rate and whether retention enforcement is running (SEC-3)',
      'governance_audit_log.record_id column type vs TEXT QF-* ids (SEC-6)',
    ],
    prd_id: 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-E',
    parent_sd: 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002',
    companion_testing_row: '2f817664-9aad-48d1-8405-9152910b5cc1 (TESTING, EXEC-TO-PLAN, CONDITIONAL_PASS)',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD,
    { name: 'Chief Security Architect', code: 'SECURITY' },
    results,
    { phase: 'EXEC-TO-PLAN', sdKey: SD },
  );
  console.log('STORED ID:', stored?.id, '| verdict:', stored?.verdict, '| phase:', stored?.phase, '| confidence:', stored?.confidence);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
