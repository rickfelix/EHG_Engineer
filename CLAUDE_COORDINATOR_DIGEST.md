<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-06-16T12:59:38.915Z -->
<!-- git_commit: bc991d9d -->
<!-- db_snapshot_hash: 7f0504975a9426f6 -->
<!-- file_content_hash: 3152ecbb0fb7e2ab -->

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

---
*The coordinator is NOT a worker and NOT Adam. Full contract in CLAUDE_COORDINATOR.md.*
*Protocol: 4.4.1*
