#!/usr/bin/env node
/**
 * TESTING (QA Engineering Director) PLAN-TO-EXEC verdict for
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001.
 *
 * PLAN-phase TEST-STRATEGY review: EXEC has not started and no new code exists, so this is a
 * review of whether the PRD's acceptance criteria and test_scenarios are genuinely testable and
 * whether they cover the inverse hazard the PRD's own risk register names. It is NOT execution of
 * not-yet-written code.
 *
 * Method: grounded in the real PRD row (product_requirements_v2), the real source
 * (lib/coordinator/dispatch.cjs at HEAD), the two existing test files, a live caller census, and
 * TWO APPLIED MUTATIONS with the suite re-run and the source restored byte-identical.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict) +
 * canonical storage (lib/sub-agent-executor/results-storage.js storeSubAgentResults) per CLAUDE.md
 * prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SD_ID = '1985fb23-6561-4676-b80c-d8f63e9033dc';
const SD_KEY = 'SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001';

// Gate-evidence provenance: the numbers below come from a runner-written JSON report, not from
// hand-transcription. The hash pins the exact artifact this verdict was computed from.
const ARTIFACT_PATH = '.artifacts/testing/insertcoordrow-001-plan-baseline.json';
const ARTIFACT_SHA = createHash('sha256').update(readFileSync(ARTIFACT_PATH)).digest('hex');

const findings = [
  {
    id: 'T1-inverse-hazard-lives-INSIDE-the-in-scope-set-dispatch_backpressure-can-carry-landed-false',
    severity: 'CRITICAL',
    summary:
      "THE FINDING OF THIS REVIEW, and it inverts the PRD's central framing. The PRD calls these \"the two landed=true throw sites\" and FR-1 AC-3 requires isDeliveredDispatchError() to \"return true for BOTH CODES\". That is CODE-keyed, and it is wrong for DISPATCH_BACKPRESSURE. At dispatch.cjs:1322 the flag is computed, not constant: `e.landed = parkedRowId != null;`. The park insert immediately above (1304-1314) is explicitly best-effort — on parkErr it logs `BACKPRESSURE_PARK_FAILED (content may be lost)` (1308) and on a thrown insert `BACKPRESSURE_PARK_THREW (content may be lost)` (1313), leaving parkedRowId=null, landed=FALSE, and the caller's message GENUINELY LOST. Only DISPATCH_ALREADY_DELIVERED (1566) is unconditionally landed=true. This is not speculative: tests/unit/coordinator/dispatch-send-backpressure.test.js:185-213 (\"stamps landed:false (no parkedRowId) when the park insert itself fails\") asserts exactly `{code:'DISPATCH_BACKPRESSURE', landed:false, parkedRowId:null}` and PASSES today. CONSEQUENCE IF BUILT AS WRITTEN: a code-keyed predicate returns true for a failed-park backpressure, so all 11 FR-2 CLI entrypoints exit 0 and all 8 FR-3 lib/ callers report success for a message that was never written — the precise inverse hazard (silently dropped content) the PRD's own risk register anticipated ONLY for the out-of-scope codes, re-entering through the in-scope door. It is strictly worse than today's defect: today a lost message at least throws. MEASURED: mutating 1322 to `e.landed = true` (which is the effective semantics of a code-keyed predicate) leaves the suite 35/36 — caught by exactly ONE test, the very test this PRD's design would make obsolete. FIX: the predicate must key on `landed === true`, never on the code; FR-1 AC-3 and test_scenarios[0] both need rewording.",
  },
  {
    id: 'T2-negative-case-IS-in-test_scenarios-but-no-acceptance-criterion-binds-it-to-an-executable-test',
    severity: 'HIGH',
    summary:
      "Direct answer to the review question: YES, the PRD's test_scenarios DOES carry the negative case — test_scenarios[2] reads \"A caller hits any OTHER throw code ... or a fail-closed assert* guard\" expecting \"insertCoordinationRow still throws, unchanged from today\". So the scenario is not missing. What IS missing is any ACCEPTANCE CRITERION that turns it into an executable assertion, and the two ACs that gesture at it are both non-executable or non-equivalent. FR-1 AC-2 verifies the other throw paths \"by a diff review showing no other throw statement was touched\" — a human review, not a test, and reviews do not run in CI. FR-1 AC-3 asserts the PREDICATE \"returns false for every other throw code\" — which is NOT the same proposition: a predicate can correctly return false while insertCoordinationRow was nonetheless converted to RETURN for that code, and every non-branching caller would then read the returned object as success. Nothing in the PRD demands `await expect(insertCoordinationRow(...)).rejects.toMatchObject({code})` for the out-of-scope codes post-fix. GOOD NEWS, and it makes the remedy cheap: that regression net LARGELY EXISTS ALREADY and just needs to be named as the gate and run as a suite — dispatch-assignment-target-guard, dispatch-busy-target-refusal, dispatch-fleet-target-guard, disposition-lock, kill-switch-choke-guard, coordinator-dispatch-terminal-guard, coordinator-dispatch-undrainable-message-type-guard, coordinator-dispatch-adam-untyped-kind-guard and dispatch-enum-violation-loud collectively already assert rejection for most of the ~13 other codes. PLAN should add one AC: a parameterized still-throws test over the out-of-scope codes, run as a named regression suite.",
  },
  {
    id: 'T3-fr1-contradicts-itself-the-backpressure-site-IS-one-of-the-assert-guards-it-declares-out-of-scope',
    severity: 'HIGH',
    summary:
      "The two \"call sites\" are architecturally asymmetric in a way the PRD's line numbers conceal, and taken literally FR-1 is unsatisfiable. DISPATCH_ALREADY_DELIVERED (1561-1568) sits directly in insertCoordinationRow's own body — converting it to a return is a local edit. DISPATCH_BACKPRESSURE (1318-1324) does NOT: it is inside `assertSendBackpressure`, a SEPARATELY EXPORTED function (module.exports:1800, \"exported for the choke-guard fixtures\") that insertCoordinationRow merely calls at line 1669, and that has ~20 of its own direct unit tests asserting `.rejects.toMatchObject({code:'DISPATCH_BACKPRESSURE'})`. FR-1 simultaneously instructs EXEC to change the throw at \"~line 1321\" AND states that the \"~6 fail-closed assert* guards ... must continue to throw unchanged\" — and assertSendBackpressure IS one of those assert* guards. EXEC cannot honour both readings. Only one resolution preserves both constraints: leave assertSendBackpressure throwing (keeping its assert* contract and its ~20 existing tests green) and catch-and-convert at the CALL SITE inside insertCoordinationRow (line 1669). The alternative — changing assertSendBackpressure's own contract — breaks ~8-10 existing assertions and violates the repo's assert*-always-throws convention. PLAN must state which, explicitly and by line, because the PRD's \"~line 1321\" currently points EXEC at the wrong file region and the wrong function.",
  },
  {
    id: 'T4-the-16-caller-shape-claim-is-testable-and-already-partly-guarded-data-yes-error-no',
    severity: 'MEDIUM',
    summary:
      "Direct answer to the review question: there is NO hidden assumption that makes FR-1's \"16 durable callers depend on the current {data,error} shape\" untestable — the claim is testable, and roughly half of it is ALREADY guarded by tests that a future regression would trip loudly. ~25 assertions across three files read `res.data.*` off the REAL (unmocked) insertCoordinationRow: coordinator-dispatch-adam-untyped-kind-guard.test.js:80-123, coordinator-dispatch-addressee-role-precondition.test.js:115-167, coordinator-dispatch-body-correlation-both-locations.test.js:47-110 (each preceded by `const res = await insertCoordinationRow(sb, row, ...)`). Any restructure that renamed, nested or dropped `data` fails all three files immediately. THE GAP: not one test asserts the `error` key on the ordinary path of the real function. The `.error` assertions that do exist in tests/unit/coordinator (adam-reply-target-integrity, clear-coordinator-review, coordinator-relay-drain, inert-worker, detectors) are all on WRAPPER return values, not on insertCoordinationRow's own. So a change that dropped or renamed `error` while preserving `data` would ship green — and `error` is exactly what the FR-3 callers destructure (coordination-events.cjs:475/589/709/923 and sweep-findings-sink.cjs:66 all do `const { data, error } = await insertCoordinationRow(...)`). test_scenarios[3] already demands the shape be preserved \"byte-for-byte\", but no AC binds it. One added assertion on the ordinary path (e.g. an explicit key-set assertion, `expect(Object.keys(res).sort()).toEqual([...])`, which also pins that the new fields are ADDITIVE rather than replacing) closes this completely.",
  },
  {
    id: 'T5-fr2-plus-fr3-cover-19-of-26-durable-callers-and-the-11-cli-count-does-not-reconcile',
    severity: 'MEDIUM',
    summary:
      "Independent census at HEAD, excluding scripts/one-off/, *.json, *.test.*, scripts/lint/ and dispatch.cjs itself: 26 files contain an actual `insertCoordinationRow(` invocation (PRD says 25 — near enough that the LEAD inventory is broadly sound). Two arithmetic problems follow. (a) Of those 26, FIFTEEN contain `process.exit`, not the 11 FR-2 claims: lib/comms/adam-outbound/chairman-sms-gate/index.js, ack-chairman-directive.cjs, adam-adherence-staleness-check.mjs, adam-advisory.cjs, adam-quiet-tick.mjs, coordinator-capacity-forecast.mjs, coordinator-revive.cjs, cron/batch-mint-sweep.mjs, dispatch-suggestion-override.mjs, issue-chairman-directive.cjs, solomon-advisory.cjs, stale-session-sweep.cjs, three-way-comms-drill.mjs, worker-checkin.cjs, worker-signal.cjs. Some may use process.exit only on unrelated arg-validation paths, but the ~4-file delta is unreconciled and neither FR enumerates its members BY PATH, so \"all 11 CLI entrypoints\" is unverifiable at PLAN-verify and EXEC will have to guess which 11. (b) FR-2's 11 plus FR-3's 8 is 19 — leaving ~6-7 durable callers covered by NO functional requirement and NO acceptance criterion at all. Any of those that catch-and-treat-any-throw-as-failure keep this SD's defect after it ships, and nothing in the PRD would detect that. Related classification wobble: scripts/coordinator-capacity-forecast.mjs lives in scripts/ and sets process.exitCode (FR-3's own description says so) yet is assigned to FR-3's \"8 non-CLI lib/ callers\" bucket. RECOMMEND: enumerate both lists by path in the PRD before EXEC starts.",
  },
  {
    id: 'T6-fr3-underscopes-coordination-events-four-call-sites-one-named',
    severity: 'MEDIUM',
    summary:
      "FR-3's three specific claims about mis-surfacing callers were checked against source and are ACCURATE: lib/coordinator/kill-switch-writer.cjs:207 is `return insertCoordinationRow(supabase, row, {...})` with no catch anywhere in the function (PRD's \"does not even catch today\" — correct); lib/fleet/sweep-findings-sink.cjs:66 destructures {data,error} with zero landed-awareness (correct); scripts/coordinator-capacity-forecast.mjs:359 and :567 likewise (correct). A grep for landed|parkedRowId|ALREADY_DELIVERED|BACKPRESSURE across all four files returns NOTHING, confirming none of them can currently distinguish a park from a failure. THE UNDER-SCOPE: lib/coordinator/coordination-events.cjs calls insertCoordinationRow at FOUR sites — lines 475, 589, 709 and 923, each `const { data, error } = await insertCoordinationRow(supabase, row, { select: 'id', single: true })` — but FR-3 names only emitInertWorkerAlert. The other three are the same shape with the same blindness and no AC covers them. FR-3's acceptance criteria should be restated per CALL SITE, not per file, or three of the four will be missed.",
  },
  {
    id: 'T7-mutation-testing-for-fr1-ac5-is-concretely-achievable-measured-not-asserted',
    severity: 'INFO',
    summary:
      "PASS, and measured rather than assumed — direct answer to the review question on FR-1's last AC. Baseline first: the two named files are 36/36 green in 331ms, so the mutate-run-revert loop is sub-second and cheap enough to run per-call-site. MUTATION A (the DISPATCH_BACKPRESSURE site): dispatch.cjs:1322 `e.landed = parkedRowId != null;` -> `e.landed = true;`. Result 1 failed / 35 passed — CAUGHT, by dispatch-send-backpressure.test.js:212. MUTATION B (the DISPATCH_ALREADY_DELIVERED site, reverting the guard wholesale): dispatch.cjs:1561 `if (dupeId) {` -> `if (false) {`. Result 1 failed / 10 passed — CAUGHT, by dispatch-correlation-dedupe.test.js:111. Both call sites therefore already have a killing test, and AC-5's requirement (\"a mutation test that reverts one call site back to throwing is caught by at least one updated test\") is mechanically achievable with the repo's established read-file / text-replace / re-run / restore practice. TWO CAVEATS worth carrying into EXEC. First, each mutant is killed by EXACTLY ONE test — a one-assertion margin on both sites, so any test rewrite during the migration can silently remove the only killer. Second and more serious, mutation A's sole killer is the landed=false test that T1 shows a code-keyed predicate would render meaningless; if EXEC updates that test to match a code-keyed design, the mutant survives and the margin goes to zero. HYGIENE: lib/coordinator/dispatch.cjs was restored from a pristine pre-mutation copy after each run, `git status --porcelain lib/coordinator/dispatch.cjs` is empty, and the 36/36 baseline was re-verified green afterwards. No mutation was left in the tree.",
  },
  {
    id: 'T8-fr2-per-entrypoint-vs-shared-harness-is-a-false-choice-neither-branch-is-cheap-for-CLI-exit-codes',
    severity: 'LOW',
    summary:
      "Direct answer to the review question on FR-2's \"a synthetic-outcome test per entrypoint or a shared harness covering all 11\": leaving that as EXEC's choice does risk 11 near-duplicate spec files, but the shared-harness branch has an obstacle the PRD does not acknowledge, so simply mandating \"one parameterized harness\" is not sufficient either. These are CLI ENTRYPOINTS, not exported functions: asserting \"exit 0\" needs either a child_process spawn per entrypoint (slow, needs live DB/env, and several of these scripts perform REAL SENDS to real sessions — adam-advisory.cjs, solomon-advisory.cjs, worker-signal.cjs, issue-chairman-directive.cjs — so a naive harness would spam the live coordination lane) or a refactor of each script to export its main() for in-process invocation. The repo already has a cheaper precedent for exactly this shape: source-text/static guards — tests/static-guards/session-coordination-writer-census.test.js, tests/unit/eslint-rules/no-raw-session-coordination-insert.test.js, and notably tests/unit/adam-advisory-target-role-order.test.js:26, which pins a call shape via `SRC.indexOf(\"const { data, error } = await insertCoordinationRow(\")`. RECOMMEND PLAN choose explicitly, and choose the hybrid: (i) one static/AST guard asserting that every enumerated CLI entrypoint consults isDeliveredDispatchError() before any process.exit(1) on a dispatch error — cheap, covers all 11, and cannot spam the live lane; plus (ii) 2-3 genuine behavioural tests on the highest-traffic entrypoints (adam-advisory, worker-signal, solomon-advisory) driven through an injected fake so no real row is written. That closes FR-2's third AC (\"reproduces the original incident's shape ... asserts exit 0\") without 11 duplicate files and without live sends.",
  },
];

const warnings = [
  'T1 is the item to carry into EXEC above all others, and it is a DESIGN correction, not a missing test: FR-1 AC-3 as written ("returns true for both codes") specifies a CODE-keyed predicate, and dispatch.cjs:1322 proves DISPATCH_BACKPRESSURE is not unconditionally landed. Building AC-3 literally converts a genuinely-lost message into an exit-0 success at 11 CLI entrypoints. The predicate must key on `landed === true`. The existing test at dispatch-send-backpressure.test.js:185-213 already encodes the correct semantics and must be PRESERVED, not rewritten to match the PRD.',
  'The review question asked whether test_scenarios covers the inverse-hazard negative case. It DOES (test_scenarios[2]) — that part of the PRD is sound and should not be flagged as missing. The real gap is one level down: no acceptance criterion converts that scenario into an executable assertion, and FR-1 AC-2 discharges it with a "diff review" that does not run in CI. Add an AC demanding a parameterized still-throws test; most of the underlying coverage already exists across nine test files.',
  'T3 is a genuine internal contradiction rather than a nitpick, and it will surface as an EXEC blocker on day one: FR-1 tells EXEC to change the throw at ~line 1321 while also declaring the assert* guards out of scope, and line 1321 IS inside the assert* guard assertSendBackpressure (exported, ~20 direct tests). PLAN should specify the catch-and-convert-at-the-call-site resolution (dispatch.cjs:1669) explicitly, by line, before EXEC starts.',
  'T5 leaves ~6-7 durable callers with no requirement and no acceptance criterion, and the FR-2 CLI count (11) does not reconcile with the 15 durable callers that actually contain process.exit. Neither FR enumerates its members by path, which makes both "all 11" and "all 8" unverifiable at PLAN-verify. This is cheap to fix now and expensive to discover during verification.',
  'The positive results matter as much as the negatives and were measured, not assumed: the mutation loop is viable and sub-second with both call sites already covered by a killing test (T7), and the {data,error} claim is not only testable but already guarded for `data` by ~25 live assertions (T4). Neither needed new infrastructure. The residual on both is thin margin, not absence.',
  'No mutation was left in the tree. lib/coordinator/dispatch.cjs was restored from a pristine copy after each of the two mutation runs, `git status --porcelain` on the file is empty, and the 36/36 baseline was re-run green after restoration.',
];

const recommendations = [
  'T1 (BLOCKING, PRD edit before EXEC): reword FR-1 AC-3 from "returns true for both codes" to "returns true IFF the result carries landed === true — DISPATCH_BACKPRESSURE can carry landed=false when the park insert fails (dispatch.cjs:1322), and that case must read as NOT delivered". Reword test_scenarios[0] the same way, and ADD a fifth scenario: "DISPATCH_BACKPRESSURE with a FAILED park insert => landed=false; the CLI caller still exits 1 and the lib/ caller still reports failure, because the content was genuinely lost." Preserve dispatch-send-backpressure.test.js:185-213 unchanged as the pin.',
  'T2 (recommended, one AC + one test): add to FR-1 an executable AC — a parameterized test asserting `await expect(insertCoordinationRow(...)).rejects.toMatchObject({ code })` for the out-of-scope codes post-fix. Name the existing nine files (dispatch-assignment-target-guard, dispatch-busy-target-refusal, dispatch-fleet-target-guard, disposition-lock, kill-switch-choke-guard, coordinator-dispatch-terminal-guard, coordinator-dispatch-undrainable-message-type-guard, coordinator-dispatch-adam-untyped-kind-guard, dispatch-enum-violation-loud) as a required regression suite that must be green at EXEC-TO-PLAN. Replaces FR-1 AC-2\'s non-executable "diff review".',
  'T3 (BLOCKING, PRD clarification before EXEC): state explicitly that assertSendBackpressure KEEPS THROWING (preserving the assert* contract and its ~20 tests) and that the conversion happens at its call site inside insertCoordinationRow at dispatch.cjs:1669 via catch-and-convert. Correct FR-1\'s "~line 1321" reference, which currently points EXEC into the out-of-scope guard.',
  'T4 (recommended, one assertion): add an ordinary-path test asserting the full key set of insertCoordinationRow\'s return — e.g. `expect(Object.keys(res).sort()).toEqual(["data","error"])` pre-fix, extended post-fix — which pins BOTH that `error` survives (currently unguarded) and that the new landed/parkedRowId fields are ADDITIVE rather than a restructure. Binds test_scenarios[3], which no AC currently references.',
  'T5 (recommended, PRD edit): enumerate FR-2\'s 11 CLI entrypoints and FR-3\'s 8 lib/ callers BY PATH, and reconcile against the census of 26 durable callers / 15 containing process.exit. Explicitly state the disposition of the ~6-7 callers currently in neither FR (either add them or record why they need no change) — otherwise they retain the defect silently.',
  'T6 (recommended, PRD edit): restate FR-3\'s acceptance criteria per CALL SITE rather than per file. lib/coordinator/coordination-events.cjs has four insertCoordinationRow call sites (475, 589, 709, 923) of which only emitInertWorkerAlert is named; the other three are identical in shape and blindness.',
  'T8 (recommended, PLAN decision): replace FR-2 AC-1\'s "a synthetic-outcome test per entrypoint OR a shared harness" with a specified hybrid — one static/AST guard asserting every enumerated CLI entrypoint consults isDeliveredDispatchError() before process.exit(1) (precedent: tests/static-guards/session-coordination-writer-census.test.js, tests/unit/adam-advisory-target-role-order.test.js:26), plus 2-3 behavioural tests on adam-advisory / worker-signal / solomon-advisory driven through an injected fake. Prevents both 11 duplicate files and a spawn-based harness performing real sends into the live coordination lane.',
];

const summary =
  'CONDITIONAL_PASS for PLAN-TO-EXEC. This is a test-STRATEGY review: EXEC has not started, so nothing here executes not-yet-written code; every claim is grounded in the real PRD row, the real dispatch.cjs at HEAD, the two existing test files, a caller census, and two applied mutations. Three things came back POSITIVE and measured. (1) FR-1 AC-5\'s mutation requirement is concretely achievable, not aspirational: baseline 36/36 green in 331ms, and both in-scope call sites already have a killing test — mutating dispatch.cjs:1322 (`e.landed = parkedRowId != null` -> `true`) gives 35/36, and reverting the dedup guard at :1561 (`if (dupeId)` -> `if (false)`) gives 10/11. Source restored byte-identical, git status clean, baseline re-verified green. (2) FR-1\'s "16 durable callers depend on {data,error}" is testable and already HALF-GUARDED: ~25 assertions across three files read res.data.* off the real function, so a restructure fails loudly. (3) The PRD\'s test_scenarios DOES contain the inverse-hazard negative case at test_scenarios[2] — that part is sound and should not be reported as missing. What blocks a clean PASS is one CRITICAL design defect plus two structural gaps. CRITICAL (T1): the PRD calls these "the two landed=true throw sites" and FR-1 AC-3 specifies a CODE-keyed predicate ("returns true for both codes"), but dispatch.cjs:1322 computes `e.landed = parkedRowId != null` — when the best-effort park insert fails (1307-1314, logging "content may be lost") DISPATCH_BACKPRESSURE carries landed=FALSE and the message is genuinely gone. A code-keyed predicate would return true for it, exiting 0 at all 11 CLI entrypoints and reporting success at all 8 lib/ callers for a lost message: the exact inverse hazard the risk register anticipated only for out-of-scope codes, re-entering through the in-scope door, and strictly worse than today (today a lost message at least throws). The existing test at dispatch-send-backpressure.test.js:185-213 already pins the correct semantics and must survive the migration. HIGH (T2): the negative scenario exists but no acceptance criterion makes it executable — FR-1 AC-2 discharges it with a "diff review" that does not run in CI, and FR-1 AC-3\'s predicate-returns-false is a different proposition from insertCoordinationRow-still-throws; the underlying coverage already exists across nine test files and only needs naming as a required suite. HIGH (T3): FR-1 contradicts itself — it directs EXEC to change the throw at "~line 1321", which is inside assertSendBackpressure, an exported assert* guard with ~20 of its own tests that the same FR declares out of scope and requires to keep throwing; only catch-and-convert at the call site (dispatch.cjs:1669) satisfies both, and PLAN must say so by line. Three MEDIUM items round it out: FR-2 (11) + FR-3 (8) covers 19 of a censused 26 durable callers with ~6-7 in no FR at all and the CLI count unreconciled against 15 files containing process.exit (T5); the `error` key of the ordinary return is unguarded by any test even though FR-3 callers destructure it (T4); and FR-3 names one of coordination-events.cjs\'s four call sites (T6).';

const justification =
  'CONDITIONAL_PASS rather than PASS because one acceptance criterion, if built literally, ships the defect this SD exists to prevent — in its more dangerous direction. FR-1 AC-3 specifies a code-keyed isDeliveredDispatchError ("returns true for both codes"), and dispatch.cjs:1322 is not a constant: `e.landed = parkedRowId != null`, with the park insert above it explicitly best-effort and logging "content may be lost" on failure. So DISPATCH_BACKPRESSURE has a real landed=false branch, already pinned by a passing test (dispatch-send-backpressure.test.js:185-213), and a code-keyed predicate would report a genuinely lost message as delivered — exit 0 at 11 CLI entrypoints, success at 8 lib/ callers. The PRD\'s own risk register names this inversion but scopes the mitigation only to the OTHER throw codes, so the hazard sits inside the in-scope set unguarded. That is a PRD-level correction and it is cheaper to make now than after EXEC has migrated 19 call sites against the wrong predicate. Two further items are blocking-by-ambiguity rather than by defect: FR-1 simultaneously requires changing line 1321 and requires the assert* guards (of which the function containing line 1321 is one) to keep throwing, which EXEC cannot satisfy both ways; and neither FR enumerates its callers by path, leaving ~6-7 of 26 censused durable callers in no requirement at all. CONDITIONAL_PASS rather than FAIL because the PRD is fundamentally sound and unusually well-grounded: its FR-3 claims about kill-switch-writer.cjs (no catch), sweep-findings-sink.cjs and coordinator-capacity-forecast.mjs were each checked against source and are ACCURATE; its scope-boundary instinct (additive fields, never restructure) is correct and already half-protected by ~25 existing res.data assertions; its negative test scenario genuinely exists; and its mutation-testing acceptance criterion is achievable today at sub-second cost with both call sites already covered by a killing test, which I verified by applying both mutations and restoring the source byte-identical. Nothing found requires new test infrastructure — every remedy is a PRD wording change or a single added assertion against harnesses that already exist. Confidence 88: every claim is backed by a read of the real source at HEAD, a run of the real suite, an applied-and-reverted mutation, or a live caller census; the one place I assert a count I could not fully reconcile (FR-2\'s 11 CLI entrypoints against 15 durable callers containing process.exit) is reported as an unreconciled delta rather than as a defect, because process.exit may appear on unrelated arg-validation paths in some of those files and the PRD does not enumerate its 11 by path for me to diff against.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [
      'T1: FR-1 AC-3 specifies a CODE-keyed isDeliveredDispatchError ("returns true for both codes"), but dispatch.cjs:1322 computes `e.landed = parkedRowId != null` — DISPATCH_BACKPRESSURE carries landed=false when the best-effort park insert fails (1307-1314, "content may be lost"), meaning the message is genuinely lost. A code-keyed predicate reports that as delivered: exit 0 at all 11 FR-2 CLI entrypoints and success at all 8 FR-3 lib/ callers. This is the PRD\'s own named inverse hazard (silently dropped content) re-entering through the in-scope door, and it is worse than the defect being fixed. The predicate must key on `landed === true`.',
    ],
    conditions: [
      'T1 (blocking): reword FR-1 AC-3 to key on `landed === true` rather than on the error code, reword test_scenarios[0] to stop asserting landed=true unconditionally for DISPATCH_BACKPRESSURE, and add a scenario for backpressure-with-failed-park (landed=false => caller still exits 1 / still reports failure). Preserve tests/unit/coordinator/dispatch-send-backpressure.test.js:185-213 unchanged as the pin — it already encodes the correct semantics.',
      'T3 (blocking): resolve FR-1\'s internal contradiction by stating explicitly that assertSendBackpressure KEEPS THROWING (it is one of the assert* guards FR-1 declares out of scope, it is exported, and it has ~20 direct tests) and that the conversion happens via catch-and-convert at its call site inside insertCoordinationRow at dispatch.cjs:1669. Correct the "~line 1321" reference.',
      'T2 (required before EXEC-TO-PLAN): add an executable acceptance criterion for the inverse-hazard negative case — a parameterized test asserting insertCoordinationRow still REJECTS for the out-of-scope codes post-fix — replacing FR-1 AC-2\'s non-executable "diff review". Name the nine existing guard test files as a required regression suite.',
      'T5 (required): enumerate FR-2\'s 11 CLI entrypoints and FR-3\'s 8 lib/ callers by path, and record the disposition of the ~6-7 of 26 censused durable callers currently covered by neither FR.',
    ],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING_TEST_STRATEGY_REVIEW',
      review_method:
        'test-strategy review of PRD acceptance criteria and test_scenarios (EXEC not started, no new code exists); grounded in the real PRD row, dispatch.cjs at HEAD, the two existing test files, a durable-caller census, and two applied-and-reverted mutations',
      prd_id: 'PRD-SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001',
      prd_status: 'approved',
      files_reviewed: [
        'lib/coordinator/dispatch.cjs',
        'tests/unit/coordinator/dispatch-send-backpressure.test.js',
        'tests/unit/coordinator/dispatch-correlation-dedupe.test.js',
        'lib/coordinator/kill-switch-writer.cjs',
        'lib/fleet/sweep-findings-sink.cjs',
        'lib/coordinator/coordination-events.cjs',
        'scripts/coordinator-capacity-forecast.mjs',
      ],
      test_execution: buildTestExecution({
        executed: 36,
        passed: 36,
        failed: 0,
        skipped: 0,
        artifactSha: ARTIFACT_SHA,
        runner: 'vitest 4.1.4',
        artifactPath: ARTIFACT_PATH,
        source: 'runner',
      }),
      baseline_test_execution: {
        command: 'npx vitest run tests/unit/coordinator/dispatch-send-backpressure.test.js tests/unit/coordinator/dispatch-correlation-dedupe.test.js --reporter=json --outputFile=.artifacts/testing/insertcoordrow-001-plan-baseline.json',
        result: '2 files / 36 tests passing (numTotalTests=36, numPassedTests=36, numFailedTests=0, numPendingTests=0)',
        artifact_path: ARTIFACT_PATH,
        artifact_sha256: ARTIFACT_SHA,
        purpose: 'establishes the pre-EXEC baseline the FR-1 AC-5 mutation requirement depends on',
      },
      mutation_feasibility_probe: {
        'M-A (dispatch.cjs:1322  e.landed = parkedRowId != null  ->  e.landed = true)':
          'CAUGHT — 1 failed / 35 passed; sole killer is dispatch-send-backpressure.test.js:212 ("stamps landed:false ... when the park insert itself fails"). Doubles as the T1 witness: it demonstrates the landed=false branch is real and guarded by exactly one assertion.',
        'M-B (dispatch.cjs:1561  if (dupeId) {  ->  if (false) {  — reverts the DISPATCH_ALREADY_DELIVERED call site)':
          'CAUGHT — 1 failed / 10 passed; sole killer is dispatch-correlation-dedupe.test.js:111.',
        conclusion:
          "FR-1 AC-5's mutation requirement is concretely achievable with the repo's established read/text-replace/re-run/restore practice, sub-second per run, and both in-scope call sites already have a killing test. Caveat: each mutant is killed by exactly ONE test, and M-A's killer is the very test a code-keyed predicate (T1) would obsolete.",
        hygiene:
          'lib/coordinator/dispatch.cjs restored from a pristine pre-mutation copy after each run; `git status --porcelain lib/coordinator/dispatch.cjs` empty; 36/36 baseline re-verified green after restoration. No mutation left in the tree.',
      },
      caller_census: {
        method: "grep for an actual `insertCoordinationRow(` invocation across scripts/ and lib/, excluding scripts/one-off/, *.json, *.test.*, scripts/lint/ and dispatch.cjs itself",
        durable_callers_found: 26,
        prd_claim: 25,
        containing_process_exit: 15,
        fr2_cli_claim: 11,
        unreconciled: 'FR-2 (11) + FR-3 (8) = 19 of 26; ~6-7 durable callers are covered by no functional requirement and no acceptance criterion. The 11-vs-15 process.exit delta is also unreconciled, and neither FR enumerates its members by path.',
      },
      return_shape_guard_status: {
        data_key: 'GUARDED — ~25 assertions read res.data.* off the real insertCoordinationRow (coordinator-dispatch-adam-untyped-kind-guard.test.js:80-123, coordinator-dispatch-addressee-role-precondition.test.js:115-167, coordinator-dispatch-body-correlation-both-locations.test.js:47-110)',
        error_key: 'UNGUARDED — no test asserts the error key on the ordinary path of the real function; the .error assertions in tests/unit/coordinator are all on wrapper return values',
        implication: "FR-1's \"16 durable callers depend on the {data,error} shape\" is testable and half-covered already; one key-set assertion closes the remainder and simultaneously pins that the new fields are additive",
      },
      prd_claims_verified_accurate: {
        'kill-switch-writer.cjs does not catch': 'CONFIRMED — line 207 is `return insertCoordinationRow(supabase, row, { select: "*", single: true })` with no catch in the function',
        'sweep-findings-sink.cjs collapses to {ok:false,error}': 'CONFIRMED — line 66 destructures {data,error}; zero landed-awareness in the file',
        'coordinator-capacity-forecast.mjs mis-surfaces': 'CONFIRMED — call sites at 359 and 567, zero landed-awareness in the file',
        'test_scenarios covers the negative case': 'CONFIRMED — test_scenarios[2] requires other throw codes to still throw; the gap is that no acceptance criterion makes it executable',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001',
      phase_note: 'PLAN-phase strategy review; EXEC has not started and no new production code exists yet',
    },
    phase: 'PLAN-TO-EXEC',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN-TO-EXEC' }
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
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
