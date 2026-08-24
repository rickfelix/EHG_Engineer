// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — SECURITY evidence REV 2 (EXEC phase).
// Re-review after exec-impl-canon applied the F1/F2/F3 fixes. Every claim below was re-measured
// against the worktree and the live DB rather than taken from the implementer's summary.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = '0f589709-f317-4d79-ab3a-22a6b8a2faaf';
const PHASE = 'EXEC';
const REV1_ID = 'a9a43de1-0baa-42b0-827b-9d7fae594d4e';

const findings = [
  {
    id: 'deploy-order-stamp-column-absent-in-prod',
    severity: 'resolved',
    prior_severity: 'critical',
    title: 'RESOLVED — column split into its own migration, dependency now machine-enforced',
    note:
      'VERIFIED INDEPENDENTLY, not accepted from the summary. (1) database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql exists, carries ADD COLUMN IF NOT EXISTS, its own full lock_timeout=3s section (correctly restated rather than deferred — it notes a one-statement migration is exactly the kind applied casually), a 3-step DEPLOY ORDER header, and @approved-by PENDING. It also deliberately ships NO down-migration, with the right reason stated: dropping the column after step 2 reintroduces PGRST204. (2) The guard migration no longer contains ANY ALTER TABLE statement — grep of statement lines returns empty, and the DDL test asserts that on statements rather than prose so the header can still explain where it went. (3) The $precondition$ block is at line 256, ahead of the first object creation (registry function, line 306), so it is the first executable statement in the file; it RAISEs naming the prerequisite file by path. (4) DDL coverage is two-sided: the abort test also asserts zero guard triggers exist afterwards (aborted before creating anything), and a MIRROR asserts a clean apply once step 1 has run — which is what stops an abort-always precondition from passing vacuously. (5) canonical-writer-stamp.js now states the prerequisite as a hard MERGE precondition, and records the prior false claim together with the measurement that falsified it — better than a silent deletion, since it stops the same wrong conclusion being re-derived. (6) database/chairman-gated/README.md carries the 3-step ordering table plus a re-apply warning. ' +
      'LIVE STATE RE-CONFIRMED at re-review: lifecycle_write_token still absent, guard triggers still 0. Nothing was applied out of ceremony — TR-1 holds.',
  },
  {
    id: 'reapply-after-mode1-rollback-inherits-valid-stamps',
    severity: 'resolved',
    prior_severity: 'high',
    title: 'RESOLVED — at-rest reset added, correctly positioned, with an independent post-check and a two-sided proof',
    note:
      'VERIFIED BY LINE POSITION, not by description. $reset_at_rest$ spans lines 547-587: after BOTH DROP TRIGGER statements (504, 505) and before BOTH CREATE TRIGGER statements (593, 600), which is exactly the window where no guard is live to evaluate it and no guard has yet been armed over stale state. A DDL test pins that ordering by string index rather than trusting review. ' +
      'The post-check is a genuine independent re-count (SELECT count(*) ... WHERE lifecycle_write_token IS NOT NULL INTO v_left, RAISE if <> 0), not an echo of the UPDATE\'s own GET DIAGNOSTICS ROW_COUNT — the block\'s own comment names the distinction, and it is the only one of the two that can observe a row the UPDATE never reached. The UPDATE is predicated on IS NOT NULL so it is a true 0-row no-op on first apply, not a full-table rewrite. ' +
      'Two-sided DDL proof present and correctly constructed: rowStrandedWithAnAtRestStamp() reproduces the MODE 1 window by dropping zzz_ and asserts the stamp genuinely survives (the bug is real, not assumed), then one test shows re-apply clears it and the re-armed guard still rejects, and the MIRROR re-creates both triggers by hand SKIPPING ONLY $reset_at_rest$ and asserts the identical unstamped write is wrongly ADMITTED. That mirror is what makes the first test about the reset specifically rather than about anything else in the migration.',
  },
  {
    id: 'reset-sibling-flip-hazard-found-and-closed-by-implementer',
    severity: 'info',
    title: 'CREDIT — the implementer independently found and closed the hazard the F2 fix itself introduced',
    note:
      'Recorded because it is the more valuable half of this round. The at-rest reset I recommended is a real UPDATE, so it fires the table\'s full BEFORE ROW trigger estate — and status_auto_transition has NO TG_OP guard and NO IS DISTINCT FROM, assigning NEW.status := \'pending_approval\' on ANY update whenever current_phase IN (\'EXEC\',\'PLAN\') AND progress >= 100. A bulk maintenance statement would therefore have SILENTLY FLIPPED LIFECYCLE STATUS mid-ceremony — the recommended fix carrying the defect class the SD exists to prevent. ' +
      'This was found and closed without prompting: a pre-check counts rows matching that exact predicate and RAISEs with the offending ids rather than proceeding, plus a MIRROR test proving a stamped row outside the predicate still resets normally (so it is not a blanket refusal that would make every legitimate re-apply impossible). The reachability reasoning is also correct and worth preserving: any UPDATE that leaves a stamp behind also runs status_auto_transition, so a stamped row inside the predicate would already read pending_approval — the reachable path is a row that entered the predicate WITHOUT an update (INSERT, restore, trigger-disabled load), which is precisely how the fixture builds it.',
  },
  {
    id: 'reset-precheck-is-a-sibling-specific-second-representation',
    severity: 'low',
    title: 'NON-BLOCKING — the flip pre-check models one sibling\'s predicate; a generic post-condition would not drift',
    note:
      'PREMISE VERIFIED CORRECT TODAY, by independent measurement rather than by trusting the comment. I enumerated all 31 BEFORE ROW UPDATE triggers on strategic_directives_v2 and text-scanned each function body for assignment to status / current_phase / completion_date. Five candidates surfaced; four are FALSE POSITIVES on body trace, because the regex cannot distinguish plpgsql assignment from comparison: enforce_handoff_on_phase_transition short-circuits at its first statement (IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW), and enforce_progress_on_completion, enforce_business_value_gate and trg_require_cancellation_reason are each gated on a status TRANSITION (NEW.status = X AND OLD.status <> X) and no-op when status is unchanged. So status_auto_transition genuinely IS the only BEFORE ROW trigger that assigns a protected column without a change-guard. The migration\'s claim is accurate as written. ' +
      'THE RESIDUAL GAP IS DRIFT, NOT A LIVE BUG. The pre-check hardcodes status_auto_transition\'s predicate (current_phase IN (\'EXEC\',\'PLAN\') AND progress >= 100), and the post-check only observes stamps (v_left), never protected columns. A future trigger #36 that assigns a protected column without a change-guard would flip silently during the reset and nothing would catch it. That is the same second-representation-that-drifts problem this SD explicitly reasoned about and REJECTED when it chose a fully-generic zzz_ over one aware of status_auto_transition — so the inconsistency is with the SD\'s own stated principle, not with an outside preference. ' +
      'SUGGESTED (~8 lines, non-blocking, cheap because the row set is bounded and empty on first apply): before the UPDATE, snapshot (id, status, current_phase, completion_date) for the rows about to be reset; after it, re-compare and RAISE on any difference. That is fully generic — it needs to know nothing about any sibling — and it fails closed inside the ceremony transaction. Keep the existing pre-check as well: its message names the offending rows, which a generic post-condition cannot do as usefully. Deliberately NOT raised as blocking: the estate is verified clean today, the reset is operator-supervised, and the row set is zero on first apply.',
  },
  {
    id: 'tr4-non-coverage-names-service-role-but-authenticated-is-the-real-forger',
    severity: 'resolved',
    prior_severity: 'medium',
    title: 'RESOLVED — authenticated landed as its own 5th non-coverage item in both representations',
    note:
      'VERIFIED IN BOTH PLACES, as specified. Migration header item 5 and the PRD TR-4 amendment (re-read from product_requirements_v2, not from the diff) each: name authenticated as a case DISTINCT from service_role with different reasoning; cite the measured surface (table-level UPDATE grant plus permissive policy venture_update_strategic_directives_v2 with qual ((venture_id IS NULL) OR fn_user_has_venture_access(venture_id))); state plainly that THE GUARD ADDS NO PROTECTION AGAINST THIS ROLE; state explicitly that this is NOT a privilege expansion introduced by the SD, since authenticated could already write any lifecycle column with no stamp at all; correctly characterise the registry EXECUTE grant as a PREREQUISITE for those writes to be evaluated rather than a new door; and confirm anon IS genuinely blocked by RLS. Item 4 was also tightened to say SERVICE_ROLE explicitly and now cites rolbypassrls. Both files name the reason for the split — that folding the two roles together is what produced the original too-narrow claim — which is the part that stops it regressing.',
  },
  {
    id: 'secdef-search-path-omits-pg-temp-preexisting',
    severity: 'low',
    title: 'UNCHANGED — correctly left alone, still worth a separate ticket',
    note:
      'Re-confirmed live and deliberately not addressed this round, which was the right call: fixing it inside this SD would break the verbatim pg_get_functiondef capture invariant the DDL test enforces. complete_orchestrator_sd (search_path=public), fn_atomic_lead_to_plan_transition and fn_atomic_exec_to_plan_transition (search_path=public, pg_catalog) are SECURITY DEFINER, reference tables unqualified, and omit pg_temp — which is implicitly searched first for relation names. Track separately.',
  },
  {
    id: 'scope-note-test-count',
    severity: 'info',
    title: 'Scope note — total test count left to TESTING; security-relevant tests read directly',
    note:
      'I did not attempt to adjudicate the reported 73/73 total. Static call sites in the DDL file measure 69 (it/test), and at least one describe generates cases from a loop (TS-1..TS-3 iterates a 3-element array through a single it()), so the runtime total legitimately exceeds the static count and the two numbers reconcile. Counting is TESTING\'s evidence (row aafdf8c6-d839-4683-9267-9398439a1c55, CONDITIONAL_PASS, confidence 94), not SECURITY\'s. What I did verify directly, by reading them, is that the four tests my findings depend on exist and are correctly constructed: the precondition abort plus its mirror, the re-apply clears plus its skip-the-reset mirror, the sibling-flip refusal plus its outside-the-predicate mirror, and the reset-position pin.',
  },
];

const results = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    'SECURITY re-review (rev 2, supersedes ' + REV1_ID + ') after the F1/F2/F3 fixes. VERDICT UPGRADED CONDITIONAL_PASS -> PASS. Every claim was re-measured against the worktree and the live DB rather than accepted from the implementer\'s summary. ' +
    'F1 RESOLVED: the column is now its own migration with its own lock_timeout section and no down-migration (right call — dropping it after step 2 reintroduces PGRST204); the guard file contains no ALTER TABLE statement at all; its $precondition$ is the first executable statement (line 256, ahead of the first object at 306) and RAISEs naming the prerequisite by path; the DDL proof is two-sided and additionally asserts nothing was created on abort. The corrected comment records the prior false claim alongside the measurement that falsified it, which is stronger than deleting it. README carries the 3-step ordering. Live state re-confirmed unchanged (column absent, guards 0) — nothing applied out of ceremony, TR-1 holds. ' +
    'F2 RESOLVED, and better than specified: $reset_at_rest$ sits at 547-587, after both DROPs (504/505) and before both CREATEs (593/600), pinned by a test rather than by review; the post-check is a genuine independent re-count rather than an echo of ROW_COUNT; the two-sided proof reproduces the stale-stamp bug with zzz_ dropped and the mirror skips ONLY the reset to show the same write is wrongly admitted. ' +
    'F3 RESOLVED in both representations, with the reasoning correctly split from the service_role case and the not-a-privilege-expansion point stated explicitly. F4 correctly left alone. ' +
    'MOST VALUABLE OUTCOME OF THE ROUND, and it was unprompted: the at-rest reset I recommended was itself a latent instance of this SD\'s own defect class — a bulk UPDATE fires status_auto_transition, which has no TG_OP guard and no IS DISTINCT FROM, and would have silently flipped lifecycle status mid-ceremony. That was found and converted into a loud pre-check refusal naming the offending rows, with a mirror proving it is not a blanket refusal. ' +
    'ONE NEW LOW, NON-BLOCKING: that pre-check hardcodes one sibling\'s predicate while the post-check observes only stamps, so a future trigger assigning a protected column without a change-guard would flip silently. I verified the premise holds TODAY by enumerating all 31 BEFORE ROW UPDATE triggers and body-tracing the 5 text-scan candidates — 4 are regex false positives (comparison, not assignment; all short-circuit when status/current_phase are unchanged), so status_auto_transition genuinely is the only one. The gap is drift resistance, and it is inconsistent with the SD\'s own rejection of sibling-specific logic for zzz_. Suggested fix is a generic before/after comparison of the three protected columns over the bounded row set (~8 lines). Not blocking: the estate is verified clean, the reset is operator-supervised, and the row set is empty on first apply. ' +
    'No security objection to proceeding. Deploy order remains: apply the column migration, then merge this branch, then run the guard ceremony after the 13 remaining writers are wired.',
  findings,
  metadata: {
    review_type: 'security_architecture_review',
    revision: 2,
    supersedes_row_id: REV1_ID,
    prior_verdict: 'CONDITIONAL_PASS',
    verdict_change_reason: 'All three findings resolved and independently verified; sole new finding is low-severity and non-blocking.',
    re_measured: {
      live_column_present: false,
      live_guard_triggers: 0,
      tr1_respected: 'no DDL applied to strategic_directives_v2 outside the ephemeral test schema',
      precondition_line: 256,
      first_object_created_line: 306,
      guard_file_alter_table_statements: 0,
      drop_trigger_lines: [504, 505],
      reset_at_rest_lines: [547, 587],
      create_trigger_lines: [593, 600],
      before_row_update_triggers_enumerated: 31,
      protected_column_assign_candidates_by_textscan: 5,
      candidates_eliminated_by_body_trace: 4,
      sole_true_flipper: 'status_auto_transition (no TG_OP guard, no IS DISTINCT FROM)',
      false_positives_traced: [
        'enforce_handoff_on_phase_transition — short-circuits on IS NOT DISTINCT FROM for both columns',
        'enforce_progress_on_completion — gated on NEW.status=completed AND OLD.status<>completed',
        'enforce_business_value_gate — gated on NEW.status=active AND OLD.status<>active',
        'trg_require_cancellation_reason — gated on NEW.status=cancelled AND OLD.status<>cancelled',
      ],
      tr4_verified_in: ['migration header item 5', 'product_requirements_v2 TR-4 (re-read from DB)'],
    },
    blocking_before_merge: [],
    deploy_order: [
      '1. apply 20260824_strategic_directives_lifecycle_write_token_column.sql',
      '2. merge the stamp-wiring code branch',
      '3. wire the 13 remaining registered writers, then run the guard ceremony',
    ],
    findings_count: findings.length,
  },
  execution_time_ms: 900_000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'SECURITY',
  SD_ID,
  { name: 'Chief Security Architect' },
  results,
  { phase: PHASE },
);

console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('VERDICT=' + results.verdict + ' CONFIDENCE=' + results.confidence);
console.log('SUPERSEDES=' + REV1_ID);
