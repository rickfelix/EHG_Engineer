<!-- Archived from: docs/plans/sd-leo-infra-ship-auto-merge-hardening-001-plan.md -->
<!-- SD Key: SD-LEO-INFRA-SHIP-AUTO-MERGE-001 -->
<!-- Archived at: 2026-04-28T22:10:02.274Z -->

# Ship Auto-Merge Hardening — Three Compounding Failure Modes

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (`.claude/commands/ship.md`, plus `.github/workflows/*.yml` for the DB Verify workflow secrets fix)

## Summary

`/ship` is supposed to auto-merge PRs when AUTO-PROCEED mode is on (per `.claude/commands/ship.md` Step 6 lines 484-503: _"Auto-execute: `gh pr merge <PR#> --merge --delete-branch`"_). In practice, it consistently fails to merge, leaving PRs in `draft` state on the remote. The SD's database row gets marked `completed`, `/learn` runs, the next SD is selected, and the orphaned PR remains until a human notices it days later. This is the root cause behind the recurring "salvage operation" pattern (e.g., `SD-LEO-INFRA-REPLIT-PLAN-MODE-001` 2026-04-28 cleanup, the SD-MAN-FIX-S18-DEAD-GATE campaign's bad-merge regressions, and the inbox backlog of "DB Verify failed" / "Test Coverage Enforcement failed" CI failures).

Diagnosed live during `SD-LEO-INFRA-REPLIT-PLAN-MODE-001` 2026-04-28 (PR #3411, manually admin-merged after `/ship` would have failed). Three independent layers each sufficient on their own to block the merge:

### Cause 1 — `/ship` does not run `gh pr ready` before `gh pr merge`

LEO PRs are conventionally opened as drafts (correct — they wait for LEAD-FINAL approval before merging). `gh pr merge <PR#> --merge --delete-branch` fails on a draft PR with "this pull request is in draft state". `/ship` Step 6 has no `gh pr ready` step (verified by grep on `.claude/commands/ship.md`: zero matches for `gh pr ready`, `--ready`, or `markPullRequestReadyForReview`). The merge call returns non-zero, but `/ship` proceeds to Step 7 anyway, marking the SD complete in the DB while the PR sits orphaned.

### Cause 2 — DB Verify CI workflow has empty PG secrets on every branch

The "DB Verify" GitHub Actions workflow (`verify` job) calls `bash ops/scripts/staging_apply.sh` with `PGHOST`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` environment variables — but those variables are EMPTY in CI. Run log excerpt from PR #3411:

```
PGHOST: 
PGDATABASE: 
PGUSER: 
PGPASSWORD: 
psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory
##[error]Process completed with exit code 2.
```

This means EVERY PR (and `main` itself per the inbox: 4 entries of "Test Coverage Enforcement failed on main" trace to the same systemic issue) gets `mergeStateStatus: UNSTABLE` because of a CI-infrastructure bug, NOT a real defect. Without `--admin`, no PR can merge cleanly.

### Cause 3 — `enforce_admins: true` on main + `/ship` does not pass `--admin`

`gh api repos/rickfelix/EHG_Engineer/branches/main/protection` confirms `enforce_admins: true`, meaning even the repo owner cannot bypass branch-protection failures without explicitly passing `gh pr merge --admin`. `/ship` Step 6's command (`gh pr merge <PR#> --merge --delete-branch`) does NOT include `--admin`. So even if Cause 1 (draft) is fixed and Cause 2 (DB Verify) is bypassed, the merge still blocks.

## Concrete provenance — RCA from real incident

Captured live during `SD-LEO-INFRA-REPLIT-PLAN-MODE-001` (2026-04-28). Evidence:

| Observation | Source |
|---|---|
| `/ship` Step 6 has no `gh pr ready` step | `grep -n "gh pr ready" .claude/commands/ship.md` returned 0 matches |
| `/ship` Step 6 does not pass `--admin` | `grep -n "admin" .claude/commands/ship.md` returned 0 matches in the merge command |
| DB Verify fails with empty PG secrets | `gh run view 25078575516 --log-failed` for PR #3411 |
| `enforce_admins: true` on main | `gh api repos/rickfelix/EHG_Engineer/branches/main/protection` |
| Recent merges all manual | `gh pr list --state merged --limit 5` shows `mergedBy: rickfelix` (human) for #3406, #3407, #3409, #3410, #3411 — only #3405 was bot-merged (an auto-schema-update workflow, not `/ship`) |
| Inbox confirms recurring CI failures | 4× "Test Coverage Enforcement failed on main", 3× "DB Verify failed on feat/*" entries (untriaged 2-4 days old) |

This is the systemic cause behind:

- The `qf/QF-20260428-RETRO-AGENT-LESSON-TRIAGE` salvage operation — branch was kept in use for unrelated work after PR #3407 merged because the human merger didn't notice the branch hadn't been auto-deleted by `/ship`.
- The S18 dead-gate campaign's bad-merge pattern (memory `feedback_bad_merge_silent_regression_pattern.md`) — sequential QFs in same file masked upstream regressions when the upstream PR's `/ship` flow silently failed to merge.
- The `feedback_sd_already_completed_when_claimed_via_sdnext.md` pattern — DB shows complete but PR is open; sd:next propagation gap is real but the underlying *cause* is `/ship` marking SD complete despite merge failure.

## Acceptance criteria

1. `/ship` Step 6 (when AUTO-PROCEED is ACTIVE) detects a draft PR via `gh pr view <PR#> --json isDraft` and runs `gh pr ready <PR#>` before attempting `gh pr merge`.
2. `/ship` Step 6's merge command includes `--admin` when branch protection on `main` has `enforce_admins: true` (detected at runtime via `gh api repos/<owner>/<repo>/branches/main/protection`). When `enforce_admins: false`, the `--admin` flag is omitted (no unnecessary privilege use).
3. `/ship` Step 6 inspects the exit code of `gh pr merge` and HARD-FAILS the `/ship` invocation on non-zero exit, logging the error. It does NOT silently proceed to Step 7 / `/learn` / next-SD selection on a failed merge.
4. DB Verify workflow either (a) has its `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` secrets configured at the repo or workflow level, OR (b) is short-circuited / made non-blocking for branches that don't touch database migrations. Acceptance test: `gh run view <latest DB Verify run>` exits with status `success` (or `skipped`) for a non-migration PR.
5. The four oldest inbox items referencing "DB Verify failed" or "Test Coverage Enforcement failed on main" are resolved (either by the workflow fix or by triage closure tying them to this SD).
6. After this SD merges, the next 3 SDs that ship through `/ship` auto-merge their PRs without manual intervention. Verified by checking `gh pr list --state merged --limit 5 --json mergedBy` — at least 3 of the 5 most recent merges should be `mergedBy: app/github-actions` or via `/ship`-triggered API calls (logged to `audit_log`).

## Out of scope

- Reworking the entire LEO PR cadence model (3-day cooldown is a separate SD).
- Changing the `enforce_admins` setting itself — keep it on; this SD makes `/ship` aware of and compatible with it.
- Adding new CI workflows. Just fixing the DB Verify secret config and (optionally) making it skippable for non-migration diffs.

## Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| `--admin` flag misuse: `/ship` could merge a genuinely failing PR | Medium | High | The `--admin` flag is gated on `enforce_admins: true` AND the `/ship` adversarial review verdict from earlier steps having already passed. Fail-loud on hard exit code preserves the human-review-required path for verdict=block. |
| DB Verify secret fix introduces secret-leak risk | Low | High | Use repo-scoped secrets, not workflow-injected; inspect the workflow YAML at PR review time. SECURITY sub-agent review during EXEC. |
| Hard-fail on `gh pr merge` exit code breaks edge cases (e.g. already-merged race) | Medium | Medium | Detect "already merged" via `gh pr view --json state` after a non-zero exit; treat `state=MERGED` as success. Add unit tests for both states. |

## Implementation approach

1. **Phase 1 — `/ship` Step 6 hardening** (~50 LOC): Edit `.claude/commands/ship.md` to add `gh pr ready` detection, runtime `enforce_admins` detection, conditional `--admin` flag, and exit-code checking. Mirror tests at `tests/ship/auto-merge-hardening.test.mjs` (use vitest patterns from existing ship-related tests).
2. **Phase 2 — DB Verify CI fix** (~10-30 LOC): Inspect `.github/workflows/<db-verify>.yml`, identify whether secrets are missing entirely or conditionally scoped. Add `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` from repo secrets. Optionally add a path-filter so the workflow only runs when migrations are touched.
3. **Phase 3 — Inbox triage** (~5 LOC): Resolve the 4 oldest "Test Coverage / DB Verify failed" inbox items, pointing to this SD's PR as the closure reason.

Estimated total scope: ~80-120 LOC product code + workflow YAML, plus tests. Tier 3 SD per CLAUDE.md Work Item Routing (>75 LOC + risk keyword "infrastructure" forces Tier 3 anyway).

## Smoke test steps (Q9 — 30-second demo)

1. After this SD merges, file ANY trivial Tier-3 SD (e.g., a doc-only edit) and run it through the full LEO cycle.
2. At LEAD-FINAL-APPROVAL, observe that `/ship` is invoked automatically.
3. Watch the `/ship` output: it MUST display "🤖 AUTO-PROCEED: Auto-merging PR #<n>..." followed by `gh pr ready <n>` (if PR was draft), `gh pr merge <n> --merge --delete-branch --admin` (if `enforce_admins=true`), and exit code 0.
4. Verify PR is MERGED on GitHub within 60 seconds (poll `gh pr view <n> --json state` — expect `MERGED`).
5. Verify SD's row in `strategic_directives_v2` shows `status='completed'` AND PR is merged — both states must agree.
