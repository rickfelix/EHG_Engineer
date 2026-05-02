<!-- Archived from: docs/plans/qf-lifecycle-reconciliation-plan.md -->
<!-- SD Key: SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 -->
<!-- Archived at: 2026-04-24T03:10:09.109Z -->

# QF lifecycle reconciliation: orphan-PR reaper and sd:next PR-state cross-check

## Summary

With 3-4 parallel Claude Code sessions active, the `quick_fixes` table regularly becomes desynchronized from GitHub PR state. `complete-quick-fix.js` is the only code path that flips `quick_fixes.status='open'` → `completed`, but sessions increasingly use direct `gh pr merge` instead (because `complete-quick-fix.js` has three known false-block bugs already documented in session memory). Result: QF DB rows remain `status='open'` indefinitely after their PRs ship, and `sd:next`'s `loadOpenQuickFixes` surfaces them as "work to do" — causing parallel sessions to race, adopt abandoned work, or attempt to re-implement already-shipped fixes.

This failure mode was witnessed live 2026-04-24 03:00 UTC: a `/leo next` invocation recommended QF-20260423-380 as open work. PR #3282 had been CI-green+CLEAN for 5+ hours. During a ~10-minute analysis window, a parallel session merged the PR via `gh pr merge` WITHOUT flipping the DB row. The claim succeeded because `claiming_session_id` was still null, and a direct-DB-upsert was required to close the loop.

QF-20260423-380 (merged in PR #3282) partially addresses the 30-90s pre-merge race by filtering `pr_url IS null AND commit_sha IS null` in `loadOpenQuickFixes`. This SD addresses the post-merge rot window, which can last indefinitely because nothing else reconciles DB state against GitHub.

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (LEO internal tooling)

## Success Criteria

- **AC1**: Given a `quick_fixes` row with `status='open'` and `pr_url` pointing to a MERGED PR, after a reaper run the row has `status='completed'` with correct `commit_sha` and `completed_at`.
- **AC2**: Given a fresh `quick_fixes` row (created < 5 minutes ago, in-progress), the reaper does NOT modify it.
- **AC3**: `sd:next`'s "OPEN QUICK FIXES" section does not list QFs whose PRs are MERGED on GitHub.
- **AC4**: `sd:next` emits `AUTO_PROCEED_ACTION:qf_merge` for QFs with CI-green open PRs; `qf_start` only fires for QFs with no PR.
- **AC5**: Each reaper run produces structured log entries with QF-ID, PR number, merge SHA, and reconciliation outcome.
- **AC6**: Reaper is idempotent — running it twice produces no DB churn.
- **AC7**: Reaper is observable — a `orphan_qf_reconciliations` or equivalent log/metric surfaces the count of QFs reconciled per run, making pipeline health visible without parsing logs by hand.

## Scope

### FR1 — Orphan-QF reaper script

New `scripts/orphan-qf-reaper.mjs` that:
- Queries `quick_fixes` for rows with `status IN (open, in_progress)` AND `pr_url IS NOT NULL`.
- For each candidate, resolves PR number from `pr_url`, calls `gh pr view <n> --json state,mergeCommit,mergedAt`.
- When PR state is `MERGED`: idempotently update the row to `status='completed'`, populate `completed_at` from `mergedAt`, populate `commit_sha` from `mergeCommit.oid`, set `compliance_verdict='PASS'`, and write a short `compliance_details` noting auto-reconciliation.
- Skip rows younger than 5 minutes (avoid stepping on in-flight `complete-quick-fix.js`).
- Emit structured JSON log lines per row evaluated (matched / skipped / reconciled / errored).
- Exit 0 with a summary count; non-zero only on hard failure (e.g., cannot reach DB or `gh` is unavailable).

### FR2 — sd:next loader PR-state cross-check

Extend `loadOpenQuickFixes` in `scripts/modules/sd-next/data-loaders.js`:
- For each returned row with a populated `pr_url`, resolve PR state via `gh pr view` (with a 60-second in-memory cache keyed by PR URL to avoid thrashing in fleet mode).
- Omit QFs whose PRs are MERGED from the "open" list (belt-and-suspenders with QF-380's filter, since the reaper runs async and can lag).
- Include QFs whose PRs are OPEN with all CI checks green, but tag them with `ready_to_merge=true` in the returned rows.
- `sd-next.js`'s `AUTO_PROCEED_ACTION` emission checks the flag: `qf_merge` for `ready_to_merge=true`, `qf_start` otherwise. Downstream `/leo next` dispatch handles the two actions differently (merge vs. implement).

### FR3 — Scheduling, observability, test coverage

- FR1 runs either as a scheduled GitHub Action (every 15 min, narrow-scope job) OR as a hook inside the existing `session-tick` daemon (less infrastructure, same signal). Default to the Action for simpler observability; session-tick integration is a documented alternative.
- Unit tests for the loader (`loadOpenQuickFixes`) covering: MERGED omission, ready_to_merge tagging, no-PR-yet passthrough, cache hit/miss paths.
- Integration test that seeds a merged-but-open QF row, runs the reaper script, and asserts the row flipped correctly.
- Documentation block added to `CLAUDE_CORE.md` (or a dedicated LEO infrastructure doc) describing the reconciliation architecture so future sessions understand the guarantee.

## Non-Goals

- NOT fixing the three known bugs in `complete-quick-fix.js` (separate concern — reaper serves as a safety net until that lands).
- NOT harmonizing `claimed_at` / `started_at` column-name drift across `claude_sessions` vs `quick_fixes` (cosmetic refactor, low ROI).
- NOT restructuring SessionStart auto-registration of `claude_sessions` rows (adjacent observed issue, separate SD if warranted).
- NOT changing how QF PRs are merged; teams and sessions pick their own tooling.

## Key Technical Decisions

**Cross-check at read time vs write time**: Both. FR1 reconciles asynchronously (DB becomes eventually consistent). FR2 re-checks at read time so the user-facing `sd:next` output is correct even when the reaper lags. Defense in depth.

**`gh` CLI vs GitHub REST API directly**: Use `gh` because it's already present in the dev environment, handles auth via existing session, and the rate-limit profile is friendlier for short bursts. If call volume grows, swap to Octokit via existing `lib/github-client.js`.

**Idempotency guarantee**: All reaper updates use `.eq('status', 'open')` or `.eq('status', 'in_progress')` in the WHERE clause, so re-running on already-completed rows is a no-op.

**Safety window**: 5-minute floor avoids racing `complete-quick-fix.js` which may still be executing its multi-step flow on a freshly-merged QF.

## Supporting Evidence

- **Primary incident**: 2026-04-24 03:00 UTC, recovered via direct-DB-upsert documented in memory `feedback_orphan_qf_witnessed_live.md` and `project_qf_380_completed_via_adoption.md`.
- **Partial prior fix**: PR #3282 (QF-20260423-380), merged 2026-04-24 02:57:46 UTC — covers pre-merge window, not post-merge.
- **Context memories reinforcing that direct-DB-upsert is the norm (root cause signal)**: `feedback_complete_quick_fix_loc_and_test_bugs.md`, `feedback_complete_quick_fix_hang_bug.md`, `feedback_qf_db_stale_after_merge.md`.

## Vision Alignment

Supports O-GOV-2 (LEO Intelligence Integration — 100% complete) by hardening sd:next as a governance surface that accurately reflects ground-truth state. Also reduces fleet-mode friction in line with the Chairman-orchestrates-AI-agents direction: the current DB-vs-PR desync is a linear-cost bug as agent-count grows.

## Risks

- **Risk**: `gh` CLI in CI vs. dev environment auth may differ. **Mitigation**: reaper script checks `gh auth status` on start and fails fast with a clear error if unauthenticated.
- **Risk**: Rate-limit from GitHub if fleet mode balloons and sd:next runs dozens of times per hour. **Mitigation**: 60s in-memory cache per PR URL, and reaper runs at most every 15 min.
- **Risk**: Reconciliation of in-flight QFs could race with `complete-quick-fix.js`. **Mitigation**: 5-minute safety window + idempotent updates + `.eq('status', 'open')` guard.

## Estimated Scope

~300-450 LOC across reaper script, loader enhancement, tests, and docs. Tier 3 per CLAUDE.md Work Item Routing → full SD workflow (infrastructure type: 4 handoffs, skip EXEC-TO-PLAN, 80% gate threshold, DOCMON required).
