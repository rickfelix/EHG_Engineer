#!/usr/bin/env node
/**
 * EXEC-phase TESTING evidence for SD-LEO-FIX-ENF-TRUSTS-FILE-001 (EXEC-TO-PLAN gate).
 *
 * RETROSPECTIVE validation of the shipped implementation against
 * PRD-SD-LEO-FIX-ENF-TRUSTS-FILE-001 (AC-1..AC-6, FR-1..FR-7, TS-1..TS-12).
 * Every claim below was independently MEASURED on this worktree by the testing-agent;
 * nothing is taken from the EXEC summary.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'd1b8f30e-de76-4932-9c35-8745542cd716';
const SD_KEY = 'SD-LEO-FIX-ENF-TRUSTS-FILE-001';

async function writeTesting(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 92,
    findings: [
      {
        id: 'F1-BLOCKING-verify-script-is-gitignored-CI-step-cannot-run',
        severity: 'CRITICAL',
        summary: 'scripts/verify-coordinator-pointer-invariant.mjs — the entire FR-5 deliverable — is matched by .gitignore:199 `scripts/verify-*.mjs` and is therefore NOT under version control. MEASURED: `git status --porcelain` never lists it; `git check-ignore -v` returns `.gitignore:199:scripts/verify-*.mjs`; `git add scripts/verify-coordinator-pointer-invariant.mjs` exits 1 with "The following paths are ignored by one of your .gitignore files". CONSEQUENCE: the new serialized step added to .github/workflows/unit-tier.yml (`run: npm run test:coordinator-pointer-invariant`) will fail on EVERY PR with MODULE_NOT_FOUND, because the script it invokes will not exist in the CI checkout. FR-5 AC-2 ("the check passes after FR-1 through FR-4 are applied") is therefore UNMET in CI even though it is fully met locally. This is the exact documented trap class: .gitignore lines 193-198 carry an explicit comment block warning that verify-* scripts are "silently dropped by these patterns" and that committing one "MUST add an explicit `!scripts/verify-<name>.<ext>` exception below" (witnessed QF-20260509-393, scripts/verify-security-audit-integrity.cjs). Nine such `!` exceptions already exist (lines 203-222) — this SD added none. REMEDIATION (one line, no design change): add `!scripts/verify-coordinator-pointer-invariant.mjs` to .gitignore near line 222, then `git add` the script and confirm `git ls-files` reports it.',
      },
      {
        id: 'F2-core-fix-VERIFIED-both-tri-states-independently-measured',
        severity: 'INFO',
        summary: 'FR-1/FR-2/FR-3/FR-4/FR-6/FR-7 are CONFIRMED working by direct re-measurement, not by trusting the EXEC summary. (a) ABSENT-STAYS-ABSENT (TS-6): with no pointer file present, `npm run test:coordinator-pointer-invariant` -> 6 files / 121 tests passed, [POINTER_INVARIANT_OK] present=false, exit 0. (b) PRESENT-STAYS-BYTE-IDENTICAL (TS-11, the primary incident shape): seeded a real .claude/active-coordinator.json sentinel (sha256 17341f002ba88dd5...), ran the suite, sentinel sha256 UNCHANGED and content byte-identical, [POINTER_INVARIANT_OK] present=true, exit 0. (c) 3 CONSECUTIVE runs with the sentinel seeded (FR-1 AC-4 / FR-5 AC-3 / TS-8): 3/3 exit 0, 121/121 tests each, sentinel sha256 identical after all three — zero cross-fork corruption, zero flake. FR-1 AC-3 verified by source read: a single definition site (resolve.cjs:19-21) feeds readPointerFile (default arg, :23), writePointerFile (:58-59), setActiveCoordinator (via writePointerFile) and clearActiveCoordinator (:669 default) — a repo-wide grep for active-coordinator.json confirms no other path.resolve site inside resolve.cjs.',
      },
      {
        id: 'F3-negative-control-PASSED-the-check-is-a-real-detector-not-vacuous',
        severity: 'INFO',
        summary: 'TS-5 / FR-5 AC-1 independently reproduced. Reverted ONLY the two source files (lib/coordinator/resolve.cjs, scripts/hooks/session-role-orient.cjs) to their pre-fix HEAD state, leaving all test files at their post-fix state, reseeded the sentinel, and re-ran the check. RESULT: `[POINTER_INVARIANT_VIOLATED] ... existence changed: present=true -> present=false`, plus `[COMMAND_FAILED] ... exited with code 1`, 9 tests failed across 2 files, and the sentinel file was DESTROYED (ls: No such file or directory). This proves the FR-5 check detects the real defect and does not pass vacuously — and independently re-confirms the original incident shape (present -> deleted). NOTE ON METHOD: used cp-backup + `git checkout --` + cp-restore instead of `git stash`, because git stash is repo-global across worktrees in this repo (98 pre-existing entries, several flagged as foreign/cross-worktree) and a bare pop could take another session\'s entry. Restore verified by sha256: resolve.cjs 38ef397c652ed277... and session-role-orient.cjs 5269a0559302096c... both match their pre-negative-control hashes; `git status --porcelain` is identical to the pre-check state; zero new stash entries created. The worktree was NOT left in the reverted state.',
      },
      {
        id: 'F4-full-unit-tier-GREEN-and-cleaner-than-the-PLAN-phase-baseline',
        severity: 'INFO',
        summary: '`npx vitest run --project unit` (full tier, default pool:forks parallelism) -> Test Files 3345 passed | 15 skipped (3360); Tests 41509 passed | 1 expected fail | 204 skipped | 2 todo (41716); exit 0; duration 146.78s. ZERO failures — the failure set is EMPTY, which is a strict subset of the PLAN-phase baseline pattern (which recorded 1-2 rotating flaky failures per full run across eva/complexity-scorer, governance/guard-wiring, scripts/lint-repo-resolution-drift). No coordinator-related or session-role-orient-related failure appeared. BONUS EVIDENCE EXCEEDING TS-7: the sentinel pointer file was seeded before this FULL 3345-file parallel run and its sha256 was byte-identical afterward — so the isolation holds not merely for the 6 scoped files but against the entire concurrently-forked unit tier.',
      },
      {
        id: 'F5-third-un-gated-hardcoded-copy-of-the-pointer-path-exists',
        severity: 'LOW',
        summary: 'FR-2 exists to stop two independently hand-copied representations of the pointer path from diverging, and the new cross-module agreement test (active-coordinator-file-gate.test.js, test 5) asserts resolve.cjs and session-role-orient.cjs agree. However a THIRD independent hardcode exists and is covered by neither: scripts/hooks/pre-tool-enforce.cjs:1302 does `readFileSync(path.resolve(__dirname, "../../.claude/active-coordinator.json"))` with no VITEST gate. NOT A BLOCKER for this SD: that call is READ-ONLY, so it cannot create, mutate or unlink the pointer file and cannot reproduce the destructive incident class this SD closes. Flagged because the drift-prevention rationale in FR-2 arguably reaches it, and because the cross-module agreement assertion covers 2 of 3 sites. Suggested follow-up (out of scope here): the PLAN-phase evidence already recommended a scripts/lint/ rule forbidding new literal path.resolve() sites for .claude/active-coordinator.json outside the definition sites.',
      },
      {
        id: 'F6-FR-5-AC-1-negative-control-is-manual-only-not-encoded',
        severity: 'LOW',
        summary: 'FR-5 AC-1 ("the check fails when run against current main (pre-fix) — proves it actually detects the defect") is satisfied only by manual execution (mine, F3 above, and EXEC\'s). Nothing in the committed artifacts re-proves it on an ongoing basis — no test asserts that verify-coordinator-pointer-invariant.mjs reports POINTER_INVARIANT_VIOLATED when the gate is absent. If a future refactor silently blinded the checker (for example by making it import the gated constant, the exact failure mode its own header comment warns about), CI would stay green. Acceptable for this SD — the guard is young and its own header documents the constraint — but worth recording as the residual gap, since "a guard that cannot fail" is the pattern class this SD belongs to.',
      },
      {
        id: 'F7-PRD-AC-3-covered-by-construction-not-by-direct-execution',
        severity: 'LOW',
        summary: 'PRD top-level AC-3 ("setActiveCoordinator(supabase, sessionId) called with no opts (production 2-arg form) still writes to the real ACTIVE_COORDINATOR_FILE when VITEST is unset") is proven compositionally, not by executing the function: active-coordinator-file-gate.test.js test 2 asserts the CONSTANT resolves to the real .claude path with VITEST deleted from the environment, and source inspection confirms writePointerFile (resolve.cjs:58-59) writes to that same single module-level constant with no override. Direct execution coverage is arguably undesirable here — a test that actually invoked the 2-arg form with VITEST unset would write to the real pointer file, which is precisely what this SD forbids. Recording the distinction so a future reader does not mistake constant-level proof for behavioural proof.',
      },
      {
        id: 'F8-hygiene-and-scope-CLEAN',
        severity: 'INFO',
        summary: 'No stray debug code, no commented-out code, no incomplete-work marker comments of any kind, no `debugger`, and no `.only(`/`.skip(` in any changed or added file. The only console.* hits in the touched files are (a) pre-existing lines in resolve.cjs (619/625/626) and session-role-orient.cjs (379) that lie OUTSIDE the diff hunks, and (b) the verifier\'s own intentional [POINTER_INVARIANT_OK] result output. Diff scope is exactly FR-1..FR-7 and nothing else: 6 modified files, +39/-7 lines total — resolve.cjs (FR-1, +9/-1), session-role-orient.cjs (FR-2, +8/-2 incl. the COORD_FILE export), role-handoff.test.js (FR-3, +6/-3), session-role-orient.test.js (FR-4, +5/-1), package.json (+1 script), unit-tier.yml (FR-5, +10) — plus the new gate test file (FR-6/FR-7, 6 tests) and the new verifier script (FR-5). FR-3 AC-1 confirmed: role-handoff.test.js no longer path.resolve()s the pointer file, and its `path` import remains legitimately used (post-checkout require at :38, path.dirname(COORD_FILE_ABS) at :57). FR-3 AC-4 confirmed: COORD_FILE_ABS uses a fresh top-level require(\'./resolve.cjs\') at :31, not the beforeEach-assigned `resolve` variable. FR-4 confirmed: COORD_PATH = loadHook().COORD_FILE at :80, with loadHook declared at :18 (no TDZ). No unrelated files touched.',
      },
      {
        id: 'F9-tmpdir-fixture-directories-are-never-cleaned-up',
        severity: 'LOW',
        summary: 'HOUSEKEEPING, not a correctness issue. The per-PID isolation directories accumulate and are never removed: 48 `leo-coord-test-<pid>` directories were present in os.tmpdir() after this validation session. Each holds a small JSON file and the OS reclaims tmpdir eventually, so there is no functional or disk-pressure risk at this scale. Noted only because a developer running the unit tier repeatedly will accumulate one directory per fork per run indefinitely. No action required for this SD.',
      },
    ],
    warnings: [
      {
        severity: 'CRITICAL',
        issue: 'FR-5 deliverable scripts/verify-coordinator-pointer-invariant.mjs cannot be committed (.gitignore:199 `scripts/verify-*.mjs`), so the CI step added to unit-tier.yml will fail with MODULE_NOT_FOUND on every PR.',
        recommendation: 'Add `!scripts/verify-coordinator-pointer-invariant.mjs` to .gitignore alongside the nine existing verify-* exceptions (lines 203-222), then `git add` the script and confirm with `git ls-files scripts/verify-coordinator-pointer-invariant.mjs` before the EXEC-TO-PLAN handoff. Re-run `npm run test:coordinator-pointer-invariant` afterward to confirm nothing else regressed.',
      },
      {
        severity: 'LOW',
        issue: 'A third un-gated hardcoded copy of the pointer path exists at scripts/hooks/pre-tool-enforce.cjs:1302 (read-only, cannot reproduce the destructive incident), outside the cross-module agreement assertion.',
        recommendation: 'Out of scope for this SD. Consider the previously-recommended scripts/lint/ rule forbidding new literal path.resolve() sites for .claude/active-coordinator.json outside the two definition sites.',
      },
    ],
    metadata: {
      files_reviewed: [
        'lib/coordinator/resolve.cjs',
        'lib/coordinator/role-handoff.test.js',
        'lib/coordinator/active-coordinator-file-gate.test.js',
        'scripts/hooks/session-role-orient.cjs',
        'scripts/hooks/__tests__/session-role-orient.test.js',
        'scripts/verify-coordinator-pointer-invariant.mjs',
        'scripts/hooks/pre-tool-enforce.cjs',
        'package.json',
        '.github/workflows/unit-tier.yml',
        '.gitignore',
      ],
      commands_run: [
        'npm run test:coordinator-pointer-invariant (no sentinel, absent-stays-absent) -> exit 0, 121/121',
        'npm run test:coordinator-pointer-invariant (sentinel seeded, present-stays-identical) -> exit 0, 121/121, sha256 unchanged',
        'npm run test:coordinator-pointer-invariant x3 consecutive (sentinel seeded) -> 3/3 exit 0, sha256 unchanged',
        'negative control: git checkout -- resolve.cjs session-role-orient.cjs; reseed sentinel; re-run -> POINTER_INVARIANT_VIOLATED present=true->false, exit 1, sentinel destroyed; then restored (sha256 verified)',
        'npx vitest run --project unit (full tier, sentinel seeded) -> exit 0, 3345 files passed / 41509 tests passed / 0 failures, sentinel sha256 unchanged',
        'git check-ignore -v scripts/verify-coordinator-pointer-invariant.mjs -> .gitignore:199',
        'git add scripts/verify-coordinator-pointer-invariant.mjs -> exit 1, path ignored',
        'hygiene grep for console.*, incomplete-work marker comments, debugger, .only(, .skip( across all changed files',
      ],
      acceptance_criteria_coverage: {
        'AC-1 (5 files pass zero failures)': 'VERIFIED — 121/121 across 6 files, 3 consecutive runs; also 0 failures in the full 3345-file tier',
        'AC-2 (real file hash+existence identical before/after)': 'VERIFIED — both tri-states measured directly',
        'AC-3 (2-arg setActiveCoordinator writes real path when VITEST unset)': 'INDIRECT — constant-level test + single-definition-site source proof (see F7)',
        'AC-4 (COORD_FILE exported and consumed, not recomputed)': 'VERIFIED — diff + loadHook().COORD_FILE at test :80',
        'AC-5 (3 consecutive concurrent runs, zero cross-fork corruption)': 'VERIFIED — 3/3 clean',
        'AC-6 (seeded sentinel survives byte-identical)': 'VERIFIED — sha256 17341f002ba88dd5... unchanged',
        'TS-1': 'VERIFIED', 'TS-2': 'VERIFIED (gate test 2, require.cache idiom)', 'TS-3': 'VERIFIED (session-role-orient suite green on redirected path)',
        'TS-4': 'VERIFIED (role-handoff interceptor assertions pass)', 'TS-5': 'VERIFIED MANUALLY (negative control, not encoded — see F6)',
        'TS-6': 'VERIFIED', 'TS-7': 'VERIFIED (exceeded — full tier, sentinel survived)', 'TS-8': 'VERIFIED',
        'TS-9': 'VERIFIED (gate test 4)', 'TS-10': 'VERIFIED (gate test 5)', 'TS-11': 'VERIFIED', 'TS-12': 'VERIFIED (gate test 6)',
        'FR-1': 'MET', 'FR-2': 'MET', 'FR-3': 'MET', 'FR-4': 'MET',
        'FR-5': 'NOT MET IN CI — artifact works locally but is gitignored and cannot reach CI (F1, BLOCKING)',
        'FR-6': 'MET', 'FR-7': 'MET',
      },
      side_effects_cleaned: 'QA sentinel .claude/active-coordinator.json removed (it was ABSENT before validation and is ABSENT after). Both reverted source files restored and sha256-verified. Zero git stash entries created. git status --porcelain identical to pre-validation state.',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    summary: 'CONDITIONAL_PASS (confidence 92). Independent re-measurement confirms the EXEC implementation works: the coordinator pointer-file isolation holds in both tri-states (absent-stays-absent and present-stays-byte-identical), across 3 consecutive scoped runs, AND across the full 3345-file / 41509-test unit tier at default pool:forks parallelism with zero failures — a strictly cleaner result than the PLAN-phase baseline, which recorded 1-2 rotating flakes per full run. The negative control passed: reverting only the two source files (test files left post-fix) made the FR-5 checker report POINTER_INVARIANT_VIOLATED present=true->false and destroy the seeded sentinel, proving the check is a real detector rather than a vacuous pass; the worktree was fully restored and sha256-verified afterward. FR-1, FR-2, FR-3, FR-4, FR-6 and FR-7 are all MET, hygiene is clean (no debug/TODO/commented-out code), and the diff is scoped to exactly FR-1..FR-7 with no unrelated changes. ONE BLOCKING DEFECT prevents an unconditional PASS: scripts/verify-coordinator-pointer-invariant.mjs — the whole FR-5 deliverable — is matched by .gitignore:199 `scripts/verify-*.mjs` and cannot be committed (git add exits 1; git check-ignore confirms), so the new serialized step in .github/workflows/unit-tier.yml will fail with MODULE_NOT_FOUND on every PR and FR-5 AC-2 is unmet in CI. This is the exact trap the .gitignore comment block warns about (witnessed QF-20260509-393); nine sibling `!scripts/verify-*` exceptions already exist and this SD added none. Remediation is one line — add `!scripts/verify-coordinator-pointer-invariant.mjs` — with no design change. Three LOW residual findings recorded: a third un-gated but read-only hardcode at pre-tool-enforce.cjs:1302 outside the cross-module agreement assertion, FR-5 AC-1 being satisfied manually rather than encoded, and PRD AC-3 proven compositionally rather than behaviourally. EXEC-TO-PLAN is ready once the .gitignore exception lands and the script is confirmed tracked via git ls-files.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const testing = await writeTesting(supabase);
  console.log('TESTING row:', testing.id, '| verdict:', testing.verdict, '| confidence:', testing.confidence, '| phase:', testing.phase);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
