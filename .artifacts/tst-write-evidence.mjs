import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults, getSupabaseClient } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = 'a281d3a9-c69a-456c-b514-2de7790ea6a7';
const supabase = await getSupabaseClient();

const { data: sdRow } = await supabase
  .from('strategic_directives_v2')
  .select('target_application')
  .eq('id', SD_UUID)
  .maybeSingle();

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: sdRow?.target_application || 'EHG_Engineer',
  subAgentCode: 'TESTING',
  fallback: process.cwd(),
  supabase,
});

const findings = [
  {
    id: 'B1',
    severity: 'INFO',
    blocker: 'Blocker 1 (CRITICAL) - campaign_content join dead on the approval-gated path',
    status: 'ROOT CAUSE AND DESIGN FIX VERIFIED CORRECT; its verification test is not viable (see N2)',
    evidence: 'Re-read directly, not taken on trust: publisher/index.js:39 builds idempotencyKey with Math.floor(Date.now()/1000), fresh on every call; :69-70 dedup SELECT keys on .eq(idempotency_key, idempotencyKey); :179-180 upsert writes idempotency_key: idempotencyKey. autonomy-gate.js:409 accepted-branch returns correlationId: accepted.correlation_id, the propose-time value. Only TWO allowed:true returns exist in checkPublishAuthorization (:392 autonomous via autoCorrelationId, :409 accepted via accepted.correlation_id) and BOTH carry a non-null correlationId, so the prescribed fix can never write an undefined key. LIVE CORROBORATION: all 3 venture_channel_publish_ledger rows carry the publisher timestamped key format (ventureId:contentId:x:ts_seconds), not the propose fallback, which confirms the mechanism empirically rather than by reasoning. Side-effect checked: content-generator.js:86 keys on Date.now() in milliseconds versus the publisher seconds, so the now-stable dedup key cannot collide with the ungated writer. FR-1 fix is architecturally correct and closes the join.',
  },
  {
    id: 'B2',
    severity: 'INFO',
    blocker: 'Blocker 2 (CRITICAL) - JS allowlist throws on unmeasurable',
    status: 'CLOSED (design and discriminating test)',
    evidence: 'Verified autonomy-gate.js:470 hard-validates [shipped_clean, reverted, caused_rework] and throws on anything else, so the SQL migration passing green would indeed mask a guaranteed runtime throw. FR-6 requires widening the allowlist in the SAME change as the SQL CHECK. TS-10 is genuinely discriminating: autonomy-gate.test.js:191 already proves the harness catches a rejected outcome value, and unmeasurable throws against current code.',
  },
  {
    id: 'B3',
    severity: 'HIGH',
    blocker: 'Blocker 3 (HIGH) - unmeasurable enters the graduation streak window',
    status: 'DESIGN CLOSED, but TS-9 CANNOT DISCRIMINATE, so NOT closed at the verification layer',
    evidence: 'Verified .neq(outcome, unknown) at autonomy-gate.js:512 AND :523 (the PRD cites 509; actual is 512, harmless drift). The PRD names BOTH sites, and excluding unmeasurable reproduces the existing unknown semantics exactly, including the consequence that limit(requiredStreak) makes the window reach further back in time. BUT the mock at autonomy-gate.test.js:38-48 is FILTER-BLIND: neq is vi.fn(() => ledgerChain), a pass-through, and limit returns recentRows verbatim regardless of any predicate. Pre-fix and post-fix code therefore both receive the identical rows array and produce the identical clean_streak, so TS-9 as written PASSES against pre-fix code. SECOND DEFECT: the chain has NO not method at all, so switching to .not(outcome, in, (unknown,unmeasurable)) returns undefined and calling .order() on it throws a TypeError, ERRORING the 5-plus existing evaluateGraduation tests rather than failing them.',
    required_fix: 'TS-9 must assert the QUERY SHAPE (that the exclusion covers both unknown and unmeasurable) instead of clean_streak equality, or the mock must be made genuinely filter-aware; and the mock must gain not: vi.fn(() => ledgerChain).',
  },
  {
    id: 'B4',
    severity: 'INFO',
    blocker: 'Blocker 4 (HIGH) - zero real yield, observer would run and do nothing invisibly',
    status: 'PREMISE RE-MEASURED TRUE; FR-4 counters correct but insufficient (see N1)',
    evidence: 'Re-measured 2026-09-12 against the live database: venture_channel_publish_ledger = 3 rows, all decision=pending, outcome=unknown, execution_mode=live; campaign_content = 0 rows. FR-4 counters (rows_selected, rows_joined, rows_unmeasurable) and TS-11 are discriminating because pre-fix main() returns no counters at all. However the counters count CLASSIFICATION, not WRITE success, which N1 shows is the gap that matters.',
  },
  {
    id: 'N1',
    severity: 'HIGH',
    blocker: 'NEW GAP created BY this correction round - the pre-apply 23514 window is silent',
    status: 'OPEN',
    evidence: 'FR-6 now widens the JS allowlist, so recordPublishOutcome({outcome: unmeasurable}) will reach the database BEFORE the chairman-gated migration applies, and violate the CHECK constraint with 23514. recordPublishOutcome RETURNS {success:false, error} rather than throwing (autonomy-gate.js:480-482), so the scheduled observer fails silently in a loop on every run until the ceremony lands, while the FR-4 counters still report rows_unmeasurable=N as though work happened. This window did NOT exist before the correction, because the JS allowlist threw first and nothing ever reached the database. The sibling precedent handles exactly this: database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql:28-35 classifies the violation as expected-pre-migration, never silently masked, and warns do NOT apply the migration and start the backfill before the consumer fix has shipped. FR-6 and TR-2 are silent on it and no test scenario covers it.',
    required_fix: 'Classify 23514 explicitly as expected-pre-migration and never mask it as success; add rows_written and rows_write_failed to the FR-4 counters so a write-blocked run is distinguishable from a genuine zero-yield run; add TS-12 asserting the pre-apply path degrades visibly.',
  },
  {
    id: 'N2',
    severity: 'HIGH',
    blocker: 'NEW GAP - TS-1, TS-2, TS-3 and TS-7 are unconditionally SKIPPED, including the only Blocker 1 proof',
    status: 'OPEN - this is a self-correction of my own prior review recommendation',
    evidence: 'MEASURED, not inferred: tests/helpers/db-target.js:25 reads DESIGNATED_NON_PROD_REFS = Object.freeze([]), and assessDbTarget(process.env) returns {allowed:false, reason:no_designated_target, ref:dedlbzhpgkmetvhbkyzq}. describeDb is describe.skipIf(!DB_TARGET_IS_DESIGNATED), so every describeDb suite skips here and in CI by design, and that file states plainly the skipping is intended behaviour that must be REPORTED rather than patched around. TS-1 is the ONLY proof that the CRITICAL Blocker 1 is closed, and it would never execute, while a skipped suite reports green. My prior review recommended this harness location: the location is fine, but the GATING makes the critical test dead by construction. INDEPENDENT SECOND REASON the integration form is unworkable: database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql is a BEFORE INSERT trigger rejecting any ledger insert unless the venture has is_demo=false AND status=active AND stage>=24 AND launch_mode=live, with deliberately no escape hatch, which directly contradicts FR-8 mandating a self-contained mock fixture.',
    required_fix: 'Re-type TS-1 as a UNIT test against the existing table-aware mock in publisher.test.js (it already models venture_channel_publish_ledger), driving attempt-1-denied then accepted then attempt-2, and asserting the campaign_content upsert key equals the propose-time correlation_id rather than the freshly rebuilt one. Any scenario left under describeDb must be declared as non-executing today.',
  },
  {
    id: 'N3',
    severity: 'MEDIUM',
    blocker: 'FR-5 execution_mode predicate is tautological and TS-6 is non-discriminating',
    status: 'OPEN',
    evidence: 'Verified UNIQUE (correlation_id) on venture_channel_publish_ledger at database/migrations/20260710_venture_channel_autonomy_ledger.sql:65. An .eq(correlation_id, X) UPDATE therefore already matches at most one row, so the FR-5 premise that a mock-mode outcome WOULD silently overwrite a live row requires a live row and a mock row sharing one correlation_id, which the UNIQUE constraint forbids. TS-6 (two rows, same venture and channel, different execution_mode) is satisfied by the unique key alone and PASSES against pre-fix code. The FR-5 second half, the mode-scoped SELECT in evaluateGraduation, IS meaningful; only the recordPublishOutcome predicate is belt-and-braces.',
    required_fix: 'Either have the caller pass an expected execution_mode so a mismatch becomes an explicit refusal (in which case the FR-4 call signature must carry it), or state plainly that the predicate is defence-in-depth and stop claiming TS-6 proves it.',
  },
  {
    id: 'N4',
    severity: 'MEDIUM',
    blocker: 'Unreconciled internal contradiction could send EXEC down the pre-correction path',
    status: 'OPEN',
    evidence: 'TR-1 still reads that the idempotency/correlation join uses the exact string already built in publisher/index.js:39 with no second correlation scheme, and the FR-1 OPENING sentence still asserts both keys are the identical string built once in lib/marketing/publisher/index.js:39 and reused for both writes, confirmed by direct read. Both are the pre-correction FALSE premise and both contradict TR-6 and FR-1 acceptance criterion 4. The correction was APPENDED roughly 200 words into the FR-1 description rather than reconciled with the text above it. An EXEC agent reading TR-1, which is short, declarative and read first, would implement the join against the fresh local key and reproduce the original defect.',
    required_fix: 'Strike the false clause from TR-1 and from the FR-1 opening sentence. The two keys are NOT identical today on the approval-gated path, and that divergence is the entire defect.',
  },
  {
    id: 'N5',
    severity: 'LOW',
    blocker: 'Fifth outcome-domain site: v_channel_autonomy_state has no unmeasurable bucket',
    status: 'INFORMATIONAL - no code readers exist today',
    evidence: 'migration 20260710:164-165 buckets only shipped_clean_count and failure_count (outcome IN (reverted, caused_rework)); unmeasurable lands in neither, which is behaviourally CORRECT because it matches how unknown behaves, so no change is required. Verified ZERO code readers of v_channel_autonomy_state repo-wide, so the observer output being invisible on this view is informational only. Recorded because the sibling precedent migration DID have to update a downstream consumer, the scripts/fleet-dashboard.cjs accuracy denominator, when it widened the same enum.',
  },
  {
    id: 'FR6-COMPLETE',
    severity: 'INFO',
    blocker: 'FR-6 fourth-site question: ANSWERED - no missed validation site',
    status: 'COMPLETE for correctness',
    evidence: 'Enumerated every place the ledger outcome domain is validated or filtered: (1) SQL CHECK at migration 20260710:60; (2) JS allowlist at autonomy-gate.js:470; (3) streak query at :512; (4) the 42703-fallback streak query at :523. ALL FOUR are named by the corrected PRD. Additional read sites, all safe: (5) the v_channel_autonomy_state view, no readers and correct by construction, see N5; (6) the streak loop test row.outcome === shipped_clean at :535, consistent because the exclusion stops an unmeasurable row ever reaching the loop; (7) venture-honesty-audit.js:136 and :145 select outcome but never filter or validate on it; (8) the outbound-gate trigger is BEFORE INSERT only and explicitly scopes UPDATE out, so recordPublishOutcome is unaffected. lib/governance/l1-work-outcome.js and lib/ledger/outcome-writer.js share the same vocabulary but for a DIFFERENT ledger, the SD/QF reward spine, not this table.',
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  summary: 'PLAN-phase re-review of the second PRD correction round. All 4 original blockers are correctly diagnosed and their DESIGN fixes are architecturally sound and complete, and the FR-6 three-part fix misses no fifth validation site (8 sites enumerated). Blockers 1, 2 and 4 are verified closed at the design layer by direct re-read of lib/marketing/publisher/index.js and lib/marketing/autonomy-gate.js plus live database measurement. NOT closed at the verification layer: TS-1 (Blocker 1, CRITICAL) is unconditionally SKIPPED because DESIGNATED_NON_PROD_REFS is measurably empty, and TS-9 (Blocker 3) cannot discriminate against a filter-blind mock. One NEW HIGH gap was created by the correction itself: widening the JS allowlist opens a silent pre-migration 23514 window.',
  findings,
  mode: 'plan-prd-review-round-2',
  metrics: {
    blockers_reviewed: 4,
    blockers_design_closed: 4,
    blockers_verification_closed: 2,
    new_gaps_found: 5,
    new_high_gaps: 2,
    outcome_validation_sites_enumerated: 8,
    outcome_validation_sites_missed_by_prd: 0,
    baseline_tests_run: 38,
    baseline_tests_passed: 38,
  },
  conditions: [
    { action: 'Re-type TS-1 as a UNIT test against the table-aware mock in publisher.test.js, driving attempt-1-denied then accepted then attempt-2 and asserting the campaign_content upsert key equals the propose-time correlation_id. Under describeDb it is unconditionally skipped because DESIGNATED_NON_PROD_REFS is empty (measured), so the only proof of the CRITICAL blocker would never execute.', priority: 'critical', blocking: true },
    { action: 'Make TS-9 assert the QUERY SHAPE (that the exclusion covers both unknown and unmeasurable) rather than clean_streak equality, and add not: vi.fn(() => ledgerChain) to the autonomy-gate.test.js mock. Otherwise TS-9 passes against pre-fix code, and the switch to .not() TypeErrors the 5-plus existing evaluateGraduation tests.', priority: 'critical', blocking: true },
    { action: 'Close the pre-apply 23514 window: classify the CHECK violation explicitly as expected-pre-migration and never mask it, add rows_written and rows_write_failed counters, and add TS-12. Mirror database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql:28-35.', priority: 'high', blocking: true },
    { action: 'Strike the pre-correction false premise from TR-1 and from the FR-1 opening sentence, since both still claim the two keys are already identical and so contradict TR-6 and FR-1 acceptance criterion 4.', priority: 'high', blocking: false },
    { action: 'Resolve FR-5: either pass an expected execution_mode from the caller so a mismatch is a refusal, or state the predicate is defence-in-depth and stop claiming TS-6 proves it, because UNIQUE(correlation_id) makes TS-6 tautological.', priority: 'medium', blocking: false },
  ],
  justification: 'CONDITIONAL_PASS rather than PASS. The corrected PRD diagnoses all four original blockers correctly and its design fixes are architecturally sound and complete, independently re-verified by direct re-read of publisher/index.js and autonomy-gate.js and by live database measurement, and the FR-6 three-part fix misses no fifth validation site across eight sites enumerated. The verdict is withheld from full green because two of the four blocker-verification tests cannot fail against pre-fix code: TS-1, the sole proof of the CRITICAL join fix, is unconditionally skipped since DESIGNATED_NON_PROD_REFS is measurably empty, and TS-9 is defeated by a filter-blind mock that also lacks a .not method. The correction additionally opened one NEW HIGH gap of its own, because widening the JS allowlist lets unmeasurable reach the database before the chairman-gated migration applies, where a 23514 CHECK violation is returned rather than thrown and the observer fails silently in a loop while the new counters still report success. All five conditions state the exact fix; three are blocking.',
  metadata: {
    phase: 'PLAN_PRD',
    test_execution: {
      tests_executed: 38,
      tests_passed: 38,
      tests_failed: 0,
      tests_skipped: 0,
      command: 'npx vitest run tests/unit/marketing/publisher.test.js tests/unit/marketing/autonomy-gate.test.js',
      note: 'BASELINE ONLY. The 38 green tests are the PRE-EXISTING suite, measured to prove a point rather than as this SD deliverable: none of them covers the approval-granted publish() path, which is precisely why Blocker 1 is invisible to a fully green run. No SD test exists yet because this is PLAN phase, pre-implementation, hence metadata.measured=false.',
      result_source: 'vitest run in the SD worktree, 2026-09-12',
    },
    measured: false,
    supersedes: '26462519-f6e1-4407-9c47-f0c4174186c5',
    also_supersedes: '1a24f0c5-8c38-488e-9504-1a9b6260ef4b (same verdict and findings; rewritten solely to carry a resolved metadata.repo_path for the SUB_AGENT_REPO_RESOLUTION gate, which the first write left null because targetApplication was omitted)',
    prd_revision_reviewed: 'plan_revision_note_2',
    review_round: 2,
    reviewer_model: 'claude-opus-5[1m]',
    verification_method: 'independent direct code re-read plus live database measurement, not PRD text trust',
    code_reread: [
      'lib/marketing/publisher/index.js (full publish(), lines 1-220)',
      'lib/marketing/autonomy-gate.js:330-470 (checkPublishAuthorization)',
      'lib/marketing/autonomy-gate.js:462-617 (recordPublishOutcome, evaluateGraduation)',
      'lib/marketing/content-generator.js:79-94 (ungated campaign_content writer)',
      'database/migrations/20260710_venture_channel_autonomy_ledger.sql (DDL plus v_channel_autonomy_state)',
      'database/chairman-gated/20260912_venture_channel_publish_ledger_execution_mode.sql',
      'database/chairman-gated/20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql',
      'database/migrations/20260828_solomon_ledger_outcome_unmeasurable.sql (precedent)',
      'tests/helpers/db-available.js and tests/helpers/db-target.js',
      'tests/unit/marketing/autonomy-gate.test.js (makeSupabase mock)',
      'tests/unit/marketing/publisher.test.js (table-aware mock)',
    ],
    live_measurements: {
      measured_at: '2026-09-12',
      ledger_rows: 3,
      ledger_all_pending_unknown: true,
      ledger_correlation_id_format: 'publisher timestamped ventureId:contentId:platform:ts_seconds, which confirms the Blocker 1 mechanism empirically',
      campaign_content_rows: 0,
      execution_mode_applied_in_live_schema: true,
      designated_non_prod_refs: [],
      assess_db_target: { allowed: false, reason: 'no_designated_target' },
    },
  },
};

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('TESTING', SD_UUID, { metadata: { version: '2.4.0' } }, results, { phase: 'PLAN_PRD' });
console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2).slice(0, 1500));
