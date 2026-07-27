#!/usr/bin/env node
/**
 * One-off: write TESTING sub-agent evidence at the PLAN phase for
 * SD-LEO-INFRA-THREE-REFUSAL-TESTS-001, ahead of the PLAN-TO-EXEC handoff.
 *
 * Scope: assess the PRD's TEST STRATEGY (not implement it -- EXEC has not run yet).
 *   1. Capture the baseline unit-tier failure SET (membership, not just count) via a real
 *      `npx vitest run --project unit --reporter=verbose` on this worktree, unmodified.
 *   2. Judge FR-1's `baseDir: ''` mechanism against the real resolveProfileDir source.
 *   3. Judge FR-2's risk: does clearing FLEET_ACCOUNT_PROFILES_DIR / FLEET_SPAWN_CONTROL_LIVE /
 *      FLEET_BROWSER_PROFILES_DIR / FLEET_CANARY_KILL_ENABLED at the unit-project env level break
 *      any OTHER unit test that depends on one of those vars being SET via ambient process.env.
 *   4. Flag test-strategy gaps.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11
 * -- no hand-rolled repo_path/local_path columns.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '581a0da1-331a-4429-9969-a45667df076f';
const SD_KEY = 'SD-LEO-INFRA-THREE-REFUSAL-TESTS-001';

// Baseline captured live: `npx vitest run --project unit --reporter=verbose` on this worktree,
// working tree unmodified (tests/unit/fleet/spawn-control.test.js,
// tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js, vitest.config.js all at
// their pre-fix content). Ambient env: this worktree's real .env
// (FLEET_SPAWN_CONTROL_LIVE=true, FLEET_ACCOUNT_PROFILES_DIR set, FLEET_CANARY_KILL_ENABLED=true).
const BASELINE = {
  command: 'npx vitest run --project unit --reporter=verbose',
  result_line: 'Test Files  9 failed | 2671 passed | 3 skipped (2683); Tests  14 failed | 32025 passed | 83 skipped | 2 todo (32124)',
  duration_s: 129.3,
  failed_tests: [
    { file: 'lib/crm/pipeline-integration.e2e.test.js', test: 'Relationship Engine — fixture-venture traversal (TS-1..TS-5) > TS-4: EVA meeting surface reads live pipeline data for the venture', in_scope: false },
    { file: 'tests/unit/append-fleet-commit-trailer.test.js', test: 'leaves the message unchanged when the session lookup finds nothing (fail-open, bad session id)', in_scope: false },
    { file: 'tests/unit/append-fleet-commit-trailer.test.js', test: 'is idempotent: running twice never double-stamps', in_scope: false },
    { file: 'tests/unit/unit-tier-env-isolation.test.js', test: 'does NOT leak SUPABASE_URL from the repo .env file into the unit project', in_scope: false, note: 'SAME root-cause CLASS (host .env leaking into unit tier via vitest.config.js parent-process loadEnv) but for SUPABASE_URL, not the FLEET_* vars this PRD scopes. Directly relevant precedent for FR-2, not itself in scope.' },
    { file: 'tests/unit/unit-tier-env-isolation.test.js', test: 'uses the synthetic sentinels when no host-shell creds exist', in_scope: false, note: 'same note as above' },
    { file: 'tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js', test: 'honors a valid LEO_QF_EXTERNAL_STEP_TIMEOUT_MS env override (computed at import)', in_scope: false },
    { file: 'tests/unit/complete-quick-fix/external-timeout-and-coverage-gate.test.js', test: 'falls back to the default on an invalid env override', in_scope: false },
    { file: 'tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js', test: "canaryRestart: WITHOUT opts.live (pre-fix call shape), the same real chain honestly reports replacement_not_live -- reproduces the exact production bug", in_scope: true, sd_target: 'FR-2' },
    { file: 'tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js', test: 'canaryRelaunchUnderProfile: WITHOUT opts.live (pre-fix call shape), honestly reports replacement_not_live', in_scope: true, sd_target: 'FR-2' },
    { file: 'tests/unit/fleet/spawn-control.test.js', test: 'restart (FR-4 singleton-serial / FR-5 worker-parallel) > FR-6: restarting a profile-stamped session with NO profiles dir configured FAILS LOUD', in_scope: true, sd_target: 'FR-1' },
    { file: 'tests/unit/golden-references/witness-emitter-acceptance.test.js', test: 'doctrine mutations fail named checks (miss direction) > action OUTSIDE the transaction fails action_inside_transaction', in_scope: false },
    { file: 'tests/unit/hooks/session-register-created-emission.test.js', test: 'QF-20260725-480: SESSION_CREATED is emitted by the session-register hook > is actually WIRED INTO the hook: main() probes first, then calls it on success', in_scope: false },
    { file: 'tests/unit/setup/env-isolation-guard.test.js', test: 'FR-1 env isolation guard (per-test process.env reset) > the synthetic test.invalid default survives the per-test restore', in_scope: false, note: 'same env-isolation failure class as unit-tier-env-isolation.test.js above (SUPABASE_URL), unrelated to FLEET_*' },
    { file: 'tests/unit/setup/env-isolation-guard.test.js', test: 'FR-1 env isolation guard (per-test process.env reset) > SUPABASE_URL is back after the delete in the prior test (restore on delete)', in_scope: false },
  ],
};
const BASELINE_FAILED_SET = new Set(BASELINE.failed_tests.map(t => `${t.file} :: ${t.test}`));
const IN_SCOPE_COUNT = BASELINE.failed_tests.filter(t => t.in_scope).length; // expect exactly 3

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  if (IN_SCOPE_COUNT !== 3) {
    throw new Error(`Expected exactly 3 in-scope baseline failures (the SD's three refusal tests), found ${IN_SCOPE_COUNT}. Re-check BASELINE before writing evidence.`);
  }

  let results = {
    verdict: 'PASS',
    confidence: 87,
    findings: [
      {
        id: 'F1-baseline-failure-set-captured',
        severity: 'INFO',
        summary: `Ran \`${BASELINE.command}\` live on this unmodified worktree (working tree matches origin/main for every file this PRD's editable set touches: tests/unit/fleet/spawn-control.test.js, tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js, vitest.config.js). Result: ${BASELINE.result_line} (${BASELINE.duration_s}s). This is the single most valuable PLAN-phase artifact for EXEC: 11 of 14 failures are pre-existing and OUT of this PRD's scope (2 distinct unrelated classes: a second, already-present instance of the SAME root-cause pattern this PRD fixes -- host .env SUPABASE_URL leaking into the unit tier via vitest.config.js's parent-process loadEnv, hitting tests/unit/unit-tier-env-isolation.test.js and tests/unit/setter/env-isolation-guard.test.js -- plus 7 genuinely unrelated failures in append-fleet-commit-trailer, external-timeout-and-coverage-gate, witness-emitter-acceptance, session-register-created-emission, and lib/crm/pipeline-integration.e2e.test.js). Exactly 3 failures are in-scope: the two cp3 'WITHOUT opts.live' tests (FR-2 target) and spawn-control.test.js's FR-6 case (FR-1 target) -- matching the SD's stated count exactly. Full membership list is recorded in this row's detailed_analysis.baseline_failed_tests for EXEC to diff against post-fix.`,
      },
      {
        id: 'F2-fr1-mechanism-confirmed-against-real-source',
        severity: 'INFO',
        summary: "Read lib/fleet/spawn-control.js:102-104 directly: `const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null; if (!baseDir) throw ...`. Confirmed both halves of FR-1's claim: (a) `null` IS nullish, so `opts.baseDir ?? X` treats an explicit `baseDir: null` from spawn-control.test.js:895 as absent and falls through to `process.env.FLEET_ACCOUNT_PROFILES_DIR` (which this .env sets), so the throw never arms; (b) `''` is NOT nullish (`?? ` only substitutes on null/undefined), so `baseDir: ''` survives the `??` chain unchanged, and the following `if (!baseDir)` guard IS tripped by `''` (empty string is falsy). The mechanism is correct: changing line 895's `baseDir: null` to `baseDir: ''` makes the throw arm regardless of ambient FLEET_ACCOUNT_PROFILES_DIR, without touching the assertion (`.rejects.toThrow(/FLEET_ACCOUNT_PROFILES_DIR/)` at line 896 is unchanged) or any production file.",
      },
      {
        id: 'F3-fr2-risk-search-low-risk-confirmed',
        severity: 'INFO',
        summary: "Searched tests/ for every read of FLEET_ACCOUNT_PROFILES_DIR, FLEET_SPAWN_CONTROL_LIVE, FLEET_BROWSER_PROFILES_DIR, FLEET_CANARY_KILL_ENABLED and classified each site by whether it reads real process.env (at risk from FR-2's vitest-project env override) or an explicitly-passed opts.env / function arg (unaffected, dependency-injected). RESULT: every production call site that a unit test exercises threads env explicitly EXCEPT lib/fleet/spawn-control.js:227 (`const live = opts.live ?? isLiveEnabled();` -- isLiveEnabled() called with ZERO args, defaulting to real process.env per its own signature `isLiveEnabled(env = process.env)` at line 115) -- and that IS the exact site the two cp3 tests exist to exercise (they intentionally omit opts.live and rely on the env fallback), so it is FR-2's actual target, not collateral risk. The one direct process.env.FLEET_ACCOUNT_PROFILES_DIR read inside a test (spawn-control.test.js:196-201, 'throws if no base dir is configured') already deletes-then-restores it around its own assertion specifically because of this pre-existing leak; under FR-2 the delete becomes a no-op (already absent) and the restore is a no-op (saved is already undefined) -- compatible either way, no behavior change. lib/fleet/reboot-respawn-runner.js:182 has the SAME `opts.live ?? isLiveEnabled()` shape (a second instance of the class), but every call in tests/unit/fleet/reboot-respawn-runner.test.js supplies `live: true` or `live: false` explicitly, so its isLiveEnabled() fallback is never reached by any current unit test -- zero exposure today. scripts/fleet/worker-spawn-executor.cjs has its own separate isLiveEnabled() reading a DIFFERENT var (WORKER_SPAWN_EXECUTOR_LIVE), confirmed by its test always passing explicit env objects -- unaffected. isCanaryKillEnabled (lib/fleet/canary-guard.js:38, FLEET_CANARY_KILL_ENABLED) is called at its one production site as `isCanaryKillEnabled(opts.env)` -- opts.env is always threaded, never defaults to bare process.env -- and every canary-guard.test.js case passes an explicit env object, several of which assert 'is OFF by default' using `{}`, not ambient process.env; unaffected by FR-2 either way. FLEET_BROWSER_PROFILES_DIR is unset in this .env today, so clearing it in FR-2's scope (per the PRD's runtime_config note) is a no-op on this host but closes the same latent host-dependency in tests/unit/fleet/browser-control.test.js's 'requires FLEET_BROWSER_PROFILES_DIR' case for any OTHER host whose .env happens to set it. CONCLUSION: FR-2's env-clearing carries LOW collateral risk -- no currently-passing unit test depends on ambient truthiness of any of the four named vars via direct process.env reads.",
      },
      {
        id: 'F4-fr2-precedent-mechanism-sound',
        severity: 'INFO',
        summary: "Read vitest.config.js:196-219: the unit project already neutralises FLEET_REPO_ROOT via a project-level `env: { FLEET_REPO_ROOT: './tests/fixtures/__no_such_tree__' }` override, applied inside the forked worker after the parent process's dotenv loadEnv (lines 16-17) has already populated process.env -- the exact mechanism FR-2 proposes reusing for FLEET_ACCOUNT_PROFILES_DIR / FLEET_SPAWN_CONTROL_LIVE. Setting the override value to '' (not literally deleting the key) is consistent with TR-4's 'empty string, not delete' precondition mechanism: '' still trips resolveProfileDir's `!baseDir` guard (empty string is falsy) and still fails isLiveEnabled's `=== 'true'` check, so either an explicit '' or an omitted key produces the same refusal outcome for the two production functions in scope.",
      },
    ],
    warnings: [
      "Baseline captured 14 failed / 32025 passed on this host today -- the SD's own text estimated '~23 pre-existing unrelated failures', a higher number from a stale prior measurement. This is expected drift (main has moved since that number was written) and does not affect the strategy assessment, since the comparison EXEC needs is membership-delta on ITS OWN before/after runs, not a match to this SD's narrative number. Recorded here so a future reader does not treat the ~23 figure as authoritative.",
      "TS-4 ('Regression guard on the rest of the unit tier after the vitest.config.js env override') has no numbered AC of its own beyond AC-6 ('pre-existing unit-tier failures are not broadened') -- satisfied by this row's captured baseline failure SET, which EXEC should diff by membership (not count) against its post-fix run. Flagging that the PRD does not explicitly tell EXEC where that baseline is recorded; this row is now that location.",
      "The PRD's FR-2 acceptance criteria bullets name only FLEET_ACCOUNT_PROFILES_DIR and FLEET_SPAWN_CONTROL_LIVE explicitly; FLEET_BROWSER_PROFILES_DIR appears only in the narrative runtime_config section ('worth neutralising with the others'), not as a numbered AC. Minor scope ambiguity for EXEC: recommend including it in the vitest.config.js env block anyway (F3/F4 above show it is a no-op on this host and closes the same latent class for other hosts), but it is not enforceable as a gate failure if EXEC omits it, since no AC names it.",
    ],
    recommendations: [
      "EXEC: use this row's detailed_analysis.baseline_failed_tests as the pre-fix membership set. After applying FR-1+FR-2, re-run `npx vitest run --project unit --reporter=verbose` under BOTH ambient env and an explicitly-cleared env (FLEET_SPAWN_CONTROL_LIVE= FLEET_ACCOUNT_PROFILES_DIR= in the invoking shell), and confirm: (a) all 3 in-scope tests move from failed to passed in both runs, (b) all 11 out-of-scope pre-existing failures are still present and unchanged in both runs (membership match, not just count), (c) the two ambient/cleared runs report identical pass/fail counts for the two target files per AC-1/AC-2.",
      "EXEC: include FLEET_BROWSER_PROFILES_DIR: '' alongside FLEET_ACCOUNT_PROFILES_DIR: '' and FLEET_SPAWN_CONTROL_LIVE: '' in the vitest.config.js unit-project env override, even though only the first two are named in FR-2's numbered AC -- it is a no-op on this host and forward-hardens tests/unit/fleet/browser-control.test.js.",
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      phase: 'PLAN',
      scope_note: 'TEST-STRATEGY assessment only -- no code has been written yet (PLAN-TO-EXEC handoff evidence, not post-implementation verification). No files were modified by this evidence run.',
      baseline: BASELINE,
      baseline_failed_tests: BASELINE.failed_tests,
      in_scope_baseline_failure_count: IN_SCOPE_COUNT,
      out_of_scope_baseline_failure_count: BASELINE.failed_tests.length - IN_SCOPE_COUNT,
      fr1_mechanism_verified: {
        file: 'lib/fleet/spawn-control.js',
        lines: '102-104',
        source_read: "const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null; if (!baseDir) throw new Error('resolveProfileDir: FLEET_ACCOUNT_PROFILES_DIR is not configured');",
        null_survives_qq: false,
        empty_string_survives_qq: true,
        empty_string_trips_guard: true,
        verdict: 'CONFIRMED correct',
      },
      fr2_risk_scan: {
        vars_searched: ['FLEET_ACCOUNT_PROFILES_DIR', 'FLEET_SPAWN_CONTROL_LIVE', 'FLEET_BROWSER_PROFILES_DIR', 'FLEET_CANARY_KILL_ENABLED'],
        direct_process_env_reads_in_tests: [
          { file: 'tests/unit/fleet/spawn-control.test.js', lines: '196-201', var: 'FLEET_ACCOUNT_PROFILES_DIR', self_compensating: true },
        ],
        bare_isLiveEnabled_fallback_sites: [
          { file: 'lib/fleet/spawn-control.js', line: 227, exercised_by: ['tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js'], is_fr2_target: true },
          { file: 'lib/fleet/reboot-respawn-runner.js', line: 182, exercised_by: [], note: 'every call in reboot-respawn-runner.test.js passes opts.live explicitly; fallback never reached; zero exposure' },
        ],
        distinct_isLiveEnabled_copies_unaffected: ['scripts/fleet/worker-spawn-executor.cjs (reads WORKER_SPAWN_EXECUTOR_LIVE, not FLEET_SPAWN_CONTROL_LIVE)'],
        isCanaryKillEnabled: { call_site: 'lib/fleet/canary-guard.js:101', reads: 'opts.env (always threaded, never bare process.env)', unaffected: true },
        FLEET_BROWSER_PROFILES_DIR: { currently_set_in_dotenv: false, clearing_is_noop_on_this_host: true, closes_latent_gap_for_other_hosts: true },
        overall_risk: 'LOW',
      },
      gaps_flagged: [
        'Baseline failure SET was not previously recorded anywhere in the PRD/SD row; this evidence row is now the recorded location EXEC must diff against.',
        'FLEET_BROWSER_PROFILES_DIR scope ambiguity (narrative-only, not a numbered FR-2 AC).',
      ],
    }),
    metadata: {
      test_strategy_verified: {
        fr1_baseDir_empty_string_mechanism: 'CONFIRMED against real source at spawn-control.js:102-104',
        fr2_env_clearing_collateral_risk: 'LOW -- searched all 4 named vars across tests/, only 1 in-scope bare-fallback site (the FR-2 target itself), 1 self-compensating direct read, everything else dependency-injected',
        baseline_failure_membership_captured: true,
        in_scope_failure_count_matches_sd_claim_of_3: true,
      },
    },
    phase: 'PLAN',
    validation_mode: 'prospective',
    summary: `PASS for PLAN-TO-EXEC. Ran the real unit-tier suite unmodified on this worktree: ${BASELINE.result_line}. Exactly 3 of 14 failures are in-scope (the two cp3 'WITHOUT opts.live' tests + spawn-control.test.js FR-6), matching the SD's claim; the other 11 are pre-existing and out of scope (2 of which are the SAME leak-class for SUPABASE_URL, not FLEET_*). FR-1's baseDir:'' mechanism is CONFIRMED correct against the real resolveProfileDir source (null is nullish and falls through ??, '' is not nullish and survives ?? while still tripping the falsy guard). FR-2's env-clearing risk is LOW: searched every test read of the four named FLEET_* vars; the only bare-process.env fallback a unit test exercises is spawn-control.js:227, which is FR-2's actual target, not collateral; every other site is either dependency-injected via an explicit opts.env / function arg, or reads a differently-named variable in an unrelated module. The full baseline failure-set membership is recorded in detailed_analysis.baseline_failed_tests for EXEC's before/after diff (TS-4 / AC-6). One scope-ambiguity gap flagged as a warning (FLEET_BROWSER_PROFILES_DIR is narrative-only, not a numbered FR-2 AC) with a non-blocking recommendation to include it anyway.`,
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'Enhanced QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('TESTING result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
