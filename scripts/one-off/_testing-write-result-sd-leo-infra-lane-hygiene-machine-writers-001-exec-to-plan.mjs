#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent EXEC-TO-PLAN (post-implementation) verdict for
 * SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001.
 * Canonical evidence path per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';

const SD_ID = '7e67cfe7-d71d-48d4-8d84-fbc500ff4240';
const SD_KEY = 'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';

const findings = [
  {
    id: 'T-1-regression-suite-re-run-independently-131-of-131-green',
    severity: 'INFO',
    summary: 'RE-RAN, NOT TRUSTED. npx vitest run over the 10 affected suites (the PLAN baseline set plus the two new/most-relevant files) => 10 files / 131 tests / 131 passed / 0 failed (2.95s). Consistent with the PLAN baseline of 123 across the same 10 slots plus the 8 net-new tests this SD added. NOTE: the commit message 180-file / 2,394-test regression sweep was NOT re-verified (out of proportion to the change) and is therefore an UNVERIFIED claim in this evidence row, not a confirmed one. Also note --reporter=basic no longer exists in vitest 4.1.4 (startup error); the default reporter was used.'
  },
  {
    id: 'T-2-RED-control-math-independently-recomputed-against-the-real-gauge',
    severity: 'INFO',
    summary: 'DID NOT ASSUME THE TEST OWN ARITHMETIC. Executed lib/coordination/lane-lint-gauge.cjs computeRowViolationCounts() directly (outside vitest) against a hand-built stripped-fixture equivalent of the six writer shapes: {untyped_row:6, bodyless_row:0, empty_sender_row:5} — byte-for-byte the numbers the RED control asserts. Traced isUntypedRow/isEmptySenderRow at source to confirm WHY: all six lose payload.kind so all six count untyped; five of six also lose sender_session with a sender_type NOT in LEGITIMATE_EMPTY_SENDER_TYPES=[sweep,system]; the npm-install-lock row is genuinely exempt because lib/npm-install-lock.cjs really does write sender_type:"system" (verified at source ~line 86), so the fixture claim is accurate and not a convenient assumption. bodyless_row is 0 because isBodylessRow early-returns false on an untyped row (no double-count) — the RED control therefore cannot accidentally satisfy itself through the bodyless class. The control is genuinely discriminating.'
  },
  {
    id: 'T-3-classguard-lint-38-vs-38-identical-file-set-pragma-adjacency-confirmed-intact',
    severity: 'INFO',
    summary: 'RE-RAN BOTH SIDES. node scripts/lint/session-coordination-insert-classguard-lint.mjs --all --json in the worktree at 66b336647f5: violations=38, blocking=false. Same command in the main repo (HEAD 94271b4c8b2, this SD not merged): violations=38. Compared the FULL sorted file:line lists, not just the counts — the file SETS are identical; only line numbers shift (scripts/stale-session-sweep.cjs 2161->2166, 2265->2272, scripts/fleet-dashboard.cjs 1718->1722) consistent with the added comment blocks. Decisively: neither scripts/assign-fleet-identities.cjs nor scripts/periodic-liveness-watcher.mjs appears in EITHER list, which is the direct proof that the eslint-disable-next-line pragmas at both files remain adjacent to their insert statements and are still suppressing. The commit message 38 before/after claim is CONFIRMED by independent measurement.'
  },
  {
    id: 'T-4-DRAIN_SETS-change-is-purely-additive-no-other-kind-regressed',
    severity: 'INFO',
    summary: 'SPOT-CHECKED BY EXECUTION. classifyCoordinationRow() over 10 kinds: worker_signal=actionable (the new path), adam_advisory/coordinator_request/solomon_consult/fence_notice/signal_receipt/SET_IDENTITY all still actionable, roll_call still informational, an unregistered kind still unrecognized (the discriminating control — the classifier can still say "I do not know"). Per-role: worker_signal is present in DRAIN_SETS.coordinator (29 kinds), .solomon (21), .michael (19), .adam (31) and correctly ABSENT from .worker (26) — matching the migration stated rationale that worker-signal.cjs never targets the worker role. Nothing was removed from any set.'
  },
  {
    id: 'T-5-no-downstream-kind-keyed-reader-regressed-by-newly-stamping-previously-untyped-rows',
    severity: 'INFO',
    summary: 'THE NON-OBVIOUS BLAST RADIUS, CHECKED EXPLICITLY. Stamping payload.kind onto rows that previously had NONE can silently flip any reader whose filter is null-tolerant. Enumerated every such reader via git grep and evaluated each: (a) lib/coordinator/adam-identity.cjs:311 and scripts/coordinator-hourly-review.cjs:622 use .or(payload->>kind.is.null, payload->>kind.not.in.(ADAM_EXCLUDED_KINDS)) — verified by execution that NONE of the five new kinds (SET_IDENTITY, worker_signal, node_modules_lock, stale_heartbeat_warning, periodic_liveness_flag) is in ADAM_EXCLUDED_KINDS=[canary_request,comms_check,ack,coordinator_ack,cross_party_ping], so every affected row is still KEPT by the not.in leg exactly as it was by the is.null leg. (b) scripts/hooks/coordination-inbox.cjs:672 excludes only oldestBatchExcludedKinds()=["coordinator_reply"] (read at source, line 304) — no overlap. (c) lib/coordinator/dispatch.cjs assertSendBackpressure: the worker-signal exemption survives because the signal_type leg (~line 1085) still fires after the kind leg misses; worker_signal is deliberately not in BACKPRESSURE_EXEMPT_KINDS. (d) lib/npm-install-lock.cjs findActiveLock still matches on lock_type/status, untouched. No regression found.'
  },
  {
    id: 'T-6-latent-UNCLAIMED-fix-signal-to-adam-was-previously-REFUSED-and-now-succeeds',
    severity: 'MEDIUM',
    summary: 'FOUND BY EXECUTION, NOT CLAIMED BY THE COMMIT. lib/coordinator/dispatch.cjs:1301-1317 refuses any Adam-directed send whose payload.kind is untyped/unknown (DISPATCH_UNTYPED_ADAM_KIND, fail-CLOSED). Executed scripts/adam-advisory.cjs isReplyRow/isAdamInboxRow/EXCLUDED_KINDS against the exact pre- and post-fix worker-signal row shapes: PRE (payload={signal_type:stuck,...}, no kind) => isAdamInboxRow=false => REFUSED=true. POST (payload={kind:"worker_signal",signal_type:"stuck",...}) => isAdamInboxRow=true => REFUSED=false. So /signal --to adam was BROKEN before this SD and is FIXED by it. This is a real behaviour change in the friction channel, in the good direction, but it is neither described in the commit message nor covered by any test in this SD. Recommend a regression test pinning it so a future kind rename does not silently re-break the Adam signal lane.'
  },
  {
    id: 'T-7-DEFECT-stale-code-comment-now-asserts-something-false',
    severity: 'LOW',
    summary: 'REAL DOC DEFECT, NOT COSMETIC. lib/coordinator/dispatch.cjs (QF-20260902-962 block, ~lines 1079-1081) states verbatim: "the WORKER_SIGNAL friction lane (scripts/worker-signal.cjs) never sets payload.kind — it keys on payload.signal_type". As of this commit that is FALSE. The comment is the load-bearing documented RATIONALE for why the backpressure exemption is keyed on signal_type rather than kind; leaving it stale invites a future maintainer to simplify the signal_type leg away on the (now-wrong) belief that kind is absent, which would re-throttle the friction channel — the exact failure QF-20260902-962 was filed to prevent. scripts/worker-signal.cjs own new comment does cross-reference this site, but the site itself was not updated. One-line fix.'
  },
  {
    id: 'T-8-DEFECT-FR-2-sender_session-fix-is-conditional-on-an-env-var-and-untested-in-its-null-branch',
    severity: 'MEDIUM',
    summary: 'THE ONE PLACE THE FIX MAY NOT ACTUALLY LAND. Both SET_IDENTITY insert sites write sender_session: _mySessionId || null. Traced _mySessionId to lib/coordinator-mutation-guard.mjs resolveOwnSessionId(), which returns process.env.CLAUDE_SESSION_ID, else the session_id from <repo>/.claude/session-id.json, else NULL. Measured: that file DOES NOT EXIST in the repo root (verified by ls), so the fix rests entirely on CLAUDE_SESSION_ID. It IS set in an interactive Claude Code session (confirmed live in this shell). But guardMutation FAILS OPEN when the session id is null (no_session_id_fail_open, assertCanonicalCoordinator ~line 69) — so a scheduled-task/cron invocation of assign-fleet-identities.cjs without that env var proceeds and writes sender_session NULL, leaving the SET_IDENTITY empty_sender_row class (162 rows — the LARGEST contributor in the SD own baseline measurement) entirely unfixed while payload.kind still lands. This is the difference between the projected ~24/1609 residual and a materially worse one. NOT COVERED BY ANY TEST: the census guard pins the source literal "sender_session: _mySessionId || null", which passes identically whether the value resolves or is null. Recommend either (a) confirming the production invocation path exports CLAUDE_SESSION_ID, or (b) falling back to a named principal (e.g. "assign-fleet-identities", the pattern this same SD used for the other three writers) instead of null, plus a unit test on the null branch.'
  },
  {
    id: 'T-9-DEFECT-the-new-try-catch-cannot-catch-what-the-commit-message-says-it-catches',
    severity: 'LOW',
    summary: 'COMMIT-MESSAGE ACCURACY DEFECT. The message says the rebroadcast insert was "wrapped in try/catch so one insert failure cannot abort the naming loop". supabase-js .insert() RESOLVES with {data,error} on a DB error; it rejects only on transport/client faults. The awaited expression result is not destructured or checked at all at that site, so a genuine insert failure (RLS refusal, constraint violation) is silently swallowed and refreshed++ still increments — the loop was never at risk of aborting from that class in the first place. The catch is not harmful and does cover transport faults, but the stated protection is largely illusory and the console.error will not fire for the failure mode a reader would expect. Low severity because the PRIOR code also ignored the error; this is a no-worse change with an over-claiming message.'
  },
  {
    id: 'T-10-migration-and-registry-artifacts-verified-correct-and-correctly-unapplied',
    severity: 'INFO',
    summary: 'database/migrations/20260906_role_drain_sets_add_worker_signal.sql carries "@approved-by: PENDING — chairman-gated apply required" and inserts 4 rows with ON CONFLICT (role, kind, direction) DO NOTHING. Verified against the real DDL at database/migrations/20260720_role_drain_sets_STAGED.sql:38 — CONSTRAINT role_drain_sets_role_kind_direction_key UNIQUE (role, kind, direction) exists, and direction is NOT NULL DEFAULT inbound (line 33), so the omitted direction column resolves and the ON CONFLICT target is valid. tests/unit/fleet/drain-set-registry.test.js seed-parity count was correctly bumped 106->109 (not 110) with the michael row excluded from the (solomon|adam|coordinator|worker) regex — the test comment explains this and the suite passes. The lib/governance/orphan-writers-registry.js entry is well-formed and its test passes. sender_session accepting a non-UUID literal (stale-session-sweep, periodic-liveness-watcher, fleet-dashboard) is backed by shipped precedent: lib/coordinator/adam-action-ack.cjs:289 writes sender_session:sweep and lib/periodic-liveness/owner-directive-writer.mjs:45 writes periodic-liveness-watcher today. Direct DDL confirmation of the column type was NOT possible (session_coordination is RLS-denied to this client and no exec_sql RPC exists) — recorded as inference-from-precedent, not measurement.'
  },
  {
    id: 'T-11-all-six-writer-sites-read-in-full-and-confirmed-genuinely-wired',
    severity: 'INFO',
    summary: 'READ THE SURROUNDING CODE, NOT JUST GREPPED. FR-2 assign-fleet-identities.cjs: BOTH insert sites stamped — the rebroadcast site (~line 686) inline, and the new-assignment site (~line 796) via buildIdentityMessage(), whose BOTH branches (first-assignment and rename) now carry kind=SET_IDENTITY; casing matches the DRAIN_SETS.worker literal and the orphan-reroute-sweep.js expectation; both branches already carry a non-empty body so no bodyless_row is created. FR-3 worker-signal.cjs: kind is additive at the top of the payload object, signal_type retained, routed through insertCoordinationRow (not a raw insert) at ~line 739. FR-4 stale-session-sweep.cjs: both signal_resolved sites changed from sender_session:null to stale-session-sweep with sender_type deliberately left coordinator — I confirmed by grep that the retarget-rescue readers filter on sender_type, not sender_session, and found no reader anywhere filtering sender_session IS NULL on this row class. FR-5 periodic-liveness-watcher.mjs: BOTH emitOverdueSignal and emitPersistentUnverifiedSignal gained sender_session AND a one-line body (the latter had zero prior test coverage, now covered — watcher-emit-overdue-signal.test.js grew by 51 diff lines and passes). FR-6 npm-install-lock.cjs and fleet-dashboard.cjs: kind added; dashboard additionally gained sender_session=fleet-dashboard because sender_type dashboard is NOT in LEGITIMATE_EMPTY_SENDER_TYPES (correct reasoning, verified against the gauge constant).'
  },
];

const warnings = [
  'The commit message headline verification claim — 180-file / 2,394-test regression sweep, all green — was NOT reproduced by this review. Only the 10-suite / 131-test affected set was re-run. Treat the 180-file figure as unverified.',
  'FR-2 sender_session fix silently degrades to NULL whenever CLAUDE_SESSION_ID is unset and .claude/session-id.json is absent (the file does not exist in this repo). The largest violating row class in the SD own baseline (162 SET_IDENTITY rows) is the one exposed to this. See T-8.',
  'lib/coordinator/dispatch.cjs now contains a comment asserting worker-signal.cjs never sets payload.kind, which this commit made false. See T-7.',
  'The exit predicate (lane-lint-gauge-cron green for two consecutive weekly runs) is OPERATIONAL and cannot be verified at handoff time. The projected ~1.5 percent residual is a projection, not a measurement, and is sensitive to T-8.',
];

const recommendations = [
  'Non-blocking follow-up (one line): update the stale QF-20260902-962 comment in lib/coordinator/dispatch.cjs so it says worker-signal.cjs stamps kind=worker_signal AND keys on signal_type, and that the signal_type exemption leg must not be removed.',
  'Non-blocking follow-up: replace sender_session: _mySessionId || null with a named-principal fallback (e.g. _mySessionId || "assign-fleet-identities"), matching the pattern this same SD already used for stale-session-sweep / periodic-liveness-watcher / fleet-dashboard, and add a unit test on the null branch.',
  'Consider a regression test pinning the newly-working /signal --to adam path (T-6), since it is now behaviourally load-bearing and undocumented.',
  'At the two-week gauge check, confirm the SET_IDENTITY empty_sender_row count actually dropped — that is the single measurement that discriminates T-8 being benign from T-8 being the difference between 1.5 percent and a materially higher residual.',
];

const summary = 'EXEC-TO-PLAN TESTING (post-implementation, adversarial re-check) for SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 at 66b336647f5: CONDITIONAL_PASS (confidence 88). EVERY CLAIM I COULD RE-MEASURE, I RE-MEASURED, AND THEY HELD. (1) Regression: re-ran the 10 affected suites myself => 10 files / 131 tests / 131 passed / 0 failed, consistent with the PLAN baseline of 123 plus this SD 8 net-new tests. The commit separate 180-file / 2394-test claim was NOT reproduced and is recorded as unverified. (2) RED control: I recomputed the fixture arithmetic by executing lane-lint-gauge.cjs computeRowViolationCounts() directly on a stripped-row equivalent OUTSIDE vitest => {untyped_row:6, bodyless_row:0, empty_sender_row:5}, exactly what the test asserts, and I traced isUntypedRow/isEmptySenderRow at source to confirm the reasoning (the npm-install-lock row is genuinely exempt because that writer really does set sender_type=system). The control is discriminating, not vacuous. (3) Classguard: re-ran --all --json on BOTH sides — 38 in the worktree, 38 on main — and I diffed the full sorted file:line lists rather than just the counts. The file sets are identical (line shifts only), and neither assign-fleet-identities.cjs nor periodic-liveness-watcher.mjs appears in either list, proving the eslint-disable pragmas are still adjacent and suppressing. (4) DRAIN_SETS: purely additive — a 10-kind classification spot-check shows every pre-existing kind classifies as before and an unregistered kind still returns unrecognized; worker_signal is in coordinator/solomon/michael/adam and correctly absent from worker. (5) I then went looking for the non-obvious blast radius nobody named: newly stamping kind onto previously-untyped rows can flip any null-tolerant reader. I enumerated all of them (adam-identity.cjs:311, coordinator-hourly-review.cjs:622, coordination-inbox.cjs:672, dispatch.cjs assertSendBackpressure) and confirmed none regress — none of the five new kinds is in ADAM_EXCLUDED_KINDS, and the backpressure signal_type leg still fires. THREE GENUINE FINDINGS, none blocking. T-8 (MEDIUM, the material one): FR-2 sender_session fix is _mySessionId || null, and _mySessionId resolves from CLAUDE_SESSION_ID else .claude/session-id.json — which DOES NOT EXIST in this repo. The guard fails OPEN on a null session id, so any non-interactive (cron/scheduled-task) invocation writes sender_session NULL and leaves the 162-row SET_IDENTITY empty_sender_row class — the largest single contributor in the SD own baseline — completely unfixed, while the census test passes either way because it only pins the source literal. Fix is one line and matches the named-principal pattern this same SD used for the other three writers. T-7 (LOW): lib/coordinator/dispatch.cjs still asserts in a comment that worker-signal.cjs never sets payload.kind — now false, and that comment is the documented rationale for the signal_type-keyed backpressure exemption a future maintainer might otherwise delete. T-9 (LOW): the new try/catch cannot catch what the commit message says it catches (supabase-js resolves {error} rather than rejecting, and the result is never checked). ONE UNCLAIMED WIN: by execution I found that /signal --to adam was previously REFUSED with DISPATCH_UNTYPED_ADAM_KIND and now succeeds, because isAdamInboxRow recognises kind=worker_signal — a real friction-channel fix this SD delivers, mentions nowhere, and pins with no test. CONDITIONAL_PASS rather than PASS solely on T-8 plus the unreproduced 180-file claim; the code is correct, the tests are real and discriminating, and nothing found blocks the handoff.';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      review_type: 'EXEC_TO_PLAN_POST_IMPLEMENTATION_VERIFICATION',
      mode: 'post-implementation',
      branch: 'feat/SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001',
      worktree_head: '66b336647f5f71ca609d893a1e9aa7acebcaf954',
      plan_phase_evidence_reviewed: '3e0331d8-68ac-4027-a43f-8c795de07d1c',
      regression_rerun: {
        command: 'npx vitest run <10 affected suites>',
        test_files: 10,
        tests_total: 131,
        passed: 131,
        failed: 0,
        duration: '2.95s',
        plan_baseline_for_same_slots: '123/123',
        files: [
          'tests/static-guards/session-coordination-writer-census.test.js',
          'tests/unit/assign-fleet-identities-rename-legibility.test.js',
          'tests/unit/coordination/kind-classification.test.js',
          'tests/unit/coordination/lane-lint-gauge.test.js',
          'tests/unit/coordinator/signal-resolved-disposition-path.test.js',
          'tests/unit/coordinator/signal-resolved-promotion-path.test.js',
          'tests/unit/fleet/drain-set-registry.test.js',
          'tests/unit/fleet/drain-sets-adam-reconciliation.test.js',
          'tests/unit/governance/orphan-writers-registry.test.js',
          'tests/unit/periodic-liveness/watcher-emit-overdue-signal.test.js'
        ],
        unverified_commit_claim: '180 files / 2394 tests — NOT re-run, out of proportion to the change'
      },
      red_control_independent_recomputation: {
        method: 'executed lib/coordination/lane-lint-gauge.cjs computeRowViolationCounts() directly outside vitest on a stripped-row equivalent',
        result: { untyped_row: 6, bodyless_row: 0, empty_sender_row: 5 },
        matches_test_assertion: true,
        why_bodyless_is_zero: 'isBodylessRow early-returns false on an untyped row (no double-count), so the control cannot self-satisfy via the bodyless class',
        why_five_not_six: 'lib/npm-install-lock.cjs genuinely writes sender_type=system, which is in LEGITIMATE_EMPTY_SENDER_TYPES — verified at source, not assumed'
      },
      classguard_lint: {
        worktree_head_violations: 38,
        main_baseline_violations: 38,
        blocking: false,
        comparison_method: 'full sorted file:line lists diffed, not just counts',
        file_sets_identical: true,
        line_shifts_only: ['scripts/stale-session-sweep.cjs 2161->2166', 'scripts/stale-session-sweep.cjs 2265->2272', 'scripts/fleet-dashboard.cjs 1718->1722', 'scripts/adam-coordinator-health.mjs 474->463'],
        pragma_adjacency_proof: 'neither scripts/assign-fleet-identities.cjs nor scripts/periodic-liveness-watcher.mjs appears in EITHER violation list'
      },
      drain_sets_spot_check: {
        worker_signal: 'actionable',
        adam_advisory: 'actionable',
        coordinator_request: 'actionable',
        solomon_consult: 'actionable',
        fence_notice: 'actionable',
        signal_receipt: 'actionable',
        SET_IDENTITY: 'actionable',
        roll_call: 'informational',
        directive: 'unrecognized (pre-existing, unchanged)',
        made_up_kind_xyz: 'unrecognized (discriminating control)',
        per_role_worker_signal: { coordinator: true, solomon: true, michael: true, adam: true, worker: false }
      },
      downstream_reader_blast_radius: {
        'lib/coordinator/adam-identity.cjs:311': 'or(payload->>kind.is.null, not.in(ADAM_EXCLUDED_KINDS)) — no new kind is in ADAM_EXCLUDED_KINDS, rows still kept',
        'scripts/coordinator-hourly-review.cjs:622': 'same filter shape — unaffected',
        'scripts/hooks/coordination-inbox.cjs:672': 'oldestBatchExcludedKinds() returns only [coordinator_reply] — no overlap',
        'lib/coordinator/dispatch.cjs assertSendBackpressure': 'worker_signal not in BACKPRESSURE_EXEMPT_KINDS, but the signal_type leg still fires — exemption preserved',
        'lib/coordinator/dispatch.cjs:1301 DISPATCH_UNTYPED_ADAM_KIND': 'BEHAVIOUR CHANGE (improvement): /signal --to adam was REFUSED pre-fix, now admitted — verified by executing isAdamInboxRow on both row shapes',
        'lib/npm-install-lock.cjs findActiveLock': 'matches on lock_type/status — untouched'
      },
      defects_found: [
        'T-8 MEDIUM: FR-2 sender_session degrades to NULL without CLAUDE_SESSION_ID; .claude/session-id.json does not exist; guard fails open; census test cannot detect it.',
        'T-7 LOW: lib/coordinator/dispatch.cjs comment now falsely asserts worker-signal.cjs never sets payload.kind — it is the documented rationale for the signal_type exemption.',
        'T-9 LOW: the new try/catch does not catch supabase-js DB errors (they resolve as {error}), and the result is never checked — commit message over-claims.'
      ],
      blocking_defects: [],
      not_verified: [
        'The 180-file / 2394-test regression sweep claimed in the commit message.',
        'session_coordination.sender_session column type (RLS-denied to this client; no exec_sql RPC) — inferred TEXT from shipped precedent lib/coordinator/adam-action-ack.cjs:289 sender_session=sweep.',
        'The operational exit predicate (lane-lint-gauge-cron green two consecutive weeks) — cannot be verified at handoff time.'
      ]
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    metadata: {
      test_execution: buildTestExecution({
        executed: 131,
        passed: 131,
        failed: 0,
        skipped: 0,
        artifactSha: 'f30478b934d6e6e10c8d693e6c873d65ea56e40402ed8301c670ea8ef2a3b343',
        runner: 'vitest 4.1.4 (npx vitest run --reporter=json)',
        artifactPath: '.artifacts/testing-lane-hygiene-exec-results.json',
        source: 'runner'
      }),
      measured: true
    }
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director (testing-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  created_at:', stored.created_at);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
