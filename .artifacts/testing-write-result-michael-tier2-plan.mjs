#!/usr/bin/env node
/**
 * Persist TESTING sub-agent evidence for SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001's
 * PLAN-TO-EXEC handoff. PROSPECTIVE PRD/test-plan review: no implementation code exists yet,
 * so no product test run is claimed. The only numbers recorded are a real baseline run of the
 * three existing suites the PRD's changes touch, plus one measured census probe.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../lib/sub-agents/testing/test-execution-record.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';

const summary =
  'CONDITIONAL_PASS (prospective PRD/test-plan review at PLAN-TO-EXEC; no implementation exists, no product tests run). ' +
  'The PRD is unusually well-sourced -- every mechanism decision cites a real line -- but 4 HIGH findings would each make EXEC ' +
  'either fail CI or ship a fail-open path, and the test plan as written cannot satisfy the SD\'s own exit predicate. ' +
  'H1 (MEASURED): FR-8 AC-1 is false. Registering the new verb in outbound-sink-conformance.test.js ADDITIONAL_SCOPE makes the ' +
  'RATCHET test FAIL, not pass -- ADDITIONAL_SCOPE puts a path IN SCOPE, and a michael sink reaching twilio-provider.js without ' +
  'reaching lib/adam/should-consult-solomon.js lands in nonConformant, which :256 asserts toEqual([]). Proven by probe: a stand-in ' +
  'module importing twilio-provider added to ADDITIONAL_SCOPE produced exactly ["<probe>"] at :257. The only in-file escapes are the ' +
  'consult gate (semantically wrong for Michael) or KNOWN_DEBT, which needs 3 coupled edits including raising KNOWN_DEBT_CEILING 9->10 ' +
  '(:124, "Never raise this") AND editing the pin expect(KNOWN_DEBT_CEILING).toBe(9) at :292 -- the file\'s own comment calls that "a ' +
  'one-line ratchet kill". TS-10 passes trivially on entry-presence while the real gate fails: TS-10 is theater w.r.t. H1. ' +
  'H2: all 10 TS are type:"unit". The SD exit predicate requires the cap/pin/revocation "demonstrated BY A RUN" and that "ledger rows ' +
  'for a capped attempt and a revoked attempt both exist". Stubbed-client unit tests create no rows and satisfy neither. FR-7 AC-2 ' +
  '(DB UNIQUE independently rejects a concurrent double-insert) is unprovable at the unit tier by construction. The repo already owns ' +
  'the right instrument and the PRD omits it: tests/ddl/michael-tables-ddl.db.test.js applies the migration to an ephemeral PG16 and ' +
  'proves DDL/REVOKE/$verify$/re-apply/DOWN -- no chairman apply needed. ' +
  'H3: two pinned registry tests break by construction and are absent from the PRD file list -- lib/michael/feeder.test.js:38 ' +
  'expect(FEEDER_IDS).toEqual([...10 ids]) and tests/unit/fleet/setup-michael-host-tasks.test.js:41-42 (exact 7-feeder array + ' +
  'new Set(...).size).toBe(7)). TR-2/step-5 add an 11th feeder and an 8th task. ' +
  'H4: partial-identity fail-OPEN in twilio-provider.js. isConfigured() :35-37 checks only sid+token; messagingService() is read ' +
  'unguarded at :59. An identity with MICHAEL_TWILIO_ACCOUNT_SID+AUTH_TOKEN set but MESSAGING_SERVICE unset makes a REAL authenticated ' +
  'POST to Twilio with an empty MessagingServiceSid. FR-3\'s claim that it "fails closed exactly like the existing unconfigured-provider ' +
  'path" is true for sid/token only. No FR, AC or TS covers partial identity -- a fail-open edge inside a grant whose premise is fail-closed. ' +
  'Coverage gaps: FR-4 has ZERO test scenarios (both ACs are "code/test inspection"); FR-3, a critical FR, is covered only by an ' +
  'incidental regression clause inside TS-9 -- neither of its substantive ACs has a scenario. ' +
  'Answering the 4 questions posed: (Q2) sha256Hex is reusable, but hash the RAW env string -- if EXEC normalizes via phoneKey() ' +
  '(lib/solomon/chairman-sms-exchanges.js:86, last-10-digits) the pin accepts any same-last-10 number; separately the PRD\'s "no literal ' +
  'E.164 in git" implies a secrecy sha256-of-a-phone-number does not provide (~1e10 offline-enumerable candidates). The pin is sound as ' +
  'TAMPER-EVIDENCE; the PRD should say that and drop the secrecy framing. (Q3) additive identity is structurally clean -- accountSid()/ ' +
  'authToken()/messagingService() read process.env at CALL time, so threading identity is a local change and the 3 existing callers are ' +
  'untouched -- with two surprises: H4 above, and statusCallbackUrl() :26/:63-64 is SHARED env, so a Michael-identity send requests ' +
  'delivery callbacks to Adam\'s webhook where verifyInboundSignature :133-141 uses the shared authToken() -- Michael-signed callbacks ' +
  'fail signature. Omit StatusCallback for identity sends. (Q4) windowIdFor/FEEDERS work as assumed and the proposed windows are ' +
  'boundary-clean: inWindow is INCLUSIVE, schtasks fires :00/:15/:30/:45 (/SC MINUTE /MO 15 /ST 00:00), so each 15-min window catches 2 ' +
  'fires, and end%%intervalMinutes===0 satisfies feeder.test.js:79. No boundary gap. The real scheduling gap is different: a MISSED ' +
  'window is SILENT -- feeder.mjs:241 returns inert outside_et_window with no row, so if the host sleeps through both fires the chairman ' +
  'simply gets no text and nothing records it. No FR, TS or gauge covers it. ' +
  'Baseline measured this session: 3 files / 97 tests green before any change (outbound-sink-conformance, lib/michael/feeder.test.js, ' +
  'tests/unit/fleet/setup-michael-host-tasks.test.js), restored green after the probe was removed.';

const findings = [
  { id: 'TESTING-H1-fr8-ratchet-unsatisfiable', severity: 'HIGH', summary: 'FR-8 AC-1 is false as written and MEASURED so: registering the verb in tests/unit/outbound-sink-conformance.test.js ADDITIONAL_SCOPE (:60-67) makes the RATCHET test at :252-257 FAIL. A probe module importing lib/messaging/providers/twilio-provider.js, added to ADDITIONAL_SCOPE, produced nonConformant=["<probe>"] against an expected []. ADDITIONAL_SCOPE grants SCOPE, not conformance. Escapes: (a) reach lib/adam/should-consult-solomon.js -- semantically wrong, Solomon-consult is an Adam-lane governance check, not a personal 4x/day checkpoint control; (b) KNOWN_DEBT, requiring KNOWN_DEBT_CEILING 9->10 at :124 (comment: "Never raise this") AND editing the pin expect(KNOWN_DEBT_CEILING).toBe(9) at :292, which the file itself calls "a one-line ratchet kill". EXEC must not discover this mid-build. Recommend PLAN decide the route now, or add a 4th allowlist category (e.g. RATIFIED_EXCEPTION) with its own pinned identity baseline alongside EXPECTED_NON_CONFORMANT (:140-150).' },
  { id: 'TESTING-H2-unit-only-cannot-meet-exit-predicate', severity: 'HIGH', summary: 'All 10 test scenarios are type:"unit". The SD exit predicate requires the cap, recipient pin and revocation to be "demonstrated BY A RUN rather than by reading the code" and that "ledger rows for a capped attempt and a revoked attempt both exist". Unit tests over a stubbed supabase client write no rows and demonstrate nothing by a run. FR-7 AC-2 ("the DB unique constraint independently rejects a concurrent double-insert") cannot be proven at the unit tier at all -- a mocked client can only prove the code handles a 23505, never that the constraint exists. The repo already has the correct instrument, unused by the PRD: tests/ddl/michael-tables-ddl.db.test.js applies the real migration to an ephemeral vanilla PG16 and proves DDL/REVOKE/$verify$/idempotent-re-apply/DOWN, with NO dependence on the chairman applying anything to production. Add a tests/ddl/michael-checkpoint-send-ddl.db.test.js (partial-unique enforcement, RLS, REVOKE) and at least one seeded-DB scenario for the cap and the revocation.' },
  { id: 'TESTING-H3-pinned-registry-tests-break-and-are-unlisted', severity: 'HIGH', summary: 'TR-2 and implementation step 5 add an 11th FEEDERS entry and an 8th MICHAEL_TASKS entry. Two exact-equality pins break by construction and appear in neither the PRD system_architecture component list nor implementation_approach: lib/michael/feeder.test.js:37-38 (it("registry lists the ten feeder ids"), expect(FEEDER_IDS).toEqual([10 ids])) and tests/unit/fleet/setup-michael-host-tasks.test.js:41-42 (expect(MICHAEL_TASKS.map(t=>t.feeder)).toEqual([7 feeders]) and expect(new Set(taskNames).size).toBe(7)). Both files must be edited in the same PR. Measured green at baseline: 97/97 across these plus outbound-sink-conformance.' },
  { id: 'TESTING-H4-partial-identity-fails-open', severity: 'HIGH', summary: 'FR-3 states an unset Michael identity makes send() "fail closed exactly like the existing unconfigured-provider path". True only for accountSid/authToken. lib/messaging/providers/twilio-provider.js:35-37 isConfigured() checks Boolean(accountSid() && authToken()) -- messagingService is NOT checked -- and :59 form.set("MessagingServiceSid", messagingService()) is unguarded. So MICHAEL_TWILIO_ACCOUNT_SID + MICHAEL_TWILIO_AUTH_TOKEN set with MICHAEL_TWILIO_MESSAGING_SERVICE unset yields a REAL authenticated POST to api.twilio.com with an empty MessagingServiceSid. The PRD says the resolver returns "null when unset" without defining partial. Require ALL THREE present or return null, and add a scenario asserting a partial identity refuses with no fetch call. A fail-open branch inside a capability grant whose entire premise is fail-closed.' },
  { id: 'TESTING-M5-status-callback-cross-lane-bleed', severity: 'MEDIUM', summary: 'Identity isolation is incomplete: twilio-provider.js:26 statusCallbackUrl() reads the SHARED process.env.TWILIO_STATUS_CALLBACK_URL and :63-64 registers it on every send, identity or not. A Michael-identity send therefore asks Twilio to POST delivery callbacks to Adam\'s webhook (api/webhooks/twilio-sms.js handleTwilioStatusCallback :116-133), where verifyInboundSignature (:124 -> twilio-provider.js:133-141) validates with the SHARED authToken() -- but Michael\'s message was signed with Michael\'s token, so every Michael callback fails signature verification and/or matches no chairman obligation row. Fail-closed, so not a security hole, but it is persistent cross-lane noise and silently denies Michael any delivery truth. Either thread statusCallback through the identity object or omit StatusCallback entirely when identity is supplied. Not covered by any FR, AC or TS.' },
  { id: 'TESTING-M6-fr6-every-attempt-ambiguous-vs-96-daily-fires', severity: 'MEDIUM', summary: 'The task fires every 15 minutes all day (scripts/setup-michael-host-tasks.mjs INTERVAL_MINUTES=15, START_TIME="00:00") = ~96 invocations/day, of which 8 are in-window. FR-6 says "every attempt -- sent, held, or refused -- writes a ledger row" without defining "attempt". If an out-of-window fire writes a row: ~32k rows/year with no retention story in TR-3 (michael_* has a retention verb, scripts/michael/retention.mjs, not referenced here). If it does not: FR-6\'s wording is simply wrong. No test scenario exercises an out-of-window invocation at all. Define "attempt" as an in-window send attempt, and add a scenario asserting an out-of-window run is inert with no ledger row and no external call.' },
  { id: 'TESTING-M7-missed-window-is-silent', severity: 'MEDIUM', summary: 'A window missed entirely leaves no trace. lib/michael/feeder.mjs:241 returns inert(feeder, etDate, "outside_et_window") before any claim or write, exit 0. Each window offers only 2 fire minutes (e.g. 06:00 and 06:15); scripts/setup-michael-host-tasks.mjs\'s own header states the host has no wake-from-sleep configured, so a sleeping or hibernating laptop silently drops the whole window. For the READ feeders this is survivable by design ("a missed window shows as a missing/failed run row, one line in Adam\'s 6 AM text and a degraded brief"); for checkpoint-send there is no such reader -- the chairman simply does not get a text and nothing records that he did not. The SD promises four checkpoints a day with no detector for zero. Either add a daily reconciliation gauge (the docs/michael/02-SPEC.md:149 michael-feeder-health pattern) or state explicitly in the PRD that a missed window is silent and accepted.' },
  { id: 'TESTING-M8-body-freshness-unspecified', severity: 'MEDIUM', summary: 'FR-4 composes the body from michael_* counts but imposes no freshness requirement, and no scenario asserts one. The producing feeders run 04:00-05:30, 12:00-12:30 and 18:00-18:30 ET (lib/michael/feeder.mjs:35-43). So the 10:00 checkpoint carries counts up to ~4.5h stale, and the 18:00 checkpoint races calendar-read/gmail-triage/todoist-brief in the SAME 18:00 window and will usually carry noon data. A checkpoint that reads as current but is not is the exact "correct field answering a different question" failure. Recommend FR-4 carry an as-of/source-run pointer in the body and a scenario asserting it reflects the actual producing run, not send time.' },
  { id: 'TESTING-M9-hash-pin-is-tamper-evidence-not-secrecy', severity: 'MEDIUM', summary: 'Two distinct issues in FR-2. (a) Normalization: sha256Hex (lib/michael/db.mjs:89) is reusable, but the repo\'s own phoneKey (lib/solomon/chairman-sms-exchanges.js:86) exists precisely because "formats vary across providers" -- it strips non-digits and takes the LAST 10. If EXEC normalizes through it before hashing, the pin commits to 10 digits and would accept a different-country number sharing them; if EXEC hashes the raw env string, a stray quote or trailing space in .env yields a permanent RECIPIENT_HASH_MISMATCH that looks like tampering. Recommendation: hash the RAW string (strict is correct for a pin), and add a scenario asserting a value differing only by surrounding whitespace refuses -- making the brittleness a documented behaviour rather than a mystery outage. (b) Framing: the PRD justifies the hash via V-8 "no literal E.164 goes into git". sha256 of a phone number is ~1e10 candidates, trivially enumerable offline, so the constant is NOT a secret. The pin genuinely delivers tamper-evidence/unredirectability -- its actual stated purpose -- and the PRD should say that instead of implying secrecy a future reader might rely on.' },
  { id: 'TESTING-M10-tr3-omits-three-migration-conventions', severity: 'MEDIUM', summary: 'TR-3 lists RLS, service-role policy, REVOKE, updated_at trigger, natural-key index and COMMENT, but omits three conventions docs/michael/02-SPEC.md:49 and the existing 20260906_michael_tables.sql both require: the _DOWN.sql companion, the "-- @approved-by:" chairman sign-off header (a ceremony marker only -- it is NOT apply state), and the DO $verify$ self-check block (20260906_michael_tables.sql:343-368), which is the repo\'s established way to prove a constraint or index actually exists. The PRD\'s file list also omits a migration-shape test despite four precedents under tests/unit/migrations/michael-*-migration-shape.test.js. Note for planning: because michael migrations are chairman-applied, every run before the apply returns TABLES_ABSENT -- which is why the ephemeral-PG DDL tier (H2) is the only way to demonstrate the constraint before the chairman acts.' },
  { id: 'TESTING-L11-fr6-vs-ts1-contradiction', severity: 'LOW', summary: 'FR-6 ("every attempt -- sent, held, or refused -- writes a ledger row") directly contradicts TS-1 ("Dry-run at a valid window ... no ledger row"). The reconciliation (a dry-run is not an attempt) is implicit and should be stated in FR-6, or an EXEC reading FR-6 literally will write a row on every dry run and TS-1 will fail.' },
  { id: 'TESTING-L12-fr9-ac-passes-without-the-thing-happening', severity: 'LOW', summary: 'FR-9\'s sole AC is satisfied by "OR explicitly notes it is still pending (citing worker-signal 6249c0d4)". It therefore passes whether or not ratification 561878ae is ever encoded. That is defensible for a cross-seat dependency owned by another scribe, but it is a theater-shaped AC by construction: flagging so LEAD-FINAL-APPROVAL records the encode state as a fact rather than treating a green AC as evidence the contract was updated.' },
  { id: 'TESTING-C13-coverage-matrix', severity: 'MEDIUM', summary: 'FR-to-TS mapping. Covered: FR-1 (TS-2/3/4, the two-branch fail-closed shape correctly mirrors scripts/michael/todoist-act.mjs:73-77, verified), FR-5 (TS-5/6), FR-6 (TS-2/5/9). Partial: FR-2 (TS-7 covers only hash mismatch; nothing RUNS the verb with an alternate --to/--recipient flag to prove lib/michael/db.mjs parseArgs input cannot reach the recipient -- AC-3 is a "code read", which the exit predicate explicitly rejects as proof); FR-7 (TS-8 folds an unprovable DB-constraint claim into a unit scenario, see H2); FR-8 (see H1). UNCOVERED: FR-4 has ZERO test scenarios -- both its ACs are "code/test inspection", so the one FR governing what actually reaches the chairman is proven by reading. FR-3, priority critical, has no scenario for either substantive AC (identity never falls back to process.env.TWILIO_*; Michael fails while Adam succeeds in-process) -- only an incidental regression clause inside TS-9. Note both are testable but need a mocked fetch: twilio-provider.js:48 shouldRefuseRealSend() short-circuits to reason:"test_env_guard" BEFORE the identity branch under VITEST, so a test that does not vi.stubGlobal("fetch", ...) will pass vacuously without ever exercising the identity path -- a live vacuous-pass trap for EXEC.' },
];

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
    confidence: 85,
    findings,
    warnings: [
      { severity: 'HIGH', message: 'FR-8 AC-1 is measurably false: ADDITIONAL_SCOPE registration FAILS the RATCHET test. PLAN should choose the route (KNOWN_DEBT + ceiling raise + pin edit, consult-gate wiring, or a new pinned exception category) before EXEC starts.' },
      { severity: 'HIGH', message: 'Test plan is unit-only and cannot satisfy the SD exit predicate ("demonstrated BY A RUN", "ledger rows ... both exist"). Add a tests/ddl/*.db.test.js tier and at least one seeded-DB run.' },
    ],
    recommendations: [
      'Resolve H1 in the PRD before EXEC: name the census route explicitly, including whether KNOWN_DEBT_CEILING is raised and the :292 pin edited, since the file documents that as a deliberate ratchet kill.',
      'Add a DDL tier (tests/ddl/michael-checkpoint-send-ddl.db.test.js) proving the partial UNIQUE (et_date, window_slot) WHERE outcome=\'sent\' actually rejects a duplicate, plus RLS/REVOKE -- this runs on ephemeral PG16 and needs no chairman apply.',
      'Add lib/michael/feeder.test.js and tests/unit/fleet/setup-michael-host-tasks.test.js to the PRD file list; both carry exact-equality pins that break on the 11th feeder / 8th task.',
      'Require all three MICHAEL_TWILIO_* values before returning an identity, and add a scenario asserting a partial identity refuses with zero fetch calls.',
      'Omit StatusCallback (or thread it through identity) for identity sends, so Michael callbacks never hit Adam\'s webhook and fail signature against the shared auth token.',
      'Add test scenarios for FR-4 (body-composer inputs) and for FR-3\'s two substantive ACs, each with vi.stubGlobal(\'fetch\', ...) so shouldRefuseRealSend() cannot produce a vacuous pass.',
      'Define "attempt" in FR-6 against ~96 daily invocations, and add an out-of-window scenario.',
      'Decide whether a missed window is silent-and-accepted or needs a reconciliation gauge; state it in the PRD either way.',
      'Restate FR-2\'s hash pin as tamper-evidence rather than secrecy, and pin the exact string form (raw env value) with a whitespace-refusal scenario.',
      'Add the _DOWN.sql, the -- @approved-by: header, the DO $verify$ block and a migration-shape test to TR-3.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_EXEC_TESTING',
      review_mode: 'prospective_prd_and_test_plan_review',
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
      // No product tests run: the implementation does not exist yet. The only numbers below were
      // actually taken this session. Never report a number that was not measured.
      measured: true,
      // HONESTY NOTE: the implementation does not exist yet, so NO product test was run. The
      // test_execution block below records the ONLY run actually performed this session -- a
      // pre-change baseline of the three existing suites the PRD modifies. It must not be read
      // as "the SD's tests pass".
      product_tests_run: false,
      test_execution_scope: 'pre_change_baseline_of_suites_the_prd_modifies',
      test_execution: buildTestExecution({
        executed: 97,
        passed: 97,
        failed: 0,
        skipped: 0,
        artifactSha: 'b723b5bae2e270109e59a574fdb2b95ce77158ed',
        runner: 'vitest',
        source: 'fresh',
        foundFiles: 3,
        mappedCandidates: 3,
      }),
      baseline_measurement: {
        runner: 'vitest',
        command: 'npx vitest run tests/unit/outbound-sink-conformance.test.js lib/michael/feeder.test.js tests/unit/fleet/setup-michael-host-tasks.test.js',
        files: 3,
        tests_executed: 97,
        passed: 97,
        failed: 0,
        note: 'Pre-change baseline of the three existing suites the PRD modifies. Re-verified green (17/17 on outbound-sink-conformance) after the probe below was removed.',
      },
      census_probe: {
        purpose: 'Settle FR-8 AC-1 by attempting it rather than reasoning about it.',
        method: 'Throwaway module importing lib/messaging/providers/twilio-provider.js (and NOT lib/adam/should-consult-solomon.js) added to a scratch copy of outbound-sink-conformance.test.js ADDITIONAL_SCOPE; RATCHET test run in isolation.',
        result: 'FAILED as predicted: nonConformant = [".artifacts/probe-checkpoint-send.mjs"], expected []. Assertion site tests/unit/outbound-sink-conformance.test.js:257.',
        cleanup: 'Scratch test copy and probe module deleted; git status confirms no tracked file modified.',
      },
      findings_by_severity: { HIGH: 4, MEDIUM: 6, LOW: 2, COVERAGE: 1 },
      uncovered_frs: ['FR-4 (zero test scenarios)', 'FR-3 (no scenario for either substantive AC)'],
      files_reviewed: [
        'lib/michael/db.mjs',
        'lib/michael/feeder.mjs',
        'lib/michael/feeder.test.js',
        'lib/messaging/providers/twilio-provider.js',
        'lib/notifications/transport-test-isolation-guard.js',
        'lib/solomon/chairman-sms-exchanges.js',
        'tests/unit/outbound-sink-conformance.test.js',
        'tests/unit/fleet/setup-michael-host-tasks.test.js',
        'tests/ddl/michael-tables-ddl.db.test.js',
        'scripts/lint/transport-test-isolation-guard-lint.mjs',
        'scripts/setup-michael-host-tasks.mjs',
        'scripts/michael/todoist-act.mjs',
        'database/migrations/20260906_michael_tables.sql',
        'api/webhooks/twilio-sms.js',
        'docs/michael/02-SPEC.md',
      ],
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      prd_id: 'PRD-SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001',
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001',
      prior_validation_row: '1171f9c8-d49d-4a32-9c15-a3c97e39200e',
    },
    phase: 'PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_KEY,
    { name: 'QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  findings:', (stored.findings || []).length);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
