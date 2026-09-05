#!/usr/bin/env node
/**
 * PLAN-phase PRD corrections for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E, after PLAN-phase testing-agent
 * review (evidence bb6a3a1f) found FR-2 dead-by-construction at the exact incident call site
 * (producer-side SELECT starvation -- isSessionAlive() callers never select `status`), plus
 * corrections to FR-1 (chokepoint design), FR-3 (two-query failure mode), FR-5 (count-measurement
 * under a row-count cap), TR-2 (false one-directional-contract claim), and PR sequencing.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Every release-path writer writes is_alive=false via a shared chokepoint, with census-completeness enforcement',
    description: "The ~24-site census (Explore evidence 6b44c537) enumerates every claude_sessions write that sets status to a terminal/stale value or stamps stale_at. Rather than 24 independent per-writer edits, introduce a shared payload-builder chokepoint (e.g. terminalSessionUpdate(status, reason, extraFields)) that every writer routes through -- this is strictly stronger than per-writer tests because it makes a future writer #25 correct by default, and doubles as the census-completeness mechanism. 10 of the ~24 writers live inside scripts/stale-session-sweep.cjs (a 4,700-line autonomous daemon); the other ~14 are 1-3 per file in modules with injectable clients. Writers that set status to 'idle' (unclaim, not retire) are explicitly OUT of scope: idle is a legitimate alive-but-unclaimed state.",
    priority: 'must_have',
    acceptance_criteria: [
      'A shared chokepoint builder exists and every identified writer routes its update payload / RPC body through it (or, for the 4 RPC bodies, an equivalent SQL-level pattern)',
      'A single builder-level test asserts is_alive:false is always present in the constructed payload for a terminal/stale status',
      'A census-completeness test/lint fails if a new claude_sessions write sets a terminal/stale status without routing through the chokepoint (or is added to an explicit, reviewed allowlist)',
      "Writers that set status='idle' are unchanged (no is_alive write added)",
    ],
  },
  {
    id: 'FR-2',
    title: "isSessionAlive() denies raw is_alive trust for released/stale rows, AND every caller's SELECT actually supplies status (producer-side parity)",
    description: "TWO PARTS, NEITHER SUFFICIENT ALONE (PLAN-phase testing-agent finding bb6a3a1f: shipping only the reader-side change leaves the exact incident call site unfixed). PART A (reader): lib/fleet/session-liveness.cjs isSessionAlive() (:167-175) currently returns {alive:true, reason:'raw_is_alive'} unconditionally whenever session.is_alive===true (:169). Corrected: this rung is denied (falls through to the next rung) when session.status is 'released' or 'stale'. (The originally-worded 'OR stale_at is set' disjunct is logically inert -- (A) OR (stale_at set AND A) simplifies to A -- and is dropped; stale_at is not read by this function.) This is a DELIBERATE, INTENTIONAL narrowing of the function's prior one-directional promise ('never returns alive=false for a session the raw flag calls alive') for released/stale rows specifically -- TR-2 must not claim the contract is unchanged. PART B (producer/consumer field-set parity, THE FIX THAT ACTUALLY CLOSES THE INCIDENT): isSessionAlive() is a pure function over whatever its caller SELECTed. Four known callers currently do NOT select `status` at all: scripts/stale-session-sweep.cjs:1281 (the holderRows query feeding the exact QF-release loop at :1324 that left QF-20260903-020/-722 claimed for 8.6 hours), scripts/hooks/coordination-inbox.cjs:927, scripts/fleet-rollcall.cjs:83, lib/worktree-reaper/live-claim-guard.js:29. Without PART B, `session.status` is undefined at these call sites after PART A ships, `['released','stale'].includes(undefined)` is false, rung 1 still returns raw_is_alive, and the sweep still skips a dead-but-frozen-flag holder -- FR-1+FR-2(PartA)+FR-3 can merge 100% green with the headline defect still live. The repo already has the enforcement mechanism for exactly this class: lib/fleet/session-liveness.cjs's exported LIVENESS_INPUT_FIELDS constant (:198-204) + tests/unit/fleet/liveness-input-parity.test.js, whose own docblock states the prior incident this mechanism exists to prevent ('the guard was never wrong, it was STARVED'). Add Object.freeze(['status']) as a new group to LIVENESS_INPUT_FIELDS, and update all 4 identified callers' SELECT lists to include status. This will predictably turn 2 existing assertions in liveness-input-parity.test.js red by design (:108 toEqual(['is_alive']) -> ['is_alive','status']; :92 toHaveLength(3) -> 4) -- expected, not a regression to avoid.",
    priority: 'must_have',
    acceptance_criteria: [
      "A fixture row {status:'released', is_alive:true, heartbeat_at: 8h old, no PID} returns {alive:false}",
      "A fixture row {status:'idle'/'active', is_alive:true} returns {alive:true, reason:'raw_is_alive'} unchanged",
      "LIVENESS_INPUT_FIELDS gains a ['status'] group; liveness-input-parity.test.js's updated assertions pass, and it now fails red for any of the 4 identified callers if status is ever dropped from their SELECT again",
      'All 4 identified callers (stale-session-sweep.cjs:1281, coordination-inbox.cjs:927, fleet-rollcall.cjs:83, live-claim-guard.js:29) select status',
      "END-TO-END regression proving the incident is actually closed: a fixture reproducing scripts/stale-session-sweep.cjs's exact holderRows query + isSessionAlive() call against the e60956f5 shape returns {alive:false} -- not merely a fixture that hand-supplies status",
      'The existing SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 false-negative regression fixture (a legitimately-alive session) still returns {alive:true} via a downstream rung -- this FR must not introduce a new false negative for active/idle sessions',
      'The dispatch-safety comment/contract at scripts/hooks/coordination-inbox.cjs:984-990 (which relies on the prior one-directional promise) is reviewed and, if it assumed alive=true is never denied, updated to reflect that a released/stale session correctly reads dead — verified this does not silently break dispatch eligibility logic there',
    ],
  },
  {
    id: 'FR-3',
    title: 'clearAndReopenQf() releases a claimed-but-open quick-fix, with a defined failure mode for reason-determination',
    description: "lib/fleet/best-effort-release.mjs clearAndReopenQf() (:246-266) filters .filter('status','eq','in_progress') (:254), so a quick_fixes row at status='open' with a non-null claiming_session_id never matches and the function returns {changed:false, reason:'guard_refused'} -- indistinguishable from a genuine refusal. Corrected: the status filter widens to .in('status', ['in_progress','open']); the UPDATE payload {status:'open', claiming_session_id:null} is idempotent-safe for an already-open row. Distinguishing a genuine 'no row currently matches any predicate' (no_match_status) from 'a matching row exists but a real-work guard blocked it' (guard_refused) requires a SECOND query (a zero-row UPDATE cannot itself say why) -- define the failure mode for THAT query explicitly: if the second (reason-determining) read itself fails, the function must NOT default to 'guard_refused' (which is exactly the misreporting QF-20260905-544 was raised to kill); it should return a distinct reason (e.g. 'reason_lookup_failed') so a caller/log reader is not misled into believing the guard is working as intended. The CAS expectedHolder predicate (:259-261) and the real-work exclusions (:264-265) are unchanged. Closes QF-20260905-544 (escalated into this SD, disposition=promoted).",
    priority: 'must_have',
    acceptance_criteria: [
      "A fixture quick_fixes row at status='open' with claiming_session_id set to a dead session's id is released (claiming_session_id cleared, status stays 'open') by a call with matching expectedHolder",
      "A fixture row at status='in_progress' with the same claim is released and status transitions to 'open' -- unchanged prior behavior",
      "A call against a row with no matching status/claim returns a distinguishable reason ('no_match_status') from a call against a row that matched but was blocked by pr_url/commit_sha ('guard_refused')",
      "A simulated failure of the reason-determining second query returns a distinct reason ('reason_lookup_failed'), never silently defaulting to 'guard_refused'",
      'The CAS expectedHolder guard still refuses a release when the current claiming_session_id does not match expectedHolder',
    ],
  },
  {
    id: 'FR-4',
    title: 'Corrected, satisfiable CI-scheduled exit predicate',
    description: "The predicate as originally worded ('claude_sessions rows with status released or stale_at set AND is_alive=true, asserted at zero') is unsatisfiable by construction: stale_at is never cleared when a session returns to status='active', so a currently-healthy session with a leftover stale_at timestamp would permanently violate the literal predicate. CORRECTED PREDICATE (current-status-gated): zero rows WHERE status IN ('released','stale') AND is_alive=true. Measured live 2026-09-05 (validation-agent evidence e523e69f, re-measured by PLAN-phase testing-agent bb6a3a1f): of the ~2,106 rows originally flagged under the unsatisfiable predicate, 2,104 are genuinely status='released' with is_alive=true (real contradictions requiring FR-1's fix + FR-5's backfill) and only 2 are the false-positive class the correction exists to exclude (currently status='active' with a leftover stale_at). status='stale' currently has zero rows table-wide. A new scheduled script runs the corrected query and fails loud if the count is nonzero, from the merge commit forward. FR-1's chokepoint census-completeness mechanism is the PRE-MERGE gate; this FR is the POST-MERGE production alarm -- both are needed, neither substitutes for the other.",
    priority: 'must_have',
    acceptance_criteria: [
      "The scheduled check script runs the corrected query and exits non-zero if any row currently matches status IN ('released','stale') AND is_alive=true",
      'A CI test constructs the e60956f5 shape as a fixture and asserts the FULL causal chain: the exact stale-session-sweep.cjs holderRows-shaped query + isSessionAlive() reads it dead (FR-2 end-to-end, not a hand-built fixture), AND the QF stale-claim sweep releases both an in_progress and a claimed-open QF held by that session (FR-3)',
      'The scheduled check is wired into CI (or a documented cron equivalent); its first real run against production reports the actual pre-backfill count (expected ~2,104), and a run after FR-5s backfill + FR-1s writers ship reports zero',
    ],
  },
  {
    id: 'FR-5',
    title: 'One-time idempotent backfill of existing contradicted rows, with a count-measurement approach that survives a row-count cap',
    description: "Existing rows matching the corrected FR-4 predicate (status IN ('released','stale') AND is_alive=true) are set is_alive=false in one idempotent run. PLAN-phase testing-agent (bb6a3a1f) found the population (~2,104 rows) EXCEEDS this environment's measured db-max-rows cap of 1000: a naive .update(...).select('id') then data.length undercounts (returns 1000, not 2,104), and if the SAME cap also bounds the actual WRITE (not just the SELECT-back), a second idempotent run would affect ~1,104 additional rows and falsely fail an idempotency check expecting 0 on re-run. CORRECTED APPROACH: bracket the write with two separate {count:'exact', head:true} queries (one immediately before, one immediately after the UPDATE) against the same predicate, and take the delta as the affected-row count -- this is correct regardless of any row-count cap on the UPDATE's own return payload. If the UPDATE itself is cap-bound (verify this explicitly against the live environment before running), the backfill must loop until the pre/post delta reaches zero, not assume one UPDATE call is sufficient for ~2,104 rows.",
    priority: 'must_have',
    acceptance_criteria: [
      "The backfill script measures affected rows via a {count:'exact',head:true} delta, not data.length off the UPDATE's own .select()",
      'The backfill script is verified against the live row-count cap: if a single UPDATE cannot affect all matching rows, the script loops until the corrected predicate count reaches zero',
      'A second run of the backfill script (after the first completes) affects zero rows and is confirmed via the same count-delta method',
      'The exact affected-row count from the real production run is recorded in this PRD or the retrospective',
      "Re-running FR-4's scheduled check immediately after the backfill returns zero",
    ],
  },
];

const technical_requirements = [
  { id: 'TR-1', requirement: "FR-1's chokepoint builder test must assert on the actual constructed payload object (or, for the RPC bodies, the SQL migration's written columns), not merely that the function runs without error. The census-completeness mechanism must be able to fail red for an unrouted writer, not merely document the census in prose." },
  { id: 'TR-2', requirement: "FR-2 (Part A) is a DELIBERATE narrowing of isSessionAlive()'s prior one-directional contract for status IN ('released','stale') only -- it does NOT leave the contract unchanged, and this PRD must not claim otherwise. The narrowing is verified safe by: (a) it applies to exactly the states FR-1 now correctly writes is_alive:false for, (b) FR-2 Part B (producer SELECT parity) ensures every known caller actually observes the corrected status, and (c) the existing false-negative regression fixture (SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001) continues to pass for every OTHER status." },
  { id: 'TR-3', requirement: "FR-3's status-filter widening in clearAndReopenQf() must not change the CAS expectedHolder semantics or the real-work exclusion guards (pr_url IS NULL, commit_sha IS NULL) -- only the status predicate widens, and the new reason-lookup query's own failure mode must be explicit (never silently 'guard_refused')." },
  { id: 'TR-4', requirement: 'FR-1s RPC-body fixes (create_or_replace_session, release_session, cleanup_stale_sessions, report_pid_validation_failure -- 4 in-scope functions; release_sd/release_sd_by_key set status=idle and are out of scope, switch_sd_claim touches neither column and is not applicable) require a new, additive-only migration, applied via the documented schema-apply handshake in CLAUDE.md.' },
  { id: 'TR-5', requirement: "FR-5's backfill script must explicitly probe and document this environment's actual row-count cap on both SELECT and UPDATE operations before assuming a single query call is sufficient for a ~2,104-row population." },
];

const test_scenarios = [
  { id: 'TS-1', scenario: "isSessionAlive() denies raw_is_alive for a released/stale row (with status supplied), still trusts it for active/idle", expected_result: 'Per FR-2 Part A acceptance criteria' },
  { id: 'TS-2', scenario: "Each FR-1 writer routes through the shared chokepoint and the chokepoint's payload always includes is_alive:false for a terminal/stale status", expected_result: 'One builder-level test plus call-site routing assertions; a census-completeness check fails for an unrouted writer' },
  { id: 'TS-3', scenario: 'clearAndReopenQf() releases a claimed-but-open QF and distinguishes guard_refused / no_match_status / reason_lookup_failed', expected_result: 'Per FR-3 acceptance criteria' },
  { id: 'TS-4', scenario: 'END-TO-END: the exact stale-session-sweep.cjs holderRows query (not a hand-built fixture) against the e60956f5 specimen, feeding isSessionAlive(), feeding the QF-release loop', expected_result: 'The holder reads dead and both an in_progress and a claimed-open QF held by it are released -- this is the acceptance test that PART B (producer SELECT parity) actually exists to make pass' },
  { id: 'TS-5', scenario: "liveness-input-parity.test.js updated for the new 'status' LIVENESS_INPUT_FIELDS group", expected_result: "Existing assertions at :92 (toHaveLength(3)->4) and :108 (toEqual(['is_alive'])->['is_alive','status']) updated and passing; all 4 identified caller files pass the parity check" },
  { id: 'TS-6', scenario: "The corrected scheduled check's query, run against a snapshot BEFORE the backfill", expected_result: 'Reports ~2,104 (the real, currently-measured violation count under the corrected predicate)' },
  { id: 'TS-7', scenario: "The corrected scheduled check's query, run against a snapshot AFTER the backfill and after FR-1's writers are live", expected_result: 'Reports zero' },
  { id: 'TS-8', scenario: 'Regression: the existing false-negative fixture from SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001', expected_result: 'Still reads alive:true via its original rung -- FR-2 Part A must not regress this existing protection' },
  { id: 'TS-9', scenario: "Backfill idempotency under the live row-count cap: run the backfill twice against a population exceeding 1000 rows", expected_result: 'First run affects the full corrected-predicate count (measured via count-delta, not data.length); second run affects zero, confirmed via the same method' },
];

const risks = [
  {
    risk: 'Shipping FR-1+FR-2(reader-only)+FR-3 without FR-2 Part B (producer SELECT parity) would merge green while the headline incident remains live, since the exact call site that caused the 8.6-hour QF-claim starvation never selects status',
    impact: 'critical', likelihood: 'medium (this was the actual PLAN-phase finding, not a hypothetical)',
    mitigation: 'FR-2 is now explicitly two parts, neither sufficient alone; TS-4 is an end-to-end acceptance test using the real query shape, not a hand-built fixture, specifically to prevent this from passing accidentally.',
  },
  {
    risk: "FR-5's backfill silently undercounts or fails idempotency if this environment's row-count cap (measured: 1000) bounds the UPDATE operation itself, not just SELECT-backs",
    impact: 'medium', likelihood: 'medium',
    mitigation: 'TR-5 requires probing the actual cap before running; FR-5 uses count-delta measurement and loops until the corrected predicate reaches zero.',
  },
  {
    risk: "Denying raw_is_alive trust for status IN ('released','stale') could introduce a false-negative if a legitimately-alive session is ever written with a terminal status by a writer this SD's census missed",
    impact: 'medium', likelihood: 'low',
    mitigation: "FR-1's chokepoint + census-completeness mechanism catch any future writer that bypasses is_alive:false; TS-8 re-runs the existing false-negative regression fixture.",
  },
  {
    risk: 'clearAndReopenQf()\'s widened status match could release a QF whose claim is genuinely fresh if the upstream liveness check has a bug',
    impact: 'low', likelihood: 'low',
    mitigation: 'The liveness.alive gate and the CAS expectedHolder predicate are both unchanged by this fix; only the status filter widens.',
  },
  {
    risk: "TR-2's original wording ('the one-directional contract is unchanged') was itself factually wrong and could mislead an implementer into skipping the coordination-inbox.cjs:984-990 dispatch-safety review",
    impact: 'medium', likelihood: 'low (now corrected)',
    mitigation: 'TR-2 corrected to state the narrowing explicitly; FR-2 acceptance criteria requires the dispatch-safety comment/contract at that call site be reviewed.',
  },
];

const implementation_approach = {
  summary: 'Three sequential PRs, ordered so the headline incident is closed in the FIRST PR rather than the last: (1) FR-2 (both parts) + FR-3 + the producer-select fixes deliver the actual fix; (2) FR-1s remaining writers via the shared chokepoint; (3) FR-4s scheduled check + FR-5s backfill close the loop.',
  steps: [
    'PR 1 (headline fix): lib/fleet/session-liveness.cjs FR-2 Part A (deny raw_is_alive for released/stale) + Part B (add status to LIVENESS_INPUT_FIELDS, update the 4 identified caller SELECTs, update liveness-input-parity.test.js), plus lib/fleet/best-effort-release.mjs FR-3 (widened status filter + reason-lookup failure mode). Include TS-4 (the end-to-end acceptance test using the real query shape) in this PR — it is the proof the incident is actually closed.',
    'PR 2: introduce the shared terminalSessionUpdate() chokepoint and route all ~24 census writers (the shared primitive first for highest fan-in, then the ~10 stale-session-sweep.cjs writers, then the remaining standalone scripts) through it, plus the new migration for the 4 in-scope RPC bodies.',
    'PR 3: FR-4s corrected scheduled exit-predicate check (extracted as a testable function per the false-completion-census.mjs precedent, scoped to this NEW small script only — not the 4,700-line sweep daemon) and FR-5s backfill script (count-delta measurement, looped for the row-count cap).',
    'Run FR-5s backfill against production after PR 2+3 merge and record the real affected-row count.',
    'Run FR-4s scheduled check post-backfill and confirm zero.',
  ],
};

async function main() {
  const { error } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, technical_requirements, test_scenarios, risks, implementation_approach })
    .eq('id', PRD_ID);
  if (error) throw new Error(error.message);
  console.log('PRD corrected:', PRD_ID);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
