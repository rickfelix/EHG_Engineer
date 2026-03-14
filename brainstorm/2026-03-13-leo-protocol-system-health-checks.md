# Brainstorm: LEO Protocol System Health Checks

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (infrastructure/protocol concern)

---

## Problem Statement
When actively working on the LEO protocol, background services (EHG_Engineer on port 3000, EHG App on port 8080, Stage Zero Processor, Stage Execution Worker) should be running but frequently are not. The user discovers this only when navigating to localhost and finding nothing there, forcing a context switch back to Claude Code to run `/restart`. Additionally, scheduled tasks and background workers silently fail when the stack isn't running, with no visibility into the failure.

## Discovery Summary

### Primary Friction
- UI changes are made in Claude Code, but when the user opens the browser to verify, localhost is not running
- The `/restart` command exists but must be invoked manually — there is no auto-detection or auto-recovery
- Background workers (Stage Zero Processor, Stage Execution Worker) and cron-based tasks silently stop when the stack is down

### Current Infrastructure
- `leo-stack.ps1` / `leo-stack.sh` support start/stop/restart/status/clean/emergency commands
- `cross-platform-run.js` handles OS detection and dispatches to the correct script
- `config/workers.json` defines 5 workers (2 enabled: Stage Zero Processor, Stage Execution Worker)
- The `/coordinator` already runs 5-minute CronCreate loops for session sweeps and dashboard updates
- The statusline runs every few seconds but only displays UI info, no service health

### Proposed Solutions
1. **Session-start auto-check**: When a Claude Code session initializes LEO work, verify stack health and auto-start if needed
2. **Coordinator health pulse**: Add periodic service liveness checks to the coordinator's existing cron loops
3. **No statusline integration needed** — the coordinator covers monitoring

## Analysis

### Arguments For
- Eliminates the #1 workflow interruption — going to localhost and finding nothing running wastes 2-5 min each time
- Scheduled tasks become reliable — Stage Zero Processor, Stage Execution Worker, and cron sweeps actually run instead of silently failing
- Low implementation cost — all the pieces exist (leo-stack status, cross-platform-run.js, CronCreate); it's wiring, not invention
- Natural coordinator extension — the coordinator already runs 5-min cron loops; adding health checks is incremental

### Arguments Against
- Auto-restart risks state corruption if a worker crashes mid-operation — blindly restarting could cause duplicate processing or orphaned state
- CronCreate is session-scoped — health checks only run while a Claude Code session is active, so there's no true persistent daemon
- "Healthy" is hard to define — a process holding a port doesn't mean it's functional; false-positive "all green" signals could mask real issues

## Team Perspectives

### Challenger
- **Blind Spots**: (1) No backoff/circuit breaker for restart loops — a flapping service could flood logs. (2) State corruption risk — workers hold in-flight state and auto-restart mid-operation could leave inconsistent DB state. (3) Health check definition is underspecified — port liveness != service health.
- **Assumptions at Risk**: (1) Users want auto-restart vs. just auto-start — the pain is forgetting to start, not crash recovery. (2) Session-scoped monitoring only watches while someone is working — the gap is between sessions.
- **Worst Case**: Auto-recovery silently restarts a service that crashed due to a breaking migration. The service processes queued SDs against corrupted state, propagating bad data through handoffs and gate evaluations.

### Visionary
- **Opportunities**: (1) Zero-friction development loop — eliminates context-switching overhead. (2) Silent-failure elimination — upgrades scheduled automation from best-effort to production-grade. (3) Self-healing protocol foundation — health checks are the first layer for auto-rollback, degraded-mode, and alerting.
- **Synergies**: Coordinator already has cron infrastructure. Fleet coordination via claude_sessions could route work away from sessions with down stacks. Automated pipeline runner and EVA Stage Zero processing depend on stack liveness.
- **Upside Scenario**: LEO stack becomes an always-on development platform rather than a manually-managed toolchain. Background automation runs with production-grade reliability.

### Pragmatist
- **Feasibility**: 3/10 (low difficulty) — infrastructure plumbing using existing pieces
- **Resource Requirements**: 2-4 hours for session-start check; 1-2 additional hours for coordinator health pulse. Single engineer, zero cost.
- **Constraints**: (1) CronCreate is session-scoped — no persistent daemon. (2) Auto-restart side effects need crash-vs-busy detection. (3) Windows PID management is fragile — stale PIDs from unclean exits.
- **Recommended Path**: Start with session-start auto-check only. Ship as Tier 2 QF. Coordinator pulse as fast follow.

### Synthesis
- **Consensus Points**: Session-start auto-check is the clear first move — low risk, high value, solves the primary pain
- **Tension Points**: Challenger warns about auto-restart needing circuit breakers; Visionary sees it as self-healing foundation. Resolution: start simple, add safety layers iteratively
- **Composite Risk**: Low (session-start check) to Medium (periodic auto-restart)

## Open Questions
- What constitutes "healthy" beyond port liveness? (DB connectivity? Response to a health endpoint?)
- Should the coordinator alert the user or silently auto-restart?
- How to handle the gap between sessions (no Claude Code running = no health checks)?
- Should failed auto-restarts escalate (e.g., send a coordination message to active sessions)?

## Suggested Next Steps
- Create SD for session-start auto-check + coordinator health pulse integration
- Define health check criteria per service (port probe, PID check, optional HTTP health endpoint)
- Add health section to coordinator's existing cron loop
