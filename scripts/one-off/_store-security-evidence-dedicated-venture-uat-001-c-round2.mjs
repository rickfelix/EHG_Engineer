// SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C -- SECURITY evidence writer (EXEC-TO-PLAN, round 2).
//
// Round 1's SECURITY review produced a real CONDITIONAL_PASS report but its evidence row was never
// persisted (confirmed by direct query: only TESTING rows existed for this SD). This round is an
// INDEPENDENT adversarial re-verification of fix commit b6c5f373f66 ("close 5 real defects from
// EXEC-TO-PLAN adversarial review"), re-running each finding's own reproduction rather than
// trusting the commit message.
//
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C';
const PHASE = 'EXEC-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Independent adversarial re-verification of fix commit b6c5f373f66 against the live database, ' +
    'not a re-statement of round 1. S1, S2, S3 and S4 are GENUINELY CLOSED (each re-verified by ' +
    'executing its own reproduction). S5 is NOT closed -- it was relocated, not fixed. Four new ' +
    'defects were found, two of them introduced BY the fix commit itself. ' +
    'S1 CLOSED (live, real feedback rows, cleaned up): 5 sequential mechanism failures for venture A ' +
    'now read count 1..5 and escalate at 3; venture B on the same shared dedup row reads 0 before its ' +
    'own failures then 1,2,3; A remains 5. The pre-fix query shape (.eq(metadata->>venture_id)) was ' +
    're-run on the same rows and returned 1 for A and 0 for B -- confirming the original defect and ' +
    'its repair. Exactly one feedback row was created, so factory-defect-recorder.js\'s dedup contract ' +
    'is intact. The venture_defect branch inserted successfully against live constraints, confirming ' +
    'the feedback_type=\'sentry_error\' fix is real (feedback_feedback_type_check does not permit ' +
    '\'uat_failure\'; \'uat_failure\' IS a valid source_type, so the commit message is accurate). ' +
    'S2 CLOSED for its stated problem: with the stage marker stubbed true, a real not-opted-in venture ' +
    'now returns applies:false. S3 CLOSED both polarities (live stage 99 -> indeterminate; live stage 20 ' +
    'present-but-unmarked -> applies:false). S4 CLOSED as to honesty: the PASS reason no longer claims ' +
    '"confirmed against live origin" and the doc-block now states the caller-supplied-literal limit ' +
    'explicitly; a fabricated self-consistent nonce pair was confirmed to still pass, matching the new wording. ' +
    'S5 NOT CLOSED: computeSubstantiveEvidenceHash moved from "zero callers" to "one consumer with zero ' +
    'producers". priorRunEvidenceHash has no producer anywhere outside tests, and the only production ' +
    'caller of completeSession (lib/apa/journey-walk-orchestrator.js:100) calls completeSession(testRun.id) ' +
    'with no controlPackEvidence at all. Verified: two byte-identical runs with no priorRunEvidenceHash ' +
    'produce the identical evidence_hash and BOTH read GREEN. The in-code comment at result-recorder.js:477 ' +
    '("wired here as an actually-exercised control") is unverified prose -- and contradicts the same ' +
    'commit\'s own "Not fixed here" paragraph. NEW-1 (HIGH, measured live): bumpVentureFailureOccurrence ' +
    'is an unguarded read-modify-write on a shared row; 11 increments (1 serial + 10 concurrent) for one ' +
    'venture produced a stored count of 3 -- 8 lost updates -- reproducing S1\'s exact harm (ceiling ' +
    'silently under-counts, never escalates) probabilistically. NEW-2 (MEDIUM->HIGH by class): the S2 fix ' +
    'made an ABSENT ventures row fail OPEN (applies:false, satisfied:true) with a reason string that ' +
    'misattributes it to "has not opted in". Verified live against a ghost UUID, with checkSyntheticActorFencing ' +
    'run on the SAME ghost UUID as a control -- it returns applies:true, satisfied:false, "no ventures row ' +
    'found (fail-closed)". That is SEC-51, the precedent the same commit cites four lines earlier for S3. ' +
    'The fail-open is PINNED by tests/unit/eva/uat-robustness-gate.test.js:70, whose title frames it as ' +
    '"S2 fix"; a mutation restoring SEC-51 polarity fails exactly that one test (9 others still pass). ' +
    'NEW-3 (MEDIUM): checkFailureCeiling now scans all open factory_defect rows with .limit(500), no ' +
    '.order(), summing client-side -- demonstrated to return count 0 / shouldEscalate false at 501 rows. ' +
    'NEW-4 (HIGH, latent): the FR-1 gate accepts run.metadata.quality_gate===\'GREEN\' without requiring ' +
    'that ANY FR-2 control ran. completeSession(runId, {}) executes zero controls and writes GREEN ' +
    '(verified), and that is exactly the call form the one production UAT producer uses -- green-while-' +
    'testing-nothing is still reachable through the gate built to stop it. NEW-5 (MEDIUM): no staleness ' +
    'bound on the accepted run, unlike synthetic-actor-guard.js\'s STALENESS_WINDOW_MS + tip-of-main check. ' +
    'MEASURED NEGATIVE on the untrusted-write question: neither ventures.metadata nor feedback.metadata is ' +
    'writable by anon or authenticated. Probed under SET LOCAL ROLE inside BEGIN/ROLLBACK with ' +
    'row_security_active() asserted true and a bypassrls control proving the same statement affects 1 row: ' +
    'ventures UPDATE = 1 row as postgres/service_role, 0 rows as authenticated/anon; feedback UPDATE ' +
    'identical; feedback INSERT of a factory_defect row refused 42501 for both (no permissive INSERT policy ' +
    'exists for anon/authenticated). So the new uat_robustness_probe_required flag adds NO new untrusted-write ' +
    'surface -- it is service-role-only, the same posture synthetic-actor-guard.js already relies on for ' +
    'uat_probe_required. S6/S7/S8 re-checked and still accurately LOW, with caveats recorded below. ' +
    'ZERO CURRENT PRODUCTION EXPOSURE for every finding: the FR-1 gate is dead on three independent axes ' +
    '(no venture_stages row carries metadata.gates.uat_robustness_required -- verified across all 26 rows; ' +
    '0 of 152 ventures carry uat_robustness_probe_required; the LEO_UAT_ROBUSTNESS_GATE_ENFORCE flag row ' +
    'does not exist in leo_feature_flags because migration 20260825_register_uat_robustness_gate_enforce_flag.sql ' +
    'is unapplied), and FR-4 (triageUatFailure/checkFailureCeiling) has zero production callers. ' +
    '62/62 unit tests pass across the 7 suites this SD touches.',
  critical_issues: [],
  recommendations: [
    'BLOCKING BEFORE ANY PRODUCTION CALLER OF FR-4 (NEW-1, HIGH): replace bumpVentureFailureOccurrence\'s read-modify-write with an atomic operation. Measured live: 11 increments for a single venture on one shared row stored 3. A Postgres RPC doing `update feedback set metadata = jsonb_set(metadata, \'{uat_venture_occurrences,<vid>}\', to_jsonb(coalesce((metadata#>>\'{uat_venture_occurrences,<vid>}\')::int,0)+1)) where id = $1` is atomic; the current JS round-trip cannot be. Until then the S1 fix under-counts exactly when failures arrive fastest.',
    'BLOCKING BEFORE LEO_UAT_ROBUSTNESS_GATE_ENFORCE IS EVER TURNED ON (NEW-2, MEDIUM->HIGH by class): add `if (!ventureRow) return { applies: true, satisfied: false, indeterminate: true, reason: ... }` before the opt-in check in lib/eva/uat-robustness-gate.js:83, matching synthetic-actor-guard.js:161-172 (SEC-51). Then DELETE or invert tests/unit/eva/uat-robustness-gate.test.js:70 -- as written it pins the fail-open and labels it a fix. A mutation restoring SEC-51 polarity fails only that test.',
    'BLOCKING BEFORE ENFORCE (NEW-4, HIGH latent): checkUatRobustnessGate must require positive evidence that the control pack RAN, not just quality_gate===\'GREEN\'. quality_gate is GREEN by default from pass-rate math alone; completeSession(runId) with no controlPackEvidence -- the exact form journey-walk-orchestrator.js:100 uses -- produces it. Require at minimum run.metadata.evidence_hash !== null AND an explicit run.metadata.control_pack_applied marker written by completeSession, so an evidence-free run is distinguishable from a controlled one.',
    'S5 (still open): either wire a real producer for controlPackEvidence.evidenceManifest/priorRunEvidenceHash, or correct the comment at lib/uat/result-recorder.js:476-480. "Wired here as an actually-exercised control" is false in production today and contradicts the same commit\'s own disclosure. Also note the control is opt-in-by-caller: omitting priorRunEvidenceHash silently disables it, and completeSession(id, {}) runs zero controls and reads GREEN (verified). S4 got an honest doc-block for exactly this class of limit; S5 should get the same.',
    'S4 residual: generateProbeNonce() was added with zero callers -- the same "defined, unit-tested, never called" shape that S5 was raised about. Either wire it into the live-write caller when that lands or label it explicitly as not-yet-reached, so the next reviewer does not read it as a shipped control.',
    'NEW-3 (MEDIUM): drop the unordered .limit(500) client-side scan in checkFailureCeiling. Filter server-side to the rows that can possibly matter, e.g. .not(`metadata->uat_venture_occurrences->${ventureId}`, \'is\', null), so the ceiling cannot be silently suppressed by unrelated open factory-defect rows. Demonstrated: at 501 open rows the target venture reads count 0.',
    'NEW-5 (MEDIUM): bound the accepted UAT run by age and/or deployment sha. synthetic-actor-guard.js already established this (STALENESS_WINDOW_MS plus a tip-of-main head_sha comparison, its round-5/SEC-64 findings); this gate accepts a GREEN run of unlimited age. This gate imports that module\'s return shape and cites its findings, but not its hardening.',
    'NEW-6 (LOW): bumpVentureFailureOccurrence discards the update result entirely -- a failed write is indistinguishable from a successful one and silently under-counts the ceiling. Best-effort is defensible; silent best-effort on a safety counter is not. Log on error at minimum.',
    'S8 (LOW, characterization caveat): description is unvalidated in BOTH recorders while title is validated. Verified: description null/number/object all throw TypeError. triageUatFailure passes failure.description straight through, so a null description crashes the sole FR-4 entrypoint and the defect goes unrecorded. Severity is still LOW but the blast radius is "recorder throws exactly when it is needed", not a cosmetic validation gap.',
    'S7 (LOW): database/migrations/20260825_register_uat_robustness_gate_enforce_flag.sql is NOT applied -- no LEO_UAT_ROBUSTNESS_GATE_ENFORCE row exists in leo_feature_flags (LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE does). Absent flag reads as observe-only, so this is safe today, but the enforcement path is unreachable by construction until it lands.',
    'S6 (LOW): getSignedOutJourneySteps returns [] for any unregistered venture (only ALTIFYAI is registered) -- verified. Zero production callers today, so still LOW; whichever caller wires it must treat an empty step list as a failure, not as coverage. buildSignedOutStepExecutor correctly fails honestly for an unmapped step.',
    'Consider recording, in the SD\'s own retrospective, that this fix commit reproduced two of the defect classes it was closing: NEW-2 re-opened the SEC-51 polarity bug in the same commit that cites SEC-51 as precedent, and generateProbeNonce reproduced S5\'s dead-control shape while fixing S5.',
  ],
  metadata: {
    review_round: 2,
    review_type: 'adversarial_independent_reverification',
    fix_commit_under_review: 'b6c5f373f66e01e75a8e8f43647af84019e4a4c3',
    branch: 'feat/SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C',
    round_1_evidence_row_persisted: false,
    prior_findings_status: {
      S1_ceiling_could_never_escalate: 'CLOSED -- live end-to-end reproduction, real feedback rows, cleaned up (0 factory_defect rows remain)',
      S2_fleet_wide_per_stage_applies: 'CLOSED for its stated problem, but introduced NEW-2 (absent ventures row fails open)',
      S3_missing_venture_stages_row_failed_open: 'CLOSED -- verified live on both polarities (stage 99 absent -> indeterminate; stage 20 present-unmarked -> applies:false)',
      S4_assertLiveDeploymentBinding_overclaimed: 'CLOSED as to honesty of wording; residual: generateProbeNonce has zero callers',
      S5_computeSubstantiveEvidenceHash_dead: 'NOT CLOSED -- relocated. Consumer exists, producer does not. In-code comment overclaims.',
      S6_signed_out_satisfied_by_absence: 'UNFIXED, correctly LOW (verified: [] for unregistered venture, zero production callers)',
      S7_migration_not_applied: 'UNFIXED, correctly LOW (verified: flag row absent from leo_feature_flags)',
      S8_description_type_validation: 'UNFIXED, severity still LOW but blast radius understated (verified: null/number/object all throw)',
    },
    new_findings: {
      'NEW-1_HIGH_lost_update_race': {
        location: 'lib/eva/uat-failure-triage.js:75-81 bumpVentureFailureOccurrence',
        measurement: '1 serial + 10 concurrent triageUatFailure calls for one venture on one shared row -> stored uat_venture_occurrences = 3 (expected 11); 8 increments lost',
        harm: 'reproduces S1 harm probabilistically -- the ceiling under-counts and escalation is delayed or never fires',
        exposure_today: 'zero -- triageUatFailure has no production callers',
      },
      'NEW-2_MEDIUM_HIGH_absent_ventures_row_fails_open': {
        location: 'lib/eva/uat-robustness-gate.js:83',
        measurement: 'ghost UUID + stage marker stubbed true -> {applies:false, satisfied:true, reason:"venture has not opted into..."}; checkSyntheticActorFencing on the SAME ghost UUID -> {applies:true, satisfied:false, reason:"no ventures row found (fail-closed)"}',
        contradicts: 'synthetic-actor-guard.js:161-172 SEC-51, cited by this same commit as the precedent for its S3 fix',
        pinned_by_test: 'tests/unit/eva/uat-robustness-gate.test.js:70 -- mutation restoring SEC-51 polarity fails exactly that 1 test, 9 others pass',
        secondary: 'the reason string misattributes a nonexistent venture to "has not opted in"',
      },
      'NEW-3_MEDIUM_unordered_capped_scan': {
        location: 'lib/eva/uat-failure-triage.js:90-99 checkFailureCeiling',
        measurement: '.limit(500), no .order(), client-side sum -> at 501 open factory_defect rows the target venture reads count:0 shouldEscalate:false',
        live_row_count_today: 0,
      },
      'NEW-4_HIGH_latent_gate_accepts_evidence_free_green': {
        location: 'lib/eva/uat-robustness-gate.js:110-125 vs lib/uat/result-recorder.js:439-488',
        measurement: 'completeSession(runId, {}) runs zero controls and writes quality_gate=GREEN; the gate requires only status===completed && quality_gate===GREEN',
        note: 'journey-walk-orchestrator.js:100 -- the one production UAT-run producer -- calls completeSession(testRun.id) with no evidence',
      },
      'NEW-5_MEDIUM_no_staleness_bound': {
        location: 'lib/eva/uat-robustness-gate.js:88-101',
        note: 'accepts the latest completed run at any age; synthetic-actor-guard.js bounds this with STALENESS_WINDOW_MS + a tip-of-main head_sha check (its round-5 / SEC-64 findings)',
      },
      'NEW-6_LOW_silent_bookkeeping_failure': {
        location: 'lib/eva/uat-failure-triage.js:80 -- update result never inspected',
      },
    },
    untrusted_write_surface_probe: {
      method: 'SET LOCAL ROLE inside BEGIN/ROLLBACK, row_security_active() asserted true, bypassrls control proving the same statement affects 1 row. No COMMIT issued anywhere.',
      ventures_update_metadata: { postgres_bypassrls: '1 row', service_role: '1 row', authenticated: '0 rows', anon: '0 rows' },
      feedback_update_metadata: { postgres_bypassrls: '1 row', authenticated: '0 rows', anon: '0 rows' },
      feedback_insert_factory_defect: { anon: 'REFUSED 42501', authenticated: 'REFUSED 42501' },
      cause: 'ventures has only a service_role ALL policy plus an authenticated SELECT policy; feedback has no permissive INSERT/UPDATE policy for anon or authenticated',
      conclusion: 'the new ventures.metadata.uat_robustness_probe_required flag introduces NO new untrusted-write surface; same posture synthetic-actor-guard.js already relies on for uat_probe_required',
      incidental: 'scripts/anon-write-contract-probe.mjs asserts a bare anon INSERT into public.feedback LANDS; under this probe it was refused 42501. That standing assertion may be stale -- flagged, not investigated (different SD).',
    },
    dead_by_construction_axes: {
      stage_marker_present_on_any_of_26_venture_stages_rows: false,
      ventures_opted_in_of_152: 0,
      leo_feature_flags_row_LEO_UAT_ROBUSTNESS_GATE_ENFORCE_exists: false,
      fr4_production_callers: 0,
      conclusion: 'every finding in this review has zero current production exposure; all are latent until child B lands the stage and the flag is enabled',
    },
    verification_artifacts: {
      live_s1_reproduction: 'created 1 shared factory_defect row + 1 venture_defect row, exercised 8 triage calls across 2 ventures, deleted both, verified 0 factory_defect rows remain',
      mutation_test: 'restored SEC-51 polarity in uat-robustness-gate.js -> 1 failed / 9 passed; file restored, git status clean',
      unit_tests: '62/62 passing across 7 suites (uat-robustness-gate, uat-failure-triage, uat-control-pack, result-recorder-control-pack, venture-defect-recorder, venture-defect-class, venture-step-executors-signed-out)',
    },
    security_checklist: {
      authentication_mechanism: 'n/a -- service-role internal gate, no user-facing auth surface',
      authorization_model: 'RLS verified: ventures and feedback are service-role-write-only; measured with bypassrls control',
      rls_enabled_on_touched_tables: { ventures: true, feedback: true, venture_stages: true, uat_test_runs: true },
      secrets_in_code: 'none introduced; LEO_ALTIFYAI_UAT_READ_TOKEN / VENTURE_UAT_TEST_ACCOUNT_* read from env only',
      input_validation: 'title validated in both recorders; description NOT validated (S8)',
      sql_injection: 'n/a -- PostgREST parameterized builders throughout; no string-concatenated SQL added',
      fail_closed_polarity: 'correct for venture_stages read errors, venture_stages absent rows, ventures read errors and malformed UUIDs; INCORRECT for an absent ventures row (NEW-2)',
    },
  },
  execution_time_ms: 1_980_000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'SECURITY',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'SECURITY',
  SD_ID,
  { name: 'Chief Security Architect' },
  results,
  { phase: PHASE, source: 'manual' },
);

console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || PHASE));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
