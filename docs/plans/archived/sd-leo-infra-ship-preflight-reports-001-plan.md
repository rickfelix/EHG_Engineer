<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\claude\C--Users-rickf-Projects--EHG-EHG-Engineer\51fab48f-8867-4fe2-9698-0a1b8639e6ee\scratchpad\ship-preflight-fix-plan.md -->
<!-- SD Key: SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 -->
<!-- Archived at: 2026-08-18T15:18:24.145Z -->

# Plan: ship-preflight.js reports non-deterministic false BLOCKED verdicts from two root causes, not a fleet-load timeout — 29th+ occurrence, zero SDs from 28 prior reports

## Goal

`scripts/ship-preflight.js` (invoked by `/ship` Step 0.5 before every SD merge, fleet-wide) has been repeatedly misdiagnosed as "slow under fleet load" across 28 feedback reports since 2026-07-01 and one prior completed SD (SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001, 2026-07-16). RCA on this occurrence (sub_agent_execution_results, sd_id 8bf8a248-dc4c-4f67-93eb-c1c27c44fc46, sub_agent_code=RCA, phase=PLAN_VERIFY, session ship-preflight-hang-rca) measured the actual behavior directly and found it is not a hang or a load problem at all: it completes deterministically in ~330s when allowed to finish, and its BLOCKED verdicts are frequently outright false — proven by two consecutive runs against the identical SD/commit producing different verdicts.

Two independent root causes, plus two secondary findings the same investigation surfaced. Fix both root causes; do not repeat the pattern of the three prior partial fixes (each of which treated a downstream symptom and made the next recurrence more expensive).

## Root Cause 1: wrong test scope (scripts/modules/shipping/TestExecutionVerifier.js:162)

`runTests()` shells `npx vitest run` with no `--project` filter. `vitest.config.js:60`'s own comment states a bare `vitest run` executes ALL projects, and that the repo's npm scripts pin `--project unit` deliberately. Preflight therefore runs all 4 projects — 42,218 tests — when CI gates only the `unit` project (3,266 files). Measured: 38 files fail under the unbroken run; 33 of those are in the db-tier project, which CI never runs and whose skip-fence throws from `pg` instead of skipping cleanly outside its designated environment. None of the 38 are in the diff of the SD being shipped when this was observed.

This is the actual mechanism the three prior fixes chased without naming:
- 307e85fb35b (2026-08-13, QF-20260813-529) raised TEST_TIMEOUT_MS from 5min to 20min, sized off a unit-only CI measurement while the command silently runs four projects.
- SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001 (completed 2026-07-16) added `resolveTestExecutionWithRetry` (ship-preflight.js:46-75), which re-runs the entire (4-project) suite on an "inconclusive" verdict — worst case ~40 minutes per retry. Its own diagnosis (SIGTERM-under-timeout misread as a genuine failure) was correct and its fix should NOT be reverted — the inconclusive/retry distinction remains valid for genuine transient conditions. But it treated the symptom (timeouts under "load") without addressing why the run was so large in the first place.
- QF-20260703-388 added a 60s scan deadline to Step 3 (see Root Cause 2) that makes it silently truncate rather than finish, which is what hid Root Cause 2's non-determinism from being noticed sooner.

## Root Cause 2: EHG_BASE_DIR resolves wrong from a worktree (lib/multi-repo/index.js:31)

`export const EHG_BASE_DIR = resolve(__dirname, '../../..')` resolves correctly (`C:\Users\rickf\Projects\_EHG`, 41 repos) when run from the main repo, but resolves to `C:\Users\rickf\Projects\_EHG\EHG_Engineer\.worktrees` when run from inside any worktree — which is where every SD is actually built and where `/ship` actually runs. There are currently 114 sibling worktrees under that directory; each has a `.git` FILE (not a directory) that `existsSync` accepts as a valid repo marker, so `discoverRepos()` treats every sibling worktree as an independent repository — all of them are actually the same repo. The 60s scan deadline (QF-20260703-388) truncates the resulting fan-out at an arbitrary point, and the coordinator computes a `partial` flag (MultiRepoCoordinator.js:76/115/201) that `printSummary` (ship-preflight.js:365-373) never reads — so a truncated, non-representative scan renders identically to a complete one.

Directly measured proof of non-determinism: two consecutive runs against the same SD and the same commit, minutes apart, produced different verdicts — "Found 15 repositories / 0 open PRs, 3 unmerged / 15 actions" vs. "16 action(s) needed / 1 open PRs, 2 unmerged."

## Secondary finding A: dead fast-path (scripts/modules/shipping/TestExecutionVerifier.js findRecentResults())

Nothing in a working tree writes `test-results.json` / `.vitest-results.json` / `coverage/test-results.json` — the only writer is `.github/workflows/test-coverage.yml:94`, which runs exclusively inside a CI runner and is never committed. The verifier writes its own report to `.vitest-preflight-report.json`, a path not in `RESULT_PATHS`. The fast-path this function exists to provide can never trigger; every invocation pays the full multi-project test cost.

## Secondary finding B: SIGTERM/ENOBUFS conflation (scripts/modules/shipping/TestExecutionVerifier.js:177)

The inconclusive-detection logic added by SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001 treats `signal === 'SIGTERM'` as proof of a load-timeout kill. But `execSync`'s default combined stdout+stderr buffer is 1MB and is not raised here; exceeding it also produces a `SIGTERM` kill with `code === 'ENOBUFS'`. A deterministic buffer overflow (running 42,218 tests generates far more than 1MB of combined output — roughly 7x headroom consumed today per direct measurement) is therefore reported as "chronic fleet overload," which would send whoever investigates it looking for a resource-contention problem that isn't there.

## Success Criteria

- [ ] `ship-preflight.js <SD>` invokes vitest scoped to `--project unit`, matching what CI actually gates
- [ ] A run against a clean SD with no unmerged branches completes without ever touching the db-tier (or any non-unit) project
- [ ] `EHG_BASE_DIR` (or its consumer in `discoverRepos()`) resolves to the true repo root from both the main repo and a `.worktrees/*` working directory — verified by running from both locations against the same SD and confirming an identical repo count
- [ ] Two consecutive runs against the same SD/commit from the same location produce identical verdicts (the non-determinism proof above no longer reproduces)
- [ ] `TestExecutionVerifier.js`'s SIGTERM-classification path distinguishes an ENOBUFS/maxBuffer kill from a genuine timeout kill (raise maxBuffer and/or inspect `error.code` before trusting `error.signal` alone), or documents why doing so is out of scope for this SD if descoped
- [ ] `findRecentResults()` either gets a real writer wired to one of `RESULT_PATHS`, or `.vitest-preflight-report.json` is added to `RESULT_PATHS`, or the dead code is removed with the fast-path claim corrected in the docstring — pick one, document the choice
- [ ] Regression check: existing behavior for SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001's genuine timeout/inconclusive/retry path is unchanged for an actual transient kill (not conflated with ENOBUFS)
- [ ] `lib/multi-repo/index.js`'s fix reuses `getRepoRoot`/`stripWorktreeSuffix` (`lib/repo-paths.js:372,378`) rather than reimplementing worktree-root resolution a third time
- [ ] Manual verification: run the fixed `ship-preflight.js` against 2-3 real in-flight SDs from their own worktrees and confirm the verdict matches manual inspection (no unmerged branches, or accurately reports ones that exist)

## Scope

| Path | Action |
|------|--------|
| scripts/modules/shipping/TestExecutionVerifier.js | Fix: add `--project unit` to the vitest invocation (L162); switch `stdio` from `'pipe'` to `['ignore','inherit','inherit']` since the JSON report already goes to `--outputFile` and buffering the child's combined output both hides live progress and creates the ENOBUFS exposure (Secondary B); resolve the SIGTERM/ENOBUFS conflation at L177 |
| lib/multi-repo/index.js | Fix: correct `EHG_BASE_DIR` (L31) to resolve correctly from a worktree, reusing `lib/repo-paths.js`'s existing `getRepoRoot`/`stripWorktreeSuffix`; reject linked worktrees in `discoverRepos()` via `git rev-parse --git-common-dir` vs `--git-dir` comparison rather than accepting any `.git` marker |
| scripts/modules/shipping/MultiRepoCoordinator.js | Investigate: either read and surface the existing `partial` flag it already computes (L76/115/201) so a truncated scan is distinguishable from a complete one, or remove the 60s deadline now that Root Cause 2 (not scan volume) was the actual source of the multi-minute Step 3 duration |
| scripts/ship-preflight.js | Investigate: `printSummary` (L365-373) should read the `partial` flag if MultiRepoCoordinator's fix above keeps it; `resolveTestExecutionWithRetry` (L46-75)'s retry-the-whole-suite cost drops substantially once Root Cause 1 is fixed, but confirm no remaining assumption depends on the old (wrong) scope |
| scripts/modules/shipping/TestExecutionVerifier.js findRecentResults() | Fix or remove per Secondary Finding A — pick one, do not leave as silently-dead code |

Out of scope: rewriting `ship-preflight.js`'s overall architecture; changing what CI itself runs; the db-tier project's own skip-fence behavior (throwing instead of skipping is a separate, db-tier-specific concern outside this SD's file list).

## Risks

- **Regression risk on the SIGTERM/inconclusive path**: SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001's fix is real and load-bearing for genuine transient kills. The fix here must sharpen the classification (exclude ENOBUFS), not remove the inconclusive/retry mechanism entirely. Mitigation: explicit regression test asserting a genuine timeout-SIGTERM (no ENOBUFS code) still classifies as inconclusive.
- **`lib/repo-paths.js` reuse risk**: `getRepoRoot`/`stripWorktreeSuffix` are stated by RCA to already be written and used elsewhere; confirm their actual call sites and behavior before assuming they're a drop-in fix for `lib/multi-repo/index.js` specifically — RCA's own report explicitly did not implement or verify the fix, only located where it should be wired in.
- **Shared-code blast radius**: `lib/multi-repo/index.js` is very likely consumed by scripts beyond `ship-preflight.js` (its name suggests general multi-repo discovery). REGRESSION-agent scope should explicitly enumerate other callers before this ships, since 114 sibling worktrees means any other consumer of `discoverRepos()` from inside a worktree is plausibly exhibiting the identical fan-out bug today, silently.
- **Recurrence-without-SD pattern**: 28 feedback rows across 6+ weeks never converted to an SD despite repeated signaling — this SD exists specifically to break that pattern per RCA's explicit recommendation (`leo-create-sd.js` over a 29th `/signal`). If this SD is deprioritized or descoped without action, the pattern recurs a 29th+ time.

## Evidence

Full RCA analysis, with exact measured timings, direct code citations, and the two-run non-determinism proof: `sub_agent_execution_results`, sd_id `8bf8a248-dc4c-4f67-93eb-c1c27c44fc46`, sub_agent_code=RCA, phase reflecting the ship-preflight-hang-rca investigation (most recent row after `d86fd317-3500-4ae4-b7a9-54047e06a430`, which is the separate success_metrics RCA — do not conflate the two). 28 prior recurrence rows searchable via `feedback` table, category=harness_backlog, all status='new' as of this SD's creation; two named explicitly: 77acc68f (2026-07-17, project-scope finding) and 44f069d5 (2026-08-13, worktree fan-out finding), plus 9788d481 filed the same day as this SD (~1h before this RCA's report).

This SD's own testing-agent and performance-agent consultations (run by the RCA sub-agent as part of its investigation) independently reached the project-scope and worktree fan-out conclusions — three independent analyses converging on the same two root causes.
