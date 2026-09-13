#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_ID = 'fbbf9a6d-e079-4c22-9189-88336aae9a16';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const results = {
  verdict: 'PASS',
  confidence: 88,
  critical_issues: [],
  metadata: {
    phase: 'PLAN_VERIFICATION',
    review_type: 'prd_fidelity_check_shipped_code_vs_prd',
    prd_id: 'PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001',
    prd_pulled_fresh_at: new Date().toISOString(),
    branch: 'feat/SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001',
    head_commit: '9939d0a4ddf',
    merge_base: 'afb606958500611cf4cfce1f9a649cbf74ec313b',
    pr: 8841,
    prior_evidence_rows: ['d76ec942 (TESTING, conf 94)', '62384ee7 (SECURITY, conf 92)'],
    independently_executed: {
      unit_tests: 'npx vitest run tests/unit/lint/summary-column-derivation-lint.test.js tests/unit/eva/uat-robustness-gate-control-pack-sync.test.js -- 19/19 PASS (2 files)',
      dry_run: 'node database/chairman-gated/20260913_uat_control_pack_evaluated_derive_dry_run.mjs -- exit 0, all logged assertions true, ROLLBACK confirmed',
      lint_live_corpus: 'npm run lint:summary-column-derivation -- exit 1, exactly 1 finding (20260817_set_venture_pbn_verdict_stage_zero.sql, key pbn_verdict via jsonb_build_object), matching the workflow header claim',
      live_pg_trigger_scan: '.artifacts/valv-mechanism.mjs',
      live_baseline_remeasure: '.artifacts/valv-baseline2.mjs'
    },
    live_measurements_2026_09_12: {
      'uat_test_runs user triggers': 0,
      'uat_test_runs rows': 'total=26 keyed=24 legacy(neither key)=2 disagreements=0 -- FR-3 AC-5 no-backfill claim CONFIRMED',
      'sms_outbound_obligations user triggers': '0 -- FR-6 AC-1 confirmed at mechanism level (TS-7)',
      'strategic_directives_v2 user triggers': '57, none matching control_pack|fence_status|summary_column|derive -- FR-5 AC-1 confirmed at mechanism level (TS-3); also confirms TR-5 corrected count of 57',
      'boolean *_evaluated/*_passed/*_verified on BASE TABLEs': '9 distinct NAMES / 15 column instances -- NOT the 7 the PRD asserts (see F-1)'
    },
    fr_fidelity: {
      'FR-1': 'PASS -- all 3 predicates implemented as described: (a) findUndereivedBooleanColumns ALTER..ADD COLUMN boolean + suffix regex + GENERATED ALWAYS..STORED exemption + name-based baseline; (b) findUnpairedJsonbSummaryKeys scoped to UPDATE..SET via extractUpdateSetClauses, jsonb_set + jsonb_build_object, suppressed when a CREATE TRIGGER exists in-file; (c) findForeignKeySummaryColumns advisory-only (excluded from failingFiles so exit code is unaffected). CI workflow is continue-on-error:true (advisory-first) with permissions contents:read. Documented bounded gap: CREATE TABLE (col boolean) is deliberately out of scope for (a), matching the sibling alter-default-override lint convention.',
      'FR-2': 'CONDITIONAL -- the "jsonb/cross-table extent bounded to the 3 incidents" half (AC-2) is recorded in FR-2.description. The boolean-baseline half (AC-1) is factually wrong against a live walk (F-1) and omits the required per-column table/detail pairing (F-2).',
      'FR-3': 'PASS -- all 9 ACs verified, 8 of them by live execution of the real trigger. Predicate is presence-plus-inequality (NOT (v_status ? k) OR v_status->>k = not_attempted => false), never equality against evaluated. Chairman-gated + DOWN sibling + @approved-by: PENDING in both. TR-1 lock_timeout=3s asserted by the dry-run, not eyeballed. TR-2 snapshot correctly moved into UP before CREATE TRIGGER, with a NOT EXISTS re-apply guard. One PRD-staleness issue: AC-1 does not describe the shipped 3-disjunct guard (F-3).',
      'FR-4': 'PASS -- git diff origin/main HEAD -- lib/eva/uat-robustness-gate.js is EMPTY (checked against current main, not only the merge base). Regression test tests/unit/eva/uat-robustness-gate-control-pack-sync.test.js exists, 6/6 pass, asserts reader verdict === derived value across 5 control_pack_status shapes plus a control_pack_failures-ambiguity control. Caveat: the test mirrors the predicate in JS rather than executing the SQL trigger, so it proves reader/predicate agreement; the SQL side is covered separately by the dry-run.',
      'FR-5': 'PASS on AC-1/AC-2 (no migration, no live trigger, design note recorded incl. the CLEARED-vs-NOT_MET inversion hazard and the undefined verdict-to-state mapping). AC-3 (retrospective/completion-flags must flag the descope) is an OPEN post-completion obligation.',
      'FR-6': 'PASS on AC-1/AC-2 (no migration, 0 live triggers on sms_outbound_obligations, terminal-states-only + durable-receipt-table constraint recorded). AC-3 (completion-flags) is an OPEN post-completion obligation.'
    },
    test_scenario_coverage: {
      defined_in_prd: 17,
      covered_and_executed_green: ['TS-1', 'TS-2', 'TS-2c', 'TS-2d', 'TS-2f', 'TS-2g', 'TS-2h', 'TS-2i', 'TS-2j', 'TS-4', 'TS-5', 'TS-5b'],
      partially_covered: { 'TS-2b': 'F-4 -- no trigger-level fixture sets control_pack_failures at all; the dry-run comment labels the TS-2f fixture "TS-2b/TS-2f" but it does not carry the field. Reader-side ambiguity IS covered by a unit test.' },
      not_covered_by_a_shipped_check: { 'TS-2e': 'F-6', 'TS-3': 'F-6 (substance verified ad-hoc by this review)', 'TS-6': 'F-5', 'TS-7': 'F-6 (substance verified ad-hoc by this review)' },
      extra_beyond_prd: { 'TS-2k': 'the cf40b474 CRITICAL-1 self-healing regression guard -- live-verified, genuinely valuable, but has no PRD scenario backing it (same staleness as F-3)' }
    },
    findings: {
      'F-1 (MEDIUM) baseline is wrong against live schema': "FR-1 AC-4 / FR-2 AC-1 assert '7 real pre-existing boolean columns' as the lint baseline. Re-measured live (public schema, table_type=BASE TABLE, data_type=boolean, name ~ _evaluated|_passed|_verified): 9 distinct names / 15 column instances. TWO baseline names do not exist in the public schema in ANY data type -- subagent_verified, test_passed -- so they are phantom exemptions that would silently exempt a genuinely NEW column of that name from predicate (a): a real, narrow false-negative hole in a shipped enforcement mechanism. FOUR live names are absent from the baseline: all_gates_passed (sdip_groups, sdip_submissions), check_passed (documentation_health_checks), const_002_passed (proposal_debates), gates_passed (exec_authorizations); no live false positive results today (the corpus run finds 0 boolean hits, so those columns were created via CREATE TABLE or outside database/migrations/). FR-2's stated requirement was to document the extent FROM A LIVE-DATA WALK, so this is the one FR whose own premise the shipped artifact contradicts. Fix: 2 lines in BASELINE_BOOLEAN_COLUMNS + a PRD correction.",
      'F-2 (LOW) FR-2 AC-1 per-column pairing not recorded': 'AC-1 requires the baseline be recorded "with each column table and detail-column pairing (or lack thereof)". The 7 names appear in PRD FR-1.description and in BASELINE_BOOLEAN_COLUMNS, but no per-column table list or detail-column pairing exists anywhere. The lint comment notes "validation_passed on 6 tables" without enumerating them.',
      'F-3 (MEDIUM) PRD FR-3 AC-1 is stale vs the shipped guard': "AC-1 prescribes a 2-disjunct guard (TG_OP='INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW...). Shipped migration lines 89-92 carry a THIRD disjunct on control_pack_evaluated, added by EXEC-phase TESTING evidence cf40b474 CRITICAL-1 (a writer setting control_pack_evaluated directly bypassed derivation entirely). The shipped guard is a strict SUPERSET -- safer, and I confirmed live it is load-bearing (dry-run TS-2k: a direct write forcing false is self-corrected back to true). But FR-3.description's correction history stops at pass 5 (9b7255fd) and never records cf40b474, so a future reviewer diffing code against this PRD would flag the CODE as non-conforming when it is the PRD that is behind. Update FR-3.description + AC-1.",
      'F-4 (LOW) TS-2b not exercised at the trigger level': "TS-2b's distinguishing element is control_pack_failures = jsonb null alongside a fully-evaluated status, proving the trigger does not read the ambiguous field. No trigger-level fixture sets control_pack_failures at all. Substance is covered reader-side by the 'never derives satisfied=true from control_pack_failures alone' unit test, but not where TS-2b is scoped.",
      'F-5 (MEDIUM) TS-6 / TR-3 disabled-trigger detection is not implemented': "TR-3 requires the 'zero rows disagree' metric be paired with a trigger-LIVENESS assertion, and TS-6's whole purpose is to catch a DISABLED trigger a data-agreement query would miss. The UP file's DO $verify$ reads pg_trigger for EXISTENCE only -- a disabled trigger still has a pg_trigger row (tgenabled='D'), so the shipped check passes on exactly the scenario TS-6 exists to catch. The dry-run does ALTER TABLE .. DISABLE TRIGGER (as a control for TS-2j) but never reads tgenabled and never reports a disabled trigger. Cheap fix: add AND tgenabled != 'D' to the DO $verify$ predicate plus one dry-run assertion.",
      'F-6 (MEDIUM) TS-2e / TS-3 / TS-7 have no durable shipped check': "TS-2e ('confirm pre-derivation values are restorable' after DOWN on fixture rows) is unimplemented as written and is arguably OBSOLETED by the corrected TR-2 timing: the snapshot is now taken at UP time, so a fixture row created AFTER the trigger exists has no pre-derivation state to restore. The dry-run asserts only that the snapshot table is non-empty (26 rows). Either rewrite the scenario to match the corrected design or add a restore assertion -- as it stands the PRD says one thing and the code does another. TS-3 and TS-7 demand a LIVE pg_trigger mechanism check on strategic_directives_v2 and sms_outbound_obligations; no shipped script or test performs either. This review ran them ad-hoc and both PASS in substance (0 triggers on sms_outbound_obligations; 57 on strategic_directives_v2, none SD-introduced) -- but per TS-7's own wording ('a file presence is a ceremony marker, never proof of live schema state') the verification the PRD demanded is not repeatable by anyone re-reading this SD.",
      'F-7 (LOW) dry-run convention deviation': "TR-4 names the convention as 'SAVEPOINT-guarded, session_replication_role-toggling, always-ROLLBACK'. The shipped dry-run is SAVEPOINT-guarded and always-ROLLBACKs (both verified by running it), but never toggles session_replication_role -- it uses ALTER TABLE DISABLE/ENABLE TRIGGER for its TS-2j control instead. Functionally equivalent intent for this migration; noted only so the deviation from the cited precedent is on the record.",
      'F-8 (ADVISORY) the lint is permanently red-but-non-blocking': "The live corpus already yields 1 finding, so the check exits 1 on EVERY PR regardless of what that PR changed. Under continue-on-error that is non-blocking by design, but it means a genuine NEW instance will be visually indistinguishable from the standing pre-existing finding. Not a PRD violation (FR-1 AC-4 only asserts the BOOLEAN baseline is exempt, and that holds). Consider either a jsonb-key baseline exemption or diff-scoped reporting so a new hit stands out."
    },
    open_post_completion_obligations: [
      "FR-5 AC-3 and FR-6 AC-3 both require the retrospective / capture-completion-flags step to explicitly flag these as DELIBERATELY descoped (and, for FR-5, to correct the record on TESTING's now-conceded BLOCKER-4: the key IS present; the disqualifier is the clearance-inversion hazard, not zero-yield). Not yet done -- this is the /learn + capture-completion-flags tail, not a code defect, but it is a literal AC and will be silently dropped if nobody carries it."
    ]
  }
};

results.detailed_analysis = [
  'VALIDATION / PLAN_VERIFICATION -- PRD-fidelity check of the SHIPPED code against a freshly-pulled PRD-SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001. Not a fresh adversarial code review (TESTING d76ec942 / SECURITY 62384ee7 already did that); this asks only whether what shipped is what the PRD requires.',
  '',
  'VERDICT: PASS (confidence 88). Every FR shipped mechanism does what the PRD requires, and I re-executed rather than trusted: 19/19 unit tests pass, the dry-run passes live against Postgres with every assertion true and a confirmed ROLLBACK, and I independently re-measured every live claim the PRD makes. Eight findings, none blocking; two (F-1, F-5) are small correctness gaps in shipped mechanisms and are worth closing before the SD does.',
  '',
  'WHAT I CONFIRMED BY EXECUTION, NOT BY READING:',
  '  - uat_test_runs: 26 rows, 24 keyed, 2 legacy carrying neither key, ZERO disagreements under the shipped predicate. FR-3 AC-5 no-backfill claim holds today.',
  '  - 0 user triggers on uat_test_runs (migration correctly staged at @approved-by: PENDING, not applied).',
  '  - 0 user triggers on sms_outbound_obligations; 57 on strategic_directives_v2 with none matching any name this SD would introduce. FR-5/FR-6 descopes hold at the MECHANISM level, not merely as absent files.',
  '  - lib/eva/uat-robustness-gate.js is byte-identical to current origin/main, not just to the merge base. FR-4 AC-1 holds.',
  '  - The lint on the live corpus yields exactly 1 finding (pbn_verdict in 20260817_set_venture_pbn_verdict_stage_zero.sql), matching the workflow header own claim.',
  '',
  'THE FINDING THAT MATTERS MOST (F-1): FR-2 exists to record the TRUE extent of this defect class "from a live-data walk, not a static schema grep". I did that walk today and it does not match: 9 distinct boolean *_evaluated/*_passed/*_verified names across 15 base-table columns, not 7. Two of the seven exempted names -- subagent_verified and test_passed -- do not exist anywhere in the public schema in any data type, so they are phantom exemptions that would silently wave through a genuinely new column of either name. Four live names (all_gates_passed, check_passed, const_002_passed, gates_passed) are missing from the baseline. No live false positive results today, and the lint is advisory-only, so blast radius is small -- but this is the one FR whose own premise the shipped artifact contradicts, and the fix is two lines plus a PRD correction.',
  '',
  'THE SECOND SUBSTANTIVE GAP (F-5): TR-3 asks that "zero rows disagree" be paired with a trigger-liveness assertion, and TS-6 exists specifically to catch a DISABLED trigger. The shipped DO $verify$ checks pg_trigger for EXISTENCE only -- but a disabled trigger still has a pg_trigger row, so that check passes on precisely the scenario TS-6 was written to catch. Adding AND tgenabled != D closes it.',
  '',
  'DOCUMENTATION DRIFT (F-3, F-6): the code moved ahead of the PRD during EXEC. The shipped trigger guard has a third disjunct on control_pack_evaluated (from TESTING cf40b474 CRITICAL-1) that makes the summary self-healing against a direct write -- I verified live that it is load-bearing -- but FR-3 correction history stops at pass 5 and AC-1 still describes the two-disjunct version. Likewise TS-2k exists in the dry-run with no PRD scenario behind it, while TS-2e still describes a restore-from-snapshot check that the corrected TR-2 timing made unimplementable for fixture rows. None of this is a code defect; all of it means a future reviewer diffing code against this PRD would reach the wrong conclusion about which one is wrong.',
  '',
  'STILL OWED: FR-5 AC-3 and FR-6 AC-3 are literal acceptance criteria that can only be satisfied by the retrospective / capture-completion-flags tail -- explicitly flagging both instances as deliberately descoped, and correcting the record on TESTING now-conceded BLOCKER-4. They are the easiest thing in this SD to drop silently.'
].join('\n');

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase: sb
});
console.log('repo resolution:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert({
    sd_id: SD_ID,
    sub_agent_code: 'VALIDATION',
    sub_agent_name: 'Principal Systems Analyst',
    phase: 'PLAN_VERIFICATION',
    executed_from_cwd: process.cwd(),
    verdict: results.verdict,
    confidence: results.confidence,
    critical_issues: results.critical_issues,
    detailed_analysis: results.detailed_analysis,
    metadata: results.metadata
  })
  .select('id, verdict, confidence, created_at')
  .single();

if (error) { console.error('INSERT FAILED:', error); process.exit(1); }
console.log('Evidence row written:', data.id);
console.log('  verdict:', data.verdict, '| confidence:', data.confidence, '| created_at:', data.created_at);
console.log('  metadata.repo_path:', results.metadata.repo_path);
console.log('  metadata.executed_from_cwd:', results.metadata.executed_from_cwd);
