#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 — TESTING at the PLAN-TO-EXEC gate.
 *
 * Baseline review + testability assessment of the planned FR-2/FR-3/FR-4 changes,
 * per PRD-7d23f04f-d468-41a2-be35-388def3a6025 (status=approved).
 *
 * Everything below was MEASURED in this worktree, not inherited:
 *   - baseline suite RUN (50/50, 231ms, vitest 4.1.4)
 *   - lib/coordinator/quiet-tick.cjs read in full (246 lines)
 *   - scripts/coordinator-quiet-tick.mjs export surface enumerated (main() is UNEXPORTED)
 *   - band-exclusivity claim FALSIFIED by executing decideCadence over a 1000-offset sweep
 *   - the FR-4 golden hash COMPUTED from the pre-change code (so EXEC cannot self-reference it)
 *   - FR-1's 120s derivation re-proven by EXECUTING discoverStandardLoops(), at the PLAN gate
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'T-1',
      severity: 'HIGH',
      issue:
        'FR-3 (the call-site wiring) has NO test seam and NO acceptance criterion that any automated test can satisfy — this is the exact defect class that already fired once on the parent SD',
      evidence:
        "scripts/coordinator-quiet-tick.mjs declares `async function main()` at :379 with NO export keyword, while every other unit under test in that file IS exported (COMPOSED_CORES :91, buildCores :162, readSalientState :187, surfaceStaleRatifications :264, hasUnactionedDirective :320, hasOutstandingChairmanDirective :346, selfHealCoordinatorFlag :365). The decideCadence() call site is INSIDE main() (:478-483). FR-3's four acceptance criteria are all statements about code that lives in that unexported function; none is observable from vitest. FR-4's five acceptance criteria cover only the decideCadence branch and the existing fixtures — the word 'wiring' appears in FR-4's description but no FR-4 criterion asserts it. The ONLY listed proof of FR-3 is FR-5/TS-6, a human-pasted post-merge live stamp. PRECEDENT, not speculation: parent SD -001 FR-7 AC-3 stated 'coordinator-quiet-tick.mjs main() calls computeLoadedAndQuiet() immediately before decideCadence()', -001 shipped COMPLETED, and the function has had ZERO callers ever since (confirmed again this pass: coordinator-quiet-tick.mjs:38 imports only { decideCadence, detectSalientDelta, runCoresFailSoft }). 50/50 tests pass with the wiring absent. Shipping FR-3 under the same coverage shape reproduces the same green-with-defect state.",
      location: 'scripts/coordinator-quiet-tick.mjs:379 (unexported main) / :478 (decideCadence call site) / PRD FR-3 + FR-4 acceptance criteria',
      recommendation:
        "EXEC MUST add wiring coverage, and the repo already contains BOTH precedents. (a) BEHAVIOURAL, preferred: extract the new logic into a small EXPORTED helper in coordinator-quiet-tick.mjs, e.g. `export async function resolveLoadedAndQuiet(sb, { unactionedDirective, undeliveredEscalation })` that calls gatherCapacityInputs() then computeLoadedAndQuiet(), and unit-test it with a stubbed client exactly as tests/unit/coordinator/coordinator-quiet-tick-directive-wake.test.js already stubs hasUnactionedDirective (buildSupabaseStub pattern, :20-32). main() then holds one call, not a block of logic. (b) STATIC PIN, additionally: tests/static-guards/lane-drain-wiring-pinned.test.js is a purpose-built precedent whose own docstring names this defect class ('a test suite that proves a function correct while its caller can drop it certifies a component, not a behaviour') and explains why static pinning is the available tool 'because the call sites live in long-running CLI scripts whose entrypoints are unexported and which reach the network on import' — a verbatim description of this file. Pin: computeLoadedAndQuiet is imported; gatherCapacityInputs is called; and `loadedAndQuiet` appears as a key in the decideCadence({...}) argument. Use that file's `code()` comment-stripping helper so a guard is never satisfied by a docstring describing the thing it requires. Do BOTH: (a) proves behaviour, (b) proves the wire, and neither substitutes for the other.",
    },
    {
      id: 'T-2',
      severity: 'HIGH',
      issue:
        'The [540,660] band is NOT exclusive to the new branch — an EXEC-written "only loaded-and-quiet ever returns 540-660" test would be FALSE and would fail, or worse, would be weakened into vacuity to make it pass',
      evidence:
        "Measured by executing the CURRENT (unmodified) decideCadence across partyOffsetS 0..1000. The quiescent branch already returns values inside [540,660] in 304 sampled cases (e.g. {partyOffsetS:0, desiredQuiescentParkS:600} -> 600; {0,660} -> 660; {1,600} -> 601), because the quiescent range is [271,900] and fully CONTAINS the new band. The active branch with desiredActiveS supplied returns inside [540,660] in 2002 sampled cases (e.g. {partyOffsetS:0, desiredActiveS:600} -> 555). ONLY the DEFAULT active band (desiredActiveS omitted) is clean: 0 hits. So band separation holds against the default ACTIVE band ONLY.",
      location: 'lib/coordinator/quiet-tick.cjs:76-94 (quiescent + desiredActiveS arms) vs PRD FR-4 AC-5',
      recommendation:
        "FR-4 AC-5 is already worded correctly — 'explicitly asserts band separation (band min 540 > ACTIVE_MAX_S 270)'. EXEC must implement EXACTLY that comparison (540 > ACTIVE_MAX_S, a constants-level assertion) and must NOT strengthen it into an exclusivity/uniqueness sweep over decideCadence outputs. Recording this so a reasonable-looking strengthening is not attempted, discovered to fail, and then 'fixed' by narrowing the sweep until it proves nothing.",
    },
    {
      id: 'T-3',
      severity: 'MEDIUM',
      issue:
        "FR-4 AC-4's golden-baseline hash is self-referential unless the expected digest is captured BEFORE the code change — a matrix hashed at test time against itself passes under any regression",
      evidence:
        "FR-4 AC-4 reads 'a fixed matrix of decideCadence(s) inputs is hashed before and after the change; the hash is unchanged when loadedAndQuiet is omitted'. If EXEC computes the matrix inside the test and compares it to a value derived from the same post-change module, the assertion is a tautology. To remove that possibility I computed the baseline NOW, against the unmodified lib/coordinator/quiet-tick.cjs at this worktree's HEAD: a 2200-cell matrix over quiescent[true,false] x partyOffsetS[0,1,15,45,60,90,180,270,420,600,999] x desiredQuiescentParkS[undefined,120,300,600,900] x desiredActiveS[undefined,0,255,300,900] x hasUnactionedDirective[false,true] x hasUndeliveredChairmanEscalation[false,true], joined with ',' and sha256'd, yields adf594d5971a40e4d3702d4eb5500d6b34ac81f10ad968853144dd1cb00ba81a. loadedAndQuiet is absent from every cell.",
      location: 'PRD FR-4 AC-4 / tests/unit/coordinator/quiet-tick.test.js (new fixture)',
      recommendation:
        "EXEC pins the digest above as a HARDCODED string literal in the test, reconstructs the same matrix in the same order, and asserts equality. The exact matrix definition and digest are in this row's metadata.golden_baseline so EXEC does not have to re-derive (and cannot accidentally re-derive from post-change code). If the digest legitimately must change, that is a deliberate contract change requiring its own justification — which is the entire point of pinning it.",
    },
    {
      id: 'T-4',
      severity: 'MEDIUM',
      issue:
        "FR-1 has no automated test at all — TS-5 is a manual re-seed-and-paste ritual, so nothing prevents a future STANDARD_LOOPS edit from silently re-breaking it, and the gap is STILL LIVE at the PLAN gate",
      evidence:
        "Re-measured at this gate (not inherited from the LEAD pass): executing discoverStandardLoops(cwd) from lib/periodic-liveness/enumerate-processes.mjs returns standard_loop:inbox with cron '*/2 * * * *' and expected_interval_seconds=120. 120 x grace_multiplier(3) = 360s, which is BELOW the 660s band max — the false-OVERDUE condition FR-1 exists to prevent, still armed. The DB row's 900s value remains a masking DB-only edit. TS-5 is typed test_type='integration' but its 'then' clause is a human reading a read-back after manually re-running the seeder; nothing in CI observes it.",
      location: 'scripts/coordinator-startup-check.mjs:161 (cron) / lib/periodic-liveness/enumerate-processes.mjs / PRD TS-5',
      recommendation:
        "Add a cheap CI-enforced invariant alongside the manual TS-5 ritual: a unit test that calls discoverStandardLoops() (or cronToIntervalSeconds on the STANDARD_LOOPS entry) for standard_loop:inbox and asserts expected_interval_seconds * 3 >= 660 — i.e. the derivation itself, which is the thing that clobbers the DB. tests/unit/periodic-liveness/fr3-instrumentation-wiring.test.js is an existing home for periodic-liveness derivation tests. This is the only proposed check that would catch a re-break; every other FR-1 proof is a one-time human paste. Not blocking PLAN-TO-EXEC, but it converts FR-1 from a ceremony into an invariant and should be added in the same PR.",
    },
    {
      id: 'T-5',
      severity: 'LOW',
      issue:
        'The FR-4 AC-5 "never-300" extension over the loaded-and-quiet arm is near-vacuous by construction and should not be mistaken for the real guard',
      evidence:
        "The existing sweep (tests/unit/coordinator/quiet-tick.test.js:97-107) iterates quiescent[true,false] x offset 0..1000 step 7 x desiredQuiescentParkS[120,300,301,600,900] — it does NOT iterate loadedAndQuiet, so it does need extending. But the new band's floor is 540 and its ceiling 660, so 300 is unreachable in that arm no matter what the implementation does; the extended assertion can never fail and therefore can never detect a defect. FR-2's own requirement text already concedes this ('structurally impossible here since 540 > 300') while still asking for the guard to be kept for defense-in-depth, which is the correct call.",
      location: 'tests/unit/coordinator/quiet-tick.test.js:97-107 / PRD FR-4 AC-5',
      recommendation:
        "Add the sweep extension (cheap, and it keeps the invariant honest if the band constants are ever retuned downward), but do not let it stand as the arm's real coverage. The load-bearing assertions for the new arm are: in-band for every offset (TS-1), the 540 floor holds for offset=0 and for absurd offsets, branch precedence (TS-4 and FR-2 AC-3), and the omitted-input byte-identity (TS-3 + T-3's hash). Also keep the literal `if (delay === PROMPT_CACHE_TTL_S)` guard line in place per FR-2 — if EXEC removes it as dead code, add a static pin, because its removal is invisible to every behavioural test.",
    },
    {
      id: 'T-6',
      severity: 'LOW',
      issue: 'Branch-precedence ordering is safe in the widening direction, but only one of the two orderings is actually risk-bearing and the tests should say which',
      evidence:
        "FR-2 fixes precedence as hard-wake > quiescent > loaded-and-quiet > active. Measured band arithmetic: hard-wake [15,45] < ACTIVE [180,270] < new band [540,660] < quiescent cap 900. If loadedAndQuiet were mis-ordered ABOVE quiescent, a quiescent+loadedAndQuiet tick would park 660 instead of ~900 — SHORTER, so a token-burn regression, never a responsiveness regression. If it were mis-ordered ABOVE hard-wake, a pending directive would wait up to 660s instead of 45s — that is the genuinely dangerous inversion, and it is the one the accepted risk (session_coordination 2dd84a5a, coordinator-seat exposure up to 660s) is scoped to NOT include.",
      location: 'lib/coordinator/quiet-tick.cjs:65-98 / PRD FR-2 AC-2, AC-3 / TS-4',
      recommendation:
        "Both precedence tests are already specified (TS-4 for hard-wake, FR-2 AC-3 for quiescent) — keep both, but have TS-4 assert across a RANGE of partyOffsetS (the existing hard-wake tests use [0,50,420]) rather than a single fixture, and assert the result is <= DIRECTIVE_WAKE_MAX_S rather than merely 'not in [540,660]'. A not-in-band assertion passes if the implementation returns some third wrong value.",
    },
    {
      id: 'T-7',
      severity: 'LOW',
      issue: "scripts/adam-quiet-tick.mjs is a second decideCadence caller whose out-of-scope status rests entirely on FR-2 AC-4 holding",
      evidence:
        "Two production callers of decideCadence exist: scripts/coordinator-quiet-tick.mjs and scripts/adam-quiet-tick.mjs. FR-3 wires only the coordinator. Adam's seat is unaffected ONLY because loadedAndQuiet will be omitted from its call — which is precisely what FR-2 AC-4 and the T-3 golden hash guarantee. This was raised at the LEAD gate (VALIDATION c9d87f02, VAL-6) as a documentation gap; from a testing standpoint it upgrades the priority of the byte-identity fixture from 'nice regression hygiene' to 'the only thing protecting a second production seat'.",
      location: 'scripts/adam-quiet-tick.mjs / PRD FR-2 AC-4',
      recommendation:
        "State in the FR-2 AC-4 test's name or docstring that Adam's seat depends on it (e.g. 'omitted loadedAndQuiet is byte-identical — adam-quiet-tick.mjs relies on this'). Costs one comment; tells the next person deleting a 'redundant' regression test what they would be unprotecting.",
    },
  ],
  recommendations: [
    'PROCEED to PLAN-TO-EXEC. The baseline is green and measured (50/50), decideCadence\'s pure-function contract is fully preserved by the planned change so FR-2/FR-4 fixtures are straightforward, and the PRD\'s TS-1..TS-6 already describe most of the required coverage correctly. The conditions below are EXEC obligations, not PLAN defects.',
    'BASELINE MEASURED, NOT ASSUMED: npx vitest run tests/unit/coordinator/quiet-tick.test.js => 50 passed / 50, 1 file, 231ms, vitest v4.1.4, run in this worktree at HEAD. This matches the count recorded at the LEAD gate (c9d87f02), so no drift occurred during PLAN. FR-2 AC-4 and TS-3 therefore have a real, currently-green baseline to be measured against.',
    'TESTABILITY OF FR-2: EXCELLENT. decideCadence stays pure (no IO) and the new input is one more boolean on the same options object. The desiredActiveS suite (tests/unit/coordinator/quiet-tick.test.js:116-172) is a seven-test template that maps almost 1:1 onto what the new branch needs: omitted-is-byte-identical, resolves-in-band, hard-wake-unaffected, quiescent-unaffected, never-300, floored-at-the-band-minimum. FR-4\'s description already names this precedent. EXEC should copy its shape, substituting the 540 floor for the 180 floor.',
    'TESTABILITY OF FR-3: POOR, AND THIS IS THE PASS\'S PRIMARY FINDING (T-1). main() is unexported; there is no behavioural seam; and the parent SD already shipped this exact FR-shape with an acceptance criterion that read as satisfied while the call count was zero. Remedy is available in-repo (an exported helper + the buildSupabaseStub pattern, plus the static-guard precedent) and is specified in T-1. This is the single condition most likely to decide whether -002 actually delivers.',
    'TEST CASES EXEC MUST ADD (consolidated, mapped to the PRD): (1) TS-1 in-band sweep — loadedAndQuiet:true over offsets [0,1,50,270,420,999] returns [540,660] and never 300. (2) TS-1b floor — offset 0 returns exactly 540; an absurd offset never breaches 660. (3) TS-4 precedence — loadedAndQuiet:true + hasUnactionedDirective:true returns <= DIRECTIVE_WAKE_MAX_S across offsets [0,50,420]; same for hasUndeliveredChairmanEscalation. (4) FR-2 AC-3 precedence — loadedAndQuiet:true + quiescent:true equals the value with loadedAndQuiet omitted. (5) TS-3/FR-2 AC-4 byte-identity — omitted vs undefined vs false all equal the current output across offsets, plus the pinned golden hash from T-3. (6) FR-4 AC-1 regression — the SD\'s explicit ask: computeLoadedAndQuiet({...clear, openQfCount:1}) is false, and feeding that false into decideCadence yields the ACTIVE band [180,270]. (7) FR-4 AC-2 — same with idleNow:1. (8) FR-4 AC-5 — band-separation constant assertion (540 > ACTIVE_MAX_S) plus the never-300 sweep extended over the loadedAndQuiet arm. (9) T-1 wiring coverage — exported-helper unit test AND/OR static wiring pin. (10) T-4 — FR-1 derivation invariant (expected_interval_seconds * 3 >= 660).',
    'DO NOT WRITE a band-exclusivity test (T-2). Measured: the quiescent arm already produces values inside [540,660] in 304 sampled cases and the desiredActiveS arm in 2002. Only the DEFAULT active band is clean. FR-4 AC-5\'s narrower wording is the correct assertion and should be implemented literally.',
    'PIN THE GOLDEN HASH FROM A PRE-CHANGE SOURCE (T-3). I computed adf594d5971a40e4d3702d4eb5500d6b34ac81f10ad968853144dd1cb00ba81a over a 2200-cell matrix against the unmodified module at this HEAD; the full matrix spec is in metadata.golden_baseline. EXEC pins that literal rather than deriving a baseline from post-change code, which would make the assertion a tautology.',
    'FR-1 IS STILL LIVE AT THE PLAN GATE, RE-MEASURED NOT INHERITED (T-4): discoverStandardLoops() still derives 120s for standard_loop:inbox from the unedited cron at scripts/coordinator-startup-check.mjs:161, giving a 360s effective threshold against a 660s band max. The FR-1 ordering constraint (land before or with FR-2/FR-3) therefore remains in force, and TS-5 remains a manual ritual unless the derivation invariant in T-4 is added.',
    'NO E2E/PLAYWRIGHT APPLICABILITY. This SD touches a pure CJS decision function, a Node CLI tick script, and a process-registry seed derivation. There is no UI surface, no route, and no user-facing component, so the E2E/user-story coverage requirement does not apply (sd-classification: infrastructure). FR-5/TS-6 is a live-system observation on a CLI, correctly typed e2e in intent but discharged by pasted stamps, not by Playwright. Recording the classification explicitly rather than silently skipping E2E.',
    'Net: CONDITIONAL_PASS at 92% confidence. No critical issues; the planned change is testable and the baseline is sound. Conditions on EXEC: discharge T-1 (wiring coverage — the recurrence risk), T-2 (do not over-strengthen band separation), and T-3 (pin the pre-change hash). T-4 is strongly recommended in the same PR. T-5/T-6/T-7 are precision improvements.',
  ],
  detailed_analysis: [
    'TESTING at the PLAN-TO-EXEC gate for SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002, against PRD-7d23f04f-d468-41a2-be35-388def3a6025 (status=approved, FR-1..FR-5, TS-1..TS-6).',
    '',
    'MANDATE. Three questions: (1) what is the current test baseline; (2) are the planned FR-2/FR-3/FR-4 changes testable — is decideCadence\'s pure-function contract preserved, is there a seam for the coordinator-quiet-tick.mjs wiring, what are the coverage gaps and risks; (3) what test cases must EXEC add. Answers: baseline is 50/50 green; FR-2 is highly testable and FR-3 is NOT (the primary finding); ten test cases are enumerated in the recommendations.',
    '',
    'METHOD AND INSTRUMENT DIVERSITY. The baseline suite was RUN, not inspected. lib/coordinator/quiet-tick.cjs was read in full (246 lines) rather than grepped. The export surface of scripts/coordinator-quiet-tick.mjs was enumerated to establish whether a behavioural seam exists, rather than assumed from the PRD. The band-exclusivity property was FALSIFIED by executing decideCadence across a 1000-value offset sweep rather than reasoned about from the constants. The FR-4 golden hash was COMPUTED against the pre-change module so that EXEC has a baseline it cannot self-referentially reproduce. FR-1\'s 120s derivation was re-proven by EXECUTING discoverStandardLoops() at THIS gate rather than inherited from the LEAD-gate evidence — an inherited measurement of a live-reverting value is not a measurement.',
    '',
    'BASELINE. npx vitest run tests/unit/coordinator/quiet-tick.test.js: 50 passed of 50, one file, 231ms, vitest v4.1.4. The file is 376 lines across eight describe blocks: computeLoadedAndQuiet (9 tests, :32-72), decideCadence core FR-5/FR-6 (5, :74-114), decideCadence desiredActiveS (7, :116-172), hasUnactionedDirective hard-wake (6, :174-216), hasUndeliveredChairmanEscalation (6, :218-263), detectSalientDelta (5, :265-289), runCoresFailSoft (3, :291-324), computeStateHash/shouldSkipHeavyPass (8, :326-375). The count is unchanged from the LEAD gate, so nothing drifted during PLAN.',
    '',
    'FR-2 TESTABILITY: EXCELLENT — THE CONTRACT IS FULLY PRESERVED. decideCadence(s) remains a pure function of one options object with no IO; adding loadedAndQuiet is one more optional boolean on the same object, exactly as hasUnactionedDirective, hasUndeliveredChairmanEscalation and desiredActiveS were added before it. Fixtures are therefore trivial object literals with no mocking, no clock control and no DB. The desiredActiveS describe block is a direct, seven-test template that FR-4 already names as the precedent to mirror, and its shape maps onto the new branch almost line for line — the only substitution is the band floor (540 rather than 180) and the band source (a fixed constant rather than a caller-supplied ceiling). The four existing bands are arithmetically disjoint in the order that matters: hard-wake [15,45] < ACTIVE [180,270] < new [540,660] < quiescent cap 900, so the new branch cannot collide with the default ACTIVE band and cannot breach the 900s responsiveness cap.',
    '',
    'FR-3 TESTABILITY: POOR — THE PRIMARY FINDING (T-1). scripts/coordinator-quiet-tick.mjs is 544 lines. It exports COMPOSED_CORES (:91), buildCores (:162), readSalientState (:187), surfaceStaleRatifications (:264), hasUnactionedDirective (:320), hasOutstandingChairmanDirective (:346) and selfHealCoordinatorFlag (:365) — every one of which has unit coverage. It does NOT export main(), declared plainly at :379, and the decideCadence call sits inside it at :478-483. FR-3 asks EXEC to insert gatherCapacityInputs() plus computeLoadedAndQuiet() immediately before that call. Every one of FR-3\'s four acceptance criteria is a statement about code inside that unexported function, and not one of them is observable from vitest. FR-4, which is the test FR, has five criteria of which none asserts the wiring.',
    '',
    'WHY T-1 IS NOT HYPOTHETICAL. The parent SD -001 shipped FR-7 with acceptance criterion AC-3 reading "coordinator-quiet-tick.mjs main() calls computeLoadedAndQuiet() immediately before decideCadence()". -001 reached COMPLETED. The function has never had a caller: coordinator-quiet-tick.mjs:38 imports { decideCadence, detectSalientDelta, runCoresFailSoft } and nothing else, and the whole 50-test suite passes with the wiring absent. The LEAD-gate VALIDATION pass (c9d87f02, VAL-5) recorded the same. So the failure mode is not a risk to be weighed — it is a measured, once-realised outcome of shipping exactly this FR shape with exactly this coverage shape. If -002 repeats it, the SD ships a correct, well-tested branch that nothing ever calls, and the only instrument that would notice is a human remembering to paste a live stamp.',
    '',
    'THE REMEDY IS ALREADY IN THE REPO, TWICE. tests/unit/coordinator/coordinator-quiet-tick-directive-wake.test.js shows the behavioural route: hasUnactionedDirective is exported and driven with a hand-built Supabase stub (buildSupabaseStub, :20-32) that also asserts the exact query filters. An exported resolveLoadedAndQuiet() helper would be testable the same way and would leave main() holding a single call rather than a block of untestable logic. tests/static-guards/lane-drain-wiring-pinned.test.js shows the static route, and its docstring is unusually apposite: it was written after an auditor proved three well-tested pure functions could each be unwired with all 2199 tests still passing, and it explains that static pinning is what is available "because the call sites live in long-running CLI scripts whose entrypoints are unexported and which reach the network on import" — a literal description of coordinator-quiet-tick.mjs. It also supplies a comment-stripping helper so a guard cannot be satisfied by a docstring describing the thing it requires, which matters here because quiet-tick.cjs:188-205 already contains a long docstring mentioning both the predicate and the call site. Both routes should be taken; the static pin is the only one that can see ORDERING, and ordering is load-bearing for FR-3 because the whole point of the placement is ARM-time freshness.',
    '',
    'FALSIFIED CLAIM — BAND EXCLUSIVITY (T-2). It is tempting to assert that only the loaded-and-quiet branch ever returns a value in [540,660], and a test author working from FR-4 AC-5\'s phrase "band separation" could easily write that. It is false, and I proved it by execution rather than inference: sweeping the CURRENT unmodified decideCadence over partyOffsetS 0..1000, the quiescent arm lands inside [540,660] in 304 sampled cases (desiredQuiescentParkS 600 or 660 does it directly), because the quiescent range [271,900] strictly CONTAINS the new band; and the active arm with desiredActiveS supplied lands inside it in 2002 cases. Only the default ACTIVE band (desiredActiveS omitted) is clean, at zero hits. FR-4 AC-5 is worded correctly and narrowly — "band min 540 > ACTIVE_MAX_S 270" — and must be implemented as literally that constants-level comparison. The risk being flagged is the second-order one: an author writes the stronger test, watches it fail, and then weakens it until it passes, arriving at a check that asserts nothing.',
    '',
    'GOLDEN BASELINE (T-3). FR-4 AC-4 asks for a hashed matrix "before and after the change". The failure mode is self-reference: a matrix computed inside the test from the post-change module and compared against a value derived the same way passes under any regression whatsoever. I removed the opportunity by computing the digest now, against the unmodified module: 2200 cells over quiescent[true,false] x partyOffsetS[0,1,15,45,60,90,180,270,420,600,999] x desiredQuiescentParkS[undefined,120,300,600,900] x desiredActiveS[undefined,0,255,300,900] x hasUnactionedDirective[false,true] x hasUndeliveredChairmanEscalation[false,true], iterated in that nesting order, joined with "," and sha256-hexed: adf594d5971a40e4d3702d4eb5500d6b34ac81f10ad968853144dd1cb00ba81a. loadedAndQuiet appears in no cell. EXEC pins that literal. The matrix deliberately includes the hard-wake and quiescent arms, so the hash also protects FR-2 AC-2 and AC-3 against silent drift, not just the active arm.',
    '',
    'FR-1 COVERAGE (T-4). Re-measured at this gate rather than inherited, because the value in question is one that actively reverts: executing discoverStandardLoops(cwd) returns standard_loop:inbox with cron "*/2 * * * *" and expected_interval_seconds=120, so the effective overdue threshold is 120x3 = 360s against a 660s band max — the false-OVERDUE condition FR-1 exists to prevent, still armed at the PLAN gate. The DB row\'s 900 is still a mask. TS-5 is typed integration but is discharged by a human re-running a seeder and pasting a read-back; nothing in CI observes it, so nothing stops the next STANDARD_LOOPS edit from silently re-breaking it. A unit test over the DERIVATION (assert expected_interval_seconds x 3 >= 660 for standard_loop:inbox) is cheap, catches exactly the clobber path, and is the only proposed check with any recurrence protection at all.',
    '',
    'E2E APPLICABILITY: NOT APPLICABLE, RECORDED EXPLICITLY. The change surface is a pure CJS decision function, a Node CLI tick script, and a cron-string derivation feeding a process registry. There is no UI, route, component or user story, so the 100%-user-story-E2E requirement does not attach (infrastructure classification). FR-5/TS-6 is a live-system observation of CLI stdout, discharged by two pasted timestamped stamps, and is correctly the responsibility of the PR author post-merge rather than of Playwright. Stating the classification rather than silently omitting E2E, since a silent omission is indistinguishable from an oversight.',
    '',
    'CONDITIONS ON THIS PASS. (1) EXEC adds wiring coverage for FR-3 — exported helper plus static pin (T-1). (2) EXEC implements band separation as the literal 540 > ACTIVE_MAX_S comparison and writes no exclusivity sweep (T-2). (3) EXEC pins the pre-change golden digest supplied here rather than deriving one post-change (T-3). (4) Strongly recommended in the same PR: the FR-1 derivation invariant (T-4). None of the four blocks the PLAN-TO-EXEC transition; all four are verifiable at EXEC-TO-PLAN.',
  ].join('\n'),
  metadata: {
    gate: 'GATE_SUBAGENT_EVIDENCE',
    handoff: 'PLAN-TO-EXEC',
    sd_uuid: '7d23f04f-d468-41a2-be35-388def3a6025',
    prd_id: 'PRD-7d23f04f-d468-41a2-be35-388def3a6025',
    prd_status: 'approved',
    frs_assessed: ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5'],
    test_scenarios_assessed: ['TS-1', 'TS-2', 'TS-3', 'TS-4', 'TS-5', 'TS-6'],
    baseline: {
      suite: 'tests/unit/coordinator/quiet-tick.test.js',
      command: 'npx vitest run tests/unit/coordinator/quiet-tick.test.js',
      passed: 50,
      failed: 0,
      files: 1,
      duration_ms: 231,
      runner: 'vitest v4.1.4',
      test_file_loc: 376,
      describe_blocks: 8,
      measured_at_gate: 'PLAN-TO-EXEC',
      matches_lead_gate_baseline: true,
    },
    golden_baseline: {
      purpose: 'FR-4 AC-4 — pre-change digest so the byte-identity assertion cannot be self-referential (finding T-3)',
      computed_against: 'lib/coordinator/quiet-tick.cjs at worktree HEAD, UNMODIFIED (loadedAndQuiet not yet implemented)',
      sha256: 'adf594d5971a40e4d3702d4eb5500d6b34ac81f10ad968853144dd1cb00ba81a',
      cells: 2200,
      join_separator: ',',
      digest_algorithm: 'sha256 hex over the joined delay values',
      iteration_order: [
        'quiescent: [true, false]',
        'partyOffsetS: [0, 1, 15, 45, 60, 90, 180, 270, 420, 600, 999]',
        'desiredQuiescentParkS: [undefined, 120, 300, 600, 900]',
        'desiredActiveS: [undefined, 0, 255, 300, 900]',
        'hasUnactionedDirective: [false, true]',
        'hasUndeliveredChairmanEscalation: [false, true]',
      ],
      loadedAndQuiet_present_in_matrix: false,
    },
    band_exclusivity_falsified: {
      claim_tested: 'only the loaded-and-quiet branch ever returns a delay in [540,660]',
      result: 'FALSE',
      method: 'executed the CURRENT unmodified decideCadence over partyOffsetS 0..1000',
      quiescent_arm_hits_in_band: 304,
      quiescent_sample: [{ partyOffsetS: 0, desiredQuiescentParkS: 600, delay: 600 }, { partyOffsetS: 0, desiredQuiescentParkS: 660, delay: 660 }],
      desired_active_arm_hits_in_band: 2002,
      desired_active_sample: [{ partyOffsetS: 0, desiredActiveS: 600, delay: 555 }],
      default_active_band_hits_in_band: 0,
      implication: 'band separation holds ONLY against the DEFAULT active band; implement FR-4 AC-5 as the literal 540 > ACTIVE_MAX_S comparison',
    },
    fr3_seam_analysis: {
      file: 'scripts/coordinator-quiet-tick.mjs',
      loc: 544,
      main_exported: false,
      main_declared_at: 379,
      decide_cadence_call_site: 478,
      exported_symbols: ['COMPOSED_CORES:91', 'buildCores:162', 'readSalientState:187', 'surfaceStaleRatifications:264', 'hasUnactionedDirective:320', 'hasOutstandingChairmanDirective:346', 'selfHealCoordinatorFlag:365'],
      behavioural_seam_exists: false,
      computeLoadedAndQuiet_production_callers: 0,
      parent_fr7_ac3_claimed_wired: true,
      parent_fr7_actually_wired: false,
      suite_passes_with_wiring_absent: true,
      remedy_precedents: [
        'tests/unit/coordinator/coordinator-quiet-tick-directive-wake.test.js (buildSupabaseStub, :20-32) — behavioural route via an exported helper',
        'tests/static-guards/lane-drain-wiring-pinned.test.js — static wiring pin, precedent docstring names this exact defect class',
      ],
    },
    fr1_still_live_at_plan_gate: {
      re_measured: true,
      method: 'executed discoverStandardLoops(cwd) from lib/periodic-liveness/enumerate-processes.mjs',
      derived: { process_key: 'standard_loop:inbox', cron: '*/2 * * * *', expected_interval_seconds: 120 },
      effective_threshold_s: 360,
      band_max_s: 660,
      verdict: 'FALSE-OVERDUE RISK STILL ARMED — DB row 900 remains a mask, not a fix',
      automated_coverage_exists: false,
    },
    e2e_applicability: {
      applicable: false,
      classification: 'infrastructure',
      basis: 'pure CJS decision function + Node CLI tick script + cron-string derivation; no UI surface, route, component or user story',
      fr5_ts6_discharge: 'two pasted timestamped CLI stamps post-merge, not Playwright',
    },
    exec_required_test_cases: [
      'TS-1 in-band sweep: loadedAndQuiet=true over offsets [0,1,50,270,420,999] -> [540,660], never 300',
      'TS-1b floor/ceiling: offset 0 -> exactly 540; absurd offsets never breach 660',
      'TS-4 precedence: loadedAndQuiet+hasUnactionedDirective -> <= DIRECTIVE_WAKE_MAX_S across offsets [0,50,420]; same for hasUndeliveredChairmanEscalation',
      'FR-2 AC-3 precedence: loadedAndQuiet+quiescent == value with loadedAndQuiet omitted',
      'TS-3 / FR-2 AC-4 byte-identity: omitted vs undefined vs false all equal current output; plus the pinned golden sha256',
      'FR-4 AC-1 regression: openQfCount=1 -> predicate false -> decideCadence returns ACTIVE [180,270]',
      'FR-4 AC-2 regression: idleNow=1 -> predicate false -> ACTIVE band',
      'FR-4 AC-5: band-separation constant assertion (540 > ACTIVE_MAX_S) + never-300 sweep extended over the loadedAndQuiet arm',
      'T-1 wiring coverage: exported resolveLoadedAndQuiet() unit test with a stubbed client AND a static wiring pin (import + gatherCapacityInputs + loadedAndQuiet key in the decideCadence argument, comment-stripped)',
      'T-4 FR-1 derivation invariant: discoverStandardLoops() standard_loop:inbox expected_interval_seconds * 3 >= 660',
    ],
    independent_instruments_used: [
      'vitest execution of the baseline suite (50/50) rather than inspection of the file',
      'full read of lib/coordinator/quiet-tick.cjs (246 lines) rather than targeted grep',
      'export-surface enumeration of scripts/coordinator-quiet-tick.mjs to establish seam existence empirically',
      'EXECUTION of decideCadence over a 1000-value offset sweep to FALSIFY the band-exclusivity property rather than infer it from constants',
      'sha256 golden digest COMPUTED against the pre-change module so EXEC cannot self-reference the baseline',
      'EXECUTION of discoverStandardLoops() at THIS gate to re-prove FR-1 rather than inherit the LEAD-gate measurement of a reverting value',
      'read of two in-repo wiring-test precedents (directive-wake behavioural stub, lane-drain static pin) to ground the T-1 remedy in existing practice',
      'live read of PRD-7d23f04f functional_requirements + test_scenarios + acceptance_criteria from product_requirements_v2',
    ],
    prior_evidence_reviewed: ['c9d87f02 (VALIDATION, -002 LEAD-TO-PLAN)', 'd5e8a6ac (TESTING, -001 PLAN)'],
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD,
    { name: 'QA Engineering Director', code: 'TESTING' },
    results,
    { phase: 'PLAN-TO-EXEC', sdKey: SD },
  );
  console.log(
    'STORED ID:', stored?.id,
    '| verdict:', stored?.verdict,
    '| phase:', stored?.phase,
    '| confidence:', stored?.confidence,
    '| repo_path:', stored?.metadata?.repo_path,
    '| created_at:', stored?.created_at,
  );
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
