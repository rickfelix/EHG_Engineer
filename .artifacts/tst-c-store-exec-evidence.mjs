import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';

const SD = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';
const supabase = createSupabaseServiceClient();

const critical_issues = [
  'NEW-1 HIGH (latent, executably proven): wakeExpiredSnoozes() -> getSnoozedItems() marker leak. getSnoozedItems() filters ONLY on .eq("metadata->snooze->>active","true") with NO snoozed_until predicate, while wakeExpiredSnoozes() clears snoozed_until but DELIBERATELY leaves metadata.snooze.active="true". An auto-woken row therefore satisfies the getSnoozedItems filter FOREVER. MEASURED (not reasoned) via a throwaway vitest proof reusing the shipped test harness: after wakeExpiredSnoozes() the row is still returned, and .claude/skills/inbox.md:417 renders it as "| r1 | expired snooze | null | rick |" -- the literal string "null" in the Time Remaining column, because timeRemaining=null and isExpired=false (both ternaries fall through on snoozed_until=null). CONTROL PASSED: the manual unsnoozeFeedback() path sets active:false and does NOT leak, confirming the defect is specific to the bulk-wake path. This contradicts THREE of the SD own artifacts: (a) the shipped comment at wakeExpiredSnoozes ("the row no longer matches any currently-snoozed read filter regardless of the now-stale metadata.snooze.active") is FALSE for the only such filter in the file; (b) PRD FR-1 acceptance criterion (_insert-prd-audit-fix-feedback-001-c.mjs:22) asserts that same false property as its justification for not writing metadata in the bulk path; (c) PRD data_flow (_insert-prd-audit-fix-feedback-001-c.mjs:99) EXPLICITLY specifies "/inbox snoozed -> getSnoozedItems() -> SELECT WHERE snoozed_until>now AND metadata.snooze.active=true" -- a two-predicate read the shipped code implements with one predicate. This is the un-implemented second half of PLAN F1 option (b), which required "stop treating metadata.snooze.active as load-bearing for reads". LATENT TODAY: wakeExpiredSnoozes() has ZERO callers repo-wide (no cron/scheduler wired; only lib/quality/index.js re-exports it), so the leaking state is currently unreachable -- which is why this is HIGH and not BLOCKING. ONE-LINE FIX, already specified by the PRD: add .gt("snoozed_until", new Date().toISOString()) to the getSnoozedItems buildQuery.'
];

const warnings = [
  'NEW-2 ADVISORY (unstated scope extension, blast radius 0 today): the new .or() clause in loadInboxItems excludes ANY row with a future snoozed_until -- including lib/quality/assist-engine.js own this_week/next_week scheduling rows (lines 770-774 write status="backlog" plus a future snoozed_until). Those rows previously PASSED loadInboxItems (backlog is not in the .not() exclude list) and are now excluded until their scheduled date. This is semantically DESIRABLE (a row the user deferred to next week should not resurface immediately) and arguably fixes a second latent bug, but the shipped comment frames the clause as being about snooze-manager rows only, so the behavior change to assist-engine own rows is undocumented. LIVE-MEASURED blast radius today = 0: backlog rows with any snoozed_until = 0; rows with a FUTURE snoozed_until = 0; total rows with non-null snoozed_until = 1 (in the past, from chairman-decisions.mjs recordDeferral). Recommend one sentence in the comment acknowledging the clause also gates assist-engine own scheduled rows.',
  'F3 ADVISORY (honest characterization CONFIRMED, but the deferral is UNTRACKED): PRD metadata.followup_out_of_scope_finding accurately names the chairman_all_decision_signals gap, and it is NOT silently dropped. Re-measured live this run: 408 critical/high unresolved rows not excluded by the view arm (PLAN measured 404 the same day -- the +4 is normal intake drift, not a discrepancy). Materially, this SD does NOT regress that view: because snoozing now never touches status, a snoozed row visibility in the chairman queue is byte-identical to pre-SD, so the deferral is defensible. HOWEVER the note says "Needs its own SD/QF" -- an action NOT taken. Searched strategic_directives_v2, quick_fixes and feedback: ZERO tracked items match "snooze"; the only record of F3 is a PRD metadata string, which no queue or gauge reads. Per the standing rule that chairman-facing defects are minted rather than logged, recommend minting a QF before LEAD-FINAL-APPROVAL so this does not evaporate with the PRD.',
  'BASELINE (pre-existing, NOT charged to this SD): tests/integration/feedback-lifecycle-allowlist-regression.test.js FAILS rather than skips -- "Test Files 1 failed, Tests 7 skipped" with DB_TIER_BLOCKED. Its guard (HAS_DB = SUPABASE_POOLER_URL || DATABASE_URL || SUPABASE_DB_URL) asks "is a DB configured" but the real precondition enforced by tests/helpers/db-tier-gate.js is "is a NON-PRODUCTION ref designated via VITEST_DB_ALLOW_REF". Credentials ARE present here and point at production, so the guard does not fire and beforeAll throws. VERIFIED PRE-EXISTING: the sibling it cites as its model, tests/integration/claim-sweep-inflight-protection.test.js, carries the byte-identical guard line and fails identically in this same environment -- a repo-wide pattern, not a regression introduced here. CI IMPACT NIL: the db project is opt-in, no workflow gates on npm run test:db, unit-tier.yml runs --project db with a trailing || true, and the gating auditor npm run test:db-guards passes (3813 files scanned, baseline 20 tolerated, 0 new). HONESTY CONSEQUENCE: the FR-4 regression proof has ZERO executed assertions in any currently-available environment -- the 8-call-sites-already-work claim rests on the LEAD/PLAN rolled-back pg probes, not on this test file, which has never actually run.',
  'F6 CONFIRMED unchanged: the collision this SD guards against remains a population of ZERO, correctly prospective rather than witnessed. Live re-measure this run: 38,205 total feedback rows; 0 with a future snoozed_until; 0 with status=backlog AND non-null snoozed_until; 1 with any non-null snoozed_until (past). Filter arithmetic self-consistent: total(38205) - future_snoozed(0) = rows_passing_or_filter(38205).'
];

const recommendations = [
  'BEFORE LEAD-FINAL-APPROVAL, apply the one-line NEW-1 fix the PRD data_flow already specifies: add .gt("snoozed_until", new Date().toISOString()) to getSnoozedItems() buildQuery in lib/quality/snooze-manager.js, and add a regression test asserting that a row auto-woken by wakeExpiredSnoozes() is absent from getSnoozedItems(). A throwaway proof already exists and can be promoted into tests/unit/quality/snooze-manager.test.js nearly verbatim. Alternatively, if the current behavior is intended (showing recently-woken rows), correct the shipped comment and the PRD FR-1 AC plus data_flow so code and spec agree -- but the rendered literal "null" in the Time Remaining column makes that reading hard to defend.',
  'Mint a QF for F3 (chairman_all_decision_signals does not consult snoozed_until and does not exclude snoozed critical/high rows, 408 live) so the documented deferral becomes a tracked item rather than a PRD metadata string.',
  'Add one clarifying sentence to the assist-engine.js comment acknowledging the .or() clause also gates assist-engine own this_week/next_week rows (NEW-2), so a future reader does not mistake the broadened scope for an accident.',
  'SYSTEMIC (separate from this SD): the HAS_DB guard idiom shared by feedback-lifecycle-allowlist-regression.test.js and claim-sweep-inflight-protection.test.js should also require VITEST_DB_ALLOW_REF, so live-gated integration tests SKIP cleanly instead of reporting a failed test file in every production-pointed environment.'
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  critical_issues,
  warnings,
  recommendations,
  summary: 'Post-implementation TESTING validation of commit 4e7a170d2c2. MEASURED: 189 tests across 81 suites executed, 189 passed, 0 failed (runner-written JSON artifact, sha256 9ba0d2cb...), including all 38 SD-specific tests and an 18-file regression across every test touching assist-engine and lib/quality. The core FR-1 objective is VERIFIED at the strongest available standard: status now appears in lib/quality/snooze-manager.js ONLY inside comments (lines 86-92) and in ZERO executable statements -- all three .update() payloads were read and confirmed status-free, and there are no insert/upsert/delete calls anywhere in the file. The F1 bulk-wake design is VERIFIED: the chunked .in() call writes exactly {snoozed_until:null, updated_at} and never per-row metadata, correctly implementing the alternative that this agent own PLAN-phase review demanded after rejecting the unimplementable per-row-merge design. F2 is RESOLVED by the new .or() clause; F4 is RESOLVED by projectSnoozeCompatFields plus a preserved Date-typed snoozeInfo.snoozedUntil, durationHuman, and full-row .select(); F5 is DISSOLVED rather than patched, since the redesign means no pre_snooze_status exists to clobber. Both PostgREST syntaxes were re-confirmed against the LIVE production table WITH PASSING NEGATIVE CONTROLS -- the shipped .or() and the two-level metadata->snooze->>active / ->>snoozed_by filters all parsed and executed, while two deliberately malformed variants were rejected with PGRST100 parse errors, proving the parser genuinely evaluates these paths rather than silently accepting anything. ONE NEW HIGH DEFECT was found and proven executably: getSnoozedItems() filters solely on the metadata marker with no snoozed_until predicate, so a row auto-woken by wakeExpiredSnoozes() (which deliberately leaves the marker set) stays in /inbox snoozed permanently and renders its Time Remaining as the literal string "null". That contradicts the shipped comment, the PRD FR-1 acceptance criterion, AND the PRD data_flow, which explicitly specifies the two-predicate read the code implements with one. It is LATENT because wakeExpiredSnoozes() has zero callers repo-wide, and the manual unsnooze path was control-tested clean -- hence CONDITIONAL_PASS with a one-line fix the PRD already specifies, not a FAIL.',
  detailed_analysis: {
    scope: 'EXEC-TO-PLAN post-implementation validation of commit 4e7a170d2c2 (2 source files, 4 unit test files, 1 integration test file).',
    method: 'Executed the 4 SD-specific unit suites and an 18-file regression across every test referencing assist-engine or lib/quality, captured as a runner-written JSON artifact with a sha256; full read of the shipped lib/quality/snooze-manager.js and the assist-engine.js diff; exhaustive grep for status/insert/upsert/delete in the rewritten file; repo-wide consumer and call-site sweep for all 5 exported mutators; read-only live PostgREST probes WITH negative controls against the production feedback table; a throwaway vitest proof reusing the shipped mock harness to settle the wake-to-read question by execution rather than by reading; and a baseline run of the sibling integration test to separate pre-existing failures from regressions.',
    fr_verification: {
      'FR-1 never write status': 'VERIFIED -- grep shows status on lines 86,87,89,91,92 only, all inside the explanatory comment block. Zero executable references. All 3 .update() payloads read individually: snoozeFeedback writes {snoozed_until, metadata, updated_at}; unsnoozeFeedback writes {snoozed_until:null, metadata, updated_at}; wakeExpiredSnoozes writes {snoozed_until:null, updated_at}. No insert/upsert/delete anywhere in the file.',
      'FR-1 bulk path F1 resolution': 'VERIFIED -- the chunked for-loop over chunk(ids, UPDATE_CHUNK) issues .update({snoozed_until:null, updated_at:now}).in("id", ch) with NO metadata key, exactly the option-(b) design. The rejected per-row-metadata-merge design is genuinely absent.',
      'FR-2 assist-engine exclusion': 'VERIFIED in code, in unit test, and in LIVE syntax. Chained after the existing .not() filter; the shipped chain order was replayed live and executed cleanly.',
      'FR-3 skill return-shape compat': 'VERIFIED against the actual consumer. inbox.md:354 needs snoozeInfo.snoozedUntil as a Date -> shipped as new Date(...), a real Date. inbox.md:355 needs durationHuman -> present via formatDuration(durationMs). inbox.md:417 reads item.snoozed_by -> projected by projectSnoozeCompatFields. Both snoozeFeedback and unsnoozeFeedback retain a full-row .select().single() for result.title/result.status. Export surface unchanged (8 named plus default), so lib/quality/index.js:60-70 re-export and the scripts/chairman-decisions.mjs parseDuration import remain valid; the two new helpers are module-private.',
      'FR-4 regression proof for the other 5 files': 'NOT EXECUTED -- see the BASELINE warning. 7 tests, all skipped, file reports FAIL via DB_TIER_BLOCKED. Pre-existing repo-wide guard idiom, non-gating in CI, but the FR-4 claim rests on LEAD/PLAN pg probes rather than on this file.'
    },
    plan_findings_disposition: {
      F1: 'RESOLVED for the write path (bulk wake writes no metadata) but the READ half of option (b) was NOT implemented -> see NEW-1.',
      F2: 'RESOLVED -- .or() clause added and live-verified with negative controls.',
      F3: 'DEFERRED, honestly characterized, materially non-regressing, but UNTRACKED (no SD/QF/feedback row exists).',
      F4: 'RESOLVED -- back-compat projection plus all pinned return-shape invariants verified against inbox.md line by line.',
      F5: 'DISSOLVED by the redesign -- no pre_snooze_status is captured or restored, so no clobber is possible; covered by a passing test.',
      F6: 'CONFIRMED and re-measured; population remains 0, guard is correctly prospective.'
    },
    live_probe_results: {
      'P1 or(snoozed_until.is.null,snoozed_until.lte.iso)': 'PASS (2 rows)',
      'P1b shipped chain order not(status,in,...) then or(...)': 'PASS (2 rows)',
      'P2 eq(metadata->snooze->>active,true).lt(snoozed_until,now)': 'PASS (0 rows -- population is zero, per F6)',
      'P3 eq(metadata->snooze->>snoozed_by,val)': 'PASS (0 rows)',
      'P4 NEGATIVE CONTROL malformed nested path': 'CORRECTLY REJECTED -- PGRST100 failed to parse tree path (metadata->>->snooze)',
      'P5 NEGATIVE CONTROL malformed or() operator': 'CORRECTLY REJECTED -- PGRST100 failed to parse logic tree, unexpected "b" expecting operator',
      interpretation: 'The two passing negative controls are what make P1-P3 meaningful: PostgREST demonstrably parses and rejects bad syntax on this table, so the shipped filters passing is real validation rather than a silent no-op.'
    },
    census: { total_feedback_rows: 38205, rows_with_future_snoozed_until: 0, rows_with_non_null_snoozed_until: 1, backlog_rows_with_snoozed_until: 0, rows_passing_new_or_filter: 38205, filter_arithmetic_consistent: true, f3_population_now: 408, f3_population_at_plan: 404 },
    regression: { files: 18, tests: 196, failed: 0, note: 'A SyntaxError printed during the static-guard run is that guard own negative-control subprocess deliberately importing a nonexistent export; all 18 files passed.' },
    verdict_rationale: 'Not a FAIL: every PRD functional requirement that was implemented is implemented correctly, the headline FR-1 invariant holds at the strongest verifiable standard, all 189 executed tests pass, and both live syntaxes are confirmed with passing negative controls. Not a PASS: one user-facing read path contradicts its own PRD specification in a way that renders a literal "null" to the user, and it was proven by execution rather than inferred. The defect is latent (no caller) and the fix is one line the PRD already specifies, which is exactly the CONDITIONAL_PASS shape.'
  },
  metadata: {
    measured: true,
    test_execution: buildTestExecution({
      executed: 189, passed: 189, failed: 0, skipped: 0,
      runner: 'vitest@4.1.4 --project unit --reporter=json',
      artifactPath: '.artifacts/test-results/tst-c-exec.json',
      artifactSha: '9ba0d2cbbd2dd1addfb8022a57ed8a1d31583a2a822df082e47b2e634004df44',
      source: 'fresh',
      foundFiles: 18,
      mappedCandidates: 18
    }),
    phase: 'EXEC',
    review_type: 'post_implementation_validation',
    handoff: 'EXEC-TO-PLAN',
    prd_id: 'PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C',
    evaluated_commit_sha: '4e7a170d2c2f53c1abb2affb0a0a443f4d52b87b',
    plan_evidence_row_reviewed: '2de37d89-7fb2-4ab3-a37e-8d7b8c531376',
    findings_count: { blocking: 0, high: 1, advisory: 3 },
    new_defects_found: 1,
    plan_findings_resolved: ['F1-write-half', 'F2', 'F4', 'F5'],
    plan_findings_outstanding: ['F1-read-half (NEW-1)', 'F3 (deferred, untracked)'],
    baseline_applied: true,
    baseline_note: 'tests/integration/feedback-lifecycle-allowlist-regression.test.js DB_TIER_BLOCKED failure baselined against the identically-failing sibling claim-sweep-inflight-protection.test.js; not charged to this SD.'
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'TESTING',
  probeExistsRelative: 'lib/quality/snooze-manager.js',
  supabase
});
console.log('repo resolution:', JSON.stringify(resolution, null, 2));
applySubAgentRepoVerdict(results, resolution);
console.log('verdict after repo apply:', results.verdict);

const stored = await storeSubAgentResults('TESTING', SD, { code: 'TESTING', name: 'QA Engineering Director' }, results, {
  phase: 'EXEC',
  source: 'manual',
  sdKey: SD
});
console.log('STORED:', JSON.stringify(stored)?.slice(0, 400));
