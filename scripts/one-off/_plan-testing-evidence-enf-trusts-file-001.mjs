#!/usr/bin/env node
/**
 * PLAN-phase TESTING evidence for SD-LEO-FIX-ENF-TRUSTS-FILE-001 (PLAN-TO-EXEC gate).
 *
 * PROSPECTIVE validation of PRD-SD-LEO-FIX-ENF-TRUSTS-FILE-001 (FR-1..FR-6, TS-1..TS-7)
 * BEFORE EXEC implementation. All findings are MEASURED on this worktree, not inferred.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'd1b8f30e-de76-4932-9c35-8745542cd716';
const SD_KEY = 'SD-LEO-FIX-ENF-TRUSTS-FILE-001';

async function writeTesting(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 90,
    findings: [
      {
        id: 'F1-defect-premise-MEASURED-reproducible',
        severity: 'INFO',
        summary: 'The SD premise is confirmed by direct measurement, not inference. (a) absent->created: two full `npx vitest run --project unit` runs (14,355 files / 41,710 tests each) both left .claude/active-coordinator.json PRESENT containing {"session_id":"sess-987"} — the literal fake id from tests/unit/coordinator-flag-rpc-fallback.test.js:134, which calls setActiveCoordinator(supabase,\'sess-987\') with NO fs stub. The file was verified ABSENT before each run. (b) present->DELETED: seeding a sentinel pointer and running only the 5 in-scope files destroyed it 3/3 times (before-hash != after; after = ABSENT). Destruction path is lib/coordinator/resolve.test.js afterEach, which unconditionally unlinks resolve.ACTIVE_COORDINATOR_FILE whether or not the test created it. This is exactly the production incident shape.',
      },
      {
        id: 'F2-BLOCKING-shared-tmpdir-path-does-NOT-satisfy-the-PRD',
        severity: 'CRITICAL',
        summary: 'MEASURED: the scoped 5-file run FAILS 5/5 times pre-fix, with a ROTATING set of 1-3 failures per run (RES-1/RES-3/RES-4/RES-5/RES-8 in resolve.test.js and the readCoordFile tri-state cases in session-role-orient.test.js). Cause: 3 of the 5 files genuinely contend on the same real path from 3 DIFFERENT concurrent forks — resolve.test.js (writes/reads/unlinks), coordinator-flag-rpc-fallback.test.js (real unstubbed writes x4), session-role-orient.test.js (writes fixtures + unlinks). role-handoff.test.js and coordinator-promotion-*.test.js are already fs-stubbed and do NOT contend. CONSEQUENCE: if FR-1/FR-2 resolve to a SINGLE deterministic tmpdir path (e.g. path.join(os.tmpdir(),\'active-coordinator.json\')), the race is RELOCATED, not removed, and the PRD\'s own top-level acceptance criterion #1 ("the 5 files pass with zero failures") plus FR-5 AC-3 ("does not race concurrent unit-tier forks, 3 consecutive runs without flake") REMAIN UNMET. The gated path MUST be per-process. MEASURED VIABILITY: two test files run concurrently in DISTINCT processes (probe: pid 34092 pool=1 worker=0 and pid 48440 pool=2 worker=1, overlapping wall clock), so process.pid (or VITEST_POOL_ID) is a sound discriminator. RECOMMENDED SHAPE: path.join(os.tmpdir(), `leo-coord-test-${process.pid}`, \'active-coordinator.json\') — a dedicated SUBDIRECTORY, not a bare tmpdir file, so that role-handoff.test.js\'s mkdirSync interceptor (which swallows mkdirSync(path.dirname(COORD_FILE_ABS))) keeps a narrow blast radius instead of swallowing every mkdirSync(os.tmpdir()) in that fork.',
      },
      {
        id: 'F3-BLOCKING-vi.resetModules-does-not-re-evaluate-cjs',
        severity: 'CRITICAL',
        summary: 'MEASURED by live probe (temporary fixture + test, run and then deleted): vi.resetModules() followed by require(\'<module>.cjs\') returns the CACHED module instance — a module-scope const gated on process.env.VITEST does NOT re-evaluate after `delete process.env.VITEST`. Probe P2 asserted the non-VITEST branch and FAILED (expected false, received true). Probe P3, using the `delete require.cache[require.resolve(HOOK_PATH)]` idiom already present in scripts/hooks/__tests__/session-role-orient.test.js loadHook(), PASSED. This matters because FR-1 AC-1 and TS-2 (production/non-VITEST behavior) are the ONLY non-vacuous half of the gate, and lib/coordinator/role-handoff.test.js + lib/coordinator/resolve.test.js both use the vi.resetModules() idiom in beforeEach. EXEC MUST use require.cache deletion, not vi.resetModules(), to exercise the non-VITEST branch. Mitigating note: the failure mode is LOUD (assertion fails), not a silent false green. Probe P4 also confirmed the gated path is STABLE across vi.resetModules() within a process, which is required for role-handoff.test.js\'s strict-equality fs interceptor to keep matching.',
      },
      {
        id: 'F4-FR3-module-scope-ordering-trap',
        severity: 'WARNING',
        summary: 'lib/coordinator/role-handoff.test.js declares `let resolve;` at line 22 and assigns it inside beforeEach (line 31). COORD_FILE_ABS is a module-scope const at line 28 — i.e. it is evaluated BEFORE beforeEach runs. A naive FR-3 edit of `const COORD_FILE_ABS = resolve.ACTIVE_COORDINATOR_FILE;` throws TypeError at collection time (reading a property of undefined). EXEC must write a fresh top-level require: `const COORD_FILE_ABS = require(\'./resolve.cjs\').ACTIVE_COORDINATOR_FILE;`. Same class at scripts/hooks/__tests__/session-role-orient.test.js:76, where COORD_PATH is evaluated at describe-collection time and must become `const { COORD_FILE: COORD_PATH } = loadHook();` (loadHook() is safe to call at collection time — other describes already do equivalent work).',
      },
      {
        id: 'F5-FR5-verifier-must-not-source-the-constant-it-checks',
        severity: 'WARNING',
        summary: 'FR-5 says "independently resolves the REAL (non-VITEST) path". EXEC must be told WHY: if the verifier imports ACTIVE_COORDINATOR_FILE from lib/coordinator/resolve.cjs and is ever invoked under vitest (or from any process where VITEST is set), it would hash the TMPDIR path and pass vacuously — a guard blinded to its own subject. The verifier must compute path.resolve(<repoRoot>, \'.claude/active-coordinator.json\') itself, with no import of the gated module.',
      },
      {
        id: 'F6-FR5-placement-concrete-and-implementable',
        severity: 'INFO',
        summary: 'YES — FR-5 is implementable as specified, and there is a natural home with existing precedent. RECOMMENDED: a standalone verifier `scripts/verify-coordinator-pointer-invariant.mjs` + an npm script, wired as a STEP in .github/workflows/unit-tier.yml. That workflow already runs extra serialized non-vitest-project steps AFTER `npx vitest run --project unit` (`npm run test:session-tick`, `npm run test:adam-github-assessment`), so a new step is a separate process running after the parallel tier completes — structurally serialized, zero intra-tier parallelism, satisfying FR-5\'s constraint by construction rather than by configuration. The verifier: hash-or-absent -> spawn `npx vitest run --project unit <5 files>` -> hash-or-absent -> tri-state compare. This also matches the repo\'s dominant "standalone verifier + npm script + CI step" idiom (scripts/audit-db-test-guards.mjs, scripts/verify-eva-revival.mjs, scripts/ci/red-merge-detector.mjs, the 25 scripts/lint/*.mjs). REJECTED ALTERNATIVES: (a) a plain unit-tier vitest test — it would run INSIDE the parallel tier it is measuring, and other forks writing the file would make it flake, the exact thing FR-5 forbids; (b) a dedicated vitest project (the `smoke`/`migration-gate` precedent in vitest.config.js) — viable for discovery isolation but still requires spawning vitest inside vitest, with no benefit over (a) the plain script.',
      },
      {
        id: 'F7-untested-branches-flagged',
        severity: 'WARNING',
        summary: 'Coverage audit of FR-1..FR-6 x TS-1..TS-7 against every code path the fix touches. COVERED: resolve.cjs VITEST branch (TS-1, plus all existing resolve.test.js); resolve.cjs non-VITEST branch (FR-1 AC-1 / TS-2 — conditional on F3); session-role-orient.cjs VITEST branch (TS-3); the new COORD_FILE export (implicitly, via TS-3/FR-4); both call-site updates (TS-4 for role-handoff.test.js, TS-3 for session-role-orient.test.js); tri-state absent-stays-absent (TS-6); FR-5 negative control (TS-5). GAPS: (G1) session-role-orient.cjs COORD_FILE NON-VITEST branch — FR-2 AC-3 asserts "readCoordFile() behavior is unchanged" but NO TS-1..TS-7 scenario exercises it; resolve.cjs gets TS-2 for exactly this and the hook gets nothing, despite being a separate hand-copied gate. (G2) FR-6 AC-2 (VITEST=\'1\' vs \'true\') has NO test scenario at all — a one-line cache-bust test per file closes it. (G3) tri-state PRESENT->MUTATED/DELETED is NOT in any TS — TS-1 says "exists (or does not exist)" but only TS-6 is written, and the present-file case is the one that MEASURABLY destroyed the sentinel 3/3 times. TS-6 as written would pass on a machine where the file is absent while the destructive path stays unproven. (G4) the new COORD_FILE export has no direct assertion; add expect(typeof COORD_FILE).toBe(\'string\') so a dropped export fails as a named assertion rather than as a confusing downstream path error.',
      },
      {
        id: 'F8-FR2-duplication-recreates-the-drift-class-being-fixed',
        severity: 'WARNING',
        summary: 'FR-2 deliberately hand-copies the gate into scripts/hooks/session-role-orient.cjs rather than importing resolve.cjs\'s constant. That is a defensible call (the hook already requires resolve.cjs lazily inside a try/catch for SessionStart fail-soft), but it leaves TWO independent representations of the same rule — which is precisely the drift class this SD exists to repair. Census of hardcoded copies of the path today: lib/coordinator/resolve.cjs:13, scripts/hooks/session-role-orient.cjs:15, lib/coordinator/role-handoff.test.js:28, scripts/hooks/__tests__/session-role-orient.test.js:76, scripts/hooks/pre-tool-enforce.cjs:1302 (read-only, out of scope), .claude/compaction-thresholds.cjs:51 (read-only, out of scope). The SD removes two of the six. RECOMMENDATION (non-blocking, cheap): add one assertion binding the two gated constants to each other — require(\'lib/coordinator/resolve.cjs\').ACTIVE_COORDINATOR_FILE === require(\'scripts/hooks/session-role-orient.cjs\').COORD_FILE — under BOTH branches. Without it, nothing detects the two gates drifting apart, and the next reader has no way to know they are supposed to agree. A scripts/lint/ rule forbidding new literal \'.claude/active-coordinator.json\' path.resolve() sites outside the two definition sites is the durable version, and matches this repo\'s established lint culture (25 linters in scripts/lint/).',
      },
      {
        id: 'F9-baseline-is-NOT-deterministically-green',
        severity: 'WARNING',
        summary: 'Question 4 answered by measurement, and the answer is qualified. Two full `npx vitest run --project unit` runs on this worktree at HEAD (pre-fix): RUN 1 = 14,351/14,355 suites, 41,502/41,710 tests, 2 failing FILES (tests/unit/feature-flags/flag-governance-live-readers.test.js, tests/unit/scripts/lint-repo-resolution-drift.test.js). RUN 2 = 41,503/41,710 tests, 1 failing FILE (tests/unit/eva/complexity-scorer.test.js). THE FAILING SETS ARE DISJOINT. Both RUN-1 files pass 14/14 when re-run in isolation (20.09s), so they are resource-contention/timeout flakes under full-tier load (testTimeout 60000, pool:forks, all cores saturated by 14k files), not real regressions. IMPLICATION FOR EXEC-TO-PLAN ATTRIBUTION: a bare "is it green" comparison is NOT a sound attribution instrument here — the baseline emits 1-2 flaky failures per run from a rotating pool. Attribution must be done by comparing failing FILE SETS and re-running any newly-failing file in isolation to confirm it is real. CRITICALLY, this does not weaken this SD\'s own signal: none of the 5 in-scope files is in tests/quarantine-manifest.json (157 entries), all 5 passed in BOTH full runs, and the scoped 5-file command in the PRD\'s top-level acceptance criterion #1 fails 5/5 pre-fix and must go 5/5 green post-fix. That scoped command is a far higher-signal gate than the full-tier run and should be the primary EXEC-TO-PLAN instrument for this SD.',
      },
      {
        id: 'F10-full-suite-masks-the-race-scoped-run-exposes-it',
        severity: 'INFO',
        summary: 'Worth stating explicitly so EXEC does not draw the wrong conclusion from a green full run: all 5 in-scope files PASSED in both full-tier runs, yet FAILED 5/5 when run as a scoped set. With 14,355 files spread across the fork pool the 5 contending files are rarely co-scheduled, so the race window closes and the full suite reads green while the defect is fully live (it still wrote sess-987 to the real file both times). A green `npm run test:unit` is therefore NOT evidence this fix worked; only the scoped 5-file run and the FR-5 invariant check are.',
      },
      {
        id: 'F11-out-of-scope-exclusions-verified-reasonable',
        severity: 'INFO',
        summary: 'Verified both declared exclusions by reading them. scripts/hooks/pre-tool-enforce.cjs:1302 — readFileSync inside a nested try/catch whose catch comment is "no marker / unreadable -> treat as worker (fail-open)"; read-only, fail-open, correct to defer. .claude/compaction-thresholds.cjs:51 — inline fallback reader used only when the shared readCoordFile require fails; existsSync-guarded, try/catch, returns null; read-only, fail-open, correct to defer. Residual (non-blocking) note: after this fix these two readers will see the developer\'s REAL pointer during a unit run instead of test-written garbage, so any test that transitively exercises them becomes dependent on local machine state. No such test was found in the census, so this is theoretical today. Separately verified NOT to need changes: tests/unit/scripts/safe-root-resync.test.js (injects a no-op writePointerFileFn), tests/unit/coordinator-promotion-clears-fleet-identity.test.js (spies fs.writeFileSync), scripts/hooks/post-checkout-role-restore.cjs and scripts/hooks/lib/shared-tree-guard.cjs (no hardcoded path — they route through resolve.cjs and so are fixed for free by FR-1). ACTIVE_COORDINATOR_FILE has ZERO consumers outside lib/coordinator/resolve.{cjs,test.js}, so FR-1 has no external blast radius.',
      },
    ],
    warnings: [
      { severity: 'CRITICAL', issue: 'A single shared os.tmpdir() path relocates the cross-fork race instead of removing it; the PRD top-level AC #1 and FR-5 AC-3 would both remain unmet (measured: 5/5 scoped runs fail pre-fix from 3 concurrently-contending forks).', recommendation: 'Make the VITEST-gated path per-process, in a dedicated subdirectory: path.join(os.tmpdir(), `leo-coord-test-${process.pid}`, \'active-coordinator.json\'). Add this to FR-1/FR-2 as an explicit acceptance criterion before EXEC starts.' },
      { severity: 'CRITICAL', issue: 'vi.resetModules() does not re-evaluate .cjs modules under vitest (measured), so FR-1 AC-1 / TS-2 cannot be written with the idiom already used in role-handoff.test.js and resolve.test.js.', recommendation: 'Exercise the non-VITEST branch with `delete require.cache[require.resolve(...)]` (the loadHook() idiom in session-role-orient.test.js). Record this as an implementation note on FR-1 and FR-2.' },
      { severity: 'MEDIUM', issue: 'Three untested branches: session-role-orient.cjs non-VITEST branch (FR-2 AC-3 has no TS); FR-6 AC-2 VITEST=\'1\' vs \'true\' (no TS); tri-state PRESENT->MUTATED/DELETED (no TS — only absent-stays-absent is written as TS-6, and the present case is the one that measurably destroys a live pointer).', recommendation: 'Add TS-8 (hook non-VITEST branch, cache-bust), TS-9 (VITEST=\'1\' truthiness on both modules), and extend TS-1/TS-6 so the FR-5 verifier is proven against a SEEDED present file, not only against absent.' },
      { severity: 'MEDIUM', issue: 'FR-2 leaves two independent hand-copied representations of the same gate, with nothing asserting they agree — the drift class this SD is repairing.', recommendation: 'Add a cross-module equality assertion under both branches, and consider a scripts/lint/ rule forbidding new literal path.resolve() sites for .claude/active-coordinator.json outside the two definition sites.' },
      { severity: 'MEDIUM', issue: 'The unit-tier baseline is not deterministically green (1-2 flaky failures per full run from a rotating set; RUN 1 and RUN 2 failing sets are disjoint), so a bare green/red comparison is not a sound EXEC-TO-PLAN attribution instrument.', recommendation: 'Attribute by comparing failing FILE SETS and re-running any new failure in isolation. Use the scoped 5-file command (currently 5/5 red) as the primary gate for this SD, not the full-tier run.' },
    ],
    recommendations: [
      'PROCEED to EXEC. The PRD is sound, the defect premise is fully measured and reproducible, and FR-5 is implementable with concrete repo precedent.',
      'BEFORE EXEC starts, amend FR-1/FR-2 with the per-process path requirement (F2) and the require.cache-vs-vi.resetModules note (F3). Both are load-bearing: without F2 the PRD cannot satisfy its own top-level AC #1.',
      'Primary EXEC-TO-PLAN gate: `npx vitest run --project unit lib/coordinator/resolve.test.js lib/coordinator/role-handoff.test.js tests/unit/coordinator-promotion-clears-fleet-identity.test.js tests/unit/coordinator-flag-rpc-fallback.test.js scripts/hooks/__tests__/session-role-orient.test.js` must go from 5/5 red to 3 consecutive clean runs.',
      'FR-5 placement: scripts/verify-coordinator-pointer-invariant.mjs + npm script + a step in .github/workflows/unit-tier.yml after the `npx vitest run --project unit` step (precedent: the existing test:session-tick / test:adam-github-assessment steps).',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      prd: 'PRD-SD-LEO-FIX-ENF-TRUSTS-FILE-001',
      mode: 'prospective (pre-EXEC)',
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-FIX-ENF-TRUSTS-FILE-001',
      baseline_full_unit_tier: {
        run_1: { suites_total: 14355, suites_failed: 4, tests_total: 41710, tests_passed: 41502, tests_failed: 2, pending: 204, failing_files: ['tests/unit/feature-flags/flag-governance-live-readers.test.js', 'tests/unit/scripts/lint-repo-resolution-drift.test.js'], pointer_file_after: 'PRESENT session_id=sess-987 (was ABSENT before)' },
        run_2: { suites_total: 14355, suites_failed: 2, tests_total: 41710, tests_passed: 41503, tests_failed: 1, pending: 204, failing_files: ['tests/unit/eva/complexity-scorer.test.js'], pointer_file_after: 'PRESENT session_id=sess-987 (was ABSENT before)' },
        isolation_recheck: 'the two RUN-1 failures pass 14/14 in isolation (20.09s) -> resource-contention flakes, not regressions',
        conclusion: 'baseline flaky tail of 1-2 files per run, rotating; failing sets disjoint across runs',
      },
      scoped_5_file_run_prefix: {
        command: 'npx vitest run --project unit <the 5 in-scope files>',
        runs: 5,
        pass_rate: '0/5',
        failures_per_run: [1, 3, 2, 3, 2],
        rotating_failures: ['resolve.test.js RES-1 refused-write-does-not-touch-pointer', 'resolve.test.js RES-3 handles invalid JSON', 'resolve.test.js RES-4 rejects malformed payload', 'resolve.test.js RES-5 returns file pointer when DB heartbeat fresh', 'resolve.test.js RES-8 returns file pointer without DB confirmation', 'session-role-orient.test.js readCoordFile null on malformed JSON', 'session-role-orient.test.js readCoordFile null for bare JSON string'],
        contending_files: ['lib/coordinator/resolve.test.js (writes/reads/unlinks)', 'tests/unit/coordinator-flag-rpc-fallback.test.js (4 real unstubbed setActiveCoordinator writes)', 'scripts/hooks/__tests__/session-role-orient.test.js (writes fixtures + unlinks)'],
        non_contending_files: ['lib/coordinator/role-handoff.test.js (fs interceptor)', 'tests/unit/coordinator-promotion-clears-fleet-identity.test.js (writeFileSync spy)'],
      },
      tri_state_experiments: {
        absent_to_created: '2/2 full-tier runs created the file with session_id=sess-987',
        present_to_deleted: '3/3 scoped runs DESTROYED a seeded sentinel pointer (before-hash != after; after=ABSENT). Path: resolve.test.js afterEach unconditional unlink of resolve.ACTIVE_COORDINATOR_FILE.',
        note: 'present->deleted is the production incident shape and has NO test scenario in TS-1..TS-7',
      },
      probes_run_and_deleted: {
        P1_baseline_gate: 'PASS — VITEST is set in the worker; a module-scope truthiness gate takes the tmpdir branch',
        P2_vi_resetModules: 'FAIL — vi.resetModules() + require() returns the CACHED .cjs instance; the non-VITEST branch is unreachable via this idiom',
        P3_require_cache_delete: 'PASS — delete require.cache[require.resolve(m)] DOES re-evaluate and reach the non-VITEST branch',
        P4_path_stability: 'PASS — the gated path is byte-stable across vi.resetModules() (required for the strict-equality fs interceptor)',
        P5_fork_isolation: 'two test files ran concurrently in DISTINCT processes (pid 34092 pool=1 worker=0; pid 48440 pool=2 worker=1) with overlapping wall clock -> process.pid is a valid per-fork discriminator',
      },
      hardcoded_path_census: {
        in_scope_fixed: ['lib/coordinator/resolve.cjs:13', 'scripts/hooks/session-role-orient.cjs:15', 'lib/coordinator/role-handoff.test.js:28', 'scripts/hooks/__tests__/session-role-orient.test.js:76'],
        declared_out_of_scope: ['scripts/hooks/pre-tool-enforce.cjs:1302 (read-only, fail-open — verified)', '.claude/compaction-thresholds.cjs:51 (read-only, fail-open — verified)'],
        verified_no_change_needed: ['tests/unit/scripts/safe-root-resync.test.js (injected no-op writer)', 'scripts/hooks/post-checkout-role-restore.cjs (routes via resolve.cjs)', 'scripts/hooks/lib/shared-tree-guard.cjs (no hardcoded path)'],
        external_consumers_of_ACTIVE_COORDINATOR_FILE: 'none outside lib/coordinator/resolve.{cjs,test.js}',
      },
      coverage_matrix: {
        'FR-1 VITEST branch': 'COVERED (TS-1 + all existing resolve.test.js)',
        'FR-1 non-VITEST branch': 'COVERED by TS-2, CONDITIONAL on using require.cache delete (F3)',
        'FR-2 VITEST branch': 'COVERED (TS-3)',
        'FR-2 non-VITEST branch': 'GAP — FR-2 AC-3 asserted, no TS exercises it',
        'FR-2 new COORD_FILE export': 'WEAK — only implicit via TS-3/FR-4; add a direct assertion',
        'FR-3 call-site update': 'COVERED (TS-4)',
        'FR-4 call-site update': 'COVERED (TS-3)',
        'FR-5 negative control': 'COVERED (TS-5) — and independently proven live, 5/5 red pre-fix',
        'FR-5 tri-state absent->absent': 'COVERED (TS-6)',
        'FR-5 tri-state present->mutated/deleted': 'GAP — no TS, despite being the measured 3/3 destructive case',
        'FR-6 truthiness predicate': 'PARTIAL — AC-1 covered by inspection; AC-2 (VITEST=1 vs true) has NO TS',
        'cross-module constant agreement': 'GAP — no FR and no TS',
      },
      fr5_placement_verdict: {
        implementable: true,
        recommended: 'scripts/verify-coordinator-pointer-invariant.mjs + npm script + step in .github/workflows/unit-tier.yml',
        why_it_fits: 'unit-tier.yml already runs serialized post-tier steps in separate processes (npm run test:session-tick, npm run test:adam-github-assessment) after `npx vitest run --project unit`; a new step is serialized by construction',
        rejected: ['a plain unit-tier vitest test (runs inside the parallel tier it measures — the exact flake FR-5 forbids)', 'a dedicated vitest project (smoke/migration-gate precedent) — still requires vitest-inside-vitest with no benefit'],
        constraint: 'the verifier must NOT import ACTIVE_COORDINATOR_FILE from resolve.cjs (self-blinding under VITEST); it must compute the real path independently',
      },
    }),
    metadata: {
      files_reviewed: [
        'lib/coordinator/resolve.cjs',
        'lib/coordinator/resolve.test.js',
        'lib/coordinator/role-handoff.test.js',
        'scripts/hooks/session-role-orient.cjs',
        'scripts/hooks/__tests__/session-role-orient.test.js',
        'tests/unit/coordinator-flag-rpc-fallback.test.js',
        'tests/unit/coordinator-promotion-clears-fleet-identity.test.js',
        'tests/unit/scripts/safe-root-resync.test.js',
        'scripts/safe-root-resync.mjs',
        'scripts/hooks/pre-tool-enforce.cjs',
        '.claude/compaction-thresholds.cjs',
        'vitest.config.js',
        '.github/workflows/unit-tier.yml',
        'tests/quarantine-manifest.json',
      ],
      commands_run: [
        'npx vitest run --project unit (full tier) x2',
        'npx vitest run --project unit <5 in-scope files> x5 (absent-start) + x3 (sentinel-seeded)',
        'npx vitest run --project unit <2 baseline-failing files> (isolation recheck)',
        'temporary vitest probe suite (5 probes, created and deleted)',
      ],
      side_effects_cleaned: 'all probe files deleted; .claude/active-coordinator.json restored to its pre-validation ABSENT state (it was absent at start; test runs created it and it was removed each time)',
    },
    phase: 'PLAN',
    validation_mode: 'prospective',
    summary: 'CONDITIONAL_PASS (confidence 90). Prospective PLAN-gate validation of PRD-SD-LEO-FIX-ENF-TRUSTS-FILE-001 before EXEC. The defect premise is MEASURED and fully reproducible: a full unit-tier run creates .claude/active-coordinator.json with the fake id sess-987 (2/2 runs), and a seeded real pointer is DESTROYED 3/3 times by the 5 in-scope files. FR-5 IS implementable — recommended home is a standalone verifier script wired as a serialized post-tier step in .github/workflows/unit-tier.yml, which already carries that exact pattern twice. TWO BLOCKING implementation constraints are absent from the PRD and must be added before EXEC: (1) the VITEST-gated path MUST be per-process (process.pid) in a dedicated tmpdir subdirectory — a single shared tmpdir path merely relocates the cross-fork race, and the scoped 5-file run fails 5/5 pre-fix from 3 genuinely-contending forks, so the PRD\'s own top-level AC #1 and FR-5 AC-3 would remain unmet; (2) vi.resetModules() does NOT re-evaluate .cjs modules under vitest (measured by live probe), so the non-VITEST branch required by FR-1 AC-1 / TS-2 must be exercised via delete require.cache[require.resolve(...)]. Four coverage gaps flagged: session-role-orient.cjs non-VITEST branch, FR-6 AC-2 (VITEST=1 vs true), the tri-state present->deleted case, and cross-module agreement between the two hand-copied gates. Baseline is NOT deterministically green (1-2 rotating flaky failures per full run, disjoint failing sets across two runs), so EXEC-TO-PLAN attribution must compare failing FILE SETS and re-run in isolation; the scoped 5-file command (currently 5/5 red) is the higher-signal gate for this SD.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const testing = await writeTesting(supabase);
  console.log('TESTING row:', testing.id, '| verdict:', testing.verdict, '| confidence:', testing.confidence, '| phase:', testing.phase);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
