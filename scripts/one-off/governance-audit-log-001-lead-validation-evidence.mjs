#!/usr/bin/env node
/**
 * One-off: VALIDATION sub-agent evidence for SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001,
 * LEAD-TO-PLAN phase (GATE 1 -- LEAD pre-approval).
 *
 * Single-line fix escalated from QF-20260908-544 because the touched path
 * (database/chairman-gated/**) is refused by the QF completion preflight per
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5.
 *
 * READ PROVENANCE: all reads taken from the SD's own worktree
 * C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001
 * at HEAD c78458898e6, which is origin/main + exactly one commit. origin was fetched
 * immediately before the branch-delta measurement.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001';

const findings = [
  {
    id: 'fix-matches-stated-problem-constraint-independently-verified',
    severity: 'INFO',
    summary:
      "PRIMARY QUESTION -- CLEAN. The change is exactly what the SD says it is. Line 109 of database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql went from operation='probe' to operation='STATE_CHANGE'. I did not trust the SD's citation of the constraint: I read governance_audit_log_operation_check out of database/schema-reference-snapshot.json myself and it is CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'STATE_CHANGE'::character varying])::text[]))). 'probe' is not a member; 'STATE_CHANGE' is. The remedy is the minimum sufficient one -- an admitted literal, no change to the guard DDL, no change to the probe's semantics.",
  },
  {
    id: 'fix-is-semantically-sufficient-before-triggers-pre-empt-the-check',
    severity: 'INFO',
    summary:
      "NON-OBVIOUS SUFFICIENCY CHECK, run because a one-line constraint fix can be defeated by the next line. The verify block's UPDATE probe at line 117 sets operation = 'tampered', which is ALSO outside the admitted set. If the immutability triggers were AFTER triggers, CHECK evaluation would precede them and the migration would fail at line 117 even with line 109 corrected -- i.e. this fix would be necessary but NOT sufficient. Measured at lines 46-49, 62-65 and 77-80: all three triggers are BEFORE (BEFORE UPDATE / BEFORE DELETE / BEFORE TRUNCATE, the update and delete ones FOR EACH ROW). PostgreSQL fires BEFORE ROW triggers ahead of constraint checking, so on the healthy path governance_audit_log_freeze() raises its P0001 before 'tampered' is ever constraint-checked, and the handler at line 120 (WHEN raise_exception) absorbs it. CONCLUSION: the one-line fix IS sufficient; the migration self-verifies end to end once applied.",
  },
  {
    id: 'duplicate-delivery-path-qf-pr-8632-still-open-with-the-identical-commit',
    severity: 'HIGH',
    summary:
      "THE ONE THING THAT NEEDS A DECISION BEFORE THIS SD PROCEEDS. The same commit c78458898e69be43b1e6cd3b8cc94a31941663dc exists on TWO delivery paths. git ls-remote confirms refs/heads/qf/QF-20260908-544 is pushed at exactly that sha, and gh reports PR #8632 is state=OPEN, touching exactly one file -- the same migration. The SD branch feat/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001 carries the identical single commit and is not yet pushed. This matters beyond tidiness: QF-20260908-544 was escalated to this SD precisely BECAUSE SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5 refuses autonomous QF completion on database/chairman-gated/**. If #8632 merges, the change lands via the very path the rail withheld, the rail is satisfied only nominally, and this SD becomes a no-op with nothing left to deliver. Per the standing order to fix root causes rather than route around a refusal, the SD PR should be the merge path and #8632 should be CLOSED (not merged) with a pointer to this SD -- or #8632 explicitly re-designated as this SD's PR and the SD branch abandoned. Either is defensible; drifting into whichever merges first is not.",
  },
  {
    id: 'qf-row-carries-null-pr-url-and-commit-sha-while-pr-8632-exists',
    severity: 'MEDIUM',
    summary:
      "Bookkeeping gap with a real downstream cost. quick_fixes row QF-20260908-544 has pr_url=null AND commit_sha=null, yet PR #8632 is open on its branch qf/QF-20260908-544 at commit c78458898e6 and branch_name is populated. Dedup readers that key on pr_url/commit_sha plus gh state -- rather than on the status column alone -- are therefore blind to the fact that this work already has a PR. status='escalated' with escalated_to_sd_id=bfe8dacf-f689-41dc-b62f-f67ea8c50c54 is correctly set, so status-based dedup survives, but any reader following the pr_url/commit_sha convention would see an unshipped ticket and could mint a third row against the same one-line defect. Backfilling those two fields on the QF row closes it.",
  },
  {
    id: 'same-defect-class-survives-one-line-below-at-line-117',
    severity: 'MEDIUM',
    summary:
      "NOT blocking, but named because this file's own history is a warning. Line 117's UPDATE probe uses operation = 'tampered', which is outside the admitted set for the same reason 'probe' was. On the healthy path it is harmless (the BEFORE trigger pre-empts the CHECK -- see the sufficiency finding). But in the ONE branch the probe exists to detect -- the guard silently not firing -- the UPDATE would instead hit governance_audit_log_operation_check and raise SQLSTATE 23514 check_violation, which is not raise_exception, so it escapes the line 119-121 handler AND the outer handler at 131-132 (which catches only P0100) and aborts the migration. The behaviour still fails CLOSED, so there is no safety hazard; what is lost is the diagnostic. The purpose-written message at line 118, 'GUARD DID NOT FIRE -- an UPDATE was ACCEPTED' (P0101), is unreachable by construction: an operator debugging a genuine guard failure would be handed a constraint-violation error instead of the sentence written to explain it. Note the recurrence shape -- QF-20260907-688 fixed a WIDTH failure on this exact literal and left a MEMBERSHIP failure sitting behind it, which is the entire reason this SD exists. Leaving a third non-admitted literal in the same DO block invites a third iteration on the same seven lines. Changing 'tampered' to 'UPDATE' (admitted, still a real row change, so the trigger still fires) would close the class.",
  },
  {
    id: 'not-a-duplicate-of-qf-688-predecessor-verified-merged',
    severity: 'INFO',
    summary:
      "Duplicate check against the obvious candidate, resolved on mechanism rather than on symptom words. QF-20260907-688 targeted the same file, same line, same column, and is genuinely DIFFERENT: it fixed a WIDTH failure (a 52-character literal into operation varchar(20)) by shortening the literal to 'probe'. That fix was correct and is merged -- status=completed, commit_sha=01b7aca378bcfb0417c8491ad96695d7311f3fb8, PR #8627, verified by worker-golf-4. Membership sat behind width, so clearing the first obstacle exposed the second. Two failures, two mechanisms, two tickets -- a successor, not a duplicate. No other open QF or SD targets this file: a quick_fixes title sweep and a strategic_directives_v2 title sweep on governance_audit_log both return only this SD's own lineage.",
  },
  {
    id: 'chairman-gate-preserved-and-branch-delta-is-exactly-one-line',
    severity: 'INFO',
    summary:
      "Scope containment verified mechanically, not by assertion. After fetching origin, git diff origin/main...HEAD --stat reports 1 file changed, 1 insertion(+), 1 deletion(-), and git log origin/main..HEAD shows exactly one commit. Grepping the branch diff for 'approved-by' returns ZERO hits, so the gate line -- '-- @approved-by: <PENDING -- chairman must add this line + a token before apply>' at line 4 -- is byte-identical to origin/main. The migration therefore remains staged and UNAPPLIED; nothing in this SD touches the live database. The companion _DOWN.sql was checked for the old literal and for any 'operation' reference: none found, so it needs no matching edit (the same check worker-golf-4 ran on the predecessor).",
  },
  {
    id: 'zero-backlog-rows-is-qf-escalation-convention-not-a-gate-1-block',
    severity: 'INFO',
    summary:
      "GATE 1 nominally requires >=1 sd_backlog_map row and this SD has 0. Measured before treating that as a block: of the 12 most recent metadata.source='quick_fix' SDs, ALL TWELVE have backlog=0, and ten of them reached status='completed' (SD-LEO-FIX-AUTHORING-TIME-EVIDENCE-001, -PARENT-EXEC-RULE-001, -ESCALATION-COPIES-EXPECTED-001, -SOURCING-DEDUP-PRIORITY-001, -DRIFT-CHECK-CANNOT-001, -COWORK-IMPORTER-CANNOT-001, -GATE-ACTIVATION-INVARIANT-001, -OBSERVATIONAL-HOST-LOOPS-001, -TWO-SESSION-COORDINATION-001, -346-SHIPPED-ONLY-001). The --from-qf path carries scope in the SD's scope field and the QF's description instead, and this SD's scope field is populated with explicit expected/actual. Recording as convention-with-precedent; failing this SD on a condition ten completed siblings also met would be a false positive.",
  },
  {
    id: 'sibling-feedback-migration-out-of-scope-and-already-dispositioned',
    severity: 'INFO',
    summary:
      "Checked the neighbouring chairman-gated file for the same class, since QF-20260907-688 explicitly asked that it be checked. database/chairman-gated/20260907_feedback_immutability_trigger.sql:119 still carries the long 'probe: SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E verify' literal, but it goes into a feedback text column rather than a constrained varchar(20), so it is not the same failure. More decisively, that migration is already dispositioned for WITHDRAWAL rather than repair -- its header premise was measured false (43 durable UPDATE/DELETE writers, not zero) and applying it would make the feedback table append-only and unresolvable across 37,684 rows. Correctly out of scope here; flagged only so a later reader does not record it as a missed sibling check.",
  },
];

const warnings = [
  "Do not let PR #8632 and the SD branch race. Until one is closed, whichever merges first decides whether the FR-5 escalation rail was honoured or merely nominal -- and merging the QF PR would land a chairman-gated-path change through the exact route the preflight refused. This wants an explicit LEAD disposition, not a merge-order accident.",
  "The live-DB dry run cited by the SD (BEGIN/INSERT/ROLLBACK proving 'probe' violates the constraint and 'STATE_CHANGE' does not) is strong evidence for the INSERT at line 109 specifically. It does not exercise the UPDATE at line 117, the trigger firing order, or the block as a whole -- nothing can, until the chairman applies the migration. The BEFORE-trigger reading above is a static argument for sufficiency, not a live measurement, and should be described that way in the PRD rather than as a verified end-to-end pass.",
  "This SD's entire deliverable is already committed and CI-green. PLAN should size the PRD to that reality: the remaining work is disposition (close #8632), an optional one-line scope extension (line 117), and the chairman-ceremony handoff -- not implementation. A PRD written as though the fix were unbuilt will generate EXEC work that has nowhere to land.",
];

const recommendations = [
  "LEAD should decide the delivery path before LEAD-TO-PLAN closes: close PR #8632 with a comment pointing at SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001 and ship from the SD branch (preferred -- it is what FR-5 escalation is for), or formally adopt #8632 as this SD's PR and drop the SD branch. Record whichever is chosen in the handoff so the next reader does not re-litigate it.",
  "Backfill pr_url=https://github.com/rickfelix/EHG_Engineer/pull/8632 and commit_sha=c78458898e69be43b1e6cd3b8cc94a31941663dc onto quick_fixes row QF-20260908-544, so pr_url/commit_sha-based dedup readers can see this work already has a PR.",
  "PLAN should make an explicit, recorded call on line 117's operation = 'tampered': either extend this SD by one line to an admitted value such as 'UPDATE' (which still mutates the row, so the guard still fires, while making the P0101 'GUARD DID NOT FIRE' diagnostic reachable), or defer it with a stated rationale. Given that this SD exists only because its predecessor fixed one literal in this block and left a sibling failure behind, silent deferral is the option most likely to produce a third ticket on the same seven lines.",
  "PLAN's acceptance criteria should be written against static evidence (branch delta is one line; the gate header is unchanged; the literal is a member of the admitted set) plus the existing green CI, and should name the chairman apply ceremony as an EXTERNAL dependency rather than an acceptance gate -- the migration cannot self-verify until @approved-by is filled in and it is applied, which is not this SD's to do.",
];

const summary =
  "VALIDATION for SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001 at LEAD-TO-PLAN (GATE 1): the fix itself is CLEAN and I recommend approving it. The change is exactly one literal on exactly one line -- operation='probe' to operation='STATE_CHANGE' at line 109 of database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql -- and it matches the stated problem precisely. I verified the constraint independently rather than trusting the SD's citation: governance_audit_log_operation_check admits exactly {INSERT, UPDATE, DELETE, STATE_CHANGE}, so 'probe' could never have landed. Scope containment is verified mechanically: git diff origin/main...HEAD is 1 file / 1 insertion / 1 deletion over a single commit, and the chairman-gate line '@approved-by: <PENDING>' never appears in the diff, so the migration stays staged and unapplied and nothing reaches the live database. The DOWN file needs no matching edit. It is a successor to QF-20260907-688 (merged, PR #8627) rather than a duplicate of it -- that one fixed a WIDTH failure on the same literal, this one fixes MEMBERSHIP behind it: same column, different mechanism. I also ran a sufficiency check the SD did not claim: because a one-line constraint fix can be defeated by the next line, I checked whether line 117's UPDATE probe (operation='tampered', also non-admitted) would abort the migration anyway. It would not -- all three triggers are BEFORE triggers, and PostgreSQL fires BEFORE ROW triggers ahead of constraint checking, so the guard's P0001 pre-empts the CHECK. The fix is sufficient. Verdict is CONDITIONAL_PASS rather than PASS on one governance condition, not on the code: PR #8632 is still OPEN on branch qf/QF-20260908-544 carrying the IDENTICAL commit and the identical single file. QF-20260908-544 was escalated here precisely because SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5 refuses autonomous QF completion on database/chairman-gated/**, so if #8632 merges the change lands through the very path the rail withheld and this SD is left a no-op. LEAD should close #8632 in favour of the SD branch (or formally adopt it) before proceeding. Two lesser items: the QF row carries null pr_url and null commit_sha while that PR exists, blinding pr_url-based dedup readers; and the same non-admitted-literal defect class survives one line below at 117, where it is harmless on the healthy path but renders the purpose-written 'GUARD DID NOT FIRE' diagnostic unreachable -- worth an explicit fix-or-defer call given that this SD exists only because its predecessor left a sibling failure in this same block. Zero sd_backlog_map rows is NOT a GATE 1 block here: all 12 recent QF-escalated SDs have backlog=0 and ten are completed.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_check_result: 'NO_DUPLICATE_IMPLEMENTATION__BUT_DUPLICATE_DELIVERY_PATH_OPEN',
      escalation_context: {
        source_qf: 'QF-20260908-544',
        escalation_rail: 'SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-5',
        reason: 'touched path database/chairman-gated/** is refused by the QF completion preflight',
        predecessor_qf: 'QF-20260907-688 (completed, PR #8627, commit 01b7aca378bcfb0417c8491ad96695d7311f3fb8)',
      },
      read_provenance: {
        read_from:
          'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001',
        worktree_head: 'c78458898e69be43b1e6cd3b8cc94a31941663dc',
        relation_to_origin_main: 'origin/main + exactly 1 commit (origin fetched immediately before measuring)',
        note: 'Branch delta measured with git diff origin/main...HEAD after an explicit git fetch, not against a possibly-lagging local main.',
      },
      change_under_review: {
        file: 'database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql',
        line: 109,
        before: "VALUES ('probe_table', gen_random_uuid()::text, 'probe')",
        after: "VALUES ('probe_table', gen_random_uuid()::text, 'STATE_CHANGE')",
        branch_delta: '1 file changed, 1 insertion(+), 1 deletion(-), 1 commit',
        chairman_gate_line_4: '-- @approved-by: <PENDING -- chairman must add this line + a token before apply> (UNCHANGED, absent from diff)',
        migration_applied: false,
        live_db_touched_by_this_sd: false,
      },
      constraint_verification: {
        source: 'database/schema-reference-snapshot.json',
        constraint: 'governance_audit_log.governance_audit_log_operation_check',
        definition:
          "CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'STATE_CHANGE'::character varying])::text[])))",
        probe_admitted: false,
        state_change_admitted: true,
        method: 'read the snapshot directly rather than trusting the SD/QF citation',
      },
      sufficiency_analysis: {
        question:
          'Does line 117 (UPDATE ... SET operation = \'tampered\', also non-admitted) defeat the line-109 fix?',
        answer: 'No.',
        reason:
          'All three triggers are BEFORE (lines 46-49 BEFORE UPDATE FOR EACH ROW, 62-65 BEFORE DELETE FOR EACH ROW, 77-80 BEFORE TRUNCATE FOR EACH STATEMENT). PostgreSQL fires BEFORE ROW triggers ahead of CHECK constraint evaluation, so governance_audit_log_freeze() raises P0001 before \'tampered\' is constraint-checked, and the WHEN raise_exception handler at line 120 absorbs it.',
        residual_issue:
          'In the guard-failure branch only, the CHECK raises SQLSTATE 23514 (check_violation), which is not raise_exception and is not caught by the line 131-132 outer handler (P0100 only). Fails CLOSED, but the purpose-written P0101 \'GUARD DID NOT FIRE\' message at line 118 is unreachable by construction.',
        evidence_class: 'static reading of trigger timing, NOT a live measurement',
      },
      duplicate_delivery_path: {
        qf_branch: 'qf/QF-20260908-544',
        qf_branch_remote_sha: 'c78458898e69be43b1e6cd3b8cc94a31941663dc',
        qf_pr: 'https://github.com/rickfelix/EHG_Engineer/pull/8632',
        qf_pr_state: 'OPEN',
        qf_pr_files: ['database/chairman-gated/20260907_governance_audit_log_immutability_trigger.sql'],
        sd_branch: 'feat/SD-LEO-FIX-GOVERNANCE-AUDIT-LOG-001',
        sd_branch_pushed: false,
        identical_commit: true,
        risk:
          'If #8632 merges, the change lands via the path FR-5 withheld and this SD becomes a no-op. Requires explicit LEAD disposition.',
      },
      searches_run: [
        'git diff origin/main...HEAD --stat and git log origin/main..HEAD (branch delta)',
        "grep 'approved-by' over the branch diff (chairman-gate preservation, 0 hits)",
        "grep -n 'operation' over the migration (found only lines 108 and 117)",
        "grep -n 'probe|operation' over the companion _DOWN.sql (0 hits)",
        'read schema-reference-snapshot.json for governance_audit_log_operation_check',
        'read migration lines 30-160 (trigger definitions + full verify block)',
        'git ls-remote origin for both candidate branches; gh pr view 8632 + gh pr diff --name-only',
        'quick_fixes: QF-20260908-544, QF-20260907-688, plus title sweep on governance_audit_log',
        'strategic_directives_v2: title sweep on governance_audit_log / governance audit log',
        'sd_backlog_map counts across the 12 most recent metadata.source=quick_fix SDs',
        'sub_agent_execution_results for this SD (0 prior rows)',
      ],
      backlog_items: 0,
      backlog_items_blocking: false,
      backlog_precedent: '12/12 recent QF-escalated SDs have 0 backlog rows; 10 reached completed',
      blocking_conditions_for_plan: [
        'Disposition PR #8632 (close in favour of the SD branch, or formally adopt it) before the delivery path is decided by merge order',
      ],
      non_blocking_for_plan: [
        "Backfill pr_url/commit_sha onto quick_fixes row QF-20260908-544",
        "Explicit fix-or-defer call on line 117's operation = 'tampered'",
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'VALIDATION' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('VALIDATION EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase ?? 'LEAD_TO_PLAN');
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
