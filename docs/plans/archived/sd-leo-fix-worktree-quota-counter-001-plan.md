<!-- Archived from: docs/plans/worktree-counter-fs-to-git-plan.md -->
<!-- SD Key: SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001 -->
<!-- Archived at: 2026-04-24T14:50:11.588Z -->

# Worktree quota counter drifts: fs.readdirSync over-counts stale/orphan directories vs registered git worktrees

## Type

infrastructure

## Priority

medium

## Target Application

EHG_Engineer (`scripts/resolve-sd-workdir.js` + `lib/worktree-manager.js`)

## Summary

The worktree quota counter at `scripts/resolve-sd-workdir.js:174-180` (`countWorktreeDirs`) enumerates `.worktrees/*` directory entries (excluding helpers `_archive`, `qf`, `sd`, `adhoc`) as a proxy for "active worktrees consuming quota". The parity counter in `lib/worktree-manager.js::createWorkTypeWorktree` is identical. This over-counts by including:

1. **Stale orphan directories** from SDs that completed but whose `.worktrees/<SD-KEY>/` subtree was not removed. The existing `scripts/modules/shipping/post-merge-worktree-cleanup.js` archives worktree metadata (writes to `.worktrees/_archive/...`) but leaves the original directory when `reason="unpushed_commits"` — observed on 2026-04-24 after three near-simultaneous parallel-session ships (`SD-LEO-INFRA-CREATION-PARSER-HARDENING-001`, `SD-LEO-INFRA-FIX-CLAUDE-CODE-001`, `SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001`) left all three directories as orphans that the counter still counted.
2. **Dead-worktree registrations** that `git worktree list` no longer tracks but whose filesystem directory lingers (typically from interrupted `git worktree remove` or ancient sessions).
3. **Any non-worktree directory** a human or script placed under `.worktrees/` (observed: `QF-20260423-HANDOFF-BUGS/` which is not a registered worktree).

**Concrete incident (2026-04-24)**: sd-start reported `Worktree limit reached (20/20)` and auto-released the claim on `SD-LEARN-FIX-ADDRESS-PAT-LEAD-001`. The status-line widget (which uses `git worktree list`) showed 9 active worktrees. The actual git-registered count was 17. The filesystem count was 20. The delta of 11 was entirely orphan directories from completed SDs.

The correct source of truth is `git worktree list --porcelain`, which only enumerates worktrees git actually knows about. The filesystem scan is a leaky proxy that artificially climbs with every merge (because `_archive/` contents don't count, but the original directory often isn't removed) and produces false-positive quota errors even when registered worktree usage is nowhere near the limit.

## Depends On

None. This is localized to two files and a corresponding helper in `lib/worktree-manager.js`. No runtime coupling with any in-flight SD.

## Success Criteria

- **AC1**: `countWorktreeDirs(worktreesDir)` (renamed or re-implemented as `countActiveWorktrees(repoRoot)`) returns the number of non-main entries from `git worktree list --porcelain`, not a directory scan. Exclude main repo worktree (`bare` flag or path match) but include all registered `.worktrees/*` entries.
- **AC2**: Parity update applied to `lib/worktree-manager.js::createWorkTypeWorktree` so both quota checkers use identical logic. (Sharing a helper is preferred; at minimum, both must call the same function.)
- **AC3**: Given a `.worktrees/` directory containing 10 registered worktrees + 10 orphan directories (no git registration), the counter returns 10, and sd-start succeeds (does NOT return `Worktree limit reached`).
- **AC4**: Given a `.worktrees/` directory with 20 registered worktrees, the counter returns 20, and sd-start correctly blocks with the original error message (quota still enforced at the real boundary).
- **AC5**: On every successful `sd-start.js` claim followed by post-merge cleanup, any orphan directory left behind by the archival fallback is detected and emitted as a WARN-level log line. Behavior doesn't change (still respect `reason="unpushed_commits"`), but the orphan is visible for the reaper/maintenance.
- **AC6**: Unit tests cover both quota paths with a temp git-repo fixture: (a) orphans ignored, (b) real worktrees counted, (c) helper-directory exclusions preserved (`_archive`, `qf`, `sd`, `adhoc`), (d) counter is zero on a fresh repo.
- **AC7**: Integration test asserts that sd-start succeeds when fs count is 20 but git-registered count is ≤19 — the exact incident pattern from 2026-04-24.

## Scope

### FR1 — Replace `countWorktreeDirs` with git-registered enumeration

In `scripts/resolve-sd-workdir.js`:
- Replace `countWorktreeDirs(worktreesDir)` with `countActiveWorktrees(repoRoot)`.
- Implementation: `execSync('git worktree list --porcelain', { cwd: repoRoot })`, parse `worktree <path>` entries, filter out the main repo (detect by `bare` flag or by path == `repoRoot`), return the count.
- Keep the `WORKTREE_QUOTA_HELPERS` export for documentation (helpers are NOT registered as worktrees anyway, so they are naturally excluded — no filter needed in the new implementation, but preserve the export for any downstream caller or test).

### FR2 — Parity update in `lib/worktree-manager.js`

In `lib/worktree-manager.js::createWorkTypeWorktree`:
- Replace the directory-scan quota check with a call to the same `countActiveWorktrees` helper (extract to a shared module, e.g. `lib/worktree-quota.js`, or import from `scripts/resolve-sd-workdir.js` if module boundaries allow).
- Verify the error message and `errorCode` are unchanged (downstream callers parse them).

### FR3 — Orphan-directory warning signal

In `scripts/resolve-sd-workdir.js` (and/or `lib/worktree-manager.js`):
- After computing the registered-worktree count, also compute the filesystem count (same logic as the old counter).
- If `fsCount - registeredCount > 0`, emit a structured log line: `[worktree-quota] ORPHAN_DETECTED: <fsCount - registeredCount> orphan directories in .worktrees/ (fs=<fsCount>, git-registered=<registeredCount>). Run cleanup or invoke the reaper.` 
- Non-blocking — just a visibility signal. Does NOT change flow.

### FR4 — Tests

- `scripts/resolve-sd-workdir.test.js` (NEW or extend):
  - temp-repo fixture using `mkdtemp`, `git init`, `git worktree add`
  - Case: 0 worktrees → count = 0
  - Case: 3 registered worktrees + 5 orphan directories → count = 3
  - Case: 20 registered worktrees → count = 20, AT limit
  - Case: helpers `_archive`, `qf`, `sd`, `adhoc` never registered → count unaffected
- `lib/worktree-manager.test.js` (NEW or extend):
  - Same fixtures, same assertions via `createWorkTypeWorktree` happy path + quota-reject path
- Integration regression: `scripts/__tests__/worktree-quota-fs-vs-git.test.js` (NEW)
  - Simulates the 2026-04-24 incident: 20 filesystem dirs (10 real + 10 orphan), asserts sd-start succeeds with 10 registered

## Non-Goals

- **NOT adding an orphan-directory reaper.** That is orthogonal work — likely adjacent to `SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001` which already handles the DB side for QFs. A filesystem reaper would be a new SD (recommended follow-up).
- **NOT changing `post-merge-worktree-cleanup.js`'s archival behavior.** The script correctly preserves directories when `reason="unpushed_commits"` as a safety measure; changing that risks code loss. The fix is upstream (in the counter) not downstream.
- **NOT raising the 20 limit.** The limit was already raised once (`QF-20260422-155`, 10→20). Further raises are symptomatic; the real problem is the counter, and that is what this SD fixes.
- **NOT touching `WORKTREE_QUOTA_HELPERS` semantics.** The helper-directory allowlist is preserved for documentation and any downstream caller that may still need it.
- **NOT migrating to `git worktree list --json`.** That format is newer (git 2.36+); `--porcelain` is universally supported and the output is stable and parseable. Stay portable.

## Key Technical Decisions

**Why `git worktree list --porcelain` instead of `--json`**: `--porcelain` has been stable since git 2.x, covers all supported platforms, and parses with ~5 lines of split-and-collect. `--json` landed in git 2.36 (2022) and would raise the minimum supported git version with no corresponding benefit. Both return the same fields we need (`worktree`, `branch`, `bare`).

**Why the orphan warning (FR3) is non-blocking**: turning it into a blocker would force an action from whoever happens to trigger sd-start next (random-session tax), which is hostile. A visibility signal in structured logs is the right reversibility-first default — a future reaper SD can consume the log. If orphan accumulation becomes a real problem (e.g., fills disk), we escalate.

**Why I did NOT fold this into `SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001`**: that SD targets the DB reconciliation layer (open `quick_fixes` rows whose PRs merged). The filesystem layer is orthogonal — different failure mode (directory lingers on disk) with a different reaper mechanism (rm -rf vs SQL update). Shared vocabulary ("orphan"), separate mechanism. If there's already a filesystem reaper in flight somewhere in the fleet, mark this SD cancelled and link it there.

**Why use `git worktree list` not `.git/worktrees/*`**: the internal `.git/worktrees/<id>/gitdir` files are an implementation detail of git that may change between versions. The CLI is the stable contract.

## Supporting Evidence

- **Primary incident (2026-04-24)**: sd-start failure log captured at `scripts/resolve-sd-workdir.js:269-277` output `Worktree limit reached (20/20)` while `git worktree list | wc -l` returned 17 (9 non-main) and the session status-line widget showed 9. Delta = 11 orphan directories. Incident during this session's attempt to claim `SD-LEARN-FIX-ADDRESS-PAT-LEAD-001` immediately after shipping `SD-LEO-INFRA-CREATION-PARSER-HARDENING-001` (PR #3301 merged).
- **Post-merge cleanup gap**: `scripts/modules/shipping/post-merge-worktree-cleanup.js` output on the same incident: `{"cleaned":false,"reason":"unpushed_commits","commits":["091cc206d6 feat(SD-LEO-INFRA-CREATION-PARSER-HARDENING-001): harden SD-creation parsers..."],"archived":true,"archivePath":"C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\_archive\\SD-LEO-INFRA-CREATION-PARSER-HARDENING-001-2026-04-24T14-31-42-448Z","mainRepoPath":"C:/Users/rickf/Projects/_EHG/EHG_Engineer","workKey":"SD-LEO-INFRA-CREATION-PARSER-HARDENING-001","sdKey":"SD-LEO-INFRA-CREATION-PARSER-HARDENING-001","resolvedFrom":"scan"}` — the archival correctly copied the worktree metadata to `_archive/`, but the original directory was preserved (correctly, given the `unpushed_commits` signal), so the counter kept seeing it.
- **Adjacent SD**: `SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001` (ORPHAN-QF DB reaper) — shipped 2026-04-24, handles the DB-side analog for QFs but does not touch filesystem worktrees.
- **Prior related work**: `QF-20260422-155` raised the worktree limit from 10 to 20 as a short-term palliative. This SD is the root-cause fix: with correct counting, the 20 limit becomes adequate for typical parallel-fleet operation again.
- **Manual unblock used during the incident**: `git worktree prune` + `rm -rf` on three known-safe orphan directories (mine plus two parallel sessions' just-shipped SDs). This got the count down to 17 filesystem dirs, which unblocked sd-start. Manual unblocking works but is unsustainable at scale.

## Vision Alignment

Supports **O-GOV-1 (Foundation Cleanup)** and **O-GOV-2 (LEO Intelligence Integration)**. Worktree quota is a coordination primitive for every parallel Claude Code session. A false-positive quota error blocks a claim, forcing manual filesystem intervention — exactly the kind of operator burden governance layer should prevent. Fixing the counter restores the implicit contract that "the limit is about real worktrees, not stale directories" and eliminates a class of incident response that the fleet currently absorbs silently.

## Risks

- **Risk**: `git worktree list --porcelain` is slow on a repo with many worktrees (p95 ~100ms for 20 worktrees locally). **Mitigation**: the call is on a cold path (sd-start claim, human-initiated, not a loop). Measure in FR4 tests; if >500ms, cache for the duration of the sd-start invocation.
- **Risk**: The parity fix in `lib/worktree-manager.js` breaks a downstream caller that implicitly depended on the old fs-scan behavior (e.g., included orphans in its count). **Mitigation**: grep for `countWorktreeDirs` call sites before the PR (expected: zero outside the two files); any external caller becomes part of the PR diff and is migrated in-place.
- **Risk**: Git CLI behavior differs across git versions (shouldn't — `--porcelain` is stable). **Mitigation**: pin expected output format in parser logic, emit a warning (non-blocking) if unexpected lines appear.
- **Risk**: The orphan warning (FR3) becomes noise and operators learn to ignore it. **Mitigation**: only emit when `fsCount > registeredCount`; so if the fleet is clean (no orphans), the warning never fires. If it fires regularly, that IS the signal (a reaper is needed).
- **Risk**: Future maintenance of `lib/worktree-manager.js::createWorkTypeWorktree` drifts from the parity call site. **Mitigation**: extract to a shared helper module (`lib/worktree-quota.js`) so both call sites import the same function. Single source of truth.

## Estimated Scope

~80-120 LOC across:
- `scripts/resolve-sd-workdir.js` — ~25 LOC (replace counter + orphan warning)
- `lib/worktree-manager.js` — ~15 LOC (import shared helper, remove inline logic)
- `lib/worktree-quota.js` (NEW) — ~30 LOC (shared `countActiveWorktrees(repoRoot)` + helper)
- `scripts/resolve-sd-workdir.test.js` (NEW or extend) — ~40 LOC
- `scripts/__tests__/worktree-quota-fs-vs-git.test.js` (NEW integration) — ~30 LOC

Tier 2 or 3 per CLAUDE.md Work Item Routing (boundary between 75 and 125 LOC; infrastructure hot-path). If auto-routed to Tier 2 via triage-gate, let QF workflow handle; if escalated to Tier 3, standard infrastructure SD path (4 handoffs, 80% gate threshold).
