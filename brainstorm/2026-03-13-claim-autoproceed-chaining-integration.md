# Brainstorm: Claim/Auto-Proceed/Chaining Integration

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Chairman Review**: 3 items reviewed, 2 accepted, 1 flagged, 0 research-needed
- **Related Brainstorm**: "Orchestrator Completion Validation Gates" (2026-03-13, sd_created)

---

## Problem Statement

The LEO protocol has three independent systems — claims (via `claude_sessions`), auto-proceed mode, and orchestrator chaining — that should behave as one integrated flow but don't. When auto-proceed fires at an SD completion boundary (orchestrator chaining or normal `sd:next` continuation), the system does NOT auto-claim the next SD. This requires manual `/claim` intervention even when the user has opted into fully autonomous operation, breaking the autonomy promise and creating race conditions in multi-session fleet scenarios.

## Discovery Summary

### The Gap (from code analysis)
1. **`orchestrator-completion-hook.js:945-968`**: When chaining is enabled, `findNextAvailableOrchestrator()` returns a next SD and the hook returns `{ chainContinue: true, nextOrchestrator }` — but **never calls `claimGuard()`**
2. **`findNextAvailableOrchestrator()`**: Queries `strategic_directives_v2` for status/priority but **never checks `claude_sessions` for existing claims** — can recommend an already-claimed SD
3. **`sd-next.js`**: Emits `AUTO_PROCEED_ACTION` with a recommended SD but **doesn't auto-claim** — claiming only happens later in `sd-start.js`
4. **No atomic release-old + claim-new**: When chaining from orchestrator A to B, the old claim on A is never explicitly released

### Proposed Behavioral Model
- **Auto-proceed ON**: Auto-claim at boundaries, atomic swap via `claim_sd` RPC
- **Auto-proceed OFF**: Manual `/claim` unchanged
- **Claim conflict**: Graceful fallback to next available SD (no hard stop)

### Out of Scope
1. Changing `claude_sessions` schema or claim storage — partial unique index stays as-is
2. Cross-host claim resolution (remote PID liveness is a separate problem)
3. Modifying `/claim` skill's manual workflow
4. Auto-proceed resolution logic (CLI → env → session → global precedence)

## Analysis

### Arguments For
- **Eliminates manual intervention** at every SD boundary in autonomous mode — the single biggest friction point in fleet operation
- **Closes race window** where another session can steal the target SD between completion and claiming
- **Enables true fleet autonomy** — the foundation for parallel session scaling, which is already in daily use
- **Low implementation cost** — ~50 LOC across 2 files, well within standard SD scope
- **DB safety net** — partial unique index prevents dual claims even if wiring has bugs

### Arguments Against
- **Removes HARD STOP safety valve** — auto-fallback could silently cycle through SDs without user awareness (Challenger concern)
- **Testing difficulty** — multi-session coordination is inherently hard to test; e2e tests are slow and flaky
- **Stale heartbeat edge case** — completion hooks can run 60+ seconds (completeness audit, gap analysis, /learn); if heartbeat goes stale during that window, a concurrent session could auto-release the claim

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 7/10 | Multi-session fleet requires manual /claim at every boundary (4/5 severity, 3/5 breadth) |
| Value Addition | 9/10 | Direct: eliminates manual step (4/5). Compound: enables fleet scaling (5/5) |
| Risk Profile | 4/10 | Breaking change risk low (2/5). Regression risk moderate (2/5) |
| **Decision** | **IMPLEMENT** | (7 + 9) > (4 * 2) → 16 > 8 |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) The selection query (`findNextAvailableOrchestrator`) is the real race, not just release-then-claim. (2) Session identity fragility — stale heartbeats during long completion hooks. (3) No rollback path if auto-claimed SD fails immediately.
- **Assumptions at Risk**: (1) Atomic release+claim may not be feasible due to PID liveness checks. (2) Graceful fallback assumes there's always another SD — could degenerate into hot loop. (3) Making advisory systems effectful changes their contract for all callers.
- **Worst Case**: Claim thrashing — sessions repeatedly interrupting each other's work, /learn running on half-completed SDs.

### Visionary
- **Opportunities**: (1) True fleet autonomy — parallel sessions as a scaling multiplier. (2) Foundation for coordinator-level fleet intelligence. (3) Enables overnight batch processing with zero intervention.
- **Synergies**: Amplifies orchestrator completion validation gates (today's brainstorm), fleet coordination, and the coordinator skill.
- **Upside Scenario**: 3-4 sessions running continuously, each completing 4-6 SDs per session, with zero manual /claim interventions — 3-4x throughput with same human oversight.

### Pragmatist
- **Feasibility**: 4/10 difficulty — well-scoped wiring work, not architectural.
- **Resource Requirements**: Single SD, ~50 LOC + ~100 LOC tests. One session to implement.
- **Constraints**: (1) Claim release timing — can't hold two claims, but `claim_sd` RPC already does atomic sd_id swap. (2) Need claim-awareness filter in `findNextAvailableOrchestrator`, not full claimGuard. (3) E2e tests inherently slow/flaky.
- **Recommended Path**: Phase 1 single SD — add claim filter to selection, add claimGuard to chaining path, verify RPC atomic swap. Phase 2 optional — auto-claim in sd:next.

### Synthesis
- **Consensus**: Selection query needs claim-awareness; fix is well-scoped; DB index is the safety net
- **Tension**: Challenger wants claim lease TTL vs Pragmatist says heartbeats suffice; removing HARD STOP debated
- **Composite Risk**: Low-Medium

## Chairman Review Flags
- **Team Fit / Testing**: Solo developer implementing multi-session coordination logic that's hard to test. E2e test patterns exist but concurrent session scenarios remain inherently difficult to validate. Mitigation: lean on DB partial unique index as safety net, use existing `claim-dual-truth-regression.test.js` as template, supplement with manual 2-terminal testing.

## Open Questions
- Should auto-claimed SDs have a shorter heartbeat TTL to detect abandoned claims faster?
- Should the fallback chain have a max-attempts limit (e.g., try 3 SDs, then idle) to prevent hot loops?
- Does `claim_sd` RPC handle the case where session already has a different `sd_id` gracefully?

## Suggested Next Steps
- Create SD to implement Phase 1: claim-aware selection + claimGuard in chaining path
- Verify `claim_sd` RPC atomic swap behavior with existing `sd_id`
- Add claim-awareness filter test to existing e2e suite
