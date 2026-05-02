<!-- Archived from: docs/plans/cross-signal-claim-liveness-plan.md -->
<!-- SD Key: SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 -->
<!-- Archived at: 2026-04-24T13:20:35.672Z -->

# Cross-signal claim liveness — protect sd-start pre-claim with multi-source evidence (not session status alone)

## Summary

`scripts/sd-start.js` and the existing `scripts/modules/claim-health/triangulate.js` module detect claim state via four signals: `claude_sessions` DB row, `strategic_directives_v2.is_working_on`/`claiming_session_id`, physical `.worktrees/SD-*` directories, and `process.kill(pid, 0)` PID liveness. This is insufficient. Live incident 2026-04-24: I was about to reclaim `SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001` from session `4b78a802-b4ed-4333-ba36-8b9f13aad0b8` (status=released in `claude_sessions`) — but another Claude Code conversation was actively researching the SD in the same worktree. The released session was an earlier incarnation of that still-active conversation; the CC conversation kept working after session-id rotation without updating the claim. Triangulate classified the worktree as `orphaned`, which would have authorized a hostile reclaim.

This SD adds four new signals to the triangulation module and wires it as a hard pre-claim gate in `sd-start.js`. It also hardens the existing PID-liveness check (`process.kill(pid, 0)`) with a `process_ticks` recency second-signal (bundled from independent systemic issue #4: sweep declared a session PID_DEAD at 08:03 while a fresh tick <1s old arrived at 08:56 on the same UUID — proof `process.kill` alone is unreliable for cross-shell/suspended processes).

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (LEO claim lifecycle: sd-start + claim-health module)

## Depends On

- **SD-LEO-INFRA-FIX-CLAUDE-CODE-001** (tick daemon ancestor-PID discovery) — must ship first. That SD fixes the upstream cause of silent heartbeats (`findClaudeCodePid` latching on transient `node.exe` worker); this SD is downstream defense-in-depth (if a tick still lapses for any other reason, we don't reclaim based on a single signal). Tests in this SD baseline against a correct tick daemon.

## Success Criteria

- **AC1**: Given an SD with `claiming_session_id` pointing to a session whose DB row is `released` but whose branch `feat/<SD_KEY>` (or `fix/<SD_KEY>`) exists locally or on origin, `sd-start.js` refuses to claim with exit code 3 and remediation `node scripts/check-sd-liveness.js <SD_KEY>`.
- **AC2**: Given an SD whose `docs/plans/*<sd-slug>*.md` is **untracked in the current working tree** (i.e., tracked in a different worktree), sd-start refuses to claim. Rationale: another tree has committed the plan; it is theirs.
- **AC3**: Given an SD with a `sub_agent_execution_results` row created within the last 30 minutes for `sd_id = <uuid>`, sd-start refuses to claim (someone is running sub-agents on this SD).
- **AC4**: Given any `claude_sessions` row (any status — active, idle, released) with `metadata.branch` matching `*<SD_KEY>*` whose `heartbeat_at` is within the last 15 minutes, sd-start refuses to claim. Rationale: released-recently ≠ abandoned; CC session-id rotates within one conversation.
- **AC5**: `process.kill(pid, 0)` is no longer the sole PID-liveness signal. The replacement returns `alive=true` if **either** `process.kill(pid,0)` succeeds **or** a `process_ticks` row exists for the session_id with `created_at > now() - interval '90 seconds'`. A PID_DEAD verdict requires **both** signals to fail.
- **AC6**: `sd-start.js` invokes the enhanced triangulation as a pre-claim gate before the claim-upsert. Refused claims return exit code 3 with a structured reason and remediation. An override path exists: `--force-reclaim <ticket-reference>` where `<ticket-reference>` must match `^(SD-|QF-|#)` (per `feedback_bypass_validation_needs_ticket_ref.md`). Override events log to `sd_lifecycle_audit_log` with full signal dump.
- **AC7**: New CLI `node scripts/check-sd-liveness.js <SD-KEY>` prints the current signal table (8 signals: the original 4 + the 4 new) with OK/WARN/BLOCK per signal and an overall verdict. Exit code 0 = safe to claim, 3 = blocked.
- **AC8**: Unit tests cover each of the 8 signals firing and not firing, the AND/OR logic between them, the `process.kill` + `process_ticks` disjunction, and sd-start's refusal path including override.
- **AC9**: No regression on the existing `triangulate()` bulk-classification consumers (`stale-session-sweep.cjs`, `claim-health/index.js` downstream). Existing `{healthy, orphaned, ghost, discrepancies}` shape preserved; new signals appear in `entry.signals` under new keys.

## Scope

### FR1 — Branch-presence signal

In `scripts/modules/claim-health/triangulate.js`:
- Extend `triangulate()` to look up branches matching `feat/<SD_KEY>` and `fix/<SD_KEY>` via `git for-each-ref --format='%(refname) %(committerdate:unix) %(worktreepath)' refs/heads/feat/<SD_KEY> refs/heads/fix/<SD_KEY> refs/remotes/origin/feat/<SD_KEY> refs/remotes/origin/fix/<SD_KEY>` (single shell-out, handles both local and origin).
- Add `signals.hasSDBranch` and `signals.sdBranchHasWorktree` to each entry.
- A branch with a `worktreepath` anywhere = strong signal; a branch without worktree but `committerdate` within 2h = medium signal.

### FR2 — Plan-file indirection signal

In `scripts/modules/claim-health/triangulate.js`:
- For each candidate SD key, slugify (lowercase, hyphenated) and check whether `docs/plans/*<slug>*.md` exists AND is **untracked** in the current working tree (via `git ls-files --others --exclude-standard docs/plans/`).
- If the file exists on disk but is untracked here, it is committed in **another** worktree — set `signals.planFileTrackedElsewhere=true`.
- Justification: this is the tell that caught today's incident — the retrospective-gates plan file was untracked in my tree but committed in the sibling worktree.

### FR3 — Recent sub-agent activity signal

In `scripts/modules/claim-health/triangulate.js`:
- Query `sub_agent_execution_results` for rows with `sd_id = <uuid>` and `created_at > now() - interval '30 minutes'`.
- Set `signals.recentSubAgentActivity=true` if any row exists; include `latestSubAgentMinutesAgo` for reporting.
- Sibling signal: query `sd_phase_handoffs` for `sd_id = <uuid>` with `created_at > now() - interval '30 minutes'` and any status (precheck, in-progress, accepted) — sets `signals.recentHandoffActivity=true`.

### FR4 — Sibling-session-branch signal

In `scripts/modules/claim-health/triangulate.js`:
- Query `claude_sessions` for rows where `metadata->>'branch' ILIKE '%<SD_KEY>%'` regardless of `status`, with `heartbeat_at > now() - interval '15 minutes'`.
- Set `signals.siblingSessionOnBranch=true` if any match. Capture the session_id and heartbeat age for reporting.
- Justification: CC session identity rotates mid-conversation; the old session_id goes `released`, the new one never updates `claiming_session_id`, but `metadata.branch` on the new session row points at the SD's branch.

### FR5 — Harden PID liveness with process_ticks (bundles systemic issue #4)

In `scripts/modules/claim-health/triangulate.js` at lines 25-33 (`isProcessRunning`):
- Current behavior: `process.kill(pid, 0)` returns binary true/false; false declares `ghost`.
- New behavior: `isProcessAlive(pid, session_id)` returns true if **either** `process.kill(pid, 0) === true` **or** a row exists in `process_ticks` with `session_id = <sid>` and `created_at > now() - interval '90 seconds'`.
- A `PID_DEAD` verdict (triggering `ghost` classification in triangulate's downstream logic) now requires **both** signals to fail — `process.kill` fails **and** no tick in last 90s.
- Evidence (systemic issue #4): Sweep at 08:03 declared `212e6d1c-...` PID_DEAD; sweep at 08:56 observed fresh tick <1s old for the same UUID. `process.kill` had false-negatived a live process (likely cross-shell or suspended).

### FR6 — Pre-claim gate in sd-start.js

In `scripts/sd-start.js`:
- Before the claim-upsert (after line ~644 where claim reconciliation happens), call `triangulate(supabase, sdKey)` and inspect the returned entry's `signals` object plus the new fields.
- Block list (any one = refuse claim):
  - `hasSDBranch && sdBranchHasWorktree === true`
  - `planFileTrackedElsewhere === true`
  - `recentSubAgentActivity === true` OR `recentHandoffActivity === true`
  - `siblingSessionOnBranch === true`
- Override: `--force-reclaim <ref>` (regex `^(SD-|QF-|#)`) stored in `sd_lifecycle_audit_log.metadata.force_reclaim_ref` alongside the full signal dump.
- Exit codes: 0=claimed, 2=precheck warning, 3=blocked by liveness gate (NEW code), 4=claim conflict (existing code).

### FR7 — Diagnostic CLI

New file: `scripts/check-sd-liveness.js`
- Usage: `node scripts/check-sd-liveness.js <SD-KEY> [--json]`
- Invokes `triangulate(supabase, sdKey)`, formats each of the 8 signals as a row with OK/WARN/BLOCK and the underlying datum.
- Exit 0 if safe to claim, 3 if blocked. Intended for operator diagnosis and CI.

### FR8 — Tests

- `scripts/modules/claim-health/triangulate.test.js` — unit tests for each of the 4 new signals (present, absent, malformed input), the hardened `isProcessAlive` disjunction, and the combined classification path.
- `scripts/sd-start.test.js` (or extend existing) — integration test that sets up each BLOCK precondition in a fixture DB and asserts sd-start exit code 3 with the correct remediation message; also asserts `--force-reclaim SD-TEST-001` bypasses with an audit-log row.
- No mocks for the DB — use the test supabase client per `feedback_testing_no_mock_db.md` pattern.

## Non-Goals

- NOT changing the existing `{healthy, orphaned, ghost, discrepancies}` output shape of `triangulate()`. Downstream consumers (`stale-session-sweep.cjs`, `self-heal.js`) keep working.
- NOT modifying `assign-fleet-identities.cjs` (systemic issue #2). That is a separate ≤5 LOC QF — orthogonal module, clean split.
- NOT fixing the tick-daemon early-exit pattern (systemic issue #1 root cause). That is `SD-LEO-INFRA-FIX-CLAUDE-CODE-001` — must ship first.
- NOT adding QA-flag cycle-counter (systemic issue #3). Different concern; separate work.
- NOT renaming CLAIM_FIX to CLAIM_SYNC (systemic issue #5). Cosmetic; separate QF.
- NOT probabilistic / Monte Carlo liveness modeling. `SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001` already shipped that approach for fleet-wide ETA. This SD is deterministic per-SD pre-claim.
- NOT auto-releasing stale claims. Detection and refusal only; any release is manual with audit-logged reason.

## Key Technical Decisions

**Why 4 new signals instead of 1 meta-signal**: each signal catches a different failure mode. Branch presence catches "session rotated, claim not updated." Plan-file indirection catches "work committed in sibling worktree we can't see directly." Sub-agent activity catches "research/validation in progress." Sibling-session-branch catches "new session_id on same branch, `claiming_session_id` not yet updated." Collapsing them would lose diagnostic precision.

**Why AND logic on PID_DEAD but OR logic on the 4 new signals**: PID_DEAD is a destructive classification (triggers release); we want false-positive resistance (AND). The 4 new signals are blockers (refuse claim); we want false-negative resistance (OR — any single one fires the block).

**Why block, not warn**: a warn-only path lets tired operators claim through silent signals. The override path exists for legitimate cases (`--force-reclaim` with audit trail); warnings don't force the ticket-reference convention.

**Why not move triangulate into `sd-start.js`**: shared module serves `stale-session-sweep.cjs`, `self-heal.js`, the new CLI, and sd-start. Duplicating triangulation logic into sd-start would fracture. The module boundary stays.

**Why untracked-plan-file is a reliable signal**: in a shared git repo with multiple worktrees, a file committed in worktree A appears as **untracked** in worktree B (because B's HEAD hasn't fetched A's commit yet). If `docs/plans/*<slug>*.md` is untracked here, another tree has it. This caught today's incident cleanly.

## Supporting Evidence

- **Primary incident (2026-04-24)**: Session `af01fb9f-31a8-49d9-b54d-a9bb228cad68` (me) attempted reclaim of `SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001`. DB showed `claiming_session_id=4b78a802` (status=released). Existing triangulate would classify as `orphaned` → reclaim authorized. Reality: the retrospective-gates plan file was untracked in my tree (committed in sibling worktree), branch `feat/SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001` had `worktreepath=C:/.../worktrees/SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001`, committer date 67m ago. User directly observed another CC session researching the SD. The released session-id was an earlier incarnation of the SAME active conversation — session identity rotated without updating the claim.
- **Systemic issue #4 data points**: Sweep declared `212e6d1c-...` PID_DEAD at 08:03; at 08:56 a `process_ticks` row for the same UUID arrived with `created_at` 1s ago. `process.kill(pid, 0)` alone had false-negatived a live process. Proposed `process_ticks` second-signal would have prevented the misclassification.
- **Existing code confirming the gap**: `scripts/modules/claim-health/triangulate.js:95-222` covers only the 4 original signals. No git-branch query, no plan-file query, no sub-agent-activity query, no sibling-session-branch query. PID check at lines 25-33 is the single-signal `process.kill` call.
- **Adjacent shipped SDs (all orthogonal, confirmed via description scan)**:
  - `SD-LEO-INFRA-PRE-CLAIM-CHECK-001` — added fallback-to-next-SD when claim conflict detected; different gap (handles conflict *after* detection; this SD *improves detection*).
  - `SD-LEO-INFRA-CLAIM-CHECK-HARDENING-001` — created `fn_check_sd_claim` RPC; RPC-level, doesn't add these 4 signals.
  - `SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-001` — auto-release/TTL/worktree isolation; claim lifecycle, not pre-claim detection.
  - `SD-CLAIMQUEUE-COHERENCE-WIRE-HEARTBEATAWARE-ORCH-001` — wired analyzeClaimRelationship into claim-validity-gate + sd-next; heartbeat-aware classification, doesn't add branch/plan-file/sub-agent/sibling-session signals.
  - `SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001` — probabilistic fleet-wide P(alive); different shape and purpose (fleet ETA vs per-SD deterministic pre-claim refusal).
- **Systemic issue #1 sibling context**: `SD-LEO-INFRA-FIX-CLAUDE-CODE-001` (in-flight) fixes the upstream cause (tick daemon suicides from wrong cc_pid). Once that ships, fewer silent-heartbeat windows exist. But defense-in-depth remains necessary for (a) script hangs, (b) long Bash commands blocking PostToolUse, (c) any future regression.

## Vision Alignment

Supports **O-GOV-2 (LEO Intelligence Integration)** and **O-GOV-1 (Foundation Cleanup)**. The claim lifecycle is the coordination primitive for every parallel Claude Code session in the fleet; a false-positive reclaim is a data-loss event (overwrites sibling's work) and a false-negative reclaim wedges the fleet. Hardening the pre-claim gate with multi-source evidence is a direct intelligence-integration win — cross-referencing DB + git + disk + telemetry is exactly the triangulation pattern the governance stack is built on.

## Risks

- **Risk**: Adding 4 DB/shell queries to the sd-start hot path adds ~200-500ms latency. **Mitigation**: queries are fast (indexed on `sd_id`/`session_id`/`branch`); run them in `Promise.all`. Measure in tests. Acceptable given claim is a human-initiated action, not a loop.
- **Risk**: Plan-file indirection signal false-positives if a user genuinely authored a plan locally and simply hasn't `git add`'d it yet. **Mitigation**: the signal also requires the filename to match a slugified SD key that EXISTS in the DB. New local-only plans won't match any DB SD key. Acceptable.
- **Risk**: Branch-presence signal false-positives for abandoned branches (someone cleaned up the worktree but the branch lingers). **Mitigation**: require EITHER `worktreepath` set OR `committerdate` within 2h — abandoned branches will fail both conditions.
- **Risk**: `process_ticks` table grows unbounded. **Mitigation**: out of scope here — table already exists and has a retention policy (verify; if not, file as a separate QF). Query uses index on `session_id + created_at`.
- **Risk**: `--force-reclaim` becomes a habit that defeats the gate. **Mitigation**: regex enforces ticket-reference convention (`SD-`/`QF-`/`#`), and audit-log writes make abuse visible. Same pattern as `--bypass-validation` on handoff.js.
- **Risk**: Interaction with in-flight `SD-LEO-INFRA-FIX-CLAUDE-CODE-001`. **Mitigation**: formal `depends_on` — don't merge this SD until FIX-CLAUDE-CODE ships. Both SDs touch claim-health indirectly but different files.

## Estimated Scope

~400-500 LOC across:
- `scripts/modules/claim-health/triangulate.js` — +200 LOC (4 signal queries + hardened PID check)
- `scripts/sd-start.js` — +80 LOC (gate invocation + exit code 3 + override parsing)
- `scripts/check-sd-liveness.js` — NEW, ~100 LOC
- `scripts/modules/claim-health/triangulate.test.js` — ~120 LOC tests
- `scripts/sd-start.test.js` — ~80 LOC tests (new preclaim-gate cases)

Tier 3 per CLAUDE.md Work Item Routing (>75 LOC, touches hot path). Full SD workflow. 4 handoffs per infrastructure type, 80% gate threshold. DOCMON required for any CLAUDE_CORE.md invariants documentation.
