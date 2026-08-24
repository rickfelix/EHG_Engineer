// One-off: Write VALIDATION sub-agent evidence row for SD-LEO-INFRA-SIGNAL-LANE-PER-001
// PLAN_VERIFICATION phase. Independent re-verification against the PRD (docs/prds/prd-signal-lane-per-001.json
// plus the DB-corrected TR-5/TS-9 additions from scripts/one-off/prd-corrections-signal-lane-per-001.mjs)
// across commits d0681203a77, 46c9d49b62b, 44cf25c719e.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '944affe5-227f-453a-830b-8cc296b8fe4e';
const SD_KEY = 'SD-LEO-INFRA-SIGNAL-LANE-PER-001';

const findings = {
  fr1: {
    verdict: 'MET',
    evidence: [
      'lib/coordination/receipt-ledger.cjs:68-95 — DISPOSITIONS widened to 5 (ACTIONED/DECLINED/SUPERSEDED/PROMOTED/DEFERRED); SIGNAL_LANE_DISPOSITIONS maps all 5 signal-lane caller values onto them, resolveSignalDisposition() enforces mandatory linkage (reason/trigger/duplicateOf) BEFORE any DB write.',
      'scripts/coordinator-ack-signal.cjs ackSignal() stamps session_coordination.acknowledged_at THEN writes a coordination_receipts row carrying the resolved disposition + metadata.writer_identity — re-read via tests/unit/coordinator/coordinator-ack-signal-disposition.test.js (8 tests, real fake client, all pass).',
      'isCanonicalSignalDisposition() is a real exported detector (not a tautological test) — verified against both a hand-stamped shape (no writer_identity) and the writers own output.',
      'tests/unit/coordination/receipt-ledger-signal-lane.test.js (TS-3) proves all 5 values resolve to a non-null receipt with no silent drop, plus linkage-rejection tests for TS-2.',
    ],
  },
  fr2: {
    verdict: 'MET',
    evidence: [
      'lib/fleet/outstanding-signals.cjs extended (not duplicated) with fetchAllOutstandingSignals()/formatCoordinatorOverdueWarning(), sharing _fetchOutstanding() with the pre-existing worker-self fetchOutstandingSignals().',
      'DEFAULT_ALERT_AGE_MIN=30 reused as the SLA threshold rather than inventing a rival constant — a documented, deliberate correction from TESTING (fd168314) captured in commit history; oldest-first via .order(created_at, ascending:true).',
      'Wired into scripts/fleet-dashboard.cjs printInbox() (git show d0681203a77) — independent of the existing newest-first 20-row table, so an old signal cannot age off invisibly.',
      'tests/unit/fleet/outstanding-signals-coordinator-wide.test.js: coordinator-wide (no sender_session filter) vs worker-self variant both verified; overdue/not-overdue threshold tests for TS-8 pass.',
    ],
  },
  fr3: {
    verdict: 'MET',
    evidence: [
      'scripts/one-off/signal-lane-backfill-001.mjs: fetchOpenSignalRows() is live-queried + paginated (never a frozen ID list, TR-3); backfillRow() stamps acknowledged_at + isRetention:true + disposition:null, preserving the original hand-stamped text in metadata.original_hand_stamped_disposition verbatim.',
      'Deliberately does NOT reuse coordinator-ack-signal.cjs unmodified (would have hardcoded ACTIONED/isRetention:false) — confirmed by direct code read.',
      'tests/unit/coordination/signal-lane-backfill.test.js: PRIMARY regression test asserts computeAnsweredRate() output (answered/total/rate) is byte-identical pre/post backfill against lib/coordination/answered-rate.cjs, which independently excludes is_retention!==true from its numerator (grep-confirmed at answered-rate.cjs:80,106). Idempotency (TS-5) and hand-stamped-text-preservation both covered.',
      'notification_sent:true is pre-stamped on backfilled rows (added in remediation commit 46c9d49b62b) so FR-4s new SIGNAL_RESOLVED path never fires a misleading notice for a retroactive hygiene close — covered by an explicit assertion added in 44cf25c719e closing a TESTING-identified coverage gap.',
    ],
  },
  fr4: {
    verdict: 'MET',
    evidence: [
      'scripts/stale-session-sweep.cjs: new notifySignalResolvedByDisposition() fires on acknowledged_at IS NOT NULL (FR-1s own stamp) directly, excluding routed_to_sd_key rows to avoid double-fire — NOT keyed off promotion. TS-6 positive control (lone dispositioned signal -> real SIGNAL_RESOLVED insert) and TS-7 negative control (promotion alone, acknowledged_at still null -> no fire) both pass against a fake client that applies REAL PostgREST NULL-safe predicate evaluation (evalClause/parseOrString), not a fixture-blind stub.',
      'lib/coordinator/signal-router.cjs: the dormant ackAndRouteLoneSignal/stampRoutedToCoordinator path had its two PRD-identified bugs fixed — loadRecentSignals now selects acknowledged_at (tests/unit/coordinator/signal-router-lone-signal-non-disposing.test.js asserts the actual select string contains it), and stampRoutedToCoordinator is now non-disposing (never writes acknowledged_at, idempotent purely on routed_to_coordinator) — mirroring stampRouted()s already-fixed shape from the 9-critical-signals-vanished regression.',
      'EXEC exercised the "retire" branch of the PRDs explicit either/or: fixed both bugs but gave the path zero production callers (grep-confirmed: ackAndRouteLoneSignal has no caller outside its own module/tests) rather than wiring it into lib/sweep/passes/. This is a defensible reading of "retire the dormant path entirely if superseded" combined with "never leave ... an unfixed dormant path live" — the path is fixed AND inert, so it cannot become a second silent-close mechanism (TR-4 holds).',
      'Explicit ORDER BY (created_at ASC) added to both notifySignalResolvedByDisposition and notifySignalResolvedByPromotion (fixed from the prior .order(id), a random UUID) — verified present in the source. NOT independently regression-tested at >50 rows (see gap G2 below).',
    ],
  },
  tr1_no_migration: { verdict: 'MET', evidence: 'coordination_receipts.disposition remains a bare text column; all changes are JS-only (DISPOSITIONS enum + mapping logic). No migration file in the diff.' },
  tr2_tr3_ordering: { verdict: 'MET', evidence: 'Single feature commit landed FR-1 through FR-4 together but the code fully respects the FR-1-before-FR-3 dependency (backfill imports/relies on receipt-ledger.cjs constants that FR-1 defines); backfill is live-queried (fetchOpenSignalRows, paginated) and idempotent (acknowledged_at IS NULL gate), verified by TS-4/TS-5 tests.' },
  tr4_single_canonical_writer: {
    verdict: 'MET (verified independently, not solely by the shipped tests)',
    evidence: [
      'grep for recordReceipt( call sites: only scripts/coordinator-ack-signal.cjs (genuine FR-1 writer) and scripts/one-off/signal-lane-backfill-001.mjs (explicitly-scoped isRetention:true/disposition:null exception) call it with LANES.SIGNAL. No other script/lib file writes a signal-lane disposition.',
      'grep for payload.disposition writes: no hand-stamp writer exists in scripts/lib for the signal lane (all other "disposition:" hits are unrelated domains: idea-ingestion, chairman comms, QF triage, roadmap).',
      'tests/unit/session-coordination-consumption-census.test.js (pre-existing, extended by this SD) removes lib/coordinator/signal-router.cjs from its ALLOWED_WRITE_FILES allowlist and would fail if that file (or any new scripts/*.cjs or lib/coordinator/*.cjs file) reintroduced an acknowledged_at write — this is a real, automated regression guard, though its scope is broader (all coordination lanes) than a signal-disposition-specific census.',
    ],
  },
  tr5_added_via_db_correction: {
    verdict: 'PARTIALLY MET — low-severity gap',
    note: 'TR-5 ("TR-4 requires an explicit census-style test... enumerates every code path capable of writing acknowledged_at + a disposition value together") was added to the LIVE PRD row via scripts/one-off/prd-corrections-signal-lane-per-001.mjs during PLAN, and is NOT present in the checked-in docs/prds/prd-signal-lane-per-001.json snapshot I was pointed to. What shipped is an update to the pre-existing, broader session-coordination-consumption-census.test.js rather than a NEW test specifically scoped to "acknowledged_at + disposition pairing". The underlying invariant does hold (verified independently by grep above), but the literal ask for a dedicated new test was not fulfilled to the letter.',
  },
};

const gaps = [
  {
    id: 'G1',
    severity: 'low',
    area: 'scripts/coordinator-ack-signal.cjs docblock (lines ~14-16)',
    description: "Pre-existing comment (predates this SD, unchanged by either d0681203a77 or 46c9d49b62b) states acknowledged_at is 'the SAME ACTIONED marker the FR-4 signal-router `ackAndRouteLoneSignal` already writes'. This SD's own FR-4 change made stampRoutedToCoordinator (called by ackAndRouteLoneSignal) NON-DISPOSING — it never writes acknowledged_at anymore. The claim is now false, same overclaim class the 46c9d49b62b remediation fixed in 4 other places in this exact file/repo, but this instance slipped through. Non-blocking (comment only); does not affect runtime behavior or test correctness.",
  },
  {
    id: 'G2',
    severity: 'medium',
    area: 'scripts/stale-session-sweep.cjs SIGNAL_RESOLVED candidate queries (FR-4 4th acceptance criterion)',
    description: "PRD FR-4 explicitly requires: 'a test with >50 candidate rows confirms the oldest, not an arbitrary subset, is processed first.' The production .order('created_at', {ascending:true}).limit(50) fix is correctly present in BOTH notifySignalResolvedByDisposition and notifySignalResolvedByPromotion (source-read confirmed). However, both test files (tests/unit/coordinator/signal-resolved-disposition-path.test.js and signal-resolved-promotion-path.test.js) stub .order() as a total no-op and their fake .limit() ignores the requested cap entirely (returns ALL filtered rows, never slices to n) — so no test would fail if the ORDER BY were removed or reverted to the prior .order('id') (random UUID) bug. This is a genuine, missed test-coverage gap against an explicit PRD acceptance criterion; it was not caught by either of TESTING's two review passes. Recommend a follow-up test seeding >50 fixture rows with distinct created_at and asserting the oldest N are the ones acted on.",
  },
  {
    id: 'G3',
    severity: 'informational',
    area: 'TS-9 (DB-added) wording vs shipped design',
    description: "TS-9 as literally worded in the DB PRD correction (referring to a specific unconditionally-unreachable AND-branch at signal-router.cjs:379) is moot after EXEC's redesign: stampRoutedToCoordinator's idempotency check was restructured to key purely on routed_to_coordinator rather than fixing the AND-with-acknowledged_at condition in place. The underlying regression intent (an already-acked+routed row must not be re-touched) IS covered by an equivalent test in tests/unit/coordinator/signal-router-lone-signal-non-disposing.test.js. Not a real gap, just a scenario-ID/wording mismatch from a legitimate design evolution.",
  },
  {
    id: 'G4',
    severity: 'informational',
    area: 'task-prompt vs PRD scope mismatch',
    description: 'The checked-in docs/prds/prd-signal-lane-per-001.json defines only TR-1..TR-4 and TS-1..TS-8. TR-5 and TS-9 exist only in the live product_requirements_v2 DB row (added via prd-corrections-signal-lane-per-001.mjs during PLAN). Validated against the DB-corrected superset where discoverable via that one-off script; noting the discrepancy for traceability.',
  },
];

const specific_checks = {
  null_safe_or_filter: {
    verdict: 'VERIFIED SOUND',
    detail: "Both notifySignalResolvedByDisposition and notifySignalResolvedByPromotion in scripts/stale-session-sweep.cjs use .or('payload->>notification_sent.is.null,payload->>notification_sent.neq.true') — genuine PostgREST NULL-safe semantics, replacing the dead-by-construction bare .neq() (SQL NULL-propagation bug TESTING found live: 0 rows via .neq() vs 16 via the null-safe form). Verified via source read AND via dedicated unit tests (signal-resolved-disposition-path.test.js, signal-resolved-promotion-path.test.js) that implement evalClause()/parseOrString() mirroring real Postgres NULL-propagation semantics, including an explicit 'NULL <> x evaluates to false' regression assertion. All tests pass (10 test files / 82 tests run directly; 344 files / 4142 tests pass across the broader coordinator+coordination+fleet test directories).",
  },
  coordinator_adam_comms_doc_accuracy: {
    verdict: 'VERIFIED ACCURATE',
    detail: "docs/protocol/coordinator-adam-comms.md's consumption-semantics census row for lib/coordinator/signal-router.cjs now correctly states: stampRoutedToCoordinator was fixed (non-disposing marker + select-list gap fixed) but given NO production caller (a future SD's decision), and that acknowledged_at for the signal lane is written by coordinator-ack-signal.cjs alone except the narrowly-scoped, idempotent signal-lane-backfill-001.mjs exception. Cross-checked directly against lib/coordinator/signal-router.cjs's actual code and via grep (zero callers of ackAndRouteLoneSignal outside its own module/tests) — the doc claim is accurate as of this commit.",
  },
};

const critical_issues = [];
const warnings = [
  'G2 (medium): FR-4 acceptance criterion 4 (>50-row ORDER BY starvation test) is unimplemented — the ORDER BY fix in production code is correct and verified by direct source read, but no test would catch a regression that removed it.',
  'G1 (low): a pre-existing, now-stale docblock claim in scripts/coordinator-ack-signal.cjs (not touched by this SD, but invalidated by this SD\'s own FR-4 change) overstates what ackAndRouteLoneSignal writes.',
  'G3/G4 (informational): DB-corrected PRD (TR-5, TS-9) diverges from the checked-in docs/prds JSON snapshot; validated against the superset where locatable.',
];
const recommendations = [
  'Add a fixture test with >50 candidate rows (distinct created_at values) to tests/unit/coordinator/signal-resolved-disposition-path.test.js and/or signal-resolved-promotion-path.test.js that asserts the oldest N rows are the ones processed when the fake .limit()/.order() genuinely truncate/sort, closing gap G2.',
  'Correct the stale "ackAndRouteLoneSignal already writes" claim in scripts/coordinator-ack-signal.cjs\'s file-header docblock (lines ~14-16) to match its now-non-disposing behavior, closing gap G1.',
  'Regenerate docs/prds/prd-signal-lane-per-001.json from the live product_requirements_v2 row so TR-5/TS-9 are visible to future readers without needing to replay the one-off correction script.',
];

const summary = "VALIDATION verdict: CONDITIONAL_PASS (92% confidence). Independent re-read of the implementation (not just commit messages/test names) confirms FR-1 through FR-4 and TR-1 through TR-4 are substantively and correctly implemented, internally consistent, and covered by non-fixture-blind tests (344 test files / 4142 tests pass across the coordinator+coordination+fleet suites). The two specifically-flagged remediated areas are verified sound: the null-safe .or() filter fix in stale-session-sweep.cjs (both notifySignalResolvedByDisposition and notifySignalResolvedByPromotion) is genuinely NULL-safe and test-covered with real predicate evaluation, and docs/protocol/coordinator-adam-comms.md's claims about signal-router.cjs's write status are now accurate (cross-checked against the actual code and via grep for callers). TR-4's single-canonical-writer invariant holds in practice (independently verified by grep: exactly 2 call sites for recordReceipt(lane=SIGNAL), one being the explicitly-scoped, idempotent backfill exception; no hand-stamp writer exists in scripts/lib). Two residual issues keep this from a clean PASS: (G2, medium) FR-4's explicit 4th acceptance criterion -- a >50-row ORDER BY/starvation regression test -- was never added, even though the production fix itself (.order('created_at', ascending:true) replacing the prior random-UUID .order('id')) is correctly implemented and source-verified; both existing SIGNAL_RESOLVED test files stub order()/limit() as no-ops that cannot observe a regression here. (G1, low) A pre-existing docblock comment in scripts/coordinator-ack-signal.cjs, not touched by either of this SD's remediation passes, now overstates ackAndRouteLoneSignal's behavior as a direct side-effect of this SD's own FR-4 change (same overclaim class TESTING already found and fixed in 4 sibling locations). Neither issue is a functional defect -- the underlying code is correct -- but both are genuine gaps against the PRD/consistency bar this validation was asked to hold. Recommend closing G2 with a follow-up test before treating FR-4 as fully proven, and a one-line comment fix for G1.";

const results = {
  verdict: 'CONDITIONAL_PASS',
  metadata: {
    sd_key: SD_KEY,
    invoked_by: 'orchestrator-validation-agent-spawn',
    commits_reviewed: ['d0681203a775da265edb586d30c17f6ef8b665bd', '46c9d49b62b1e87292c0fc38c8d37b49d691cd65', '44cf25c719ee0df66777fef6e46391e2cd357127'],
    base_commit: 'd07741c680d',
    test_run: '10 targeted files / 82 tests pass; 344 files / 4142 tests pass (1 pre-existing expected fail, 1 skipped, both unrelated to this SD) across tests/unit/coordinator, tests/unit/coordination, tests/unit/fleet',
    prd_source: 'docs/prds/prd-signal-lane-per-001.json (FR-1..4, TR-1..4, TS-1..8) + DB-added TR-5/TS-9 via scripts/one-off/prd-corrections-signal-lane-per-001.mjs',
    gaps,
    specific_checks,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  supabase: sb,
});
applySubAgentRepoVerdict(results, resolution, { severity: 'HIGH' });

const conditions = [
  { action: 'Add a >50-row fixture test proving oldest-first ORDER BY/truncation for SIGNAL_RESOLVED candidate queries (FR-4 AC-4)', priority: 'medium', blocking: false },
  { action: "Fix the stale 'ackAndRouteLoneSignal already writes acknowledged_at' docblock claim in scripts/coordinator-ack-signal.cjs", priority: 'low', blocking: false },
];

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Principal Systems Analyst',
  phase: 'PLAN_VERIFICATION',
  verdict: results.verdict,
  confidence: 92,
  summary,
  critical_issues,
  warnings,
  recommendations,
  conditions,
  justification: summary.slice(0, 1900),
  detailed_analysis: JSON.stringify(findings, null, 2),
  validation_mode: 'retrospective',
  source: 'validation-agent',
  metadata: results.metadata,
};

console.log('--- Inserting VALIDATION evidence row (PLAN_VERIFICATION) ---');
const { data, error } = await sb.from('sub_agent_execution_results').insert(row).select('id, sub_agent_code, phase, verdict, confidence');
if (error) {
  console.error('Insert error:', error.message, error.code);
  console.error('Details:', JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('Inserted:', JSON.stringify(data, null, 2));
