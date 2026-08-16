# Session state — fleet worker Golf (callsign), session 75532716-03c9-476c-992e-068ec7e66bf0

Autonomous fleet worker under coordinator 0d37100a-d9a9-4d54-a711-2466e22244ec.
Compacted 2026-08-15 ~21:24 ET. Currently in worktree `.worktrees/qf/QF-20260815-748`,
branch `qf/QF-20260815-748` (PR #7071 just merged, branch deleted remotely — this
worktree/branch's local copy is now stale/mergeable-cleanup-eligible).

## What this session completed, in order

1. **SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001** — full LEAD→PLAN→EXEC→PLAN→LEAD
   cycle, `status=completed`. Fixed Adam's SMS decision packets never staging a
   matchable chairman_notifications row + reply token (PR #7051, then a docs
   follow-up PR #7059). Full post-completion tail run: /document, /heal sd (89/100),
   /learn (auto-approve, nothing qualified), capture-completion-flags (2 flags: a
   SUCCESS_METRICS gate regex parsing bug, and an already-signaled DB-connectivity
   harness bug).
2. **QF-20260728-720** (merged PR #7064) — six fleet-state fields whose NAME asserts
   one thing and whose implementation measures something cheaper (the
   "field-name-is-a-claim" class, documented at
   `docs/reference/field-name-is-a-claim.md`). Implemented 2 of 6 negative tests
   (`commits_since_claim` via `it.fails`, `loop_state='exited'` via structural
   census). Deep-tier adversarial review (2 rounds) found and fixed 2 real WARNINGs
   (shell-injection-shaped surface widening on `collectGitMetrics`'s export; a
   regex blind spot in the census test). Left `status=in_progress` (honest partial
   scope, `--scope-accepted` NOT attested), filed follow-up **QF-20260815-748**.
3. **QF-20260815-748** (merged PR #7071, this worktree) — while starting the
   follow-up, discovered my OWN earlier doc entry for `loop_state='awaiting_tick'`
   was WRONG: I'd only checked `session-register.cjs` (SessionStart-only clearer)
   and missed that `SD-LEO-INFRA-LOOP-STATE-AWAITING-001` already shipped a second,
   correct clearer (`scripts/hooks/loop-state-resume-clear.cjs`, UserPromptSubmit,
   12 passing tests). Corrected the doc, narrowed remaining scope to 3 fields
   (`acknowledged_at`, `last_tool_at`, `delivered_at`), shipped that correction as
   its own PR. **QF-20260815-748 itself is still `status=in_progress` / open** —
   the 3 remaining fields are NOT yet implemented, only documented with recipes.

## Immediate next step

QF-20260815-748 is still claimed and open. Two honest options, pick whichever fits
the belt state at resume time:
- **Continue it**: tackle `acknowledged_at` next (most tractable of the 3 — partial
  investigation already done this session: checked `coordinator-ack-signal.cjs`
  L79-84 [signal-row self-ack, correct], `worker-signal.cjs` L417/L590 [reply-row
  reader-ack, correct], `lib/adam/outbound-silence-watchdog.js` L62/L102 [reads
  `acknowledged_at` on Adam's OWN outbound row by `target_session` — this is the
  most promising lead: confirm whether ANYTHING ever writes `acknowledged_at` on
  that specific row shape, or whether it's written elsewhere and the watchdog is
  structurally blind]. Then `last_tool_at` (QF's own text says likely needs a
  rename, not a test — a design call, not a quick fix). Then `delivered_at`
  (needs Twilio provider + reconciler sweep mocked together — the most complex).
- **Leave it and check the belt**: `npm run sd:next` fresh, claim whatever's next.
  QF-20260815-748's DB row + `docs/reference/field-name-is-a-claim.md` already
  accurately reflect current state — safe to leave open/in_progress and pick up
  later, same pattern as QF-20260728-720.

## Standing session constraints (apply for the rest of this autonomous run)

- Never touch the primary repo root (`C:\Users\rickf\Projects\_EHG\EHG_Engineer`
  itself, not a worktree) — it's the coordinator's own live workspace.
- Always merge via the hardened `lib/ship/auto-merge.mjs attemptAutoMerge`
  sequence, never a bare `gh pr merge`. Resolve `.claude-work/ship-repo-resolved.json`
  fresh in each new worktree if missing (`gh repo view --json owner/name`).
- Use `git diff main...branch` (three dots) for PR-scoped diffs, NEVER `main..branch`
  (two dots) — the latter pulls in every unrelated commit that landed on main after
  the branch forked and produces false CRITICAL findings in the review gate.
- `git branch <name>` only creates a pointer — always `git checkout` it too, or
  commits land on the wrong branch (happened twice this session, both times caught
  and fixed via `git branch -f <name> HEAD` + checkout, no damage).
- A stale `.git/worktrees/<name>/index.lock` under heavy concurrent-session load is
  usually safe to remove if it's several minutes old, static, and read-only git ops
  still work — verify live git.exe PIDs and lock mtime before removing, never blind.
- This machine runs 10+ concurrent autonomous Claude Code fleet sessions; expect
  git/CI/subprocess timing to be noisy under load (several genuine timeouts this
  session, all confirmed environmental via re-check, not caused by this session's
  own changes) — signal via `/signal harness-bug` rather than chasing them.
- Never call `ScheduleWakeup` with `stop:true` mid-task — it cancels the pending
  wakeup instead of just ending the turn (happened once this session, caught and
  re-armed immediately).
- Fleet-worker directive: never park while the belt is non-empty; finish → tail →
  next-claim in the same turn. `npm run sd:next` must be re-run fresh every time,
  never reuse cached output.
