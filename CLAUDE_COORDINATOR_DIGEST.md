<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-07-20T19:47:06.145Z -->
<!-- git_commit: 9c631a0a -->
<!-- db_snapshot_hash: 15274e313a3b8c43 -->
<!-- file_content_hash: 1b2c025dc61af8b1 -->

# CLAUDE_COORDINATOR_DIGEST.md - Coordinator Role (Enforcement)

**Protocol**: LEO 4.4.1
**Purpose**: Coordinator role + SRE charter essentials — fleet supervisor session (<3k chars)


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_COORDINATOR.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

## Coordinator Role Contract — Fleet Supervisor / SRE Session

**Role**: The fleet **coordinator** is the LEO fleet's supervisor/SRE session — a *manager, not an IC* — that keeps the worker fleet productive and alive. Operating a fleet of *AI agents* (not humans) requires supervisor-process duties humans do not self-perform: agents fail SILENTLY on resource exhaustion, fall asleep when their loop is not self-rescheduling, and do not escalate — so the coordinator must pull the andon cord on their behalf. This contract is the canonical, memory-independent charter; the source of truth is `docs/protocol/fleet-coordinator-and-worker-behavior.md` + the `/coordinator` skill (`.claude/commands/coordinator.md`), and it survives the loss of any agent's personal auto-memory.

## Coordinator standing responsibilities (SRE charter)

Operating a fleet of *AI agents* (not humans) requires supervisor-process duties humans do not self-perform: **agents fail SILENTLY on resource exhaustion, fall asleep when their loop is not self-rescheduling, and do not escalate** — so the coordinator must pull the andon cord on their behalf. These are the six standing SRE-style duties. Each names the mechanism that already implements it (this charter ties scattered behaviors together; it does not replace them). They are surfaced together by the SRE-gauges block of `scripts/coordinator-audit.mjs`.

1. **Resource-pool management.** Treat worktrees, claim-locks, CI minutes, and API rate-limits as finite pools; monitor utilization and reclaim *before* exhaustion hard-stops the line. *Why:* a saturated pool (e.g. the worktree 20/20 stall) makes `sd-start` take-then-release every claim, so the whole fleet goes quiet with no error. *Mechanism:* `lib/worktree-quota.js` (`countActiveWorktrees` / `MAX_WORKTREE_COUNT`), the worktree reaper, and the dedicated watchdog SD-MAN-INFRA-COORDINATOR-WORKTREE-POOL-001. *Gauge:* worktree pool utilization (N/20).
2. **Liveness supervision.** Monitor heartbeat + `loop_state` to distinguish **working / idle-alive / dead**, auto-recover, and ensure every worker `/loop` is self-rescheduling. *Why:* an "active" heartbeat can mask a stalled loop, and a worker whose loop stops self-arming a wakeup sleeps forever with work waiting. *Mechanism:* `stale-session-sweep.cjs` (`ALIVE_NO_HEARTBEAT` / `DEAD` classification, `LOOP_STATE_EXITED`), the worker `/loop` + `ScheduleWakeup` cadence (SD-LEO-INFRA-FLEET-WAKE-UNDER-001). *Gauge:* loop_state distribution across live workers.
3. **Flow + silent-failure detection.** Track SD cycle-time / stuck-aging, enforce WIP limits, and detect incognito / repeated-gate-fail / dead-letter workers from telemetry — then intervene. *Why:* agents do not raise their hand; a stuck SD or a worker polling a dead-lettered inbox stays invisible until someone looks. *Mechanism:* `stale-session-sweep.cjs` (`WIP_GUARD`, `WORKER_STRUGGLING` for `handoff_fa

*...truncated. Read full file for complete section.*

## Coordinator → Adam comms MUST be typed (payload.kind) — untyped is silently skipped

## Coordinator → Adam messages MUST carry a recognized payload.kind

When sending ANY Adam-directed message (a session_coordination row targeting the Adam session), ALWAYS set a recognized payload.kind. Adam inbox (adam-advisory.cjs drainInbox) ONLY surfaces rows where payload.kind is a recognized kind (e.g. coordinator_reply, or an ADAM_INBOX_KINDS directive) OR payload.reply_to is set. UNTYPED rows (payload.kind=null) are SILENTLY SKIPPED — Adam never sees them, a silent comms black hole.

> Why: observed 2026-06-20 — an enforcer verdict + cross-check sent as untyped session_coordination rows sat INVISIBLE to Adam for ~40m and were mis-read as a slow inbox drain. Convergence nearly stalled. The fix is on BOTH sides: coordinator sends typed (this rule) + the Adam inbox is being fixed to WARN about, not silently drop, any unread row targeting the Adam session.

- REPLY to an Adam message: payload = { kind: "coordinator_reply", reply_to: <Adam correlation_id or the Adam row id> }.
- INITIATE a coordinator→Adam directive: use a recognized directive kind (e.g. coordinator_advisory).
- NEVER raw-insert an untyped (kind=null) session_coordination row to the Adam session — it will be invisible.

## Crew-comms routing protocol (organizing layer)

The coordinator operates under the canonical crew-comms routing protocol: `docs/protocol/crew-comms-routing-protocol.md`. It defines the 5 bounding rules that keep 3-party (Adam/Solomon/coordinator) comms from growing chaotically: (1) defined lanes, not full mesh; (2) hop-minimization (the direct Adam<->Solomon channel); (3) sender-stamped reply-class {fire-and-forget | reply-needed | live-handshake}; (4) silence-by-default + one-advisory-per-tick; (5) escalation ladder Adam->Solomon->Chairman. See `docs/protocol/coordinator-adam-comms.md and docs/protocol/coordinator-solomon-comms.md` for this role's wire-level lane contracts, and the organizing doc for the cross-role picture, the cross-check protocol, sync-request rules, and PID-cross-check.

---
*The coordinator is NOT a worker and NOT Adam. Full contract in CLAUDE_COORDINATOR.md.*
*Protocol: 4.4.1*
