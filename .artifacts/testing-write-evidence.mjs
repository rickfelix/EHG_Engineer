import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_UUID = 'd084688a-7221-4e6f-9aa6-f5dab82fbb8a';
const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

const critical_issues = [
  {
    id: 'T-C1',
    severity: 'critical',
    title: 'FR-1 as scoped still emits a FALSE POSITIVE for every role seat at its FIRST SessionStart -- measured, not predicted',
    detail: "roleVerdictFor() is DB-first and returns WORKER (not UNKNOWN) whenever the claude_sessions row exists with NO metadata.role key (role-status-identity.cjs:110 comment: an ABSENT role key is a genuine worker signal). At SessionStart the row that exists is the one the hook ITSELF just wrote via upsertSessionRow -> buildSessionMetadata, which emits exactly {cc_pid, source, model, model_family, model_source, tier_rank} -- no role key. Role registration (scripts/adam-register.cjs:146, solomon-register.cjs:144, michael-register.cjs:173) and the coordinator is_coordinator stamp all run AFTER the session is up, so at first SessionStart a role seat is DB-indistinguishable from a worker. Because roleVerdictFor short-circuits on a non-UNKNOWN DB verdict, the .claude/fleet-identity-<id>.json fallback never runs -- and it would not help anyway, since writeRoleStatusIdentity also fires after startup. MEASURED via .artifacts/testing-freshseat-probe.cjs: buildSessionMetadata(undefined,4242,startup,claude-fable-5-1) -> verdictFromMetadata => worker, expected claude-opus-5 (opus) vs observed fable => WOULD SIGNAL = true. The chairman restarts all four role seats together, so this emits ~4 permanent false rows into an APPEND-ONLY table per restart cycle. Same defect class the corrected scope was written to close (coordinator false positive), one rung further in.",
    remediation: "PRD must add an explicit gate BEFORE signalling. Options in preference order: (a) signal only when data.source !== startup (resume/clear/compact only) -- by then registration has run and metadata.role/is_coordinator is present; (b) require an AFFIRMATIVE worker marker rather than key-absence; (c) skip the signal when the hooks own GET showed NO pre-existing row (brand-new session == unknowable). NOTE (b) has no carrier: build-session-launch.cjs sets FLEET_WORKER_ROLE in the child env, but capture-session-id.cjs cannot read it -- only six CLAUDE_-prefixed vars propagate to hook subprocesses (lib/hooks/session-id.cjs:36-42; build-session-launch.cjs:291 documents this as the reason FLEET_AUTORESUME_SD has zero readers). (a) or (c) are the implementable ones."
  },
  {
    id: 'T-C2',
    severity: 'critical',
    title: 'The test file the RISK agent named (M7) is NOT COLLECTED BY CI -- tests placed there cannot fail',
    detail: "RISK M7 says extend tests/unit/hooks/capture-session-id.test.cjs. MEASURED: the vitest unit project include is [**/__tests__/**/*.test.js, **/*.test.js, **/tests/unit/org/**/*.test.mjs, **/tests/unit/venture-email/**/*.test.mjs] -- .test.cjs is NOT matched. `npx vitest run --project unit tests/unit/hooks/capture-session-id.test.cjs` returns 'No test files found, exiting with code 1'. `npx vitest list --project unit tests/unit/hooks/` collects 29 of the 33 files present; the three .cjs files (capture-session-id.test.cjs, capture-session-id-upsert-retry.test.cjs, tool-timeout.test.cjs) are silently skipped. The CI job .github/workflows/hooks-harness-tests.yml:32 runs exactly `npm test -- tests/unit/hooks/` (npm test = vitest run --project unit), so those files have no CI signal at all. No npm script runs them under `node --test` either (test:session-tick / test:sd-key-generator-gate / test:adam-startup-check enumerate .mjs files only).",
    remediation: "Put every new FR-1 test in a NEW .test.js vitest file, e.g. tests/unit/hooks/capture-session-id-model-policy-signal.test.js. The working precedent for a SessionStart hook is the sibling tests/unit/hooks/session-role-orient-adam-branch.test.js (vitest + createRequire to load the .cjs hook). Do NOT add tests to the .cjs files. Separately worth a harness-backlog row: three existing hook suites are dark."
  },
  {
    id: 'T-C3',
    severity: 'critical',
    title: 'No testable seam exists: the logic as placed (inside main() stdin end handler) is unreachable from a unit test',
    detail: "capture-session-id.cjs exports only {selectAncestorFromChain, findClaudeCodePid, upsertSessionRow, buildSessionMetadata, resolveRepoRoot, findLiveTickPid}. main() is not exported and drives itself off process.stdin. Worse, the ONLY in-process kill switch that reaches the proposed insertion point is LEO_HOOK_DRY_RUN=1 -- and that branch does `resolve(); return;` at line ~776, BEFORE the tick-spawn block and therefore before the proposed insertion point, so a dry-run-driven subprocess test can never exercise the signal path at all. And the path must NEVER be exercised against the live DB: public.feedback is append-only (trigger confirmed live per VALIDATION/RISK) so a test row is permanent.",
    remediation: "FR-1 must export a dependency-injected function, e.g. async function signalModelPolicyMismatch({ sessionId, model, source, supabase, emit, now }) added to module.exports, called from main() inside its try/catch. Tests inject a fake emit and a fake supabase; main() passes the real ones. Required for FR-1 to be testable AT ALL, and it satisfies eslint-rules/no-mocked-sut-import (the SUT must not be vi.mock'd -- deps are injected instead)."
  }
];

const warnings = [
  { id: 'T-W1', severity: 'high', title: 'TWO different coarseModelAlias functions exist with opposite unknown-model behaviour', detail: "scripts/hooks/capture-session-id.cjs:347 returns `|| raw` (passthrough) for an unrecognized id; lib/fleet/model-policy.cjs:26 returns `|| null`. checkModelMismatch guards on observedAlias !== null. If FR-1 accidentally uses the hook LOCAL coarseModelAlias, an unrecognized model id compares unequal to opus and emits a FALSE mismatch. TEST REQUIRED: unrecognized model id => no signal." },
  { id: 'T-W2', severity: 'high', title: 'lib/governance/emit-feedback.js is ESM; the hook is CJS', detail: "package.json type=module, emit-feedback.js uses `export async function emitFeedback`. MEASURED: require() of it from CJS SUCCEEDS under this machine Node v24.12.0 (require(esm) stable >=22.12, module has no top-level await) yielding {ALLOWED_PRIORITIES, emitFeedback, emitFeedbackBatch}. This is node-version-dependent behaviour in a hook whose interpreter is chosen by Claude Code, so it must be (a) inside the fail-open try/catch around the require, exactly as session-role-orient.cjs:10-13 guards its own require, and (b) pinned by a test asserting the require resolves and exposes emitFeedback." },
  { id: 'T-W3', severity: 'medium', title: 'emitFeedback dedup is date-salted sha256(today::description::dedup_key) with SELECT-then-skip', detail: "emit-feedback.js:262-283 computes the hash, SELECTs on metadata->>dedup_hash and skips on hit -- insert-or-noop, no UPDATE anywhere, so it is append-only-trigger compatible as required. The dedup_key must be STABLE across two SessionStarts of the same seat on the same day: include session_id + observed family + expected family and NOTHING time-varying (exclude source; it differs between startup and resume). A test must drive emit twice with identical inputs and assert exactly one insert." },
  { id: 'T-W4', severity: 'medium', title: 'FR-2 needs no new columns: metadata is ALREADY in the dashboard select', detail: "scripts/fleet-dashboard.cjs:340 already selects ...,metadata and the merge at :347-362 already lifts t.metadata.model and t.metadata.effort. VALIDATION recommendation to add role/is_coordinator/non_fleet to the projection overstates the work -- pass t.metadata (or verdictFromMetadata(t.metadata)) through the SAME seam. No new query, no new columns." },
  { id: 'T-W5', severity: 'medium', title: 'FR-2 must not count seats whose telemetry merge failed', detail: "The telemetry merge at fleet-dashboard.cjs:330-345 is inside a try/catch that degrades silently (pre-migration clones have no telemetry columns). If it fails, every s.model is undefined. The off-policy count must treat an absent model as NOT off-policy (same posture as checkModelMismatch), otherwise a degraded read renders a fabricated number. Prefer rendering ? over 0 when the merge failed -- a guard may decline to run, but must never report a number it did not take." },
  { id: 'T-W6', severity: 'low', title: 'Line-tuple static guards checked -- clear', detail: "tests/unit/emit-feedback-bypass-static-guard.test.js enforces emit-feedback.js as the canonical feedback INSERT writer via a (path,line) OOS allowlist; neither capture-session-id.cjs nor fleet-dashboard.cjs appears in it, and using emitFeedback() (not a raw from(feedback).insert) adds no new bypass site, so it stays green. tests/static-guards/session-coordination-writer-census.test.js names fleet-dashboard.cjs by snippet, not line. No allowlist edits needed IF the implementation uses emitFeedback as specified." }
];

const recommendations = [
  { priority: 'critical', blocking: true, action: 'TC-FR1-01 FRESH ROLE SEAT (T-C1). Given the exact metadata buildSessionMetadata writes for a brand-new session on Fable, assert NO signal is emitted. This test FAILS against the currently-scoped design and is the acceptance test for whichever remediation PLAN picks.' },
  { priority: 'critical', blocking: true, action: 'TC-FR1-02 COORDINATOR SEAT. metadata {is_coordinator:true, model:claude-fable-5-1}, no role string => verdict role => expected fable => NO signal. Negative control for the exact live seat (3616c697) the naive predicate false-positived on.' },
  { priority: 'critical', blocking: true, action: 'TC-FR1-03 UNKNOWN VERDICT SILENCE. sessionId failing SESSION_ID_RE, and a supabase stub whose select() throws, both => roleVerdictFor unknown => NO signal and NO throw. Asserts the three-state gate rather than a two-state collapse.' },
  { priority: 'critical', blocking: true, action: 'TC-FR1-04 TRUE POSITIVE + SAME-DAY DEDUP. A genuine worker on claude-fable-5-1 => exactly ONE emit with the expected dedup_key; a second identical invocation => the injected emit records one insert and one dedup hit (assert via emitFeedback returned {deduped:true} shape, NOT by re-querying the live table).' },
  { priority: 'critical', blocking: true, action: 'TC-FR1-05 FAIL-OPEN UNDER FORCED THROW. Inject an emit that throws synchronously AND a supabase stub that rejects; assert the function resolves without throwing. Second layer: drive the hook end-to-end as a subprocess with the signal module unresolvable and assert stdout still contains CLAUDE_SESSION_ID=<id> and exit code 0. The observable contract is registration output unchanged, not no exception.' },
  { priority: 'critical', blocking: true, action: 'TC-FR1-06 NO-MODEL and UNRECOGNIZED-MODEL SILENCE (T-W1). model undefined => no signal. model claude-experimental-9 => no signal (proves model-policy.cjs coarseModelAlias is in use, not the hook-local passthrough variant).' },
  { priority: 'high', blocking: true, action: 'TC-FR1-07 BUDGET. Assert the abort deadline is <=1500ms by injecting a supabase/emit that never resolves and asserting the function settles under the deadline with fake timers. A source-text grep for 1500 is NOT acceptable evidence -- phrase-in-diff is not behaviour.' },
  { priority: 'high', blocking: true, action: 'TC-FR1-08 KILL SWITCH + PLACEMENT. LEO_MODEL_POLICY_SIGNAL=0 => no emit. Plus a placement assertion that the call site is AFTER upsertSessionRow: note LEO_HOOK_DRY_RUN=1 returns early at ~line 776 and therefore already skips the insertion point -- assert that explicitly so nobody fixes dry-run by moving the call earlier.' },
  { priority: 'critical', blocking: true, action: 'TC-FR2-01 HAND-COUNTED FIXTURE. Five sessions: worker-on-fable (off-policy), worker-on-opus (on), coordinator is_coordinator:true on fable (ON policy -- the trap row), solomon role on fable (on), one with model undefined (excluded). Hand-computed count = 1. Drive the EXPORTED printer (printWorkers / printAttentionStrip, both exported at fleet-dashboard.cjs:3448) with a mock d and assert the rendered count, following tests/unit/coordinator/fleet-dashboard-worker-enrichment.test.js. Do not test an unexported helper: a count computed then dropped at the reporting layer reads as absent.' },
  { priority: 'high', blocking: true, action: 'TC-FR2-02 DEGRADED-READ ABSTENTION (T-W5). Same fixture with the telemetry merge simulated as failed (no model on any row) => render abstention, not 0.' },
  { priority: 'critical', blocking: true, action: 'PLACEMENT: all new tests go in NEW .test.js files -- tests/unit/hooks/capture-session-id-model-policy-signal.test.js and tests/unit/coordinator/fleet-dashboard-seats-off-policy.test.js. NOT in any .test.cjs file (T-C2). Verify collection with `npx vitest list --project unit <file>` before claiming coverage.' },
  { priority: 'critical', blocking: true, action: 'SEAM: FR-1 must export signalModelPolicyMismatch({sessionId, model, source, supabase, emit, now}) from capture-session-id.cjs and inject supabase+emit (T-C3). Without this there is no way to test FR-1 that does not write permanent rows to the append-only feedback table.' },
  { priority: 'high', blocking: false, action: 'BASELINE: tests/unit/fleet/model-policy.test.js and tests/unit/role-status-identity.test.js are GREEN at HEAD (2 files, 16 tests, 638ms). Capture the full npm run test:unit baseline BEFORE implementing so pre-existing failures are not attributed to this SD.' },
  { priority: 'medium', blocking: false, action: 'EXEC-TO-PLAN readiness: SMOKE_TEST_SPECIFICATION needs runner-produced output. Run the new suites via npx vitest run --project unit <files> --reporter=json --outputFile=.artifacts/<sd>-testing.json and cite the file plus its hash in the TESTING verdict row. Per the chairman-ratified gate-evidence provenance rule, a hand-written pass claim is absent evidence.' }
];


const CONDITIONS = [
  { priority: 'critical', blocking: true, action: 'T-C1 -- PRD must add an explicit anti-false-positive gate before the signal fires (signal only on source!==startup, or only when the pre-existing-row GET found a row). Without it every role seat first SessionStart on Fable writes a permanent false row.' },
  { priority: 'critical', blocking: true, action: 'T-C3 -- FR-1 must export a dependency-injected signalModelPolicyMismatch({sessionId, model, source, supabase, emit, now}) from capture-session-id.cjs. Without a seam, FR-1 cannot be tested without writing permanent rows to the append-only feedback table.' },
  { priority: 'critical', blocking: true, action: 'T-C2 -- all new tests go in NEW .test.js files (tests/unit/hooks/capture-session-id-model-policy-signal.test.js, tests/unit/coordinator/fleet-dashboard-seats-off-policy.test.js). .test.cjs files in tests/unit/hooks/ are NOT collected by vitest and have no CI signal.' },
  { priority: 'high', blocking: true, action: 'FR-1 must use lib/fleet/model-policy.cjs coarseModelAlias (returns null on unknown), never the hook-local variant at capture-session-id.cjs:347 (passthrough on unknown, which false-positives).' },
  { priority: 'high', blocking: true, action: 'FR-2 must abstain (render ?, not 0) when the fleet-dashboard telemetry merge degrades, and must exclude sessions with no observed model from the off-policy count.' },
  { priority: 'medium', blocking: false, action: 'EXEC-TO-PLAN TESTING evidence must cite a runner-produced JSON results file plus its content hash, not a hand-written pass claim.' }
];
const JUSTIFICATION = "Prospective TESTING assessment performed by reading scripts/hooks/capture-session-id.cjs (main(), buildSessionMetadata, upsertSessionRow, module.exports), lib/fleet/model-policy.cjs, lib/fleet/role-status-identity.cjs (roleVerdictFor/verdictFromMetadata), lib/governance/emit-feedback.js, scripts/fleet-dashboard.cjs telemetry-merge seam and exports, lib/fleet/build-session-launch.cjs, lib/hooks/session-id.cjs env-propagation note, vitest.config.js project globs, .github/workflows/hooks-harness-tests.yml, and the VALIDATION/RISK prospective rows for this SD. Five LIVE measurements were taken rather than reasoned about: (1) .artifacts/testing-freshseat-probe.cjs fed the exact metadata buildSessionMetadata writes for a brand-new Fable session into verdictFromMetadata and got 'worker' -> WOULD_SIGNAL=true, proving the fresh-role-seat false positive; (2) npx vitest run --project unit on tests/unit/hooks/capture-session-id.test.cjs returned 'No test files found, exiting with code 1'; (3) npx vitest list --project unit tests/unit/hooks/ collected 29 of the 33 files present, omitting all three .cjs suites; (4) require() of the ESM lib/governance/emit-feedback.js from CJS succeeded on node v24.12.0; (5) the baseline suites tests/unit/fleet/model-policy.test.js and tests/unit/role-status-identity.test.js were run and are green (16 tests). Verdict is CONDITIONAL_PASS rather than FAIL because the SD is implementable and the test plan is concrete, but three blocking conditions must be encoded in the PRD before EXEC: the fresh-role-seat gate, the injectable seam, and the test-file placement. PASS is not available because as currently scoped the change would emit permanent false rows into an append-only table and its tests would be placed in a file CI does not run.";

let results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  critical_issues,
  warnings,
  recommendations,
  summary: "FR-1 is testable ONLY if PLAN adds a dependency-injected exported seam -- and even then one blocking design defect survives the corrected scope. MEASURED, not predicted: (T-C1) roleVerdictFor returns worker (never unknown) for the row the hook itself just wrote, because an ABSENT role key is an affirmative worker signal in role-status-identity.cjs:110 and role registration runs AFTER SessionStart -- so every role seat FIRST SessionStart on Fable emits a false mismatch into an append-only table (~4 permanent rows per chairman restart cycle). (T-C2) the test file RISK M7 names, tests/unit/hooks/capture-session-id.test.cjs, is NOT collected by vitest (include matches *.test.js only; 29 of 33 files in that dir collect, the 3 .cjs ones are dark) and the CI job runs exactly that uncollected command -- tests added there could not fail. (T-C3) the proposed insertion point is unreachable from any test: main() is unexported and the only kill switch reaching it (LEO_HOOK_DRY_RUN) returns early ~15 lines above it. FR-2 is lower risk and cheaper than scoped: metadata is ALREADY in the dashboard select at :340, so the count needs no new query and no new columns.",
  phase: 'LEAD',
  validation_mode: 'prospective',
  sub_agent_code: 'TESTING',
  metadata: {
    phase: 'LEAD',
    session_id: '689a1237-33b7-406f-9772-668958b289d6',
    evaluated_commit_sha: sha,
    sub_agent_version: '2.4.0',
    model: 'claude-opus-5[1m]',
    measurements: {
      fresh_seat_probe: '.artifacts/testing-freshseat-probe.cjs -> verdict=worker, expected=claude-opus-5, observed=fable, WOULD_SIGNAL=true',
      vitest_collection: 'npx vitest list --project unit tests/unit/hooks/ -> 29 of 33 files; *.test.cjs excluded by include glob',
      vitest_filter_probe: 'npx vitest run --project unit tests/unit/hooks/capture-session-id.test.cjs -> No test files found, exiting with code 1',
      require_esm_probe: 'require(./lib/governance/emit-feedback.js) from CJS OK on node v24.12.0 -> ALLOWED_PRIORITIES,emitFeedback,emitFeedbackBatch',
      baseline: 'npx vitest run --project unit tests/unit/fleet/model-policy.test.js tests/unit/role-status-identity.test.js -> 2 files / 16 tests PASSED'
    },
    existing_test_files: {
      capture_session_id: [
        'tests/unit/hooks/capture-session-id.test.cjs (DARK - not collected by CI)',
        'tests/unit/hooks/capture-session-id-upsert-retry.test.cjs (DARK)',
        'tests/unit/capture-session-id-metadata-merge.test.js (collected)',
        'tests/unit/capture-session-id-cleanup.test.js (collected)',
        'tests/unit/capture-session-id-tick-cwd-guard.test.js (collected)',
        'tests/capture-session-id-hook.test.js (EXPLICITLY EXCLUDED in vitest.config.js)'
      ],
      fleet_dashboard: [
        'tests/unit/coordinator/fleet-dashboard-worker-enrichment.test.js (the pattern to copy)',
        'tests/unit/coordinator/fleet-dashboard-feedback.test.js',
        'tests/unit/fleet-dashboard-judged-allowlist.test.js'
      ],
      modules_under_composition: [
        'tests/unit/fleet/model-policy.test.js',
        'tests/unit/role-status-identity.test.js',
        'tests/unit/fleet/role-predicate.test.js',
        'tests/unit/governance/emit-feedback.test.js'
      ],
      sibling_hook_precedent: 'tests/unit/hooks/session-role-orient-adam-branch.test.js'
    }
  }
};
results.metadata.content_hash = crypto.createHash('sha256').update(JSON.stringify({ critical_issues, warnings, recommendations })).digest('hex');

const resolution = await resolveSubAgentRepo({ subAgentCode: 'TESTING', sdId: SD_UUID, targetApplication: 'EHG_Engineer', supabase: sb });
results = applySubAgentRepoVerdict(results, resolution, { cwd: process.cwd() });

const row = {
  sd_id: SD_UUID,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: results.verdict,
  confidence: results.confidence,
  critical_issues: results.critical_issues,
  warnings: results.warnings,
  recommendations: results.recommendations,
  metadata: results.metadata,
  validation_mode: 'prospective',
  phase: 'LEAD',
  summary: results.summary,
  source: 'sub_agent_executor',
  conditions: CONDITIONS,
  justification: JUSTIFICATION
};
const { data, error } = await sb.from('sub_agent_execution_results').insert(row).select('id, verdict, phase, validation_mode, created_at').single();
if (error) { console.error('INSERT FAILED:', error.message, error.details); process.exit(1); }
console.log('WROTE ROW:', JSON.stringify(data, null, 1));
console.log('metadata.repo_path =', results.metadata.repo_path, '| repo_resolved =', results.metadata.repo_resolved);
