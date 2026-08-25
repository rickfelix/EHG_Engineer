#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent RETROSPECTIVE/adversarial review of the SHIPPED diff for
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (commit 8430fe45560), gating the EXEC-TO-PLAN handoff.
 *
 * This reviews the ACTUAL implementation, not the design (the prospective PLAN-phase review is
 * evidence 136b3c0e). Every claim below was measured this session: the diff was read directly,
 * five independent mutations were run against the shipped code with the real vitest suite, the
 * backoff schedule was executed as a 500-tick loop simulation, and the live DB was queried for
 * the real attempt-count distribution and the census's true fetch behavior.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '8077da1b-7888-4a91-aba8-bfe459e61334';
const SD_KEY = 'SD-LEO-INFRA-STAGE-GATE-RETRY-001';

const critical_issues = [
  {
    id: 'fr1-backoff-is-a-self-referential-fixed-point-freezes-at-8-forever',
    severity: 'CRITICAL',
    summary: "shouldSkipForBackoff() is a pure function of attemptCount, but attemptCount is ONLY incremented by the work that the function gates -- so it is a self-referential fixed point and the backoff is a PERMANENT STALL, not a backoff. Traced concretely: on action='skip' the worker does `break` (stage-execution-worker.js, the new block before the mode-boundary check), which exits the whole _processVenture while loop. No gate is evaluated, so no eva_stage_gate_attempts row is written, so the DB-sourced count is UNCHANGED on the next ~30s tick, so the identical skip decision is re-made forever. Measured by executing the shipped function: the schedule is proceed for n=0..7, SKIP at n=8. A 500-tick loop simulation using the real exported function ends with count=8, frozen, permanently. GATE_RETRY_CEILING=20 is therefore UNREACHABLE via the loop the guard is wired into. CONSEQUENCE: FR-2 (the explicit terminal MANUAL_REQUIRED state) is DEAD BY CONSTRUCTION for every NEW runaway -- terminalizeVentureForRetryExhaustion() can only ever fire for a venture that already exceeded 20 attempts by some other means (i.e. the pre-existing ApexNiche specimen, which is already parked). FR-4's census is dead the same way: it only reports attempt_count >= ceiling, so a venture frozen at 8 is invisible to it too. Net effect of the shipped guard on a new runaway: write amplification stops (good), and the venture then sits silently un-advanced with no DB state, no terminal marker, and no census visibility -- the exact non-terminal-parking anti-pattern this SD exists to eliminate, substituting a silent stall for a loud one. A correct backoff must be keyed on something that advances while skipping (a tick counter, or wall-clock delta against the latest attempts.opened_at), never on the gated counter itself.",
  },
];

const findings = [
  {
    id: 'fr1-backoff-test-pins-a-sequence-that-cannot-occur-in-production',
    severity: 'HIGH',
    summary: "The reason the CRITICAL defect above ships green is a fact-not-behaviour test pin. All three shouldSkipForBackoff tests iterate n over the FULL range (`for (let n = GATE_RETRY_BACKOFF_START; n < GATE_RETRY_CEILING; n++)` and the evaluated(from,to) helper), i.e. they assert properties of the schedule as if every value 5..19 actually occurs at runtime. In production only n=8 is ever reached. The tests are therefore true statements about a pure function and simultaneously prove nothing about the loop the function governs. This is exactly the gap class the PLAN-phase review flagged in advance ('FR-1's backoff half could ship entirely unimplemented and every listed test scenario would still pass') -- the backoff was implemented, but the test added for it still cannot observe the production sequence. Verified by mutation M1 (see mutation_record): forcing a flat skip-everything backoff IS caught by the 'increasing gap' test, so the tests discriminate schedule shape -- they just never model the counter's coupling to their own output.",
  },
  {
    id: 'fr4-census-silently-measures-the-postgrest-1000-row-cap-not-the-population',
    severity: 'HIGH',
    summary: "findUnboundedRetryVentures() issues `.from('eva_stage_gate_attempts').select('venture_id, stage_number')` with NO .range()/.limit() pagination and then groups the result in memory. Measured live this session: that exact call returns 1000 rows with error=null, while the table truly holds 1902. The census therefore counts over a silently truncated fetch -- a capped-fetch-grouped-in-memory defect that measures the cap, not the population. Two failure modes: (a) attempt_count is understated for any venture whose rows straddle the 1000-row window, so a venture genuinely past the ceiling can be reported as under it; (b) a venture whose rows fall ENTIRELY beyond the window is invisible, and the script prints a confident 'Ventures in unbounded-retry posture: 0' and exits 0. Today's live run does print 0, which is the correct answer for the wrong reason (the only qualifying venture, ApexNiche 809ec7e7::21 with 1902 rows, is excluded by the parked filter anyway). The unit test cannot see this because the mock's select() returns the whole seeded array -- the server-side default cap has no mock analogue. Fix requires either paginated .range() looping (as this review's own measurement script used) or a grouped count query.",
  },
  {
    id: 'worker-wiring-has-zero-test-coverage-mutation-m4-survived',
    severity: 'HIGH',
    summary: "MEASURED, not inferred: I deleted the ENTIRE checkGateRetryCeiling() call block from stage-execution-worker.js's loop -- both the terminalize branch and the skip branch, leaving only the now-unused import -- and ran the full `npx vitest run tests/unit/eva/`. Result: 572 passed / 1 failed (the pre-existing DB_TIER_BLOCKED path-integrity file) / 7428 tests passed, 34 skipped -- BYTE-IDENTICAL to the unmutated baseline. The guard can be completely disconnected from production and every test still passes. `grep -rln 'checkGateRetryCeiling|gate-retry-guard|GATE_RETRY' tests/` returns only the two new module-level test files; none of the five existing worker tests were extended. THIS IS NOT AN ACCEPTABLE LIMITATION, and the '_processVenture has a huge mock surface' defence is refuted by direct measurement: FIVE tests in the SAME directory already drive the REAL _processVenture loop through the public processOneStage(ventureId) seam (stage-execution-worker.test.js, -venture-parked-override-guard, -high-consequence-mint, -fixture-venture-gate, -chairman-gate-rpc-error). The PLAN-phase review named that seam and two of those precedents explicitly and instructed EXEC to use it. It is also the decisive gap: the CRITICAL defect above is a LOOP-INTERACTION defect that module-level tests are structurally incapable of observing, and a single processOneStage test invoked twice against an unchanging fake attempt count would have caught it immediately.",
  },
  {
    id: 'attempt-count-is-lifetime-cumulative-never-scoped-to-a-visit-or-run',
    severity: 'MEDIUM',
    summary: "getGateAttemptCount() counts ALL eva_stage_gate_attempts rows for (venture_id, stage_number) with no run_id scoping, no time window, and no reset on successful stage advance -- and, as the code comment acknowledges, it combines every gate_type (entry/exit/kill). Two consequences the placement makes reachable. (1) The guard runs at the TOP of the while loop on every iteration, including iterations where currentStage has just been incremented to a stage the venture is only now entering. A venture that previously visited that stage, accumulated attempts, advanced, and later re-entered it (re-entry is a documented, deliberately-handled scenario per the two chairman-gate re-entry shortcuts in this same file) would be skipped or terminalized on arrival WITHOUT A SINGLE FRESH EVALUATION -- the count is history, not this visit. (2) Because gate types are pooled, a stage that legitimately evaluates 3 gate types per pass burns 3 attempts per pass, so the freeze-at-8 arrives after ~3 real passes and the nominal '20 retries' is really ~6-7 passes -- and the effective threshold silently varies per stage by gate count. Live blast radius TODAY is zero (measured: 151 active unparked ventures of 152, and NOT ONE has >=5 attempt rows on its current stage; the only venture/stage pair with any accumulation is the already-parked ApexNiche 809ec7e7::21). So this is latent, not an active regression -- but it is unguarded and untested.",
  },
  {
    id: 'fr3-override-idempotency-fix-is-correct-and-mutation-verified',
    severity: 'INFO',
    summary: "POSITIVE. The FR-3 short-circuit in recordGateOverride (artifact-persistence-service.js: `if (existing.gate_criteria?.override?.decision_id === override.decision_id) return existing.id;`) is correctly placed AFTER the existing-row lookup and BEFORE both the eva_stage_gate_results update and the recordGateAttempt call, so it suppresses the actual unbounded writer. It is a strict equality on the decision_id, not key-presence, so it cannot over-suppress; the paired test proves a genuinely new decision_id still falls through and is recorded with the new value. This is the fix for the real, measured production incident (ApexNiche S21, 1902 rows), and it is the one part of this SD that is unambiguously solid. Independently re-confirmed here in addition to EXEC's own mutation check.",
  },
  {
    id: 'fr4-census-positive-control-is-genuinely-discriminating-not-tautological',
    severity: 'INFO',
    summary: "POSITIVE, and a direct answer to the question asked. The FR-4 positive-control tests are NOT tautological. Three independent mutations of the census implementation were each caught: (a) loosening the ceiling filter from `count >= ceiling` to `count >= 1` -> the 'reports 0 when no venture is near the ceiling' test fails; (b) removing the parked-exclusion filter entirely (`return candidates`) -> the 'excludes a venture already terminalized' test fails. A broken query returning [] is caught by the seeded positive arm. This closes the exact 'a census that can only ever return 0 proves nothing' gap the PLAN-phase review raised. The one thing the positive control CANNOT see is the server-side fetch cap (separate HIGH finding above), because the mock has no cap.",
  },
  {
    id: 'terminalize-design-and-placement-are-sound-where-they-are-reachable',
    severity: 'INFO',
    summary: "POSITIVE. Reviewed for the interaction risks specifically asked about. terminalizeVentureForRetryExhaustion() reuses ventures.metadata.gating_decision -- the same shape the pre-existing manual park guard reads at the TOP of _processVenture, above the while loop -- so once written, the venture is caught by that earlier guard on the next tick and returns before the retry check even runs. That makes terminalization self-reinforcing and correctly ordered, not a competing second storage location. Its own alreadyTerminalForThisReason short-circuit prevents duplicate gating_decision_history entries on a re-fire, and prior non-retry gating_decisions are pushed to history rather than clobbered. Placement above the mode-boundary / governance-override / S19-S20 checks introduces no ordering hazard against those specifically (they are all cheaper-than-gate-evaluation checks that would only be reached later anyway). Also verified against the live DB: the `attempt_id` column that getGateAttemptCount()'s head-count selects genuinely exists (probe returned OK, total=1902) -- the mock could not have proven that.",
  },
  {
    id: 'mutation-and-measurement-record',
    severity: 'INFO',
    summary: "Five independent mutations beyond EXEC's single self-check, each applied to the shipped code, run against the real suite, then reverted with `git checkout --` and the tree verified clean (final state: 0 modified files under lib/ scripts/eva tests/, and the three target suites re-run green at 26/26). M1 flat skip-everything backoff -> CAUGHT (1 failure: 'produces an increasing gap'). M2 ceiling comparison `>=` -> `>` (off-by-one) -> CAUGHT ('terminalizes at or above GATE_RETRY_CEILING'). M3 terminalize branch removed, returns skip instead -> CAUGHT (same test). M4 ENTIRE worker wiring block deleted -> SURVIVED, zero test delta (see HIGH finding). M5a census ceiling filter loosened -> CAUGHT. M5b census parked filter removed -> CAUGHT. So the module-level unit tests are of genuinely good quality where they exist (5 of 6 mutations caught); the failure is one of SCOPE -- nothing tests the seam between the module and production, which is precisely where the CRITICAL defect lives.",
  },
];

const warnings = [
  "The two HIGH instrument findings share one root cause: every test in this diff drives the code through a hand-rolled mock, and both defects live exactly where the mock differs from reality. The mock's select() returns the full array (hiding PostgREST's 1000-row cap), and the mock's attempt count is supplied externally as a fixed value (hiding that in production the counter is advanced ONLY by the work the function gates). Neither is a careless test; both are tests that cannot observe their subject.",
  "Do not read the green suite as coverage of this SD's headline deliverable. 7428 passing tests are unchanged whether or not the guard is connected to the worker at all (mutation M4). The suite currently certifies gate-retry-guard.js as a library, not as a shipped behavior.",
  "The live blast radius of shipping this as-is is genuinely zero today (151 active ventures, none above 4 attempts on its current stage; the sole accumulating venture is already parked) and the FR-3 fix does stop the real incident. The block below is about FR-1/FR-2/FR-4 not doing what they claim going forward, not about a regression against current main.",
];

const recommendations = [
  "FIX THE BACKOFF'S KEY (blocking). shouldSkipForBackoff must not be keyed on the counter it gates. Key it on something that advances during a skip: either a per-(venture,stage) tick counter held by the worker, or -- preferable because it is DB-sourced and survives restarts, matching TR-3's fresh-read mandate -- the wall-clock delta between now() and MAX(opened_at) from eva_stage_gate_attempts, with the required delay growing as the count rises. Then a skipped tick still lets time advance, the count still climbs on the ticks that do evaluate, and the ceiling at 20 becomes reachable.",
  "ADD ONE processOneStage TEST FOR THE WIRING (blocking, and it is the test that would have caught the above). Follow the established pattern in tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js: construct the worker with a supabase fake, mock processStage, and call processOneStage(ventureId) TWICE with the fake's attempt count held CONSTANT at a skip-zone value. Assert the count actually advances / the venture eventually terminalizes across N ticks. A single invocation cannot distinguish a working backoff from a permanent stall.",
  "PAGINATE THE CENSUS (blocking for FR-4's usefulness). Replace the bare .select() with a .range() loop until a short page is returned (the measurement script used in this review does exactly this and correctly recovered all 1902 rows), or push the grouping into a counted query. Add a test asserting the paginator makes more than one call when the first page comes back full -- that is the only way a mock can model the cap.",
  "SCOPE THE ATTEMPT COUNT TO THE CURRENT VISIT. Count only rows since the venture last entered this stage (or since the last successful advance), rather than all history for (venture_id, stage_number). Otherwise a legitimate stage re-entry is terminalized on arrival with zero fresh evaluations. If pooling gate types is intentional, state the effective per-pass burn rate in the constant's comment so the '20' is not read as 20 retries.",
  "KEEP the FR-3 fix exactly as shipped, and keep both of its tests -- that half is correct, well-targeted, and independently mutation-verified. Nothing in this block applies to artifact-persistence-service.js.",
  "HOLD the baseline: tests/unit/eva/ = 7428 passed / 34 skipped with tests/unit/eva/path-integrity-flags-live-defaults.db.test.js failing DB_TIER_BLOCKED both before and after. That failure is environmental and must not be greened by weakening the db-tier guard.",
];

const summary = "RETROSPECTIVE (EXEC-phase) adversarial TESTING review of the SHIPPED diff at 8430fe45560, gating EXEC-TO-PLAN. Read the full diff directly and ran five independent mutations plus live DB measurement rather than trusting the commit message. VERDICT DRIVER, and it is a dead-by-construction defect rather than a style gap: FR-1's exponential backoff is keyed on the very counter it gates, making it a self-referential fixed point. On action='skip' the worker `break`s the _processVenture loop, so no gate is evaluated, so no eva_stage_gate_attempts row is written, so the DB-sourced count is identical on the next tick and the same skip is re-decided forever. Executing the shipped function proves the schedule is proceed for n=0..7 and SKIP at n=8; a 500-tick simulation ends frozen at count=8. GATE_RETRY_CEILING=20 is therefore unreachable through the loop the guard is wired into, which means FR-2's terminal MANUAL_REQUIRED state can never fire for a NEW runaway, and FR-4's census -- which only reports attempt_count >= ceiling -- cannot see the frozen venture either. The shipped guard converts a loud runaway into a silent permanent stall with no DB state and no census visibility: it stops the write amplification (real value) while substituting exactly the invisible non-terminal parking posture the SD exists to eliminate. The reason this ships green is a fact-not-behaviour pin: all three backoff tests iterate n across the full 5..19 range as though every value occurs, when only n=8 ever does. TWO further measured defects. (i) FR-4's census calls .select() with no pagination and groups in memory; live probe returns 1000 rows with error=null against a true population of 1902, so it measures the PostgREST cap, not the population, and can print a confident 'unbounded-retry: 0' while missing a venture entirely -- invisible to the unit test because the mock returns everything. (ii) The worker wiring has ZERO coverage: deleting the entire checkGateRetryCeiling call block from stage-execution-worker.js produced a byte-identical suite result (572 files passed, 7428 tests, 1 pre-existing DB_TIER_BLOCKED failure). That is NOT an acceptable limitation -- five tests in the same directory already drive the real _processVenture loop through the public processOneStage seam, and the PLAN-phase review named that seam and instructed EXEC to use it. It is also the decisive gap, since the CRITICAL defect is a loop-interaction defect module-level tests structurally cannot observe. One MEDIUM latent issue: the attempt count is lifetime-cumulative per (venture,stage), never scoped to a visit and pooled across all gate types, so a stage re-entry can be terminalized with zero fresh evaluations and the real per-pass burn is ~3x the nominal ceiling. POSITIVES, all independently verified: the FR-3 override idempotency short-circuit -- the fix for the actual measured incident -- is correct, correctly placed before both writers, cannot over-suppress, and is mutation-caught; the FR-4 positive-control tests are genuinely discriminating and NOT tautological (both census logic mutations caught); terminalization correctly reuses the gating_decision pattern the pre-loop park guard already reads, is idempotent, and preserves prior history; and the attempt_id column its head-count selects was confirmed to exist against the live DB. Mutation record: 5 of 6 mutations caught (flat backoff, ceiling off-by-one, terminalize removal, two census mutations), 1 survived (the entire worker wiring). Tree verified clean after every mutation. Live blast radius of shipping as-is is zero today -- 151 active unparked ventures, none above 4 attempts on its current stage -- so this is not a regression against main, but three of four FRs do not do what they claim going forward.";

const justification = "FAIL rather than CONDITIONAL_PASS because this is not a coverage gap around working code -- it is working code whose central mechanism cannot execute. FR-2's terminalize branch and FR-4's census are unreachable for every new runaway, which is the entire scenario the SD was opened to handle; the only venture that can currently trigger terminalization is the one that already exceeded 20 attempts before this shipped and is already parked. A CONDITIONAL_PASS would let the SD close carrying a guard that provably cannot fire, with a green 7428-test suite as the evidence, when mutation M4 shows that suite is byte-identical with the guard fully disconnected. That is the zero-yield-instrument pattern reading as wired, and it is precisely what a retrospective adversarial review exists to stop at the gate rather than discover from the next incident. Rather than a harsher escalation, because nothing here regresses current main (measured: zero active ventures in the affected range), the FR-3 half genuinely fixes the real 1902-row production incident and should be kept exactly as shipped, and all three blocking items are small, well-scoped corrections to code that already exists -- rekey the backoff onto a tick or opened_at delta, paginate one query, and add one processOneStage test using a seam and a precedent pattern that already exist in the same directory. Confidence 93 in the VERDICT (not in the code): the central finding is not inferred from reading, it was produced by executing the shipped function over 500 simulated ticks and by tracing the `break` that freezes the counter; the census cap was measured live at 1000-of-1902 with error=null; and the wiring gap was established by deleting the block and observing an unchanged suite. The residual 7 reflects one thing I did not run -- a live end-to-end poll cycle against a fixture venture to confirm no other writer advances the attempt count outside the guarded region. Static tracing says none does (all recordGateAttempt call sites in eva-orchestrator.js and the stage-17 template are reached via processStage, which sits below the guard inside the same loop), but that is a read, not an execution.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'FAIL',
    confidence_score: 93,
    critical_issues,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC',
      review_type: 'retrospective_adversarial_implementation_review',
      commit_reviewed: '8430fe45560',
      branch: 'feat/SD-LEO-INFRA-STAGE-GATE-RETRY-001',
      diff_scope: 'lib/eva/artifact-persistence-service.js (+10), lib/eva/gate-retry-guard.js (+128 NEW), lib/eva/stage-execution-worker.js (+23), scripts/eva/census-unbounded-retry.mjs (+75 NEW), 3 test files (+207) = 443 insertions, 0 deletions',
      backoff_simulation: {
        method: 'imported the SHIPPED shouldSkipForBackoff and ran the real production loop semantics: count increments ONLY when the function returns false (an attempt row is written), stays put when it returns true (worker breaks, nothing writes)',
        schedule_emitted: 'n=0..7 proceed; n=8 SKIP; n=9 proceed; n=10,11,12 SKIP; n=13 proceed; n=14..20 SKIP; n=21 proceed',
        result_after_500_ticks: 'count=8, frozenAt=8, terminalize NEVER reached',
        conclusion: 'GATE_RETRY_CEILING=20 is unreachable via the wired loop. FR-2 and FR-4 are dead by construction for any new runaway.',
      },
      mutation_record: [
        { id: 'M1', target: 'lib/eva/gate-retry-guard.js', mutation: 'flat skip-everything backoff (return true before the interval math)', outcome: 'CAUGHT', detail: "1 failed: 'produces an increasing gap between evaluated attempts as the count grows'" },
        { id: 'M2', target: 'lib/eva/gate-retry-guard.js', mutation: 'ceiling comparison >= changed to > (off-by-one)', outcome: 'CAUGHT', detail: "1 failed: 'terminalizes at or above GATE_RETRY_CEILING'" },
        { id: 'M3', target: 'lib/eva/gate-retry-guard.js', mutation: "terminalize branch removed entirely, returns {action:'skip'} instead", outcome: 'CAUGHT', detail: "1 failed: 'terminalizes at or above GATE_RETRY_CEILING'" },
        { id: 'M4', target: 'lib/eva/stage-execution-worker.js', mutation: 'ENTIRE checkGateRetryCeiling call block deleted (both branches); import left dangling', outcome: 'SURVIVED', detail: 'Test Files 1 failed | 572 passed | 6 skipped; Tests 7428 passed | 34 skipped -- byte-identical to the unmutated baseline. Zero wiring coverage.' },
        { id: 'M5a', target: 'scripts/eva/census-unbounded-retry.mjs', mutation: 'ceiling filter loosened from count >= ceiling to count >= 1', outcome: 'CAUGHT', detail: "1 failed: 'reports 0 when no venture is near the ceiling'" },
        { id: 'M5b', target: 'scripts/eva/census-unbounded-retry.mjs', mutation: 'parked-exclusion filter removed (return candidates)', outcome: 'CAUGHT', detail: "1 failed: 'excludes a venture already terminalized'" },
        { id: 'cleanup', target: 'all', mutation: 'n/a', outcome: 'VERIFIED', detail: 'git status --porcelain over lib/ scripts/eva tests/ returned empty after every revert; the three target suites re-run green at 26/26' },
      ],
      live_db_measurements: {
        attempt_id_column_probe: 'OK -- head-count on eva_stage_gate_attempts.attempt_id succeeded, total=1902 (confirms getGateAttemptCount selects a real column, which the mock could not prove)',
        census_fetch_cap: "bare .select('venture_id, stage_number') returned exactly 1000 rows with error=null against a true population of 1902 -- the census groups over a truncated fetch",
        distinct_venture_stage_pairs: 1,
        pairs_at_or_above_8_freeze_threshold: 1,
        pairs_at_or_above_20_ceiling: 1,
        only_accumulating_pair: '809ec7e7-f688-4a0c-b9f8-c8a8291cf94d::21 = 1902 attempts (ApexNiche, already parked)',
        active_unparked_ventures: '151 of 152',
        active_ventures_at_or_above_5_attempts_on_current_stage: 0,
        blast_radius_conclusion: 'Shipping as-is regresses nothing today. The defect is forward-looking: the first NEW runaway freezes silently at 8 and is invisible to both the terminal state and the census.',
      },
      wiring_coverage_assessment: {
        question: 'Does stage-execution-worker.js wiring have ANY test coverage, or only gate-retry-guard.js in isolation?',
        answer: 'ONLY the module in isolation. Zero wiring coverage, established by mutation M4 rather than by inspection.',
        grep_evidence: "grep -rln 'checkGateRetryCeiling|gate-retry-guard|GATE_RETRY' tests/ returns exactly 2 files, both new module-level tests; none of the 5 existing worker tests were extended",
        is_it_acceptable: 'NO. The huge-mock-surface defence is refuted by 5 existing tests in tests/unit/eva/ that already drive the REAL _processVenture loop via the public processOneStage(ventureId) seam: stage-execution-worker.test.js, -venture-parked-override-guard, -high-consequence-mint, -fixture-venture-gate, -chairman-gate-rpc-error. The PLAN-phase review (evidence 136b3c0e) named this seam and two of these precedents and told EXEC to use it.',
        why_decisive: 'The CRITICAL defect is a loop-interaction defect. A module-level test that supplies attemptCount externally can never observe that production only ever supplies 8. One processOneStage test invoked twice with a constant fake count would have caught it.',
      },
      placement_interaction_analysis: {
        question: 'Does the guard placement (before mode-boundary / governance / S19 / S20) risk interaction with those checks?',
        ordering_verdict: 'SAFE with respect to those specific checks -- all are cheaper-than-gate-evaluation gates that would be reached later anyway, and terminalization is caught on the NEXT tick by the pre-existing manual park guard ABOVE the while loop, which returns before the retry check even runs. Self-reinforcing and correctly ordered.',
        premature_terminalization_risk: 'REAL but latent. The guard runs at the top of EVERY loop iteration, including iterations where currentStage was just incremented into a stage being entered for the first time in this visit. Because the count is lifetime-cumulative for (venture_id, stage_number) with no run_id scoping, no time window and no reset on advance, a venture re-entering a previously-visited stage can be skipped or terminalized on arrival with zero fresh evaluations. Stage re-entry is a documented, deliberately-handled scenario in this same file (two chairman-gate re-entry shortcuts).',
        double_counting_across_gate_types: 'CONFIRMED BY DESIGN and acknowledged in the code comment: entry/exit/kill attempts pool into one per-stage count. A stage evaluating 3 gate types per pass burns 3 attempts per pass, so the effective ceiling is ~6-7 passes not 20, the freeze arrives after ~3 passes, and the effective threshold silently varies per stage by gate count.',
      },
      census_tautology_assessment: {
        question: 'Are the FR-4 positive-control tests tautological -- could a broken implementation pass by accident?',
        answer: 'NO. Genuinely discriminating.',
        evidence: 'Both independent logic mutations were caught (ceiling filter loosened -> the zero-case test fails; parked filter removed -> the exclusion test fails), and a query returning [] is caught by the seeded positive arm. This closes the PLAN-phase concern that a broken census returns 0 identically to a correct one.',
        residual_blind_spot: "The positive control cannot see the server-side 1000-row fetch cap, because the mock's select() returns the full seeded array. That is a mock-vs-reality gap, not a tautology.",
      },
      baseline: {
        command: 'npx vitest run tests/unit/eva/',
        result: 'Test Files 1 failed | 572 passed | 6 skipped (579); Tests 7428 passed | 34 skipped (7462)',
        pre_existing_failure: 'tests/unit/eva/path-integrity-flags-live-defaults.db.test.js -- DB_TIER_BLOCKED, environmental, identical to the PLAN-phase baseline; must not be greened by weakening the db-tier guard',
        note: 'This exact result was also produced under mutation M4, i.e. with the guard fully disconnected.',
      },
    },
    phase: 'EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
