# Brainstorm: Heartbeat Intelligence Protocol — Worker Worktree Self-Identification and Coordinator Monitoring

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal infrastructure)
- **Related SD**: SD-MAN-INFRA-WORKER-WORKTREE-SELF-001

---

## Problem Statement

The fleet coordinator's heartbeat currently provides only: session ID, terminal ID, SD claim, last heartbeat timestamp, and status. Every coordinator decision beyond that is a guess. During a live coordinator session monitoring 3 parallel workers, we observed: workers appearing "stale" when mid-operation, duplicate claims going undetected, no visibility into whether workers use proper worktrees, and ETA calculations based on flat SD medians instead of phase-aware estimates. The coordinator needs richer signals to make better sweep/release decisions.

## Discovery Summary

### Current State
- Heartbeat runs every 30s, updates `claude_sessions` table
- `current_branch` column already exists and is populated (discovered during Pragmatist analysis)
- Coordinator makes release decisions based solely on heartbeat age (5-min stale threshold)
- No visibility into worker progress, phase, or git state beyond branch name

### Proposed Enrichment: 4 Signals

**Signal 1: `current_branch` (string)** — ALREADY IMPLEMENTED
- Collection: `git rev-parse --abbrev-ref HEAD` — already in `session-manager.mjs:440`
- Coordinator use: Worktree conflict detection, main-branch warnings, branch/SD mismatch
- Gap: Not yet surfaced in dashboard or used in sweep QA checks

**Signal 2: `has_uncommitted_changes` (boolean)** — NEW
- Collection: `git status --porcelain | wc -l > 0` — ~100-200ms per heartbeat
- Coordinator use: Safe release gate (stale + dirty = hold), orphaned WIP detection
- Challenge: Requires worktree path context in heartbeat manager (currently uses CWD)

**Signal 3: `handoff_fail_count` (int)** — NEW (refined from handoff_attempt_count)
- Collection: Increment on handoff failure in `unified-handoff-system.js`
- Coordinator use: Flag struggling workers (fail_count > 3), ETA adjustment
- Design note: Track failures specifically, not total attempts (per Challenger feedback)

**Signal 4: `current_phase` (LEAD/PLAN/EXEC enum)** — NEW
- Collection: Mirror from `strategic_directives_v2.current_phase` during heartbeat
- Coordinator use: Phase-aware ETA, fleet balance visibility, bottleneck detection
- Challenge: Normalize 10+ SD phase values to 3-value enum

### Decision Matrix
| Signal | Coordinator Action |
|---|---|
| Stale + has_uncommitted_changes=false + other signals clear | Release claim (current behavior) |
| Stale + has_uncommitted_changes=true | Hold claim, send SAVE_WARNING |
| Two workers same branch (current_branch match) | WORKTREE_CONFLICT → message newer worker |
| Worker on main + SD is not QF type | Flag NO_WORKTREE warning |
| handoff_fail_count > 3 | Flag WORKER_STRUGGLING in dashboard |
| Phase = EXEC + progress > 50% | Weight ETA toward completion |

### Enhanced Dashboard (target state)
```
WORKERS [7:25 AM]
  Terminal   SD       Phase  Fails  Branch                    WIP  Heartbeat
  win-26040  A        EXEC   2/3    feat/SD-...001-A          yes  5s ago
  win-26124  B        PLAN   5/3!   feat/SD-...001-B          yes  30s ago
  win-32896  001      LEAD   1/3    main !                         2m ago
```

### EVA Friday Telemetry Block (target state)
```
FLEET TELEMETRY — Week of Mar 9-14
  Worktree Discipline:    87% (target: 95%)
  Abandoned WIP:          3 incidents (down from 7)
  Gate Friction:          PLAN-TO-LEAD avg 3.2 failures
  Phase Distribution:     LEAD 15% / PLAN 35% / EXEC 50%
  Recommendation:         PLAN phase over-indexed — review gate thresholds
```

## Analysis

### Arguments For
- Prevents data loss from releasing stale sessions with uncommitted code
- Detects worktree conflicts before they cause merge issues
- Gives early warning when workers are struggling with gates
- Improves ETA accuracy from flat median to phase-aware estimates
- Creates fleet telemetry dataset for EVA Friday process improvement
- Low implementation cost (~1 day, ~100 LOC across 3 files)
- `current_branch` already implemented — only 3 new signals needed

### Arguments Against
- More signals = more decision surface area for coordinator to be wrong (Challenger)
- Heartbeat data is inherently stale (30-60s) — adding signals doesn't fix staleness
- `has_uncommitted_changes` is imperfect proxy — clean git ≠ safe to release
- QF workers legitimately on main branch will generate false positive warnings
- `current_phase` duration distributions vary wildly by SD type — may produce worse ETAs

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Heartbeat-to-decision latency creates false confidence — signals are snapshots, not real-time. (2) Git operations not atomic with heartbeat — transient states (detached HEAD, mid-rebase) cause misinterpretation. (3) QF workers on main are legitimate — flagging them inverts the safety signal.
- **Assumptions at Risk**: (1) handoff_attempt_count needs outcomes, not just counts — can't distinguish persistence from thrashing. (2) Phase durations vary by SD type — EXEC for orchestrator vs feature SD are incomparable without type context. (3) git clean ≠ safe to release — worker could be mid-DB-write with clean tree.
- **Worst Case**: Coordinator acts on stale multi-signal data, releases a mid-handoff session, new worker claims on main, original worker finishes creating two active workers on same SD with no conflict detection.

### Visionary
- **Opportunities**: (1) Predictive worker retirement — tiered intervention (warn → reassign → auto-reassign). (2) Branch-aware parallel execution — safe parallelism budget based on non-overlapping branches. (3) Fleet telemetry as training data — 30-60 days of (phase, attempt_count, outcome) labels enable heuristic ETA multipliers.
- **Synergies**: EVA Friday gate integration, Skunkworks capacity-aware scheduling, orchestrator chaining throttling under retry pressure.
- **Upside Scenario**: Self-regulating fleet that operates multi-day without intervention. Coordinator becomes closed-loop controller. EVA Friday shifts from retrospective to steering input.

### Pragmatist
- **Feasibility**: 4/10 difficulty (low — hard infrastructure exists)
- **Resource Requirements**: 1 developer, ~1 day. Migration ~30 LOC, code changes ~100 LOC, no new infrastructure.
- **Constraints**: (1) `has_uncommitted_changes` needs worktree path context in heartbeat manager. (2) `current_phase` enum normalization from 10+ values to 3. (3) Existing sessions will have NULLs — sweep must treat NULL as unknown, not clean.
- **Recommended Path**: Phase 1: migration + handoff_fail_count + current_phase (~1 hour). Phase 2: has_uncommitted_changes after path-context design (~30 min). Skip EVA telemetry view initially.

### Synthesis
- **Consensus Points**: All three agree signals are valuable, implementation is feasible, `handoff_fail_count` is the easiest high-value win
- **Tension Points**: `has_uncommitted_changes` as WIP proxy (imperfect but still a guard), QF workers on main (need SD type cross-reference), handoff count needs outcome tracking
- **Composite Risk**: Low

## Design Decisions

1. **`has_uncommitted_changes` is a guard, not a signal**: Dirty = definitely hold. Clean = check other signals too. Never auto-release based solely on clean git state.
2. **QF workers on main are expected**: Cross-reference `current_branch=main` with SD type. Only flag if SD is a full SD (not QF).
3. **Track failures, not attempts**: Rename to `handoff_fail_count` — increment only on handoff failure, reset on success or SD change.
4. **Phase normalization map**: LEAD* → LEAD, PLAN* → PLAN, EXEC* → EXEC, COMPLETED/CANCELLED → exclude from heartbeat.
5. **NULL handling in sweep**: Treat NULL as unknown — do not auto-release, do not flag as warning. Unknown is neutral.

## Out of Scope
- Auto-reassignment of stuck workers (future capability, needs more design)
- Fleet telemetry historical views beyond EVA Friday summary
- Predictive ETA models based on accumulated telemetry data
- Worker process health monitoring (CPU, memory)

## Open Questions
- Should `handoff_fail_count` reset when the worker moves to a new phase, or only on SD change?
- What's the right threshold for WORKER_STRUGGLING — 3 failures? 5? Configurable?
- Should the EVA Friday telemetry be a DB view or a computed report?

## Suggested Next Steps
- Create vision document and architecture plan
- Update SD-MAN-INFRA-WORKER-WORKTREE-SELF-001 scope to match this design
- Implement in 2 phases per Pragmatist recommendation
